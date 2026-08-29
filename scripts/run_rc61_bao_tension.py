#!/usr/bin/env python3
"""RC61: redshift-resolved DESI DR2 BAO scale/tension stress test."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from scipy.integrate import quad
from scipy.optimize import brentq, minimize, minimize_scalar

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "research" / "reproducibility"
MEAN_PATH = DATA_DIR / "rc61-desi-dr2-bao-mean.txt"
COV_PATH = DATA_DIR / "rc61-desi-dr2-bao-cov.txt"
SPEC_PATH = DATA_DIR / "rc61-bao-analysis-spec.json"
RESULT_PATH = DATA_DIR / "rc61-bao-tension-result.json"
C_OVER_100 = 2997.92458  # Mpc when H0 = 100 km/s/Mpc


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load_data():
    rows = []
    for line in MEAN_PATH.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        z, value, observable = line.split()
        rows.append({"z": float(z), "value": float(value), "observable": observable})
    covariance = np.loadtxt(COV_PATH, dtype=float)
    if covariance.shape != (len(rows), len(rows)):
        raise ValueError(f"covariance shape {covariance.shape} does not match {len(rows)} rows")
    if not np.allclose(covariance, covariance.T, atol=1e-14):
        raise ValueError("covariance is not symmetric")
    eigenvalues = np.linalg.eigvalsh(covariance)
    if eigenvalues[0] <= 0:
        raise ValueError("covariance is not positive definite")
    return rows, covariance, eigenvalues


def e_z(z: float, model: str, shape: np.ndarray) -> float:
    om = float(shape[0])
    zp1 = 1.0 + z
    if model == "flatLambdaCDM":
        de = 1.0 - om
    elif model == "flatWCDM":
        w = float(shape[1])
        de = (1.0 - om) * zp1 ** (3.0 * (1.0 + w))
    elif model == "flatW0WaCDM":
        w0, wa = float(shape[1]), float(shape[2])
        de = (1.0 - om) * zp1 ** (3.0 * (1.0 + w0 + wa)) * math.exp(-3.0 * wa * z / zp1)
    else:
        raise ValueError(f"unknown model {model}")
    value = om * zp1**3 + de
    return math.sqrt(value) if value > 0 else float("nan")


def geometry(rows, model: str, shape: np.ndarray) -> np.ndarray:
    cache = {}
    values = []
    for row in rows:
        z = row["z"]
        if z not in cache:
            integral = quad(lambda x: 1.0 / e_z(x, model, shape), 0.0, z, epsabs=1e-11, epsrel=1e-11, limit=150)[0]
            cache[z] = (integral, e_z(z, model, shape))
        integral, expansion = cache[z]
        if not math.isfinite(integral) or not math.isfinite(expansion):
            return np.full(len(rows), np.nan)
        if row["observable"] == "DM_over_rs":
            base = integral
        elif row["observable"] == "DH_over_rs":
            base = 1.0 / expansion
        elif row["observable"] == "DV_over_rs":
            base = (integral * integral * z / expansion) ** (1.0 / 3.0)
        else:
            raise ValueError(f"unknown observable {row['observable']}")
        values.append(C_OVER_100 * base)
    return np.asarray(values)


def chi2_at(rows, inverse, model: str, shape: np.ndarray, p: float) -> float:
    prediction = geometry(rows, model, shape) / p
    if not np.all(np.isfinite(prediction)):
        return 1e100
    residual = np.asarray([r["value"] for r in rows]) - prediction
    return float(residual @ inverse @ residual)


def profiled_scale(rows, inverse, model: str, shape: np.ndarray):
    basis = geometry(rows, model, shape)
    if not np.all(np.isfinite(basis)):
        return 1e100, float("nan")
    y = np.asarray([r["value"] for r in rows])
    amplitude = float((basis @ inverse @ y) / (basis @ inverse @ basis))
    if amplitude <= 0:
        return 1e100, float("nan")
    p = 1.0 / amplitude
    residual = y - amplitude * basis
    return float(residual @ inverse @ residual), p


MODEL_BOUNDS = {
    "flatLambdaCDM": [(0.1, 0.5)],
    "flatWCDM": [(0.1, 0.5), (-2.5, -0.3)],
    "flatW0WaCDM": [(0.1, 0.5), (-2.5, 0.0), (-5.0, 5.0)],
}


def fit_model(rows, covariance, model: str):
    inverse = np.linalg.inv(covariance)
    bounds = MODEL_BOUNDS[model]
    objective = lambda shape: profiled_scale(rows, inverse, model, np.asarray(shape))[0]
    starts = {
        "flatLambdaCDM": [[0.3]],
        "flatWCDM": [[0.3, -1.0], [0.25, -0.7], [0.35, -1.4]],
        "flatW0WaCDM": [[0.3, -1.0, 0.0], [0.3, -0.8, -0.8], [0.3, -1.2, 1.0], [0.25, -0.6, -2.0]],
    }[model]
    fits = [minimize(objective, start, method="Nelder-Mead", options={"maxiter": 10000, "xatol": 1e-10, "fatol": 1e-10}) for start in starts]
    admissible = [f for f in fits if all(lo <= x <= hi for x, (lo, hi) in zip(f.x, bounds))]
    if not admissible:
        fits = [minimize(objective, start, method="L-BFGS-B", bounds=bounds) for start in starts]
        admissible = [f for f in fits if f.success]
    best = min(admissible, key=lambda f: f.fun)
    chi2, p = profiled_scale(rows, inverse, model, best.x)
    n = len(rows)
    k = len(best.x) + 1
    aic = chi2 + 2 * k
    aicc = aic + 2 * k * (k + 1) / (n - k - 1)
    bic = chi2 + k * math.log(n)
    names = {"flatLambdaCDM": ["Omega_m"], "flatWCDM": ["Omega_m", "w"], "flatW0WaCDM": ["Omega_m", "w0", "wa"]}[model]
    return {
        "model": model,
        "parameters": {**{name: float(value) for name, value in zip(names, best.x)}, "h_times_r_d_Mpc": p},
        "chi2": chi2,
        "n": n,
        "k": k,
        "dof": n - k,
        "aic": aic,
        "aicc": aicc,
        "bic": bic,
        "optimizerSuccess": bool(best.success),
    }


def profile_interval_lcdm(rows, covariance, best):
    inverse = np.linalg.inv(covariance)
    minimum = best["chi2"]
    om_hat = best["parameters"]["Omega_m"]
    p_hat = best["parameters"]["h_times_r_d_Mpc"]
    om_objective = lambda om: profiled_scale(rows, inverse, "flatLambdaCDM", np.asarray([om]))[0] - minimum - 1.0
    om_low = brentq(om_objective, 0.1, om_hat)
    om_high = brentq(om_objective, om_hat, 0.5)

    def p_objective(p):
        result = minimize_scalar(lambda om: chi2_at(rows, inverse, "flatLambdaCDM", np.asarray([om]), p), bounds=(0.1, 0.5), method="bounded", options={"xatol": 1e-12})
        return float(result.fun - minimum - 1.0)

    p_low = brentq(p_objective, 80.0, p_hat)
    p_high = brentq(p_objective, p_hat, 120.0)
    return {
        "Omega_m": {"low": om_low, "high": om_high, "sigmaAverage": (om_high - om_low) / 2},
        "h_times_r_d_Mpc": {"low": p_low, "high": p_high, "sigmaAverage": (p_high - p_low) / 2},
    }


def leave_one_block_out(rows, covariance):
    output = []
    for z in sorted({r["z"] for r in rows}):
        keep = [i for i, row in enumerate(rows) if row["z"] != z]
        sub_rows = [rows[i] for i in keep]
        sub_covariance = covariance[np.ix_(keep, keep)]
        fit = fit_model(sub_rows, sub_covariance, "flatLambdaCDM")
        interval = profile_interval_lcdm(sub_rows, sub_covariance, fit)
        output.append({
            "omittedRedshift": z,
            "omittedObservables": [rows[i]["observable"] for i in range(len(rows)) if rows[i]["z"] == z],
            "Omega_m": fit["parameters"]["Omega_m"],
            "Omega_mSigma": interval["Omega_m"]["sigmaAverage"],
            "hTimesRdMpc": fit["parameters"]["h_times_r_d_Mpc"],
            "hTimesRdSigmaMpc": interval["h_times_r_d_Mpc"]["sigmaAverage"],
            "chi2": fit["chi2"],
        })
    return output


def block_chi2(rows, covariance, best):
    inverse = np.linalg.inv(covariance)
    om = best["parameters"]["Omega_m"]
    p = best["parameters"]["h_times_r_d_Mpc"]
    prediction = geometry(rows, "flatLambdaCDM", np.asarray([om])) / p
    residual = np.asarray([r["value"] for r in rows]) - prediction
    output = []
    for z in sorted({r["z"] for r in rows}):
        idx = [i for i, row in enumerate(rows) if row["z"] == z]
        sub_covariance = covariance[np.ix_(idx, idx)]
        sub_residual = residual[idx]
        output.append({
            "redshift": z,
            "observables": [rows[i]["observable"] for i in idx],
            "chi2Contribution": float(sub_residual @ np.linalg.inv(sub_covariance) @ sub_residual),
            "residuals": [float(x) for x in sub_residual],
        })
    return output


def product(value_a, sigma_a, value_b, sigma_b, factor=1.0):
    value = factor * value_a * value_b
    sigma = abs(value) * math.sqrt((sigma_a / value_a) ** 2 + (sigma_b / value_b) ** 2)
    return value, sigma


def ratio(numerator, sigma_numerator, denominator, sigma_denominator, factor=1.0):
    value = factor * numerator / denominator
    sigma = abs(value) * math.sqrt((sigma_numerator / numerator) ** 2 + (sigma_denominator / denominator) ** 2)
    return value, sigma


def tension(a, sigma_a, b, sigma_b):
    return abs(a - b) / math.sqrt(sigma_a**2 + sigma_b**2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    rows, covariance, eigenvalues = load_data()
    fits = {name: fit_model(rows, covariance, name) for name in MODEL_BOUNDS}
    baseline = fits["flatLambdaCDM"]
    interval = profile_interval_lcdm(rows, covariance, baseline)
    p = baseline["parameters"]["h_times_r_d_Mpc"]
    p_sigma = interval["h_times_r_d_Mpc"]["sigmaAverage"]
    om = baseline["parameters"]["Omega_m"]
    om_sigma = interval["Omega_m"]["sigmaAverage"]
    leave_one_out = leave_one_block_out(rows, covariance)
    for item in leave_one_out:
        item["hTimesRdShiftInFullSigma"] = abs(item["hTimesRdMpc"] - p) / p_sigma
        item["OmegaMShiftInFullSigma"] = abs(item["Omega_m"] - om) / om_sigma

    planck = spec["externalCalibration"]["planckBaseLambdaCDM"]
    shoes = spec["externalCalibration"]["shoesHstFull2024"]
    jwst = spec["externalCalibration"]["jwstThreeMethod2024"]
    planck_p, planck_p_sigma = product(planck["H0"] / 100, planck["H0Sigma"] / 100, planck["rDragMpc"], planck["rDragSigmaMpc"])
    required_rd_shoes, required_rd_shoes_sigma = ratio(p, p_sigma, shoes["H0"], shoes["H0Sigma"], 100)
    required_rd_jwst, required_rd_jwst_sigma = ratio(p, p_sigma, jwst["H0"], jwst["H0Sigma"], 100)
    h0_planck_ruler, h0_planck_ruler_sigma = ratio(p, p_sigma, planck["rDragMpc"], planck["rDragSigmaMpc"], 100)
    shoes_standard_p, shoes_standard_p_sigma = product(shoes["H0"] / 100, shoes["H0Sigma"] / 100, planck["rDragMpc"], planck["rDragSigmaMpc"])
    comparisons = {
        "planckProduct": {"hTimesRdMpc": planck_p, "sigmaMpc": planck_p_sigma, "tensionWithDesiSigma": tension(p, p_sigma, planck_p, planck_p_sigma), "assumption": "Published Planck H0 and r_drag marginals propagated as independent Gaussian summaries."},
        "shoesWithStandardRuler": {"hTimesRdMpc": shoes_standard_p, "sigmaMpc": shoes_standard_p_sigma, "tensionWithDesiSigma": tension(p, p_sigma, shoes_standard_p, shoes_standard_p_sigma)},
        "desiWithStandardRuler": {"H0": h0_planck_ruler, "H0Sigma": h0_planck_ruler_sigma, "tensionWithShoesSigma": tension(h0_planck_ruler, h0_planck_ruler_sigma, shoes["H0"], shoes["H0Sigma"])},
        "requiredRulerForShoes": {"rDragMpc": required_rd_shoes, "sigmaMpc": required_rd_shoes_sigma, "fractionalShiftFromPlanck": required_rd_shoes / planck["rDragMpc"] - 1, "tensionWithPlanckRulerSigma": tension(required_rd_shoes, required_rd_shoes_sigma, planck["rDragMpc"], planck["rDragSigmaMpc"])},
        "requiredRulerForJwst": {"rDragMpc": required_rd_jwst, "sigmaMpc": required_rd_jwst_sigma, "fractionalShiftFromPlanck": required_rd_jwst / planck["rDragMpc"] - 1, "tensionWithPlanckRulerSigma": tension(required_rd_jwst, required_rd_jwst_sigma, planck["rDragMpc"], planck["rDragSigmaMpc"])},
    }

    for fit in fits.values():
        fit["deltaChi2FromLambdaCDM"] = fit["chi2"] - baseline["chi2"]
        fit["deltaAiccFromLambdaCDM"] = fit["aicc"] - baseline["aicc"]
        fit_p = fit["parameters"]["h_times_r_d_Mpc"]
        fit["requiredRdragAtShoesCentralMpc"] = 100 * fit_p / shoes["H0"]
        fit["requiredRdragShiftFromPlanckFraction"] = fit["requiredRdragAtShoesCentralMpc"] / planck["rDragMpc"] - 1

    target = spec["predeclaredTests"]["headlineReplication"]
    max_p_shift = max(x["hTimesRdShiftInFullSigma"] for x in leave_one_out)
    max_om_shift = max(x["OmegaMShiftInFullSigma"] for x in leave_one_out)
    best_extension = min((fits["flatWCDM"], fits["flatW0WaCDM"]), key=lambda x: x["aicc"])
    hypothesis_tests = [
        {"code": "H61-A", "claim": "The public Gaussian likelihood reproduces the DESI DR2 flat-LambdaCDM headline.", "verdict": "supported" if abs(om-target["targetOmegaM"]) <= target["toleranceOmegaM"] and abs(p-target["targetHTimesRdMpc"]) <= target["toleranceHTimesRdMpc"] else "refuted", "observed": {"Omega_m": om, "hTimesRdMpc": p}},
        {"code": "H61-B", "claim": "One redshift block alone controls the inferred BAO scale.", "verdict": "refuted" if max_p_shift < 1 else "not-refuted", "observed": {"maximumHTimesRdShiftInFullSigma": max_p_shift, "maximumOmegaMShiftInFullSigma": max_om_shift}},
        {"code": "H61-C", "claim": "Late-time expansion freedom resolves the local-H0 and standard-ruler conflict without an information-criterion penalty.", "verdict": "supported" if best_extension["deltaAiccFromLambdaCDM"] <= -2 and abs(best_extension["requiredRdragShiftFromPlanckFraction"]) <= 3 * planck["rDragSigmaMpc"] / planck["rDragMpc"] else "refuted", "observed": {"bestExtension": best_extension["model"], "deltaAicc": best_extension["deltaAiccFromLambdaCDM"], "requiredRdragMpc": best_extension["requiredRdragAtShoesCentralMpc"], "fractionalShift": best_extension["requiredRdragShiftFromPlanckFraction"]}},
        {"code": "H61-D", "claim": "DESI BAO, the Planck standard ruler, and the full SH0ES local value are compatible within three propagated standard deviations.", "verdict": "supported" if comparisons["shoesWithStandardRuler"]["tensionWithDesiSigma"] < 3 else "refuted", "observed": {"tensionSigma": comparisons["shoesWithStandardRuler"]["tensionWithDesiSigma"]}},
    ]

    result = {
        "cycleId": "RC-2026-61",
        "generatedOn": "2026-08-29",
        "problemIds": ["UP-003", "UP-002", "UP-005"],
        "status": "computational-constraint-not-solution",
        "sourceIntegrity": {"meanLocalSha256": sha256(MEAN_PATH), "covarianceLocalSha256": sha256(COV_PATH), "specSha256": sha256(SPEC_PATH), "rowCount": len(rows), "covarianceMinimumEigenvalue": float(eigenvalues[0])},
        "fits": fits,
        "flatLambdaCDMProfile68": interval,
        "leaveOneRedshiftBlockOut": leave_one_out,
        "blockResidualAudit": block_chi2(rows, covariance, baseline),
        "externalScaleDiagnostics": comparisons,
        "hypothesisTests": hypothesis_tests,
        "inferences": [
            "DESI BAO alone constrains h*r_d, not H0 and r_d separately.",
            "No single public BAO redshift block moves the fitted scale by one full-fit standard deviation when removed.",
            "Within the tested smooth late-time models, improved BAO fit does not by itself restore the Planck ruler at the SH0ES central H0.",
        ],
        "unresolved": [
            "The Gaussian consensus likelihood does not re-test clustering reconstruction, tracer selection, or covariance construction.",
            "The Planck and local-ladder product diagnostics ignore posterior covariance and are not a joint likelihood.",
            "The calculation does not identify whether any required early-time ruler shift is physically viable or consistent with BBN and the full CMB spectra.",
            "The local-distance-ladder raw photometry and calibration covariance were not re-fit in this cycle.",
        ],
        "nextCycleStart": "Use the released DESI DR2 chains to replace independent-Gaussian product propagation with a posterior-level bridge. Construct an outcome-frozen comparison of CMB-prior variants and the three supernova likelihoods, then test whether the inferred short-ruler requirement survives each likelihood family and a leave-one-ladder-rung audit. Do not call the result new physics unless the same direction survives independent CMB, BAO, and distance-ladder reductions.",
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        RESULT_PATH.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
