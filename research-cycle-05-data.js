/* RC-2026-05: partial identification under unknown MNAR and zero support. */
(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    manski_missing_2005: {
      discipline: "mathematics",
      title: "Partial identification with missing data: concepts and findings",
      url: "https://doi.org/10.1016/j.ijar.2004.10.006",
      evidenceLabel: "동료심사 결측 부분식별 연구",
      evidenceLabelEn: "Peer-reviewed missing-data partial-identification study",
      publishedOn: "2005-06-01",
      resultPeriod: "2005년 6월 출판 · 이론 연구",
      resultPeriodEn: "Published June 2005; theoretical study",
      reviewedOn: REVIEWED_ON
    },
    pmlr_overlap_2020: {
      discipline: "mathematics",
      title: "Characterization of Overlap in Observational Studies",
      url: "https://proceedings.mlr.press/v108/oberst20a.html",
      evidenceLabel: "동료심사 겹침 진단 연구",
      evidenceLabelEn: "Peer-reviewed overlap-diagnostic study",
      resultPeriod: "AISTATS 2020 논문 · 학회 2020년 8월 26–28일",
      resultPeriodEn: "AISTATS 2020 paper; conference held 26–28 August 2020",
      reviewedOn: REVIEWED_ON
    },
    pmlr_no_overlap_2024: {
      discipline: "mathematics",
      title: "Off-policy Evaluation Beyond Overlap: Sharp Partial Identification Under Smoothness",
      url: "https://proceedings.mlr.press/v235/khan24b.html",
      evidenceLabel: "동료심사 무겹침 부분식별 연구",
      evidenceLabelEn: "Peer-reviewed no-overlap partial-identification study",
      resultPeriod: "ICML 2024 논문 · 학회 2024년 7월 21–27일",
      resultPeriodEn: "ICML 2024 paper; conference held 21–27 July 2024",
      reviewedOn: REVIEWED_ON
    },
    pmlr_robust_ope_2025: {
      discipline: "computer",
      title: "Causal Eligibility Traces for Confounding Robust Off-Policy Evaluation",
      url: "https://proceedings.mlr.press/v286/zhang25d.html",
      evidenceLabel: "동료심사 교란·무겹침 값 경계 연구",
      evidenceLabelEn: "Peer-reviewed confounding and no-overlap value-bound study",
      resultPeriod: "UAI 2025 논문 · 학회 2025년 7월 21–25일",
      resultPeriodEn: "UAI 2025 paper; conference held 21–25 July 2025",
      reviewedOn: REVIEWED_ON
    }
  });

  const commonSources = ["manski_missing_2005", "pmlr_overlap_2020", "pmlr_no_overlap_2024", "pmlr_robust_ope_2025", "neurips_ope_interval_2020"];
  const records = {
    "UP-182": {
      role: pair("탐색 정책의 미관측 성과를 값 구간과 다음 실험으로 연결하는 문제", "Problem linking unobserved search-policy outcomes to value intervals and the next experiment"),
      updatedDefinition: pair(
        "새 재료를 고르는 정책의 가치는 과거 정책이 시도한 후보만으로는 정해지지 않는다. 시도했지만 결과가 보존되지 않은 후보에서는 누락 과정이, 아예 선택될 가능성이 없던 후보에서는 지지집합 부재가 각각 다른 미지량을 만든다. 이번 분석은 두 불확실성을 별도 구간으로 계산했다.",
        "The value of a materials-search policy is not determined by candidates attempted under an earlier policy. For attempted candidates whose outcomes were not retained, the missingness process is unknown; for candidates that could never be selected, support is absent. This analysis computes those two uncertainties as separate intervals."
      ),
      knownBoundary: pair(
        "지지집합 안 비중 82.51%에서 관측률 60%, 관측 성공률 70%를 고정해도 미관측 성공률 10%와 90%인 두 세계가 같은 관측분포를 만든다. 전체 정책가치는 각각 0.4827과 0.7468이다. 선택오즈 Γ=25에서만 두 세계가 동시에 값 구간에 들어왔다.",
        "Within the 82.51% supported region, fixing 60% response and 70% observed success still permits two observationally identical worlds with 10% or 90% success among missing outcomes. Their full policy values are 0.4827 and 0.7468; only by Gamma 25 did the sensitivity interval contain both."
      ),
      bottleneck: pair(
        "후보 선택확률을 알아도 실패 산출물이 보존될 확률은 알 수 없고, 결과모형을 잘 맞춰도 확률 0인 행동의 반사실은 검증되지 않는다. 전자는 누락감사로 Γ를 줄여야 하고 후자는 직접 무작위 실행으로만 지지집합을 만든다.",
        "Knowing candidate-selection probabilities does not reveal whether failed products were retained, and fitting an outcome model does not validate counterfactuals for zero-probability actions. A missingness audit must reduce Gamma for the first failure, while direct randomized execution must create support for the second."
      ),
      minimumAdvance: pair(
        "다음 캠페인에서 예정 실험·실행 파일·원신호·판정 파일을 매일 대조해 결과 보존확률의 하한을 제시하고, 동시에 0 지지집합 두 층에서 5회씩 무작위 실행한다. 정책 우위가 아니라 Γ=25 값 구간과 무지지 기여폭이 얼마나 줄었는지를 보고한다.",
        "In the next campaign, reconcile scheduled experiments, execution files, raw signals, and adjudications daily to bound outcome retention, while randomizing five executions in each of two zero-support strata. Report shrinkage of the Gamma-25 value interval and unsupported contribution, not policy superiority."
      ),
      decisiveTest: pair(
        "누락감사 자료로 선택오즈 상한을 봉인한 뒤 감사를 보지 않은 팀이 값 구간을 재계산한다. 별도 무작위 10회의 Clopper–Pearson 구간은 개발 자료와 합치지 않고 0 지지집합 성분만 판정한다. 둘 중 어느 개입이 전체 구간을 더 줄이는지 사전식으로 비교한다.",
        "Seal a selection-odds bound from the missingness audit and have a team blinded to the audit recompute the value interval. Keep the ten randomized Clopper-Pearson observations separate from development data and use them only for the zero-support component. Compare the two interventions by preregistered interval-width reduction."
      ),
      unresolved: pair(
        "이진 성공으로 축약한 시험은 수율·상순도·비용의 다목적 가치와 반응 경로의 시간의존성을 포함하지 않는다. 실제 Γ는 관측자료에서 추정할 수 없고, 화학적 평활성으로 무지지 구간을 줄이려면 거리척도와 Lipschitz 상수를 외부 자료로 검증해야 한다.",
        "The binary-outcome test omits yield, phase purity, cost, and reaction-path timing. Gamma cannot be estimated from the observed outcomes alone, and shrinking no-support bounds through chemical smoothness requires an externally validated metric and Lipschitz constant."
      ),
      hypotheses: [
        { code: "H1", claim: pair("결과 보존과 누락 사유를 전향 기록하면 무지지 표본 10회보다 정책가치 구간을 크게 줄인다.", "Prospective outcome-retention and missingness-reason logging shrinks the policy-value interval more than ten zero-support observations."), prediction: pair("Γ=25 기준 완전한 누락기전 식별의 최대 구간 감소는 0.2963이고, 10회 층화 무작위화의 기대 감소 0.0412보다 크다.", "At Gamma 25, perfect identification of missingness can reduce width by 0.2963, exceeding the 0.0412 expected reduction from ten stratified randomized observations."), reject: pair("실제 감사로 정당화되는 Γ 감소가 10회 무작위화의 독립 반복 구간 감소보다 작으면 우선순위를 바꾼다.", "Reverse the priority if the Gamma reduction justified by a real audit shrinks the interval less than an independent ten-run randomized replication.") },
        { code: "H2", claim: pair("10회 층화 무작위화만으로 0 지지집합 기여폭을 의사결정 수준까지 줄일 수 있다.", "Ten stratified randomized observations alone can reduce the zero-support contribution to decision grade."), prediction: pair("두 층 5회씩의 평균 기여폭이 사전 관문 0.05 이하가 된다.", "Five observations per stratum reduce the mean contribution width to the preregistered threshold of 0.05 or less."), reject: pair("10,000회 반복의 평균 기여폭이 0.05를 넘으면 기각한다. 이번 값 0.1336으로 기각됐다.", "Reject if the mean contribution width over 10,000 replications exceeds 0.05; the observed 0.1336 rejects this claim.") },
        { code: "H3", claim: pair("검증된 화학적 평활성은 무지지 후보의 최악조건 구간을 직접 실험보다 먼저 줄일 수 있다.", "Validated chemical smoothness can tighten worst-case no-support bounds before direct experimentation."), prediction: pair("봉인 화학계에서 거리 기반 상·하한이 10회 무작위 구간보다 좁으면서 실제 결과를 95% 이상 포함한다.", "In a sealed chemical family, distance-based bounds are narrower than the ten-run randomized interval while covering at least 95% of realized outcomes."), reject: pair("거리척도 또는 상수가 개발 화학계 밖에서 커버리지를 잃거나 무가정 구간과 같은 폭이면 이 이전을 중단한다.", "Stop this transfer if the metric or constant loses coverage outside the development family or yields the same width as assumption-free bounds.") }
      ],
      sourceIds: [...commonSources, "pmlr_ope_2017", "nature_arrows_2023"]
    },
    "UP-185": {
      role: pair("실패 데이터베이스의 ‘빈 행’을 선택 과정과 판정 가능한 결과로 바꾸는 문제", "Problem turning blank rows in failure databases into a selection process and adjudicable outcomes"),
      updatedDefinition: pair(
        "실패를 포함한다는 데이터베이스도 계획됐으나 실행되지 않은 실험, 실행됐지만 원신호가 사라진 실험, 원신호는 있으나 판정이 보류된 실험을 구분하지 않으면 실패율을 알 수 없다. 결측은 실패가 아니며, 공개된 행만으로 어떤 결과가 빠졌는지도 정해지지 않는다.",
        "A database said to include failures cannot identify a failure rate unless it distinguishes planned-but-unrun experiments, executed experiments with lost raw signals, and preserved signals awaiting adjudication. Missing is not failure, and released rows alone do not determine which outcomes were omitted."
      ),
      knownBoundary: pair(
        "관측 성공 0.42, 관측 실패 0.18, 결과 없음 0.40인 분포는 전체 성공률 0.46과 0.78을 모두 허용한다. 무가정 성공률 구간은 [0.42, 0.82]이고, Γ=4 구간 [0.5674, 0.7813]은 성공이 덜 보존되는 세계만 포함했다.",
        "An observed distribution with 0.42 visible successes, 0.18 visible failures, and 0.40 missing permits full success rates of both 0.46 and 0.78. The assumption-free interval is [0.42, 0.82]; the Gamma-4 interval [0.5674, 0.7813] contains only the world where successes are less likely to be retained."
      ),
      bottleneck: pair(
        "성공과 실패의 보존확률 비는 누락된 결과 자체를 보지 않고는 식별되지 않는다. 사후 설명문이나 성공한 샘플의 풍부한 메타데이터는 예정량·실행량·원신호 보존량을 잇는 독립 카운트를 대신하지 못한다.",
        "The retention-probability ratio for successes and failures is not identified without observing the missing outcomes. Rich metadata for successful samples or retrospective narrative cannot replace independent counts linking scheduled, executed, raw-retained, and adjudicated experiments."
      ),
      minimumAdvance: pair(
        "연속 캠페인 하나에서 모든 예정 ID를 실행 전에 발급하고, 장비 로그와 원파일 해시를 자동 대조하며, 결과를 모르는 감사자가 누락 사유를 봉인한다. 각 단계 전이율과 성공 여부별 최악 선택오즈를 공개하면 성공률을 점값 대신 검증 가능한 구간으로 보고할 수 있다.",
        "Issue every planned ID before execution in one consecutive campaign, automatically reconcile instrument logs and raw-file hashes, and have an outcome-blinded auditor seal missingness reasons. Publishing stage-transition rates and worst plausible selection odds by outcome permits a verifiable success-rate interval instead of an unsupported point."
      ),
      decisiveTest: pair(
        "공개 데이터 구축팀과 독립 감사팀이 예정→실행→원신호→판정 원장을 별도로 재구성해 행 단위 일치를 검사한다. 누락 사유가 결과 판정 전에 기록됐는지 확인하고, 사후 복구 자료는 주 분석에서 제외한 민감도 분기로만 둔다.",
        "Have the publishing and independent audit teams reconstruct the planned-to-executed-to-raw-to-adjudicated ledger separately and test row-level agreement. Verify that missingness reasons were recorded before outcome adjudication; place retrospectively recovered records only in a sensitivity branch."
      ),
      unresolved: pair(
        "원신호가 남아도 판정 임계값과 재측정 규칙이 결과에 따라 바뀌면 또 다른 선택층이 생긴다. 여러 기관의 파일 형식·실험 단위·부분 성공 정의를 맞추는 표준과, 영업비밀을 노출하지 않고 완전성을 증명하는 해시 원장이 필요하다.",
        "Even retained raw signals create another selection layer if adjudication thresholds or remeasurement rules depend on preliminary outcomes. Multi-institution standards for file formats, experimental units, and partial success, plus hash-ledger proofs of completeness that protect proprietary details, remain unresolved."
      ),
      hypotheses: [
        { code: "H1", claim: pair("예정 ID와 원파일 해시의 전향 연결은 실패 공개편향의 Γ를 외부 감사 가능한 범위로 제한한다.", "Prospective links between planned IDs and raw-file hashes constrain failure-reporting Gamma to an externally auditable range."), prediction: pair("독립 감사팀이 모든 단계의 분모를 재현하고 누락 사유 중 결과 판정 후 작성 비율을 0으로 확인한다.", "An independent audit reproduces every stage denominator and finds zero missingness reasons written after outcome adjudication."), reject: pair("예정 ID의 사후 생성, 덮어쓰기 또는 장비 로그와의 비대응이 발견되면 해당 캠페인의 Γ 제한을 기각한다.", "Reject the Gamma constraint for any campaign with post hoc IDs, overwrites, or unreconciled instrument logs.") },
        { code: "H2", claim: pair("공개된 실패 행의 비율은 누락기전을 몰라도 전체 실패율의 좋은 근사다.", "The fraction of released failure rows approximates the full failure rate even without a missingness model."), prediction: pair("Γ를 1에서 25로 넓혀도 전체 성공률 구간의 폭과 의사결정 방향이 거의 변하지 않는다.", "Expanding Gamma from 1 to 25 barely changes the full-success interval or decision direction."), reject: pair("같은 관측분포에서 과반 의사결정이 뒤집히는 두 완전자료 세계가 존재하면 기각한다. 0.46 대 0.78 세계가 이를 충족한다.", "Reject if two complete-data worlds sharing the observed distribution reverse a majority decision; the 0.46 versus 0.78 worlds do so.") },
        { code: "H3", claim: pair("독립 재측정 표본은 전체 원장을 공개하지 않아도 결과의존 보존을 검출할 수 있다.", "An independent remeasurement sample can detect outcome-dependent retention without releasing the complete ledger."), prediction: pair("예정 ID에서 무작위 추출한 시료의 재측정 결과가 공개·비공개 상태와 연관된 성공오즈 차이를 정량화한다.", "Remeasuring samples randomly drawn from planned IDs quantifies a success-odds difference associated with released versus unreleased status."), reject: pair("시료가 파괴됐거나 재측정 가능성이 원래 결과와 연결돼 무작위 추출 분모를 복원할 수 없으면 중단한다.", "Stop if samples were destroyed or remeasurement availability depends on the original outcome so the random sampling denominator cannot be reconstructed.") }
      ],
      sourceIds: [...commonSources, "nature_arrows_2023", "github_arrows"]
    },
    "UP-629": {
      role: pair("미지 MNAR에서 관측분포가 허용하는 결론 집합을 수학적으로 고정하는 문제", "Problem mathematically fixing the set of conclusions allowed by an unknown MNAR observed distribution"),
      updatedDefinition: pair(
        "이진 결과 Y와 관측 여부 R이 있을 때 자료는 P(Y=1,R=1), P(Y=0,R=1), P(R=0)만 알려 준다. 빠진 결과의 성공률은 자유롭게 바뀔 수 있으므로 모집단 평균은 일반적으로 하나의 수가 아니라 구간이다. 민감도 분석은 이 자유도를 숨기지 않고 선택오즈 제한 Γ가 허용하는 값 집합을 보여 준다.",
        "For binary outcome Y and response indicator R, data reveal only P(Y=1,R=1), P(Y=0,R=1), and P(R=0). The positive rate among missing outcomes can vary freely, so the population mean is generally an interval rather than a point. Sensitivity analysis exposes this degree of freedom through the value set allowed by a selection-odds limit Gamma."
      ),
      knownBoundary: pair(
        "a=P(Y=1,R=1)=0.42, b=P(Y=0,R=1)=0.18이면 무가정 평균은 [a,1-b]=[0.42,0.82]다. 응답오즈비를 [1/Γ,Γ]로 제한하면 경계는 p(r)=a(1-b+rb)/(a+rb)의 r=Γ와 1/Γ 값이다. Γ=1에서 0.7로 붕괴하고 Γ=25에서 [0.4541,0.8133]이다.",
        "With a=P(Y=1,R=1)=0.42 and b=P(Y=0,R=1)=0.18, the assumption-free mean is [a,1-b]=[0.42,0.82]. Bounding the response-odds ratio in [1/Gamma,Gamma] gives endpoints p(r)=a(1-b+rb)/(a+rb) at r=Gamma and 1/Gamma. It collapses to 0.7 at Gamma 1 and equals [0.4541,0.8133] at Gamma 25."
      ),
      bottleneck: pair(
        "Γ는 관측분포가 추정하는 모수가 아니라 관측되지 않은 선택 강도에 대한 외부 가정이다. 표본을 늘리면 a와 b의 오차는 줄지만 Γ가 허용하는 식별구간은 사라지지 않는다. 보조변수·검증표본·전향 누락원장 중 하나가 선택과 결과를 잇는 추가 정보를 줘야 한다.",
        "Gamma is not estimated from the observed distribution; it is an external restriction on unobserved selection strength. More samples reduce uncertainty in a and b but do not erase the identification interval permitted by Gamma. A shadow variable, validation sample, or prospective missingness ledger must supply additional information linking selection and outcome."
      ),
      minimumAdvance: pair(
        "점추정 대신 Γ=1,2,4,8,16,25와 무가정 구간을 함께 보고하고, 결론이 바뀌는 최소 Γ를 임계값으로 제시한다. 독립 자료가 그 임계값보다 작은 선택강도를 지지할 때만 방향 결론을 승인한다.",
        "Report intervals at Gamma 1, 2, 4, 8, 16, 25 and without restriction, and state the smallest Gamma at which the conclusion changes. Approve a directional conclusion only when independent evidence supports selection weaker than that tipping value."
      ),
      decisiveTest: pair(
        "동일한 a,b와 결측률을 갖지만 빠진 성공률이 0.1과 0.9인 생성모형을 각각 시뮬레이션해 관측자료 판별기가 우연 수준을 넘지 못하는지 확인한다. 완전자료를 공개한 뒤 두 평균을 회복하고, 민감도 구간이 명시한 Γ에서 각 참값을 포함하는지 독립 코드로 검산한다.",
        "Simulate generators with identical a, b, and missing fraction but missing positive rates 0.1 and 0.9, and verify that an observed-data classifier cannot beat chance. Reveal complete data afterward, recover both means, and independently check whether sensitivity intervals cover each truth at the stated Gamma."
      ),
      unresolved: pair(
        "여러 공변량·연속 결과·시간의존 누락에서는 단일 Γ가 이질적 선택을 과도하게 압축할 수 있다. 층별 Γ를 두면 차원이 급증하며, 자료 기반으로 민감도 모수를 선택하면 명목 커버리지가 유지되는지도 별도 추론이 필요하다.",
        "With many covariates, continuous outcomes, and time-dependent missingness, one Gamma may compress heterogeneous selection too aggressively. Stratum-specific Gamma grows dimensionality rapidly, and data-adaptive sensitivity choices require separate inference to preserve nominal coverage."
      ),
      hypotheses: [
        { code: "H1", claim: pair("관측률과 관측 성공률만 알면 모집단 성공률은 점 식별된다.", "Response rate and observed positive rate alone point-identify the population positive rate."), prediction: pair("같은 관측분포를 갖는 모든 완전자료 세계의 평균이 0.7이다.", "Every complete-data world compatible with the observed distribution has mean 0.7."), reject: pair("같은 a,b,결측률에서 다른 평균을 갖는 두 세계가 존재하면 기각한다. 0.46과 0.78 세계가 구성돼 기각됐다.", "Reject upon two worlds with the same a, b, and missingness but different means; constructed means 0.46 and 0.78 reject it.") },
        { code: "H2", claim: pair("유한 선택오즈 Γ는 미지 MNAR에서도 날카로운 평균 구간을 준다.", "A finite selection-odds Gamma yields a sharp mean interval under unknown MNAR."), prediction: pair("경계식의 각 끝점에서 정확히 Γ 또는 1/Γ인 완전자료 분포가 존재하고, 그 사이 모든 평균이 같은 관측분포를 만든다.", "At each analytic endpoint there is a complete-data distribution with odds ratio exactly Gamma or 1/Gamma, and every intervening mean produces the same observed distribution."), reject: pair("선형계획 또는 독립 수치탐색이 공식 밖의 허용 평균을 찾거나 공식 안의 평균을 실현하지 못하면 기각한다.", "Reject if an independent linear program or numerical search finds a feasible mean outside the formula or cannot realize an interior mean.") },
        { code: "H3", claim: pair("0 지지집합 표본을 늘리면 MNAR 식별구간도 동시에 사라진다.", "Sampling the zero-support region also eliminates the MNAR identification interval."), prediction: pair("0 지지집합 120회 뒤 Γ=25 전체 구간이 점으로 붕괴한다.", "After 120 zero-support observations, the Gamma-25 full interval collapses to a point."), reject: pair("무지지 기여폭만 줄고 지지집합의 Γ=25 폭 0.3591이 남으면 기각한다. 두 병목의 가법 분해가 이를 기각한다.", "Reject if only the unsupported contribution shrinks while the supported Gamma-25 width 0.3591 remains; the additive decomposition rejects this claim.") }
      ],
      sourceIds: commonSources
    },
    "UP-430": {
      role: pair("치료를 받지 않은 하위집단과 추적이 끊긴 결과를 구분해 효과 주장의 한계를 정하는 문제", "Problem separating untreated subgroups from lost outcomes to bound treatment-effect claims"),
      updatedDefinition: pair(
        "평균 치료효과가 알려져도 특정 하위집단에서 한 치료가 한 번도 사용되지 않았다면 그 치료의 결과는 자료에 없다. 치료가 사용됐더라도 추적손실이 결과에 따라 달랐다면 관측 환자의 반응률은 전체 반응률이 아니다. 두 경우는 각각 치료 겹침과 결과 관측의 문제이며 별도로 판정해야 한다.",
        "Even when an average treatment effect is known, a treatment never used in a subgroup has no observed outcome there. And when follow-up depends on outcome, response among observed patients is not the full response rate. These are distinct failures of treatment overlap and outcome observation and must be adjudicated separately."
      ),
      knownBoundary: pair(
        "동일한 60% 추적률과 추적 환자 70% 반응률은 전체 반응률 46%와 78%를 모두 허용했다. 별도로 표적 치료 확률이 0인 하위집단 비중 17.49%는 결과범위 [0,1]만으로 전체 정책가치 폭 0.1749를 추가했다. 관측 환자 수 증가는 어느 구조적 공백도 자동으로 메우지 않는다.",
        "The same 60% follow-up and 70% response among followed patients permit full response rates of 46% and 78%. Separately, a 17.49% subgroup with zero target-treatment probability adds 0.1749 to full policy-value width using only outcome range [0,1]. More observed patients do not automatically fill either structural gap."
      ),
      bottleneck: pair(
        "추적손실의 결과의존성과 치료 배정의 무지지 영역은 모두 보이지 않는 잠재결과를 만들지만 필요한 보완 자료가 다르다. 추적 원장·검증표본은 누락 선택을 제한하고, 윤리적으로 허용된 소규모 무작위화나 유효한 도구변수는 치료 반사실을 만든다.",
        "Outcome-dependent loss to follow-up and unsupported treatment assignment both hide potential outcomes, but require different remedies. Follow-up ledgers or validation samples constrain missingness selection; ethically permissible randomization or a valid instrument supplies treatment counterfactuals."
      ),
      minimumAdvance: pair(
        "하위집단마다 치료 성향과 결과 관측률을 함께 공개하고, 0 성향 영역에서는 효과 점값을 거부한다. 추적손실 선택오즈 민감도와 무지지 결과범위를 합친 총 구간이 임상적 최소차이를 어느 방향으로도 넘지 않을 때만 정책 방향을 보류 없이 제안한다.",
        "Publish treatment propensity and outcome-observation rate by subgroup and refuse effect point estimates in zero-propensity regions. Recommend a policy direction without abstention only when the combined loss-to-follow-up sensitivity and unsupported-outcome interval lies entirely beyond the clinically meaningful threshold."
      ),
      decisiveTest: pair(
        "개발 병원과 분리된 기관에서 추적완료·누락 사유를 재감사하고, 무지지 하위집단의 윤리적 무작위 표본을 별도 판정자료로 둔다. 사전 정의한 Γ와 가족별 정확구간을 적용해 효과 방향이 기관·계측·분석 구현을 바꿔도 유지되는지 확인한다.",
        "Re-audit follow-up and missingness reasons at an institution separate from model development, and reserve an ethically randomized sample from unsupported subgroups for adjudication. Apply preregistered Gamma and familywise exact intervals to test whether effect direction survives changes in institution, measurement, and implementation."
      ),
      unresolved: pair(
        "치료 순응, 시간가변 교란, 경쟁위험과 환자 간 간섭은 이 단회 이진모형에 없다. 10회 표본은 99.99%에 가까운 보수적 커버리지를 보였지만 폭이 커서 임상 결정을 지지하지 않으며, 실제 환자 시험의 표본수는 안전성·효과크기·중단규칙으로 다시 설계해야 한다.",
        "Adherence, time-varying confounding, competing risks, and interference are absent from this one-step binary model. The ten-run sample was extremely conservative at roughly 99.99% coverage but too wide for clinical decisions; any real patient study needs a new design based on safety, effect size, and stopping rules."
      ),
      hypotheses: [
        { code: "H1", claim: pair("추적률을 정확히 알면 결과의존 추적손실도 보정할 수 있다.", "Knowing the follow-up rate is sufficient to correct outcome-dependent attrition."), prediction: pair("같은 추적률을 가진 완전자료 세계의 하위집단 반응률이 일치한다.", "Complete-data worlds sharing a follow-up rate have the same subgroup response rate."), reject: pair("동일 추적률·관측반응률에서 0.46과 0.78처럼 다른 전체 반응률이 가능하면 기각한다.", "Reject when the same follow-up and observed response rates permit different full rates such as 0.46 and 0.78.") },
        { code: "H2", claim: pair("치료 겹침과 추적 완전성을 분리한 구간은 어느 자료 수집이 우선인지 판정한다.", "Separating treatment-overlap and follow-up-completeness intervals identifies which data collection should come first."), prediction: pair("Γ=25에서 완전 누락감사의 최대 폭 감소 0.2963이 무지지 10회 시험의 0.0412보다 크다.", "At Gamma 25, the maximum width reduction from a complete missingness audit, 0.2963, exceeds 0.0412 from a ten-run unsupported-treatment trial."), reject: pair("현장 비용·안전 제약을 반영한 단위 비용당 기대 구간 감소가 반대로 나오면 수집 순서를 바꾼다.", "Reverse collection order if expected interval reduction per unit cost, including field safety constraints, favors the trial instead.") },
        { code: "H3", claim: pair("겹침 영역의 효과모형을 0 성향 하위집단에 평활 외삽해도 정직한 구간을 만들 수 있다.", "Smooth extrapolation of an effect model into a zero-propensity subgroup can yield honest bounds."), prediction: pair("외부 병원에서 사전 고정한 거리와 평활상수가 실제 하위집단 결과를 95% 이상 포함하면서 무가정 구간보다 좁다.", "At an external hospital, a preregistered metric and smoothness constant cover at least 95% of subgroup outcomes while narrowing the assumption-free interval."), reject: pair("공변량 이동이나 치료효과 이질성 때문에 외부 커버리지가 실패하면 모델 외삽을 중단하고 직접 표본만 사용한다.", "If covariate shift or treatment-effect heterogeneity breaks external coverage, stop model extrapolation and use direct samples only.") }
      ],
      sourceIds: [...commonSources, "pmlr_candor_2026", "pmlr_ope_2017"]
    }
  };

  const identificationConnection = {
    id: "CONN-IDENT-001",
    problemIds: ["UP-182", "UP-185", "UP-629", "UP-430"],
    type: pair("선택 연산자가 만드는 동일 관측분포", "Observational equivalence induced by a selection operator"),
    strength: "direct-isomorphism",
    sharedBottleneck: pair("결과를 보존하거나 추적하는 선택 R이 결과 Y에 의존하면 서로 다른 완전자료 분포가 같은 관측분포를 만든다. 행동확률 0은 별도로 반사실 전체를 관측분포 밖에 둔다.", "When retention or follow-up R depends on outcome Y, distinct complete-data distributions produce the same observed distribution. Separately, zero action probability places an entire counterfactual outside the observed distribution."),
    mapping: pair("재료 성공↔임상 반응↔통계의 Y, 원신호 보존↔환자 추적완료↔R, 후보 선택확률↔치료 성향, 미시도 조리법↔미배정 치료가 정확히 대응한다.", "Materials success maps to clinical response and statistical Y; raw-signal retention to completed follow-up and R; candidate-selection probability to treatment propensity; and untried recipes to unassigned treatments."),
    transferableMethod: pair("Manski 논리경계, 선택오즈 Γ 민감도, 겹침 영역 표시, 무지지 층의 독립 무작위 표본과 가족별 정확구간을 공통 판정층으로 이전한다.", "Transfer Manski logical bounds, selection-odds Gamma sensitivity, overlap-region labeling, independent randomized samples in unsupported strata, and familywise exact intervals as a common adjudication layer."),
    evidence: pair("같은 a=0.42, b=0.18, 결측 0.40을 가진 두 세계의 평균이 0.46과 0.78로 갈렸고, Γ=25에서만 둘을 함께 포함했다. 무지지 10회는 전체 기여폭을 0.0412만 줄였다.", "Two worlds sharing a=0.42, b=0.18, and 0.40 missingness had means 0.46 and 0.78; only Gamma 25 contained both. Ten unsupported observations reduced full contribution width by only 0.0412."),
    validationStatus: pair("해석식·독립 코드·10,000회 합성 반복 검산 · 실제 재료·임상 원장 대기", "Analytic formula, independent code, and 10,000 synthetic replications verified; real materials and clinical ledgers pending"),
    failureBoundary: pair("재료 반응의 경로의존성, 임상의 시간가변 교란·순응·간섭, 연속 다목적 결과는 현재 이진 단회 대응을 깬다. 한 분야의 Γ나 표본 관문을 다른 분야에 수치 그대로 옮길 수 없다.", "Reaction-path dependence, clinical time-varying confounding, adherence, interference, and continuous multi-objective outcomes break the current one-step binary mapping. Numeric Gamma or sample gates cannot be copied unchanged across fields."),
    minimumTest: pair("각 분야에서 예정 분모와 결과 보존을 독립 감사하고, 봉인된 무지지 두 층을 직접 표본화한다. 같은 경계 코드가 두 원장의 변수 변환 후에도 구간 커버리지와 중단 판정을 유지해야 한다.", "Independently audit planned denominators and outcome retention in each field, then directly sample two sealed unsupported strata. After variable mapping, the same bound code must preserve interval coverage and stopping decisions on both ledgers."),
    sourceIds: ["manski_missing_2005", "pmlr_overlap_2020", "pmlr_no_overlap_2024", "pmlr_robust_ope_2025"]
  };
  if (!connections.some(({ id }) => id === identificationConnection.id)) connections.push(identificationConnection);

  const cycle = {
    id: "RC-2026-05",
    title: "보이지 않는 결과의 값은 얼마나 좁힐 수 있는가",
    titleEn: "How tightly can unseen outcomes be valued?",
    status: "active",
    startedOn: REVIEWED_ON,
    reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records),
    connectionIds: ["CONN-IDENT-001", "CONN-CAUSAL-001", "CONN-MAT-004", "CONN-MAT-006"],
    selectionReason: "RC-2026-04의 오라클 q 보정은 참 누락확률을 알 때만 성공했고, 표적 행동 17.49%에는 지지집합이 없었다. 이번 사이클은 같은 관측분포를 만드는 두 완전자료 세계로 점 식별 불가능성을 증명하고, 선택오즈 Γ 구간과 0 지지집합 층화 무작위화의 구간 감소를 같은 척도에서 비교해 다음 자료 수집의 우선순위를 정했다.",
    selectionReasonEn: "RC-2026-04's oracle q correction succeeded only when true missingness probabilities were known, while 17.49% of target actions had no support. This cycle proves non-identification with two complete-data worlds sharing the observed distribution, then compares selection-odds Gamma intervals and stratified zero-support randomization on the same interval-width scale to prioritize the next data collection.",
    verifiedFindings: [
      { text: "관측 성공 0.42, 관측 실패 0.18, 결측 0.40을 공유하면서 전체 성공률이 0.46과 0.78인 두 MNAR 세계를 구성했다. 관측분포만으로는 둘을 구별할 수 없다.", textEn: "Constructed two MNAR worlds sharing 0.42 observed successes, 0.18 observed failures, and 0.40 missingness but having full success rates 0.46 and 0.78. The observed distribution cannot distinguish them.", sourceIds: ["manski_missing_2005"] },
      { text: "선택오즈 Γ=1에서 성공률 구간은 0.7로 붕괴하고, Γ=4에서 [0.5674,0.7813], Γ=25에서 [0.4541,0.8133], 무가정에서 [0.42,0.82]로 넓어졌다.", textEn: "The success-rate interval collapses to 0.7 at selection-odds Gamma 1, widens to [0.5674,0.7813] at Gamma 4, [0.4541,0.8133] at Gamma 25, and [0.42,0.82] without restriction.", sourceIds: ["manski_missing_2005", "neurips_ope_interval_2020"] },
      { text: "0 지지집합 비중 17.49%를 두 층으로 나눠 10,000회 반복했다. 무작위화 10회의 평균 기여폭은 0.1336으로 무자료 0.1749보다 0.0412 줄었지만 0.05 관문을 통과하지 못했다.", textEn: "Split the 17.49% zero-support region into two strata over 10,000 replications. Ten randomized observations reduced mean contribution width from 0.1749 to 0.1336, a 0.0412 gain, but failed the 0.05 gate.", sourceIds: ["pmlr_overlap_2020", "pmlr_no_overlap_2024"] },
      { text: "30회 기여폭 0.0898과 100회 0.0513은 관문 밖이었고, 120회에서 0.0469로 처음 통과했다. 보수적 가족별 정확구간의 120회 커버리지는 99.86%였다.", textEn: "Contribution widths of 0.0898 at 30 observations and 0.0513 at 100 remained outside the gate; 120 first passed at 0.0469. Conservative familywise exact coverage at 120 was 99.86%.", sourceIds: ["pmlr_no_overlap_2024"] },
      { text: "Γ=25에서 누락기전을 완전히 식별할 때 제거 가능한 폭 0.2963은 10회 무지지 시험의 기대 감소보다 7.18배 컸다. 따라서 다음 실험은 10회 교정 파일럿을 유지하되 누락원장 감사를 먼저 수행해야 한다.", textEn: "At Gamma 25, the 0.2963 width removable by perfectly identifying missingness was 7.18 times the expected gain from a ten-run unsupported trial. The next study should retain the ten-run calibration pilot but prioritize a missingness-ledger audit.", sourceIds: ["manski_missing_2005", "pmlr_overlap_2020"] },
      { text: "무지지 영역은 검증된 평활성 가정으로 날카로운 부분식별 구간을 좁힐 수 있다는 2024년 결과가 있으나, 실제 화학 거리와 평활상수의 외부검증 없이는 이번 무가정 구간을 대체하지 않았다.", textEn: "A 2024 result can tighten sharp no-overlap partial-identification bounds under validated smoothness, but this cycle did not replace assumption-free bounds without external validation of a chemical metric and smoothness constant.", sourceIds: ["pmlr_no_overlap_2024"] }
    ],
    resultMatrix: {
      title: pair("누락 민감도와 무지지 표본이 정책가치 구간에 미치는 영향", "Effect of missingness sensitivity and unsupported samples on policy-value intervals"),
      note: pair("Γ 행은 무지지 결과가 전혀 없을 때의 전체 폭이다. 무작위화 행은 0 지지집합 성분만의 평균 폭이며 Γ 불확실성을 제거하지 않는다.", "Gamma rows show full width with no unsupported outcomes. Randomization rows show mean width of the zero-support component only and do not remove Gamma uncertainty."),
      columns: [pair("조건", "Condition"), pair("하한", "Lower"), pair("상한", "Upper"), pair("폭", "Width"), pair("판정", "Decision")],
      rows: [
        { label: pair("Γ=1 · 무지지 무자료", "Gamma 1; no unsupported data"), values: ["0.5776", "0.7525", "0.1749", pair("MNAR 가정 의존", "Depends on MAR restriction")] },
        { label: pair("Γ=4 · 무지지 무자료", "Gamma 4; no unsupported data"), values: ["0.4682", "0.8195", "0.3514", pair("한 MNAR 세계 누락", "Misses one MNAR world")] },
        { label: pair("Γ=25 · 무지지 무자료", "Gamma 25; no unsupported data"), values: ["0.3747", "0.8459", "0.4712", pair("두 세계 포함", "Contains both worlds")] },
        { label: pair("무가정 · 무지지 무자료", "Unbounded; no unsupported data"), values: ["0.3466", "0.8515", "0.5049", pair("논리경계", "Logical bounds")] },
        { label: pair("무지지 무작위 10회", "10 unsupported randomized"), values: ["평균 0.1543", "평균 0.9185", "0.1336 기여", pair("0.05 관문 실패", "Fails 0.05 gate")] },
        { label: pair("무지지 무작위 30회", "30 unsupported randomized"), values: ["평균 0.3099", "평균 0.8236", "0.0898 기여", pair("0.05 관문 실패", "Fails 0.05 gate")] },
        { label: pair("무지지 무작위 100회", "100 unsupported randomized"), values: ["평균 0.4363", "평균 0.7299", "0.0513 기여", pair("근소하게 실패", "Narrowly fails")] },
        { label: pair("무지지 무작위 120회", "120 unsupported randomized"), values: ["평균 0.4497", "평균 0.7180", "0.0469 기여", pair("폭 관문 통과", "Passes width gate")] }
      ]
    },
    sharedProgram: {
      name: pair("누락감사와 무지지 표적시험의 정보가치 비교", "Information-value comparison of missingness audit and targeted no-support trial"),
      thesis: pair("관측자료가 식별하지 못하는 자유도를 명시한 뒤, 각 추가 자료가 전체 값 구간을 얼마나 줄이는지로 다음 연구를 선택한다.", "Expose degrees of freedom not identified by observed data, then choose the next study by how much each new data source shrinks the full value interval."),
      design: pair("관측 결합분포가 같은 두 MNAR 세계를 해석적으로 구성하고 Γ별 날카로운 평균 경계를 계산했다. 별도로 비중 17.49%의 무지지 영역을 두 층으로 나눠 0·10·30·100·120회 무작위 표본의 Bonferroni 보정 Clopper–Pearson 구간을 각각 10,000회 반복했다.", "Analytically constructed two MNAR worlds with identical observed joint distributions and computed sharp mean bounds across Gamma. Separately split a 17.49% unsupported region into two strata and repeated Bonferroni-adjusted Clopper-Pearson intervals 10,000 times for 0, 10, 30, 100, and 120 randomized observations."),
      adjudication: pair("경계식은 수작업 고정값 Γ=1과 무가정 끝점으로 독립 검산했고, 두 세계의 관측 결합분포 동일성을 코드로 강제했다. 무지지 표본은 개발 결과모형에 넣지 않고 별도 난수열·정확구간으로 판정했다.", "Independently checked the bound formula against hand-fixed Gamma-1 and unrestricted endpoints, and enforced equality of the worlds' observed joint distributions in code. Unsupported samples were excluded from outcome-model development and adjudicated with a separate random stream and exact intervals."),
      primaryMetrics: pair("Γ별 지지집합 평균 경계, 전체 정책가치 구간폭·최소최대 오차, 무지지 기여폭, 가족별 커버리지, 무작위 1회당 기대 폭 감소", "Supported-mean bounds by Gamma, full policy-value width and minimax error, unsupported contribution width, familywise coverage, and expected width reduction per randomized observation"),
      successRule: pair("결론 방향은 외부 근거가 지지하는 Γ 전체와 무지지 정확구간 전체에서 유지돼야 한다. 무지지 성분은 평균 기여폭 0.05 이하와 95% 이상 커버리지를 동시에 통과해야 한다.", "A directional conclusion must hold across every Gamma supported by external evidence and the full exact no-support interval. The unsupported component must achieve mean contribution width at most 0.05 and coverage at least 95%."),
      stopRule: pair("Γ를 관측자료에서 추정했다고 주장하지 않는다. 0 지지집합 표본으로 MNAR가 해결됐다고 해석하지 않으며, 폭 관문을 실패한 표본수에서는 정책 우위를 선언하지 않는다.", "Do not claim Gamma was estimated from observed outcomes. Do not interpret zero-support sampling as resolving MNAR, and do not declare policy superiority at sample sizes that fail the width gate."),
      status: pair("해석 경계·독립 검산·10,000회 표적시험 완료 · 실제 누락원장과 봉인 화학계 대기", "Analytic bounds, independent checks, and 10,000 targeted-trial replications complete; real missingness ledger and sealed chemical family pending")
    },
    artifacts: [
      { title: pair("부분식별 민감도 규격", "Partial-identification sensitivity specification"), description: pair("두 MNAR 세계, Γ 격자, 무지지 두 층, 표본수·시드·정확구간과 판정 관문을 결과 전에 고정한 규격", "Frozen specification for two MNAR worlds, Gamma grid, two unsupported strata, sample sizes, seed, exact intervals, and decision gates"), url: "research/identification/sensitivity-spec.json", kind: "JSON" },
      { title: pair("민감도와 정보가치 결과", "Sensitivity and information-value results"), description: pair("Γ별 값 경계, 최소최대 구간, 무지지 표본별 폭·커버리지와 다음 자료 수집 판정을 기록한 결과", "Results recording Gamma value bounds, minimax intervals, no-support width and coverage by sample size, and the next data-collection decision"), url: "research/identification/sensitivity-result.json", kind: "JSON" },
      { title: pair("부분식별·무작위 시험 실행기", "Partial-identification and randomized-trial runner"), description: pair("고정 시드로 두 완전자료 세계, 선택오즈 경계와 10,000회 층화 이항시험을 다시 계산하는 의존성 없는 코드", "Dependency-free runner recomputing complete-data worlds, selection-odds bounds, and 10,000 stratified binomial trials from a frozen seed"), url: "scripts/run-identification-sensitivity.mjs", kind: "JavaScript" },
      { title: pair("경계식 독립 검산", "Independent bound verification"), description: pair("Γ=1·무가정 수작업 끝점, 동일 관측분포, 정확구간 끝점과 모든 사전 판정을 검사하는 별도 검증기", "Independent verifier for hand-calculated Gamma-1 and unrestricted endpoints, identical observed distributions, exact-interval endpoints, and preregistered findings"), url: "scripts/verify-identification-sensitivity.mjs", kind: "JavaScript" }
    ],
    log: [
      pair("RC-2026-04의 다음 출발점을 그대로 채택해 미지 q와 0 지지집합을 별도 식별 실패로 고정했다.", "Adopted RC-2026-04's next starting point and fixed unknown q and zero support as separate identification failures."),
      pair("관측분포가 같은 두 세계를 먼저 구성해 점 추정량의 성능 비교보다 식별 가능성 자체를 판정했다.", "Constructed observationally equivalent worlds before comparing point estimators, adjudicating identifiability itself."),
      pair("Γ를 자료 추정치로 취급하지 않고 외부 감사로 제한해야 할 민감도 가정으로 기록했다.", "Recorded Gamma as a sensitivity assumption requiring external audit rather than a data estimate."),
      pair("무지지 표본의 가족별 커버리지를 보수적으로 유지했으며 10·30·100회가 폭 관문을 실패한 사실을 숨기지 않았다.", "Conservatively preserved familywise coverage and retained the failures of 10, 30, and 100 observations at the width gate."),
      pair("누락감사의 완전 식별은 달성 결과가 아니라 제거 가능한 폭의 상한으로만 사용했다.", "Used perfect missingness identification only as an upper bound on removable width, not as an achieved result."),
      pair("평활성 부분식별을 유망한 분기로 남겼지만 화학 거리와 상수의 외부검증 전에는 결과 구간에 적용하지 않았다.", "Retained smoothness-based partial identification as a promising branch but did not apply it before external validation of the chemical metric and constant.")
    ],
    nextCycle: pair("실제 공개 원장에서 예정→실행→원신호→판정 전이를 자동 대조할 수 있는 최소 완전성 감사 규격을 만들고, 결과를 모르는 누락 사유가 Γ 상한을 얼마나 제한하는지 반합성 결측 주입시험으로 보정한다. 동시에 봉인 화학계의 조성·전구체·공정 거리에서 Lipschitz 상수를 개발/판정 분할로 추정해 10회 무작위 구간보다 좁고 95% 이상 커버하는지 비교한다.", "Build a minimum completeness-audit specification that automatically reconciles planned, executed, raw-signal, and adjudicated transitions in a real public ledger, then calibrate how outcome-blind missingness reasons constrain Gamma using semi-synthetic missingness injection. In parallel, estimate a Lipschitz constant over composition, precursor, and process distance in a sealed chemical family with development/adjudication splits, testing whether it is narrower than the ten-run randomized interval while retaining at least 95% coverage."),
    sourceIds: [...commonSources, "pmlr_ope_2017", "pmlr_candor_2026", "nature_arrows_2023", "github_arrows"]
  };

  for (const problem of problems) {
    const record = records[problem.id];
    if (!record) continue;
    const historicalRecord = { cycleId: cycle.id, ...record, reviewedOn: REVIEWED_ON };
    problem.researchHistory = [...(problem.researchHistory || []), historicalRecord];
    problem.cycleResearch = historicalRecord;
    problem.sourceIds = [...new Set([...(problem.sourceIds || []), ...record.sourceIds])];
  }
  for (const problem of problems) {
    problem.researchConnections = connections.filter(connection => connection.problemIds.includes(problem.id)).map(connection => connection.id);
  }

  cycles.push(cycle);
  window.RESEARCH_CYCLES = cycles;
  window.RESEARCH_CONNECTIONS = connections;
  window.RESEARCH_CYCLE_META = {
    ...(window.RESEARCH_CYCLE_META || {}),
    reviewedOn: REVIEWED_ON,
    cycles: cycles.length,
    curatedProblems: problems.filter(problem => problem.researchHistory?.length).length,
    researchRecords: problems.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0),
    connections: connections.length,
    factSources: (window.RESEARCH_CYCLE_META?.factSources || 0) + 4
  };
})();
