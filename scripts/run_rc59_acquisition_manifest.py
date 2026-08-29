#!/usr/bin/env python3
"""Generate the RC59 48-cell physical-resource randomization plan.

The generator is outcome-blind and dependency-free.  It uses SHA-256 rankings
instead of a language-specific PRNG so that an independent Node implementation
can reproduce every assignment exactly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from itertools import combinations
from pathlib import Path


DEFAULT_SEED = "RC59-48-CELL-ACQUISITION-V1"


def digest(seed: str, namespace: str, item: str) -> str:
    return hashlib.sha256(f"{seed}|{namespace}|{item}".encode("utf-8")).hexdigest()


def ranked(values, seed: str, namespace: str):
    return sorted(values, key=lambda value: (digest(seed, namespace, str(value)), str(value)))


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def allocation_hash(allocation) -> str:
    return hashlib.sha256(canonical(allocation).encode("utf-8")).hexdigest().upper()


def make_plan(seed: str = DEFAULT_SEED):
    blocks = [f"B{number:02d}" for number in range(1, 13)]
    fixtures = [f"F{number}" for number in range(1, 5)]
    chambers = ["C1", "C2"]
    ordered_blocks = ranked(blocks, seed, "manufacturing-block-order")
    chamber_patterns = ["+".join(pattern) for pattern in combinations(fixtures, 2)]
    allocation = []

    for wave_index in range(6):
        wave = wave_index + 1
        first_block, second_block = ordered_blocks[2 * wave_index : 2 * wave_index + 2]
        pattern = ranked(chamber_patterns, seed, f"wave-{wave}-chamber-pattern")[0].split("+")

        for block_index, block in enumerate((first_block, second_block)):
            specimen_ordinals = ranked(list(range(1, 5)), seed, f"{block}-specimen-to-fixture")
            for fixture_index, fixture in enumerate(fixtures):
                chamber_one = fixture in pattern
                chamber = chambers[0] if (chamber_one != bool(block_index)) else chambers[1]
                ordinal = specimen_ordinals[fixture_index]
                specimen_id = f"RC59-{block}-S{ordinal}"
                positions = ranked(list(range(1, 7)), seed, f"{chamber}-{fixture}-channel-position")
                position = positions[wave_index]
                allocation.append(
                    {
                        "specimenId": specimen_id,
                        "manufacturingBlockId": block,
                        "conditionId": "RC59-CONDITION-01",
                        "startWave": wave,
                        "chamberId": chamber,
                        "fixtureGroupId": fixture,
                        "channelPosition": position,
                        "channelId": f"{chamber}-{fixture}-P{position}",
                        "outcomeAccess": "closed",
                        "cycle480QcStatus": "pending",
                    }
                )

    allocation.sort(key=lambda row: row["specimenId"])

    failure_domains = []
    for field, label in [
        ("chamberId", "single chamber"),
        ("fixtureGroupId", "single fixture group"),
        ("startWave", "single start wave"),
        ("manufacturingBlockId", "single manufacturing block"),
        ("channelId", "single channel"),
    ]:
        values = sorted({row[field] for row in allocation}, key=str)
        group_sizes = [sum(row[field] == value for row in allocation) for value in values]
        worst_loss = max(group_sizes)
        usable = len(allocation) - worst_loss
        branch = "50-cycle" if usable >= 36 else "25-cycle" if usable >= 24 else "stop"
        failure_domains.append(
            {
                "domain": label,
                "field": field,
                "domainCount": len(values),
                "largestDomainSize": worst_loss,
                "usableAfterWorstSingleDomainLoss": usable,
                "sealedBranch": branch,
            }
        )

    chamber_fixture_sizes = []
    for chamber in chambers:
        for fixture in fixtures:
            chamber_fixture_sizes.append(
                sum(row["chamberId"] == chamber and row["fixtureGroupId"] == fixture for row in allocation)
            )
    chamber_fixture_loss = max(chamber_fixture_sizes)
    failure_domains.append(
        {
            "domain": "single chamber-fixture intersection",
            "field": "chamberId+fixtureGroupId",
            "domainCount": len(chamber_fixture_sizes),
            "largestDomainSize": chamber_fixture_loss,
            "usableAfterWorstSingleDomainLoss": len(allocation) - chamber_fixture_loss,
            "sealedBranch": "50-cycle",
        }
    )

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "manifestId": "RC59-48-CELL-ACQUISITION-MANIFEST-0.1",
        "cycleId": "RC-2026-59",
        "generatedOn": "2026-08-29",
        "status": "planning-only-no-cells-acquired-outcomes-closed",
        "claimBoundary": "This is a deterministic allocation and failure-containment design. It does not claim that cells, chambers, fixtures, channels, calibrations, or safety approvals exist.",
        "randomization": {
            "algorithm": "SHA-256 lexical ranking without replacement",
            "algorithmVersion": "rc59-v1",
            "seed": seed,
            "allocationHashSha256": allocation_hash(allocation),
            "balanceDesign": "Six waves each pair two four-cell manufacturing blocks; every block occupies all four fixture groups with two cells per chamber, and paired blocks use complementary chambers. Each chamber-fixture intersection receives one cell per wave and six unique channel positions.",
        },
        "frozenDomain": {
            "conditionId": "RC59-CONDITION-01",
            "chemistry": "TO_BE_FROZEN_BEFORE_ACQUISITION",
            "cellDesign": "TO_BE_FROZEN_BEFORE_ACQUISITION",
            "manufacturingLotDefinition": "TO_BE_FROZEN_BEFORE_ACQUISITION",
            "formationRecipeId": "TO_BE_FROZEN_BEFORE_ACQUISITION",
            "temperatureSetpointAndTolerance": "TO_BE_FROZEN_BEFORE_ACQUISITION",
            "chargeProtocolId": "TO_BE_FROZEN_BEFORE_ACQUISITION",
            "dischargeProtocolId": "TO_BE_FROZEN_BEFORE_ACQUISITION",
            "voltageWindow": "TO_BE_FROZEN_BEFORE_ACQUISITION",
            "endpointDefinitionId": "TO_BE_FROZEN_BEFORE_ACQUISITION",
        },
        "resourceModel": {
            "planningExample": True,
            "chambers": 2,
            "fixtureGroupsPerChamber": 4,
            "channelPositionsPerFixtureGroup": 6,
            "manufacturingBlocks": 12,
            "cellsPerManufacturingBlock": 4,
            "startWaves": 6,
            "cellsPerStartWave": 8,
            "replacementEnrollment": "forbidden-after-randomization",
        },
        "cycle480BranchRegister": {
            "decisionTime": "after nominal cycle-480 QC and before any target lifetime order or candidate score is opened",
            "allowedInputs": ["specimenId", "cycle480QcStatus", "administrative censoring reason"],
            "forbiddenInputs": ["lifetime", "EOL cycle", "capacity trajectory after feature lock", "candidate score", "within-cohort rank"],
            "branches": [
                {"minimumUsable": 36, "maximumUsable": 48, "endpointCadenceCycles": 50, "decision": "continue-low-burden"},
                {"minimumUsable": 24, "maximumUsable": 35, "endpointCadenceCycles": 25, "decision": "continue-resolution-rescue"},
                {"minimumUsable": 0, "maximumUsable": 23, "endpointCadenceCycles": None, "decision": "stop-confirmation"},
            ],
        },
        "failureContainment": failure_domains,
        "allocation": allocation,
        "requiredBeforePhysicalUse": [
            "Replace every TO_BE_FROZEN value and hash the signed domain specification.",
            "Map each planning resource ID to an actual calibrated resource and maintenance record.",
            "Record battery laboratory safety approval and emergency-response ownership.",
            "Pass the RC59 metrology, acute-intervention, and expansion-fixture gates on disjoint sacrificial resources.",
            "Confirm that no outcome-capable role can read target lifetime before the registered opening event.",
        ],
    }


def validate(plan):
    rows = plan["allocation"]
    assert len(rows) == 48
    assert len({row["specimenId"] for row in rows}) == 48
    assert len({row["channelId"] for row in rows}) == 48
    assert all(sum(row["manufacturingBlockId"] == block for row in rows) == 4 for block in {row["manufacturingBlockId"] for row in rows})
    assert all(sum(row["chamberId"] == chamber for row in rows) == 24 for chamber in ("C1", "C2"))
    assert all(sum(row["fixtureGroupId"] == fixture for row in rows) == 12 for fixture in ("F1", "F2", "F3", "F4"))
    assert all(sum(row["startWave"] == wave for row in rows) == 8 for wave in range(1, 7))
    for block in {row["manufacturingBlockId"] for row in rows}:
        block_rows = [row for row in rows if row["manufacturingBlockId"] == block]
        assert {row["fixtureGroupId"] for row in block_rows} == {"F1", "F2", "F3", "F4"}
        assert sorted(row["chamberId"] for row in block_rows) == ["C1", "C1", "C2", "C2"]
    for chamber in ("C1", "C2"):
        for fixture in ("F1", "F2", "F3", "F4"):
            subset = [row for row in rows if row["chamberId"] == chamber and row["fixtureGroupId"] == fixture]
            assert sorted(row["startWave"] for row in subset) == list(range(1, 7))
            assert sorted(row["channelPosition"] for row in subset) == list(range(1, 7))
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", default=DEFAULT_SEED)
    parser.add_argument("--output", default="research/reproducibility/rc59-48-cell-manifest-python.json")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    plan = make_plan(args.seed)
    validate(plan)
    if args.write:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"RC59 Python allocation passed: 48 cells, hash={plan['randomization']['allocationHashSha256']}")


if __name__ == "__main__":
    main()
