"""Post-gate diagnostic only; never authorizes L0001 release."""
import json
import pathlib
import sys

import numpy as np
from sklearn.ensemble import ExtraTreesRegressor

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from run_rc44_command_image_alignment import (  # noqa: E402
    command_features, deterministic_positions, image_features, load_xypt,
    recover_deletions, robust_fit_transform, score_calls, ensure_raw, SEED
)


def evaluate(predicted, observed, start, end, case, trials, deletions):
    totals = {"truth": 0, "calls": 0, "recoveredWithinOne": 0, "falseDiscoveries": 0}
    for trial in range(trials):
        truth_global = deterministic_positions(SEED, case, trial, deletions, start, end)
        truth = [value - start for value in truth_global]
        keep = np.ones(end - start, dtype=bool)
        keep[truth] = False
        calls, _ = recover_deletions(predicted[start:end], observed[start:end][keep], deletions, 1.0)
        score = score_calls(truth, calls)
        for key in totals:
            totals[key] += score[key]
    return {
        "totals": totals,
        "recallWithinOne": totals["recoveredWithinOne"] / totals["truth"],
        "falseDiscoveryRate": totals["falseDiscoveries"] / totals["calls"]
    }


_, rows, triggers = load_xypt(2)
_, _, frames = ensure_raw(2, len(triggers))
x = command_features(rows, triggers)
y = image_features(frames)
n = len(y)
train_end, test_start = int(np.floor(0.6 * n)), int(np.floor(0.8 * n))
_, _, (x_train, x_all) = robust_fit_transform(x[:train_end], x)
_, _, (y_train, y_all) = robust_fit_transform(y[:train_end], y)
model = ExtraTreesRegressor(
    n_estimators=64,
    min_samples_leaf=2,
    max_features=1.0,
    random_state=4402,
    n_jobs=-1
)
model.fit(x_train, y_train)
predicted = model.predict(x_all)
result = {
    "resultId": "RC44-X16-L0002-POST-GATE-NONLINEAR-DIAGNOSTIC-0.1",
    "cycleId": "RC-2026-44",
    "createdOn": "2026-08-21",
    "status": "exploratory-after-preregistered-gate-failure",
    "question": "Was the failed bridge mainly a linear-ridge limitation, or does a nonlinear tree ensemble remain far below the location gate on the same blocked split?",
    "model": {
        "implementation": "scikit-learn ExtraTreesRegressor 1.3.0",
        "nEstimators": 64,
        "minSamplesLeaf": 2,
        "maxFeatures": 1.0,
        "randomState": 4402,
        "trainRows": train_end,
        "testRows": n - test_start
    },
    "single": evaluate(predicted, y_all, test_start, n, "exploratory-single", 128, 1),
    "dispersed23": evaluate(predicted, y_all, test_start, n, "exploratory-dispersed", 32, 23),
    "boundary": "This model and its seeds were chosen after the preregistered failure. Its result diagnoses model-class limitations only and cannot release or interpret L0001."
}
if "--write" in sys.argv:
    output = ROOT / "research" / "reproducibility" / "rc44-x16-layer-0002-nonlinear-diagnostic.json"
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
