#!/usr/bin/env python3
"""RC67 MAST archive-layer audit using only the Python standard library."""

import argparse
import hashlib
import json
import math
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN_RA = 163.36
ORIGIN_DEC = 16.78
COS_DEC = math.cos(math.radians(ORIGIN_DEC))
CELL = 0.1


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def project(ra, dec):
    return ((ra - ORIGIN_RA) * COS_DEC * 3600.0, (dec - ORIGIN_DEC) * 3600.0)


def parse_mrt(path):
    parsed = []
    line_re = re.compile(r"^(N3447(?:Spiral|A)?)\s+(\d+(?:\.\d+)?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)")
    for line in path.read_text(encoding="utf-8").splitlines():
        match = line_re.match(line)
        if not match:
            continue
        host, object_id, ra, dec, logp, f150w, f150w_error, colour, colour_error = match.groups()
        x, y = project(float(ra), float(dec))
        component = "spiral" if host == "N3447Spiral" else "tidal" if host == "N3447A" else "other"
        parsed.append({
            "host": host, "component": component, "id": int(round(float(object_id))),
            "ra": float(ra), "dec": float(dec), "x": x, "y": y,
            "logPeriod": float(logp), "phaseCorrectedF150W": float(f150w),
            "f150wError": float(f150w_error), "colour": float(colour), "colourError": float(colour_error)
        })
    if len(parsed) != 142:
        raise ValueError(f"Expected 142 MRT rows, found {len(parsed)}")
    return parsed


def parse_ecsv(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    header_index = next(index for index, line in enumerate(lines) if line.startswith("label "))
    columns = lines[header_index].split()
    wanted = {name: columns.index(name) for name in ["label", "sky_centroid.ra", "sky_centroid.dec", "aper_total_vegamag", "is_extended"]}
    rows = []
    for line in lines[header_index + 1:]:
        if not line.strip() or line.startswith("#"):
            continue
        fields = line.split()
        ra = float(fields[wanted["sky_centroid.ra"]])
        dec = float(fields[wanted["sky_centroid.dec"]])
        x, y = project(ra, dec)
        magnitude_text = fields[wanted["aper_total_vegamag"]]
        rows.append({
            "label": int(fields[wanted["label"]]), "ra": ra, "dec": dec, "x": x, "y": y,
            "aperTotalVegaMag": None if magnitude_text.lower() == "nan" else float(magnitude_text),
            "isExtended": fields[wanted["is_extended"]].lower() == "true"
        })
    date_match = next((re.search(r"date: '([^']+)'", line) for line in lines if "date:" in line), None)
    date = date_match.group(1) if date_match else None
    version_line = next((line for line in lines if line.startswith("# - version:")), "")
    return {"columns": columns, "rows": rows, "generatedOn": date, "versionLine": version_line[2:].strip()}


def build_index(rows):
    index = defaultdict(list)
    for row in rows:
        index[(math.floor(row["x"] / CELL), math.floor(row["y"] / CELL))].append(row)
    return index


def nearest(index, x, y, radius):
    cx, cy = math.floor(x / CELL), math.floor(y / CELL)
    span = math.ceil(radius / CELL)
    best = None
    best_distance = float("inf")
    for dx in range(-span, span + 1):
        for dy in range(-span, span + 1):
            for row in index.get((cx + dx, cy + dy), []):
                distance = math.hypot(row["x"] - x, row["y"] - y)
                if distance < best_distance:
                    best_distance, best = distance, row
    return best, best_distance


def choose_shift(development, index):
    candidates = []
    for xi in range(-25, 26):
        for yi in range(-25, 26):
            sx, sy = xi * 0.02, yi * 0.02
            distances = [nearest(index, row["x"] + sx, row["y"] + sy, 0.1)[1] for row in development]
            matched = [distance for distance in distances if distance <= 0.1]
            candidates.append((-len(matched), sum(distance * distance for distance in matched), abs(sx) + abs(sy), sx, sy))
    selected = min(candidates)
    return {"xArcsec": selected[3], "yArcsec": selected[4], "developmentMatchesAt0_1": -selected[0], "matchedSquaredResidual": selected[1]}


def matches(objects, index, shift, radius):
    output = []
    for row in objects:
        source, distance = nearest(index, row["x"] + shift["xArcsec"], row["y"] + shift["yArcsec"], radius)
        output.append({"object": row, "source": source if distance <= radius else None, "distanceArcsec": distance})
    return output


def count_by_component(match_rows):
    totals = Counter(row["object"]["component"] for row in match_rows)
    found = Counter(row["object"]["component"] for row in match_rows if row["source"] is not None)
    return {component: {"matched": found[component], "total": totals[component]} for component in ["spiral", "tidal", "other"]}


def negative_controls(objects, index, shift, radius):
    controls = []
    for angle_degrees in range(0, 360, 10):
        angle = math.radians(angle_degrees)
        control_shift = {
            "xArcsec": shift["xArcsec"] + 5.0 * math.cos(angle),
            "yArcsec": shift["yArcsec"] + 5.0 * math.sin(angle)
        }
        controls.append(sum(1 for row in matches(objects, index, control_shift, radius) if row["source"] is not None))
    return {"counts": controls, "mean": statistics.fmean(controls), "sampleStandardDeviation": statistics.stdev(controls)}


def combinations(n, k):
    return math.comb(n, k) if 0 <= k <= n else 0


def hypergeometric_probability(a, row1, column1, total):
    return combinations(column1, a) * combinations(total - column1, row1 - a) / combinations(total, row1)


def fisher_exact(a, b, c, d):
    row1, row2, column1, total = a + b, c + d, a + c, a + b + c + d
    minimum = max(0, row1 - (total - column1))
    maximum = min(row1, column1)
    observed = hypergeometric_probability(a, row1, column1, total)
    support = [(x, hypergeometric_probability(x, row1, column1, total)) for x in range(minimum, maximum + 1)]
    greater = sum(probability for x, probability in support if x >= a)
    two_sided = sum(probability for _, probability in support if probability <= observed + 1e-15)
    odds_ratio = float("inf") if b * c == 0 else a * d / (b * c)
    return {"oddsRatio": odds_ratio, "greaterPValue": greater, "twoSidedPValue": min(1.0, two_sided)}


def summary(values):
    return {
        "count": len(values), "median": statistics.median(values), "mean": statistics.fmean(values),
        "sampleStandardDeviation": statistics.stdev(values) if len(values) > 1 else 0.0,
        "rootMeanSquare": math.sqrt(statistics.fmean(value * value for value in values))
    }


def mast_doi_rows(payload):
    table = payload["data"]["Tables"][0]
    names = [field["name"] for field in table["Fields"]]
    return [dict(zip(names, row)) for row in table["Rows"]]


def product_inventory(products):
    counts = Counter()
    for row in products:
        key = f"L{row.get('calib_level')}|{row.get('productGroupDescription') or 'other'}|{row.get('productSubGroupDescription') or 'preview-or-auxiliary'}"
        counts[key] += 1
    return dict(sorted(counts.items()))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-dir", default=".cache/rc67-mast")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    download_dir = (ROOT / args.download_dir).resolve()
    manifest = load_json(ROOT / "research/reproducibility/rc67-mast-source-manifest.json")
    spec = load_json(ROOT / "research/reproducibility/rc67-archive-layer-spec.json")

    source_audit = []
    for entry in manifest["files"]:
        path = ROOT / entry["path"]
        source_audit.append({
            "path": entry["path"], "bytes": path.stat().st_size, "sha256": sha256(path),
            "matchesManifest": path.stat().st_size == entry["bytes"] and sha256(path) == entry["sha256"]
        })

    datacite = load_json(download_dir / "datacite-doi.json")["data"]["attributes"]
    doi_rows = mast_doi_rows(load_json(download_dir / "mast-doi-caom.json"))
    observations = load_json(download_dir / "mast-ngc3447-observations.json")["data"]
    products = load_json(download_dir / "mast-ngc3447-products.json")["data"]
    mrt = parse_mrt(ROOT / ".cache/rc65-jwst-host-source/apjlae0ad6t3_mrt.txt")
    catalogs = {
        "f090w": parse_ecsv(download_dir / "f090w_cat.ecsv"),
        "f150w": parse_ecsv(download_dir / "f150w_cat.ecsv")
    }
    indices = {band: build_index(catalog["rows"]) for band, catalog in catalogs.items()}
    development = [row for row in mrt if row["id"] % 2 == 0]
    validation = [row for row in mrt if row["id"] % 2 == 1]
    shifts = {band: choose_shift(development, indices[band]) for band in catalogs}

    validation_sensitivity = {}
    control_sensitivity = {}
    for band in catalogs:
        validation_sensitivity[band] = []
        control_sensitivity[band] = []
        for radius in spec["frozenDesign"]["validationRadiiArcsec"]:
            matched = matches(validation, indices[band], shifts[band], radius)
            validation_sensitivity[band].append({
                "radiusArcsec": radius, "matched": sum(row["source"] is not None for row in matched),
                "total": len(validation), "components": count_by_component(matched)
            })
            controls = negative_controls(validation, indices[band], shifts[band], radius)
            control_sensitivity[band].append({"radiusArcsec": radius, **controls})

    dual_band = []
    for radius in spec["frozenDesign"]["validationRadiiArcsec"]:
        left = matches(validation, indices["f090w"], shifts["f090w"], radius)
        right = matches(validation, indices["f150w"], shifts["f150w"], radius)
        dual = []
        for left_row, right_row in zip(left, right):
            dual.append({"object": left_row["object"], "source": left_row["source"] if left_row["source"] is not None and right_row["source"] is not None else None})
        dual_band.append({
            "radiusArcsec": radius, "matched": sum(row["source"] is not None for row in dual),
            "total": len(validation), "components": count_by_component(dual)
        })

    dual_controls = []
    radius = spec["crossmatchGate"]["confirmatoryRadiusArcsec"]
    for angle_degrees in range(0, 360, 10):
        angle = math.radians(angle_degrees)
        left_shift = {"xArcsec": shifts["f090w"]["xArcsec"] + 5 * math.cos(angle), "yArcsec": shifts["f090w"]["yArcsec"] + 5 * math.sin(angle)}
        right_shift = {"xArcsec": shifts["f150w"]["xArcsec"] + 5 * math.cos(angle), "yArcsec": shifts["f150w"]["yArcsec"] + 5 * math.sin(angle)}
        left = matches(validation, indices["f090w"], left_shift, radius)
        right = matches(validation, indices["f150w"], right_shift, radius)
        found = [left_row["source"] is not None and right_row["source"] is not None for left_row, right_row in zip(left, right)]
        dual_controls.append({
            "angleDegrees": angle_degrees, "all": sum(found),
            **{component: sum(flag and row["component"] == component for flag, row in zip(found, validation)) for component in ["spiral", "tidal", "other"]}
        })

    confirmatory = next(row for row in dual_band if row["radiusArcsec"] == radius)
    spiral = confirmatory["components"]["spiral"]
    tidal = confirmatory["components"]["tidal"]
    fisher = fisher_exact(tidal["matched"], tidal["total"] - tidal["matched"], spiral["matched"], spiral["total"] - spiral["matched"])

    f150_matches = matches(validation, indices["f150w"], shifts["f150w"], 0.1)
    residual_rows = [row for row in f150_matches if row["source"] is not None and row["source"]["aperTotalVegaMag"] is not None]
    residuals = [row["source"]["aperTotalVegaMag"] - row["object"]["phaseCorrectedF150W"] for row in residual_rows]
    point_residuals = [row["source"]["aperTotalVegaMag"] - row["object"]["phaseCorrectedF150W"] for row in residual_rows if not row["source"]["isExtended"]]

    matched_label_equals_author = {}
    for band in catalogs:
        rows_at_radius = matches(mrt, indices[band], shifts[band], 0.3)
        matched_label_equals_author[band] = sum(row["source"] is not None and row["source"]["label"] == row["object"]["id"] for row in rows_at_radius)

    proposal_counts = Counter(str(row["proposal_id"]) for row in doi_rows)
    instrument_counts = Counter(row["instrument_name"] for row in doi_rows)
    pi_counts = Counter(row["proposal_pi"] for row in doi_rows)
    mjd_min = min(row["t_min"] for row in observations)
    mjd_max = max(row["t_max"] for row in observations)
    catalog_columns = {band: catalog["columns"] for band, catalog in catalogs.items()}
    required_fields = spec["semanticGate"]["requiredAuthorFields"]

    result = {
        "cycleId": "RC-2026-67", "implementation": "python-standard-library",
        "sourceAudit": {"files": source_audit, "allHashesMatch": all(row["matchesManifest"] for row in source_audit)},
        "doiInventory": {
            "doi": datacite["doi"], "title": datacite["titles"][0]["title"], "createdOn": datacite["created"],
            "rows": len(doi_rows), "proposalCounts": dict(sorted(proposal_counts.items())),
            "instrumentCounts": dict(sorted(instrument_counts.items())), "principalInvestigatorCounts": dict(sorted(pi_counts.items()))
        },
        "ngc3447Archive": {
            "observationRows": len(observations), "obsids": [row["obsid"] for row in observations],
            "filters": sorted(row["filters"] for row in observations), "minimumMjd": mjd_min, "maximumMjd": mjd_max,
            "spanDays": mjd_max - mjd_min, "distinctVisitRoots": sorted(set(row["obs_id"].split("_", 1)[0] for row in observations)),
            "secondEpochPublic": False, "productRows": len(products), "productInventory": product_inventory(products),
            "level3CatalogRows": sum(row.get("calib_level") == 3 and row.get("productSubGroupDescription") == "CAT" for row in products),
            "pipelineVersion": sorted(set(row.get("prvversion") for row in products if row.get("prvversion")))
        },
        "catalogAudit": {
            band: {
                "rows": len(catalog["rows"]), "columns": len(catalog["columns"]), "generatedOn": catalog["generatedOn"],
                "versionLine": catalog["versionLine"], "requiredAuthorFieldsPresent": [], "requiredAuthorFieldsMissing": required_fields,
                "genericSegmentationLabel": True
            } for band, catalog in catalogs.items()
        },
        "split": {"developmentRows": len(development), "validationRows": len(validation), "rule": "even author ID development; odd author ID validation"},
        "translation": shifts,
        "validationSensitivity": validation_sensitivity,
        "negativeControlSensitivity": control_sensitivity,
        "dualBandValidation": dual_band,
        "dualBandControlsAt0_3": {
            "rows": dual_controls,
            "summary": {key: {"mean": statistics.fmean(row[key] for row in dual_controls), "sampleStandardDeviation": statistics.stdev(row[key] for row in dual_controls)} for key in ["all", "spiral", "tidal", "other"]}
        },
        "componentRecoveryExactTestAt0_3": fisher,
        "f150wResidualDiagnosticAt0_1": {"all": summary(residuals), "unextendedOnly": summary(point_residuals)},
        "identityAudit": {"matchedCatalogLabelEqualsAuthorIdAt0_3": matched_label_equals_author, "catalogLabelsAreAuthorStableIds": False},
        "gates": {
            "sourceHashes": all(row["matchesManifest"] for row in source_audit), "doiInventory": len(doi_rows) == 115,
            "observationIdentity": len(observations) == 6, "publicLevel3CatalogLayer": sum(row.get("calib_level") == 3 and row.get("productSubGroupDescription") == "CAT" for row in products) == 6,
            "coordinateCrosswalkComplete": False, "authorIdentityMapping": False, "phaseLedger": False,
            "selectionLineage": False, "objectCovariance": False, "secondEpoch": False,
            "archiveCatalogRecoverabilityDiagnostic": True, "customPsfPhotometryReproduced": False, "globalH0Refit": False
        },
        "claimBoundary": "The crossmatch measures whether an official first-pass segmentation catalog contains a nearby source. It neither validates the paper's custom PSF magnitudes nor identifies crowding, phase, or component membership as the cause of recovery differences."
    }
    output = ROOT / "research/reproducibility/rc67-archive-layer-python.json"
    if args.write:
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
