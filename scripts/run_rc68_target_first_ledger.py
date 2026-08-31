#!/usr/bin/env python3
"""Build the RC68 target-first NGC 3447 mosaic ledger."""

import argparse
import csv
import hashlib
import json
import math
import re
import statistics
import warnings
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import FITSFixedWarning, WCS

warnings.simplefilter("ignore", FITSFixedWarning)

ROOT = Path(__file__).resolve().parents[1]
SHIFT_X_ARCSEC = 0.02
SHIFT_Y_ARCSEC = -0.08
MATCH_RADIUS_ARCSEC = 0.3
SUBPIXELS = 32

BANDS = {
    "F090W": {
        "stem": "f090w",
        "abVegaOffset": 0.48407587,
        "reference": {"radius": 2.3332438, "inner": 8.0, "outer": 13.0, "correction": 1.4367015},
        "sensitivity": {"radius": 1.3864133, "inner": 6.0, "outer": 10.0, "correction": 2.0056102},
    },
    "F150W": {
        "stem": "f150w",
        "abVegaOffset": 1.2045733,
        "reference": {"radius": 2.7442563, "inner": 8.0, "outer": 13.0, "correction": 1.4373972},
        "sensitivity": {"radius": 1.5689266, "inner": 6.0, "outer": 10.0, "correction": 2.0056353},
    },
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_mrt(path):
    rows = []
    pattern = re.compile(r"^(N3447(?:Spiral|A)?)\s+(\d+(?:\.\d+)?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)")
    for line in path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if not match:
            continue
        host, object_id, ra, dec, logp, f150w, f150w_error, colour, colour_error = match.groups()
        rows.append({
            "host": host,
            "component": "spiral" if host == "N3447Spiral" else "tidal" if host == "N3447A" else "other",
            "authorId": int(round(float(object_id))),
            "split": "development" if int(round(float(object_id))) % 2 == 0 else "validation",
            "raDeg": float(ra),
            "decDeg": float(dec),
            "logPeriod": float(logp),
            "publishedPhaseCorrectedF150WVegaMag": float(f150w),
            "publishedF150WErrorMag": float(f150w_error),
            "colourVI": float(colour),
            "colourErrorMag": float(colour_error),
        })
    if len(rows) != 142:
        raise ValueError(f"Expected 142 MRT rows, found {len(rows)}")
    return rows


def parse_ecsv(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    header_index = next(index for index, line in enumerate(lines) if line.startswith("label "))
    columns = lines[header_index].split()
    index = {name: columns.index(name) for name in [
        "label", "xcentroid", "ycentroid", "sky_centroid.ra", "sky_centroid.dec",
        "aper_total_flux", "aper_total_abmag", "aper_total_vegamag", "is_extended",
        "isophotal_area", "semimajor_sigma", "semiminor_sigma"
    ]}
    rows = []
    for line in lines[header_index + 1:]:
        if not line.strip() or line.startswith("#"):
            continue
        fields = line.split()
        def numeric(name):
            value = fields[index[name]]
            return None if value.lower() == "nan" else float(value)
        rows.append({
            "label": int(fields[index["label"]]),
            "x": float(fields[index["xcentroid"]]),
            "y": float(fields[index["ycentroid"]]),
            "ra": float(fields[index["sky_centroid.ra"]]),
            "dec": float(fields[index["sky_centroid.dec"]]),
            "totalFluxJy": numeric("aper_total_flux"),
            "totalABMag": numeric("aper_total_abmag"),
            "totalVegaMag": numeric("aper_total_vegamag"),
            "isExtended": fields[index["is_extended"]].lower() == "true",
            "isophotalAreaPixels": numeric("isophotal_area"),
            "semimajorSigmaPixels": numeric("semimajor_sigma"),
            "semiminorSigmaPixels": numeric("semiminor_sigma"),
        })
    return rows


def shifted_coordinate(ra, dec):
    return (
        ra + SHIFT_X_ARCSEC / (3600.0 * math.cos(math.radians(dec))),
        dec + SHIFT_Y_ARCSEC / 3600.0,
    )


def circular_weights(pixel_x, pixel_y, x, y, radius):
    offsets = (np.arange(SUBPIXELS, dtype=float) + 0.5) / SUBPIXELS - 0.5
    sub_x = pixel_x[:, None, None, None] + offsets[None, None, :, None]
    sub_y = pixel_y[None, :, None, None] + offsets[None, None, None, :]
    inside = (sub_x - x) ** 2 + (sub_y - y) ** 2 <= radius ** 2
    return inside.mean(axis=(2, 3)).T


def sigma_clipped_background(values):
    values = np.asarray(values, dtype=float)
    values = values[np.isfinite(values)]
    if not len(values):
        return None, None, 0
    kept = values
    for _ in range(5):
        median = float(np.median(kept))
        mad = float(np.median(np.abs(kept - median)))
        sigma = 1.4826 * mad
        if not sigma:
            break
        next_kept = kept[np.abs(kept - median) <= 3.0 * sigma]
        if len(next_kept) == len(kept) or not len(next_kept):
            break
        kept = next_kept
    median = float(np.median(kept))
    mad = float(np.median(np.abs(kept - median)))
    return median, 1.4826 * mad, int(len(kept))


def aperture_measurement(sci, err, segm, pixel_x, pixel_y, x, y, pixar_sr, config):
    weights = circular_weights(pixel_x, pixel_y, x, y, config["radius"])
    xx, yy = np.meshgrid(pixel_x, pixel_y)
    radii = np.hypot(xx - x, yy - y)
    finite = np.isfinite(sci) & np.isfinite(err)
    background_candidates = finite & (radii >= config["inner"]) & (radii <= config["outer"]) & (segm == 0)
    fallback = False
    if background_candidates.sum() < 30:
        background_candidates = finite & (radii >= config["inner"]) & (radii <= config["outer"])
        fallback = True
    background, robust_sigma, background_count = sigma_clipped_background(sci[background_candidates])
    valid_weights = np.where(finite, weights, 0.0)
    weight_sum = float(valid_weights.sum())
    nominal_weight_sum = float(weights.sum())
    if background is None or not weight_sum:
        return {
            "fluxJy": None, "pipelineErrorJy": None, "annulusNoiseJy": None,
            "backgroundLevelErrorJy": None, "combinedErrorJy": None,
            "signalToNoise": None, "abMag": None, "finiteWeightFraction": 0.0,
            "backgroundMJySr": background, "backgroundRobustSigmaMJySr": robust_sigma,
            "backgroundPixels": background_count, "backgroundFallback": fallback,
            "apertureSegmentedFraction": None, "targetLabelFraction": None,
            "uniqueSegmentLabels": 0,
        }
    conversion = pixar_sr * 1.0e6 * config["correction"]
    background_subtracted = np.where(finite, sci - background, 0.0)
    flux = float(np.sum(valid_weights * background_subtracted) * conversion)
    weighted_error = np.where(finite, weights * err, 0.0)
    pipeline_error = float(math.sqrt(np.sum(weighted_error ** 2)) * conversion)
    annulus_noise = float((robust_sigma or 0.0) * math.sqrt(np.sum(valid_weights ** 2)) * conversion)
    level_error = float((robust_sigma or 0.0) / math.sqrt(max(1, background_count)) * weight_sum * conversion)
    combined = math.sqrt(pipeline_error ** 2 + annulus_noise ** 2 + level_error ** 2)
    center_label = int(segm[int(round(y)) - int(pixel_y[0]), int(round(x)) - int(pixel_x[0])])
    segmented_fraction = float(np.sum(valid_weights * (segm != 0)) / weight_sum)
    target_label_fraction = float(np.sum(valid_weights * (segm == center_label)) / weight_sum) if center_label else 0.0
    labels = np.unique(segm[(valid_weights > 0) & (segm != 0)])
    return {
        "fluxJy": flux,
        "pipelineErrorJy": pipeline_error,
        "annulusNoiseJy": annulus_noise,
        "backgroundLevelErrorJy": level_error,
        "combinedErrorJy": combined,
        "signalToNoise": flux / combined if combined else None,
        "abMag": -2.5 * math.log10(flux / 3631.0) if flux > 0 else None,
        "finiteWeightFraction": weight_sum / nominal_weight_sum if nominal_weight_sum else 0.0,
        "backgroundMJySr": background,
        "backgroundRobustSigmaMJySr": robust_sigma,
        "backgroundPixels": background_count,
        "backgroundFallback": fallback,
        "apertureSegmentedFraction": segmented_fraction,
        "targetLabelFraction": target_label_fraction,
        "uniqueSegmentLabels": int(len(labels)),
    }


def nearest_catalog(catalog, x, y, pixel_scale_arcsec):
    xs = np.fromiter((row["x"] for row in catalog), dtype=float)
    ys = np.fromiter((row["y"] for row in catalog), dtype=float)
    distance_pixels = np.hypot(xs - x, ys - y)
    order = np.argsort(distance_pixels)[:2]
    nearest = catalog[int(order[0])]
    return {
        "nearestCatalogLabel": nearest["label"],
        "nearestCatalogDistancePixels": float(distance_pixels[order[0]]),
        "nearestCatalogDistanceArcsec": float(distance_pixels[order[0]] * pixel_scale_arcsec),
        "secondCatalogDistanceArcsec": float(distance_pixels[order[1]] * pixel_scale_arcsec),
        "nearestCatalogTotalVegaMag": nearest["totalVegaMag"],
        "nearestCatalogIsExtended": nearest["isExtended"],
        "catalogMatchedAt0_3Arcsec": bool(distance_pixels[order[0]] * pixel_scale_arcsec <= MATCH_RADIUS_ARCSEC),
        "catalogSourcesWithin1Arcsec": int(np.sum(distance_pixels * pixel_scale_arcsec <= 1.0)),
    }


def finite_summary(values):
    values = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    if not values:
        return {"count": 0, "mean": None, "median": None, "sampleStandardDeviation": None, "standardError": None}
    return {
        "count": len(values),
        "mean": statistics.fmean(values),
        "median": statistics.median(values),
        "sampleStandardDeviation": statistics.stdev(values) if len(values) > 1 else 0.0,
        "standardError": statistics.stdev(values) / math.sqrt(len(values)) if len(values) > 1 else 0.0,
    }


def rank(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    index = 0
    while index < len(order):
        end = index + 1
        while end < len(order) and values[order[end]] == values[order[index]]:
            end += 1
        value = (index + end - 1) / 2.0 + 1.0
        for cursor in range(index, end):
            ranks[order[cursor]] = value
        index = end
    return ranks


def correlation(left, right):
    if len(left) < 2:
        return None
    left_mean, right_mean = statistics.fmean(left), statistics.fmean(right)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right))
    denominator = math.sqrt(sum((a - left_mean) ** 2 for a in left) * sum((b - right_mean) ** 2 for b in right))
    return numerator / denominator if denominator else None


def aggregate(ledger):
    output = {"ledgerRows": len(ledger), "expectedRows": 284, "bands": {}}
    for band in BANDS:
        rows = [row for row in ledger if row["band"] == band]
        misses = [row for row in rows if not row["catalogMatchedAt0_3Arcsec"]]
        band_summary = {
            "rows": len(rows),
            "validCoverage": sum(row["validCoverage"] for row in rows),
            "centerSegmented": sum(row["centerSegmentationLabel"] != 0 for row in rows),
            "catalogMatched": sum(row["catalogMatchedAt0_3Arcsec"] for row in rows),
            "catalogMisses": len(misses),
            "catalogMissCenterSegmented": sum(row["centerSegmentationLabel"] != 0 for row in misses),
            "catalogMissReferenceSnrAbove3": sum((row["reference"]["signalToNoise"] or -math.inf) >= 3 for row in misses),
            "catalogMissReferenceSnrAbove5": sum((row["reference"]["signalToNoise"] or -math.inf) >= 5 for row in misses),
            "centerLabelEqualsNearestCatalogLabel": sum(row["centerLabelEqualsNearestCatalogLabel"] for row in rows),
            "referencePositiveFlux": sum((row["reference"]["fluxJy"] or 0) > 0 for row in rows),
            "sensitivityPositiveFlux": sum((row["sensitivity"]["fluxJy"] or 0) > 0 for row in rows),
            "fluxSignDiscordance": sum(((row["reference"]["fluxJy"] or 0) > 0) != ((row["sensitivity"]["fluxJy"] or 0) > 0) for row in rows),
            "centerContributionCountDistribution": dict(sorted(Counter(row["centerContributionCount"] for row in rows).items())),
            "referenceBackgroundFallbacks": sum(row["reference"]["backgroundFallback"] for row in rows),
            "catalogMissOnExtendedCenterIsland": sum(row["centerLabelCatalogIsExtended"] is True for row in misses),
            "catalogMissCenterIslandCentroidBeyond0_3": sum((row["centerLabelCatalogCentroidDistanceArcsec"] or 0) > 0.3 for row in misses),
            "components": {},
        }
        center_counts = Counter(row["centerSegmentationLabel"] for row in rows if row["centerSegmentationLabel"] != 0)
        band_summary["centerIslandMultiplicity"] = {
            "uniqueNonzeroLabels": len(center_counts),
            "targetsSharingAnyLabel": sum(count for count in center_counts.values() if count > 1),
            "largestTargetGroups": [
                {
                    "label": label,
                    "targets": count,
                    "components": dict(Counter(row["component"] for row in rows if row["centerSegmentationLabel"] == label)),
                    "catalogMatchedTargets": sum(row["catalogMatchedAt0_3Arcsec"] for row in rows if row["centerSegmentationLabel"] == label),
                    "isExtended": next((row["centerLabelCatalogIsExtended"] for row in rows if row["centerSegmentationLabel"] == label), None),
                    "isophotalAreaPixels": next((row["centerLabelCatalogAreaPixels"] for row in rows if row["centerSegmentationLabel"] == label), None),
                }
                for label, count in center_counts.most_common(5)
            ],
        }
        for component in ["spiral", "tidal", "other"]:
            subset = [row for row in rows if row["component"] == component]
            subset_misses = [row for row in subset if not row["catalogMatchedAt0_3Arcsec"]]
            band_summary["components"][component] = {
                "rows": len(subset),
                "catalogMatched": sum(row["catalogMatchedAt0_3Arcsec"] for row in subset),
                "centerSegmented": sum(row["centerSegmentationLabel"] != 0 for row in subset),
                "catalogMisses": len(subset_misses),
                "catalogMissCenterSegmented": sum(row["centerSegmentationLabel"] != 0 for row in subset_misses),
                "catalogMissReferenceSnrAbove3": sum((row["reference"]["signalToNoise"] or -math.inf) >= 3 for row in subset_misses),
                "referenceSnr": finite_summary([row["reference"]["signalToNoise"] for row in subset]),
                "localCatalogDensity": finite_summary([row["catalogSourcesWithin1Arcsec"] for row in subset]),
            }
        paired = [(row["reference"]["fluxJy"], row["sensitivity"]["fluxJy"]) for row in rows]
        paired = [(left, right) for left, right in paired if left is not None and right is not None]
        positive = [(left, right) for left, right in paired if left > 0 and right > 0]
        band_summary["reductionAgreement"] = {
            "finitePairs": len(paired),
            "positivePairs": len(positive),
            "pearsonLogFlux": correlation([math.log10(a) for a, _ in positive], [math.log10(b) for _, b in positive]),
            "spearmanFlux": correlation(rank([a for a, _ in paired]), rank([b for _, b in paired])),
            "log10FluxRatio": finite_summary([math.log10(a / b) for a, b in positive]),
            "referenceMinusSensitivityVegaMag": finite_summary([
                row["reference"]["vegaMag"] - row["sensitivity"]["vegaMag"]
                for row in rows if row["reference"]["vegaMag"] is not None and row["sensitivity"]["vegaMag"] is not None
            ]),
        }
        output["bands"][band] = band_summary

    f150 = [row for row in ledger if row["band"] == "F150W"]
    calibrations = {}
    for reduction in ["reference", "sensitivity"]:
        development = [
            row[reduction]["vegaMag"] - row["publishedPhaseCorrectedF150WVegaMag"]
            for row in f150 if row["split"] == "development" and row[reduction]["vegaMag"] is not None
        ]
        zero = statistics.median(development)
        components = {}
        for component in ["spiral", "tidal", "other"]:
            residuals = [
                row[reduction]["vegaMag"] - row["publishedPhaseCorrectedF150WVegaMag"] - zero
                for row in f150
                if row["split"] == "validation" and row["component"] == component and row[reduction]["vegaMag"] is not None
            ]
            components[component] = finite_summary(residuals)
        calibrations[reduction] = {"developmentRows": len(development), "developmentMedianOffsetMag": zero, "validationComponents": components}
        if components["tidal"]["mean"] is not None and components["spiral"]["mean"] is not None:
            calibrations[reduction]["validationTidalMinusSpiralMeanResidualMag"] = components["tidal"]["mean"] - components["spiral"]["mean"]
            calibrations[reduction]["validationTidalMinusSpiralNaiveStandardErrorMag"] = math.sqrt(components["tidal"]["standardError"] ** 2 + components["spiral"]["standardError"] ** 2)
    output["f150wDevelopmentCalibratedResiduals"] = calibrations
    return output


def clean(value):
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        value = float(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-dir", default=".cache/rc68-target-first")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    download_dir = (ROOT / args.download_dir).resolve()
    objects = parse_mrt(ROOT / ".cache/rc65-jwst-host-source/apjlae0ad6t3_mrt.txt")
    ledger = []
    product_audit = []

    for band, settings in BANDS.items():
        stem = settings["stem"]
        i2d_path = download_dir / f"{stem}_i2d.fits"
        segm_path = download_dir / f"{stem}_segm.fits"
        catalog_path = ROOT / f".cache/rc67-mast/{stem}_cat.ecsv"
        catalog = parse_ecsv(catalog_path)
        catalog_by_label = {row["label"]: row for row in catalog}
        product_audit.extend([
            {"file": str(i2d_path.relative_to(ROOT)).replace("\\", "/"), "bytes": i2d_path.stat().st_size, "sha256": sha256(i2d_path)},
            {"file": str(segm_path.relative_to(ROOT)).replace("\\", "/"), "bytes": segm_path.stat().st_size, "sha256": sha256(segm_path)},
        ])
        with fits.open(i2d_path, memmap=False) as image_hdus, fits.open(segm_path, memmap=False) as segmentation_hdus:
            sci_hdu = image_hdus["SCI"]
            header = sci_hdu.header
            wcs = WCS(header)
            width, height = int(header["NAXIS1"]), int(header["NAXIS2"])
            pixar_sr = float(header["PIXAR_SR"])
            pixel_scale_arcsec = math.sqrt(float(header["PIXAR_A2"]))
            if sci_hdu.shape != segmentation_hdus["SCI"].shape:
                raise ValueError(f"{band}: image and segmentation shapes differ")

            for obj in objects:
                shifted_ra, shifted_dec = shifted_coordinate(obj["raDeg"], obj["decDeg"])
                x, y = [float(value) for value in wcs.all_world2pix([[shifted_ra, shifted_dec]], 0)[0]]
                margin = 14
                x0, x1 = int(math.floor(x)) - margin, int(math.floor(x)) + margin + 1
                y0, y1 = int(math.floor(y)) - margin, int(math.floor(y)) + margin + 1
                if x0 < 0 or y0 < 0 or x1 > width or y1 > height:
                    raise ValueError(f"{band} {obj['authorId']}: frozen 29-pixel cutout crosses image edge")
                sci = np.asarray(image_hdus["SCI"].section[y0:y1, x0:x1], dtype=float)
                err = np.asarray(image_hdus["ERR"].section[y0:y1, x0:x1], dtype=float)
                wht = np.asarray(image_hdus["WHT"].section[y0:y1, x0:x1], dtype=float)
                con = np.asarray(image_hdus["CON"].section[0, y0:y1, x0:x1], dtype=np.int32)
                segm = np.asarray(segmentation_hdus["SCI"].section[y0:y1, x0:x1], dtype=np.uint32)
                pixel_x = np.arange(x0, x1, dtype=float)
                pixel_y = np.arange(y0, y1, dtype=float)
                center_x, center_y = int(round(x)) - x0, int(round(y)) - y0
                center_label = int(segm[center_y, center_x])
                nearest = nearest_catalog(catalog, x, y, pixel_scale_arcsec)
                center_source = catalog_by_label.get(center_label)
                aperture_mask = circular_weights(pixel_x, pixel_y, x, y, settings["reference"]["radius"]) > 0
                context_values = con[aperture_mask].astype(np.uint32)
                context_counts = np.array([int(value).bit_count() for value in context_values], dtype=int)
                row = {
                    **obj,
                    "band": band,
                    "shiftedRaDeg": shifted_ra,
                    "shiftedDecDeg": shifted_dec,
                    "mosaicX": x,
                    "mosaicY": y,
                    "pixelScaleArcsec": pixel_scale_arcsec,
                    "edgeDistancePixels": min(x, y, width - 1 - x, height - 1 - y),
                    "centerScienceMJySr": float(sci[center_y, center_x]),
                    "centerErrorMJySr": float(err[center_y, center_x]),
                    "centerWeight": float(wht[center_y, center_x]),
                    "centerContextValue": int(con[center_y, center_x].astype(np.uint32)),
                    "centerContributionCount": int(int(con[center_y, center_x].astype(np.uint32)).bit_count()),
                    "apertureContributionCountMin": int(context_counts.min()),
                    "apertureContributionCountMax": int(context_counts.max()),
                    "centerSegmentationLabel": center_label,
                    "centerLabelHasCatalogRow": center_source is not None,
                    "centerLabelCatalogCentroidDistanceArcsec": math.hypot(center_source["x"] - x, center_source["y"] - y) * pixel_scale_arcsec if center_source else None,
                    "centerLabelCatalogIsExtended": center_source["isExtended"] if center_source else None,
                    "centerLabelCatalogAreaPixels": center_source["isophotalAreaPixels"] if center_source else None,
                    "centerLabelCatalogSemimajorSigmaPixels": center_source["semimajorSigmaPixels"] if center_source else None,
                    **nearest,
                    "centerLabelEqualsNearestCatalogLabel": bool(center_label != 0 and center_label == nearest["nearestCatalogLabel"]),
                    "validCoverage": bool(np.isfinite(sci[center_y, center_x]) and np.isfinite(err[center_y, center_x]) and wht[center_y, center_x] > 0 and int(con[center_y, center_x].astype(np.uint32)) != 0),
                }
                for name in ["reference", "sensitivity"]:
                    measurement = aperture_measurement(sci, err, segm, pixel_x, pixel_y, x, y, pixar_sr, settings[name])
                    measurement["vegaMag"] = measurement["abMag"] - settings["abVegaOffset"] if measurement["abMag"] is not None else None
                    row[name] = measurement
                ledger.append(clean(row))

    result = {
        "cycleId": "RC-2026-68",
        "experimentId": "PHOST-PF1A",
        "implementation": {"language": "Python", "astropy": __import__("astropy").__version__, "numpy": np.__version__},
        "sourceAudit": product_audit,
        "aggregate": aggregate(ledger),
        "gates": {
            "targetFirstRowsComplete": len(ledger) == 284,
            "allCoordinatesHaveValidCoverage": all(row["validCoverage"] for row in ledger),
            "noRowsDeletedForCatalogMiss": len(ledger) == 284,
            "mosaicApertureLayerClosed": len(ledger) == 284 and all(row["validCoverage"] for row in ledger),
            "exposureLevelDolphotReproduced": False,
            "artificialStarSelectionSurfaceClosed": False,
            "phaseLedgerClosed": False,
            "authorSelectionLineageClosed": False,
            "globalH0Refit": False,
        },
        "ledger": ledger,
        "claimBoundary": "The ledger closes target-first mosaic coverage, segmentation topology, and fixed-aperture measurements. It does not reproduce exposure-level DOLPHOT photometry, phase correction, artificial-star debiasing, author selection, covariance, or H0.",
    }
    result = clean(result)
    output_json = ROOT / "research/reproducibility/rc68-target-first-ledger-python.json"
    output_csv = ROOT / "research/reproducibility/rc68-target-first-ledger.csv"
    if args.write:
        output_json.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        columns = [
            "authorId", "host", "component", "split", "band", "raDeg", "decDeg", "shiftedRaDeg", "shiftedDecDeg",
            "mosaicX", "mosaicY", "edgeDistancePixels", "validCoverage", "centerContributionCount", "centerSegmentationLabel",
            "nearestCatalogLabel", "nearestCatalogDistanceArcsec", "secondCatalogDistanceArcsec", "catalogMatchedAt0_3Arcsec",
            "catalogSourcesWithin1Arcsec", "centerLabelEqualsNearestCatalogLabel", "centerScienceMJySr", "centerErrorMJySr", "centerWeight",
            "referenceFluxJy", "referenceCombinedErrorJy", "referenceSignalToNoise", "referenceVegaMag", "referenceBackgroundMJySr",
            "referenceBackgroundRobustSigmaMJySr", "referenceApertureSegmentedFraction", "referenceTargetLabelFraction",
            "sensitivityFluxJy", "sensitivityCombinedErrorJy", "sensitivitySignalToNoise", "sensitivityVegaMag", "sensitivityBackgroundMJySr",
        ]
        with output_csv.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            for row in ledger:
                flat = {key: row.get(key) for key in columns}
                for prefix in ["reference", "sensitivity"]:
                    for field, suffix in [
                        ("fluxJy", "FluxJy"), ("combinedErrorJy", "CombinedErrorJy"), ("signalToNoise", "SignalToNoise"),
                        ("vegaMag", "VegaMag"), ("backgroundMJySr", "BackgroundMJySr"),
                        ("backgroundRobustSigmaMJySr", "BackgroundRobustSigmaMJySr"),
                        ("apertureSegmentedFraction", "ApertureSegmentedFraction"), ("targetLabelFraction", "TargetLabelFraction")
                    ]:
                        key = f"{prefix}{suffix}"
                        if key in columns:
                            flat[key] = row[prefix].get(field)
                writer.writerow(flat)
    print(json.dumps({"output": str(output_json), "csv": str(output_csv), "aggregate": result["aggregate"], "gates": result["gates"]}, indent=2))


if __name__ == "__main__":
    main()
