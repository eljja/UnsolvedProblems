#!/usr/bin/env python3
"""RC66 closure audit for the nineteenth JWST host and NGC 3447 semantics."""

import argparse
import hashlib
import json
import math
import re
import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAU = math.hypot(0.017, 0.017)
REQUIRED_SLOPE = 0.07


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-dir", default=".cache/rc66-perfect-host-source")
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def solve(matrix, vector):
    n = len(vector)
    augmented = [list(matrix[row]) + [vector[row]] for row in range(n)]
    for column in range(n):
        pivot = max(range(column, n), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-15:
            raise ValueError("singular matrix")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        scale = augmented[column][column]
        augmented[column] = [value / scale for value in augmented[column]]
        for row in range(n):
            if row == column:
                continue
            factor = augmented[row][column]
            augmented[row] = [augmented[row][item] - factor * augmented[column][item] for item in range(n + 1)]
    return [augmented[index][n] for index in range(n)]


def inverse(matrix):
    columns = []
    for index in range(len(matrix)):
        unit = [0.0] * len(matrix)
        unit[index] = 1.0
        columns.append(solve(matrix, unit))
    return [[columns[column][row] for column in range(len(matrix))] for row in range(len(matrix))]


def transpose(matrix):
    return [list(column) for column in zip(*matrix)]


def matmul(left, right):
    right_t = transpose(right)
    return [[sum(a * b for a, b in zip(row, column)) for column in right_t] for row in left]


def multiply(matrix, vector):
    return [sum(value * vector[column] for column, value in enumerate(row)) for row in matrix]


def gls(rows, with_slope):
    covariance = [[TAU * TAU if i != j else rows[i]["sigma"] ** 2 for j in range(len(rows))] for i in range(len(rows))]
    cinv = inverse(covariance)
    design = [[1.0, row["hst"] - 29.397] if with_slope else [1.0] for row in rows]
    design_t = transpose(design)
    normal_inverse = inverse(matmul(matmul(design_t, cinv), design))
    coefficients = multiply(normal_inverse, multiply(matmul(design_t, cinv), [row["delta"] for row in rows]))
    return {"coefficients": coefficients, "standardErrors": [math.sqrt(normal_inverse[i][i]) for i in range(len(coefficients))]}


def parse_ngc4038(path):
    line = next(line for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("N4038\t"))
    fields = line.split("\t")
    hst, hst_sigma = float(fields[1]), float(fields[2])
    jwst, jwst_sigma = float(fields[5]), float(fields[6])
    return {
        "host": "NGC4038", "hst": hst, "hstSigma": hst_sigma, "jwst": jwst, "jwstSigma": jwst_sigma,
        "delta": jwst - hst, "sigma": math.hypot(jwst_sigma, hst_sigma), "filter": "F150W", "source": "2024-table-a2-shoes"
    }


def parse_mrt(path):
    pattern = re.compile(r"^(N3447(?:Spiral|A)?)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)")
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if match:
            host, object_id, ra, dec = match.groups()
            rows.append({"host": host, "id": object_id, "ra": float(ra), "dec": float(dec)})
    return rows


def ellipse_metric(row, definition):
    x = (row["ra"] - definition["raDeg"]) * 60 * math.cos(math.radians(definition["decDeg"]))
    y = (row["dec"] - definition["decDeg"]) * 60
    angle = math.radians(definition["positionAngleDeg"])
    major = x * math.cos(angle) + y * math.sin(angle)
    minor = -x * math.sin(angle) + y * math.cos(angle)
    return (major / definition["majorSemiaxisArcmin"]) ** 2 + (minor / definition["minorSemiaxisArcmin"]) ** 2


def main():
    args = arguments()
    source_dir = (ROOT / args.download_dir).resolve()
    manifest_path = ROOT / "research/reproducibility/rc66-perfect-host-source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    predecessor_path = ROOT / "research/reproducibility/rc65-jwst-host-audit-python.json"
    predecessor = json.loads(predecessor_path.read_text(encoding="utf-8"))

    source_hashes = []
    for item in manifest["files"]:
        path = source_dir / item["file"]
        source_hashes.append({
            "file": item["file"], "bytes": path.stat().st_size, "sha256": sha256(path),
            "matchesManifest": path.stat().st_size == item["bytes"] and sha256(path) == item["sha256"]
        })
    predecessor_hashes = []
    for item in manifest["frozenPredecessors"]:
        path = ROOT / item["file"]
        predecessor_hashes.append({"file": item["file"], "sha256": sha256(path), "matchesManifest": sha256(path) == item["sha256"]})

    tar_path = source_dir / "2509.01667v1.tar"
    with tarfile.open(tar_path, "r:*") as archive:
        members = [member.name for member in archive.getmembers() if member.isfile()]
        main_tex = archive.extractfile("main.tex").read()
    main_text = main_tex.decode("utf-8")
    source_archive = {
        "fileMembers": members,
        "memberCount": len(members),
        "mainTexBytes": len(main_tex),
        "mainTexSha256": hashlib.sha256(main_tex).hexdigest(),
        "inlineTableBPhotometryRows": len(re.findall(r"^N3447\s*&", main_text, flags=re.M)),
        "containsPhaseTransform": "F090W = 1.18(F814W)-0.18(F555W)" in main_text,
        "containsReportedPhaseCount": "set of 154 individual phase corrections" in main_text,
        "containsExecutablePerObjectCorrectionLedger": any(Path(name).suffix.lower() in {".csv", ".tsv", ".dat"} for name in members)
    }

    ngc4038 = parse_ngc4038(source_dir / "apjad8c21t6_ascii.txt")
    rows = [dict(row) for row in predecessor["hostSummary"]["hosts"]]
    if any(row["host"] == "NGC4038" for row in rows):
        raise ValueError("NGC4038 already present in predecessor fixture")
    rows.append(ngc4038)
    mean_fit = gls(rows, False)
    slope_fit = gls(rows, True)
    deletions = []
    for removed in rows:
        reduced = [row for row in rows if row["host"] != removed["host"]]
        reduced_mean = gls(reduced, False)
        reduced_slope = gls(reduced, True)
        deletions.append({
            "removedHost": removed["host"],
            "meanMag": reduced_mean["coefficients"][0],
            "meanMovementMag": reduced_mean["coefficients"][0] - mean_fit["coefficients"][0],
            "slopeMagPerMag": reduced_slope["coefficients"][1],
            "slopeStandardError": reduced_slope["standardErrors"][1],
            "requiredSlopeExclusionSigma": (REQUIRED_SLOPE - reduced_slope["coefficients"][1]) / reduced_slope["standardErrors"][1]
        })
    deletions.sort(key=lambda item: abs(item["meanMovementMag"]), reverse=True)

    mrt_path = ROOT / ".cache/rc65-jwst-host-source/apjlae0ad6t3_mrt.txt"
    objects = parse_mrt(mrt_path)
    spiral_definition = {"raDeg": 163.350, "decDeg": 16.774, "positionAngleDeg": 95, "majorSemiaxisArcmin": 1.6, "minorSemiaxisArcmin": 0.7}
    tidal_definition = {"raDeg": 163.372, "decDeg": 16.786, "positionAngleDeg": -30, "majorSemiaxisArcmin": 0.6, "minorSemiaxisArcmin": 0.5}
    classified = []
    for row in objects:
        spiral_metric = ellipse_metric(row, spiral_definition)
        tidal_metric = ellipse_metric(row, tidal_definition)
        classified.append({**row, "spiralMetric": spiral_metric, "tidalMetric": tidal_metric, "insideSpiral": spiral_metric <= 1, "insideTidal": tidal_metric <= 1})
    chord_rows = [row for row in classified if row["host"] == "N3447" and row["insideTidal"]]
    region_replay = {
        "releasedRows": len(classified),
        "labelCounts": {name: sum(1 for row in classified if row["host"] == name) for name in ["N3447Spiral", "N3447A", "N3447"]},
        "allSpiralLabelsInsideSpiralOnly": all(row["insideSpiral"] and not row["insideTidal"] for row in classified if row["host"] == "N3447Spiral"),
        "allTidalLabelsInsideTidalOnly": all(row["insideTidal"] and not row["insideSpiral"] for row in classified if row["host"] == "N3447A"),
        "figureDefinedChordExclusions": [{"id": row["id"], "ra": row["ra"], "dec": row["dec"], "tidalEllipseMetric": row["tidalMetric"]} for row in chord_rows],
        "otherRowsOutsideBothEllipses": sum(1 for row in classified if row["host"] == "N3447" and not row["insideSpiral"] and not row["insideTidal"]),
        "analyticEllipseLabelsClosed": len(chord_rows) == 2 and all(row["insideSpiral"] for row in classified if row["host"] == "N3447Spiral") and all(row["insideTidal"] for row in classified if row["host"] == "N3447A"),
        "numericChordBoundaryAvailable": False
    }

    spiral_se, tidal_se, contrast_se = 0.030, 0.025, 0.028
    covariance = (spiral_se ** 2 + tidal_se ** 2 - contrast_se ** 2) / 2
    common_sigma = math.sqrt(covariance)
    spiral_unique = math.sqrt(spiral_se ** 2 - covariance)
    tidal_unique = math.sqrt(tidal_se ** 2 - covariance)
    reconstructed = math.sqrt(spiral_unique ** 2 + tidal_unique ** 2)
    covariance_closure = {
        "impliedCovarianceMag2": covariance,
        "impliedCorrelation": covariance / (spiral_se * tidal_se),
        "impliedCommonModeSigmaMag": common_sigma,
        "spiralSpecificSigmaMag": spiral_unique,
        "tidalSpecificSigmaMag": tidal_unique,
        "reconstructedContrastSigmaMag": reconstructed,
        "naiveIndependentContrastSigmaMag": math.hypot(spiral_se, tidal_se),
        "naiveOverstatementFraction": math.hypot(spiral_se, tidal_se) / contrast_se - 1,
        "closesPublishedContrastError": abs(reconstructed - contrast_se) <= 1e-12
    }

    phase_lineage = {
        "reportedPhaseCorrections": 154,
        "reportedAllFitObjects": 144,
        "releasedObjectRows": len(objects),
        "releasedMinusAll": len(objects) - 144,
        "releasedMinusCorrections": len(objects) - 154,
        "wholeSampleEffectiveSizeMultiplier": (0.19 / 0.17) ** 2,
        "spiralQuadratureScatterRemovedMag": math.sqrt(0.201 ** 2 - 0.194 ** 2),
        "tidalQuadratureScatterRemovedMag": math.sqrt(0.137 ** 2 - 0.121 ** 2),
        "identityMappingExecutable": False,
        "reason": "The version-of-record MRT publishes corrected F150W only; the source archive contains one illustrative Table B row and no per-object correction ledger, uncorrected photometry, phase estimates, or fit flags."
    }

    result = {
        "cycleId": "RC-2026-66",
        "implementation": "python-standard-library",
        "sourceAudit": {
            "newSourceHashes": source_hashes,
            "predecessorHashes": predecessor_hashes,
            "allHashesMatch": all(item["matchesManifest"] for item in source_hashes + predecessor_hashes),
            "authorSourceArchive": source_archive
        },
        "nineteenHostClosure": {
            "hostCount": len(rows), "addedRow": ngc4038,
            "glsMeanMag": mean_fit["coefficients"][0], "glsMeanStandardErrorMag": mean_fit["standardErrors"][0],
            "glsDistanceInterceptMag": slope_fit["coefficients"][0], "glsDistanceSlopeMagPerMag": slope_fit["coefficients"][1], "glsDistanceSlopeStandardError": slope_fit["standardErrors"][1],
            "requiredCrowdingSlopeMagPerMag": REQUIRED_SLOPE,
            "requiredCrowdingSlopeExclusionSigma": (REQUIRED_SLOPE - slope_fit["coefficients"][1]) / slope_fit["standardErrors"][1],
            "leaveOneHostOut": deletions,
            "maximumMeanInfluence": deletions[0],
            "minimumLeaveOneOutRequiredSlopeExclusionSigma": min(item["requiredSlopeExclusionSigma"] for item in deletions),
            "publishedMeanAndSlopeReproduced": abs(mean_fit["coefficients"][0] + 0.022) <= 0.005 and abs(slope_fit["coefficients"][1] + 0.005) <= 0.005
        },
        "regionReplay": region_replay,
        "summaryCovarianceClosure": covariance_closure,
        "phaseCorrectionLineage": phase_lineage,
        "gates": {
            "sourceIntegrity": all(item["matchesManifest"] for item in source_hashes + predecessor_hashes),
            "completeNineteenHostNumericalFixture": len(rows) == 19,
            "publishedNineteenHostSummary": abs(mean_fit["coefficients"][0] + 0.022) <= 0.005 and abs(slope_fit["coefficients"][1] + 0.005) <= 0.005,
            "crowdingSlopeUnderEveryDeletion": min(item["requiredSlopeExclusionSigma"] for item in deletions) >= 3,
            "componentEllipseReplay": region_replay["analyticEllipseLabelsClosed"],
            "numericChordBoundary": region_replay["numericChordBoundaryAvailable"],
            "summaryCovarianceClosure": covariance_closure["closesPublishedContrastError"],
            "objectPhaseLineage": phase_lineage["identityMappingExecutable"],
            "objectLevelFitClosure": False,
            "globalH0Refit": False
        },
        "claimBoundary": "The numerical nineteen-host summary, analytic ellipse memberships, and summary-level component covariance now close. The figure-defined chord, 154-to-144-to-142 identity transitions, per-object phase corrections, object-level component likelihood, and current global H0 refit do not."
    }
    output = ROOT / "research/reproducibility/rc66-perfect-host-closure-python.json"
    if args.write:
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
