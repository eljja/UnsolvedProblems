/* RC-2026-72: support-first PSF rescue and single-use aperture adjudication. */
(function () {
  "use strict";
  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-09-01";
  const pair = (text, textEn) => ({ text, textEn });
  const hypothesis = (code, claim, claimEn, prediction, predictionEn, test, testEn, reject, rejectEn) => ({ code, claim: pair(claim, claimEn), prediction: pair(prediction, predictionEn), test: pair(test, testEn), reject: pair(reject, rejectEn) });
  const link = (code, title, titleEn, claim, claimEn, failure, failureEn) => ({ code, title: pair(title, titleEn), claim: pair(claim, claimEn), failure: pair(failure, failureEn) });
  const work = (code, title, titleEn, objective, objectiveEn, method, methodEn, deliverable, deliverableEn, gate, gateEn) => ({ code, title: pair(title, titleEn), objective: pair(objective, objectiveEn), method: pair(method, methodEn), deliverable: pair(deliverable, deliverableEn), gate: pair(gate, gateEn) });
  const uncertainty = (code, category, categoryEn, source, sourceEn, control, controlEn, threshold, thresholdEn) => ({ code, category: pair(category, categoryEn), source: pair(source, sourceEn), control: pair(control, controlEn), threshold: pair(threshold, thresholdEn) });
  const branch = (condition, conditionEn, action, actionEn, meaning, meaningEn) => ({ condition: pair(condition, conditionEn), action: pair(action, actionEn), meaning: pair(meaning, meaningEn) });
  const artifact = (title, titleEn, description, descriptionEn, url, kind = "JSON") => ({ title: pair(title, titleEn), description: pair(description, descriptionEn), url, kind });

  Object.assign(sources, {
    dolphot_catalog_culling_2026: {
      discipline: "physics", title: "DOLPHOT JWST — Culling the Catalog", url: "https://dolphot-jwst.readthedocs.io/en/latest/post-processing/catalogs.html",
      evidenceLabel: "F090W·F150W에서 type·SNR·sharpness·crowding·flag로 점광원 순도를 높이는 공식 기준",
      evidenceLabelEn: "Official type, SNR, sharpness, crowding, and flag criteria for higher-purity F090W/F150W point-source catalogues",
      resultPeriod: "공식 living documentation, 2026-09-01 검토", resultPeriodEn: "Official living documentation reviewed 2026-09-01", reviewedOn: REVIEWED_ON
    },
    nircam_psf_encircled_energy_2026: {
      discipline: "physics", title: "NIRCam Point Spread Functions", url: "https://jwst-docs.stsci.edu/jwst-near-infrared-camera/nircam-performance/nircam-point-spread-functions",
      evidenceLabel: "F090W 경험적 EE80 반경 0.157 arcsec와 단파장 0.031 arcsec pixel scale을 제시하는 STScI 문서",
      evidenceLabelEn: "STScI documentation reporting the 0.157-arcsec empirical F090W EE80 radius and 0.031-arcsec short-wave pixel scale",
      resultPeriod: "기기 문서 2026-09-01 검토", resultPeriodEn: "Instrument documentation reviewed 2026-09-01", reviewedOn: REVIEWED_ON
    },
    nircam_flux_calibration_2026: {
      discipline: "physics", title: "NIRCam Absolute Flux Calibration and Zeropoints", url: "https://jwst-docs.stsci.edu/jwst-near-infrared-camera/nircam-performance/nircam-absolute-flux-calibration-and-zeropoints",
      evidenceLabel: "CAL SCI의 MJy/sr 단위, PHOTMJSR의 DN/s 변환과 detector별 calibration 차이를 정의하는 STScI 문서",
      evidenceLabelEn: "STScI documentation defining CAL SCI MJy/sr units, PHOTMJSR conversion to DN/s, and detector-dependent calibration",
      resultPeriod: "2026년 3월 imaging calibration 갱신 포함; 2026-09-01 검토", resultPeriodEn: "Includes March 2026 imaging calibration update; reviewed 2026-09-01", reviewedOn: REVIEWED_ON
    },
    adaptive_holdout_dwork_2015: {
      discipline: "physics", title: "Generalization in Adaptive Data Analysis and Holdout Reuse", url: "https://proceedings.neurips.cc/paper_files/paper/2015/file/bad5f33780c42f2588878a9d07405083-Paper.pdf",
      evidenceLabel: "같은 holdout을 분석자 피드백에 따라 반복 사용하면 과적합될 수 있음을 정식화한 원논문",
      evidenceLabelEn: "Primary paper formalizing how analyst-adaptive reuse can overfit the holdout itself",
      resultPeriod: "NeurIPS 2015; 2026-09-01 재검토", resultPeriodEn: "NeurIPS 2015; rechecked 2026-09-01", reviewedOn: REVIEWED_ON
    }
  });

  const sourceIds = [
    "dolphot_catalog_culling_2026", "dolphot_output_quality_2026", "nircam_psf_encircled_energy_2026",
    "nircam_flux_calibration_2026", "adaptive_holdout_dwork_2015", "dolphot_jwst_crowded_photometry_2024",
    "nircam_psf_stpsf_2025", "shoes_perfect_host_2025"
  ];

  const records = {
    "UP-003": {
      role: pair("거리사다리의 측광 오차를 계산하기 전에, RC71에서 부족했던 PSF 보정별을 실제 외부예측 오차로 구제할 수 있는지 검증한다.", "Before propagating photometric error into the distance ladder, tests whether the PSF-calibration-star shortfall from RC71 can be rescued by actual out-of-sample flux accuracy."),
      focusedPage: true,
      centralQuestion: pair("NRCB2의 PSF 별이 100개보다 적다는 사실은 측광이 틀렸다는 뜻인가, 아니면 보수적인 대리 관문만 실패한 것인가? 답하려면 PSF 학습별을 다시 채점하지 말고 다른 별의 빛을 다른 원리로 재야 한다. 그러나 NGC 3447처럼 붐비는 장에서는 큰 조리개를 서로 겹치지 않게 놓을 별 자체가 없을 수 있고, 작은 조리개는 중심 위치와 PSF 날개에 지나치게 민감할 수 있다.", "Does having fewer than 100 PSF stars mean NRCB2 photometry is wrong, or only that a conservative proxy failed? Answering requires new stars and another measurement principle rather than scoring the PSF-training stars again. In a crowded field such as NGC 3447, however, there may be no spatial support for non-overlapping large apertures, while small apertures can be dominated by centering and PSF wings."),
      resolutionCriterion: pair("원래 100별 관문은 실패로 남는다. 별도의 구제는 먼저 EE80 조리개의 공간 support를 충족하고, 독립 측광계가 NRCB1에서 p90 절대잔차 0.03 mag 이하를 보인 뒤, NRCB2의 전체·셀 중앙잔차 0.01 mag, p90 0.03 mag, 셀 범위 0.02 mag를 모두 통과해야 한다. RC72는 앞 두 단계에서 실패했다.", "The original 100-star gate remains failed. A separate rescue must first establish spatial support for EE80 apertures, then qualify the independent adjudicator on NRCB1 at p90 absolute residual no greater than 0.03 mag, and only then pass NRCB2 detector and cell medians within 0.01 mag, p90 within 0.03 mag, and cell range within 0.02 mag. RC72 failed at the first two stages."),
      technicalAxes: [pair("포위에너지와 혼잡도가 정하는 독립 측광 support", "Independent-photometry support set by encircled energy and crowding"), pair("subpixel 중심·공간 PSF·배경이 작은 조리개에 주는 오차", "Small-aperture error from subpixel centering, spatial PSF, and background"), pair("검출기 진단과 Cepheid 거리 추론 사이의 중단선", "Stop boundary between detector diagnostics and Cepheid-distance inference")],
      updatedDefinition: pair("DOLPHOT 순도 기준과 PSF 학습별 제외를 적용한 뒤, F090W EE80 반경 5.1 px의 두 배인 10.2 px 안에 다른 별이 없는 후보를 셀별로 셌다. NRCB1의 가장 빈 셀은 4개였고 NRCB2는 네 셀 모두 0개여서 큰 조리개 검증은 residual을 계산하지 않고 끝났다. 6 px 고립·3 px core 후보는 셀당 8개를 고정할 수 있었지만, NRCB1 대조의 p90 절대잔차가 F090W 0.303, F150W 0.210 mag로 실패했다.", "After applying DOLPHOT purity cuts and excluding PSF-training stars, RC72 counted candidates without another source inside 10.2 px, twice the 5.1-px F090W EE80 radius. NRCB1's sparsest cell had four and all four NRCB2 cells had zero, so the large-aperture test ended without a residual. Six-pixel-isolated, three-pixel-core candidates supplied eight per cell, but the NRCB1 control failed with p90 absolute residuals of 0.303 mag in F090W and 0.210 mag in F150W."),
      knownBoundary: pair("NRCB2의 진단 중앙잔차 +0.302와 +0.165 mag는 보였지만, 대조군이 먼저 실패했으므로 검출기 bias로 해석할 수 없다. 큰 조리개 support 부족과 작은 조리개 판정계 실패만 확인됐으며 PSF 측광 자체, 인공별 회수, Cepheid flux, 성분 거리와 H₀는 판정하지 않았다.", "Diagnostic NRCB2 medians of +0.302 and +0.165 mag were observed, but a control that failed first makes them uninterpretable as detector bias. RC72 establishes only inadequate large-aperture support and failure of the small-aperture adjudicator; it does not adjudicate PSF photometry itself, artificial-star recovery, Cepheid flux, component distances, or H0."),
      bottleneck: pair("판정계가 자기 오차와 NRCB2 오차를 분리하지 못한다. 3 px core에 담기는 에너지 비율은 subpixel phase와 공간 PSF에 따라 변하고, annulus는 이 붐비는 장에서 이웃별 날개와 구조적 배경을 함께 센다.", "The adjudicator cannot separate its own error from NRCB2 error. The energy fraction inside a three-pixel core varies with subpixel phase and spatial PSF, while its annulus mixes neighboring wings and structured background in this crowded field."),
      minimumAdvance: pair("NGC 3447 결과를 더 만지지 않고 공개된 고립 NIRCam 보정별에서 WCS 중심, subpixel 적분, STPSF 또는 scene model을 leave-one-exposure-out으로 자격화한다. 대조 tail을 0.03 mag 아래로 줄이지 못해도 어떤 nuisance가 지배적인지 분리하면 진전이다.", "Without touching NGC 3447 outcomes again, qualify WCS centering, subpixel integration, and STPSF or a scene model on public isolated NIRCam calibration stars using leave-one-exposure-out validation. Even failure is progress if it isolates the dominant nuisance rather than merely reporting another large residual."),
      decisiveTest: pair("외부 보정장 안에서 detector 위치와 subpixel phase별 support를 먼저 고정하고, target-specific offset 없이 p90≤0.03 mag·셀 범위≤0.02 mag를 통과시킨다. 그 model을 한 번만 새 NGC 3447 타일로 옮겨 NRCB1 control이 다시 통과한 뒤에만 NRCB2 residual을 읽는다.", "Freeze support by detector position and subpixel phase in an external calibration field and require p90 no greater than 0.03 mag and cell range no greater than 0.02 mag without target-specific offsets. Transfer that model once to a fresh NGC 3447 tile and reveal NRCB2 residuals only after NRCB1 passes again."),
      causalChain: [
        link("P72-1", "PSF 크기가 검증 표본을 제한한다", "PSF size limits the validation sample", "EE80 두 배보다 가까운 별은 큰 조리개끼리 빛이 겹친다.", "Stars closer than twice EE80 have overlapping large apertures.", "고립별이 셀별로 없으면 residual을 계산해도 공간 대표성이 없다.", "Without isolated stars in every cell, a residual lacks spatial support."),
        link("P72-2", "작은 core는 독립 총광량이 아니다", "A small core is not an independent total flux", "3 px 적분은 별도의 코드지만 aperture fraction은 PSF와 중심에 의존한다.", "The three-pixel integration uses separate code, but its aperture fraction depends on PSF and centering.", "대조군 tail이 크면 NRCB2 차이를 판정할 수 없다.", "A large control tail prevents adjudicating an NRCB2 difference."),
        link("P72-3", "외부 보정장이 판정계를 먼저 시험한다", "An external field tests the adjudicator first", "고립된 보정별로 nuisance model을 고정해야 target data가 학습자료가 되지 않는다.", "Isolated calibration stars must freeze the nuisance model before target data can influence it.", "같은 NGC 3447 holdout을 다시 튜닝하면 독립성이 사라진다.", "Retuning on the same NGC 3447 holdout destroys independence."),
        link("P72-4", "거리 gate는 계속 닫힌다", "The distance gate remains closed", "측정연산자와 detector transport가 통과한 뒤에만 AST와 Cepheid를 연다.", "Open AST and Cepheids only after the measurement operator and detector transport pass.", "국소 진단을 H₀로 옮기면 효과경로가 식별되지 않는다.", "Transporting a local diagnostic to H0 leaves the effect path unidentified.")
      ],
      hypotheses: [
        hypothesis("H72-A", "EE80 조리개를 겹치지 않게 놓을 별이 셀마다 충분하다.", "Every cell has enough stars for non-overlapping EE80 apertures.", "두 detector 모든 셀에 8개 이상 존재한다.", "Every cell in both detectors contains at least eight.", "10.2 px 고립 후보를 residual 전에 센다.", "Count 10.2-px-isolated candidates before residuals.", "NRCB1 최소 4개, NRCB2 전 셀 0개로 기각됐다.", "Rejected with a NRCB1 minimum of four and zero in every NRCB2 cell."),
        hypothesis("H72-B", "NRCB1에서 한 filter offset만으로 core 측광이 안정된다.", "One per-filter offset stabilizes core photometry on NRCB1.", "두 filter p90 절대잔차가 0.03 mag 이하이다.", "Both filters have p90 absolute residual at most 0.03 mag.", "3 px core를 네 exposure에 독립 적분한다.", "Independently integrate a three-pixel core in four exposures.", "0.303·0.210 mag로 기각됐다.", "Rejected at 0.303 and 0.210 mag."),
        hypothesis("H72-C", "물리 PSF·중심·이웃항을 외부에서 고정하면 새 타일의 detector transport를 판정할 수 있다.", "A physics PSF with centering and neighbor terms frozen externally can adjudicate detector transport on a fresh tile.", "외부 control과 새 NRCB1 control이 먼저 통과한다.", "The external control and fresh NRCB1 control pass first.", "고립 보정장→새 타일 순서로 한 번씩 검증한다.", "Validate once in an isolated calibration field and then once on a fresh tile.", "아직 외부 dataset과 model을 봉인하지 않아 미검증이다.", "Unverified because the external dataset and model are not yet sealed.")
      ],
      workPackages: [
        work("CAL-W1", "외부 보정별 support", "External calibration-star support", "판정계를 target에서 분리한다.", "Separate the adjudicator from the target.", "detector 위치·filter·subpixel phase로 고립별을 층화한다.", "Stratify isolated stars by detector position, filter, and subpixel phase.", "hash가 있는 support manifest", "Hashed support manifest", "모든 층에 사전 최소 표본", "Preregistered minimum sample in every stratum"),
        work("CAL-W2", "측정연산자 분해", "Measurement-operator decomposition", "큰 tail의 원인을 분리한다.", "Separate the source of the large tail.", "고정 aperture, STPSF, neighbor-aware scene model을 같은 별에 비교한다.", "Compare fixed aperture, STPSF, and neighbor-aware scene models on the same stars.", "centering·PSF·background·neighbor 오차표", "Centering, PSF, background, and neighbor error table", "한 model이 외부 tail·공간 gate 통과", "One model passes external tail and spatial gates"),
        work("CAL-W3", "새 타일 단회 전이", "One-shot fresh-tile transport", "NRCB2를 독립자료에서 판정한다.", "Adjudicate NRCB2 on independent data.", "WCS로 disjoint 타일을 고르고 같은 model을 변경 없이 적용한다.", "Choose a disjoint tile by WCS and apply the unchanged model.", "control-first detector receipt", "Control-first detector receipt", "NRCB1 통과 뒤 NRCB2 모든 gate 통과", "NRCB2 passes every gate after NRCB1 passes")
      ],
      uncertaintyBudget: [
        uncertainty("U72-P1", "중심·undersampling", "Centering and undersampling", "1 px 규모 PSF에서 subpixel phase가 core fraction을 바꾼다.", "Subpixel phase changes core fraction for a roughly one-pixel PSF.", "외부 별을 phase bin으로 나눈다.", "Bin external stars by phase.", "bin별 중앙차와 tail 동시 통과", "Pass median and tail in every bin"),
        uncertainty("U72-P2", "공간 PSF", "Spatial PSF", "한 global offset이 NRCB1 셀 범위 0.19–0.20 mag를 남겼다.", "One global offset left a 0.19-0.20 mag NRCB1 cell range.", "STPSF 위치별 예측과 leave-one-exposure-out", "Position-specific STPSF with leave-one-exposure-out", "셀 범위≤0.02 mag", "Cell range at most 0.02 mag"),
        uncertainty("U72-P3", "혼잡·배경", "Crowding and background", "annulus가 이웃 PSF 날개와 galaxy 구조를 포함한다.", "The annulus contains neighbor PSF wings and galaxy structure.", "neighbor-aware scene fit과 blank-annulus 대조", "Neighbor-aware scene fit and blank-annulus control", "모형간 방향 합의", "Directional agreement across models"),
        uncertainty("U72-P4", "표본·이동", "Sampling and transport", "현 타일은 EE80 support가 없고 두 detector뿐이다.", "The current tile lacks EE80 support and covers only two detectors.", "새 타일과 detector별 조건부 보고", "Fresh tile and detector-conditional reporting", "지원 밖 추론 금지", "No inference outside support")
      ],
      decisionTree: [
        branch("외부 support가 비면", "If external support is empty", "새 residual을 열지 않고 자료획득으로 돌아간다.", "Return to data acquisition without opening a residual.", "판정 가능성부터 복구한다.", "Restore adjudicability first."),
        branch("외부 control이 실패하면", "If the external control fails", "첫 nuisance를 고치되 NGC 3447을 열지 않는다.", "Repair the first nuisance without opening NGC 3447.", "target 과적합을 막는다.", "Prevents target overfitting."),
        branch("새 NRCB1 control이 실패하면", "If fresh NRCB1 control fails", "새 타일을 폐기하고 NRCB2를 읽지 않는다.", "Retire the fresh tile without reading NRCB2.", "검출기 효과와 판정계 오류를 분리한다.", "Separates detector effects from adjudicator error."),
        branch("모든 측광 gate가 통과하면", "If all photometric gates pass", "원래 실패는 보존하고 NRCB3 계약을 새로 쓴다.", "Preserve the original failure and write a new NRCB3 contract.", "국소 증거만 다음 단계로 운반한다.", "Carries only local evidence forward.")
      ],
      unresolved: pair("외부에서 자격화된 PSF/scene model, 새 타일의 detector contrast, NRCB3·4, 인공별 recovery, Cepheid distance와 H₀ 효과는 모두 열려 있다.", "An externally qualified PSF/scene model, fresh-tile detector contrast, NRCB3-4, artificial-star recovery, Cepheid distance, and H0 effect all remain open."),
      sourceIds
    },

    "UP-625": {
      role: pair("source-domain 성능을 target-domain 성능으로 옮기기 전에, target support와 판정계의 control validity를 각각 확인하는 유한표본 transport 사례를 만든다.", "Builds a finite-sample transport case in which target support and control validity of the adjudicator are checked separately before source-domain performance is moved to a target domain."),
      focusedPage: true,
      centralQuestion: pair("NRCB1에서 만든 측광 보정이 NRCB2에서도 유효하다고 말하려면 별 수가 많기만 하면 되는가? 아니다. 같은 선택규칙 아래 target 셀에 비교 가능한 별이 있어야 하고, 그 전에 오차를 재는 도구가 source control에서 정확해야 한다. RC72는 support가 없는 경우와 판정계가 틀린 경우가 서로 다른 실패임을 수치로 분리했다.", "Is a large star count enough to transport a photometric calibration from NRCB1 to NRCB2? No. Comparable target stars must exist in every cell under the same rule, and the error-measuring instrument must first be accurate on a source control. RC72 numerically separates lack of support from failure of the adjudicator itself."),
      resolutionCriterion: pair("transport 주장은 target의 모든 고정 셀이 최소표본을 갖고, source control의 tail이 허용범위 안이며, 같은 고정 map이 target 중앙·tail·공간 gate를 통과할 때만 성립한다. support 실패는 효과 추정 금지이고 control 실패는 target 효과 해석 금지다.", "A transport claim requires minimum target support in every frozen cell, an acceptable source-control tail, and the same frozen mapping passing target median, tail, and spatial gates. Support failure forbids effect estimation; control failure forbids interpreting a target effect."),
      technicalAxes: [pair("source–target overlap과 셀별 유효표본", "Source-target overlap and cellwise effective sample"), pair("측정자 calibration error와 transport error 분해", "Decomposition of adjudicator calibration error and transport error"), pair("support 실패 뒤의 부분식별과 중단", "Partial identification and stopping after support failure")],
      updatedDefinition: pair("EE80 조건에서 NRCB2의 target support는 네 셀 모두 0이므로 총 29,382행은 transport 표본수가 아니다. 완화된 core 조건에서는 셀마다 14–31개 후보가 있어 8개씩 고정했지만, 유효 exposure를 3개 이상 유지한 별은 filter당 27개였고 한 F090W 셀은 5개로 minimum 6을 놓쳤다. 더 중요하게 source control tail이 먼저 실패해 target residual의 의미가 사라졌다.", "Under the EE80 rule NRCB2 target support is zero in every cell, so 29,382 catalogue rows are not a transport sample size. Under the bounded core rule each cell had 14-31 candidates and eight were frozen, but only 27 stars per filter retained at least three valid exposures and one F090W cell fell to five, below six. More importantly, the source-control tail failed first, removing the interpretation of target residuals."),
      knownBoundary: pair("RC72는 이 타일의 overlap과 실제 표본수를 정확히 셌지만 독립 반복, cluster-robust coverage 또는 다른 detector의 target risk를 추정하지 않았다. 2×2 cell은 공간 대표성을 강제하는 설계 장치이지 독립 동일분포 표본을 보장하지 않는다.", "RC72 exactly counts overlap and realized samples in this tile but does not estimate independent replication, cluster-robust coverage, or target risk on other detectors. The 2x2 cells enforce spatial coverage as a design device; they do not guarantee independent identically distributed samples."),
      bottleneck: pair("support와 loss를 한 숫자로 합치면 extrapolation과 measurement failure가 뒤섞인다. 현재의 첫 병목은 Q에 표본이 없다는 것이고, core 분기의 다음 병목은 loss estimator가 P에서도 안정적이지 않다는 것이다.", "Combining support and loss into one number confounds extrapolation with measurement failure. The first bottleneck is no sample under Q for the EE80 route; the next bottleneck in the core branch is that the loss estimator is unstable even under P."),
      minimumAdvance: pair("외부 보정장에 source·target 역할을 미리 나누고 detector 위치·phase별 support와 effective count를 고정한다. control loss와 target loss의 confidence interval을 별도로 보고 support 밖에서는 점추정 대신 '판정불가'를 반환한다.", "Preassign source and target roles in an external calibration field and freeze support and effective counts by detector position and phase. Report control-loss and target-loss intervals separately and return 'not adjudicable' rather than a point estimate outside support."),
      decisiveTest: pair("외부 보정별에서 leave-one-exposure-out loss를 만들고, support가 충분한 strata만 새 detector로 운반한다. target residual을 열기 전에 control p90·공간범위를 통과해야 하며, block bootstrap 또는 독립 exposure가 nominal gate의 안정성을 확인해야 한다.", "Build leave-one-exposure-out loss on external calibration stars and transport only strata with adequate support to a new detector. Control p90 and spatial range must pass before target residuals are revealed, with block bootstrap or independent exposures checking stability of the nominal gates."),
      causalChain: [
        link("T72-1", "support가 risk보다 먼저다", "Support precedes risk", "비교 가능한 target unit이 없으면 target loss를 식별할 수 없다.", "Without comparable target units, target loss is not identified.", "총 행 수를 overlap으로 읽으면 extrapolation을 숨긴다.", "Treating all rows as overlap hides extrapolation."),
        link("T72-2", "control이 loss 측정자를 자격화한다", "The control qualifies the loss measurer", "P에서 판정계가 불안정하면 Q-P 차이는 판정계와 domain shift의 합이다.", "If the adjudicator is unstable under P, the Q-P difference mixes adjudicator error and domain shift.", "control-first 순서를 어기면 target bias를 과대해석한다.", "Violating control-first order overinterprets target bias."),
        link("T72-3", "셀은 overlap 경계를 보인다", "Cells expose overlap boundaries", "전체 표본이 충분해도 한 공간 셀이 비면 그 영역은 외삽이다.", "Even with a large total sample, an empty spatial cell is extrapolation.", "셀 의존성을 무시하면 유효표본을 과대평가한다.", "Ignoring dependence between cells overstates effective sample size."),
        link("T72-4", "새 domain은 새 holdout을 쓴다", "A new domain uses a new holdout", "실패한 Q에 맞춰 map을 바꾸면 더 이상 동일 transport test가 아니다.", "Changing the map to fit a failed Q is no longer the same transport test.", "같은 target을 반복 사용하면 coverage가 무너진다.", "Repeated target reuse destroys coverage.")
      ],
      hypotheses: [
        hypothesis("H72-T1", "EE80 조건에서 detector 간 overlap이 충분하다.", "Detector overlap is adequate under EE80 isolation.", "두 detector의 모든 공간 cell이 각각 n≥8을 유지한다.", "Every spatial cell in both detectors retains at least eight eligible stars.", "residual 전에 support를 센다.", "Count support before residuals.", "NRCB2 전 셀 n=0으로 기각됐다.", "Rejected with n=0 in every NRCB2 cell."),
        hypothesis("H72-T2", "core loss estimator는 source에서 자격이 있다.", "The core loss estimator is qualified in the source domain.", "NRCB1 두 filter의 p90 절대잔차가 모두 0.03 mag 이하이다.", "NRCB1 has p90 absolute residual no greater than 0.03 mag in both filters.", "NRCB1만으로 filter offset과 tail을 계산한다.", "Compute filter offsets and tails using NRCB1 only.", "0.303·0.210 mag로 기각됐다.", "Rejected at 0.303 and 0.210 mag."),
        hypothesis("H72-T3", "support-first·control-first 순서는 다른 이동 문제에도 쓸 수 있다.", "Support-first and control-first ordering transfers to other domain-shift problems.", "외부 dataset에서 두 gate가 target failure를 선행 예측한다.", "The two gates predict target failure on an external dataset.", "새 dataset에 동일 state machine을 사전등록한다.", "Preregister the same state machine on a new dataset.", "아직 외부 반복이 없어 구조적 제안으로 남는다.", "Remains a structural proposal pending external replication.")
      ],
      workPackages: [
        work("TR-W1", "support ledger", "Support ledger", "외삽 영역을 효과 추정 전에 표시한다.", "Mark extrapolation before effect estimation.", "고정 cell·eligibility·hash로 P/Q count를 작성한다.", "Build P/Q counts from fixed cells, eligibility, and hashes.", "cell별 nominal·effective n", "Nominal and effective n by cell", "빈 cell에서 효과값을 내지 않음", "No effect value in an empty cell"),
        work("TR-W2", "loss-measurer qualification", "Loss-measurer qualification", "측정오차와 이동오차를 분리한다.", "Separate measurement and transport error.", "P control에서 leave-one-exposure-out tail을 먼저 판정한다.", "Adjudicate leave-one-exposure-out tails on P first.", "control calibration curve", "Control calibration curve", "tail·공간 gate 모두 통과", "Pass tail and spatial gates"),
        work("TR-W3", "target one-shot", "Target one-shot", "Q risk를 적응 없이 판정한다.", "Adjudicate Q risk without adaptation.", "P를 고정한 뒤 Q에 단회 적용하고 block uncertainty를 보고한다.", "Freeze P, apply once to Q, and report block uncertainty.", "conditional target-risk receipt", "Conditional target-risk receipt", "support 내부에서만 coverage 충족", "Coverage only within support")
      ],
      uncertaintyBudget: [
        uncertainty("U72-T1", "overlap", "Overlap", "EE80에서 target count가 0이다.", "Target count is zero under EE80.", "지원 밖 판정불가 상태", "Not-adjudicable state outside support", "빈 cell에 점추정 금지", "No point estimate in an empty cell"),
        uncertainty("U72-T2", "의존성", "Dependence", "별과 exposure가 PSF·배경을 공유한다.", "Stars and exposures share PSF and background.", "exposure/block 재표집", "Exposure/block resampling", "nominal n과 effective n 동시 보고", "Report nominal and effective n"),
        uncertainty("U72-T3", "loss 측정", "Loss measurement", "core 판정계가 source에서 실패했다.", "The core adjudicator failed in the source.", "외부 control 자격화", "External control qualification", "p90≤0.03 mag", "p90 at most 0.03 mag"),
        uncertainty("U72-T4", "domain 이동", "Domain transport", "두 타일은 다른 sky·detector 환경이다.", "The two tiles differ in sky and detector environment.", "조건부·cell별 효과", "Conditional cellwise effects", "지원 밖 일반화 금지", "No generalization outside support")
      ],
      decisionTree: [
        branch("Q support가 비면", "If Q support is empty", "risk 대신 support failure를 보고한다.", "Report support failure instead of risk.", "외삽을 수치정확도로 위장하지 않는다.", "Does not disguise extrapolation as precision."),
        branch("P control이 실패하면", "If the P control fails", "Q effect를 해석하지 않는다.", "Do not interpret a Q effect.", "loss-measurer error를 먼저 해결한다.", "Resolves loss-measurer error first."),
        branch("특정 cell만 실패하면", "If only one cell fails", "그 cell을 판정불가로 남기고 전체 pass를 금지한다.", "Leave that cell unadjudicated and forbid an overall pass.", "희소영역을 평균으로 숨기지 않는다.", "Prevents the mean from hiding a sparse region."),
        branch("P·Q가 모두 통과하면", "If both P and Q pass", "support 내부 조건부 risk만 보고한다.", "Report only support-conditional risk.", "population transport는 별도 증거가 필요하다.", "Population transport still needs separate evidence.")
      ],
      unresolved: pair("공간의존 아래 effective sample size, 외부 반복의 coverage, NRCB3·4로의 transport와 Cepheid 모집단 위험은 미해결이다.", "Effective sample size under spatial dependence, external-replication coverage, transport to NRCB3-4, and Cepheid-population risk remain unresolved."),
      sourceIds
    },

    "UP-626": {
      role: pair("실패를 본 뒤의 분석변경을 숨기지 않고 directed adaptation graph로 고정해, 어떤 결과도 실패한 관문을 소급 통과시키지 못하게 한다.", "Encodes post-failure analysis changes as a directed adaptation graph so no outcome can retroactively pass a failed gate."),
      focusedPage: true,
      centralQuestion: pair("한 검증이 실패한 뒤 더 직접적인 검증을 추가하는 것은 합리적이지만, 같은 결과를 보며 반경·별 선택·문턱을 바꾸면 언제부터 새 검증이 아니라 사후 맞춤이 되는가? RC72는 원래 실패, support-only 분기, 단회 pixel 분기, 폐기 상태를 서로 다른 node로 기록해 이 경계를 실행 가능한 규칙으로 만들었다.", "Adding a more direct test after a proxy fails can be reasonable, but changing radii, star selection, or thresholds while viewing the same outcome turns validation into post-hoc fitting. RC72 makes that boundary executable by separating the original failure, a support-only branch, a single-use pixel branch, and retired states into distinct nodes."),
      resolutionCriterion: pair("분석 graph와 각 node의 입력·성공·기각·중단 조건을 outcome 전에 hash로 고정하고, 첫 실패 node에서 해당 branch를 종료하며, 실패한 holdout을 다시 최적화하지 않아야 한다. 독립 구현이 같은 첫 divergence와 terminal state를 재현해야 한다.", "The analysis graph and each node's inputs, success, rejection, and stopping rules must be hashed before outcomes; the branch must stop at its first failed node; and a failed holdout must not be optimized again. An independent implementation must reproduce the same first divergence and terminal state."),
      technicalAxes: [pair("adaptive holdout leakage와 단회 outcome", "Adaptive-holdout leakage and single-use outcomes"), pair("first divergence·terminal state·non-retroactivity", "First divergence, terminal state, and non-retroactivity"), pair("negative result를 보존하는 연구계보", "Research lineage that preserves negative results")],
      updatedDefinition: pair("RC72 계약 전에 catalogue support 반경들을 탐색했다는 사실을 공개하고 CAL pixel만 단회 outcome으로 봉인했다. EE80 branch는 support node에서 끝나 residual을 열지 않았고, core branch는 NRCB1 control node에서 끝났다. 한 번의 기술실패는 DQ memmap 제약으로 output 전에 멈췄고 과학 규칙을 바꾸지 않은 in-memory load로만 재실행했다. 원래 PSF gate와 AST gate는 그대로다.", "RC72 discloses that catalogue support radii were explored before the contract and seals only CAL pixels as the single-use outcome. The EE80 branch ends at the support node without revealing a residual; the core branch ends at the NRCB1 control node. One technical run stopped before output because unsigned DQ data could not be memory-mapped and was rerun only with in-memory loading, without changing a scientific rule. The original PSF and AST gates remain unchanged."),
      knownBoundary: pair("이 DAG는 기록된 두 branch에서 사후변경을 막지만 모든 분석자 상호작용에 대한 형식적 reusable-holdout 보장을 주지 않는다. catalogue support는 이미 개발검사를 거쳤으므로 pristine holdout이라고 부르지 않았고, 새 아이디어는 새 외부자료와 새 계약이 필요하다.", "This DAG blocks post-outcome changes on the two recorded branches but does not provide a formal reusable-holdout guarantee for every analyst interaction. Catalogue support had already been development-inspected and is not called pristine; a new idea requires new external data and a new contract."),
      bottleneck: pair("부정적 결과를 본 뒤 어디까지가 구현수정이고 어디부터가 분석변경인지 분류해야 한다. memmap 방식 변경은 산술·표본·gate를 보존했지만, WCS origin·조리개 반경·cell offset을 바꾸는 재실행은 새 분석이므로 금지된다.", "The bottleneck is classifying what is an implementation repair versus an analysis change after a negative result. Changing memory loading preserved arithmetic, samples, and gates; rerunning with a different WCS origin, aperture radius, or cell offset would be a new analysis and is forbidden."),
      minimumAdvance: pair("다음 계약에는 허용 구현등가성, 금지 parameter 변경, outcome access log와 branch별 holdout retirement를 machine-readable하게 포함한다. 외부 보정장과 NGC 3447 target을 물리적으로 다른 dataset으로 나누면 적응 비용도 분리된다.", "The next contract should machine-encode allowed implementation equivalence, forbidden parameter changes, an outcome-access log, and branch-specific holdout retirement. Physically separating an external calibration field from the NGC 3447 target also separates adaptation cost."),
      decisiveTest: pair("동일 계약을 읽는 두 state engine이 support·control·target fixture에서 같은 first divergence와 terminal state를 내는지 mutation test한다. 결과 후 반경·threshold·offset을 바꾸는 fixture는 반드시 retired-holdout 오류를 내야 한다.", "Mutation-test two state engines reading the same contract on support, control, and target fixtures. Any fixture that changes a radius, threshold, or offset after an outcome must raise a retired-holdout error and produce the same first divergence and terminal state."),
      causalChain: [
        link("S72-1", "탐색 이력을 숨기지 않는다", "Do not hide exploratory history", "catalogue support를 미리 봤다는 사실이 holdout 강도를 정한다.", "Prior catalogue-support inspection determines the strength of the holdout claim.", "탐색을 pristine이라고 부르면 독립성을 과장한다.", "Calling exploration pristine overstates independence."),
        link("S72-2", "계약 hash가 outcome보다 앞선다", "Contract hashes precede outcomes", "CAL pixel을 열기 전에 표본·산술·gate를 고정한다.", "Freeze samples, arithmetic, and gates before opening CAL pixels.", "hash 불일치면 outcome을 열 수 없다.", "A hash mismatch forbids outcome access."),
        link("S72-3", "첫 실패가 branch를 끝낸다", "First failure ends the branch", "EE80 support와 core control은 서로 다른 terminal reason이다.", "EE80 support and core control are distinct terminal reasons.", "뒤 metric이 좋아도 앞 실패를 뒤집을 수 없다.", "A later favorable metric cannot reverse an earlier failure."),
        link("S72-4", "다음 아이디어는 새 자료를 쓴다", "The next idea uses new data", "외부 보정장과 새 타일이 적응된 model의 독립시험을 맡는다.", "An external calibration field and fresh tile independently test the adapted model.", "같은 holdout 재사용은 selection bias를 누적한다.", "Reusing the same holdout accumulates selection bias.")
      ],
      hypotheses: [
        hypothesis("H72-S1", "branch별 first-divergence를 outcome 전에 고정할 수 있다.", "First divergence can be frozen by branch before outcomes.", "EE80는 support, core는 최초 실패 gate에서 멈춘다.", "EE80 stops at support and core stops at its earliest failed gate.", "계약과 DAG를 hash한 뒤 실행한다.", "Hash the contract and DAG before execution.", "두 구현이 같은 terminal state를 재현해 지지됐다.", "Supported because both implementations reproduce the same terminal state independently."),
        hypothesis("H72-S2", "작은-core outcome을 본 뒤에도 같은 holdout을 안전하게 재설계할 수 있다.", "The same holdout can be safely redesigned after seeing the core outcome.", "변경된 반경·offset도 독립검증으로 간주된다.", "Changed radii or offsets remain independent validation.", "adaptive holdout 원리와 계약을 대조한다.", "Compare against adaptive-holdout principles and the contract.", "기각: holdout은 폐기되고 새 자료가 필요하다.", "Rejected: the holdout is retired and new data are required."),
        hypothesis("H72-S3", "구현오류 수정과 분석변경을 provenance로 분리할 수 있다.", "Provenance can distinguish implementation repair from analysis change.", "DQ load 방식만 바꾼 재실행은 같은 표본·산술·gate를 보존한다.", "A rerun changing only DQ loading preserves samples, arithmetic, and gates.", "script diff와 output 부재를 감사한다.", "Audit the script diff and absence of a prior output.", "RC72 기술실패에서 확인됐으나 일반 규칙은 더 많은 mutation test가 필요하다.", "Verified for the RC72 technical failure; a general rule needs more mutation tests.")
      ],
      workPackages: [
        work("SEL-W1", "machine-readable adaptation DAG", "Machine-readable adaptation DAG", "모든 분기와 terminal state를 고정한다.", "Freeze every branch and terminal state.", "입력 hash·허용변경·금지변경·첫실패 순서를 schema화한다.", "Schema inputs, allowed and forbidden changes, and first-failure order.", "versioned DAG와 receipt", "Versioned DAG and receipt", "두 engine이 같은 state", "Two engines produce the same state"),
        work("SEL-W2", "outcome access ledger", "Outcome-access ledger", "언제 어떤 정보가 열렸는지 남긴다.", "Record when each information layer was opened.", "support·pixel·target access를 별도 event로 append한다.", "Append support, pixel, and target access as separate events.", "누락·역순 event 0", "No missing or out-of-order event"),
        work("SEL-W3", "mutation rejection", "Mutation rejection", "사후 맞춤을 자동 차단한다.", "Automatically block post-outcome fitting.", "반경·threshold·offset·hash 변이를 생성해 retired 오류를 요구한다.", "Generate radius, threshold, offset, and hash mutations and require retired errors.", "금지 mutation 100% reject", "Reject every forbidden mutation")
      ],
      uncertaintyBudget: [
        uncertainty("U72-S1", "정보누출", "Information leakage", "support count는 계약 전 탐색됐다.", "Support counts were explored before the contract.", "CAL outcome만 single-use로 한정하고 공개", "Limit single-use claim to CAL outcomes and disclose", "pristine 표현 금지", "No pristine-holdout claim"),
        uncertainty("U72-S2", "구현등가성", "Implementation equivalence", "I/O 수정이 계산을 바꿀 수 있다.", "An I/O repair can alter computation.", "diff·hash·독립 재계산", "Diff, hashes, and independent recomputation", "모든 row·gate 합의", "Agreement on every row and gate"),
        uncertainty("U72-S3", "반복사용", "Repeated use", "실패한 결과가 다음 아이디어에 영향을 준다.", "A failed result informs the next idea.", "새 외부자료·새 타일", "New external data and fresh tile", "동일 outcome 재개방 금지", "No reopening the same outcome"),
        uncertainty("U72-S4", "선택 경로", "Path selection", "여러 branch 중 좋은 것만 보고할 수 있다.", "Only favorable branches might be reported.", "실패·중단 branch 모두 보존", "Preserve failed and stopped branches", "terminal node 누락 0", "No omitted terminal node")
      ],
      decisionTree: [
        branch("계약 hash가 다르면", "If a contract hash differs", "outcome access를 거부한다.", "Deny outcome access.", "사전규칙 변경을 감지한다.", "Detects changed prospective rules."),
        branch("output 전 구현오류면", "If implementation fails before output", "과학 산술이 같은 최소 I/O 수정만 허용한다.", "Allow only a minimal I/O repair preserving scientific arithmetic.", "기술실패를 연구결과와 구분한다.", "Separates technical failure from research outcome."),
        branch("첫 과학 gate가 실패하면", "If the first scientific gate fails", "branch를 terminal로 만들고 holdout을 폐기한다.", "Make the branch terminal and retire its holdout.", "뒤 결과의 소급구제를 막는다.", "Prevents retroactive rescue by later results."),
        branch("새 접근이 필요하면", "If a new approach is needed", "새 dataset·계약·cycle에서 시작한다.", "Start with a new dataset, contract, and cycle.", "적응과 독립검증을 분리한다.", "Separates adaptation from independent validation.")
      ],
      unresolved: pair("모든 분석 상호작용을 포괄하는 형식적 disclosure budget, 공간의존 holdout의 통계보장과 외부 심사자 기반 outcome server는 아직 구현되지 않았다.", "A formal disclosure budget covering every analyst interaction, statistical guarantees for spatially dependent holdouts, and an external-reviewer outcome server remain unimplemented."),
      sourceIds
    }
  };

  const connection = {
    id: "CONN-EVIDENCE-042",
    type: pair("적응검증에서 support-first transport", "Support-first transport under adaptive validation"),
    strength: "strong-for-the-validation-structure",
    problemIds: ["UP-003", "UP-625", "UP-626"],
    sharedBottleneck: pair("Source에서 자격화한 측정규칙을 target으로 옮기려면 같은 eligibility 아래 target support가 있어야 하고, target 결과를 해석하기 전에 판정계 자체가 독립 control을 통과해야 한다. 실패 후 분석경로도 outcome 전에 고정돼야 한다.", "Transporting a source-qualified measurement rule to a target requires target support under the same eligibility and an independent control that qualifies the adjudicator before target interpretation. Post-failure analysis paths must also be frozen before outcomes."),
    mapping: pair("UP-003의 NRCB1→NRCB2·별·magnitude residual은 UP-625의 P→Q·support S(x)·target loss와, UP-626의 contract C·holdout transcript T·first gate G·retired state에 대응한다.", "UP-003's NRCB1-to-NRCB2 stars and magnitude residuals map to UP-625's P-to-Q support S(x) and target loss and to UP-626's contract C, holdout transcript T, first gate G, and retired state."),
    transferableMethod: pair("먼저 고정 eligibility로 cell별 support를 확인하고, 다음으로 source control에서 판정계를 자격화한 뒤, target loss를 단 한 번 연다. 각 적응은 first-divergence와 retired-holdout node를 가진 DAG로 기록한다.", "First enumerate cellwise support under fixed eligibility, then qualify the adjudicator on a source control, and reveal target loss once. Record every adaptation in a DAG with first-divergence and retired-holdout nodes."),
    minimumTest: pair("공개 고립 NIRCam 보정장에서 detector 위치·subpixel phase별 support를 봉인하고 외부 control tail≤0.03 mag·공간범위≤0.02 mag를 요구한다. 통과한 model만 새 NGC 3447 타일에 단회 적용해 두 gate가 target validity를 예측하는지 본다.", "Seal support by detector position and subpixel phase in a public isolated-star NIRCam field and require external-control tail at most 0.03 mag and spatial range at most 0.02 mag. Apply only a passing model once to a fresh NGC 3447 tile and test whether the two gates predict target validity."),
    failureBoundary: pair("공간의존이 cell count를 무효화하거나 source control이 target의 PSF·배경·혼잡을 덮지 못하면 연결은 약해진다. Target outcome이 selection이나 gate에 누출되거나 실패 proxy를 성공으로 바꾸면 연결은 깨진다.", "The connection weakens if spatial dependence invalidates cell counts or the source control does not cover target PSF, background, and crowding. It breaks if target outcomes leak into selection or gates or a failed proxy is relabeled as success."),
    evidence: pair("EE80 branch는 NRCB2 전 셀 support 0에서 멈췄고 core branch는 NRCB1 p90 0.303·0.210 mag에서 멈췄다. Python과 Node가 같은 first divergence와 모든 gate를 재현했으며 RC71 실패는 변하지 않았다.", "The EE80 branch stopped at zero support in every NRCB2 cell, and the core branch stopped at NRCB1 p90 values of 0.303 and 0.210 mag. Python and Node reproduce the same first divergence and every gate, while the RC71 failure remains unchanged."),
    validationStatus: pair("support enumeration·control-first order·non-retroactive termination·독립 수치판정은 이 두 타일에서 검증됐다. 외부 physics-PSF replacement와 population transport는 미검증이다.", "Support enumeration, control-first ordering, non-retroactive termination, and independent numerical adjudication are verified on these two tiles. An external physics-PSF replacement and population transport remain unverified."),
    reviewedOn: REVIEWED_ON,
    sourceIds
  };
  if (!connections.some(item => item.id === connection.id)) connections.push(connection);
  for (const problem of problems) problem.researchConnections = connections.filter(item => item.problemIds.includes(problem.id)).map(item => item.id);

  const cycle = {
    id: "RC-2026-72", status: "active", startedOn: REVIEWED_ON, reviewedOn: REVIEWED_ON,
    title: "잔차보다 support와 판정계를 먼저 시험했다",
    titleEn: "Support and the adjudicator were tested before target residuals",
    selectionReason: "RC71의 PSF 별 수 실패가 실제 측광오차인지 직접 시험할 수 있고, 같은 실행에서 유한표본 overlap과 실패 후 적응 규칙을 함께 반증할 수 있어 UP-003·625·626을 선택했다. Cyber-trust 계열은 계속 제외했다.",
    selectionReasonEn: "UP-003, UP-625, and UP-626 were selected because RC71's PSF-star-count failure could be tested against actual flux error while the same execution falsified finite-sample overlap and post-failure adaptation rules. Cyber-trust work remained excluded.",
    summary: pair("F090W EE80에 맞춘 10.2 px 비중첩 검증은 NRCB1 최소 셀 4개, NRCB2 전 셀 0개라 residual 전에 종료됐다. 3 px core 분기는 셀당 8개를 좌표 hash로 고정했으나 NRCB1 control p90이 F090W 0.303, F150W 0.210 mag여서 판정계부터 실패했다. NRCB2 진단값은 해석하지 않았고 Python·Node가 같은 첫 실패와 모든 gate를 재현했다. 이 holdout은 폐기됐고 원래 PSF·AST·거리 gate는 닫힌 채다.", "The 10.2-px non-overlap test motivated by F090W EE80 ended before residuals because NRCB1's minimum cell had four stars and every NRCB2 cell had zero. The three-pixel-core branch froze eight coordinate-hash stars per cell but failed at the adjudicator: NRCB1 control p90 was 0.303 mag in F090W and 0.210 mag in F150W. NRCB2 diagnostics were not interpreted, and Python and Node reproduced the same first failure and every gate. This holdout is retired while the original PSF, AST, and distance gates remain closed."),
    problemIds: Object.keys(records), connectionIds: [connection.id],
    verifiedFindings: [
      { text: "F090W 경험적 EE80 0.157 arcsec는 단파장 pixel에서 약 5.1 px이므로 비중첩 간격을 10.2 px로 고정했다.", textEn: "The empirical F090W EE80 radius of 0.157 arcsec is about 5.1 short-wave pixels, fixing non-overlap at 10.2 px.", sourceIds: ["nircam_psf_encircled_energy_2026"] },
      { text: "10.2 px 고립 조건에서 NRCB1은 49개지만 한 셀에 4개뿐이고 NRCB2는 네 셀 모두 0개였다.", textEn: "At 10.2-px isolation NRCB1 has 49 stars but only four in one cell, while NRCB2 has zero in every cell.", sourceIds: ["nircam_psf_encircled_energy_2026", "dolphot_catalog_culling_2026"] },
      { text: "EE80 residual은 support 실패 때문에 계산하지 않았다.", textEn: "No EE80 residual was computed because support failed.", sourceIds: ["adaptive_holdout_dwork_2015"] },
      { text: "6 px 고립 core 후보는 NRCB1 260개·NRCB2 91개였고 좌표 hash가 detector·cell별 8개를 고정했다.", textEn: "Six-pixel-isolated core candidates numbered 260 in NRCB1 and 91 in NRCB2; the coordinate hash froze eight per detector cell.", sourceIds: ["dolphot_catalog_culling_2026"] },
      { text: "16개 CAL hash가 MAST manifest와 일치했고 SCI/PHOTMJSR로 DN/s를 독립 적분했다.", textEn: "All sixteen CAL hashes match the MAST manifest, and SCI/PHOTMJSR was independently integrated into DN/s.", sourceIds: ["nircam_flux_calibration_2026"] },
      { text: "NRCB1 control p90 절대잔차는 F090W 0.302521·F150W 0.210339 mag로 0.03 gate를 실패했다.", textEn: "NRCB1 control p90 absolute residuals of 0.302521 and 0.210339 mag fail the 0.03-mag gate.", sourceIds: ["nircam_flux_calibration_2026", "dolphot_jwst_crowded_photometry_2024"] },
      { text: "NRCB1 셀 중앙값 범위 0.186440·0.204194 mag는 한 global core offset이 공간 PSF를 흡수하지 못함을 보였다.", textEn: "NRCB1 cell-median ranges of 0.186440 and 0.204194 mag show that one global core offset does not absorb spatial PSF variation.", sourceIds: ["nircam_psf_encircled_energy_2026"] },
      { text: "NRCB2 중앙잔차 +0.302432·+0.165408 mag는 control이 먼저 실패해 detector bias로 해석하지 않았다.", textEn: "NRCB2 medians of +0.302432 and +0.165408 mag were not interpreted as detector bias because the control failed first.", sourceIds: ["adaptive_holdout_dwork_2015"] },
      { text: "Node는 Python의 offset·measurement row·별 중앙값·filter summary·gate를 독립 재계산했다.", textEn: "Node independently recomputed Python offsets, measurement rows, star medians, filter summaries, and gates.", sourceIds: ["adaptive_holdout_dwork_2015"] },
      { text: "RC71 PSF count 실패와 NRCB3·4·AST·거리·H₀ 폐쇄는 변경되지 않았다.", textEn: "The RC71 PSF-count failure and NRCB3-4, AST, distance, and H0 closures are unchanged.", sourceIds: ["dolphot_output_quality_2026", "shoes_perfect_host_2025"] }
    ],
    resultMatrix: {
      title: pair("RC72 support-first 구제 판정", "RC72 support-first rescue adjudication"),
      note: pair("각 branch는 첫 실패에서 끝나며 뒤 진단값은 앞 실패를 취소하지 않는다.", "Each branch ends at its first failure; later diagnostic values cannot cancel it."),
      columns: [pair("판정", "Adjudicand"), pair("기준", "Criterion"), pair("결과", "Result"), pair("상태", "Status")],
      rows: [
        { label: "EE80 NRCB1 SUPPORT", values: ["≥8 / cell", "min 4", pair("실패", "fail")] },
        { label: "EE80 NRCB2 SUPPORT", values: ["≥8 / cell", "0,0,0,0", pair("실패", "fail")] },
        { label: "EE80 RESIDUAL", values: ["support first", "not computed", pair("중단", "stopped")] },
        { label: "CORE CATALOG SUPPORT", values: ["≥8 / cell", "NRCB1 260; NRCB2 91", pair("통과", "pass")] },
        { label: "HASHED HOLDOUT", values: ["8 / cell / detector", "32 + 32", pair("통과", "pass")] },
        { label: "NRCB1 F090W TAIL", values: ["p90≤0.03 mag", "0.302521", pair("실패", "fail")] },
        { label: "NRCB1 F150W TAIL", values: ["p90≤0.03 mag", "0.210339", pair("실패", "fail")] },
        { label: "NRCB2 MEDIANS", values: ["|median|≤0.01", "+0.302432 / +0.165408", pair("진단만", "diagnostic")] },
        { label: "INDEPENDENT DECISION", values: ["Python ↔ Node", "all rows and gates", pair("통과", "pass")] },
        { label: "ORIGINAL PSF GATE", values: ["immutable failure", "91–96 < 100", pair("실패 유지", "failure preserved")] },
        { label: "AST / DISTANCE", values: ["qualified operator first", "not opened", pair("폐쇄", "closed")] }
      ]
    },
    sharedProgram: {
      name: pair("Support-first, control-first validation", "Support-first, control-first validation"),
      thesis: pair("Target residual을 보기 전에 비교 가능한 target support와 판정계의 source-control 정확도를 차례로 확인하면 extrapolation, 측정오류와 선택오류를 분리할 수 있다.", "Checking comparable target support and source-control accuracy of the adjudicator before target residuals separates extrapolation, measurement error, and selection error."),
      design: pair("공식 eligibility→공간 cell support→좌표 hash→control-only calibration→target single-use→first-divergence terminal DAG", "Official eligibility to spatial-cell support, coordinate hash, control-only calibration, target single use, and a first-divergence terminal DAG"),
      adjudication: pair("EE80 branch는 support에서 끝나고 core branch는 NRCB1 control에서 끝났다. NRCB2 값은 보고하되 detector 효과로 판정하지 않는다.", "The EE80 branch ends at support and the core branch at the NRCB1 control. NRCB2 values are reported but not adjudicated as detector effects."),
      primaryMetrics: pair("cell support·valid exposure 수·control p90·target median·cell median·cell range·첫 실패 node", "Cell support, valid-exposure count, control p90, target median, cell medians, cell range, and first failed node"),
      successRule: pair("모든 support와 control gate가 먼저 통과하고 target median≤0.01 mag·p90≤0.03 mag·cell range≤0.02 mag이며 독립 engine이 합의", "All support and control gates pass first; target median is within 0.01 mag, p90 within 0.03 mag, cell range within 0.02 mag; and independent engines agree"),
      stopRule: pair("빈 support, control 실패, 결과 후 parameter 변경, holdout 재사용, 독립판정 불일치 또는 downstream outcome 접근에서 중단", "Stop on empty support, control failure, post-outcome parameter change, holdout reuse, independent-decision disagreement, or downstream-outcome access"),
      status: pair("EE80 support 실패 · core adjudicator 실패 · holdout 폐기 · 원래 PSF·AST·거리 gate 폐쇄", "EE80 support failed; core adjudicator failed; holdout retired; original PSF, AST, and distance gates closed")
    },
    artifacts: [
      artifact("PSF rescue contract", "PSF rescue contract", "pixel outcome 전에 고정한 eligibility·두 branch·threshold·금지변경", "Eligibility, two branches, thresholds, and forbidden changes frozen before pixel outcomes", "research/reproducibility/rc72-psf-rescue-contract.json"),
      artifact("Adaptation DAG", "Adaptation DAG", "불변 RC71 실패와 branch별 first-divergence·retired state", "Immutable RC71 failure with branchwise first-divergence and retired states", "research/reproducibility/rc72-adaptation-dag.json"),
      artifact("Support ledger", "Support ledger", "EE80·core 조건의 detector·cell별 후보 수", "Detector- and cell-level candidate counts under EE80 and core rules", "research/reproducibility/rc72-psf-holdout-support.json"),
      artifact("Core holdout manifest", "Core holdout manifest", "PSF 학습별을 제외한 64개 좌표-hash 후보와 exposure 측정열", "Sixty-four coordinate-hash candidates excluding PSF-training stars with exposure measurement columns", "research/reproducibility/rc72-core-holdout-manifest.json"),
      artifact("Preregistration receipt", "Preregistration receipt", "CAL pixel을 열기 전 contract·DAG·support·manifest hash", "Contract, DAG, support, and manifest hashes before CAL pixels were opened", "research/reproducibility/rc72-preregistration-receipt.json"),
      artifact("Aperture result", "Aperture result", "16 CAL hash·512 exposure 측정·별·cell·filter summary와 gate", "Sixteen CAL hashes, 512 exposure measurements, star/cell/filter summaries, and gates", "research/reproducibility/rc72-core-aperture-result.json"),
      artifact("Independent Node audit", "Independent Node audit", "Python summary를 믿지 않고 raw 측정행에서 판정을 재계산", "Decision recomputed from raw measurement rows without trusting Python summaries", "research/reproducibility/rc72-core-aperture-independent-audit.json"),
      artifact("Structural connection", "Structural connection", "측정·transport·post-selection을 support-first order로 연결", "Links measurement, transport, and post-selection through support-first ordering", "research/reproducibility/rc72-support-first-rescue-connection.json"),
      artifact("Source review", "Source review", "공식 문서·원논문과 사실·추론·제안·상금 경계", "Official documentation and primary sources with fact, inference, proposal, and prize boundaries", "research/reproducibility/rc72-source-review.json"),
      artifact("Prior-art boundary", "Prior-art boundary", "기존 방법과 RC72 검증 조합의 선행성 경계", "Prior-art boundary between established methods and the RC72 validation combination", "research/reproducibility/rc72-prior-art-boundary.json"),
      artifact("RC72 research record", "RC72 research record", "기각 가설·실패·불확실성과 정확한 다음 출발점", "Rejected hypotheses, failures, uncertainty, and exact next start", "research/reproducibility/rc72-psf-rescue-cycle-result.json")
    ],
    log: [
      pair("RC71 실패와 downstream 폐쇄를 불변 root로 고정했다.", "Fixed the RC71 failure and downstream closures as the immutable root."),
      pair("catalogue support 탐색 이력을 공개하고 CAL pixel만 single-use로 봉인했다.", "Disclosed catalogue-support exploration and sealed only CAL pixels as single-use."),
      pair("EE80 branch를 support 0에서 residual 없이 종료했다.", "Ended the EE80 branch at zero support without a residual."),
      pair("core 후보 64개와 두 filter gate를 hash로 고정했다.", "Hashed sixty-four core candidates and both filter gates."),
      pair("16개 원본 CAL을 검증하고 3 px core를 한 번 적분했다.", "Verified sixteen original CAL files and integrated the three-pixel core once."),
      pair("NRCB1 control tail에서 core branch를 실패로 종료했다.", "Ended the core branch as failed at the NRCB1 control tail."),
      pair("NRCB2 진단값을 detector effect나 correction으로 쓰지 않았다.", "Did not use NRCB2 diagnostics as a detector effect or correction."),
      pair("Node가 모든 수치결정과 첫 실패를 독립 재현했다.", "Node independently reproduced every numerical decision and first failure."),
      pair("두 negative branch와 기술실패를 보존하고 holdout을 폐기했다.", "Preserved both negative branches and the technical failure, then retired the holdout.")
    ],
    nextCycle: pair("RC72 holdout을 다시 쓰지 않는다. 공개된 고립 NIRCam 보정별 자료를 찾아 detector 위치·subpixel phase별 support, WCS 중심규칙, STPSF 또는 neighbor-aware scene model, leave-one-exposure-out residual과 같은 0.03-mag tail·0.02-mag 공간 gate를 새로 사전등록한다. 외부 control과 독립 구현이 먼저 통과한 뒤에만 WCS로 고른 disjoint NGC 3447 타일에 고정 model을 한 번 적용한다. 새 NRCB1 control이 통과하지 않으면 NRCB2를 열지 않는다. 모든 단계가 통과해도 RC71의 100별 실패는 그대로 두고 NRCB3는 별도 cycle과 원래 관문으로 시작한다.", "Do not reuse the RC72 holdout. Locate a public isolated-star NIRCam calibration dataset and preregister support by detector position and subpixel phase, WCS centering, STPSF or a neighbor-aware scene model, leave-one-exposure-out residuals, and the same 0.03-mag tail and 0.02-mag spatial gates. Only after the external control and an independent implementation pass may the frozen model be applied once to a WCS-selected disjoint NGC 3447 tile. Do not reveal NRCB2 unless the fresh NRCB1 control passes. Even if every stage succeeds, preserve the RC71 100-star failure and start NRCB3 in a separate cycle under the original gate."),
    sourceIds
  };

  for (const [problemId, record] of Object.entries(records)) {
    const problem = problems.find(item => item.id === problemId);
    if (!problem) continue;
    problem.researchHistory = problem.researchHistory || [];
    if (!problem.researchHistory.some(item => item.cycleId === cycle.id)) problem.researchHistory.push({ cycleId: cycle.id, ...record });
    problem.cycleResearch = problem.researchHistory.find(item => item.cycleId === cycle.id);
  }
  if (!cycles.some(item => item.id === cycle.id)) cycles.push(cycle);
  window.CATALOG_SOURCES = sources;
  window.RESEARCH_CONNECTIONS = connections;
  window.RESEARCH_CYCLES = cycles;
})();
