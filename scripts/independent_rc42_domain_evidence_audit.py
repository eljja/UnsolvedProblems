import argparse
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "research" / "reproducibility" / "rc42-domain-evidence-source-manifest.json"
JS_RESULT_PATH = ROOT / "research" / "reproducibility" / "rc42-domain-evidence-result.json"
OUTPUT_PATH = ROOT / "research" / "reproducibility" / "rc42-domain-evidence-python-audit.json"


def normalized_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_text(encoding="utf-8").replace("\r\n", "\n").encode("utf-8")).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    counts = {}
    qualifications = {}
    permissive_counts = {}
    comparisons = 0

    for rule_id, rule in manifest["qualificationRules"].items():
        rows = []
        permissive = 0
        for candidate in manifest["candidates"]:
            failed = []
            for field in rule["requires"]:
                comparisons += 1
                if candidate["scores"][field] < rule["minimumEach"]:
                    failed.append(field)
            rows.append({"candidateId": candidate["id"], "qualified": len(failed) == 0, "failed": failed})
            if all(candidate["scores"][field] > 0 for field in rule["requires"]):
                permissive += 1
        qualifications[rule_id] = rows
        counts[rule_id] = sum(row["qualified"] for row in rows)
        permissive_counts[rule_id] = permissive

    x4 = next(candidate for candidate in manifest["candidates"] if candidate["id"] == manifest["calibrationAdjudicand"]["candidateId"])
    residuals = [pair["curveCelsius"] - pair["referenceCelsius"] for pair in x4["localCalibrationExtract"]["measuredPairs"]]
    calibration = {
        "points": len(residuals),
        "meanSignedCelsius": sum(residuals) / len(residuals),
        "meanAbsoluteCelsius": sum(abs(value) for value in residuals) / len(residuals),
        "rmsCelsius": math.sqrt(sum(value * value for value in residuals) / len(residuals)),
        "maxAbsoluteCelsius": max(abs(value) for value in residuals),
        "minSignedCelsius": min(residuals),
        "maxSignedCelsius": max(residuals),
        "residuals": residuals,
    }

    js_checks = {"available": JS_RESULT_PATH.exists(), "matching": {}}
    if JS_RESULT_PATH.exists():
        js_result = json.loads(JS_RESULT_PATH.read_text(encoding="utf-8"))
        for key, value in counts.items():
            js_checks["matching"][f"count:{key}"] = js_result["counts"][key] == value
            comparisons += 1
        for key, value in permissive_counts.items():
            js_checks["matching"][f"permissive:{key}"] = js_result["permissiveCounterfactualCounts"][key] == value
            comparisons += 1
        for key in ("points", "meanSignedCelsius", "meanAbsoluteCelsius", "rmsCelsius", "maxAbsoluteCelsius", "minSignedCelsius", "maxSignedCelsius"):
            js_checks["matching"][f"calibration:{key}"] = math.isclose(js_result["calibrationResiduals"][key], calibration[key], rel_tol=0, abs_tol=1e-12)
            comparisons += 1

    passed = sum(js_checks["matching"].values())
    result = {
        "cycleId": "RC-2026-42",
        "implementation": "Independent Python field qualification and calibration-residual recomputation; no JavaScript imports.",
        "manifestNormalizedSha256": normalized_sha256(MANIFEST_PATH),
        "candidateCount": len(manifest["candidates"]),
        "counts": counts,
        "permissiveCounterfactualCounts": permissive_counts,
        "qualifications": qualifications,
        "calibration": calibration,
        "jsChecks": js_checks,
        "comparisonChecks": len(js_checks["matching"]),
        "passedComparisonChecks": passed,
        "fieldComparisons": comparisons,
        "allPassed": js_checks["available"] and passed == len(js_checks["matching"]),
    }
    if args.write:
        OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

