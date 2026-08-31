#!/usr/bin/env python3
"""Seal the RC69 collision-conditioned artificial-star sampling frame."""

import argparse
import csv
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import FITSFixedWarning, WCS
import warnings

warnings.simplefilter("ignore", FITSFixedWarning)

ROOT = Path(__file__).resolve().parents[1]
PIXEL_SCALE_ARCSEC = 0.031224511401905203
QUOTAS = {
    ("blank", "tidal", "development"): 4,
    ("blank", "tidal", "validation"): 4,
    ("blank", "other", "development"): 4,
    ("blank", "other", "validation"): 4,
    ("isolated", "spiral", "development"): 4,
    ("isolated", "spiral", "validation"): 4,
    ("isolated", "tidal", "development"): 4,
    ("isolated", "tidal", "validation"): 4,
    ("large-collision", "spiral", "development"): 4,
    ("large-collision", "spiral", "validation"): 4,
    ("large-collision", "tidal", "development"): 4,
    ("large-collision", "tidal", "validation"): 4,
}


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-dir", default=".cache/rc68-target-first")
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def classify(row, multiplicity):
    label = row["centerSegmentationLabel"]
    area = row["centerLabelCatalogAreaPixels"] or 0
    if label == 0:
        return "blank"
    if multiplicity == 1 and area < 10_000:
        return "isolated"
    if multiplicity >= 4 or area >= 10_000:
        return "large-collision"
    return "intermediate"


def standardize(rows, fields):
    centers = {}
    scales = {}
    for field in fields:
        values = [float(row[field]) for row in rows]
        centers[field] = statistics.fmean(values)
        scales[field] = statistics.pstdev(values) or 1.0
    for row in rows:
        row["_features"] = [(float(row[field]) - centers[field]) / scales[field] for field in fields]
    return centers, scales


def squared_distance(left, right):
    return sum((a - b) ** 2 for a, b in zip(left, right))


def diverse_select(rows, count):
    if len(rows) < count:
        raise ValueError(f"Cell has {len(rows)} rows but needs {count}")
    centroid = [statistics.fmean(row["_features"][index] for row in rows) for index in range(len(rows[0]["_features"]))]
    selected = [min(rows, key=lambda row: (squared_distance(row["_features"], centroid), row["authorId"]))]
    while len(selected) < count:
        remaining = [row for row in rows if row not in selected]
        selected.append(max(
            remaining,
            key=lambda row: (min(squared_distance(row["_features"], item["_features"]) for item in selected), -row["authorId"]),
        ))
    return sorted(selected, key=lambda row: row["authorId"])


def local_fraction(segmentation, x, y, predicate, radius=2):
    ix, iy = int(round(x)), int(round(y))
    y0, y1 = max(0, iy - radius), min(segmentation.shape[0], iy + radius + 1)
    x0, x1 = max(0, ix - radius), min(segmentation.shape[1], ix + radius + 1)
    patch = segmentation[y0:y1, x0:x1]
    return float(np.mean(predicate(patch))) if patch.size else 0.0


def offset_candidates(row, segmentation):
    state = row["collisionState"]
    label = row["centerSegmentationLabel"]
    candidates = []
    for radius in np.arange(4.0, 12.1, 0.5):
        for angle_deg in range(0, 360, 5):
            angle = math.radians(angle_deg)
            x = row["mosaicX"] + radius * math.cos(angle)
            y = row["mosaicY"] + radius * math.sin(angle)
            ix, iy = int(round(x)), int(round(y))
            if ix < 3 or iy < 3 or ix >= segmentation.shape[1] - 3 or iy >= segmentation.shape[0] - 3:
                continue
            candidate_label = int(segmentation[iy, ix])
            segmented_fraction = local_fraction(segmentation, x, y, lambda patch: patch != 0)
            same_label_fraction = local_fraction(segmentation, x, y, lambda patch: patch == label) if label else 0.0
            if state == "blank":
                admissible = candidate_label == 0 and segmented_fraction <= 0.04
                topology = "unsegmented-local-field"
            elif state == "isolated":
                admissible = candidate_label == 0 and segmented_fraction <= 0.24
                topology = "adjacent-to-single-label"
            else:
                admissible = candidate_label == label and same_label_fraction >= 0.60
                topology = "inside-original-collision-label"
            if admissible:
                candidates.append({
                    "x": float(x), "y": float(y), "radiusPixels": float(radius), "angleDegrees": angle_deg,
                    "candidateLabel": candidate_label, "segmentedFraction5x5": segmented_fraction,
                    "sameLabelFraction5x5": same_label_fraction, "topologyRule": topology,
                })
    return candidates


def select_offsets(candidates, count=8):
    if len(candidates) < count:
        return []
    selected = [min(candidates, key=lambda item: (abs(item["radiusPixels"] - 7.5), item["angleDegrees"]))]
    while len(selected) < count:
        remaining = [item for item in candidates if item not in selected]
        def separation(item):
            return min((item["x"] - other["x"]) ** 2 + (item["y"] - other["y"]) ** 2 for other in selected)
        selected.append(max(remaining, key=lambda item: (separation(item), -abs(item["radiusPixels"] - 7.5), -item["angleDegrees"])))
    return sorted(selected, key=lambda item: item["angleDegrees"])


def feature_balance(rows, fields):
    output = {}
    for state in ["blank", "isolated", "large-collision"]:
        subset = [row for row in rows if row["collisionState"] == state]
        output[state] = {
            field: {"mean": statistics.fmean(float(row[field]) for row in subset), "min": min(float(row[field]) for row in subset), "max": max(float(row[field]) for row in subset)}
            for field in fields
        }
    return output


def main():
    args = arguments()
    ledger_path = ROOT / "research/reproducibility/rc68-target-first-ledger-python.json"
    source = json.loads(ledger_path.read_text(encoding="utf-8"))
    f150 = [dict(row) for row in source["ledger"] if row["band"] == "F150W"]
    f090_by_id = {row["authorId"]: row for row in source["ledger"] if row["band"] == "F090W"}
    multiplicity = Counter(row["centerSegmentationLabel"] for row in f150 if row["centerSegmentationLabel"] != 0)
    for row in f150:
        row["labelMultiplicity"] = multiplicity.get(row["centerSegmentationLabel"], 0)
        row["collisionState"] = classify(row, row["labelMultiplicity"])
        row["logBackground"] = math.log1p(max(0.0, row["reference"]["backgroundMJySr"]))
        row["localDensity"] = row["catalogSourcesWithin1Arcsec"]

    feature_fields = ["logPeriod", "publishedPhaseCorrectedF150WVegaMag", "colourVI", "logBackground", "localDensity"]
    eligible = [row for row in f150 if (row["collisionState"], row["component"], row["split"]) in QUOTAS]
    centers, scales = standardize(eligible, feature_fields)
    selected = []
    for cell, quota in QUOTAS.items():
        candidates = [row for row in eligible if (row["collisionState"], row["component"], row["split"]) == cell]
        selected.extend(diverse_select(candidates, quota))

    segment_path = ROOT / args.download_dir / "f150w_segm.fits"
    image_path = ROOT / args.download_dir / "f150w_i2d.fits"
    with fits.open(segment_path, memmap=False) as hdus:
        segmentation = np.asarray(hdus["SCI"].data, dtype=np.uint32)
        offset_failures = []
        for row in selected:
            candidates = offset_candidates(row, segmentation)
            offsets = select_offsets(candidates)
            if len(offsets) != 8:
                offset_failures.append({"authorId": row["authorId"], "state": row["collisionState"], "candidateCount": len(candidates)})
            row["offsetCandidateCount"] = len(candidates)
            row["offsets"] = offsets
    if offset_failures:
        raise ValueError(f"Offset-support gate failed: {offset_failures}")

    with fits.open(image_path, memmap=True) as hdus:
        reference_wcs = WCS(hdus["SCI"].header)
        reference_shape = list(hdus["SCI"].shape)

    proxy_colours = []
    for row in f150:
        f090 = f090_by_id[row["authorId"]]["reference"]["vegaMag"]
        f150_mag = row["reference"]["vegaMag"]
        if f090 is not None and f150_mag is not None:
            proxy_colours.append(f090 - f150_mag)
    colour_low, colour_high = [float(np.quantile(proxy_colours, quantile)) for quantile in [0.25, 0.75]]
    draw_grid = []
    for delta in [-0.6, -0.2, 0.2, 0.6]:
        for colour in [colour_low, colour_high]:
            draw_grid.append({"f150wDeltaMag": delta, "f090wMinusF150wMag": colour})

    injections = []
    for row in sorted(selected, key=lambda item: (item["collisionState"], item["component"], item["split"], item["authorId"])):
        for offset_index, offset in enumerate(row["offsets"], start=1):
            ra, dec = reference_wcs.all_pix2world([[offset["x"], offset["y"]]], 0)[0]
            for draw_index, draw in enumerate(draw_grid, start=1):
                f150_mag = row["publishedPhaseCorrectedF150WVegaMag"] + draw["f150wDeltaMag"]
                injections.append({
                    "injectionId": f"I-{row['authorId']}-{offset_index:02d}-{draw_index:02d}",
                    "authorId": row["authorId"], "split": row["split"], "component": row["component"],
                    "collisionState": row["collisionState"], "centerLabel": row["centerSegmentationLabel"],
                    "labelMultiplicity": row["labelMultiplicity"], "labelAreaPixels": row["centerLabelCatalogAreaPixels"],
                    "offsetIndex": offset_index, "drawIndex": draw_index,
                    "referenceX": offset["x"], "referenceY": offset["y"], "raDeg": float(ra), "decDeg": float(dec),
                    "offsetRadiusPixels": offset["radiusPixels"], "offsetRadiusArcsec": offset["radiusPixels"] * PIXEL_SCALE_ARCSEC,
                    "topologyRule": offset["topologyRule"], "segmentedFraction5x5": offset["segmentedFraction5x5"],
                    "sameLabelFraction5x5": offset["sameLabelFraction5x5"],
                    "inputF090WVegaMag": f150_mag + draw["f090wMinusF150wMag"],
                    "inputF150WVegaMag": f150_mag,
                    "inputF090WMinusF150WMag": draw["f090wMinusF150wMag"],
                })

    cell_counts = Counter((row["collisionState"], row["component"], row["split"]) for row in selected)
    topology_counts = Counter(injection["topologyRule"] for injection in injections)
    design = {
        "cycleId": "RC-2026-69",
        "experimentId": "PHOST-COLLISION-AST-1",
        "reviewedOn": "2026-09-01",
        "samplingFrame": "The 142 frozen author identities and their RC68 F150W mosaic collision states; injection outcomes were unavailable when this manifest was sealed.",
        "environmentCount": len(selected),
        "injectionCountPerEnvironment": len(injections) // len(selected),
        "injectionCountPerBandPerPipeline": len(injections),
        "referenceShape": reference_shape,
        "collisionDefinition": {
            "blank": "center segmentation label is zero",
            "isolated": "center label occurs for one author target and has isophotal area below 10,000 pixels",
            "large-collision": "center label contains at least four author targets or has isophotal area at least 10,000 pixels",
            "intermediate": "excluded from the 48-environment pilot but retained in the parent ledger",
        },
        "offsetRules": {
            "coreExclusion": "Every injection is 4.0-12.0 F150W mosaic pixels (0.125-0.375 arcsec) from the real target center.",
            "blank": "The injection pixel is unsegmented and at most 4 percent of its 5x5 neighborhood is segmented.",
            "isolated": "The injection pixel is unsegmented and at most 24 percent of its 5x5 neighborhood is segmented, retaining the nearby single-label scene without injecting on its core.",
            "large-collision": "The injection pixel stays inside the original collision label and at least 60 percent of its 5x5 neighborhood carries that label.",
        },
        "magnitudeColourGrid": {
            "f150wOffsetsMag": [-0.6, -0.2, 0.2, 0.6],
            "f090wMinusF150wProxyQuantiles": {"q25": colour_low, "q75": colour_high},
            "boundary": "The colour anchors are quartiles of the RC68 fixed-aperture proxy, not target-specific Cepheid colours or phase-corrected F090W measurements.",
        },
        "standardization": {"centers": centers, "scales": scales, "fields": feature_fields},
        "cellCounts": {"|".join(cell): cell_counts[cell] for cell in sorted(cell_counts)},
        "topologyCounts": dict(topology_counts),
        "featureBalance": feature_balance(selected, feature_fields),
        "environments": [
            {
                "authorId": row["authorId"], "host": row["host"], "component": row["component"], "split": row["split"],
                "collisionState": row["collisionState"], "centerLabel": row["centerSegmentationLabel"],
                "labelMultiplicity": row["labelMultiplicity"], "labelAreaPixels": row["centerLabelCatalogAreaPixels"],
                "logPeriod": row["logPeriod"], "publishedPhaseCorrectedF150WVegaMag": row["publishedPhaseCorrectedF150WVegaMag"],
                "colourVI": row["colourVI"], "backgroundMJySr": row["reference"]["backgroundMJySr"],
                "catalogSourcesWithin1Arcsec": row["catalogSourcesWithin1Arcsec"],
                "offsetCandidateCount": row["offsetCandidateCount"], "offsets": row["offsets"],
            }
            for row in sorted(selected, key=lambda item: item["authorId"])
        ],
        "supportBoundary": "Blank environments have no spiral-development support and are sampled from tidal and other rows. The confirmatory isolated-versus-large-collision comparison is separately balanced across spiral/tidal component and even/odd split; blank-state component contrasts are descriptive only.",
    }

    if args.write:
        output_json = ROOT / "research/reproducibility/rc69-collision-environment-manifest.json"
        output_csv = ROOT / "research/reproducibility/rc69-collision-injection-manifest.csv"
        output_dolphot = ROOT / "research/reproducibility/rc69-collision-dolphot-input.txt"
        output_json.write_text(json.dumps(design, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with output_csv.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(injections[0]))
            writer.writeheader()
            writer.writerows(injections)
        with output_dolphot.open("w", encoding="ascii", newline="\n") as handle:
            for row in injections:
                handle.write(f"1 1 {row['referenceX']:.6f} {row['referenceY']:.6f} {row['inputF090WVegaMag']:.6f} {row['inputF150WVegaMag']:.6f}\n")
    print(json.dumps({
        "environmentCount": len(selected), "injectionCount": len(injections),
        "cellCounts": design["cellCounts"], "topologyCounts": design["topologyCounts"],
        "minimumOffsetCandidates": min(row["offsetCandidateCount"] for row in selected),
        "colourProxyQuartiles": [colour_low, colour_high],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
