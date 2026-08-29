#!/usr/bin/env python3
"""RC62: released-chain posterior bridge and likelihood-family audit."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "research" / "reproducibility"
SPEC_PATH = DATA / "rc62-posterior-analysis-spec.json"
MANIFEST_PATH = DATA / "rc62-posterior-chain-manifest.json"
RESULT_PATH = DATA / "rc62-posterior-bridge-result.json"
PARAMETERS = ["H0", "rdrag", "H0rdrag", "w", "wa", "omegam"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def weighted_quantile(values: np.ndarray, weights: np.ndarray, probabilities=(0.16, 0.5, 0.84)):
    order = np.argsort(values)
    sorted_values = values[order]
    sorted_weights = weights[order]
    cumulative = np.cumsum(sorted_weights) - 0.5 * sorted_weights
    cumulative /= np.sum(sorted_weights)
    return [float(np.interp(probability, cumulative, sorted_values)) for probability in probabilities]


def summarize(values: np.ndarray):
    return {
        "mean": float(np.mean(values)),
        "sd": float(np.std(values, ddof=1)),
        "q16": float(np.quantile(values, 0.16)),
        "median": float(np.quantile(values, 0.5)),
        "q84": float(np.quantile(values, 0.84)),
    }


def weighted_summary(values: np.ndarray, weights: np.ndarray):
    normalized = weights / np.sum(weights)
    mean = float(np.sum(normalized * values))
    variance = float(np.sum(normalized * (values - mean) ** 2))
    q16, median, q84 = weighted_quantile(values, weights)
    return {"mean": mean, "sd": math.sqrt(variance), "q16": q16, "median": median, "q84": q84}


def read_cobaya_chain(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        header = handle.readline().lstrip("#").split()
    indices = [header.index(name) for name in ["weight", *PARAMETERS]]
    values = np.loadtxt(path, comments="#", usecols=indices, ndmin=2)
    weights = values[:, 0]
    rounded = np.rint(weights).astype(np.int64)
    if np.max(np.abs(weights - rounded)) > 1e-8 or np.any(rounded < 1):
        raise ValueError(f"non-integral Cobaya multiplicity in {path}")
    return {name: values[:, i + 1] for i, name in enumerate(PARAMETERS)}, rounded


def trim_weights(weights: np.ndarray, fraction: float):
    kept = weights.copy()
    drop = int(math.floor(int(np.sum(weights)) * fraction))
    index = 0
    while drop and index < len(kept):
        removed = min(drop, int(kept[index]))
        kept[index] -= removed
        drop -= removed
        if kept[index] == 0:
            index += 1
    return kept


def split_rhat(chains: list[np.ndarray]):
    split = []
    for chain in chains:
        midpoint = len(chain) // 2
        split.extend([chain[:midpoint], chain[midpoint : 2 * midpoint]])
    n = min(len(chain) for chain in split)
    arrays = np.vstack([chain[:n] for chain in split])
    means = np.mean(arrays, axis=1)
    variances = np.var(arrays, axis=1, ddof=1)
    within = float(np.mean(variances))
    between = float(n * np.var(means, ddof=1))
    var_plus = (n - 1) / n * within + between / n
    return float(math.sqrt(var_plus / within))


def autocovariance_fft(values: np.ndarray):
    centered = values - np.mean(values)
    size = 1 << (2 * len(values) - 1).bit_length()
    transform = np.fft.rfft(centered, n=size)
    raw = np.fft.irfft(transform * np.conjugate(transform), n=size)[: len(values)]
    return raw / np.arange(len(values), 0, -1)


def bulk_ess(chains: list[np.ndarray]):
    n = min(len(chain) for chain in chains)
    arrays = [chain[:n] for chain in chains]
    m = len(arrays)
    means = np.array([np.mean(chain) for chain in arrays])
    within = float(np.mean([np.var(chain, ddof=1) for chain in arrays]))
    between = float(n * np.var(means, ddof=1))
    var_plus = (n - 1) / n * within + between / n
    autocov = np.mean(np.vstack([autocovariance_fft(chain) for chain in arrays]), axis=0)
    rho = 1.0 - (within - autocov) / var_plus
    paired = []
    for index in range(1, len(rho) - 1, 2):
        pair = float(rho[index] + rho[index + 1])
        if pair < 0:
            break
        if paired and pair > paired[-1]:
            pair = paired[-1]
        paired.append(pair)
    tau = max(1.0, -1.0 + 2.0 * (1.0 + sum(paired)))
    return float(min(m * n, m * n / tau))


def load_official_group(group_id: str, files: list[dict], chain_dir: Path, discard: float):
    chains = []
    integrity = []
    for item in sorted((entry for entry in files if entry["groupId"] == group_id), key=lambda entry: entry["chain"]):
        path = chain_dir / item["localFilename"]
        observed = sha256(path)
        integrity.append(observed == item["expectedSha256"] == item["observedSha256"])
        params, weights = read_cobaya_chain(path)
        kept = trim_weights(weights, discard)
        chains.append({"params": params, "weights": weights, "kept": kept})

    summaries = {}
    diagnostics = {}
    expanded_by_parameter = {}
    for parameter in PARAMETERS:
        tail_chains = [np.repeat(chain["params"][parameter], chain["kept"]) for chain in chains]
        full = np.concatenate([np.repeat(chain["params"][parameter], chain["weights"]) for chain in chains])
        tail = np.concatenate(tail_chains)
        expanded_by_parameter[parameter] = tail
        summary = summarize(tail)
        full_mean = float(np.mean(full))
        summaries[parameter] = summary
        diagnostics[parameter] = {
            "splitRhat": split_rhat(tail_chains),
            "bulkEss": bulk_ess(tail_chains),
            "fullMean": full_mean,
            "tailMeanShiftSigma": abs(full_mean - summary["mean"]) / summary["sd"],
            "expandedTailSteps": int(sum(len(chain) for chain in tail_chains)),
        }

    return {
        "integrityPassed": all(integrity),
        "summaries": summaries,
        "diagnostics": diagnostics,
        "expanded": expanded_by_parameter,
    }


def standardized_shift(left: dict, right: dict):
    return abs(left["mean"] - right["mean"]) / math.sqrt(left["sd"] ** 2 + right["sd"] ** 2)


def load_dovekie(path: Path, item: dict):
    with path.open("r", encoding="utf-8") as handle:
        header = handle.readline().lstrip("#").strip().split("\t")
    names = ["cosmological_parameters--omega_m", "cosmological_parameters--h0", "cosmological_parameters--w", "cosmological_parameters--wa", "log_weight"]
    indices = [header.index(name) for name in names]
    values = np.loadtxt(path, comments="#", usecols=indices, ndmin=2)
    finite = np.isfinite(values[:, -1])
    values = values[finite]
    log_weights = values[:, -1]
    weights = np.exp(log_weights - np.max(log_weights))
    mapped = {
        "omegam": values[:, 0],
        "H0": values[:, 1] * 100.0,
        "w": values[:, 2],
        "wa": values[:, 3],
    }
    summaries = {parameter: weighted_summary(data, weights) for parameter, data in mapped.items()}
    normalized = weights / np.sum(weights)
    covariance = np.cov(np.vstack([mapped["w"], mapped["wa"]]), aweights=normalized, ddof=0)
    return {
        "integrity": {
            "gitCommit": item["gitCommit"],
            "gitBlobSha": item["expectedGitBlobSha"],
            "observedSha256": sha256(path),
            "bytesMatched": path.stat().st_size == item["bytes"],
        },
        "rows": int(len(values)),
        "kishEss": float(np.sum(weights) ** 2 / np.sum(weights**2)),
        "summaries": summaries,
        "wWaCovariance": covariance.tolist(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chain-dir", required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    chain_dir = Path(args.chain_dir).resolve()
    if not manifest.get("downloadAudit", {}).get("allOfficialSha256Matched"):
        raise ValueError("manifest does not record a successful download audit")

    group_results = {}
    expanded = {}
    discard = spec["processing"]["discardInitialFractionByExpandedMarkovSteps"]
    for group in spec["eligibleGroups"]:
        loaded = load_official_group(group["id"], manifest["files"], chain_dir, discard)
        expanded[group["id"]] = loaded.pop("expanded")
        group_results[group["id"]] = loaded

    local = spec["processing"]["localLadder"]
    seed = spec["processing"]["randomSeed"]
    for offset, group in enumerate(spec["eligibleGroups"]):
        group_id = group["id"]
        rng = np.random.default_rng(seed + offset)
        count = len(expanded[group_id]["H0rdrag"])
        local_draw = rng.normal(local["H0"], local["sigma"], count)
        required = expanded[group_id]["H0rdrag"] / local_draw
        gap = expanded[group_id]["rdrag"] - required
        group_results[group_id]["summaries"]["rdragRequiredByLocal"] = summarize(required)
        group_results[group_id]["summaries"]["rdragPhysicalGap"] = summarize(gap)
        group_results[group_id]["physicalRulerConflict"] = {
            "gapZ": float(np.mean(gap) / np.std(gap, ddof=1)),
            "probabilityCmbRulerExceedsRequired": float(np.mean(gap > 0)),
        }

    default_ids = ["pantheonplus-camspec", "union3-camspec", "desy5-camspec"]
    family_pairs = []
    for left_index, left in enumerate(default_ids):
        for right in default_ids[left_index + 1 :]:
            family_pairs.append({
                "left": left,
                "right": right,
                "H0rdragShiftSigma": standardized_shift(group_results[left]["summaries"]["H0rdrag"], group_results[right]["summaries"]["H0rdrag"]),
                "requiredRdragShiftSigma": standardized_shift(group_results[left]["summaries"]["rdragRequiredByLocal"], group_results[right]["summaries"]["rdragRequiredByLocal"]),
                "wShiftSigma": standardized_shift(group_results[left]["summaries"]["w"], group_results[right]["summaries"]["w"]),
                "waShiftSigma": standardized_shift(group_results[left]["summaries"]["wa"], group_results[right]["summaries"]["wa"]),
            })

    cmb_left = group_results["desy5-camspec"]["summaries"]
    cmb_right = group_results["desy5-plik"]["summaries"]
    cmb_comparison = {
        "left": "desy5-camspec",
        "right": "desy5-plik",
        "H0rdragShiftSigma": standardized_shift(cmb_left["H0rdrag"], cmb_right["H0rdrag"]),
        "requiredRdragShiftSigma": standardized_shift(cmb_left["rdragRequiredByLocal"], cmb_right["rdragRequiredByLocal"]),
        "wShiftSigma": standardized_shift(cmb_left["w"], cmb_right["w"]),
        "waShiftSigma": standardized_shift(cmb_left["wa"], cmb_right["wa"]),
    }

    dovekie_item = next(item for item in manifest["files"] if item["groupId"] == spec["externalStateCheck"]["id"])
    dovekie = load_dovekie(chain_dir / dovekie_item["localFilename"], dovekie_item)
    original = group_results["desy5-camspec"]
    original_cov = np.cov(np.vstack([expanded["desy5-camspec"]["w"], expanded["desy5-camspec"]["wa"]]), ddof=1)
    delta = np.array([
        dovekie["summaries"]["w"]["mean"] - original["summaries"]["w"]["mean"],
        dovekie["summaries"]["wa"]["mean"] - original["summaries"]["wa"]["mean"],
    ])
    descriptive_distance = float(math.sqrt(delta @ np.linalg.inv(original_cov + np.asarray(dovekie["wWaCovariance"])) @ delta))

    sampling_gate = all(
        diagnostic["bulkEss"] >= spec["predeclaredGates"]["sampling"]["minimumBulkEssPerParameter"]
        and diagnostic["splitRhat"] <= spec["predeclaredGates"]["sampling"]["maximumSplitRhat"]
        and diagnostic["tailMeanShiftSigma"] <= spec["predeclaredGates"]["sampling"]["maximumFullVsTailMeanShiftSigma"]
        for group in group_results.values()
        for diagnostic in group["diagnostics"].values()
    )
    family_gate_value = max(max(pair["H0rdragShiftSigma"], pair["requiredRdragShiftSigma"]) for pair in family_pairs)
    calibration_gate_value = max(cmb_comparison["H0rdragShiftSigma"], cmb_comparison["requiredRdragShiftSigma"])
    physical_gate_value = min(group_results[group_id]["physicalRulerConflict"]["gapZ"] for group_id in default_ids)

    result = {
        "cycleId": spec["cycleId"],
        "reviewedOn": spec["frozenOn"],
        "status": "posterior-constraint-not-solution",
        "sourceIntegrityPassed": all(group["integrityPassed"] for group in group_results.values()) and dovekie["integrity"]["bytesMatched"],
        "processing": spec["processing"],
        "groups": group_results,
        "supernovaFamilyComparisons": family_pairs,
        "cmbCalibrationComparison": cmb_comparison,
        "dovekieCurrentReleaseCheck": {
            **dovekie,
            "originalDesy5CamSpecWWaCovariance": original_cov.tolist(),
            "descriptiveJointW0WaShiftSigma": descriptive_distance,
            "controlledComparison": False,
        },
        "gateAdjudication": {
            "sampling": {"passed": sampling_gate},
            "supernovaFamilyStability": {"passed": family_gate_value <= 1.0, "maximumDeclaredShiftSigma": family_gate_value},
            "cmbCalibrationStability": {"passed": calibration_gate_value <= 0.5, "maximumDeclaredShiftSigma": calibration_gate_value},
            "physicalRulerConflict": {"passed": physical_gate_value >= 3.0, "minimumGapZ": physical_gate_value},
        },
        "claimBoundary": spec["claimBoundary"],
    }
    output = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.write:
        RESULT_PATH.write_text(output, encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
