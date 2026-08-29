#!/usr/bin/env python3
"""RC63: reproduce and stress-test the public SH0ES compact linear system.

The release contains numerical arrays but no machine-readable row or parameter
identities.  This script therefore separates exact anonymous influence from
named astrophysical interventions, which it deliberately refuses to infer.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from astropy.io import fits
from scipy.linalg import cho_factor, cho_solve, solve_triangular

ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
SPEC_PATH = REPRO / "rc63-shoes-release-audit-spec.json"
MANIFEST_PATH = REPRO / "rc63-shoes-release-manifest.json"
RESULT_PATH = REPRO / "rc63-shoes-release-audit-result.json"
SUFFICIENT_PATH = REPRO / "rc63-shoes-sufficient-statistics.json"


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest().upper()


def rounded(value, digits=12):
    if isinstance(value, (float, np.floating)):
        return round(float(value), digits)
    return value


def fit_summary(q: np.ndarray, covariance: np.ndarray) -> dict:
    h0 = float(10 ** (q[-1] / 5.0))
    derivative = math.log(10.0) * h0 / 5.0
    sigma_q = math.sqrt(max(0.0, float(covariance[-1, -1])))
    return {
        "qH0": rounded(q[-1]),
        "qH0Sigma": rounded(sigma_q),
        "H0": rounded(h0),
        "H0Sigma": rounded(derivative * sigma_q),
    }


def read_fits(path: Path):
    with fits.open(path, memmap=True) as hdul:
        array = np.asarray(hdul[0].data, dtype=np.float64)
        header = dict(hdul[0].header)
    return array, header


def signature_groups(design: np.ndarray) -> list[dict]:
    groups: dict[tuple[int, ...], list[int]] = {}
    for row_index, row in enumerate(design):
        signature = tuple(int(index + 1) for index in np.flatnonzero(np.abs(row) > 1e-12))
        groups.setdefault(signature, []).append(row_index)
    ordered = sorted(groups.items(), key=lambda item: (-len(item[1]), item[0]))
    return [
        {
            "id": f"SIG-{position:03d}",
            "columnsOneBased": list(signature),
            "rowsZeroBased": rows,
        }
        for position, (signature, rows) in enumerate(ordered, start=1)
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-dir", default=str(ROOT / ".cache" / "rc63-shoes"))
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    download_dir = Path(args.download_dir)
    by_role = {item["role"]: item for item in manifest["files"]}

    integrity = []
    for item in manifest["files"]:
        path = download_dir / item["filename"]
        observed = digest(path)
        integrity.append(
            {
                "path": item["path"],
                "bytes": path.stat().st_size,
                "expectedSha256": item["sha256"],
                "observedSha256": observed,
                "passed": observed == item["sha256"] and path.stat().st_size == item["bytes"],
            }
        )

    y, y_header = read_fits(download_dir / by_role["data-vector"]["filename"])
    released_l, l_header = read_fits(download_dir / by_role["design-matrix"]["filename"])
    covariance, c_header = read_fits(download_dir / by_role["covariance"]["filename"])
    design = released_l.T if released_l.shape[0] < released_l.shape[1] else released_l
    n, p = design.shape
    if y.shape != (n,) or covariance.shape != (n, n):
        raise ValueError(f"incompatible release shapes: y={y.shape}, L={released_l.shape}, C={covariance.shape}")

    symmetric_error = float(np.max(np.abs(covariance - covariance.T)))
    factor, lower = cho_factor(covariance, lower=True, check_finite=True)
    chol = np.tril(factor)
    whitened_design = solve_triangular(chol, design, lower=True, check_finite=False)
    whitened_y = solve_triangular(chol, y, lower=True, check_finite=False)
    q, _, rank, singular_values = np.linalg.lstsq(whitened_design, whitened_y, rcond=None)
    normal = whitened_design.T @ whitened_design
    normal_rhs = whitened_design.T @ whitened_y
    parameter_covariance = np.linalg.inv(normal)
    baseline = fit_summary(q, parameter_covariance)
    residual = y - design @ q
    chi2 = float(residual @ cho_solve((factor, lower), residual, check_finite=False))

    reference = np.loadtxt(download_dir / by_role["reference-solution"]["filename"], ndmin=2)
    reference_q = reference[:, 0]
    reference_sigma = reference[:, 1]
    fit_sigma = np.sqrt(np.diag(parameter_covariance))
    reference_parameter_difference = float(np.max(np.abs(q - reference_q)))
    reference_sigma_difference = float(np.max(np.abs(fit_sigma - reference_sigma)))

    # One factorisation supplies exact generalized deletion identities.  C^-1 is
    # retained only in memory; the public artifact contains derived sufficient
    # statistics rather than a duplicate 97 MB matrix.
    precision = cho_solve((factor, lower), np.eye(n), check_finite=False)
    precision_design = precision @ design
    precision_y = precision @ y
    precision_diag = np.diag(precision)
    inverse_normal = parameter_covariance

    v_all = precision_design @ inverse_normal
    projected = np.einsum("ij,ij->i", precision_design, v_all)
    denominators = precision_diag - projected
    numerators = precision_design @ q - precision_y
    identifiable_rows = denominators > np.maximum(1e-12, np.abs(precision_diag) * 1e-10)
    deletion_scale = np.full(n, np.nan, dtype=np.float64)
    deletion_scale[identifiable_rows] = numerators[identifiable_rows] / denominators[identifiable_rows]
    q_shifts = v_all * deletion_scale[:, None]
    deleted_q_h0 = q[-1] + q_shifts[:, -1]
    deleted_h0 = 10 ** (deleted_q_h0 / 5.0)
    h0_shift = deleted_h0 - baseline["H0"]
    h0_shift_sigma = h0_shift / baseline["H0Sigma"]
    generalized_leverage = projected / precision_diag

    finite_single_rows = np.flatnonzero(np.isfinite(h0_shift_sigma))
    single_order = finite_single_rows[np.argsort(np.abs(h0_shift_sigma[finite_single_rows]))[::-1]]
    single_rows = []
    for index in single_order[:25]:
        single_rows.append(
            {
                "rowZeroBased": int(index),
                "rowOneBased": int(index + 1),
                "columnsOneBased": [int(col + 1) for col in np.flatnonzero(np.abs(design[index]) > 1e-12)],
                "generalizedLeverage": rounded(generalized_leverage[index]),
                "deletedH0": rounded(deleted_h0[index]) if identifiable_rows[index] else None,
                "H0Shift": rounded(h0_shift[index]) if identifiable_rows[index] else None,
                "H0ShiftSigma": rounded(h0_shift_sigma[index]) if identifiable_rows[index] else None,
            }
        )

    exact_uncorrelated_constraints = []
    for index in range(n):
        off_diagonal_max = max(
            float(np.max(np.abs(covariance[index, :index]))) if index else 0.0,
            float(np.max(np.abs(covariance[index, index + 1 :]))) if index + 1 < n else 0.0,
        )
        if off_diagonal_max == 0.0:
            exact_uncorrelated_constraints.append(index)

    constraints = []
    for index in exact_uncorrelated_constraints:
        constraints.append(
            {
                "anonymousId": f"constraint-row-{index}",
                "rowZeroBased": index,
                "rowOneBased": index + 1,
                "columnsOneBased": [int(col + 1) for col in np.flatnonzero(np.abs(design[index]) > 1e-12)],
                "observedValue": rounded(y[index]),
                "standardDeviation": rounded(math.sqrt(covariance[index, index])),
                "maximumOffDiagonalCovariance": 0.0,
                "deletedH0": rounded(deleted_h0[index]) if identifiable_rows[index] else None,
                "H0Shift": rounded(h0_shift[index]) if identifiable_rows[index] else None,
                "H0ShiftSigma": rounded(h0_shift_sigma[index]) if identifiable_rows[index] else None,
                "namedAstrophysicalIdentity": None,
            }
        )

    groups = signature_groups(design)
    block_results = []
    for group in groups:
        rows = np.asarray(group.pop("rowsZeroBased"), dtype=np.int64)
        precision_ss = precision[np.ix_(rows, rows)]
        u = precision_design[rows, :].T
        reduced_normal = None
        try:
            correction_design = np.linalg.solve(precision_ss, u.T)
            correction_y = np.linalg.solve(precision_ss, precision_y[rows])
            reduced_normal = normal - u @ correction_design
            reduced_rhs = normal_rhs - u @ correction_y
            reduced_rank = int(np.linalg.matrix_rank(reduced_normal, tol=1e-8))
            if reduced_rank < p:
                raise np.linalg.LinAlgError("rank deficient")
            reduced_q = np.linalg.solve(reduced_normal, reduced_rhs)
            reduced_covariance = np.linalg.inv(reduced_normal)
            summary = fit_summary(reduced_q, reduced_covariance)
            shift = (summary["H0"] - baseline["H0"]) / baseline["H0Sigma"]
            result = {
                **group,
                "rowCount": int(len(rows)),
                "firstRowZeroBased": int(rows.min()),
                "lastRowZeroBased": int(rows.max()),
                "status": "identified",
                "deletedH0": summary["H0"],
                "deletedH0Sigma": summary["H0Sigma"],
                "H0ShiftSigma": rounded(shift),
                "reducedRank": reduced_rank,
            }
        except np.linalg.LinAlgError:
            result = {
                **group,
                "rowCount": int(len(rows)),
                "firstRowZeroBased": int(rows.min()),
                "lastRowZeroBased": int(rows.max()),
                "status": "not-identifiable-after-deletion",
                "deletedH0": None,
                "deletedH0Sigma": None,
                "H0ShiftSigma": None,
                "reducedRank": int(np.linalg.matrix_rank(reduced_normal, tol=1e-8)) if reduced_normal is not None else None,
            }
        block_results.append(result)

    identified_blocks = [item for item in block_results if item["status"] == "identified"]
    identified_blocks.sort(key=lambda item: abs(item["H0ShiftSigma"]), reverse=True)

    # FITS headers contain array dimensions and creation dates, not identities.
    semantic_header_tokens = {"ROWLABEL", "PARLABEL", "OBJECT", "HOST", "ANCHOR", "INSTRUME", "FILTER", "SYSTEM"}
    present_semantic_tokens = sorted(
        token for token in semantic_header_tokens if token in y_header or token in l_header or token in c_header
    )
    semantic_gate = {
        "rowLabelCoverage": 0.0,
        "parameterLabelCoverage": 0.0,
        "requiredRowLabelCoverage": spec["predeclaredTests"]["semanticIntervention"]["requiredRowLabelCoverage"],
        "requiredParameterLabelCoverage": spec["predeclaredTests"]["semanticIntervention"]["requiredParameterLabelCoverage"],
        "presentSemanticHeaderTokens": present_semantic_tokens,
        "currentBranchCoverage": {
            "Milky Way": "not-machine-mapped",
            "LMC": "not-machine-mapped",
            "NGC 4258": "not-machine-mapped",
            "SMC when claimed": "absent-release-predates-2024-SMC-result",
            "calibrator host": "not-machine-mapped",
            "photometric system": "not-machine-mapped",
            "HST versus JWST": "absent-release-predates-2024-2025-JWST-results",
        },
        "passed": False,
        "claimRefused": "Named leave-one-anchor, host, photometric-system, and HST-versus-JWST causal estimates",
    }

    baseline_gates = {
        "sourceIntegrity": all(item["passed"] for item in integrity),
        "covarianceSymmetric": symmetric_error <= 1e-12,
        "covariancePositiveDefinite": bool(np.min(np.diag(chol)) > 0),
        "designFullColumnRank": int(rank) == p,
        "publishedH0": abs(baseline["H0"] - spec["predeclaredTests"]["baseline"]["publishedH0"]) <= spec["predeclaredTests"]["baseline"]["maximumH0Difference"],
        "publishedH0Sigma": abs(baseline["H0Sigma"] - spec["predeclaredTests"]["baseline"]["publishedH0Sigma"]) <= spec["predeclaredTests"]["baseline"]["maximumH0SigmaDifference"],
        "referenceParameterVector": reference_parameter_difference <= spec["predeclaredTests"]["baseline"]["maximumReferenceParameterDifference"],
    }

    result = {
        "cycleId": spec["cycleId"],
        "reviewedOn": spec["frozenOn"],
        "sourceCommit": manifest["commit"],
        "status": "insufficient-release-for-named-causal-audit",
        "claimBoundary": spec["claimBoundary"],
        "integrity": integrity,
        "releaseShape": {"observations": n, "parameters": p, "releasedLShape": list(released_l.shape)},
        "headers": {
            "yDate": y_header.get("DATE"),
            "lDate": l_header.get("DATE"),
            "cDate": c_header.get("DATE"),
            "semanticTokens": present_semantic_tokens,
        },
        "numericalBaseline": {
            **baseline,
            "method": "covariance-whitened QR least squares",
            "rank": int(rank),
            "smallestWhitenedSingularValue": rounded(np.min(singular_values)),
            "normalConditionNumber": rounded(np.linalg.cond(normal), 6),
            "chi2": rounded(chi2),
            "degreesOfFreedom": int(n - p),
            "chi2PerDegreeOfFreedom": rounded(chi2 / (n - p)),
            "maximumCovarianceAsymmetry": rounded(symmetric_error),
            "maximumReferenceParameterDifference": rounded(reference_parameter_difference),
            "maximumReferenceSigmaDifference": rounded(reference_sigma_difference),
            "referenceFileRole": "The official README says lstsq_results constructs a broad initial prior; it is not a precision posterior reference vector.",
        },
        "predeclaredBaselineGates": baseline_gates,
        "semanticInterventionGate": semantic_gate,
        "anonymousSingleRowInfluence": {
            "method": "exact correlated Gaussian marginal deletion using the precision-matrix rank-one identity",
            "evaluatedRows": n,
            "identifiedAfterDeletion": int(np.sum(identifiable_rows)),
            "notIdentifiableAfterDeletion": int(np.sum(~identifiable_rows)),
            "notIdentifiableRowsZeroBased": [int(index) for index in np.flatnonzero(~identifiable_rows)],
            "maximumAbsoluteH0ShiftSigma": rounded(np.nanmax(np.abs(h0_shift_sigma))),
            "rowsAtOrAboveOneSigma": int(np.nansum(np.abs(h0_shift_sigma) >= 1.0)),
            "medianAbsoluteH0ShiftSigma": rounded(np.nanmedian(np.abs(h0_shift_sigma))),
            "maximumGeneralizedLeverage": rounded(np.max(generalized_leverage)),
            "topRows": single_rows,
        },
        "anonymousUncorrelatedConstraintRows": constraints,
        "anonymousDesignSignatureBlocks": {
            "method": "exact covariance-preserving deletion grouped only by identical nonzero design columns",
            "blockCount": len(block_results),
            "identifiedAfterDeletion": len(identified_blocks),
            "notIdentifiableAfterDeletion": len(block_results) - len(identified_blocks),
            "maximumAbsoluteH0ShiftSigma": rounded(max(abs(item["H0ShiftSigma"]) for item in identified_blocks)),
            "blocksAtOrAboveOneSigma": sum(abs(item["H0ShiftSigma"]) >= 1.0 for item in identified_blocks),
            "blocks": identified_blocks + [item for item in block_results if item["status"] != "identified"],
        },
        "adjudication": {
            "publishedBaselineReproduced": baseline_gates["publishedH0"] and baseline_gates["publishedH0Sigma"],
            "referencePriorVectorGatePassed": baseline_gates["referenceParameterVector"],
            "namedLocalAuditContractPassed": False,
            "decisionRule": "insufficientRelease",
            "reason": "The released numerical system reproduces H0, but it omits row identities, parameter identities, covariance ancestry, and the later SMC/JWST branches required for named interventions.",
        },
    }

    sufficient = {
        "cycleId": spec["cycleId"],
        "description": "Numerical sufficient statistics exported for an independent dependency-free normal-equation solve.",
        "normalMatrix": [[rounded(value, 15) for value in row] for row in normal],
        "normalRhs": [rounded(value, 15) for value in normal_rhs],
        "pythonParameters": [rounded(value, 15) for value in q],
        "pythonH0": baseline["H0"],
        "anonymousConstraints": [
            {
                "anonymousId": item["anonymousId"],
                "rowZeroBased": item["rowZeroBased"],
                "precisionDiagonal": rounded(precision_diag[item["rowZeroBased"]], 15),
                "precisionDesign": [rounded(value, 15) for value in precision_design[item["rowZeroBased"]]],
                "precisionY": rounded(precision_y[item["rowZeroBased"]], 15),
                "pythonDeletedH0": item["deletedH0"],
            }
            for item in constraints
        ],
    }

    if args.write:
        RESULT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SUFFICIENT_PATH.write_text(json.dumps(sufficient, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "cycleId": result["cycleId"],
        "baseline": result["numericalBaseline"],
        "gates": baseline_gates,
        "semanticGatePassed": False,
        "singleRowMaxSigma": result["anonymousSingleRowInfluence"]["maximumAbsoluteH0ShiftSigma"],
        "blockMaxSigma": result["anonymousDesignSignatureBlocks"]["maximumAbsoluteH0ShiftSigma"],
        "decision": result["adjudication"]["decisionRule"],
    }, indent=2))


if __name__ == "__main__":
    main()
