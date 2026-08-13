import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "research/reproducibility/intervention-batch-certificate-spec.json").read_text(encoding="utf-8"))
RESULT = json.loads((ROOT / "research/reproducibility/intervention-batch-certificate-result.json").read_text(encoding="utf-8"))

def tail(n, k, probability):
    return sum(math.comb(n, successes) * probability ** successes * (1 - probability) ** (n - successes) for successes in range(k, n + 1))

criteria = SPEC["exactDesign"]
qualifying = []
for n in range(criteria["search"]["minimumBatches"], criteria["search"]["maximumBatches"] + 1):
    for k in range(n + 1):
        alpha = tail(n, k, 0.5)
        power = tail(n, k, 0.9)
        joint_lower = max(0.0, 2 * power - 1)
        if alpha <= criteria["endpointAlpha"] and power >= criteria["targetEndpointPower"] and joint_lower >= criteria["targetWorstDependenceJointPowerLowerBound"]:
            qualifying.append((n, k, alpha, power, joint_lower))

selected = min(qualifying)
reported = RESULT["selectedDesign"]
checks = {
    "threeBatchEndpointAlpha": math.isclose(tail(3, 3, 0.5), RESULT["threeBatchAudit"]["endpointAlpha"], abs_tol=1e-12),
    "threeBatchCannotQualify": tail(3, 3, 0.5) > criteria["endpointAlpha"],
    "minimumN": selected[0] == reported["n"] == 15,
    "criticalK": selected[1] == reported["k"] == 12,
    "endpointAlpha": math.isclose(selected[2], reported["endpointAlpha"], abs_tol=1e-12),
    "endpointPower": math.isclose(selected[3], reported["endpointPowerAtPointNine"], abs_tol=1e-12),
    "jointPowerLowerBound": math.isclose(selected[4], reported["worstDependenceJointPowerLowerBound"], abs_tol=1e-12),
    "decisionVector": RESULT["decisions"] == {
        "H1_threeBatchesFinalQualificationAdequate": False,
        "H2_minimumExactDesignFound": True,
        "H3_endpointPowerTargetMet": True,
        "H4_worstDependenceJointPowerTargetMet": True,
        "H5_arbitraryShiftGuaranteeQualified": False,
        "H6_analysisRerunsIncreaseEffectiveN": False,
    },
}
audit = {
    "benchmarkId": SPEC["benchmarkId"],
    "method": "Independent Python exact enumeration using math.comb over every n and k in the sealed search range.",
    "checks": checks,
    "passed": all(checks.values()),
    "independenceBoundary": "Independent arithmetic does not supply independent physical batches, validate p<=0.5, or justify exchangeability under institution shift."
}
if not audit["passed"]:
    raise SystemExit(json.dumps(audit, indent=2))
print(json.dumps(audit, indent=2))
