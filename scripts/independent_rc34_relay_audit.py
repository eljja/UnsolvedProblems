import hashlib
import json
import math
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"


def read_json(name):
    return json.loads((REPRO / name).read_text(encoding="utf-8"))


def digest(*parts):
    h = hashlib.sha256()
    for part in parts:
        if not isinstance(part, bytes):
            part = str(part).encode()
        h.update(len(part).to_bytes(4, "big"))
        h.update(part)
    return h.digest()


def unit(*parts):
    return int.from_bytes(digest(*parts)[:4], "big") / 2**32


def integer(limit, *parts):
    return math.floor(unit(*parts) * limit)


def create_scenario(study, scenario, packages, tokens, seed, batch_size, fixed_bytes, delay_ms):
    ingress = []
    for index, event in enumerate(study["events"]):
        package = packages[event["packageId"]]
        ingress.append({
            "ingressRecordId": f"IN-{study['studyId']}-{index:03d}",
            "observedAtMs": index * 17 + integer(7, seed, "ingress-time", event["eventId"]),
            "payloadBytes": 240 + package["length"] + integer(41, seed, "ingress-size", event["eventId"]),
            "endpointBucket": f"EP-{integer(8, seed, 'endpoint', event['packageId'])}",
            "stablePackageToken": tokens[event["eventId"]],
            "_eventId": event["eventId"],
        })
    if scenario == "unprotected":
        egress = [{
            "egressRecordId": f"OUT-{study['studyId']}-{index:03d}",
            "observedAtMs": item["observedAtMs"] + 13 + integer(5, seed, "direct-delay", item["_eventId"]),
            "payloadBytes": item["payloadBytes"] + 72,
            "endpointBucket": item["endpointBucket"],
            "stablePackageToken": item["stablePackageToken"],
            "_eventId": item["_eventId"],
            "_batchId": None,
        } for index, item in enumerate(ingress)]
        egress.sort(key=lambda item: (item["observedAtMs"], item["egressRecordId"]))
        return {"ingress": ingress, "egress": egress}
    egress = []
    for start in range(0, len(ingress), batch_size):
        batch = ingress[start:start + batch_size]
        batch_id = f"{study['studyId']}-B{start // batch_size:02d}"
        batch_time = max(item["observedAtMs"] for item in batch) + delay_ms
        shuffled = sorted(batch, key=lambda item: digest(seed, "shuffle", batch_id, item["_eventId"]))
        for slot, item in enumerate(shuffled):
            output = {
                "egressRecordId": f"OUT-{batch_id}-{slot:02d}",
                "observedAtMs": batch_time,
                "payloadBytes": fixed_bytes,
                "endpointBucket": "RELAY",
                "_eventId": item["_eventId"],
                "_batchId": batch_id,
            }
            if scenario == "stable-token-ablation":
                output["stablePackageToken"] = item["stablePackageToken"]
            egress.append(output)
    return {"ingress": ingress, "egress": egress}


def strip_truth(trace):
    return {
        "ingress": [{key: value for key, value in item.items() if key != "_eventId"} for item in trace["ingress"]],
        "egress": [{key: value for key, value in item.items() if key not in ("_eventId", "_batchId")} for item in trace["egress"]],
    }


def fit_offsets(traces, scenario, studies):
    delays, sizes = [], []
    for study_id in studies:
        trace = traces[scenario][study_id]
        by_event = {item["_eventId"]: item for item in trace["egress"]}
        for source in trace["ingress"]:
            target = by_event[source["_eventId"]]
            delays.append(target["observedAtMs"] - source["observedAtMs"])
            sizes.append(target["payloadBytes"] - source["payloadBytes"])
    return {"expectedDelayMs": statistics.median(delays), "expectedSizeOffset": statistics.median(sizes)}


def attack(trace, weights, offsets, seed):
    available = {item["egressRecordId"]: item for item in trace["egress"]}
    predictions = []
    for source in sorted(trace["ingress"], key=lambda item: (item["observedAtMs"], item["ingressRecordId"])):
        candidates = []
        for target in available.values():
            time_cost = abs((target["observedAtMs"] - source["observedAtMs"]) - offsets["expectedDelayMs"]) / 100
            size_cost = abs((target["payloadBytes"] - source["payloadBytes"]) - offsets["expectedSizeOffset"]) / 512
            endpoint_cost = 0 if target["endpointBucket"] == source["endpointBucket"] else 1
            token_cost = 0 if target.get("stablePackageToken") and source.get("stablePackageToken") and target["stablePackageToken"] == source["stablePackageToken"] else 1
            tie = unit(seed, "attack-tie", source["ingressRecordId"], target["egressRecordId"]) * 1e-9
            cost = weights["time"] * time_cost + weights["size"] * size_cost + weights["endpoint"] * endpoint_cost + weights["stableToken"] * token_cost + tie
            candidates.append((cost, target))
        _, best = min(candidates, key=lambda item: item[0])
        predictions.append({
            "ingressRecordId": source["ingressRecordId"],
            "predictedEgressRecordId": best["egressRecordId"],
            "trueEventId": source["_eventId"],
            "predictedEventId": best["_eventId"],
            "correct": source["_eventId"] == best["_eventId"],
            "predictedBatchId": best["_batchId"],
        })
        del available[best["egressRecordId"]]
    return predictions


def xorshift(seed_value):
    state = seed_value & 0xFFFFFFFF or 0x9E3779B9
    while True:
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        yield state / 2**32


def quantile(values, probability):
    return sorted(values)[math.ceil(probability * len(values)) - 1]


def main():
    precommit = read_json("rc34-sealed-corpus-precommit.json")
    reveal = read_json("rc34-sealed-corpus-reveal.json")
    transcripts = read_json("rc34-circl-transcripts.json")
    observed = read_json("rc34-relay-traces.json")
    published_predictions = read_json("rc34-relay-holdout-predictions.json")
    published_result = read_json("rc34-relay-linkage-result.json")
    seed = bytes.fromhex(reveal["seedHex"])
    packages = {item["id"]: item for item in reveal["packages"]}
    tokens = {}
    for batch in transcripts["batches"]:
        if batch["mode"] == "VOPRF":
            tokens.update(zip(batch["eventIds"], batch["outputsHex"]))
    scenarios = ["unprotected", "protected", "stable-token-ablation"]
    traces = {scenario: {} for scenario in scenarios}
    for scenario in scenarios:
        for study in reveal["studies"]:
            traces[scenario][study["studyId"]] = create_scenario(
                study, scenario, packages, tokens, seed,
                precommit["relay"]["batchSize"],
                precommit["relay"]["fixedPayloadBytes"],
                precommit["relay"]["fixedBatchDelayMilliseconds"],
            )
    trace_reconstruction = all(
        strip_truth(traces[scenario][study_id]) == observed["scenarios"][scenario][study_id]
        for scenario in scenarios
        for study_id in traces[scenario]
    )
    development = precommit["oprf"]["developmentStudies"]
    holdout = precommit["oprf"]["finalStudy"]
    grid = [
        {"time": time, "size": size, "endpoint": endpoint, "stableToken": token}
        for time in precommit["relay"]["attackerFeatureWeights"]["time"]
        for size in precommit["relay"]["attackerFeatureWeights"]["size"]
        for endpoint in precommit["relay"]["attackerFeatureWeights"]["endpoint"]
        for token in precommit["relay"]["attackerFeatureWeights"]["stableToken"]
    ]
    prediction_matches = True
    selected_models_are_maximal = True
    metrics = {}
    for scenario in scenarios:
        offsets = fit_offsets(traces, scenario, development)
        published_fit = published_predictions["fitted"][scenario]
        if offsets != published_fit["offsets"]:
            prediction_matches = False
        selected = published_fit["weights"]
        selected_correct = 0
        best_correct = 0
        total = 0
        for weights in grid:
            correct = 0
            candidate_total = 0
            for study_id in development:
                candidate = attack(traces[scenario][study_id], weights, offsets, seed)
                correct += sum(item["correct"] for item in candidate)
                candidate_total += len(candidate)
            best_correct = max(best_correct, correct)
            if weights == selected:
                selected_correct, total = correct, candidate_total
        selected_models_are_maximal &= selected_correct == best_correct and published_fit["candidateModels"] == 144
        predictions = attack(traces[scenario][holdout], selected, offsets, seed)
        prediction_matches &= predictions == published_predictions["predictions"][scenario]
        correct = sum(item["correct"] for item in predictions)
        metrics[scenario] = {"correct": correct, "total": len(predictions), "accuracy": correct / len(predictions)}

    protected = traces["protected"][holdout]
    predicted = {item["ingressRecordId"]: item["predictedEgressRecordId"] for item in published_predictions["predictions"]["protected"]}
    ingress_batches = [protected["ingress"][start:start + precommit["relay"]["batchSize"]] for start in range(0, len(protected["ingress"]), precommit["relay"]["batchSize"])]
    egress_batches = {}
    for item in protected["egress"]:
        egress_batches.setdefault(item["_batchId"], []).append(item["egressRecordId"])
    random = xorshift(int.from_bytes(digest(seed, "null-model")[:4], "big"))
    null_values = []
    for _ in range(10000):
        correct = 0
        for batch_index, inputs in enumerate(ingress_batches):
            batch_id = f"{holdout}-B{batch_index:02d}"
            outputs = list(egress_batches[batch_id])
            for index in range(len(outputs) - 1, 0, -1):
                chosen = math.floor(next(random) * (index + 1))
                outputs[index], outputs[chosen] = outputs[chosen], outputs[index]
            correct += sum(predicted[item["ingressRecordId"]] == outputs[index] for index, item in enumerate(inputs))
        null_values.append(correct / len(protected["ingress"]))
    p95 = quantile(null_values, 0.95)
    checks = {
        "all_twelve_observed_traces_reconstruct": trace_reconstruction,
        "all_three_selected_models_maximize_development_accuracy": selected_models_are_maximal,
        "all_heldout_predictions_match": prediction_matches,
        "protected_score_matches": metrics["protected"] == {key: published_result["holdoutMetrics"]["protected"][key] for key in ("correct", "total", "accuracy")},
        "unprotected_score_matches": metrics["unprotected"] == {key: published_result["holdoutMetrics"]["unprotected"][key] for key in ("correct", "total", "accuracy")},
        "stable_token_score_matches": metrics["stable-token-ablation"] == {key: published_result["holdoutMetrics"]["stable-token-ablation"][key] for key in ("correct", "total", "accuracy")},
        "ten_thousand_null_draws_reproduce": len(null_values) == 10000,
        "null_p95_reproduces": p95 == published_result["nullModel"]["p95Accuracy"],
        "protected_not_above_null_gate": metrics["protected"]["accuracy"] <= p95,
        "two_positive_controls_above_null_gate": metrics["unprotected"]["accuracy"] > p95 and metrics["stable-token-ablation"]["accuracy"] > p95,
        "public_result_passes": published_result["passed"],
    }
    result = {
        "auditId": "INDEPENDENT-RC34-RELAY-AUDIT-0.9",
        "computedOn": "2026-08-14",
        "passed": all(checks.values()),
        "checks": checks,
        "metrics": metrics,
        "nullModel": {"simulations": len(null_values), "meanAccuracy": sum(null_values) / len(null_values), "p95Accuracy": p95},
        "aggregateChecksPassed": sum(checks.values()),
        "aggregateChecksTotal": len(checks),
        "boundary": "This independent implementation reproduces the sealed offline trace simulator and frozen attack. It does not add live traffic, adaptive attackers, active tagging, or institutional independence.",
    }
    output = REPRO / "rc34-relay-python-audit.json"
    if "--write" in sys.argv:
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    elif read_json("rc34-relay-python-audit.json") != result:
        raise SystemExit("RC34 relay audit differs from committed artifact")
    print(f"RC34 independent relay audit: {sum(checks.values())}/{len(checks)} checks; protected {metrics['protected']['correct']}/{metrics['protected']['total']}, null p95 {p95:.3f}.")
    if not result["passed"]:
        raise SystemExit("Failed checks: " + ", ".join(name for name, value in checks.items() if not value))


if __name__ == "__main__":
    main()
