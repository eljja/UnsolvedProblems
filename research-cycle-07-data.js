/* RC-2026-07: second-stage MNAR rescue and active phase-boundary acquisition. */
(function () {
  "use strict";
  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    pmlr_active_change_2019: {
      discipline: "computer",
      title: "Active Change-Point Detection",
      url: "https://proceedings.mlr.press/v101/hayashi19a.html",
      evidenceLabel: "동료심사 능동 변화점 탐지 연구",
      evidenceLabelEn: "Peer-reviewed active change-point detection study",
      resultPeriod: "ACML 2019 논문 · 학회 2019년 11월 17–19일",
      resultPeriodEn: "ACML 2019 paper; conference held 17–19 November 2019",
      reviewedOn: REVIEWED_ON
    },
    statcan_two_phase_2018: {
      discipline: "mathematics",
      title: "National Resources Inventory nonresponse follow-up study: A two-phase sampling approach",
      url: "https://www150.statcan.gc.ca/n1/pub/12-001-x/2018001/article/54929-eng.htm",
      evidenceLabel: "공식 통계기관 2단계 비응답 방법 연구",
      evidenceLabelEn: "Official statistical-agency two-phase nonresponse study",
      publishedOn: "2018-06-29",
      resultPeriod: "2018년 6월 Survey Methodology 게재 · 현장 비응답 추적",
      resultPeriodEn: "Published June 2018 in Survey Methodology; field nonresponse follow-up",
      reviewedOn: REVIEWED_ON
    },
    pubmed_double_sampling_2001: {
      discipline: "medicine",
      title: "Addressing an idiosyncrasy in estimating survival curves using double sampling in the presence of self-selected right censoring",
      url: "https://pubmed.ncbi.nlm.nih.gov/11414553/",
      evidenceLabel: "동료심사 선택적 추적손실 이중표본 연구",
      evidenceLabelEn: "Peer-reviewed double-sampling study under selective loss",
      publishedOn: "2001-06-01",
      resultPeriod: "2001년 출판 · 선택적 중도절단 이론 연구",
      resultPeriodEn: "Published 2001; theoretical study of selective censoring",
      reviewedOn: REVIEWED_ON
    },
    arxiv_longitudinal_subsample_2026: {
      discipline: "medicine",
      title: "Targeted maximum likelihood estimation for longitudinal two-stage designs with outcome subsampling",
      url: "https://arxiv.org/abs/2607.02702",
      evidenceLabel: "미동료심사 2026년 종단 2단계 표본 프리프린트",
      evidenceLabelEn: "Non-peer-reviewed 2026 longitudinal two-stage sampling preprint",
      publishedOn: "2026-07-03",
      resultPeriod: "2026년 7월 3일 초고 · 종단 결과 하위표본",
      resultPeriodEn: "Initial preprint 3 July 2026; longitudinal outcome subsampling",
      reviewedOn: REVIEWED_ON
    }
  });

  const twoPhaseSources = ["manski_missing_2005", "statcan_two_phase_2018", "pubmed_double_sampling_2001", "jds_shadow_mnar_2024"];
  const activeSources = ["pmlr_active_change_2019", "pmlr_no_overlap_2024", "pmlr_overlap_2020"];
  const records = {
    "UP-182": {
      role: pair("상경계 탐색 예산을 넓은 탐색과 국소 정밀화 사이에 배분하는 문제", "Problem allocating phase-boundary experiments between broad exploration and local refinement"),
      updatedDefinition: pair("무지지 재료 공간에서 변화가 한 번 생겨 이후 계속된다고 확신하면 변화가 포착된 구간을 이분해 경계를 빠르게 찾을 수 있다. 그러나 좁은 중간상 영역처럼 변화가 나타났다 사라지면 한 경계에 집중한 정책은 다른 영역을 비우며, 좁은 구간을 아예 만나지 못할 수 있다. 능동 설계의 성능은 경계 오차와 전체 공간의 최악 미시험 간격을 함께 봐야 한다.", "If a change is known to occur once and persist in unsupported materials space, bisecting a detected transition rapidly localizes its boundary. A narrow intermediate-phase pocket can instead appear and disappear; focusing on one boundary then leaves other regions sparse and may miss the pocket entirely. Active design must report boundary error together with the largest untested gap over the full space."),
      knownBoundary: pair("예산 16회에서 균등격자는 지속 경계를 폭 0.026667로, 탐색 8회 뒤 정밀화 8회는 0.000223으로 국소화했다. 반면 최악 미시험 간격은 0.026667에서 0.057143으로 커졌다. 폭 0.02의 일시적 상영역 검출률은 균등 70.97%, 능동 67.74%로 둘 다 95% 관문을 실패했다.", "With a 16-run budget, a uniform grid localized a persistent boundary to width 0.026667, while eight exploratory plus eight refinement runs reached 0.000223. Its largest untested gap, however, grew from 0.026667 to 0.057143. For a transient phase pocket of width 0.02, detection was 70.97% under uniform sampling and 67.74% under active sampling, both failing the 95% gate."),
      bottleneck: pair("능동 정책은 ‘단일 지속 변화점’이라는 구조 가정을 정보로 사용한다. 이 가정이 맞을 때 얻는 국소 정밀도와 틀릴 때 잃는 전역 탐지력 사이에 자유 점심은 없다. 예산 일부를 무조건 탐색에 남기고 가정별 실패 세계를 함께 평가해야 한다.", "The active policy converts a single persistent change-point assumption into information. There is no free gain between local precision when that assumption holds and global detection loss when it fails. A fixed exploration reserve and assumption-specific failure worlds are required."),
      minimumAdvance: pair("실제 봉인 화학계에서 16회 중 최소 12회를 공간충전 탐색에 고정하고 최대 4회만 검출 경계 정밀화에 쓴다. 지속 경계 오차, 일시적 상영역 검출률, 최대 미시험 거리와 최악 Lipschitz 폭을 동시에 공개한다.", "In a real sealed family, reserve at least 12 of 16 runs for space-filling exploration and at most four for refining a detected boundary. Publish persistent-boundary error, transient-pocket detection, maximum untested distance, and worst Lipschitz width together."),
      decisiveTest: pair("단일 계단, 좁은 상주머니, 다중 경계와 무변화 대조군의 위치를 판정팀이 봉인한다. 개발팀은 같은 예산으로 균등·탐색정밀화·혼합 정책을 실행하고, 어느 하나의 지표가 아니라 사전 Pareto 관문으로 비교한다.", "The adjudication team seals locations for a single step, a narrow phase pocket, multiple boundaries, and a no-change control. The development team runs uniform, explore-refine, and hybrid policies at equal budget and compares them using a preregistered Pareto gate rather than one favorable metric."),
      unresolved: pair("이번 결과는 잡음 없는 1차원 좌표와 크기 0.35의 점프를 썼다. 실제 조성·공정 공간은 고차원이고 측정오차와 히스테리시스가 있으며 경계가 면을 이룬다. 후보 거리, 점프 검출 임계값과 안전한 실험 영역을 실제 계측으로 다시 정해야 한다.", "This result used a noiseless one-dimensional coordinate and a jump of 0.35. Real composition-process spaces are high-dimensional with measurement error, hysteresis, and boundary surfaces. Candidate distance, jump threshold, and safe experimental domain must be re-established from real measurements."),
      hypotheses: [
        { code: "H1", claim: pair("탐색 8회·정밀화 8회는 균등 16회보다 상경계를 항상 더 잘 찾는다.", "Eight exploration plus eight refinement runs always find phase boundaries better than 16 uniform runs."), prediction: pair("지속 경계 오차와 최악 미시험 간격이 모두 작고 일시적 상영역 검출률도 높다.", "It has smaller persistent-boundary error and worst untested gap and higher transient-pocket detection."), reject: pair("어느 지표라도 악화되면 보편 우월성을 기각한다. 최악 간격 0.057143과 주머니 검출 67.74%로 기각됐다.", "Reject universal dominance if any metric worsens; worst gap 0.057143 and pocket detection 67.74% reject it.") },
        { code: "H2", claim: pair("단일 지속 상경계에서는 능동 이분 정밀화가 같은 예산의 균등격자보다 효율적이다.", "For a single persistent phase boundary, active bisection is more efficient than an equal-budget uniform grid."), prediction: pair("31개 경계 모두를 검출하고 평균 경계 괄호폭을 0.026667 아래로 줄인다.", "It detects all 31 boundaries and reduces mean bracket width below 0.026667."), reject: pair("잡음·다중 경계 확장시험에서 검출률 95% 또는 괄호폭 우위가 사라지면 해당 조건 밖으로 일반화하지 않는다.", "Do not generalize beyond conditions where noisy or multiple-boundary extensions lose 95% detection or bracket-width advantage.") },
        { code: "H3", claim: pair("탐색예산을 사전 보장한 혼합정책은 경계 정밀도와 전역 최악폭의 Pareto 개선을 만든다.", "A hybrid policy with guaranteed exploration yields a Pareto improvement in boundary precision and global worst width."), prediction: pair("12+4 정책이 균등보다 경계폭을 줄이면서 최악 간격과 주머니 검출률 사전 허용차를 넘지 않는다.", "A 12+4 policy narrows boundary brackets without exceeding preregistered tolerances for worst gap and pocket detection."), reject: pair("동일 봉인 세계에서 균등정책에 Pareto 지배당하거나 비용대응 이득이 없으면 중단한다.", "Stop if the uniform policy Pareto-dominates it or no cost-matched gain remains in the same sealed worlds.") }
      ],
      sourceIds: [...activeSources, "nature_arrows_2023", "github_arrows"]
    },
    "UP-185": {
      role: pair("무작위로 선택한 실패 시료도 복구 가능성에 따라 다시 누락되는 문제", "Problem of outcome-dependent second-stage loss even among randomly selected failed samples"),
      updatedDefinition: pair("누락 실험에서 복구 대상을 무작위로 뽑는 것만으로는 충분하지 않다. 선택된 시료가 파괴됐거나 원파일을 되살릴 수 없어 실제 판정 성공이 원래 결과와 연관되면 두 번째 관측지표가 생긴다. 원장은 초대확률과 실제 복구응답을 분리해 기록하고, 응답한 복구자료만 전체 누락집합처럼 해석하지 않아야 한다.", "Randomly drawing experiments for rescue is insufficient. If selected samples were destroyed or raw files cannot be recovered in a way related to the original outcome, a second observation indicator appears. The ledger must separate invitation probability from actual rescue response and must not treat successful rescues as representative of all missing records."),
      knownBoundary: pair("누락 성공과 실패의 복구확률을 각각 0.7273과 0.4로 둔 2단계 선택오즈 4에서 무보정 모집단 편향은 최초 Γ=1·4·16 세계에서 +0.0437·+0.0585·+0.0329였다. 2단계 Γ를 2로 가정한 좁은 구간은 세 참값을 모두 놓쳤고, Γ=4 구간은 모두 포함했다.", "With rescue probabilities 0.7273 for missing successes and 0.4 for missing failures, second-stage odds ratio 4 produced naive population biases +0.0437, +0.0585, and +0.0329 in first-stage Gamma 1, 4, and 16 worlds. Narrow intervals assuming second-stage Gamma 2 missed all three truths; Gamma-4 intervals contained them."),
      bottleneck: pair("무작위 초대확률 0.25는 설계가중치를 알려 주지만 초대 후 복구응답의 결과의존성은 알려 주지 않는다. 복구 실패 사유가 원결과를 보기 전에 기록돼도 결과와 물리적으로 연관될 수 있어 결과맹검 기록만으로 MAR를 선언할 수 없다.", "Known randomized invitation probability 0.25 supplies a design weight but does not reveal outcome dependence in post-invitation rescue response. Even outcome-blind failure reasons can be physically related to outcome, so prospective recording alone cannot establish MAR."),
      minimumAdvance: pair("복구표본마다 초대 여부, 재접촉·재측정 시도 횟수, 복구 성공, 실패사유와 대체 독립 결과원을 기록한다. 복구 성공률을 성공·실패별로 직접 알 수 없으면 2단계 Γ=1·2·4·8 민감도 구간을 모두 보고한다.", "For every rescue-sample ID, record invitation, number of recontact or remeasurement attempts, rescue success, failure reason, and alternative independent outcome source. If rescue rates by true success and failure remain unknown, report second-stage Gamma 1, 2, 4, and 8 intervals."),
      decisiveTest: pair("누락집합에서 확률표본을 봉인한 뒤 원시료 복구와 별도 보관 중복시료 판정을 병행한다. 중복시료가 독립 참값을 제공하는 하위집합에서 복구응답 선택오즈와 민감도 구간의 포함 여부를 검산한다.", "Seal a probability sample from missing IDs, then attempt original-sample rescue and adjudication of separately stored replicate specimens in parallel. In the subset where replicates provide independent truth, verify rescue-response odds and sensitivity-interval coverage."),
      unresolved: pair("중복시료도 같은 제작 실패를 공유하며 완전한 독립 계측이 아닐 수 있다. 보관비용·안전·열화와 지식재산 제약을 포함한 표본설계가 필요하고, 복구를 반복 시도할수록 시도 중단 자체가 새 선택규칙이 된다.", "Replicate specimens may share the same fabrication failure and are not necessarily independent measurements. Sampling must include storage cost, safety, degradation, and proprietary constraints, while stopping repeated rescue attempts creates another selection rule."),
      hypotheses: [
        { code: "H1", claim: pair("누락 ID를 무작위 초대하면 실제 복구 응답자의 결과는 대표성을 갖는다.", "Random invitation of missing IDs makes outcomes among successful rescues representative."), prediction: pair("결과의존 복구에서도 무보정 편향 절댓값이 0.02 이하다.", "Even under outcome-dependent rescue, naive absolute bias remains at most 0.02."), reject: pair("어느 최초 Γ 세계든 0.02를 넘으면 기각한다. 세 편향 0.0329–0.0585로 기각됐다.", "Reject if any first-stage Gamma world exceeds 0.02; all three biases from 0.0329 to 0.0585 reject it.") },
        { code: "H2", claim: pair("복구응답 선택오즈 상한을 맞게 두면 2단계 MNAR에서도 참값 구간을 유지한다.", "A correct upper bound on rescue-response selection odds retains truth under second-stage MNAR."), prediction: pair("실제 응답오즈 4에서 Γ=4 구간이 세 최초 세계의 참 평균을 모두 포함한다.", "At true response odds 4, Gamma-4 intervals contain the true mean in all three first-stage worlds."), reject: pair("독립 구현이나 유한표본 확장에서 포함 실패가 나타나면 경계식 또는 구간 확장을 기각한다.", "Reject the bound formula or interval expansion if an independent implementation or finite-sample extension loses coverage.") },
        { code: "H3", claim: pair("중복시료 독립 판정은 2단계 Γ를 외부 자료로 제한할 수 있다.", "Independent adjudication of replicate specimens externally constrains second-stage Gamma."), prediction: pair("봉인 중복시료에서 성공·실패별 원시료 복구확률의 동시구간이 Γ=4보다 작은 상한을 준다.", "Sealed replicates yield simultaneous success- and failure-specific rescue-rate intervals with an upper odds bound below 4."), reject: pair("중복시료 가용성이나 판정이 결과에 의존하거나 상한이 무한이면 해당 자료원을 제외한다.", "Exclude the source if replicate availability or adjudication depends on outcome or the upper bound is infinite.") }
      ],
      sourceIds: [...twoPhaseSources, "fair_data_2016", "w3c_provo_2013"]
    },
    "UP-629": {
      role: pair("연속된 두 선택과정에서 어느 확률이 설계로 알려지고 어느 확률이 민감도 가정인지 분해하는 문제", "Problem decomposing which probabilities are known by design and which remain sensitivity assumptions under two sequential selections"),
      updatedDefinition: pair("최초 결과 누락 R₁ 뒤에 누락집합 무작위 초대 S와 실제 복구응답 R₂가 있다. P(S=1|R₁=0)는 설계로 알지만 P(R₂=1|Y,S=1,R₁=0)가 Y에 의존하면 복구자료의 결과분포도 점 식별되지 않는다. 알려진 초대확률은 표본 가중치이며 미지 응답확률의 대체물이 아니다.", "After initial outcome missingness R1, a randomized invitation S and actual rescue response R2 occur within the missing set. P(S=1|R1=0) is known by design, but if P(R2=1|Y,S=1,R1=0) depends on Y, the rescue outcome distribution is not point identified. A known invitation probability is a sampling weight, not a substitute for unknown response probabilities."),
      knownBoundary: pair("2단계 응답오즈가 1이면 복구 응답자 평균이 누락집합 평균과 같아 무보정 편향은 0이었다. 응답오즈 4에서는 복구 관측 성공률이 참 누락 성공률보다 커졌고, Γ=1·2 구간은 참값을 놓쳤다. 올바른 Γ=4의 전체 모집단 폭은 최초 Γ=1·4·16에서 0.0637·0.1150·0.1011이었다.", "At second-stage response odds 1, responder and missing-set means coincide and naive bias is zero. At response odds 4, observed rescue success exceeded true missing success and Gamma-1 and Gamma-2 intervals missed truth. Correct Gamma-4 full-population widths were 0.0637, 0.1150, and 0.1011 in first-stage Gamma 1, 4, and 16 worlds."),
      bottleneck: pair("초대와 응답을 한 성향으로 합치면 무작위화된 부분과 결과의존 부분을 구분할 수 없다. 각 단계 지지집합과 선택오즈를 조건부로 정의하고, 최초 누락 불확실성과 복구응답 불확실성을 중첩해야 한다.", "Collapsing invitation and response into one propensity hides the distinction between randomized and outcome-dependent components. Support and selection odds must be defined conditionally at each stage, nesting initial-missingness and rescue-response uncertainty."),
      minimumAdvance: pair("분석표에 모든 선택지표 R₁,S,R₂와 각 단계 분모를 보존하고, P(S)에는 설계확률을, R₂에는 관측자료가 아닌 외부 민감도 범위를 적용한다. Γ를 과소 지정한 좁은 구간은 폭 관문 통과 여부와 무관하게 기각한다.", "Retain every selection indicator R1, S, and R2 and each stage denominator; use design probability for S and an externally justified sensitivity range, not an observed-data estimate, for R2. Reject an interval with underspecified Gamma regardless of its narrow width."),
      decisiveTest: pair("같은 최초 관측분포와 초대확률을 유지한 채 R₂의 성공·실패 응답오즈만 1과 4로 바꾼 두 세계를 구성한다. 각 Γ 구간의 참값 포함·폭·무보정 편향을 독립 식으로 검산하고 유한표본 동시구간으로 확장한다.", "Hold the initial observed distribution and invitation probability fixed while changing only success-to-failure response odds of R2 from 1 to 4. Independently verify truth containment, width, and naive bias for each Gamma interval, then extend to finite-sample simultaneous intervals."),
      unresolved: pair("이번 계산은 기대 관측분포의 식별구간이며 유한 복구표본의 추정오차를 아직 중첩하지 않았다. 시간가변 재접촉, 반복 시도와 공변량별 응답이 있으면 선택경로 수가 늘어나므로 순차 민감도 모수의 차원축소가 필요하다.", "This calculation gives identification intervals at the expected observed distribution and does not yet layer finite rescue-sample uncertainty. Time-varying recontact, repeated attempts, and covariate-specific response multiply selection paths, requiring dimension reduction for sequential sensitivity parameters."),
      hypotheses: [
        { code: "H1", claim: pair("알려진 무작위 초대확률은 초대 후 결과의존 비응답까지 제거한다.", "A known randomized invitation probability removes outcome-dependent nonresponse after invitation."), prediction: pair("응답오즈 4에서도 복구 응답자 평균이 누락집합 평균과 같다.", "Even at response odds 4, the rescue-responder mean equals the missing-set mean."), reject: pair("동일 초대 설계에서 응답오즈만 바꿔 무보정 평균이 변하면 기각한다. 세 최초 세계에서 모두 변해 기각됐다.", "Reject if changing only response odds under the same invitation design changes the naive mean; it changed in all three first-stage worlds.") },
        { code: "H2", claim: pair("각 선택단계를 조건부 선택오즈로 분리하면 2단계 MNAR 식별구간을 구성할 수 있다.", "Conditionally separating each selection stage yields identification intervals under two-stage MNAR."), prediction: pair("실제 R₂ 오즈상한을 포함한 모든 Γ 구간이 참 평균을 포함하고, 더 작은 Γ는 적어도 한 대조 세계에서 실패한다.", "Every interval whose Gamma includes the true R2 odds contains the mean, while a smaller Gamma fails in at least one control world."), reject: pair("독립 선형계획이 공식 밖의 허용값을 찾거나 공식 안의 끝점을 실현하지 못하면 기각한다.", "Reject if an independent linear program finds feasible values outside the formula or cannot realize its endpoints.") },
        { code: "H3", claim: pair("그림자변수나 독립 중복시료는 R₂ 민감도 범위를 줄일 수 있다.", "A shadow variable or independent replicate specimen can narrow the R2 sensitivity range."), prediction: pair("결과연관성과 조건부 누락독립을 봉인 검증한 보조자료가 Γ=4 구간보다 좁고 95% 이상 포함하는 구간을 낸다.", "Sealed auxiliary data validating outcome association and conditional missingness independence yield intervals narrower than Gamma 4 with at least 95% coverage."), reject: pair("보조자료 가용성이 복구응답과 같은 원인에 좌우되거나 외부 커버리지가 실패하면 제외한다.", "Exclude it if auxiliary-data availability shares causes with rescue response or external coverage fails.") }
      ],
      sourceIds: [...twoPhaseSources, "arxiv_longitudinal_subsample_2026", "neurips_ope_interval_2020"]
    },
    "UP-430": {
      role: pair("무작위 재접촉 초대와 실제 환자 응답을 분리해 하위집단 결론의 2차 추적편향을 제한하는 문제", "Problem separating randomized recontact invitation from actual patient response to bound secondary attrition bias in subgroup conclusions"),
      updatedDefinition: pair("추적손실 환자를 무작위로 재접촉해도 응답 여부가 현재 건강상태와 관련되면 응답자의 결과는 전체 추적손실 집단을 대표하지 않는다. 초대확률은 알려져도 응답확률은 결과를 조건으로 달라질 수 있으므로 두 확률을 별도 기록하고 민감도 분석해야 한다.", "Even after randomly inviting patients lost to follow-up, respondents need not represent all lost patients if response depends on current health. Invitation probability is known, while response can vary with outcome; the two probabilities therefore require separate records and sensitivity analyses."),
      knownBoundary: pair("합성 2단계 응답오즈 4에서는 무보정 전체 반응률이 참값보다 3.29–5.85%p 높았다. 응답오즈를 2 이하로 가정한 구간은 참값을 놓쳤지만 4를 허용한 구간은 세 최초 추적손실 세계를 모두 포함했고 폭은 0.0637–0.1150이었다.", "With synthetic second-stage response odds 4, naive full response rates exceeded truth by 3.29 to 5.85 percentage points. Intervals restricting response odds to 2 missed truth, while bounds allowing 4 contained all three initial-attrition worlds with widths from 0.0637 to 0.1150."),
      bottleneck: pair("재접촉 불응의 참 결과는 여전히 보이지 않으며 환자 부담·동의·사망 때문에 반복 접촉을 무한히 늘릴 수 없다. 행정기록 같은 독립 결과원이 응답 여부와 다른 경로로 결과를 제공해야 2차 선택을 줄일 수 있다.", "True outcomes of recontact nonresponders remain unseen, and burden, consent, and death preclude unlimited attempts. An independent source such as administrative records must supply outcomes through a path distinct from recontact response to reduce secondary selection."),
      minimumAdvance: pair("윤리승인 설계에서 초대·연락도달·동의·결과확인을 단계별로 기록하고 각 단계의 확률과 중단 사유를 공개한다. 하위집단 결론은 임상적 최소차이가 Γ=1–4 전체 구간 밖에 있을 때만 방향을 제시한다.", "In an ethics-approved design, record invitation, contact, consent, and outcome ascertainment as separate stages with probabilities and stopping reasons. State subgroup direction only when the clinically meaningful threshold lies outside the entire Gamma 1-to-4 interval."),
      decisiveTest: pair("무작위 재접촉 응답과 독립 행정결과를 함께 얻을 수 있는 봉인 하위집단에서 응답오즈를 직접 추정한다. 재접촉만 쓴 값, Γ 민감도 값과 독립 결과값의 포함·폭을 분석팀과 분리해 판정한다.", "In a sealed subgroup with both randomized recontact response and independent administrative outcomes, estimate response odds directly. A team separate from analysis adjudicates coverage and width of recontact-only, Gamma-sensitivity, and independent-source values."),
      unresolved: pair("행정결과도 보험가입·의료이용에 따라 누락될 수 있고 임상결과를 완전히 대리하지 못한다. 실제 적용은 개인정보 최소화, 동의철회, 사망정보 처리와 재접촉 중단규칙을 포함해야 하며 여기의 수치를 진료 권고로 사용할 수 없다.", "Administrative outcomes can also be missing by insurance or healthcare use and may not proxy the clinical endpoint fully. Real use requires privacy minimization, withdrawal handling, mortality governance, and recontact stopping rules; these synthetic numbers are not clinical recommendations."),
      hypotheses: [
        { code: "H1", claim: pair("무작위 재접촉 초대만으로 추적손실 편향은 제거된다.", "Randomized recontact invitation alone removes attrition bias."), prediction: pair("건강결과에 따라 응답확률이 달라도 응답자 반응률이 전체 누락집단 반응률과 같다.", "Responder and full missing-group rates coincide even when response probability depends on health outcome."), reject: pair("결과의존 응답에서 0.02 초과 편향이 나오면 기각한다. 세 세계가 모두 실패했다.", "Reject upon bias above 0.02 under outcome-dependent response; all three worlds failed.") },
        { code: "H2", claim: pair("2차 응답오즈 민감도는 재접촉 불응이 결론을 뒤집을 범위를 명시한다.", "Second-stage response-odds sensitivity states when recontact nonresponse can reverse a conclusion."), prediction: pair("독립 결과원이 산출한 참값이 실제 응답오즈를 포함한 구간 안에 있고 과소 Γ 구간 밖에 놓인다.", "Truth from an independent source lies inside intervals containing actual response odds and outside underspecified-Gamma intervals."), reject: pair("다른 기관과 하위집단에서 독립결과 커버리지가 95% 미만이면 현재 민감도 모형을 기각한다.", "Reject the current sensitivity model if independent-outcome coverage is below 95% across institutions and subgroups.") },
        { code: "H3", claim: pair("독립 행정결과와 재접촉을 결합하면 환자 부담을 줄이면서 Γ를 제한한다.", "Combining independent administrative outcomes with recontact constrains Gamma while reducing patient burden."), prediction: pair("행정결과 연결 표본이 재접촉 100명 설계보다 적은 접촉으로 같은 폭·커버리지 관문을 통과한다.", "A linked administrative-outcome sample passes the same width and coverage gates with fewer patient contacts than a 100-recontact design."), reject: pair("행정자료 선택과 측정오차를 포함하면 구간이 더 넓거나 커버리지가 실패할 경우 중단한다.", "Stop if including administrative selection and measurement error makes intervals wider or loses coverage.") }
      ],
      sourceIds: [...twoPhaseSources, "arxiv_longitudinal_subsample_2026", "pmlr_candor_2026"]
    }
  };

  const secondStageConnection = {
    id: "CONN-SECOND-001",
    problemIds: ["UP-182", "UP-185", "UP-629", "UP-430"],
    type: pair("복구·재접촉이 만드는 두 번째 선택 연산자", "A second selection operator created by rescue or recontact"),
    strength: "analytic-counterexample",
    sharedBottleneck: pair("누락집합에서 확률표본을 초대해도 실제 복구응답이 결과에 의존하면 응답자 결과가 다시 선택된다. 알려진 초대확률은 두 번째 결과의존 응답확률을 식별하지 않는다.", "Even after probability-sampling invitations from the missing set, actual rescue response reselects outcomes when it depends on them. Known invitation probability does not identify the second outcome-dependent response probability."),
    mapping: pair("누락 실험 ID↔추적손실 환자, 무작위 재측정 선정↔무작위 재접촉 초대, 시료 복구 성공↔환자 응답, 중복시료 판정↔독립 행정결과 확인이 대응한다.", "Missing experiment IDs map to patients lost to follow-up; randomized remeasurement selection to randomized recontact invitation; successful specimen rescue to patient response; and replicate adjudication to independent administrative outcome ascertainment."),
    transferableMethod: pair("초대와 응답 지표·확률을 분리하고 2차 선택오즈 Γ별 부분식별 구간을 계산한다. 독립 중복시료나 행정결과가 있는 봉인 하위집단에서 Γ와 커버리지를 외부 판정한다.", "Separate invitation and response indicators and probabilities, then compute partial-identification intervals by second-stage selection-odds Gamma. Externally adjudicate Gamma and coverage in a sealed subset with independent replicates or administrative outcomes."),
    evidence: pair("응답오즈 4에서 무작위 초대 후 무보정 편향은 0.0329–0.0585였고 Γ=2 구간은 세 참값을 놓쳤다. 올바른 Γ=4 구간은 세 값을 포함했다.", "At response odds 4, naive bias after randomized invitation was 0.0329 to 0.0585, and Gamma-2 intervals missed all three truths. Correct Gamma-4 intervals contained them."),
    validationStatus: pair("기대 관측분포 해석 반례 검산 · 유한표본·실제 복구 대기", "Analytic counterexample verified at expected observed distributions; finite-sample and real-rescue validation pending"),
    failureBoundary: pair("초대 후 응답이 실제로 결과와 독립이거나 독립 결과원이 모든 비응답자의 결과를 제공하면 2차 민감도는 불필요하다. 반복 접촉·시간의존 선택에는 단일 Γ가 부족하다.", "Second-stage sensitivity is unnecessary if post-invitation response is outcome-independent or an independent source supplies every nonresponder outcome. One Gamma is insufficient for repeated contact and time-dependent selection."),
    minimumTest: pair("누락집합 확률표본의 모든 초대·응답을 보존하고 일부에는 독립 결과원을 연결한다. Γ=1·2·4·8 구간 중 독립 참값을 포함하는 최소 Γ와 외부 커버리지를 보고한다.", "Retain every invitation and response in a probability sample of missing records and link an independent outcome source for a subset. Report the smallest of Gamma 1, 2, 4, and 8 containing independent truth and its external coverage."),
    sourceIds: ["statcan_two_phase_2018", "pubmed_double_sampling_2001", "manski_missing_2005", "jds_shadow_mnar_2024"]
  };
  if (!connections.some(({ id }) => id === secondStageConnection.id)) connections.push(secondStageConnection);

  const cycle = {
    id: "RC-2026-07",
    title: "복구가 다시 실패하면 무엇을 알 수 있는가",
    titleEn: "What remains identifiable when rescue fails again?",
    status: "active",
    startedOn: REVIEWED_ON,
    reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records),
    connectionIds: ["CONN-SECOND-001", "CONN-PROV-001", "CONN-IDENT-001", "CONN-CAUSAL-001"],
    selectionReason: "RC-2026-06은 누락 ID 100개 무작위 복구를 통과시켰지만 실제 복구 성공을 완전하다고 두었다. 이번 사이클은 초대 후 응답도 결과에 의존하는 두 번째 MNAR를 추가해 알려진 설계확률과 미지 응답확률을 분리했다. 동시에 능동 상경계 탐지가 국소 정밀도는 높이면서 전역 공백과 일시적 상영역 탐지를 악화시키는지 동일 16회 예산에서 판정했다.",
    selectionReasonEn: "RC-2026-06 passed random rescue of 100 missing IDs but assumed complete rescue response. This cycle adds a second MNAR layer after invitation, separating known design probability from unknown response probability. It also tests under the same 16-run budget whether active phase-boundary search improves local precision while worsening global gaps and transient-pocket detection.",
    verifiedFindings: [
      { text: "무작위 초대확률 0.25를 알아도 복구 성공확률이 성공 0.7273·실패 0.4이면 무보정 모집단 편향은 최초 Γ=1·4·16에서 +0.0437·+0.0585·+0.0329였다.", textEn: "Even with known randomized invitation probability 0.25, rescue probabilities 0.7273 for successes and 0.4 for failures produced naive population biases +0.0437, +0.0585, and +0.0329 in first-stage Gamma 1, 4, and 16 worlds.", sourceIds: ["statcan_two_phase_2018", "pubmed_double_sampling_2001"] },
      { text: "실제 2차 응답오즈 4를 Γ=1 또는 2로 과소 제한한 구간은 세 참값을 모두 놓쳤다. Γ=4 구간은 모두 포함했고 전체 폭은 0.0637·0.1150·0.1011이었다.", textEn: "Intervals underspecifying true second-stage response odds 4 as Gamma 1 or 2 missed all three truths. Gamma-4 intervals contained them with full-population widths 0.0637, 0.1150, and 0.1011.", sourceIds: ["manski_missing_2005", "jds_shadow_mnar_2024"] },
      { text: "초대확률은 표본 가중치를 정하지만 기대 관측분포의 식별구간 폭을 바꾸지 않는다. 초대와 복구응답을 한 성향으로 합치면 무작위 설계와 결과의존 선택을 혼동한다.", textEn: "Invitation probability determines design weights but does not change identification width at the expected observed distribution. Collapsing invitation and rescue response into one propensity conflates random design with outcome-dependent selection.", sourceIds: ["statcan_two_phase_2018"] },
      { text: "지속 단일 경계 31개에서 균등 16회와 탐색8+정밀화8은 모두 100% 검출했지만 평균 괄호폭은 0.026667 대 0.000223이었다.", textEn: "Across 31 persistent single boundaries, both uniform-16 and explore-8-refine-8 detected 100%, while mean bracket widths were 0.026667 and 0.000223.", sourceIds: ["pmlr_active_change_2019"] },
      { text: "능동정밀화의 최대 미시험 간격은 0.057143으로 균등격자 0.026667의 2.14배였다. 폭 0.02 일시적 상영역 검출률도 능동 67.74%, 균등 70.97%로 둘 다 95%를 실패했다.", textEn: "Active refinement's maximum untested gap was 0.057143, 2.14 times the uniform grid's 0.026667. Detection of transient phase pockets of width 0.02 was 67.74% active and 70.97% uniform, both failing 95%.", sourceIds: ["pmlr_active_change_2019", "pmlr_no_overlap_2024"] },
      { text: "2026년 종단 2단계 결과 하위표본 TMLE는 최신 관련 방향이지만 아직 프리프린트이며, 이번 해석적 2차 MNAR 경계를 대체하는 실증 근거로 사용하지 않았다.", textEn: "A 2026 longitudinal two-stage outcome-subsampling TMLE is a relevant recent direction but remains a preprint and was not treated as empirical validation replacing this analytic second-stage MNAR boundary.", sourceIds: ["arxiv_longitudinal_subsample_2026"] }
    ],
    resultMatrix: {
      title: pair("2단계 선택과 능동 탐색의 판정 결과", "Adjudication of second-stage selection and active exploration"),
      note: pair("2단계 구간은 기대 관측분포의 식별폭이며 아직 유한표본 오차를 포함하지 않는다. 경계시험은 잡음 없는 1차원 봉인 세계다.", "Second-stage intervals are identification widths at expected observed distributions and do not yet include finite-sample error. Boundary tests use noiseless one-dimensional sealed worlds."),
      columns: [pair("시험", "Test"), pair("조건", "Condition"), pair("주 결과", "Primary result"), pair("보조 결과", "Secondary result"), pair("판정", "Decision")],
      rows: [
        { label: pair("복구 무보정", "Naive rescue"), values: ["R₂ odds=4", pair("편향 +0.0329–0.0585", "Bias +0.0329 to +0.0585"), "πinvite=0.25", pair("기각", "Reject")] },
        { label: pair("복구 Γ=2", "Rescue Gamma 2"), values: ["R₂ odds=4", pair("참값 0/3 포함", "Truth 0/3 contained"), pair("폭은 좁음", "Intervals narrow"), pair("과소 민감도", "Underspecified")] },
        { label: pair("복구 Γ=4", "Rescue Gamma 4"), values: ["R₂ odds=4", pair("참값 3/3 포함", "Truth 3/3 contained"), "폭 0.0637–0.1150", pair("식별 관문 통과", "Identification gate passes")] },
        { label: pair("균등 경계탐색", "Uniform boundary search"), values: ["16 runs", "괄호 0.026667", "최악 간격 0.026667", pair("전역 기준", "Global baseline")] },
        { label: pair("능동 경계탐색", "Active boundary search"), values: ["8+8 runs", "괄호 0.000223", "최악 간격 0.057143", pair("국소 우위·전역 손실", "Local gain; global loss")] },
        { label: pair("좁은 상주머니", "Narrow phase pocket"), values: ["width 0.02", pair("균등 70.97%", "Uniform 70.97%"), pair("능동 67.74%", "Active 67.74%"), pair("둘 다 실패", "Both fail")] }
      ]
    },
    sharedProgram: {
      name: pair("연속 선택과 탐색–정밀화 절충 시험", "Sequential-selection and exploration-refinement tradeoff test"),
      thesis: pair("복구와 능동 실험은 새 정보를 만들지만 그 자체가 새 선택을 만든다. 각 단계의 알려진 설계확률·미지 응답확률과 국소·전역 정보손실을 분리해야 한다.", "Rescue and active experiments create information but also new selection. Each stage's known design probability, unknown response probability, and local versus global information loss must be separated."),
      design: pair("최초 Γ=1·4·16 누락 세계에 균등 초대 π=0.25와 2차 응답오즈 1·4를 교차하고 Γ=1·2·4·8 경계를 계산했다. 상경계는 31개 지속 계단과 31개 폭 0.02 주머니에서 균등16과 탐색8+정밀화8을 같은 예산으로 비교했다.", "Crossed first-stage Gamma 1, 4, and 16 missingness worlds with uniform invitation pi=0.25 and second-stage response odds 1 and 4, computing Gamma 1, 2, 4, and 8 bounds. Compared uniform-16 with explore-8-refine-8 at equal budget across 31 persistent steps and 31 pockets of width 0.02."),
      adjudication: pair("2차 참값과 관측분포를 해석식으로 고정해 민감도 끝점 포함을 독립 검산했다. 경계 위치와 유형은 전략 입력에서 숨겼고 경계 괄호·최악간격·검출률을 모두 보존했다.", "Fixed second-stage truths and observed distributions analytically and independently checked sensitivity-endpoint containment. Hid boundary locations and types from strategy inputs and retained bracket, worst-gap, and detection metrics together."),
      primaryMetrics: pair("무보정 편향, Γ별 참값 포함과 모집단 폭, 지속 경계 검출·괄호폭, 전역 최대 미시험 간격, 일시적 상영역 검출률", "Naive bias, truth containment and population width by Gamma, persistent-boundary detection and bracket width, global maximum untested gap, and transient-pocket detection"),
      successRule: pair("복구구간은 외부 근거가 허용하는 모든 R₂ Γ에서 참값을 포함하고 폭≤0.12여야 한다. 능동정책은 경계폭을 줄이면서 최대 미시험 간격과 주머니 검출률의 사전 허용차를 모두 지켜야 한다.", "Rescue intervals must contain truth and remain width at most 0.12 across every externally supported R2 Gamma. An active policy must narrow boundary brackets while respecting preregistered tolerances for maximum untested gap and pocket detection."),
      stopRule: pair("무작위 초대를 완전 복구로 간주하지 않는다. 좁지만 Γ를 과소 지정한 구간은 거부하고, 국소 경계오차만 좋아진 능동정책을 보편적으로 우월하다고 부르지 않는다.", "Do not equate randomized invitation with complete rescue. Reject narrow intervals with underspecified Gamma, and do not call an active policy universally superior from local boundary error alone."),
      status: pair("2차 MNAR 해석 반례·동일예산 경계대조 완료 · 유한표본·잡음·실제 독립결과원 대기", "Second-stage MNAR analytic controls and equal-budget boundary controls complete; finite samples, noise, and real independent outcomes pending")
    },
    artifacts: [
      { title: pair("2단계 MNAR 복구 규격", "Second-stage MNAR rescue specification"), description: pair("최초 Γ 세계, 무작위 초대확률, 결과별 복구응답과 2차 민감도·폭·편향 관문을 고정한 규격", "Frozen first-stage Gamma worlds, randomized invitation probability, outcome-specific rescue response, and second-stage sensitivity, width, and bias gates"), url: "research/two-phase/rescue-spec.json", kind: "JSON" },
      { title: pair("2단계 복구 결과", "Second-stage rescue results"), description: pair("여섯 세계의 참 누락성공률, 복구 관측분포, 무보정 편향과 Γ=1·2·4·8 모집단 경계를 기록한 결과", "Results recording true missing success, rescue observed distributions, naive bias, and Gamma 1, 2, 4, and 8 population bounds in six worlds"), url: "research/two-phase/rescue-result.json", kind: "JSON" },
      { title: pair("능동 상경계 벤치마크 규격", "Active phase-boundary benchmark specification"), description: pair("동일 16회 예산, 지속 경계·일시적 상주머니, 균등·탐색정밀화 전략과 다중 판정량을 고정한 규격", "Frozen equal 16-run budget, persistent boundaries, transient phase pockets, uniform and explore-refine strategies, and multiple adjudication metrics"), url: "research/active-boundary/benchmark-spec.json", kind: "JSON" },
      { title: pair("능동 경계 결과", "Active boundary results"), description: pair("31개 경계와 31개 상주머니의 검출률·괄호폭·최대 미시험 간격 및 비우월성 판정을 기록한 결과", "Results recording detection, bracket width, maximum untested gap, and non-dominance across 31 boundaries and 31 phase pockets"), url: "research/active-boundary/benchmark-result.json", kind: "JSON" },
      { title: pair("2단계 복구 실행기", "Second-stage rescue runner"), description: pair("초대 후 결과의존 응답 관측분포와 각 Γ 식별경계를 의존성 없이 재계산하는 코드", "Dependency-free runner recomputing post-invitation outcome-dependent response distributions and identification bounds for every Gamma"), url: "scripts/run-two-phase-rescue.mjs", kind: "JavaScript" },
      { title: pair("능동 경계 실행기", "Active boundary runner"), description: pair("봉인 경계와 상주머니에서 균등·탐색정밀화 정책을 같은 예산으로 실행하고 다중 지표를 계산하는 코드", "Runner executing uniform and explore-refine policies at equal budget over sealed boundaries and phase pockets and computing multiple metrics"), url: "scripts/run-active-boundary.mjs", kind: "JavaScript" },
      { title: pair("2단계·능동 독립 검증", "Independent two-stage and active verification"), description: pair("올바른 Γ 포함, 과소 Γ 실패, 능동 국소 이득과 전역 손실을 별도로 검사하는 검증기", "Independent verifier for correct-Gamma containment, underspecified-Gamma failure, active local gain, and global coverage loss"), url: "scripts/verify-two-phase-active.mjs", kind: "JavaScript" }
    ],
    log: [
      pair("RC-2026-06의 다음 작업인 복구 후 비응답과 능동 경계 탐지를 그대로 채택했다.", "Adopted post-rescue nonresponse and active boundary search directly from RC-2026-06's next step."),
      pair("초대확률과 실제 복구응답확률을 분리해 무작위 설계가 두 번째 MNAR를 지우지 않도록 했다.", "Separated invitation from actual rescue response so randomized design could not erase second-stage MNAR."),
      pair("응답오즈 4를 Γ=2로 과소 지정한 구간이 좁아도 참값을 놓친 사실을 실패로 보존했다.", "Retained the failure of narrow Gamma-2 intervals to cover truths generated at response odds 4."),
      pair("능동정책을 지속 단일 경계에만 평가하지 않고 같은 개발 가정으로 놓칠 수 있는 좁은 상주머니를 함께 봉인했다.", "Did not evaluate the active policy only on persistent single boundaries; also sealed narrow phase pockets that violate its development assumption."),
      pair("능동 국소화의 120배 이득과 최악 간격 2.14배 악화를 한 판정표에 함께 남겼다.", "Kept the roughly 120-fold localization gain and 2.14-fold worsening of worst gap in the same decision table."),
      pair("2026년 종단 2단계 TMLE는 프리프린트로 표시하고 실제 환자자료 검증으로 오인하지 않았다.", "Marked the 2026 longitudinal two-stage TMLE as a preprint rather than real-patient validation of this cycle.")
    ],
    nextCycle: pair("2단계 Γ 경계에 유한 복구표본의 다항 표본오차를 중첩하고, 재응답 실패가 있는 100·250·500 초대에서 동시구간 커버리지와 폭을 정확 열거한다. 경계탐지는 12회 공간충전+4회 정밀화 혼합정책과 잡음·다중경계 세계를 추가해 균등16에 대한 Pareto 비지배 여부를 봉인 판정한다.", "Layer finite rescue-sample multinomial uncertainty onto second-stage Gamma bounds and exactly enumerate simultaneous-interval coverage and width for 100, 250, and 500 invitations with rescue nonresponse. For boundary search, add a 12-space-filling-plus-4-refinement hybrid and noisy multiple-boundary worlds, then seal whether it is Pareto non-dominated relative to uniform-16."),
    sourceIds: [...twoPhaseSources, ...activeSources, "arxiv_longitudinal_subsample_2026", "pmlr_candor_2026", "nature_arrows_2023"]
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
