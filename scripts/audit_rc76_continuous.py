"""Exact independent 2-D vertex audit for RC76; no floating-point tolerances.

This implementation is a same-model implementation cross-check, not external
scientific review. Healthy sensor half-differences obey
abs(alpha_i*d + beta_i*c) <= eta_i, abs(c) <= B, d >= 0.
"""

from fractions import Fraction as Q
from itertools import combinations, product
import json
from pathlib import Path


def rational(value):
    value = Q(value)
    return str(value.numerator) if value.denominator == 1 else str(value)


def vertices(alpha, beta, eta, bias_bound):
    """Enumerate feasible intersections of all nonparallel boundary pairs."""
    assert len(alpha) == len(beta) == len(eta) and alpha
    bias_bound = Q(bias_bound)
    assert bias_bound >= 0 and all(Q(e) >= 0 for e in eta)
    rows = [(-Q(1), Q(0), Q(0)), (Q(0), Q(1), bias_bound),
            (Q(0), -Q(1), bias_bound)]
    for a, b, e in zip(alpha, beta, eta):
        a, b, e = Q(a), Q(b), Q(e)
        rows.extend([(a, b, e), (-a, -b, e)])
    rows = sorted(set(rows))
    found = set()
    for (a, b, e), (u, v, f) in combinations(rows, 2):
        determinant = a * v - b * u
        if not determinant:
            continue
        d, c = (e * v - b * f) / determinant, (a * f - e * u) / determinant
        if all(x * d + y * c <= bound for x, y, bound in rows):
            found.add((d, c))
    # The audited fixtures have alpha_i=1 and finite B, so the polygon is
    # bounded. This routine does not claim a general LP unboundedness test.
    assert found
    ordered = sorted(found)
    best = min(ordered, key=lambda point: (-point[0], point[1]))
    return ordered, best, rows


def subset_certificate(beta, selected, bias_bound, error_bound):
    selected_beta = [beta[i] for i in selected]
    points, best, rows = vertices([1] * len(selected), selected_beta,
                                 [error_bound] * len(selected), bias_bound)
    d, c = best
    return {
        "survivingIndicesZeroBased": list(selected),
        "vertices": [{"d": rational(x), "c": rational(y)} for x, y in points],
        "radius": rational(d),
        "maximizer": {"d": rational(d), "c": rational(c)},
        "inequalitySlacks": [
            {"dCoefficient": rational(a), "cCoefficient": rational(b),
             "bound": rational(limit), "slack": rational(limit - a * d - b * c)}
            for a, b, limit in rows
        ],
    }


def audit():
    fixtures = []
    for beta in [(1, -1), (1, 1), (1, 1, -1, -1), (1, 1, 1, -1, -1, -1),
                 (1, 1, 1, 1, -1, -1, -1, -1)]:
        cases = []
        for g, a in product(range(2), repeat=2):
            remaining = len(beta) - 2 * g - a
            if remaining < 1:
                continue
            certificates = [subset_certificate(beta, selected, Q(1), Q(1, 10))
                            for selected in combinations(range(len(beta)), remaining)]
            worst = max(certificates, key=lambda item: Q(item["radius"]))
            cases.append({"substitutions": g, "erasures": a,
                          "survivorCount": remaining,
                          "worstRadius": worst["radius"],
                          "worstSubset": worst["survivingIndicesZeroBased"],
                          "worstWitness": worst["maximizer"],
                          "subsets": certificates})
        fixtures.append({"alpha": [1] * len(beta), "beta": list(beta),
                         "B": "1", "eta": "1/10", "cases": cases})

    case_count, subset_count, mismatch_count = 0, 0, 0
    cache = {}
    for n in range(2, 7):
        for beta in product((-1, 1), repeat=n):
            for bias_bound, error_bound in product((Q(0), Q(1, 10), Q(1)),
                                                   (Q(0), Q(1, 10), Q(1, 2))):
                for g, a in product(range(2), repeat=2):
                    remaining = n - 2 * g - a
                    if remaining < 1:
                        continue
                    maximum = Q(0)
                    expected_maximum = Q(0)
                    for selected in combinations(range(n), remaining):
                        subset_count += 1
                        selected_beta = tuple(beta[i] for i in selected)
                        # Duplicate rows do not change a polygon. Cache exact
                        # vertex outputs only; analytic expectations are separate.
                        key = tuple(sorted(set(selected_beta))), bias_bound, error_bound
                        if key not in cache:
                            _, best, _ = vertices([1] * len(selected_beta), selected_beta,
                                                 [error_bound] * len(selected_beta), bias_bound)
                            cache[key] = best[0]
                        measured = cache[key]
                        expected = error_bound if len(set(selected_beta)) == 2 else bias_bound + error_bound
                        mismatch_count += int(measured != expected)
                        maximum = max(maximum, measured)
                        expected_maximum = max(expected_maximum, expected)
                    mismatch_count += int(maximum != expected_maximum)
                    case_count += 1
    assert mismatch_count == 0

    # No deadband: two distinct signs share the all-zero observation. Bias is
    # zero in both worlds, and sensor errors exactly cancel each true value.
    worlds = []
    for t in (-Q(1, 20), Q(1, 20)):
        b, epsilon = Q(0), -t
        observations = [t + beta * b + epsilon for beta in (1, -1)]
        assert all(y == 0 for y in observations) and abs(epsilon) <= Q(1, 10)
        worlds.append({"t": rational(t), "b": rational(b),
                       "errors": [rational(epsilon)] * 2,
                       "observations": [rational(y) for y in observations]})
    return {
        "cycle": "RC-2026-76",
        "method": "Exact rational 2-D polygon boundary-intersection enumeration; no floating-point tolerances.",
        "verificationScope": "Same-model independent implementation, not external expert or proof-assistant verification.",
        "parameterization": "d and c are half-differences between two feasible worlds; constraints use eta and B, not twice their values.",
        "fixtures": fixtures,
        "grid": {"n": [2, 3, 4, 5, 6], "alpha": "all 1", "beta": "all vectors in {-1,+1}^n",
                 "B": ["0", "1/10", "1"], "eta": ["0", "1/10", "1/2"],
                 "g": [0, 1], "a": [0, 1], "minimumSurvivors": 1,
                 "caseCount": case_count, "subsetCheckCount": subset_count,
                 "distinctPolygonEvaluations": len(cache), "mismatchCount": mismatch_count},
        "zeroDeadbandCounterexample": {"alpha": [1, 1], "beta": [1, -1],
                                      "B": "1", "eta": "1/10", "worlds": worlds},
        "limitations": "Known exact coefficients and independently bounded sensor errors; no physical calibration, continuous-parameter exhaustive enumeration, or general LP certification is claimed.",
    }


if __name__ == "__main__":
    result = audit()
    target = Path(__file__).resolve().parents[1] / "research/reproducibility/rc76-independent-audit.json"
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": str(target), **result["grid"]}, ensure_ascii=False))
