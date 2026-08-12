/* RC-2026-06: prospective completeness auditing, random rescue, and sealed smoothness transfer. */
(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    fair_data_2016: {
      discipline: "computer",
      title: "The FAIR Guiding Principles for scientific data management and stewardship",
      url: "https://doi.org/10.1038/sdata.2016.18",
      evidenceLabel: "동료심사 연구데이터 원칙",
      evidenceLabelEn: "Peer-reviewed research-data principles",
      publishedOn: "2016-03-15",
      resultPeriod: "2016년 3월 15일 출판 · 데이터 관리 원칙",
      resultPeriodEn: "Published 15 March 2016; data-stewardship principles",
      reviewedOn: REVIEWED_ON
    },
    w3c_provo_2013: {
      discipline: "computer",
      title: "PROV-O: The PROV Ontology",
      url: "https://www.w3.org/TR/prov-o/",
      evidenceLabel: "W3C 출처추적 권고안",
      evidenceLabelEn: "W3C provenance recommendation",
      publishedOn: "2013-04-30",
      resultPeriod: "2013년 4월 30일 W3C 권고",
      resultPeriodEn: "W3C Recommendation dated 30 April 2013",
      reviewedOn: REVIEWED_ON
    },
    jds_shadow_mnar_2024: {
      discipline: "mathematics",
      title: "Identification and Semiparametric Efficiency Theory of Nonignorable Missing Data with a Shadow Variable",
      url: "https://doi.org/10.1145/3592389",
      evidenceLabel: "동료심사 MNAR 그림자변수 식별 연구",
      evidenceLabelEn: "Peer-reviewed MNAR shadow-variable identification study",
      publishedOn: "2024-04-08",
      resultPeriod: "2024년 4월 8일 출판 · 이론·모의·실자료 연구",
      resultPeriodEn: "Published 8 April 2024; theory, simulation, and real-data study",
      reviewedOn: REVIEWED_ON
    },
    arxiv_weak_shadow_2026: {
      discipline: "mathematics",
      title: "Partial Identification under Missing Data Using Weak Shadow Variables from Pretrained Models",
      url: "https://arxiv.org/abs/2602.16061",
      evidenceLabel: "미동료심사 2026년 부분식별 프리프린트",
      evidenceLabelEn: "Non-peer-reviewed 2026 partial-identification preprint",
      publishedOn: "2026-02-17",
      resultPeriod: "2026년 2월 17일 초고 · 2026년 6월 개정",
      resultPeriodEn: "Initial preprint 17 February 2026; revised June 2026",
      reviewedOn: REVIEWED_ON
    }
  });

  const auditSources = ["manski_missing_2005", "jds_shadow_mnar_2024", "fair_data_2016", "w3c_provo_2013"];
  const smoothSources = ["pmlr_no_overlap_2024", "pmlr_overlap_2020", "nature_arrows_2023"];
  const records = {
    "UP-182": {
      role: pair("무지지 재료 후보의 값 구간을 평활 외삽과 직접 표본 사이에서 판정하는 문제", "Problem adjudicating value bounds for unsupported material candidates between smooth extrapolation and direct sampling"),
      updatedDefinition: pair(
        "과거 후보와 가깝다는 이유만으로 미시도 조리법의 성공률을 정할 수는 없다. 조성·전구체·공정 거리에 대해 결과함수가 실제로 Lipschitz 연속이라는 외부 증거가 있을 때만 가까운 관측값이 무지지 후보의 상·하한을 제한한다. 상전이처럼 작은 입력 변화가 결과를 불연속적으로 바꾸면 같은 공식이 과신 구간을 만든다.",
        "An untried recipe's success rate is not determined merely because it is close to past candidates. Nearby observations constrain unsupported outcomes only with external evidence that the response is Lipschitz in composition, precursor, and process distance. A phase transition can turn the same formula into an overconfident interval by making a small input change produce a discontinuous outcome shift."
      ),
      knownBoundary: pair(
        "개발구간 x≤0.6에서 두 세계는 y=0.25+0.45x로 완전히 같아 적합 Lipschitz 상수도 0.45였다. 전역 매끈 세계의 봉인구간 평균 폭은 0.1913·커버리지 100%로 10회 직접시험 폭의 25.0%였지만, x≥0.72에서 0.35 점프가 있는 세계는 같은 폭에서 커버리지 25%였다.",
        "For x at most 0.6, both worlds were identically y=0.25+0.45x and fitted the same Lipschitz constant 0.45. In the globally smooth world, sealed-grid mean width was 0.1913 with 100% coverage, only 25.0% of the ten-run direct interval; a world with a 0.35 jump at x=0.72 had only 25% coverage at the same width."
      ),
      bottleneck: pair(
        "개발자료 안의 최대 기울기는 관측하지 않은 상경계를 반증할 수 없다. 상수를 두 배로 늘려도 숨은 경계 커버리지는 25%였고 최대 미포함 거리는 0.2938이었다. 따라서 거리척도와 상수보다 경계 탐지·봉인 외부검증이 먼저다.",
        "The maximum slope inside development data cannot refute an unseen phase boundary. Doubling the constant still gave 25% coverage in the hidden-boundary world with maximum miss 0.2938. Boundary detection and sealed external validation therefore precede use of the metric or constant."
      ),
      minimumAdvance: pair(
        "화학계 하나를 조성·전구체·최고온도 축으로 봉인하고 개발 영역 밖 16개 지점을 사전 등록해 직접 측정한다. 평활 구간이 95% 이상을 포함하고 평균 폭이 같은 비용의 무작위 정확구간보다 좁을 때만 해당 화학계 안에서 무지지 경계를 줄인다.",
        "Seal one chemical family over composition, precursor, and peak-temperature axes and preregister 16 direct measurements outside the development region. Tighten no-support bounds within that family only if smoothness intervals cover at least 95% and are narrower on average than a cost-matched randomized exact interval."
      ),
      decisiveTest: pair(
        "개발팀은 봉인 결과를 보지 않고 거리와 L을 고정하고, 판정팀은 각 외부 지점의 포함 여부와 최대 위반을 계산한다. 한 점이라도 알려진 상·구조 경계를 넘으면 별도 체제로 분리하며, 안전계수를 사후 조정해 실패를 지우지 않는다.",
        "The development team fixes the metric and L without seeing sealed outcomes; the adjudication team computes coverage and maximum violation at every external point. Any known phase or structural boundary defines a separate regime, and post hoc safety-factor inflation cannot erase failure."
      ),
      unresolved: pair(
        "합성 결과는 이진 성공이 아니라 상분율·수율·불순물·비용의 벡터이고, 적절한 거리도 조성만으로 정해지지 않는다. 실제 ARROWS 공개 예시는 경로 결과를 제공하지만 시간순 후보집합과 독립 판정이 없어 이번 봉인 시험을 직접 수행할 수 없다.",
        "Synthesis outcome is a vector of phase fraction, yield, impurity, and cost rather than one binary success, and an adequate distance is not composition-only. The public ARROWS example supplies route outcomes but lacks chronological candidate sets and independent adjudication needed for this sealed test."
      ),
      hypotheses: [
        { code: "H1", claim: pair("개발영역에서 적합한 Lipschitz 상수는 같은 화학계의 무지지 영역에서도 유효하다.", "A Lipschitz constant fitted in the development region remains valid in unsupported parts of the same chemical family."), prediction: pair("봉인 16점에서 95% 이상 커버리지와 0.7641 미만 평균 폭을 동시에 만족한다.", "It simultaneously achieves at least 95% coverage and mean width below 0.7641 on 16 sealed points."), reject: pair("사전 고정 거리·상수의 봉인 커버리지가 95% 아래면 해당 화학계 이전을 기각한다. 숨은 상경계 세계의 25%가 이를 기각했다.", "Reject transfer within the family if sealed coverage of the fixed metric and constant is below 95%; the hidden-phase world's 25% does so.") },
        { code: "H2", claim: pair("안전계수 두 배면 관측하지 않은 상경계까지 흡수할 수 있다.", "Doubling the safety factor absorbs an unseen phase boundary."), prediction: pair("L=0.9 구간이 숨은 점프 세계의 16점을 95% 이상 포함한다.", "Intervals using L=0.9 cover at least 95% of the 16 hidden-jump points."), reject: pair("두 배 구간도 95% 미만이면 기각한다. 커버리지 25%·최대 위반 0.2938로 기각됐다.", "Reject if doubled intervals still cover below 95%; 25% coverage and maximum miss 0.2938 reject it.") },
        { code: "H3", claim: pair("상·구조 체제를 먼저 분류한 거리라면 체제 내부 평활 경계가 직접시험보다 효율적이다.", "A metric that first separates phase and structure regimes yields within-regime smoothness bounds more efficient than direct trials."), prediction: pair("새 체제 분류를 개발자료에서 고정한 뒤 외부 화학계에서 95% 커버리지와 비용대응 정확구간보다 작은 폭을 재현한다.", "After freezing regime classification in development data, an external family reproduces 95% coverage with width below a cost-matched exact interval."), reject: pair("체제 라벨이 봉인 결과를 본 뒤 정해지거나 외부 커버리지를 회복하지 못하면 중단한다.", "Stop if regime labels are chosen after seeing sealed outcomes or fail to restore external coverage.") }
      ],
      sourceIds: [...smoothSources, "pmlr_ope_2017", "github_arrows"]
    },
    "UP-185": {
      role: pair("실패 데이터의 분모를 위변조 탐지 가능한 단계 원장으로 고정하는 문제", "Problem fixing the denominator of failure data with a tamper-evident stage ledger"),
      updatedDefinition: pair(
        "실패 데이터베이스의 완전성은 공개 행 수가 아니라 모든 예정 ID가 결정·실행·원신호·판정·공개 단계 중 어디에 멈췄는지로 정의해야 한다. 누락 사유는 결과를 알기 전에 기록돼야 하며, 단계별 산출물 해시와 봉인 분모가 사후 삭제와 덮어쓰기를 드러내야 한다.",
        "Completeness of a failure database is defined not by released row count but by where every planned ID stopped across decision, execution, raw observation, adjudication, and release. Missingness reasons must be recorded before the outcome is known, while stage-artifact hashes and a sealed denominator expose later deletion or overwrite."
      ),
      knownBoundary: pair(
        "8개 예정 실험의 합성 원장은 실행 완료 6·미실행 1·실행오류 1, 원신호 존재 5·부재 3, 판정 5, 공개 4를 손실 없이 보존했다. 중복 ID, 예정행 삭제, 늦은 등록, 결과를 본 누락사유, 무판정 공개, 레코드 변조와 거짓 manifest 등 7개 돌연변이를 모두 검출했다.",
        "A synthetic ledger for eight planned experiments preserved six completed, one unrun, one execution failure, five present and three absent raw observations, five adjudications, and four releases. It detected all seven mutations: duplicate ID, planned-row deletion, late registration, outcome-aware missingness reason, release without adjudication, record tampering, and false manifest."
      ),
      bottleneck: pair(
        "무결성은 식별성과 다르다. 완전한 단계 수를 알아도 빠진 원신호의 성공 여부를 모르면 관측 성공 0.42·실패 0.18·결측 0.40에서 모집단 폭 0.4가 그대로 남았다. 해시 원장은 사후 조작을 막지만 결과의존 누락을 수학적으로 제거하지 않는다.",
        "Integrity is not identifiability. Even with complete stage counts, unknown outcomes behind 0.42 observed success, 0.18 observed failure, and 0.40 missingness leave population width 0.4. A hash ledger deters retrospective manipulation but does not mathematically remove outcome-dependent missingness."
      ),
      minimumAdvance: pair(
        "다음 실제 캠페인은 예정 ID를 실행 전 봉인하고 모든 단계 상태와 결과맹검 누락사유를 기록한다. 이후 누락 ID에서 100개를 균등 무작위 추출해 독립 재측정하며, 원장 완전성 통과와 복구표본 값 구간 통과를 별도 관문으로 보고한다.",
        "The next real campaign seals planned IDs before execution and records every stage state with outcome-blind missingness reasons. It then draws 100 missing IDs uniformly for independent remeasurement, reporting ledger-completeness and rescue-sample value-interval gates separately."
      ),
      decisiveTest: pair(
        "공개팀과 감사팀이 원장 digest와 단계 manifest를 독립 재계산하고, 검증기는 사전 정의한 7개 오류 주입을 모두 거부해야 한다. 복구표본 선택 시드와 목록은 결과 판정 전에 봉인하고 원래 분석팀이 아닌 팀이 재측정한다.",
        "Publishing and audit teams independently recompute ledger digests and stage manifests, while the validator must reject all seven preregistered injected errors. Seal the rescue-sample seed and ID list before outcome adjudication and assign remeasurement to a team outside the original analysis group."
      ),
      unresolved: pair(
        "파괴된 시료나 비가역 측정은 무작위 복구가 불가능할 수 있고, 원장에는 영업비밀·장비 식별자·작업자 정보 보호가 필요하다. 이 경우 사전 중복 시료와 암호화된 접근제어를 설계해야 하며, 복구 가능 ID만 뽑아 생기는 새 선택편향을 피해야 한다.",
        "Destroyed samples or irreversible measurements may make random rescue impossible, while ledgers must protect proprietary recipes, instrument identities, and personnel data. Prospective replicate specimens and controlled encrypted access are then required, without selecting only recoverable IDs and creating a new bias."
      ),
      hypotheses: [
        { code: "H1", claim: pair("봉인 manifest와 레코드 해시는 실패행의 사후 삭제·변조를 검출한다.", "A sealed manifest and record hashes detect retrospective deletion or tampering of failure rows."), prediction: pair("중복·삭제·지연등록·결과인지 사유·무판정 공개·변조·거짓분모 일곱 오류를 모두 거부한다.", "The validator rejects all seven errors: duplication, deletion, late registration, outcome-aware reason, unadjudicated release, tampering, and false denominator."), reject: pair("어느 돌연변이라도 원장 유효 판정을 유지하면 해당 무결성 규칙을 기각하고 스키마를 수정한다.", "Reject and revise the integrity rule if any mutation retains a valid-ledger decision.") },
        { code: "H2", claim: pair("완전한 단계 manifest만으로 결과의존 누락 Γ를 제한할 수 있다.", "A complete stage manifest alone constrains outcome-dependent missingness Gamma."), prediction: pair("복구표본 0개에서도 Γ=1·4·16 세계의 모집단 구간폭이 0.4보다 작다.", "With zero rescue outcomes, population width is below 0.4 in Gamma 1, 4, and 16 worlds."), reject: pair("단계 수가 같아도 빠진 성공률을 자유롭게 바꿀 수 있어 폭 0.4가 남으면 기각한다. 세 세계 모두 0.4로 기각됐다.", "Reject if missing success can vary freely despite identical stage counts, leaving width 0.4; all three worlds reject the claim.") },
        { code: "H3", claim: pair("누락 ID의 균등 무작위 복구는 완전 원장에 결과 식별 정보를 추가한다.", "Uniform random rescue of missing IDs adds outcome-identification information to a complete ledger."), prediction: pair("복구 100개에서 세 Γ 세계 모두 폭≤0.08, 커버리지≥95%, 유한 Γ상한 확률≥95%를 만족한다.", "With 100 rescues, all three Gamma worlds attain width at most 0.08, coverage at least 95%, and finite-Gamma-upper probability at least 95%."), reject: pair("독립 구현이나 새로운 누락률에서 어느 관문이라도 실패하면 100개 기준을 일반화하지 않고 표본설계를 다시 계산한다.", "If any gate fails in an independent implementation or new missingness rate, do not generalize the 100-sample rule; recompute the design.") }
      ],
      sourceIds: [...auditSources, "nature_arrows_2023", "github_arrows"]
    },
    "UP-629": {
      role: pair("출처추적 정보와 MNAR 식별 정보를 구분해 추가 자료의 역할을 증명하는 문제", "Problem separating provenance information from MNAR identification information and proving the role of added data"),
      updatedDefinition: pair(
        "누가 언제 어떤 자료를 만들고 삭제했는지 아는 것과, 삭제된 결과가 무엇이었는지 아는 것은 다른 질문이다. 전향 원장은 관측과정 R의 실현값과 분모를 완전하게 만들지만, Y가 빠진 행의 Y는 채우지 않는다. 누락 행에서 무작위로 결과를 복구하거나 타당한 그림자변수를 추가해야 모집단 분포가 더 좁게 식별된다.",
        "Knowing who created or removed which record and when is different from knowing the missing outcome. A prospective ledger completes realized observation indicators R and their denominator but does not fill Y in rows where Y is absent. Population identification tightens only through randomized outcome rescue or a valid shadow variable for missing rows."
      ),
      knownBoundary: pair(
        "단계 manifest만 쓴 세 Γ 세계의 평균구간은 모두 [0.42,0.82]였다. 누락행을 정확 이항 열거로 100개 복구하자 Γ=1·4·16에서 평균 폭은 0.0745·0.0782·0.0554, 커버리지는 96.25%·95.17%·96.32%였고 유한 Γ상한 확률은 사실상 100%였다.",
        "Using only stage manifests, all three Gamma worlds retained [0.42,0.82]. Exact binomial enumeration of 100 rescued missing rows yielded mean widths 0.0745, 0.0782, and 0.0554 for Gamma 1, 4, and 16, with coverage 96.25%, 95.17%, and 96.32% and essentially unit probability of a finite Gamma upper bound."
      ),
      bottleneck: pair(
        "복구표본은 누락집합에서 균등해야 한다. 복구 가능성이나 예상 성공에 따라 표본을 고르면 새 관측과정이 생긴다. 그림자변수도 결과와 연관되면서 결과를 조건으로 누락과 독립이라는 가정이 필요하므로 단순 예측 정확도만으로 타당성을 보장하지 못한다.",
        "The rescue sample must be uniform within the missing set; selection by recoverability or expected success creates another observation process. A shadow variable must associate with outcome yet remain conditionally independent of missingness given outcome, so predictive accuracy alone does not establish validity."
      ),
      minimumAdvance: pair(
        "원장 완전성 검사를 식별 분석의 전처리 관문으로 두고, 누락행 무작위 복구의 표본틀·난수시드·비복구 처리까지 사전 등록한다. Γ상한보다 모집단 평균 정확구간의 폭과 커버리지를 주 판정량으로 삼는다.",
        "Use ledger completeness as a preprocessing gate for identification analysis, preregistering the missing-row sampling frame, random seed, and handling of failed rescues. Treat population-mean exact-interval width and coverage as primary, rather than the Gamma upper bound alone."
      ),
      decisiveTest: pair(
        "누락 성공률을 0.7·0.3684·0.1273으로 바꾼 세 세계에서 가능한 모든 복구 성공개수를 이항확률로 열거한다. 각 Clopper–Pearson 구간을 모집단 평균과 선택오즈로 변환하고 참값 포함률·폭·유한상한 확률을 독립 공식으로 검산한다.",
        "Enumerate every possible rescue success count under missing positive rates 0.7, 0.3684, and 0.1273. Transform each Clopper-Pearson interval to population mean and selection odds, then independently verify truth coverage, width, and finite-upper-bound probability."
      ),
      unresolved: pair(
        "100이라는 수는 결측 40%, 관측 성공률 70%, 이진 결과와 이번 폭 관문에만 유효하다. 여러 층·연속 결과·복구 실패가 있으면 층별 동시구간과 비용최적 배분이 필요하며, 2026년 약한 그림자변수 부분식별은 아직 프리프린트다.",
        "The number 100 applies only to 40% missingness, 70% observed success, binary outcomes, and this width gate. Multiple strata, continuous outcomes, and failed rescues require simultaneous intervals and cost-optimal allocation; the 2026 weak-shadow-variable partial-identification result remains a preprint."
      ),
      hypotheses: [
        { code: "H1", claim: pair("완전한 출처추적은 누락 결과의 분포까지 식별한다.", "Complete provenance identifies the distribution of missing outcomes."), prediction: pair("단계와 해시가 완전하면 복구표본 없이도 평균구간이 점으로 수렴한다.", "When stages and hashes are complete, the mean interval collapses without rescued outcomes."), reject: pair("완전 원장에서도 같은 manifest를 갖는 다른 누락 성공률 세계가 존재하면 기각한다. 폭 0.4의 세 세계가 이를 기각했다.", "Reject when complete ledgers admit worlds with the same manifest and different missing positive rates; three width-0.4 worlds do so.") },
        { code: "H2", claim: pair("누락행 무작위 복구의 정확구간은 유한표본에서도 식별집합을 정직하게 줄인다.", "Exact intervals from randomized missing-row rescue honestly shrink the identified set in finite samples."), prediction: pair("모든 n=20·50·100, Γ=1·4·16 조합에서 참 평균 커버리지가 95% 이상이다.", "True-mean coverage is at least 95% for every combination of n=20, 50, 100 and Gamma 1, 4, 16."), reject: pair("정확 열거에서 어느 조합이라도 95% 아래면 구간 변환 또는 동시추론을 기각한다.", "Reject the interval transformation or simultaneous inference if exact enumeration falls below 95% in any combination.") },
        { code: "H3", claim: pair("결과예측을 그림자변수로 쓰면 복구표본을 대체할 수 있다.", "An outcome prediction used as a shadow variable can replace rescued outcomes."), prediction: pair("예측변수가 결과와 연관되고 결과 조건부 누락독립의 관측 가능한 함의를 통과하며, 봉인 자료에서 복구표본 구간 이상의 커버리지·폭을 낸다.", "The predictor associates with outcome, passes observable implications of conditional missingness independence, and matches or improves rescue-sample coverage and width on sealed data."), reject: pair("예측 생성에 공개 여부가 입력되거나 조건부 독립 검사가 실패하거나 봉인 커버리지가 무너지면 대체 주장을 중단한다.", "Stop the replacement claim if release status enters prediction, conditional-independence checks fail, or sealed coverage collapses.") }
      ],
      sourceIds: [...auditSources, "arxiv_weak_shadow_2026", "neurips_ope_interval_2020"]
    },
    "UP-430": {
      role: pair("추적 원장과 무작위 재접촉이 하위집단 결과 식별에 각각 주는 정보를 분리하는 문제", "Problem separating information contributed by follow-up ledgers and randomized recontact for subgroup outcome identification"),
      updatedDefinition: pair(
        "임상 추적 원장은 누가 추적에서 빠졌는지와 언제 빠졌는지를 밝혀도 그 환자의 결과를 대신 측정하지 않는다. 추적손실 이유를 결과를 알기 전에 기록하면 사후 선택을 감사할 수 있지만, 결과의존 손실을 제한하려면 누락 환자의 무작위 재접촉·독립 결과확인 또는 타당한 보조변수가 필요하다.",
        "A clinical follow-up ledger can show who was lost and when without measuring that patient's outcome. Recording loss reasons before outcome knowledge audits retrospective selection, but constraining outcome-dependent attrition still requires randomized recontact, independent outcome ascertainment, or a valid auxiliary variable among missing patients."
      ),
      knownBoundary: pair(
        "동일 추적률 60%·관측 반응률 70%에서 단계 수만으로는 반응률 폭 0.4가 남았다. 누락 100명을 무작위 확인한 합성시험은 Γ=1·4·16 모두 폭 0.08 이하와 95% 이상 정확 커버리지를 통과했지만, 이는 환자시험 권고가 아니라 자료수집 원리의 알려진 참값 시험이다.",
        "At identical 60% follow-up and 70% observed response, stage counts alone retained response-rate width 0.4. In a known-truth synthetic test, random ascertainment of 100 missing outcomes passed width 0.08 and exact coverage 95% in Gamma 1, 4, and 16 worlds; this tests a data-collection principle, not a patient-study recommendation."
      ),
      bottleneck: pair(
        "재접촉 성공 자체가 건강상태와 연관될 수 있어 최초 무작위 추출만으로 충분하지 않다. 선택된 환자 중 결과를 끝내 확인하지 못한 비율과 이유를 다시 기록하고, 안전·동의·개인정보 제약 때문에 확인 불가능한 결과는 새 결측층으로 남겨야 한다.",
        "Successful recontact may itself depend on health, so randomized invitation alone is insufficient. Record unresolved ascertainment and reasons within the selected sample, and retain outcomes impossible to obtain under safety, consent, or privacy constraints as a new missingness layer."
      ),
      minimumAdvance: pair(
        "환자 개입 없이 가능한 기록연계 또는 윤리승인 재접촉에서 누락집합의 확률표본을 만들고, 초대확률·응답확률·독립 결과원천을 모두 기록한다. 원래 치료모형을 개발하지 않은 팀이 가족별 정확구간을 계산한다.",
        "Create a probability sample of missing patients through noninterventional record linkage or ethics-approved recontact, recording invitation probability, response probability, and independent outcome source. A team not involved in the original treatment model computes familywise exact intervals."
      ),
      decisiveTest: pair(
        "원장만, 원장+무작위 재접촉, 원장+그림자변수의 세 분석을 같은 봉인 하위집단에서 비교한다. 구간 폭뿐 아니라 독립 결과원천의 커버리지, 재접촉 실패층의 크기와 치료방향 결론이 가정 범위에서 유지되는지를 판정한다.",
        "Compare ledger-only, ledger plus randomized recontact, and ledger plus shadow-variable analyses in the same sealed subgroup. Adjudicate interval width, coverage against an independent outcome source, the remaining recontact-failure layer, and stability of treatment direction across assumptions."
      ),
      unresolved: pair(
        "사망·경쟁위험·치료순응과 시간가변 건강상태에서는 단일 이진 결과와 한 번의 재접촉이 부족하다. 실제 설계는 윤리위원회 승인, 최소필요정보, 환자 부담과 중단규칙을 포함해야 하며 이번 합성 표본수 100을 그대로 사용할 수 없다.",
        "Death, competing risks, adherence, and time-varying health make one binary outcome and one recontact insufficient. A real design requires ethics approval, data minimization, patient-burden limits, and stopping rules; the synthetic sample size of 100 cannot be copied directly."
      ),
      hypotheses: [
        { code: "H1", claim: pair("결과맹검 추적손실 사유가 완전하면 하위집단 반응률은 식별된다.", "Complete outcome-blind attrition reasons identify subgroup response."), prediction: pair("누락 결과를 확인하지 않아도 모든 사유층의 반응률이 하나로 정해진다.", "Response in every reason stratum is uniquely determined without ascertaining missing outcomes."), reject: pair("같은 사유·단계 분모에서 다른 누락 결과분포가 가능하면 기각한다.", "Reject if different missing-outcome distributions remain possible under the same reason and stage denominators.") },
        { code: "H2", claim: pair("누락집합 확률표본의 독립 결과확인은 결과의존 추적손실 구간을 줄인다.", "Independent outcome ascertainment in a probability sample of missing patients shrinks outcome-dependent attrition bounds."), prediction: pair("새 결측 없이 100개를 확인한 알려진 참값 시험에서 세 Γ 세계가 폭·커버리지 관문을 모두 통과한다.", "With no second-stage missingness, all three Gamma worlds pass width and coverage gates after 100 known-truth ascertainments."), reject: pair("재접촉 실패를 포함한 확장 DGP나 외부자료에서 커버리지가 95% 아래면 현재 표본·구간 설계를 기각한다.", "Reject the current sample and interval design if coverage falls below 95% in an extended DGP with recontact failure or in external data.") },
        { code: "H3", claim: pair("그림자변수는 환자 재접촉보다 낮은 부담으로 같은 식별력을 낸다.", "A shadow variable matches recontact identification with less patient burden."), prediction: pair("봉인 외부기관에서 타당성 함의를 통과하고 100개 재접촉 구간보다 넓지 않으면서 95% 커버리지를 유지한다.", "At a sealed external institution it passes validity implications, is no wider than the 100-recontact interval, and retains 95% coverage."), reject: pair("누락 과정과의 직접 연관·기관 이동·커버리지 실패가 나타나면 임상 판정에서 제외한다.", "Exclude it from clinical adjudication upon direct association with missingness, institutional shift, or coverage failure.") }
      ],
      sourceIds: [...auditSources, "jds_shadow_mnar_2024", "pmlr_candor_2026"]
    }
  };

  const provenanceConnection = {
    id: "CONN-PROV-001",
    problemIds: ["UP-182", "UP-185", "UP-629", "UP-430"],
    type: pair("출처추적 완전성과 통계적 식별성의 직교 분해", "Orthogonal decomposition of provenance completeness and statistical identifiability"),
    strength: "verified-separation",
    sharedBottleneck: pair("완전한 단계·해시·분모는 어떤 행이 사라졌는지 증명하지만 사라진 결과값은 복원하지 않는다. 결과의존 선택을 제한하려면 누락집합의 확률표본 또는 타당한 그림자변수가 별도로 필요하다.", "Complete stages, hashes, and denominators prove which rows disappeared but do not recover their outcomes. Constraining outcome-dependent selection separately requires a probability sample from the missing set or a valid shadow variable."),
    mapping: pair("실험 예정 ID↔연구대상 등록, 원신호 부재↔추적손실, 판정 전 누락사유↔결과맹검 이탈사유, 누락 시료 재측정↔누락 환자 독립 결과확인이 대응한다.", "Planned experiment IDs map to participant registration; absent raw signals to loss to follow-up; pre-adjudication missingness reasons to outcome-blind attrition reasons; and remeasurement of missing samples to independent ascertainment in missing patients."),
    transferableMethod: pair("봉인 manifest·콘텐츠 해시·단계 전이 검증은 데이터 무결성에, 누락행 무작위 복구·정확구간은 식별성에 적용하며 두 관문을 합격/불합격으로 별도 공개한다.", "Apply sealed manifests, content hashes, and stage-transition validation to data integrity; apply randomized missing-row rescue and exact intervals to identifiability; publish the two gates separately."),
    evidence: pair("합성 원장은 7개 무결성 돌연변이를 모두 검출했지만 원장만으로 평균 폭 0.4가 남았다. 누락행 100개를 무작위 복구하자 Γ=1·4·16 모두 폭≤0.08과 95% 이상 커버리지를 통과했다.", "The synthetic ledger detected all seven integrity mutations yet ledger-only mean width remained 0.4. Random rescue of 100 missing rows brought Gamma 1, 4, and 16 worlds below width 0.08 with at least 95% coverage."),
    validationStatus: pair("합성 원장·정확 이항 열거에서 분리 검증 · 실제 재료·임상 원장 대기", "Separation verified on a synthetic ledger and exact binomial enumeration; real materials and clinical ledgers pending"),
    failureBoundary: pair("복구 가능성이 결과와 연관되거나 그림자변수가 누락과 직접 연결되면 새 선택편향이 생긴다. 해시가 원자료의 진실성이나 측정 정확도까지 보장하는 것도 아니다.", "A new selection bias arises if recoverability depends on outcome or a shadow variable directly affects missingness. Hashes also do not certify truth or measurement accuracy of the underlying artifact."),
    minimumTest: pair("실제 봉인 캠페인에서 7개 무결성 오류 주입을 거부하고 누락 ID 확률표본을 독립 재측정한다. 원장 관문을 통과해도 복구표본 구간이 실패하면 식별 주장을 중단해야 한다.", "In a real sealed campaign, reject seven injected integrity faults and independently remeasure a probability sample of missing IDs. Even after the ledger gate passes, stop identification claims if rescue-sample intervals fail."),
    sourceIds: ["fair_data_2016", "w3c_provo_2013", "manski_missing_2005", "jds_shadow_mnar_2024"]
  };
  if (!connections.some(({ id }) => id === provenanceConnection.id)) connections.push(provenanceConnection);

  const cycle = {
    id: "RC-2026-06",
    title: "완전한 원장은 식별을 보장하는가",
    titleEn: "Does a complete ledger guarantee identification?",
    status: "active",
    startedOn: REVIEWED_ON,
    reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records),
    connectionIds: ["CONN-PROV-001", "CONN-IDENT-001", "CONN-CAUSAL-001", "CONN-MAT-004"],
    selectionReason: "RC-2026-05는 누락원장 감사를 다음 정보가치 1순위로 정했지만, 완전한 분모가 미지 결과까지 식별하는지는 시험하지 않았다. 이번 사이클은 단계별 봉인 원장으로 데이터 무결성을 검증하고 누락 ID 무작위 복구가 추가하는 식별 정보를 정확 열거했다. 동시에 무지지 평활성 경계가 숨은 상전이에서 실패하는 대조 세계를 만들어 외삽의 중단 조건을 수치로 고정했다.",
    selectionReasonEn: "RC-2026-05 prioritized a missingness-ledger audit but did not test whether a complete denominator identifies unknown outcomes. This cycle validates data integrity with a sealed stage ledger and exactly enumerates the identification information added by randomized rescue of missing IDs. It also constructs a control world where no-support smoothness bounds fail across a hidden phase transition, numerically fixing an extrapolation stop rule.",
    verifiedFindings: [
      { text: "예정 8개를 결정→실행→원신호→판정→공개 단계로 보존한 원장은 중복 ID, 행 삭제, 늦은 등록, 결과인지 누락사유, 무판정 공개, 내용 변조와 거짓 manifest 등 7개 오류를 모두 검출했다.", textEn: "A ledger preserving eight planned experiments across decision, execution, raw observation, adjudication, and release detected all seven faults: duplicate IDs, row deletion, late registration, outcome-aware missingness reason, release without adjudication, content tampering, and false manifest.", sourceIds: ["fair_data_2016", "w3c_provo_2013"] },
      { text: "단계 분모만으로는 Γ=1·4·16 세 세계 모두 모집단 평균구간 [0.42,0.82], 폭 0.4가 남았다. 출처추적 완전성은 결과 식별성과 동일하지 않다.", textEn: "Stage denominators alone left population interval [0.42,0.82], width 0.4, in Gamma 1, 4, and 16 worlds. Provenance completeness is not outcome identifiability.", sourceIds: ["manski_missing_2005", "jds_shadow_mnar_2024"] },
      { text: "누락 ID 20개 복구는 모든 세계에서 폭 관문을 실패했고 Γ=16에서는 유한 Γ상한 확률도 93.43%였다. 50개는 Γ=16만 통과했다.", textEn: "Rescuing 20 missing IDs failed the width gate in every world and produced a finite Gamma upper bound with only 93.43% probability at true Gamma 16. Fifty rescues passed only the Gamma-16 world.", sourceIds: ["manski_missing_2005"] },
      { text: "누락 ID 100개를 균등 무작위 복구하면 Γ=1·4·16 평균 폭은 0.0745·0.0782·0.0554, 정확 커버리지는 96.25%·95.17%·96.32%로 세 관문을 모두 통과했다.", textEn: "Uniform random rescue of 100 missing IDs yielded mean widths 0.0745, 0.0782, and 0.0554 and exact coverage 96.25%, 95.17%, and 96.32% at Gamma 1, 4, and 16, passing all three gates.", sourceIds: ["manski_missing_2005", "jds_shadow_mnar_2024"] },
      { text: "개발자료가 완전히 같은 두 평활성 세계에서 전역 매끈 세계는 봉인 커버리지 100%·평균 폭 0.1913이었지만 숨은 상경계 세계는 커버리지 25%·최대 미포함 0.35였다.", textEn: "In two smoothness worlds with identical development data, the globally smooth world attained 100% sealed coverage and mean width 0.1913, while the hidden-phase-boundary world had 25% coverage and maximum miss 0.35.", sourceIds: ["pmlr_no_overlap_2024"] },
      { text: "L을 0.45에서 0.9로 두 배 늘리면 평균 폭은 0.3825로 커졌지만 숨은 상경계 커버리지는 여전히 25%였다. 안전계수 확대는 체제전환 검증을 대신하지 못한다.", textEn: "Doubling L from 0.45 to 0.9 widened the mean interval to 0.3825 but left hidden-phase-boundary coverage at 25%. Safety-factor inflation cannot replace regime-shift validation.", sourceIds: ["pmlr_no_overlap_2024", "pmlr_overlap_2020"] },
      { text: "2026년 약한 그림자변수 연구는 MNAR 구간을 줄이는 선형계획을 제안하지만 아직 프리프린트이므로, 이번 판정에서는 복구표본을 대체하는 근거로 사용하지 않았다.", textEn: "A 2026 weak-shadow-variable study proposes linear programs that tighten MNAR bounds, but it remains a preprint and was not used here as evidence to replace rescue samples.", sourceIds: ["arxiv_weak_shadow_2026"] }
    ],
    resultMatrix: {
      title: pair("완전성·식별성·평활성 이전의 서로 다른 관문", "Distinct gates for completeness, identifiability, and smoothness transfer"),
      note: pair("복구 폭과 커버리지는 가능한 모든 이항 성공개수를 확률가중해 정확 계산했다. 평활성 커버리지는 개발구간을 보지 않은 봉인 16점에서 판정했다.", "Rescue width and coverage were computed exactly by probability-weighting every possible binomial success count. Smoothness coverage was adjudicated on 16 sealed points outside development support."),
      columns: [pair("시험", "Test"), pair("조건", "Condition"), pair("폭", "Width"), pair("커버리지/검출", "Coverage/detection"), pair("판정", "Decision")],
      rows: [
        { label: pair("원장 무결성", "Ledger integrity"), values: [pair("7개 오류 주입", "Seven injected faults"), pair("해당 없음", "N/A"), "7/7", pair("통과", "Pass")] },
        { label: pair("원장만", "Ledger only"), values: ["Γ=1·4·16", "0.4000", pair("논리경계", "Logical coverage"), pair("식별 불가", "Not identified")] },
        { label: pair("무작위 복구 20", "20 random rescues"), values: ["Γ=1·4·16", "0.1265–0.1728", "97.52–99.08%", pair("폭 관문 실패", "Width gate fails")] },
        { label: pair("무작위 복구 50", "50 random rescues"), values: ["Γ=1·4·16", "0.0792–0.1110", "96.11–97.00%", pair("한 세계만 통과", "Only one world passes")] },
        { label: pair("무작위 복구 100", "100 random rescues"), values: ["Γ=1·4·16", "0.0554–0.0782", "95.17–96.32%", pair("세 세계 통과", "All worlds pass")] },
        { label: pair("평활 경계", "Smooth bounds"), values: [pair("전역 매끈", "Globally smooth"), "0.1913", "100%", pair("봉인 통과", "Sealed pass")] },
        { label: pair("평활 경계", "Smooth bounds"), values: [pair("숨은 상전이", "Hidden phase transition"), "0.1913", "25%", pair("이전 기각", "Reject transfer")] },
        { label: pair("평활 경계 2L", "Smooth bounds at 2L"), values: [pair("숨은 상전이", "Hidden phase transition"), "0.3825", "25%", pair("안전계수도 실패", "Safety factor fails")] }
      ]
    },
    sharedProgram: {
      name: pair("완전성–식별성–이전성 삼중 관문", "Completeness-identifiability-transferability triple gate"),
      thesis: pair("원장의 무결성, 누락 결과의 통계적 식별, 무지지 영역으로의 구조 이전은 서로 다른 증거를 요구하며 앞 관문 통과가 뒤 관문을 보장하지 않는다.", "Ledger integrity, statistical identification of missing outcomes, and structural transfer into unsupported regions require different evidence; passing an earlier gate does not guarantee a later one."),
      design: pair("8개 예정 ID의 단계별 해시 원장에 7개 오류를 주입했다. 관측률 0.6·관측 성공률 0.7에서 Γ=1·4·16과 복구표본 0·20·50·100의 모든 이항 결과를 정확 열거했다. 별도로 개발자료가 같은 전역 평활·숨은 상경계 세계를 봉인 16점에서 비교했다.", "Injected seven faults into a stage-hash ledger for eight planned IDs. At response 0.6 and observed success 0.7, exactly enumerated every binomial outcome for Gamma 1, 4, and 16 with rescue samples 0, 20, 50, and 100. Separately compared globally smooth and hidden-phase-boundary worlds sharing development data on 16 sealed points."),
      adjudication: pair("원장 유효성은 독립 digest·manifest 재계산으로, 복구구간은 Clopper–Pearson 공식과 확률합으로, 평활성은 개발영역 밖 봉인점의 포함률로 판정했다. 실패한 20·50개 표본과 상경계 세계를 결과에서 제거하지 않았다.", "Adjudicated ledger validity through independent digest and manifest recomputation, rescue intervals through Clopper-Pearson formulas and exact probability sums, and smoothness through coverage outside development support. Retained failed 20- and 50-sample designs and the phase-boundary world in the results."),
      primaryMetrics: pair("무결성 오류 검출률, 무복구 논리폭, 복구표본 평균폭·정확 커버리지·유한 Γ상한 확률, 봉인 평활성 커버리지·평균폭·최대 미포함", "Integrity-fault detection, no-rescue logical width, rescue mean width, exact coverage and finite-Gamma-upper probability, plus sealed smoothness coverage, mean width, and maximum miss"),
      successRule: pair("실제 연구 주장은 7개 무결성 오류 거부, 복구구간 폭≤0.08·커버리지≥95%·유한 Γ상한 확률≥95%, 외삽 구간 외부 커버리지≥95%와 비용대응 직접구간보다 작은 폭을 각각 통과해야 한다.", "A real claim must separately reject seven integrity faults; attain rescue width at most 0.08, coverage at least 95%, and finite-Gamma-upper probability at least 95%; and achieve at least 95% external extrapolation coverage with width below a cost-matched direct interval."),
      stopRule: pair("원장 통과를 MNAR 해결로 해석하지 않는다. 복구 실패가 결과와 연관되면 현재 정확구간을 중단하며, 상·구조 경계를 넘은 평활 외삽은 안전계수 조정으로 구제하지 않는다.", "Do not interpret a passed ledger as solving MNAR. Stop current exact intervals if rescue failure depends on outcome, and do not rescue smooth extrapolation across phase or structural boundaries by adjusting a safety factor."),
      status: pair("합성 무결성·정확 복구·봉인 평활성 대조 완료 · 실제 연속 캠페인과 외부 화학계 대기", "Synthetic integrity, exact rescue, and sealed smoothness controls complete; real consecutive campaign and external chemical family pending")
    },
    artifacts: [
      { title: pair("캠페인 완전성 감사 스키마", "Campaign completeness-audit schema"), description: pair("모든 예정 ID의 결정·실행·원신호·판정·공개 상태, 결과맹검 누락사유, 단계 해시와 봉인 분모를 정의한 JSON Schema", "JSON Schema defining decision, execution, raw observation, adjudication, and release states, outcome-blind reasons, stage hashes, and sealed denominators for every planned ID"), url: "research/audit/completeness-audit.schema.json", kind: "JSON Schema" },
      { title: pair("합성 완전성 원장", "Synthetic completeness ledger"), description: pair("8개 예정 실험과 단계 manifest·레코드 digest·캠페인 digest를 갖춘 유효 원장 고정물", "Valid fixture with eight planned experiments, stage manifests, record digests, and a campaign digest"), url: "research/audit/synthetic-audit-fixture.json", kind: "JSON" },
      { title: pair("MNAR 복구표본 규격", "MNAR rescue-sample specification"), description: pair("세 선택오즈 세계, 복구표본 수, 정확구간과 폭·커버리지·유한상한 관문을 고정한 규격", "Frozen three selection-odds worlds, rescue sample sizes, exact intervals, and width, coverage, and finite-upper-bound gates"), url: "research/audit/calibration-spec.json", kind: "JSON" },
      { title: pair("감사·복구 보정 결과", "Audit and rescue calibration results"), description: pair("7개 무결성 오류 판정과 Γ·표본수별 모집단 폭·정확 커버리지·유한 Γ상한 확률을 기록한 결과", "Results recording seven integrity-fault decisions and population width, exact coverage, and finite-Gamma-upper probability by Gamma and sample size"), url: "research/audit/calibration-result.json", kind: "JSON" },
      { title: pair("봉인 평활성 규격", "Sealed smoothness specification"), description: pair("개발·판정 분할, 전역 평활·숨은 상경계 세계, 안전계수와 직접시험 비교 관문을 고정한 규격", "Frozen development-adjudication split, globally smooth and hidden-phase worlds, safety factors, and direct-trial comparison gates"), url: "research/smoothness/sealed-family-spec.json", kind: "JSON" },
      { title: pair("봉인 평활성 결과", "Sealed smoothness results"), description: pair("두 세계의 동일 개발자료, 봉인 커버리지·폭·최대 위반과 외삽 통과·중단 판정을 기록한 결과", "Results recording identical development data, sealed coverage, width, maximum violation, and extrapolation pass or stop decisions in both worlds"), url: "research/smoothness/sealed-family-result.json", kind: "JSON" },
      { title: pair("감사·복구 실행 코드", "Audit and rescue runner"), description: pair("합성 원장 생성, 오류 주입과 모든 이항 복구 결과의 정확 확률합을 재계산하는 실행기", "Runner regenerating the synthetic ledger, fault injections, and exact probability sums over all binomial rescue outcomes"), url: "scripts/run-audit-calibration.mjs", kind: "JavaScript" },
      { title: pair("평활성 봉인 실행 코드", "Smoothness seal runner"), description: pair("개발영역에서 L을 적합하고 보지 않은 16점에서 두 세계의 구간 커버리지와 폭을 판정하는 실행기", "Runner fitting L in development support and adjudicating interval coverage and width in two worlds on 16 unseen points"), url: "scripts/run-smoothness-seal.mjs", kind: "JavaScript" },
      { title: pair("감사·평활성 독립 검증", "Independent audit and smoothness verification"), description: pair("원장 유효성, 7개 오류 검출, 100개 복구 관문과 숨은 상경계 거부를 별도 검사하는 검증기", "Independent verifier for ledger validity, seven fault detections, the 100-rescue gate, and hidden-phase-boundary refusal"), url: "scripts/verify-audit-smoothness.mjs", kind: "JavaScript" }
    ],
    log: [
      pair("RC-2026-05가 지정한 완전성 감사와 평활성 외부검증을 그대로 다음 작업으로 채택했다.", "Adopted completeness auditing and external smoothness validation exactly as specified by RC-2026-05."),
      pair("기존 완전 원장은 결과가 있는 실행만 표현했으므로 예정·미실행·원신호 부재·무판정·비공개를 모두 보존하는 캠페인 봉투를 별도로 만들었다.", "Because the prior complete ledger represented executed records with outcomes, added a campaign envelope retaining planned, unrun, raw-absent, unadjudicated, and unreleased records."),
      pair("원장 무결성 통과가 Γ를 제한한다는 가설은 무복구 폭 0.4로 기각했다.", "Rejected the hypothesis that ledger integrity alone constrains Gamma because no-rescue width remained 0.4."),
      pair("무작위 복구의 몬테카를로 오차를 피하려고 가능한 성공개수를 모두 정확 열거해 커버리지와 기대폭을 계산했다.", "Avoided Monte Carlo error in randomized rescue by exactly enumerating every possible success count for coverage and expected width."),
      pair("복구 20·50개의 실패와 Γ=16에서 20개 표본의 유한상한 확률 93.43%를 보존했다.", "Retained failures at 20 and 50 rescues and the 93.43% finite-upper-bound probability for 20 samples at Gamma 16."),
      pair("평활성 성공 세계와 개발자료가 같은 실패 세계를 함께 제시해 좁은 구간 자체가 이전 타당성 증거가 아님을 확인했다.", "Paired the successful smooth world with a failure world sharing development data, showing that narrow intervals are not evidence of transfer validity."),
      pair("그림자변수는 동료심사 2024년 식별조건과 2026년 프리프린트의 부분식별 결과를 구분해 기록했고 이번 복구표본을 대체하지 않았다.", "Distinguished peer-reviewed 2024 shadow-variable identification conditions from a 2026 partial-identification preprint and did not replace rescue samples with either in this cycle.")
    ],
    nextCycle: pair("실제 적용 전 마지막 합성 장벽으로 복구 자체가 결과에 따라 실패하는 2단계 MNAR를 추가하고, 초대확률·복구응답확률을 함께 둔 부분식별 구간을 구현한다. 평활성 쪽은 숨은 상경계를 능동적으로 찾도록 후보점별 예상 최대위반 감소를 계산해, 동일한 16회 예산에서 균등격자보다 경계 탐지율과 최악구간 폭이 개선되는지 봉인 비교한다.", "Before real application, add second-stage MNAR in which rescue itself fails by outcome and implement partial-identification intervals using both invitation and rescue-response probabilities. For smoothness, compute expected maximum-violation reduction for each candidate to actively search for hidden phase boundaries, then compare boundary detection and worst-case interval width against a uniform grid under the same 16-run sealed budget."),
    sourceIds: [...auditSources, ...smoothSources, "arxiv_weak_shadow_2026", "pmlr_candor_2026", "github_arrows"]
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
