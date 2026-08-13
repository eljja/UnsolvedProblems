import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "research/reproducibility/qarr-intervention-identifiability-spec.json").read_text(encoding="utf-8"))
RESULT = json.loads((ROOT / "research/reproducibility/qarr-intervention-identifiability-result.json").read_text(encoding="utf-8"))

def close(left, right, tolerance=1e-9):
    return math.isfinite(left) and math.isfinite(right) and abs(left - right) <= tolerance

def summarize(group):
    before = group["asReceived"]
    after = group["ground"]
    before_half = 2 * before["sd"] / math.sqrt(before["n"])
    after_half = 2 * after["sd"] / math.sqrt(after["n"])
    difference = after["mean"] - before["mean"]
    return {
        "difference": difference,
        "relative": 1 - after["mean"] / before["mean"],
        "interval": [difference - before_half - after_half, difference + before_half + after_half],
    }

groups = SPEC["publishedAggregateInputs"]["table16"]
brindley = summarize(groups["brindley"])
none = summarize(groups["none"])
pairs = RESULT["raw"]["pairs"]
affected = [row for row in pairs if row["graphiteAffected"]]
xrpd = sorted(row["xrpd"]["totalVariation"] for row in affected)
xrf = sorted(row["xrf"]["totalVariation"] for row in affected)
summary = RESULT["raw"]["summary"]

checks = {
    "brindleyDifference": close(brindley["difference"], RESULT["aggregate"]["strata"]["brindley"]["groundMinusAsReceived"]),
    "noneDifference": close(none["difference"], RESULT["aggregate"]["strata"]["none"]["groundMinusAsReceived"]),
    "bothConservativeIntervalsBelowZero": brindley["interval"][1] < 0 and none["interval"][1] < 0,
    "sevenAffectedPairs": len(affected) == 7,
    "threeExactNegativeControls": sum(1 for row in pairs if not row["graphiteAffected"] and row["xrpd"]["byteIdentical"] and row["xrf"]["byteIdentical"]) == 3,
    "medianXrpd": close(xrpd[3], summary["medianXrpdTotalVariation"]),
    "medianXrf": close(xrf[3], summary["medianXrfTotalVariation"]),
    "distanceRatio": close(xrpd[3] / xrf[3], summary["medianDistanceRatio"]),
    "decisionVector": RESULT["decisions"] == {
        "H1_grindingDirectionSupportedInPublishedAggregate": True,
        "H2_materialBrindleyGainAfterGrinding": False,
        "H3_neutronTransportQualified": False,
        "H4_pairedCausalGrindingEffectIdentified": False,
        "H5_openSameDesignBenchmarkExecutable": True,
        "H6_xrpdShapeMoreSensitiveThanXrf": True,
    },
}

audit = {
    "benchmarkId": SPEC["benchmarkId"],
    "method": "Independent standard-library recomputation of published aggregate arithmetic and committed pair-summary decisions; raw archive identity remains governed by the SHA-256 manifest.",
    "checks": checks,
    "passed": all(checks.values()),
    "independenceBoundary": "This audit does not create new physical replicates and does not convert retrospective thresholds into preregistration."
}
if not audit["passed"]:
    raise SystemExit(json.dumps(audit, indent=2))
print(json.dumps(audit, indent=2))
