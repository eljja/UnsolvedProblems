import json
from itertools import product
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULT = ROOT / "research/reproducibility/rc40-interval-fault-tree-model-result.json"
OUTPUT = ROOT / "research/reproducibility/rc40-interval-fault-tree-python-audit.json"
TRUTHS = (0, 1, 2)


def reports(radius):
    return tuple((round(center - radius, 6), round(center + radius, 6)) for center in TRUTHS)


def analyze(n, f, m, radius):
    library = reports(radius)
    classes = {}
    world_count = 0
    for truth in TRUTHS:
        for statuses in product(("healthy", "arbitrary", "missing"), repeat=n):
            if statuses.count("arbitrary") > f or statuses.count("missing") > m:
                continue
            options = []
            for status in statuses:
                if status == "missing":
                    options.append((None,))
                elif status == "arbitrary":
                    options.append(library)
                else:
                    options.append(tuple(interval for interval in library if interval[0] <= truth <= interval[1]))
            for observation in product(*options):
                world_count += 1
                classes.setdefault(observation, set()).add(truth)
    collisions = {observation: truth_set for observation, truth_set in classes.items() if len(truth_set) > 1}
    return {
        "worldCount": world_count,
        "observationCount": len(classes),
        "collisionCount": len(collisions),
        "identifiesExactEventCount": not collisions,
    }


def powerset(items):
    for bits in product((False, True), repeat=len(items)):
        yield tuple(item for item, keep in zip(items, bits) if keep)


def run():
    expected = json.loads(RESULT.read_text(encoding="utf-8"))
    checks = []

    def check(code, condition, detail):
        checks.append({"code": code, "pass": bool(condition), "detail": detail})

    for cell in expected["narrowGrid"]:
        actual = analyze(cell["n"], cell["f"], cell["m"], cell["radius"])
        prefix = f"GRID-N{cell['n']}-F{cell['f']}-M{cell['m']}"
        for field in ("worldCount", "observationCount", "collisionCount", "identifiesExactEventCount"):
            check(f"{prefix}-{field}", actual[field] == cell[field], f"python={actual[field]} js={cell[field]}")
        check(f"{prefix}-bound", actual["identifiesExactEventCount"] == (cell["n"] >= 2 * cell["f"] + cell["m"] + 1), f"identified={actual['identifiesExactEventCount']}")

    for item in expected["radiusSweep"]:
        actual = analyze(item["n"], item["f"], item["m"], item["radius"])
        for field in ("worldCount", "observationCount", "collisionCount", "identifiesExactEventCount"):
            check(f"RADIUS-{item['radius']}-{field}", actual[field] == item[field], f"python={actual[field]} js={item[field]}")

    tree = expected["faultTree"]
    cuts = tree["minimalCutSets"]
    safeguards = tree["safeguards"]

    def hits(selected):
        covered = {event for item in selected for event in item["covers"]}
        return all(any(event in covered for event in cut["basicEvents"]) for cut in cuts)

    hitting = [selected for selected in powerset(safeguards) if hits(selected)]
    minimum_size = min(len(selected) for selected in hitting)
    minimum_sets = sorted(tuple(item["id"] for item in selected) for selected in hitting if len(selected) == minimum_size)
    wanted_sets = sorted(tuple(item) for item in tree["minimumHittingSets"])
    check("TREE-MINIMUM-SIZE", minimum_size == tree["minimumSize"], f"python={minimum_size} js={tree['minimumSize']}")
    check("TREE-MINIMUM-SETS", minimum_sets == wanted_sets, f"python={minimum_sets} js={wanted_sets}")
    for index, selected in enumerate(minimum_sets, start=1):
        check(f"TREE-MINIMAL-{index}", all(not hits([item for item in safeguards if item["id"] in selected and item["id"] != removed]) for removed in selected), str(selected))

    veto = expected["vetoCounterexample"]
    check("VETO-NAIVE-WRONG", max(set(veto["operationalReports"] + [veto["externalVetoReport"]]), key=(veto["operationalReports"] + [veto["externalVetoReport"]]).count) != veto["truth"], "naive plurality is wrong")
    check("VETO-REFUSAL", veto["vetoPolicyVerdict"] == "inconclusive", "outside witness triggers refusal")
    check("BOUNDARY-HARDWARE", expected["implementationBoundary"]["actualHardwareInLoop"] is False, "no HIL")
    check("BOUNDARY-SENSORS", expected["implementationBoundary"]["physicalSensors"] == 0, "no physical sensor")
    check("QUALIFICATION", expected["qualifies"] and all(expected["criteria"].values()), "all criteria pass")

    passed = sum(item["pass"] for item in checks)
    audit = {
        "cycle": "RC-2026-40",
        "implementation": "Independent Python interval-world and hitting-set enumeration; no JavaScript imported",
        "passed": passed,
        "total": len(checks),
        "qualifies": passed == len(checks),
        "checks": checks,
        "boundary": "Combinatorial audit only; interval calibration, missingness mechanism, safeguard effectiveness, and fault-domain frequencies remain physically untested."
    }
    OUTPUT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()

