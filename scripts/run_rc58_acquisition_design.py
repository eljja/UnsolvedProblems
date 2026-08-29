#!/usr/bin/env python3
"""Compute RC58 attrition and equivalence-planning sensitivity without outcomes."""

from __future__ import annotations

import json
import math
from pathlib import Path
from statistics import NormalDist


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "research" / "reproducibility" / "rc58-public-cohort-screen-contract.json"
OUTPUT = ROOT / "research" / "reproducibility" / "rc58-acquisition-design-python.json"


def binomial_tail(n: int, minimum: int, retain_probability: float) -> float:
    return sum(
        math.comb(n, observed)
        * retain_probability**observed
        * (1.0 - retain_probability) ** (n - observed)
        for observed in range(minimum, n + 1)
    )


def minimum_start(minimum: int, retain_probability: float, target_probability: float) -> tuple[int, float]:
    for n in range(minimum, 201):
        probability = binomial_tail(n, minimum, retain_probability)
        if probability >= target_probability:
            return n, probability
    raise RuntimeError("registered search bound did not produce a design")


def equivalence_floor(alpha: float, power: float, standardized_margin: float) -> int:
    # Under true difference zero and known variance, accept equivalence when
    # |mean_1 - mean_2| < margin - z_(1-alpha) * sigma * sqrt(2/n).
    normal = NormalDist()
    z_alpha = normal.inv_cdf(1.0 - alpha)
    z_power = normal.inv_cdf((1.0 + power) / 2.0)
    return math.ceil(2.0 * ((z_alpha + z_power) / standardized_margin) ** 2)


def main() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    sensitivity = contract["attritionSensitivity"]
    start_cells = contract["prospectiveAcquisition"]["startingCells"]
    attrition_rows = []
    for dropout in sensitivity["dropoutProbabilities"]:
        retain = 1.0 - dropout
        for usable in sensitivity["usableThresholds"]:
            minimum, minimum_probability = minimum_start(
                usable, retain, sensitivity["minimumRetentionProbability"]
            )
            attrition_rows.append(
                {
                    "dropoutProbability": dropout,
                    "usableThreshold": usable,
                    "minimumStartingCellsFor95Percent": minimum,
                    "probabilityAtMinimum": minimum_probability,
                    "probabilityWith48StartingCells": binomial_tail(start_cells, usable, retain),
                }
            )

    intervention = contract["measurementIntervention"]
    per_metric_alpha = intervention["familywiseAlpha"] / len(intervention["metrics"])
    equivalence_rows = []
    for margin in intervention["standardizedMargins"]:
        for power in intervention["targetPowers"]:
            equivalence_rows.append(
                {
                    "standardizedMargin": margin,
                    "targetPower": power,
                    "oneSidedAlphaPerMetric": per_metric_alpha,
                    "minimumPerArmKnownVarianceNormal": equivalence_floor(
                        per_metric_alpha, power, margin
                    ),
                }
            )

    result = {
        "resultId": "RC58-ACQUISITION-DESIGN-PYTHON-0.1",
        "cycleId": contract["cycleId"],
        "computedOn": contract["sealedOn"],
        "status": "prospective-sensitivity-only",
        "attritionRows": attrition_rows,
        "equivalenceRows": equivalence_rows,
        "principalDesign": {
            "startingCells": start_cells,
            "at15PercentDropoutProbabilityAtLeast36": binomial_tail(start_cells, 36, 0.85),
            "at20PercentDropoutProbabilityAtLeast24": binomial_tail(start_cells, 24, 0.80),
            "branchRule": contract["prospectiveAcquisition"]["endpointBranchRule"],
            "interpretation": "Forty-eight starts protect the 36-event branch through a 15% independent-dropout sensitivity but not through 20%; the 24-event branch remains above 0.95 through 20%."
        },
        "limitations": [
            "Binomial retention is a sensitivity model; common chamber, protocol, fixture, or batch failures can create correlated losses.",
            "Equivalence sizes are known-variance Gaussian floors at true difference zero, not final sample sizes.",
            "No battery outcome, feature, or intervention effect enters these calculations."
        ]
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["principalDesign"], indent=2))


if __name__ == "__main__":
    main()
