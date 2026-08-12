/* RC-2026-04: known-truth off-policy identification and coverage stress test. */
(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    pmlr_ope_2017: {
      discipline: "mathematics",
      title: "Optimal and Adaptive Off-policy Evaluation in Contextual Bandits",
      url: "https://proceedings.mlr.press/v70/wang17a.html",
      evidenceLabel: "동료심사 하한·추정량 연구",
      evidenceLabelEn: "Peer-reviewed lower-bound and estimator study",
      resultPeriod: "ICML 2017 논문 · 학회 2017년 8월 6–11일",
      resultPeriodEn: "ICML 2017 paper; conference held 6–11 August 2017",
      reviewedOn: REVIEWED_ON
    },
    pmlr_dr_shrinkage_2020: {
      discipline: "mathematics",
      title: "Doubly robust off-policy evaluation with shrinkage",
      url: "https://proceedings.mlr.press/v119/su20a.html",
      evidenceLabel: "동료심사 유한표본 방법 연구",
      evidenceLabelEn: "Peer-reviewed finite-sample method study",
      resultPeriod: "ICML 2020 논문 · 학회 2020년 7월 13–18일",
      resultPeriodEn: "ICML 2020 paper; conference held 13–18 July 2020",
      reviewedOn: REVIEWED_ON
    },
    neurips_ope_interval_2020: {
      discipline: "mathematics",
      title: "Minimax Value Interval for Off-Policy Evaluation and Policy Optimization",
      url: "https://proceedings.neurips.cc/paper/2020/hash/1cd138d0499a68f4bb72bee04bbec2d7-Abstract.html",
      evidenceLabel: "동료심사 식별구간 연구",
      evidenceLabelEn: "Peer-reviewed identification-interval study",
      resultPeriod: "NeurIPS 2020 논문 · 개별 실험 기간 없음",
      resultPeriodEn: "NeurIPS 2020 paper; no single experimental period",
      reviewedOn: REVIEWED_ON
    },
    pmlr_nonstationary_ope_2023: {
      discipline: "computer",
      title: "Asymptotically Unbiased Off-Policy Policy Evaluation when Reusing Old Data in Nonstationary Environments",
      url: "https://proceedings.mlr.press/v206/liu23d.html",
      evidenceLabel: "동료심사 비정상 정책평가 연구",
      evidenceLabelEn: "Peer-reviewed nonstationary policy-evaluation study",
      resultPeriod: "AISTATS 2023 논문 · 학회 2023년 4월 25–27일",
      resultPeriodEn: "AISTATS 2023 paper; conference held 25–27 April 2023",
      reviewedOn: REVIEWED_ON
    },
    pmlr_candor_2026: {
      discipline: "medicine",
      title: "CANDOR: Counterfactual ANnotated DOubly Robust Off-Policy Evaluation",
      url: "https://proceedings.mlr.press/v333/mandyam26a.html",
      evidenceLabel: "동료심사 반사실 주석 연구",
      evidenceLabelEn: "Peer-reviewed counterfactual-annotation study",
      publishedOn: "2026-06-29",
      resultPeriod: "CHIL 2026 논문 · 학회 2026년 6월 29–30일",
      resultPeriodEn: "CHIL 2026 paper; conference held 29–30 June 2026",
      reviewedOn: REVIEWED_ON
    }
  });

  const records = {
    "UP-182": {
      role: pair("재생된 행동을 정책 가치와 불확실성으로 번역하는 탐색 평가 층", "Search-evaluation layer translating replayed actions into policy value and uncertainty"),
      updatedDefinition: pair(
        "탐색 정책을 재생할 수 있어도 더 좋은 정책이라고 말하려면 그 정책을 실제로 실행하지 않은 회차의 결과를 추정해야 한다. 각 후보가 선택될 확률, 결과가 기록될 확률, 결과모형과 후보 지지집합을 함께 검사하고, 편향뿐 아니라 신뢰구간이 참값을 약속한 비율로 포함하는지 판정해야 한다.",
        "Replayable actions are not enough to establish a better search policy; one must estimate outcomes for rounds where that policy was not executed. Action propensities, outcome-observation probabilities, the outcome model, and candidate support must be checked jointly, with interval coverage adjudicated alongside bias."
      ),
      knownBoundary: pair(
        "알려진 참 정책가치 0.4793을 가진 400개 반복×8개 시나리오에서 정상 조건의 DM·IPW·DR 편향은 각각 0.0019, 0.0036, 0.0031이었다. 결과모형만 틀렸을 때 DM 편향은 −0.0387로 커졌지만 DR은 −0.0024, 행동성향만 틀렸을 때 IPW는 +0.2182였지만 DR은 −0.0023이었다. 한 보조모형이 맞을 때 점 추정이 살아남는 이중강건 패턴을 재현했다.",
        "Across 400 replications in each of eight scenarios with known target-policy value 0.4793, well-specified DM, IPW, and DR biases were 0.0019, 0.0036, and 0.0031. With only the outcome model wrong, DM bias grew to -0.0387 while DR remained -0.0024; with only propensity wrong, IPW bias was +0.2182 while DR remained -0.0023. The simulation reproduced point-estimate double robustness when one nuisance model was correct."
      ),
      bottleneck: pair(
        "낮은 편향과 유효한 불확실성은 다른 요구다. 성향모형이 틀린 시나리오에서 DR 편향은 작았지만 95% 구간 커버리지는 99%로 사전 허용 상한 98%를 넘었고, 약한 겹침에서는 유효표본크기가 89.24로 100 관문 아래였다.",
        "Low bias and valid uncertainty are different requirements. Under propensity misspecification, DR bias stayed small but 95% coverage reached 99%, above the frozen 98% upper tolerance; under weak overlap, effective sample size fell to 89.24, below the gate of 100."
      ),
      minimumAdvance: pair(
        "실제 전향 원장의 각 회차에서 최소 행동확률, 유효표본크기와 화학계별 커버리지를 계산하고, 재생 순위와 별도 무작위 정책시험의 순위가 일치해야 정책 효율 비교로 넘어갈 수 있다.",
        "A real prospective ledger must report minimum target-action propensity, effective sample size, and family-wise coverage by round, and its replay ranking must agree with a separate randomized policy test before policy-efficiency claims advance."
      ),
      hypotheses: [
        { code: "H1", claim: pair("결과모형과 행동성향 중 하나가 맞으면 DR 정책가치의 점 편향은 작은 범위에 머문다.", "DR point-value bias remains small when either the outcome model or action propensity is correct."), prediction: pair("한 보조모형만 의도적으로 틀린 시나리오에서 |편향|≤0.02를 유지한다. 이번 시험의 두 편향은 0.0024와 0.0023 이하였다.", "Under deliberate misspecification of one nuisance model, absolute bias stays at or below 0.02; the two observed magnitudes were 0.0024 and 0.0023."), reject: pair("독립 구현 또는 새 DGP에서 한 모형이 정확한데도 |편향|>0.02이거나 반복 방향이 바뀌면 구현·가정별로 기각한다.", "Reject for the affected implementation or assumption if an independent implementation or new DGP exceeds 0.02 bias despite one correct nuisance model, or reverses the repeated direction.") },
        { code: "H2", claim: pair("후보 겹침이 약하면 무편향에 가까운 추정량도 실험 결정을 지지할 정밀도를 잃는다.", "Weak candidate overlap can destroy decision-grade precision even for nearly unbiased estimators."), prediction: pair("최소 성향이 0.012인 시나리오에서 IPW RMSE와 구간폭이 정상 조건보다 커지고 ESS가 100 아래로 내려간다. 관측값은 RMSE 0.0763, 폭 0.2801, ESS 89.24였다.", "With minimum propensity 0.012, IPW RMSE and interval width exceed the well-overlapped case and ESS falls below 100; observed values were 0.0763, 0.2801, and 89.24."), reject: pair("같은 표본수·결과분산에서 약한 겹침이 ESS·RMSE·구간폭을 사전 허용차 밖으로 악화시키지 않으면 기각한다.", "Reject if weak overlap does not worsen ESS, RMSE, or interval width beyond preregistered tolerances at the same sample size and outcome variance.") },
        { code: "H3", claim: pair("점 편향 관문 통과만으로 정책 비교를 승인하면 잘못 보정된 신뢰구간을 놓친다.", "A point-bias gate alone misses miscalibrated intervals."), prediction: pair("성향모형 오류에서 DR |편향|은 0.02 이하이지만 커버리지는 허용 범위 밖으로 이동한다. 이번에는 편향 0.0023, 커버리지 99%였다.", "Under propensity error, DR absolute bias remains below 0.02 while coverage leaves the allowed range; this cycle observed 0.0023 bias and 99% coverage."), reject: pair("다양한 성향 오류와 표본수에서 점 편향 관문 통과가 항상 90–98% 커버리지와 동반되면 별도 커버리지 관문의 필요성을 기각한다.", "Reject the need for a separate coverage gate if passing the point-bias gate always coincides with 90-98% coverage across diverse propensity errors and sample sizes.") }
      ],
      decisiveTest: pair(
        "다음 실제 캠페인은 30개 독립 소캠페인으로 나눠 회차별 후보와 확률을 저장하고, 화학계 하나를 봉인한다. 원장 기반 DM·IPW·DR 순위가 봉인 화학계의 층화 무작위 정책 비교와 같은 방향을 내며 ESS≥100, 95% 커버리지 90–98%를 동시에 만족할 때만 탐색정책 우위를 주장한다.",
        "Partition the next real campaign into 30 independent subcampaigns, log candidates and propensities by round, and seal one chemical family. Claim policy advantage only when ledger-based DM, IPW, and DR rankings agree in direction with stratified randomized comparison in the sealed family while ESS is at least 100 and 95% coverage lies between 90% and 98%."
      ),
      unresolved: pair("현재 참값은 합성 DGP의 값이며 실제 합성 성공률·정책가치·화학계 이동을 측정하지 않는다. 실제 정책은 후보공간 자체를 바꿀 수 있어 이번 외생 맥락 모형보다 긴 순차 의존을 가진다.", "The known truth belongs to a synthetic DGP and measures no real synthesis success rate, policy value, or chemical-family transport. Real policies may alter the candidate space itself and therefore have longer sequential dependence than this exogenous-context model."),
      sourceIds: ["pmlr_ope_2016", "pmlr_ope_2017", "pmlr_dr_shrinkage_2020", "pmlr_nonstationary_ope_2023"]
    },
    "UP-185": {
      role: pair("실패가 사라지는 선택과정을 정책 원장의 일부로 만드는 관측 층", "Observation layer making failure disappearance part of the policy ledger"),
      updatedDefinition: pair(
        "완전 원장은 어떤 실험이 선택됐는지만이 아니라 결과가 측정·저장·공개될 확률도 기록해야 한다. 성공과 실패에 따라 원 신호 보존율이 다르면 행동성향을 정확히 알아도 결과분포가 바뀌며, 독립 판정표를 나중에 채워 넣는 것만으로는 잃어버린 결과를 복원할 수 없다.",
        "A complete ledger must record not only which experiment was selected but also the probability that its outcome was measured, retained, and released. If raw-signal retention differs by success, exact action propensities do not prevent outcome-distribution distortion, and later annotations cannot reconstruct outcomes that were never preserved."
      ),
      knownBoundary: pair(
        "결과가 1이면 관측확률이 최대 0.90, 0이면 최소 0.25가 되도록 만든 MNAR 시나리오에서 관측률은 약 54.4%였다. 이 검열을 무시하면 DM·DR 편향은 각각 +0.2229, +0.2235이고 두 95% 커버리지는 0%였다. 참 검열확률을 사용한 오라클 보정에서는 편향이 +0.0079, +0.0076이고 커버리지는 91.25%, 92.25%로 회복됐다.",
        "In an MNAR scenario where observation probability reached 0.90 for successes and fell to 0.25 for failures, about 54.4% of outcomes remained visible. Ignoring censoring produced DM and DR biases of +0.2229 and +0.2235 with 0% coverage for both. Oracle correction using the true response propensity reduced biases to +0.0079 and +0.0076 and restored coverage to 91.25% and 92.25%."
      ),
      bottleneck: pair(
        "실제 자료에서는 사라진 결과의 검열확률 자체가 관측되지 않는다. 오라클 보정의 성공은 무엇을 기록해야 하는지 보여줄 뿐, 공개 성공 중심 데이터에서 그 확률을 추정할 수 있다는 증거가 아니다.",
        "In real data, the censoring probability of a vanished outcome is itself unobserved. Oracle correction shows what must be logged; it is not evidence that the propensity can be recovered from a success-enriched public dataset."
      ),
      minimumAdvance: pair(
        "연속 캠페인에서 실행 파일·원 XRD·판정표의 예상 수와 실제 수를 매일 대조하고 누락 이유를 결과와 독립적으로 기록한 뒤, 누락모형을 가린 두 번째 팀이 관측확률과 성공률 구간을 재현하면 검열 보정의 입력을 처음 검증할 수 있다.",
        "A consecutive campaign must reconcile expected and actual execution files, raw XRD, and adjudication records daily while logging missingness reasons independently of outcomes. A second team blinded to the missingness model must then reproduce observation propensities and success-rate intervals."
      ),
      hypotheses: [
        { code: "H1", claim: pair("결과별 관측확률을 전향 기록하면 MNAR로 인한 정책가치 편향을 역확률로 줄일 수 있다.", "Prospectively logged outcome-observation propensities can reduce MNAR policy-value bias by inverse weighting."), prediction: pair("참 q를 사용한 DM·IPW·DR이 모두 |편향|≤0.02와 90–98% 커버리지를 충족한다. 이번 오라클 시험은 세 추정량 모두 통과했다.", "DM, IPW, and DR using true q all attain absolute bias at most 0.02 and 90-98% coverage; all three passed in this oracle test."), reject: pair("q가 정확하고 겹침·표본 관문을 통과했는데도 편향 또는 커버리지가 기준 밖이면 보정식이나 관측모형을 기각한다.", "Reject the correction or observation model if bias or coverage fails despite exact q and passed overlap and sample gates.") },
        { code: "H2", claim: pair("결과의존 누락을 일반 결측처럼 무시하면 정확한 행동성향과 결과 기저함수도 정책가치를 구하지 못한다.", "Treating outcome-dependent absence as ordinary missingness defeats exact action propensities and a correct outcome basis."), prediction: pair("q=1로 분석하면 DM·DR |편향|>0.02 또는 커버리지 관문 실패가 나타난다. 이번 결과는 두 편향 0.22 초과, 커버리지 0%였다.", "Analyzing with q=1 yields DM or DR absolute bias above 0.02 or coverage failure; both biases exceeded 0.22 and coverage was 0% here."), reject: pair("다양한 결과의존 검열 강도에서 q를 무시해도 편향과 커버리지가 유지되면 해당 DGP 범위에서 기각한다.", "Reject within any DGP range where ignoring q preserves both bias and coverage across varied outcome-dependent censoring strengths.") },
        { code: "H3", claim: pair("전문가의 반사실 주석은 사라진 실패를 실측값처럼 대체할 수 없다.", "Expert counterfactual annotations cannot replace vanished failures as if they were measured outcomes."), prediction: pair("주석 오류가 결과모형에만 들어갈 때보다 IPW 잔차나 실제 결과로 직접 들어갈 때 정책가치 오차가 커진다.", "Policy-value error is larger when annotation error enters IPW residuals or is treated as outcome truth than when annotations are restricted to the outcome-model component."), reject: pair("독립 진실자료에서 모든 주석 사용 위치가 같은 편향·분산을 보이면 사용 위치가 중요하다는 주장을 기각한다.", "Reject the importance of placement if every annotation-use strategy has equal bias and variance against independently observed truth.") }
      ],
      decisiveTest: pair(
        "실제 캠페인의 완전 원장에서 결과를 보존한 뒤, 결과·장비·회차에 따른 검열을 별도 복제본에만 인위적으로 적용한다. 완전 원장을 진실자료로 두고 q 무시, 추정 q, 민감도 구간과 전문가 주석을 비교하며, 개발에 쓰지 않은 판정자가 실패 유형과 누락 이유를 맹검 확인한다.",
        "Preserve a complete real campaign ledger, then apply outcome-, instrument-, and round-dependent censoring only to copies. Treat the complete ledger as truth and compare ignored q, estimated q, sensitivity intervals, and expert annotations, with blinded adjudicators independently confirming failure type and missingness reason."
      ),
      unresolved: pair("ARROWS 공개 예제의 Experimentally Verified=false가 미실행 후보, 보류 상태 또는 다른 의미인지 공식 문서에서 확인하지 못했다. 따라서 51개 XRD 결손 행에 이번 q 보정을 적용하지 않았다.", "Official documentation still does not establish whether Experimentally Verified=false in the public ARROWS example means an unexecuted candidate, held-out state, or something else. The q correction was therefore not applied to its 51 XRD-absent rows."),
      sourceIds: ["nature_arrows_2023", "github_arrows", "pmlr_candor_2026", "pmlr_nonstationary_ope_2023"]
    },
    "UP-430": {
      role: pair("재료 정책평가의 지지집합·반사실 검증을 임상 하위집단 효과로 옮기는 외부 시험장", "External test bed transferring support and counterfactual validation from materials policy evaluation to subgroup treatment effects"),
      updatedDefinition: pair(
        "한 사람에게 치료와 비치료를 동시에 시행할 수 없으므로 개인 치료효과는 직접 관측되지 않는다. 현실적으로 식별할 수 있는 목표는 비교 가능한 환자가 실제로 두 선택을 받을 가능성이 있는 범위에서 조건부 평균효과와 불확실성을 추정하고, 지지집합 밖에서는 개인효과를 단정하지 않는 것이다.",
        "An individual's treated and untreated outcomes cannot both be observed, so an individual treatment effect is never directly measured. A defensible target is a conditional average effect with calibrated uncertainty where comparable patients could receive either option, with no individual-effect claim outside that support."
      ),
      knownBoundary: pair(
        "2026년 CANDOR 연구는 의료 오프정책 평가에서 불완전한 전문가 반사실 주석이 주석을 쓰지 않은 것보다 나쁠 수 있고, 주석을 DR의 결과모형 부분에만 쓰는 전략이 모형 오류와 주석 오류에 가장 강건했다고 보고했다. 이는 임상 지식을 실제 잠재결과로 취급하지 말고 별도 보조모형으로 제한해야 함을 보여준다.",
        "The 2026 CANDOR study reports that imperfect expert counterfactual annotations can perform worse than using no annotations in healthcare OPE, and that restricting annotations to the outcome-model component of DR was most robust to model and annotation errors. Clinical judgment should therefore remain an auxiliary model rather than be treated as observed potential outcome."
      ),
      bottleneck: pair(
        "환자 하위집단이 치료를 받을 확률이 0 또는 1에 가까우면 반대 치료 결과를 자료에서 배울 수 없다. 재료 후보의 양의성 붕괴와 같은 구조지만, 임상에서는 미측정 중증도·치료 순응·간섭과 안전 제한이 추가돼 단순 방법 이전이 깨질 수 있다.",
        "When treatment probability approaches zero or one within a patient subgroup, the opposite outcome cannot be learned from data. This mirrors positivity failure for materials candidates, but unmeasured severity, adherence, interference, and safety constraints can break a direct methodological transfer."
      ),
      minimumAdvance: pair(
        "무작위 임상시험에서 얻은 봉인 하위집단을 진실 판정에 사용하고, 관찰자료 기반 DM·IPW·DR 및 주석 보강 추정의 편향·커버리지·거부영역을 사전 등록 비교하면 이전 가능성을 한 단계 판정할 수 있다.",
        "A preregistered comparison of observational DM, IPW, DR, and annotation-augmented estimates against sealed randomized-trial subgroups—reporting bias, coverage, and abstention regions—would provide one adjudication of transferability."
      ),
      hypotheses: [
        { code: "H1", claim: pair("치료 지지집합과 측정된 교란변수가 충분하면 DR로 하위집단 평균효과를 보정할 수 있다.", "With adequate treatment support and measured confounding, DR can calibrate subgroup average effects."), prediction: pair("한 보조모형만 틀린 외부검증에서도 하위집단 효과 편향과 95% 커버리지가 사전 허용범위에 머문다.", "Subgroup-effect bias and 95% coverage remain within preregistered tolerances under external validation when only one nuisance model is wrong."), reject: pair("무작위 하위집단과 비교해 방향이 뒤집히거나 커버리지가 반복 붕괴하면 해당 교란·이동 조건에서 기각한다.", "Reject under the affected confounding or transport condition if direction reverses or coverage repeatedly collapses against randomized subgroups.") },
        { code: "H2", claim: pair("불완전한 반사실 주석은 결과모형에만 제한할 때 가장 안전하다.", "Imperfect counterfactual annotations are safest when restricted to the outcome model."), prediction: pair("주석을 실측 결과나 잔차 보정에 넣는 방법보다 DM 구성요소에만 넣는 방법의 최악 편향이 작다.", "Worst-case bias is lower when annotations enter only the DM component than when treated as observed outcomes or used in residual correction."), reject: pair("독립 잠재결과가 있는 자료에서 사용 위치별 최악 편향이 같으면 기각한다.", "Reject if worst-case bias is equal across annotation placements on data with independently known potential outcomes.") },
        { code: "H3", claim: pair("치료 지지집합 밖 개인효과는 정확한 점값보다 구간과 거부로만 정직하게 표현할 수 있다.", "Outside treatment support, honest individual effects require bounds and abstention rather than precise point values."), prediction: pair("성향이 0인 하위집단에서 서로 다른 잠재결과모형이 관측분포를 똑같이 맞추면서 반대 치료효과를 낸다.", "Within a zero-propensity subgroup, distinct potential-outcome models fit the same observed distribution while implying opposing treatment effects."), reject: pair("추가 무작위화·도구변수·생물학적 제약이 잠재결과를 유일하게 정하면 해당 범위에서 기각한다.", "Reject within any region where additional randomization, an instrument, or biological constraints uniquely identify the potential outcome.") }
      ],
      decisiveTest: pair(
        "같은 적응형 선택 시뮬레이터를 치료·비치료로 재표현하고 0 지지집합, MNAR 추적손실과 10–30% 오류의 전문가 주석을 교차한다. 그 뒤 결과를 보지 않은 팀이 봉인 무작위 하위집단에서 하위집단 효과 방향, 95% 커버리지와 거부율을 판정한다.",
        "Re-express the adaptive-selection simulator as treatment versus control and cross zero support, MNAR loss to follow-up, and expert annotations with 10-30% error. An outcome-blind team then adjudicates subgroup-effect direction, 95% coverage, and abstention against sealed randomized subgroups."
      ),
      unresolved: pair("이번 사이클에는 환자자료나 임상 결과가 없고 의료 개입 권고를 만들지 않았다. 구조적 대응은 검증 후보이며 개인정보·동의·공정성과 위해 최소화 검토 없이는 실제 적용할 수 없다.", "This cycle used no patient data, produced no clinical recommendation, and treats the structural mapping only as a validation candidate. Real use requires privacy, consent, fairness, and harm-minimization review."),
      sourceIds: ["pmlr_candor_2026", "pmlr_ope_2017", "neurips_ope_interval_2020", "pmlr_nonstationary_ope_2023"]
    },
    "UP-629": {
      role: pair("점 식별, 정밀도 부족과 완전 비식별을 분리하는 판정 층", "Adjudication layer separating point identification, inadequate precision, and non-identification"),
      updatedDefinition: pair(
        "무작위가 아닌 선택의 핵심은 추정량을 고르는 일이 아니라 어떤 반사실 분포가 자료와 가정으로 식별되는지 먼저 정하는 것이다. 양의성이 유지되더라도 가중치가 극단적이면 유한표본 결론은 약하고, 선택확률이 0이면 결과모형이 우연히 참값에 가까워도 자료만으로 점값을 정당화할 수 없다.",
        "The central task under non-random selection is to determine which counterfactual distribution is identified by data and assumptions before choosing an estimator. Even with positivity, extreme weights weaken finite-sample conclusions; when selection probability is zero, a numerically accurate outcome model still cannot justify a point value from the data alone."
      ),
      knownBoundary: pair(
        "약한 겹침 시나리오는 최소 성향 0.0121로 양의성을 유지했지만 ESS 89.24로 정밀도 관문을 실패했다. 17.49%의 표적 행동에 확률 0을 준 시나리오에서는 DM·DR이 참값 근처를 냈어도 모델 외삽에 불과해 모두 diagnosticOnly로 표시했다. 두 보조모형을 함께 틀린 적대 대조에서는 DR 편향 0.2190, 커버리지 5.25%로 붕괴했다.",
        "The weak-overlap scenario retained positivity at minimum propensity 0.0121 but failed the precision gate with ESS 89.24. When 17.49% of target actions had zero probability, DM and DR happened to lie near truth but were marked diagnostic-only because they were model extrapolations. In an adversarial control with both nuisance models wrong, DR bias reached 0.2190 and coverage collapsed to 5.25%."
      ),
      bottleneck: pair(
        "숫자가 참값에 가깝다는 사후 사실은 식별 증거가 아니다. 지지집합 밖에서는 같은 관측분포를 만드는 여러 반사실 세계가 존재하므로, 올바른 출력은 점 추정이 아니라 추가 가정별 값 구간과 필요한 새 무작위화다.",
        "Post hoc numerical proximity to truth is not identification evidence. Outside support, multiple counterfactual worlds reproduce the same observed distribution, so the correct output is an assumption-indexed value interval and a requirement for new randomization, not a point estimate."
      ),
      minimumAdvance: pair(
        "알려진 참값 시뮬레이터에서 점 추정과 최소최대 값 구간을 함께 계산해, 한 보조함수군이 맞을 때 구간이 참값을 덮고 오명세가 커질수록 길이가 증가하는지 확인하면 비식별을 정량적으로 표현할 수 있다.",
        "Compute point estimates and minimax value intervals together in a known-truth simulator, checking whether the interval covers truth when either nuisance class is correct and widens with misspecification. This would quantify rather than conceal non-identification."
      ),
      hypotheses: [
        { code: "H1", claim: pair("DR의 점 이중강건성은 두 보조모형 중 하나가 맞다는 조건부 보장이다.", "DR point double robustness is conditional on at least one nuisance model being correct."), prediction: pair("한 모형 오류에서는 |편향|≤0.02지만 두 모형을 함께 적대적으로 틀리면 이를 넘는다. 관측 DR 편향은 각각 0.0024·0.0023 대 0.2190이었다.", "Absolute bias stays at or below 0.02 with one wrong model but exceeds it when both are adversarially wrong; observed magnitudes were 0.0024 and 0.0023 versus 0.2190."), reject: pair("독립 DGP 전반에서 두 모형이 모두 틀려도 같은 보장이 유지되면 조건부 경계를 수정한다.", "Revise the conditional boundary if the same guarantee survives both models being wrong across independent DGPs.") },
        { code: "H2", claim: pair("양의성과 유효표본크기는 별도 관문이다.", "Positivity and effective sample size are separate gates."), prediction: pair("최소 성향이 양수여도 ESS가 100 아래면 구간폭·RMSE가 정상 겹침보다 커진다.", "Even with positive minimum propensity, ESS below 100 increases interval width and RMSE relative to well-overlapped data."), reject: pair("다양한 가중치 꼬리에서 ESS 관문이 정밀도 악화와 무관하면 기각한다.", "Reject if the ESS gate is unrelated to precision degradation across diverse weight tails.") },
        { code: "H3", claim: pair("확률 0인 표적 행동의 가치는 비모수적으로 점 식별되지 않는다.", "The value of target actions assigned probability zero is not nonparametrically point identified."), prediction: pair("관측분포를 고정한 채 지지집합 밖 잠재결과만 바꿔 서로 다른 참 정책가치를 만들 수 있다.", "Holding the observed distribution fixed while changing only out-of-support potential outcomes yields different true policy values."), reject: pair("추가 가정이나 설계가 잠재결과를 유일하게 제한하면 그 제한된 모형 안에서 기각한다.", "Reject within a restricted model only when additional assumptions or design uniquely determine the potential outcome.") }
      ],
      decisiveTest: pair(
        "0 지지집합의 잠재결과를 낮음·높음 두 세계로 바꾸되 관측자료는 동일하게 생성한다. 모든 점 추정량이 두 참값 중 하나만 맞출 수 있음을 보인 뒤, 가치구간이 두 참값을 모두 포함하는지와 추가 10회 층화 무작위화 후 얼마나 줄어드는지 판정한다.",
        "Generate identical observed data under low and high out-of-support potential-outcome worlds. Show that every point estimator can match at most one truth, then test whether a value interval contains both truths and how much ten additional stratified randomized observations shrink it."
      ),
      unresolved: pair("이번 결과는 알려진 q를 사용한 오라클 보정까지만 다뤘다. 실제 MNAR에서 q가 미지이면 DR 점 추정도 식별되지 않으므로 다음 사이클은 선택오즈 민감도와 최소최대 값 구간을 구현해야 한다.", "This result reaches only oracle correction with known q. With unknown q under real MNAR, a DR point estimate is not identified; the next cycle must implement selection-odds sensitivity and minimax value intervals."),
      sourceIds: ["pmlr_ope_2017", "neurips_ope_interval_2020", "pmlr_dr_shrinkage_2020", "pmlr_nonstationary_ope_2023"]
    }
  };

  const crossFieldConnection = {
    id: "CONN-CAUSAL-001",
    problemIds: ["UP-182", "UP-430", "UP-629"],
    type: pair("정책 가치와 하위집단 효과의 지지집합", "Support for policy value and subgroup effects"),
    strength: "method-transfer",
    sharedBottleneck: pair("선택확률이 0인 맥락에서는 실행하지 않은 행동의 결과가 관측되지 않아 정책 가치와 조건부 치료효과가 모두 점 식별되지 않는다.", "When selection probability is zero in a context, outcomes under the unchosen action are unobserved, preventing point identification of both policy value and conditional treatment effect."),
    mapping: pair("재료의 후보 조리법은 가능한 치료, 화학계·중간상 이력은 환자 공변량·병력, 합성 성공은 임상 결과, 탐색 정책은 치료 배정 규칙, 미보존 실패는 추적손실에 대응한다.", "Candidate recipes map to treatment options; chemical family and intermediate history to patient covariates and history; synthesis success to clinical outcome; search policy to treatment assignment; and unretained failures to loss to follow-up."),
    transferableMethod: pair("겹침 진단, 성향가중, DR, 지지집합 밖 거부와 반사실 주석을 결과모형에만 제한하는 검증 체계를 양방향으로 이전한다.", "Transfer overlap diagnostics, propensity weighting, DR, out-of-support abstention, and validation that restricts counterfactual annotations to the outcome-model component in both directions."),
    evidence: pair("합성 시뮬레이터는 약한 겹침·0 지지집합·MNAR의 분리 판정을 제공했고, CANDOR는 의료 자료에서 주석 오류의 위치가 OPE 성능을 바꿈을 보였다.", "The synthetic simulator separates weak overlap, zero support, and MNAR, while CANDOR shows in healthcare data that the placement of annotation error changes OPE performance."),
    validationStatus: pair("수학적 구조 직접 대응 · 실제 재료·임상 외부검증 대기", "Direct mathematical mapping; real materials and clinical external validation pending"),
    failureBoundary: pair("임상 미측정 교란·순응·환자 간 간섭과 재료 반응의 경로의존성은 현재 외생 맥락 모형에 없으며, 한 분야의 수치 임계값을 다른 분야로 그대로 옮길 수 없다.", "Clinical unmeasured confounding, adherence, and interference and materials reaction-path dependence are absent from the current exogenous-context model; numerical thresholds cannot be copied across fields."),
    minimumTest: pair("같은 알려진 잠재결과 DGP를 재료 정책과 치료 정책으로 각각 표현해 추정량 결과가 불변인지 확인한 뒤, 각 분야의 봉인 전향·무작위 자료에서 방향을 독립 판정한다.", "Express the same known-potential-outcome DGP as materials and treatment policies, verify estimator invariance, then independently adjudicate direction on sealed prospective or randomized data in each field."),
    sourceIds: ["pmlr_ope_2017", "neurips_ope_interval_2020", "pmlr_candor_2026"]
  };
  if (!connections.some(({ id }) => id === crossFieldConnection.id)) connections.push(crossFieldConnection);

  for (const id of ["CONN-MAT-004", "CONN-MAT-006"]) {
    const connection = connections.find(item => item.id === id);
    if (!connection) continue;
    connection.evidence = id === "CONN-MAT-004"
      ? pair("결과의존 검열을 무시한 시뮬레이션에서 DR 편향 0.2235·커버리지 0%, 오라클 q 보정에서 0.0076·92.25%를 관측했다.", "Ignoring outcome-dependent censoring yielded DR bias 0.2235 and 0% coverage; oracle q correction yielded 0.0076 and 92.25%.")
      : pair("한 보조모형 오류에서는 DR 편향이 0.0024 이하였지만 두 모형 오류에서는 0.2190으로 커졌고, 0 지지집합에서는 점 식별을 거부했다.", "DR bias stayed at or below 0.0024 with one nuisance error, rose to 0.2190 with both wrong, and point identification was refused under zero support.");
    connection.transferableMethod = id === "CONN-MAT-004"
      ? pair("결과 관측확률 가중, 선택오즈 민감도와 값 구간을 실패 공개 편향에 적용한다.", "Apply response-propensity weighting, selection-odds sensitivity, and value intervals to failure-reporting bias.")
      : pair("후보 지지집합·행동성향·DR과 ESS/커버리지 이중 관문을 자율 합성 정책에 적용한다.", "Apply candidate support, action propensities, DR, and joint ESS/coverage gates to autonomous-synthesis policies.");
    connection.validationStatus = pair("알려진 참값 합성시험 통과 · 실제 캠페인 대기", "Known-truth synthetic test complete; real campaign pending");
    connection.sourceIds = [...new Set([...connection.sourceIds, "pmlr_ope_2017", "pmlr_dr_shrinkage_2020", "neurips_ope_interval_2020"])];
  }

  const cycle = {
    id: "RC-2026-04",
    title: "정책가치는 언제 식별되는가",
    titleEn: "When is policy value identifiable?",
    status: "active",
    startedOn: REVIEWED_ON,
    reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records),
    connectionIds: ["CONN-MAT-004", "CONN-MAT-006", "CONN-CAUSAL-001"],
    selectionReason: "RC-2026-03은 행동 재생이 가능해도 정책 우위는 아직 알 수 없다는 경계를 남겼다. 이번 사이클은 참 정책가치를 아는 반복 시뮬레이션으로 보조모형 오류, 결과의존 누락, 약한 겹침과 0 지지집합을 분리해 어느 조건에서 점 추정·신뢰구간·거부가 필요한지 실제 수치로 판정했다. 같은 수학 구조가 임상 하위집단 효과에도 직접 나타나 최신 의료 OPE 연구와 연결했다.",
    selectionReasonEn: "RC-2026-03 established that replayable actions do not reveal policy superiority. This cycle uses repeated known-truth simulation to separate nuisance-model error, outcome-dependent missingness, weak overlap, and zero support, numerically adjudicating when point estimates, intervals, or refusal are warranted. The same structure appears directly in clinical subgroup effects, enabling a connection to current healthcare OPE research.",
    verifiedFindings: [
      { text: "맥락적 밴딧 OPE의 최악조건 하한은 IPW와 DR이 상수배까지 달성할 수 있지만, 유한표본에서는 큰 가중치가 편향–분산 절충을 악화시켜 축소·절단이 필요할 수 있다.", textEn: "In contextual-bandit OPE, IPW and DR can match agnostic minimax lower bounds up to constants, while large finite-sample weights can require shrinkage or clipping to control bias-variance tradeoffs.", sourceIds: ["pmlr_ope_2017", "pmlr_dr_shrinkage_2020"] },
      { text: "참 정책가치 0.4793, 반복당 30캠페인×20회, 시나리오당 400반복을 고정했다. 정상 조건의 DM·IPW·DR 편향은 0.0037 이하였다.", textEn: "The frozen design used true policy value 0.4793, 30 campaigns of 20 rounds per replication, and 400 replications per scenario. Well-specified DM, IPW, and DR biases were all below 0.0037.", sourceIds: ["pmlr_ope_2016", "pmlr_ope_2017"] },
      { text: "결과모형 또는 성향모형 하나만 틀렸을 때 DR 편향은 각각 −0.0024와 −0.0023으로 유지됐지만, 두 모형을 함께 적대적으로 틀리자 +0.2190과 5.25% 커버리지로 붕괴했다.", textEn: "DR bias remained -0.0024 and -0.0023 when only the outcome or propensity model was wrong, but collapsed to +0.2190 bias and 5.25% coverage when both were adversarially wrong.", sourceIds: ["pmlr_ope_2016", "pmlr_ope_2017"] },
      { text: "MNAR 검열을 무시하면 DR 편향 +0.2235·95% 커버리지 0%였고, 참 관측확률을 쓴 오라클 보정에서는 +0.0076·92.25%로 회복됐다. 오라클 성공은 미지 q의 식별을 뜻하지 않는다.", textEn: "Ignoring MNAR censoring produced DR bias +0.2235 and 0% coverage; oracle correction with true observation propensities restored +0.0076 bias and 92.25% coverage. Oracle success does not identify unknown q in real data.", sourceIds: ["pmlr_nonstationary_ope_2023", "neurips_ope_interval_2020"] },
      { text: "최소 성향 0.0121의 약한 겹침은 양의성을 유지했지만 ESS 89.24로 정밀도 관문을 실패했다. 표적 행동의 17.49%가 확률 0인 경우에는 모델 예측이 참값에 가까워도 모든 점 추정을 진단 전용으로 판정했다.", textEn: "Weak overlap retained positivity at minimum propensity 0.0121 but failed the precision gate with ESS 89.24. When 17.49% of target actions had zero probability, all point estimates were marked diagnostic-only even if model predictions happened to lie near truth.", sourceIds: ["pmlr_ope_2017", "neurips_ope_interval_2020"] },
      { text: "2026년 CANDOR는 불완전한 전문가 반사실 주석이 무주석 평가보다 나쁠 수 있으며, 주석을 DR의 결과모형 부분에만 넣는 전략이 의료 과제에서 가장 강건했다고 보고했다.", textEn: "The 2026 CANDOR study reports that imperfect expert counterfactual annotations can be worse than no annotations, while restricting them to the DR outcome-model component was most robust on healthcare tasks.", sourceIds: ["pmlr_candor_2026"] }
    ],
    resultMatrix: {
      title: pair("같은 추정량이 통과하거나 무너지는 조건", "Conditions under which the same estimator passes or fails"),
      note: pair("DR 기준. 편향과 커버리지가 좋아도 지지집합 또는 ESS 관문을 실패하면 정책 비교에는 사용하지 않는다.", "DR shown. A point estimate is not used for policy comparison when support or ESS fails, even if bias and coverage appear favorable."),
      columns: [pair("시나리오", "Scenario"), pair("ESS", "ESS"), pair("DR 편향", "DR bias"), pair("95% 커버리지", "95% coverage"), pair("판정", "Decision")],
      rows: [
        { label: pair("정상 명세", "Well specified"), values: ["260.18", "+0.0031", "93.25%", pair("통과", "Pass")] },
        { label: pair("결과모형 오류", "Outcome model wrong"), values: ["260.24", "−0.0024", "94.75%", pair("점·구간 통과", "Point and interval pass")] },
        { label: pair("성향모형 오류", "Propensity wrong"), values: ["210.53", "−0.0023", "99.00%", pair("구간 과보수", "Interval overconservative")] },
        { label: pair("두 모형 오류", "Both models wrong"), values: ["209.52", "+0.2190", "5.25%", pair("기각", "Reject")] },
        { label: pair("MNAR 무시", "MNAR ignored"), values: ["145.90", "+0.2235", "0.00%", pair("기각", "Reject")] },
        { label: pair("MNAR 오라클 보정", "MNAR oracle correction"), values: ["113.98", "+0.0076", "92.25%", pair("오라클에서만 통과", "Pass under oracle only")] },
        { label: pair("약한 겹침", "Weak overlap"), values: ["89.24", "−0.0053", "94.50%", pair("정밀도 부족", "Insufficient precision")] },
        { label: pair("0 지지집합", "Zero support"), values: ["215.99", "+0.0023", "88.00%", pair("점 식별 거부", "Refuse point identification")] }
      ]
    },
    sharedProgram: {
      name: pair("알려진 참값 정책평가 관문", "Known-truth policy-evaluation gate"),
      thesis: pair("정책가치는 재생 가능성, 양의성, 충분한 유효표본, 누락모형과 신뢰구간 커버리지를 모두 통과할 때만 실제 우위 비교에 사용할 수 있다.", "Policy value can support real policy comparison only after replayability, positivity, effective sample size, missingness modeling, and interval coverage all pass."),
      design: pair("두 행동, 세 맥락변수와 이전 관측결과에 의존하는 행동정책을 가진 30×20 순차 캠페인을 시나리오당 400회 반복했다. 정상, 보조모형 오류, MNAR, 약한 겹침과 0 지지집합을 교차하고 캠페인 군집 표준오차로 95% 구간을 계산했다.", "Repeated a 30-by-20 sequential campaign with two actions, three context variables, and a behavior policy depending on the previous visible outcome 400 times per scenario. Crossed nuisance error, MNAR, weak overlap, and zero support, using campaign-clustered standard errors for 95% intervals."),
      adjudication: pair("DGP와 참값 적분을 먼저 고정하고 추정량 공식을 작은 수작업 고정물로 별도 검산했다. 지지집합과 ESS 판정은 추정값이 참값에 가까운지 보기 전에 적용했다.", "Froze the DGP and truth quadrature first and independently checked estimator formulas on a small hand-calculated fixture. Support and ESS gates were applied before inspecting numerical proximity to truth."),
      primaryMetrics: pair("정책가치 편향·RMSE, 캠페인 군집 95% 커버리지와 폭, 최소 표적 행동성향, 결합가중 ESS, 0 지지집합 비율", "Policy-value bias and RMSE, campaign-clustered 95% coverage and width, minimum target-action propensity, combined-weight ESS, and zero-support fraction"),
      successRule: pair("실제 평가로 이동하려면 |편향|≤0.02, 95% 커버리지 90–98%, ESS≥100, 최소 표적 성향≥0.01을 모두 충족하고 0 지지집합이 없어야 한다. 실제 화학계에서는 별도 무작위 비교가 같은 방향을 확인해야 한다.", "Advance to real evaluation only if absolute bias is at most 0.02, 95% coverage is 90-98%, ESS is at least 100, minimum target propensity is at least 0.01, and zero support is absent. A separate randomized comparison must confirm direction in real chemistry."),
      stopRule: pair("결과의존 누락확률을 알 수 없으면 오라클 보정을 주장하지 않는다. 지지집합이 0이면 점 추정을 중단하고, ESS 또는 커버리지가 실패하면 숫자가 참값에 가까워도 정책 비교에 사용하지 않는다.", "Do not claim oracle correction when outcome-dependent observation propensities are unknown. Stop point estimation under zero support, and do not use an estimate for policy comparison when ESS or coverage fails even if it happens to be numerically close to truth."),
      status: pair("8개 시나리오 3,200개 반복 완료 · 미지 MNAR 값 구간과 실제 원장 대기", "3,200 replications across eight scenarios complete; unknown-MNAR value intervals and real ledger pending")
    },
    artifacts: [
      { title: pair("OPE 식별 시뮬레이션 규격", "OPE identification simulation specification"), description: pair("DGP, 잠재결과, 표적·행동 정책, 8개 시나리오, 추정량과 사전 판정 관문을 고정한 규격", "Frozen DGP, potential outcomes, target and behavior policies, eight scenarios, estimators, and preregistered gates"), url: "research/ope/simulation-spec.json", kind: "JSON" },
      { title: pair("400반복 정책평가 결과", "400-replication policy-evaluation results"), description: pair("시나리오별 편향·RMSE·커버리지·구간폭·ESS·지지집합 판정과 해석 경계를 기록한 결과", "Scenario-level bias, RMSE, coverage, interval width, ESS, support adjudication, and interpretation boundary"), url: "research/ope/simulation-result.json", kind: "JSON" },
      { title: pair("재현 실행 코드", "Reproducible simulation runner"), description: pair("고정 시드로 참값 적분, 3,200회 반복과 군집 신뢰구간을 다시 계산하는 의존성 없는 Node.js 코드", "Dependency-free Node.js runner recomputing truth quadrature, 3,200 replications, and clustered intervals from frozen seeds"), url: "scripts/run-ope-simulation.mjs", kind: "JavaScript" },
      { title: pair("독립 공식 검산", "Independent formula verification"), description: pair("수작업 고정물의 DM·IPW·DR 값, 결과 구조와 여덟 사전 판정을 검사하는 빠른 검증기", "Fast verifier checking hand-calculated DM, IPW, and DR values, result structure, and eight preregistered adjudications"), url: "scripts/verify-ope.mjs", kind: "JavaScript" }
    ],
    log: [
      pair("RC-2026-03의 ‘정책가치 편향·분산·커버리지 계산’을 그대로 다음 작업으로 채택하고 DGP·시드·관문을 결과 전에 고정했다.", "Adopted RC-2026-03's pending policy-value bias, variance, and coverage calculation directly, freezing DGP, seeds, and gates before results."),
      pair("외생 맥락과 이전 가시 결과에 의존하는 행동정책을 사용해 순차 선택을 만들되, 실제 화학의 후보공간 변화까지 모사한다고 주장하지 않았다.", "Generated sequential selection using exogenous contexts and a behavior policy dependent on the previous visible outcome, without claiming to model real chemistry's changing candidate space."),
      pair("한 보조모형 오류, 두 보조모형 오류, 결과의존 검열, 약한 겹침과 0 지지집합을 별도 시나리오로 분리해 실패 원인을 겹치지 않게 했다.", "Separated one- and two-nuisance errors, outcome-dependent censoring, weak overlap, and zero support so failure causes were not conflated."),
      pair("DR 점 편향이 작아도 성향 오류에서 커버리지가 99%였고 약한 겹침에서 ESS가 89였으므로 점 편향만으로 승인하지 않았다.", "Did not approve on point bias alone because DR coverage reached 99% under propensity error and ESS fell to 89 under weak overlap."),
      pair("0 지지집합에서 DM·DR이 우연히 참값에 가까웠지만 식별 근거가 없어 진단 전용으로 남겼다.", "Kept DM and DR diagnostic-only under zero support even though they happened to lie near truth, because identification evidence was absent."),
      pair("ARROWS README와 단일 파일 커밋 이력을 재검토했지만 200행·149 verified/XRD와 논문 188회 사이의 공식 의미 대응은 확인하지 못했다.", "Rechecked the ARROWS README and single-file commit history but found no official semantic reconciliation of 200 rows, 149 verified/XRD rows, and the paper's 188 experiments."),
      pair("CANDOR의 의료 반사실 주석 결과를 UP-430과 연결했지만 환자자료·임상 개입·의료 권고에는 적용하지 않았다.", "Connected CANDOR's healthcare counterfactual-annotation result to UP-430 without applying it to patient data, clinical intervention, or medical advice.")
    ],
    nextCycle: pair("결과 관측확률 q를 알지 못하는 MNAR 두 세계가 같은 관측분포를 만들도록 구성하고, 선택오즈 민감도 Γ별 정책가치 상·하한과 최소최대 값 구간을 구현한다. 0 지지집합에 10회 층화 무작위화를 추가했을 때 구간이 얼마나 줄어드는지도 계산해 다음 실제 실험의 정보가치를 정한다.", "Construct two unknown-q MNAR worlds with identical observed distributions, then implement policy-value upper and lower bounds and minimax intervals across selection-odds sensitivity Γ. Add ten stratified randomized observations in the zero-support region and quantify interval shrinkage to price the information value of the next real experiment."),
    sourceIds: ["pmlr_ope_2016", "pmlr_ope_2017", "pmlr_dr_shrinkage_2020", "neurips_ope_interval_2020", "pmlr_nonstationary_ope_2023", "pmlr_candor_2026", "nature_arrows_2023", "github_arrows"]
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
    factSources: (window.RESEARCH_CYCLE_META?.factSources || 0) + 5
  };
})();
