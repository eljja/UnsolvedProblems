/* RC-2026-08: finite-sample rescue inference and noisy hybrid boundary search. */
(function () {
  "use strict";
  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    clopper_pearson_1934: {
      discipline: "mathematics",
      title: "The use of confidence or fiducial limits illustrated in the case of the binomial",
      url: "https://doi.org/10.1093/biomet/26.4.404",
      evidenceLabel: "동료심사 정확 이항구간 원 논문",
      evidenceLabelEn: "Peer-reviewed original exact-binomial interval paper",
      publishedOn: "1934-12-01",
      resultPeriod: "Biometrika 26권 4호 · 1934년 12월",
      resultPeriodEn: "Biometrika volume 26 issue 4; December 1934",
      reviewedOn: REVIEWED_ON
    },
    imbens_manski_2004: {
      discipline: "mathematics",
      title: "Confidence Intervals for Partially Identified Parameters",
      url: "https://doi.org/10.1111/j.1468-0262.2004.00555.x",
      evidenceLabel: "동료심사 부분식별 신뢰구간 연구",
      evidenceLabelEn: "Peer-reviewed confidence-interval study for partial identification",
      publishedOn: "2004-10-08",
      resultPeriod: "Econometrica 72권 6호 · 2004년",
      resultPeriodEn: "Econometrica volume 72 issue 6; 2004",
      reviewedOn: REVIEWED_ON
    },
    wang_multinomial_2008: {
      discipline: "mathematics",
      title: "Exact confidence coefficients of simultaneous confidence intervals for multinomial proportions",
      url: "https://doi.org/10.1016/j.jmva.2007.05.003",
      evidenceLabel: "동료심사 유한표본 다항 동시구간 연구",
      evidenceLabelEn: "Peer-reviewed finite-sample multinomial simultaneous-interval study",
      publishedOn: "2008-05-01",
      resultPeriod: "Journal of Multivariate Analysis 99권 5호 · 2008년 5월",
      resultPeriodEn: "Journal of Multivariate Analysis volume 99 issue 5; May 2008",
      reviewedOn: REVIEWED_ON
    },
    pmlr_multi_change_2025: {
      discipline: "computer",
      title: "Fixed-Confidence Multiple Change Point Identification under Bandit Feedback",
      url: "https://proceedings.mlr.press/v267/lazzaro25a.html",
      evidenceLabel: "동료심사 잡음 다중 변화점 고정신뢰 연구",
      evidenceLabelEn: "Peer-reviewed fixed-confidence noisy multiple-change-point study",
      resultPeriod: "ICML 2025 논문 · PMLR 267권",
      resultPeriodEn: "ICML 2025 paper; PMLR volume 267",
      reviewedOn: REVIEWED_ON
    }
  });

  const finiteSources = ["clopper_pearson_1934", "wang_multinomial_2008", "imbens_manski_2004", "manski_missing_2005", "statcan_two_phase_2018"];
  const activeSources = ["pmlr_multi_change_2025", "pmlr_active_change_2019", "nature_arrows_2023", "github_arrows"];
  const records = {
    "UP-182": {
      role: pair("잡음과 복수 상경계 아래에서 탐색예산과 정밀화예산의 교환비를 판정하는 문제", "Problem adjudicating the exchange rate between exploration and refinement under noise and multiple phase boundaries"),
      updatedDefinition: pair("재료 공간의 경계를 빨리 좁히려면 이미 발견한 변화 주변을 반복 측정해야 하지만, 그러는 동안 다른 상영역은 비어 있다. 이번 시험은 16회 중 12회를 전역 탐색에 고정하고 4회만 국소 정밀화해, 균등16과 탐색8+정밀화8 사이의 실제 절충점을 잡음 있는 단일·이중 경계와 무변화 대조군에서 찾았다.", "Rapidly narrowing a materials boundary requires repeated measurements near an observed change, but those measurements leave other phase regions untested. This cycle fixed 12 of 16 runs to global exploration and allowed only four local refinements, testing whether that bridge policy occupies a useful tradeoff between uniform-16 and explore-8-refine-8 under noisy single boundaries, two-boundary pockets, and a no-change control."),
      knownBoundary: pair("가우스 잡음 σ=0.03, 점프 0.35에서 혼합정책의 단일경계 검출률은 100%, 평균 괄호폭은 0.002304였다. 균등16의 0.026667보다 정밀하지만 8+8의 0.000228보다는 거칠다. 최대 미시험 간격 0.036364도 두 기준선 0.026667과 0.057143 사이였다.", "With Gaussian noise sigma 0.03 and jump 0.35, the hybrid detected every single boundary and obtained mean bracket width 0.002304. It was sharper than uniform-16 at 0.026667 but coarser than 8+8 at 0.000228; its maximum untested gap 0.036364 also lay between the two baselines, 0.026667 and 0.057143."),
      bottleneck: pair("한 지표만 최적화하면 정밀화 정책은 경계오차에서, 균등정책은 전역 공백에서 항상 유리하다. 실제 병목은 점프의 수와 크기를 모르는 상태에서 국소화·복수경계 회수·오경보·최악 공백을 동시에 통제하는 고정신뢰 자원배분이다.", "Optimizing one metric makes refinement win boundary error and uniform sampling win global coverage by construction. The real bottleneck is fixed-confidence allocation that jointly controls localization, recovery of an unknown number of changes, false alarms, and the largest untested gap when jump count and magnitude are unknown."),
      minimumAdvance: pair("실제 재료계의 반복측정으로 잡음분포와 최소 의미 점프를 먼저 추정한 뒤, 같은 총비용에서 12+4와 고정신뢰 다중 변화점 정책을 봉인 2차원 조성 단면에 비교한다. 경계면 Hausdorff 오차와 미탐지 안전영역 부피를 함께 공개한다.", "Estimate the noise law and minimum meaningful jump from real replicate measurements, then compare 12+4 with a fixed-confidence multiple-change-point policy at equal total cost on a sealed two-dimensional composition slice. Report boundary-surface Hausdorff error together with the volume of the untested safety region."),
      decisiveTest: pair("점프 0개·1개·2개, 서로 다른 점프 크기와 이분산 잡음을 숨긴 세계를 외부 판정자가 만든다. 정책은 같은 비용으로 측정점을 선택하고, 사전 Pareto 지표 중 어느 정책에도 지배되지 않으며 각 안전관문을 통과해야 다음 단계로 간다.", "An external adjudicator hides worlds with zero, one, and two jumps, varied jump magnitudes, and heteroscedastic noise. Policies choose measurements at equal cost and advance only if they are not dominated on the preregistered Pareto metrics and pass every safety gate."),
      unresolved: pair("이번 양성 결과는 1차원, 독립 정규잡음, 고정 점프크기와 폭 0.08 상주머니에 한정된다. 고차원 경계면, 상관잡음, 히스테리시스와 측정점별 비용에서는 12+4가 비지배일 근거가 아직 없다.", "The positive result is limited to one dimension, independent Gaussian noise, a fixed jump, and phase pockets of width 0.08. It does not yet support Pareto non-dominance for high-dimensional surfaces, correlated noise, hysteresis, or location-dependent measurement cost."),
      hypotheses: [
        { code: "H1", claim: pair("12+4는 잡음 있는 단일·복수 경계에서 균등16에 Pareto 지배당하지 않는다.", "The 12+4 policy is not Pareto-dominated by uniform-16 under noisy single and multiple boundaries."), prediction: pair("경계폭을 줄이고 최대간격은 균등의 1.5배 이내이며 복수경계 검출과 오경보 관문을 통과한다.", "It narrows boundary brackets, keeps maximum gap within 1.5 times uniform, and passes multiple-boundary detection and false-alarm gates."), reject: pair("어느 봉인 관문이든 실패하거나 균등이 모든 지표에서 같거나 우월하면 기각한다. 이번 1차원 시험에서는 살아남았다.", "Reject if any sealed gate fails or uniform is equal or better on every metric; it survived this one-dimensional test.") },
        { code: "H2", claim: pair("8+8의 강한 정밀화가 잡음·복수경계에서도 보편적으로 가장 효율적이다.", "The aggressive 8+8 refinement policy remains universally most efficient under noise and multiple boundaries."), prediction: pair("가장 작은 경계폭과 함께 최악간격·복수경계 동시회수도 다른 정책보다 나쁘지 않다.", "Its smallest bracket is accompanied by no worse global gap or simultaneous multiple-boundary recovery."), reject: pair("최대간격 0.057143과 복수경계 동시회수 0.998519가 혼합·균등보다 나빠 보편우월성을 기각했다.", "Maximum gap 0.057143 and multiple-boundary localization 0.998519 were worse than hybrid or uniform, rejecting universal superiority.") },
        { code: "H3", claim: pair("정책 순위는 잡음보다 숨은 경계 수와 최소 점프크기에 더 민감하다.", "Policy ranking is more sensitive to hidden boundary count and minimum jump size than to noise alone."), prediction: pair("점프크기·경계 수를 교차한 후 Pareto 전선이 바뀌지만 같은 신호대잡음비의 반복에서는 안정된다.", "The Pareto frontier changes across jump magnitude and boundary count but remains stable across repetitions at matched signal-to-noise ratio."), reject: pair("이분산·상관잡음만으로 순위가 반복적으로 뒤집히면 구조보다 잡음모형을 우선 연구한다.", "If heteroscedastic or correlated noise alone repeatedly reverses ranking, prioritize the noise model over boundary structure.") }
      ],
      sourceIds: activeSources
    },
    "UP-185": {
      role: pair("실패 실험 복구자료에 선택편향과 유한표본오차를 동시에 표시하는 문제", "Problem reporting selection bias and finite-sample uncertainty together in rescued failed-experiment data"),
      updatedDefinition: pair("복구된 실패실험의 평균에는 두 종류의 불확실성이 있다. 어떤 실험이 복구에 응답했는지에 따른 Γ 식별폭은 표본을 무한히 늘려도 남고, 유한한 초대에서 성공응답·실패응답·무응답 수가 흔들리는 표본오차는 초대 수와 함께 줄어든다. 둘을 한 구간에 중첩하지 않으면 좁은 오차막대가 과도한 확신을 만든다.", "A rescued failure mean has two different uncertainties. The Gamma identification width caused by outcome-dependent rescue response remains even with infinitely many invitations, while sampling error in the counts of successful responders, failed responders, and nonresponders shrinks with invitation count. Unless both are propagated into one interval, a narrow sampling error bar creates false certainty."),
      knownBoundary: pair("세 범주 다항표를 정확 열거하고 두 응답범주에 97.5% Clopper–Pearson 구간을 적용해 가족 포함률을 최소 95%로 보장했다. 실제 2차 오즈 4에서 9개 세계의 포함률은 99.5258–99.7985%였지만, n=500 기대폭은 최초 Γ=1·4·16에서 0.110172·0.168658·0.158229였다.", "Exact enumeration of the three-cell multinomial table combined 97.5% Clopper-Pearson intervals for the two response cells, guaranteeing at least 95% family coverage. Under true second-stage odds 4, coverage across nine worlds was 99.5258-99.7985%, yet expected widths at n=500 were 0.110172, 0.168658, and 0.158229 for first-stage Gamma 1, 4, and 16."),
      bottleneck: pair("보수적 동시구간은 포함률을 지키지만 폭이 넓고, 초대 수 증가는 표본층만 줄인다. Γ=4를 외부 자료로 더 작게 제한하지 못하면 최초 Γ=4·16 세계는 500개 초대에서도 폭 0.12 관문을 통과하지 못한다.", "Conservative simultaneous intervals protect coverage but are wide, and more invitations shrink only the sampling layer. Unless external evidence tightens Gamma below 4, first-stage Gamma 4 and 16 worlds fail the 0.12 width gate even at 500 invitations."),
      minimumAdvance: pair("독립 중복시료가 있는 복구표본에서 성공·실패별 응답률의 동시구간으로 Γ 상한을 외부 추정한다. 개발표본과 분리된 중복시료에서 새 Γ 구간이 95% 포함률과 폭 0.12를 동시에 만족하는지 판정한다.", "Use rescue samples with independently adjudicated replicates to externally estimate an upper Gamma bound from simultaneous response-rate intervals by true success and failure. On replicates withheld from development, adjudicate whether the new Gamma interval jointly attains 95% coverage and width 0.12."),
      decisiveTest: pair("초대 100·250·500의 표본확대와 독립결과원 25·50·100개의 Γ 보정 두 축을 교차한다. 표본확대만으로 실패하고 독립결과원 축에서 폭이 줄면 구조적 식별 병목과 표본오차가 실제로 분리된다.", "Cross invitation counts 100, 250, and 500 with 25, 50, and 100 independent outcomes used to constrain Gamma. If invitation expansion alone fails while the independent-outcome axis narrows intervals, structural identification and sampling uncertainty have been empirically separated."),
      unresolved: pair("Clopper–Pearson–Bonferroni 결합은 유효하지만 보수적이며, 중복시료의 독립성과 Γ의 공변량·시간 불변성은 확인되지 않았다. 정확 다항 신뢰영역과 계층 Γ를 쓰면 폭은 줄 수 있지만 새 가정이 생긴다.", "The Clopper-Pearson-Bonferroni construction is valid but conservative, while replicate independence and invariance of Gamma across covariates and time remain unverified. Exact multinomial regions or hierarchical Gamma may narrow intervals but introduce new assumptions."),
      hypotheses: [
        { code: "H1", claim: pair("500개 초대면 Γ=4 선택편향이 있어도 폭 0.12를 모든 세계에서 만족한다.", "Five hundred invitations suffice for width 0.12 in every world despite Gamma-4 selection."), prediction: pair("세 최초 Γ 세계의 n=500 기대폭이 모두 0.12 이하다.", "All three first-stage Gamma worlds have expected width at most 0.12 at n=500."), reject: pair("Γ=4·16 세계의 폭 0.168658·0.158229로 기각됐다.", "Widths 0.168658 and 0.158229 in Gamma 4 and 16 worlds reject the claim.") },
        { code: "H2", claim: pair("정확 주변구간의 Bonferroni 결합은 Γ=4 참값을 최소 95% 포함한다.", "The Bonferroni combination of exact marginal intervals covers Gamma-4 truths with at least 95% probability."), prediction: pair("모든 9개 정확 열거에서 포함률이 0.95 이상이다.", "Coverage is at least 0.95 in all nine exact enumerations."), reject: pair("어느 세계든 0.95 아래이면 끝점 전파법을 폐기한다. 이번 최저 포함률은 0.995258이었다.", "Discard the endpoint propagation if any world falls below 0.95; the observed minimum was 0.995258.") },
        { code: "H3", claim: pair("독립 결과원으로 Γ를 제한하는 것이 초대 수만 늘리는 것보다 폭 감소 정보가치가 크다.", "Constraining Gamma with independent outcomes has greater width-reduction value than increasing invitations alone."), prediction: pair("같은 비용에서 외부 Γ 상한 축이 500개 초대 축보다 기대폭과 최악폭을 더 줄인다.", "At equal cost, the external-Gamma axis reduces expected and worst-case width more than the 500-invitation axis."), reject: pair("독립 결과원의 선택성·오류를 포함한 뒤 비용대응 폭 감소가 더 작으면 해당 자료원을 중단한다.", "Stop using that source if cost-matched width reduction is smaller after accounting for its selection and measurement errors.") }
      ],
      sourceIds: [...finiteSources, "fair_data_2016"]
    },
    "UP-629": {
      role: pair("부분식별 영역과 그 영역을 추정하는 표본오차를 혼동하지 않는 추론 문제", "Inference problem separating a partial-identification region from sampling uncertainty in estimating that region"),
      updatedDefinition: pair("MNAR 자료는 관측분포를 정확히 알아도 하나의 모집단 값이 아니라 Γ가 허용하는 값의 집합만 준다. 유한표본에서는 그 집합의 끝점도 불확실하다. 이번 계산은 응답 성공·실패의 동시구간을 Γ 사상에 통과시켜 ‘무엇이 식별되는가’와 ‘그 경계를 얼마나 정확히 추정했는가’를 한 구간에 보존했다.", "Even perfect knowledge of an MNAR observed distribution identifies a Gamma-indexed set rather than one population value. In finite samples, the endpoints of that set are uncertain as well. This cycle propagated simultaneous intervals for success and failure response cells through the Gamma map, preserving both what is identified and how accurately its boundary is estimated."),
      knownBoundary: pair("n=100에서 기대 모집단폭은 최초 Γ=1·4·16에 대해 0.165095·0.227177·0.221162였고 n=500에서 0.110172·0.168658·0.158229로 감소했다. 폭은 단조 감소했지만 두 어려운 세계는 관문을 넘지 못해 표본오차 감소와 점식별 회복이 다름을 보였다.", "Expected population widths at n=100 were 0.165095, 0.227177, and 0.221162 for first-stage Gamma 1, 4, and 16, falling at n=500 to 0.110172, 0.168658, and 0.158229. Width decreased monotonically, but the two harder worlds still failed the gate, separating sampling precision from recovery of point identification."),
      bottleneck: pair("식별폭과 표본폭을 하나의 숫자로만 보고하면 연구자는 더 큰 n이 어느 층을 줄였는지 알 수 없다. Γ 고정 하의 극한폭, 현재 표본층, Γ 불확실성 자체를 분해해 보고해야 다음 자원을 표본확대와 외부 판정 중 어디에 쓸지 결정할 수 있다.", "A single total width does not reveal which layer a larger sample reduced. Reporting the limiting width at fixed Gamma, the current sampling layer, and uncertainty about Gamma itself is necessary to allocate the next resource between more invitations and external adjudication."),
      minimumAdvance: pair("각 n에서 총 기대폭에서 무한표본 Γ 폭을 뺀 표본층을 비용곡선으로 만들고, 독립결과원 한 건이 Γ 상한을 줄이는 기대 정보이득과 비교한다. 다음 표본은 총폭 감소가 가장 큰 축에 배정한다.", "At each n, form a cost curve for the sampling layer by subtracting the infinite-sample Gamma width from total expected width, then compare it with the expected information gain from one independent outcome tightening Gamma. Allocate the next sample to the axis producing the largest total-width reduction."),
      decisiveTest: pair("봉인 외부 판정자료를 두 번 나눠 첫 절반으로 Γ 후보를 선택하고 둘째 절반으로 포함률을 측정한다. 같은 자료로 Γ를 맞추고 포함률을 주장하는 재사용은 허용하지 않는다.", "Split sealed external adjudication data: select the Gamma candidate on the first half and measure coverage on the second. Reusing the same outcomes both to tune Gamma and claim coverage is prohibited."),
      unresolved: pair("이번 포함률은 고정된 참 응답오즈 4에서 계산됐고 Γ 선택 불확실성은 포함하지 않는다. 공변량별 희소 범주, 반복 재접촉과 자료의존 Γ를 허용하면 동시 보장법을 다시 설계해야 한다.", "Coverage was computed at fixed true response odds 4 and excludes uncertainty from choosing Gamma. Sparse covariate strata, repeated recontact, or data-adaptive Gamma require a new simultaneous guarantee."),
      hypotheses: [
        { code: "H1", claim: pair("표본 수 증가만으로 Γ=4 부분식별폭을 사실상 제거할 수 있다.", "Sample-size growth alone can practically eliminate the Gamma-4 identification width."), prediction: pair("n=500에서 모든 세계가 폭 0.12를 통과하고 n 증가에 따라 0으로 향한다.", "Every world passes width 0.12 at n=500 and width trends toward zero."), reject: pair("두 세계가 관문을 실패했고 극한 Γ 폭이 양수이므로 기각됐다.", "Two worlds failed the gate and the limiting Gamma width is positive, rejecting the claim.") },
        { code: "H2", claim: pair("표본층과 식별층을 분리하면 다음 자료수집의 정보가치를 사전 계산할 수 있다.", "Separating sampling and identification layers permits prospective valuation of the next data collection."), prediction: pair("n 증가의 한계 폭 감소와 Γ 상한 감소의 폭 효과를 같은 모집단척도로 비교할 수 있다.", "Marginal width reduction from larger n and from tightening Gamma can be compared on the same population scale."), reject: pair("실제 외부자료에서 Γ가 불안정해 비용곡선 순위가 재현되지 않으면 의사결정 규칙을 중단한다.", "Stop the decision rule if Gamma instability prevents reproducing the cost-curve ranking on real external data.") },
        { code: "H3", claim: pair("보수적 동시구간의 초과 포함률은 폭 손실과 교환된다.", "Overcoverage of the conservative simultaneous interval trades directly against width."), prediction: pair("정확 다항영역은 95% 포함을 유지하면서 Bonferroni보다 기대폭을 줄인다.", "An exact multinomial region retains 95% coverage with smaller expected width than Bonferroni."), reject: pair("독립 구현에서 포함률이 깨지거나 계산비용 대비 폭 감소가 미미하면 Bonferroni 기준선을 유지한다.", "Retain the Bonferroni baseline if independent implementation loses coverage or width reduction is negligible relative to computation.") }
      ],
      sourceIds: finiteSources
    },
    "UP-430": {
      role: pair("추적손실이 있는 하위집단 치료효과에 유한표본과 MNAR 불확실성을 함께 전달하는 문제", "Problem propagating finite-sample and MNAR uncertainty into subgroup treatment effects with loss to follow-up"),
      updatedDefinition: pair("치료군과 대조군의 추적손실 환자를 재접촉해도 응답 성공이 실제 결과와 연관되면 하위집단 효과는 다시 선택된다. 환자 수가 적은 하위집단에서는 이 구조적 편향 위에 다항 표본오차가 더해지므로, 응답자 평균의 표준오차만으로 개인화 효과를 판정할 수 없다.", "Recontacting patients lost to follow-up does not remove selection if successful response depends on the true outcome. In small subgroups, multinomial sampling error is layered on top of this structural bias, so the standard error of the responder mean cannot adjudicate personalized effects."),
      knownBoundary: pair("합성 복구세계에서 500개 초대조차 Γ=4·16 최초 선택세계의 폭 0.12를 넘었다. 이는 환자자료 결과가 아니라 설계 경고다. 군별·하위집단별로 표본을 나누면 유효 n은 더 작아지므로 독립 행정결과원 없이 좁은 개인화효과 구간을 기대할 근거가 없다.", "Even 500 invitations exceeded width 0.12 in the synthetic first-stage Gamma 4 and 16 worlds. This is a design warning, not a patient-data result. Splitting by treatment and subgroup further reduces effective n, so narrow personalized-effect intervals are not justified without an independent administrative outcome source."),
      bottleneck: pair("평균 치료효과의 무작위배정은 치료 선택을 통제하지만 추적응답 선택은 통제하지 않는다. 치료군별 R₂ 선택오즈와 하위집단 표본오차를 동시에 제한할 외부 결과가 없으면 이질적 효과의 부호조차 바뀔 수 있다.", "Random treatment assignment controls treatment selection but not follow-up response selection. Without external outcomes constraining arm-specific R2 selection odds and subgroup sampling error, even the sign of heterogeneous effects may change."),
      minimumAdvance: pair("공개 임상시험에서 재접촉 기록과 독립 사망·입원 등록을 연결할 수 있는 한 연구를 선정한다. 치료군별 Γ 동시구간과 하위집단 효과 경계를 계산하고, 사전 봉인 등록결과에서 포함률과 효과부호 안정성을 판정한다.", "Select one public trial with recontact records linkable to an independent mortality or hospitalization registry. Compute arm-specific simultaneous Gamma intervals and subgroup-effect bounds, then adjudicate coverage and sign stability on preregistered registry outcomes."),
      decisiveTest: pair("개발자료에는 임상 응답만 쓰고 판정자료에는 독립 등록결과만 쓴다. 평균효과는 안정적이지만 하위집단 효과부호가 Γ 범위에서 바뀌면 개인화 주장을 중단하고 부분식별 결과만 보고한다.", "Use clinical responses only for development and independent registry outcomes only for adjudication. If the average effect is stable but a subgroup-effect sign changes across the supported Gamma range, stop the personalization claim and report only partial identification."),
      unresolved: pair("합성 이항결과를 생존시간·경쟁위험·반복측정에 그대로 옮길 수 없다. 등록자료도 누락·오분류될 수 있고 치료군에 따라 연결률이 다르면 독립 판정원이 새 선택을 만든다.", "The synthetic binary-outcome result does not transfer directly to survival time, competing risks, or repeated outcomes. Registries can also be incomplete or misclassified, and differential linkage by treatment arm creates another selection process."),
      hypotheses: [
        { code: "H1", claim: pair("무작위배정 임상시험의 재접촉 표본은 치료효과 추론에 자동으로 대표적이다.", "A recontact sample from a randomized trial is automatically representative for treatment-effect inference."), prediction: pair("치료군별 결과의존 응답을 허용해도 효과경계가 응답자 차이 주변에 좁게 남는다.", "Treatment-effect bounds remain narrow around the responder contrast even with arm-specific outcome-dependent response."), reject: pair("지원되는 Γ에서 효과부호가 바뀌거나 폭 관문을 넘으면 대표성 주장을 기각한다.", "Reject representativeness if the effect sign changes or the width gate fails over supported Gamma values.") },
        { code: "H2", claim: pair("독립 등록결과는 치료군별 재접촉 Γ를 유한하게 제한할 수 있다.", "Independent registry outcomes can finitely bound arm-specific recontact Gamma."), prediction: pair("봉인 연결표본에서 성공·실패별 응답률 하한이 양수이고 Γ 상한이 사전 최대값 아래다.", "In the sealed linked sample, response-rate lower bounds by true success and failure are positive and the Gamma upper bound is below the preregistered maximum."), reject: pair("연결 성공 자체가 결과·치료에 의존하거나 어느 셀 하한이 0이면 그 등록원을 판정에서 제외한다.", "Exclude the registry if linkage depends on outcome or treatment, or if any cell has a zero lower bound.") },
        { code: "H3", claim: pair("개인화효과 불확실성의 주 병목은 표본 수보다 추적선택이다.", "Follow-up selection, rather than sample size, is the main uncertainty bottleneck for personalization."), prediction: pair("비용대응 분석에서 추가 재접촉보다 독립 결과연결이 효과경계를 더 줄인다.", "At matched cost, independent outcome linkage shrinks treatment-effect bounds more than additional recontact."), reject: pair("실제 시험에서 하위집단 표본오차가 압도적이면 먼저 층화 축소나 다기관 표본확대를 선택한다.", "If subgroup sampling error dominates in the real trial, prioritize reduced stratification or multi-site expansion.") }
      ],
      sourceIds: [...finiteSources, "pubmed_double_sampling_2001", "jds_shadow_mnar_2024"]
    }
  };

  const floorConnection = {
    id: "CONN-FLOOR-001",
    problemIds: ["UP-182", "UP-185", "UP-629", "UP-430"],
    type: pair("자원 증가로 줄어드는 확률오차와 남는 구조적 바닥", "Sampling error that shrinks with resources versus a structural floor that remains"),
    strength: "exact-enumeration-and-sealed-benchmark",
    sharedBottleneck: pair("표본이나 실험 예산을 늘리면 우연오차와 국소 경계오차는 줄지만, 결과의존 누락의 Γ 폭과 탐색하지 않은 영역의 최대 공백은 별도의 구조 가정 없이는 사라지지 않는다.", "More sampling or experimental budget reduces chance error and local boundary error, but Gamma width from outcome-dependent missingness and the maximum unsearched gap do not disappear without additional structural information."),
    mapping: pair("복구 초대 수↔재료 측정 횟수, 다항 표본폭↔경계 괄호폭, Γ 식별바닥↔전역 미시험 간격, 독립 결과원↔공간충전 탐색예약이 대응한다.", "Rescue invitations map to materials measurements, multinomial sampling width to boundary bracket width, the Gamma identification floor to the global untested gap, and independent outcome adjudication to a reserved space-filling exploration quota."),
    transferableMethod: pair("총 불확실성을 자원에 따라 감소하는 층과 구조적으로 남는 층으로 분해하고, 다음 자원을 두 층 중 총 판정폭을 더 많이 줄이는 쪽에 배분한다. 두 층의 판정자료는 개발자료와 분리한다.", "Decompose total uncertainty into a resource-shrinking layer and a structural remainder, then allocate the next resource to whichever layer reduces adjudication width most. Keep adjudication data for both layers separate from development data."),
    evidence: pair("복구 n=100→500은 기대폭을 줄였지만 두 세계가 0.12를 실패했다. 혼합정책은 국소폭을 균등보다 11.6배 줄였지만 최대 미시험 간격은 1.36배 남아 두 지표가 함께 필요했다.", "Increasing rescue n from 100 to 500 reduced expected width but left two worlds above 0.12. The hybrid narrowed local brackets about 11.6-fold relative to uniform while retaining a 1.36-fold larger maximum gap, requiring both metrics."),
    validationStatus: pair("합성 다항 정확열거와 잡음 1차원 봉인시험에서 확인 · 실제 자료 이전 대기", "Verified by exact synthetic multinomial enumeration and a noisy one-dimensional sealed test; real-data transfer pending"),
    failureBoundary: pair("Γ가 외부에서 점식별되거나 재료 응답면의 전역 규칙성이 증명되면 구조적 바닥이 줄어든다. 반대로 시간가변 선택과 고차원 불연속에서는 단일 바닥값으로 충분하지 않다.", "The structural floor shrinks if Gamma is externally point-identified or global regularity of the materials response surface is proved. Conversely, time-varying selection and high-dimensional discontinuities cannot be summarized by one floor."),
    minimumTest: pair("동일 비용에서 표본·정밀화 한 단위와 독립판정·전역탐색 한 단위의 총 불확실성 감소를 교차 비교한다. 개발자료와 독립된 판정셋에서 순위가 재현돼야 연결을 유지한다.", "At equal cost, compare total-uncertainty reduction from one unit of sampling or refinement with one unit of independent adjudication or global exploration. Retain the connection only if the ranking reproduces on adjudication data independent of development."),
    sourceIds: ["imbens_manski_2004", "pmlr_multi_change_2025", "manski_missing_2005", "pmlr_active_change_2019"]
  };
  if (!connections.some(({ id }) => id === floorConnection.id)) connections.push(floorConnection);

  const cycle = {
    id: "RC-2026-08",
    title: "더 많은 표본은 어떤 불확실성을 줄이지 못하는가",
    titleEn: "Which uncertainty does a larger sample fail to remove?",
    status: "active",
    startedOn: REVIEWED_ON,
    reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records),
    connectionIds: ["CONN-FLOOR-001", "CONN-SECOND-001", "CONN-IDENT-001", "CONN-CAUSAL-001"],
    selectionReason: "직전 사이클이 남긴 두 미완성 판정을 직접 이어받았다. 복구 연구에는 유한표본 다항오차를 중첩해 100·250·500개 초대의 실제 포함률과 폭을 정확 열거했고, 재료 탐색에는 12+4 혼합정책을 추가해 잡음·다중경계·무변화 세계에서 국소 정밀도와 전역 공백의 Pareto 관계를 봉인했다.",
    selectionReasonEn: "This cycle directly completed the two adjudications left by RC-2026-07. It layered finite multinomial sampling error onto rescue sensitivity bounds and exactly enumerated coverage and width for 100, 250, and 500 invitations, while adding a 12+4 hybrid materials policy and sealing its Pareto relation between local precision and global coverage under noise, multiple boundaries, and no change.",
    verifiedFindings: [
      { text: "각 n에서 (n+1)(n+2)/2개 세 범주 다항표를 전부 열거했으며 확률질량 합계는 1이었다. 9개 세계의 동시구간 포함률은 0.995258–0.997985였다.", textEn: "Every one of (n+1)(n+2)/2 three-cell multinomial tables was enumerated at each n and probability mass summed to one. Simultaneous-interval coverage across nine worlds was 0.995258-0.997985.", sourceIds: ["clopper_pearson_1934", "wang_multinomial_2008"] },
      { text: "n=500 기대폭은 최초 Γ=1에서만 0.110172로 0.12 관문을 통과했고 Γ=4·16에서는 0.168658·0.158229로 실패했다. 표본확대는 Γ 식별바닥을 제거하지 못했다.", textEn: "At n=500, expected width passed the 0.12 gate only in first-stage Gamma 1 at 0.110172; Gamma 4 and 16 failed at 0.168658 and 0.158229. Sample expansion did not remove the Gamma identification floor.", sourceIds: ["imbens_manski_2004", "manski_missing_2005"] },
      { text: "혼합12+4는 31개 잡음 단일경계 6,200회에서 검출률 1, 평균 괄호폭 0.002304, 최대 미시험 간격 0.036364를 기록했다.", textEn: "Hybrid-12+4 recorded detection 1, mean bracket width 0.002304, and maximum untested gap 0.036364 over 6,200 noisy runs across 31 single boundaries.", sourceIds: ["pmlr_active_change_2019", "pmlr_multi_change_2025"] },
      { text: "27개 이중경계 상주머니 5,400회에서 혼합정책의 두 경계 동시 국소화율은 0.999630이었고, 무변화 200회 오경보율은 0.005였다.", textEn: "Across 5,400 runs on 27 two-boundary pockets, the hybrid localized both boundaries at rate 0.999630; its false-alarm rate over 200 no-change runs was 0.005.", sourceIds: ["pmlr_multi_change_2025"] },
      { text: "균등16·8+8·12+4는 각각 전역공백, 국소정밀도, 두 지표의 절충에서 우위를 가져 어느 전략도 다른 전략을 Pareto 지배하지 않았다.", textEn: "Uniform-16, 8+8, and 12+4 respectively favored global gap, local precision, and a bridge between them, so none Pareto-dominated another.", sourceIds: ["pmlr_multi_change_2025", "pmlr_active_change_2019"] }
    ],
    resultMatrix: {
      title: pair("유한표본·잡음 확장의 봉인 판정", "Sealed adjudication of finite samples and noise"),
      note: pair("복구 결과는 합성 이항세계의 정확 열거이며, 경계 결과는 1차원 가우스잡음 봉인 벤치마크다. 실제 재료나 환자 결과로 해석하지 않는다.", "Rescue results are exact enumerations in synthetic binary worlds; boundary results are a sealed one-dimensional Gaussian-noise benchmark. Neither is interpreted as a real materials or patient outcome."),
      columns: [pair("시험", "Test"), pair("조건", "Condition"), pair("주 결과", "Primary result"), pair("보조 결과", "Secondary result"), pair("판정", "Decision")],
      rows: [
        { label: pair("유한 복구", "Finite rescue"), values: ["n=100/250/500", pair("포함률 ≥0.995258", "Coverage ≥0.995258"), pair("확률질량=1", "Probability mass=1"), pair("포함 통과", "Coverage passes")] },
        { label: pair("폭 관문", "Width gate"), values: ["n=500, Γ₂=4", pair("0.1102/0.1687/0.1582", "0.1102/0.1687/0.1582"), "gate≤0.12", pair("1/3 통과", "1/3 pass")] },
        { label: pair("균등16", "Uniform-16"), values: ["σ=0.03", "bracket 0.026667", "gap 0.026667", pair("전역 기준", "Global baseline")] },
        { label: pair("능동8+8", "Active-8+8"), values: ["σ=0.03", "bracket 0.000228", "gap 0.057143", pair("국소 기준", "Local baseline")] },
        { label: pair("혼합12+4", "Hybrid-12+4"), values: ["σ=0.03", "bracket 0.002304", "gap 0.036364", pair("Pareto 비지배", "Pareto non-dominated")] },
        { label: pair("이중경계·무변화", "Two boundaries/no change"), values: ["12+4", pair("동시국소화 99.963%", "Both localized 99.963%"), pair("오경보 0.5%", "False alarm 0.5%"), pair("관문 통과", "Gates pass")] }
      ]
    },
    sharedProgram: {
      name: pair("축소 가능한 오차와 구조적 바닥 분리 프로그램", "Resource-shrinking error versus structural-floor program"),
      thesis: pair("더 많은 자료가 모든 불확실성을 줄이지는 않는다. 표본·정밀화로 줄어드는 층과 독립결과·전역탐색이 필요한 구조층을 따로 계량해야 한다.", "More data do not reduce every uncertainty. The layer reduced by sampling or refinement must be quantified separately from the structural layer requiring independent outcomes or global exploration."),
      design: pair("복구에서는 3개 최초 Γ 세계와 3개 n의 모든 다항표를 열거했다. 경계에서는 세 정책을 31개 단일경계, 27개 이중경계, 무변화 세계에서 각 200회 공통 잡음장으로 비교했다.", "For rescue, every multinomial table was enumerated across three first-stage Gamma worlds and three n values. For boundaries, three policies were compared with a common noise field over 31 single boundaries, 27 two-boundary worlds, and no change, with 200 replicates each."),
      adjudication: pair("동시구간 포함률·기대폭·확률질량과 경계 검출·동시국소화·오경보·최대공백을 독립 검증했다. 유리한 한 지표만으로 통과시키지 않았다.", "Independently verified simultaneous coverage, expected width, probability mass, boundary detection, joint localization, false alarms, and maximum gap. No policy passed on one favorable metric alone."),
      primaryMetrics: pair("정확 포함률, 기대 모집단폭, 폭 관문 확률, 단일·이중경계 국소화, 무변화 오경보, 최대 미시험 간격", "Exact coverage, expected population width, width-gate probability, single- and double-boundary localization, no-change false alarms, and maximum untested gap"),
      successRule: pair("복구는 포함률≥0.95와 기대폭≤0.12를 각각 판정한다. 혼합정책은 검출≥0.95, 오경보≤0.02, 최대간격≤균등의 1.5배이며 Pareto 지배당하지 않아야 한다.", "Rescue separately requires coverage at least 0.95 and expected width at most 0.12. The hybrid requires detection at least 0.95, false alarms at most 0.02, maximum gap no more than 1.5 times uniform, and no Pareto dominator."),
      stopRule: pair("포함률 통과를 폭 통과로 바꾸어 말하지 않는다. 1차원 합성 비지배를 새 알고리즘의 보편 우월성으로 부르지 않는다.", "Do not present passing coverage as passing width. Do not call one-dimensional synthetic non-dominance universal superiority of a new algorithm."),
      status: pair("정확 유한표본 열거·잡음 혼합정책 봉인 완료 · 실제 독립결과·고차원 이전 대기", "Exact finite-sample enumeration and noisy hybrid seal complete; real independent outcomes and high-dimensional transfer pending")
    },
    artifacts: [
      { title: pair("유한 복구 규격", "Finite-rescue specification"), description: pair("표본수, 다항범주, 동시신뢰수준, Γ와 폭·포함 관문을 고정한 규격", "Frozen sample sizes, multinomial cells, simultaneous confidence, Gamma, and width and coverage gates"), url: "research/two-phase/finite-spec.json", kind: "JSON" },
      { title: pair("유한 복구 정확열거 결과", "Finite-rescue exact-enumeration result"), description: pair("9개 세계의 전체 다항표 수, 확률질량, 포함률, 기대폭과 폭 관문 확률", "Table counts, probability mass, coverage, expected width, and width-gate probability in nine worlds"), url: "research/two-phase/finite-result.json", kind: "JSON" },
      { title: pair("잡음 혼합경계 규격", "Noisy hybrid-boundary specification"), description: pair("세 전략, 잡음장, 단일·이중경계·무변화 세계와 Pareto 관문을 고정한 규격", "Frozen strategies, noise field, single-, double-boundary and no-change worlds, and Pareto gates"), url: "research/active-boundary/hybrid-spec.json", kind: "JSON" },
      { title: pair("잡음 혼합경계 결과", "Noisy hybrid-boundary result"), description: pair("35,400회 실행의 국소화, 다중경계, 오경보, 전역공백과 지배관계", "Localization, multiple-boundary, false-alarm, global-gap, and dominance results over 35,400 runs"), url: "research/active-boundary/hybrid-result.json", kind: "JSON" },
      { title: pair("유한 복구 실행기", "Finite-rescue runner"), description: pair("다항표를 정확 열거하고 동시구간을 Γ 식별경계로 전달하는 재현 코드", "Reproducible runner exactly enumerating multinomial tables and propagating simultaneous intervals through Gamma bounds"), url: "scripts/run-two-phase-finite.mjs", kind: "JavaScript" },
      { title: pair("혼합경계 실행기", "Hybrid-boundary runner"), description: pair("공통 잡음장에서 균등·능동·혼합 정책을 비용대응 비교하는 재현 코드", "Reproducible runner comparing uniform, active, and hybrid policies at matched cost under a common noise field"), url: "scripts/run-active-boundary-hybrid.mjs", kind: "JavaScript" },
      { title: pair("유한표본·혼합정책 독립 검증", "Independent finite-sample and hybrid verification"), description: pair("열거 완전성, 확률질량, 포함률, 간격 해석값과 Pareto 판정을 별도로 검사하는 코드", "Independent checks of enumeration completeness, probability mass, coverage, analytic spacing, and Pareto adjudication"), url: "scripts/verify-finite-hybrid.mjs", kind: "JavaScript" }
    ],
    log: [
      pair("RC-2026-07이 명시한 100·250·500 초대 정확열거와 12+4 잡음 다중경계 시험을 그대로 수행했다.", "Executed the exact 100, 250, and 500 invitation enumeration and noisy multiple-boundary 12+4 test specified by RC-2026-07."),
      pair("유한표본 오차와 Γ 식별폭을 한 구간에 중첩하되 두 층을 해석에서 분리했다.", "Layered finite-sample error and Gamma identification width in one interval while keeping the layers distinct in interpretation."),
      pair("n=500에서도 두 세계가 폭 관문을 실패한 결과를 표본 부족으로만 돌리지 않고 구조적 실패로 보존했다.", "Preserved the failure of two worlds at n=500 as structural rather than attributing it only to sample shortage."),
      pair("혼합정책은 새 알고리즘으로 단정하지 않고 2025년 다중 변화점 연구와 구별되는 소규모 비용대응 대조정책으로 기록했다.", "Recorded the hybrid as a small cost-matched control distinct from, not a novelty claim over, the 2025 multiple-change-point work."),
      pair("단일경계 정밀도 외에 두 경계 동시회수, 무변화 오경보와 최대 공백을 같은 판정에 보존했다.", "Retained joint two-boundary recovery, no-change false alarms, and maximum gap alongside single-boundary precision."),
      pair("합성 결과를 실제 환자·재료 성과로 오인하지 않도록 적용 경계를 명시했다.", "Explicitly bounded transfer so synthetic results are not mistaken for real patient or materials outcomes.")
    ],
    nextCycle: pair("복구 쪽은 공개 2단계 비응답 자료에서 성공응답·실패응답·무응답 표를 재구성하고, 개발과 분리된 행정·중복결과로 Γ 상한을 외부 보정해 ‘초대 추가’와 ‘독립결과 추가’의 비용대응 폭 감소를 비교한다. 경계 쪽은 실제 반복측정 잡음으로 2차원 이분산·복수 경계 봉인을 만들고 12+4를 균등16 및 고정신뢰 다중 변화점 정책과 비교한다.", "For rescue, reconstruct success-response, failure-response, and nonresponse tables from a public two-phase nonresponse dataset, externally calibrate Gamma using administrative or replicate outcomes separated from development, and compare cost-matched width reduction from more invitations versus more independent outcomes. For boundaries, build a sealed two-dimensional heteroscedastic multiple-boundary benchmark from real replicate noise and compare 12+4 with uniform-16 and a fixed-confidence multiple-change-point policy."),
    sourceIds: [...finiteSources, ...activeSources, "pubmed_double_sampling_2001", "jds_shadow_mnar_2024"]
  };

  for (const problem of problems) {
    const record = records[problem.id];
    if (!record) continue;
    const historicalRecord = { cycleId: cycle.id, ...record, reviewedOn: REVIEWED_ON };
    problem.researchHistory = [...(problem.researchHistory || []), historicalRecord];
    problem.cycleResearch = historicalRecord;
    problem.sourceIds = [...new Set([...(problem.sourceIds || []), ...record.sourceIds])];
  }
  for (const problem of problems) problem.researchConnections = connections.filter(connection => connection.problemIds.includes(problem.id)).map(connection => connection.id);
  cycles.push(cycle);
  window.RESEARCH_CYCLES = cycles;
  window.RESEARCH_CONNECTIONS = connections;
  window.RESEARCH_CYCLE_META = {
    ...(window.RESEARCH_CYCLE_META || {}), reviewedOn: REVIEWED_ON, cycles: cycles.length,
    curatedProblems: problems.filter(problem => problem.researchHistory?.length).length,
    researchRecords: problems.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0),
    connections: connections.length,
    factSources: (window.RESEARCH_CYCLE_META?.factSources || 0) + 4
  };
})();
