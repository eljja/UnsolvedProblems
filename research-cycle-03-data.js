/* RC-2026-03: public-field audit and independently implemented policy replay. */
(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    nature_arrows_2023: {
      discipline: "materials",
      title: "Autonomous and dynamic precursor selection for solid-state materials synthesis",
      url: "https://www.nature.com/articles/s41467-023-42329-9",
      evidenceLabel: "동료심사 원 연구·공개 데이터",
      evidenceLabelEn: "Peer-reviewed primary study and public data",
      publishedOn: "2023-10-31",
      resultPeriod: "YBCO 188회와 두 준안정 표적을 포함한 200회 초과 합성 절차 · 실험 달력 날짜는 미기재",
      resultPeriodEn: "More than 200 synthesis procedures including 188 YBCO experiments and two metastable targets; experimental calendar dates not reported",
      reviewedOn: REVIEWED_ON
    },
    pmlr_ope_2016: {
      discipline: "mathematics",
      title: "Doubly Robust Off-policy Value Evaluation for Reinforcement Learning",
      url: "https://proceedings.mlr.press/v48/jiang16.html",
      evidenceLabel: "동료심사 방법·하한 연구",
      evidenceLabelEn: "Peer-reviewed method and lower-bound study",
      publishedOn: "2016-06-11",
      resultPeriod: "순차 오프정책 평가의 추정량·난도 분석 · 개별 실험 기간 없음",
      resultPeriodEn: "Estimator and hardness analysis for sequential off-policy evaluation; no single experimental period",
      reviewedOn: REVIEWED_ON
    }
  });

  const records = {
    "UP-182": {
      role: pair("적응형 재료 탐색을 재실행 가능한 의사결정 문제로 바꾸는 정책 층", "Policy layer turning adaptive materials search into a replayable decision problem"),
      updatedDefinition: pair(
        "효율적인 탐색은 적은 실험으로 표적을 찾았다는 사후 성공률만으로 판정할 수 없다. 각 시점에 선택 가능했던 후보, 그때까지 알려진 중간상, 정책 점수와 선택 규칙을 복원해 대안 정책이 같은 정보에서 무엇을 골랐을지 계산하고, 그 순위를 별도 전향 실험으로 확인해야 한다.",
        "Efficient search cannot be judged from a retrospective success rate alone. The available candidates, intermediate-phase history, policy scores, and selection rule at every decision must be recoverable so alternative policies can be replayed from the same information and their ranking checked in a separate prospective experiment."
      ),
      knownBoundary: pair(
        "ARROWS³ 논문은 YBCO 188회와 두 준안정 표적을 포함한 200회 초과 절차에서 불리한 중간상을 회피하는 선택이 흑상자 최적화보다 적은 반복으로 유효 전구체를 찾았다고 보고했다. 공개 YBCO 예제의 현재 파일은 47개 전구체 집합과 200개 온도 행을 담지만, 행의 시간순서·당시 후보 집합·정책 확률은 없다. 이번 합성 시험에서는 두 독립 구현이 6개 상태×4개 정책의 선택과 순위를 100% 재현했다.",
        "The ARROWS³ paper reports that avoiding detrimental intermediates identified effective precursors in fewer iterations than black-box optimization across more than 200 procedures, including 188 YBCO experiments and two metastable targets. The current public YBCO example contains 47 precursor sets and 200 temperature rows but no row chronology, contemporaneous candidate sets, or policy probabilities. In this cycle's synthetic test, two independent implementations reproduced every selection and ranking across six states and four policies."
      ),
      bottleneck: pair(
        "결과 격자는 무엇이 만들어졌는지는 보존하지만 무엇을 선택할 수 있었고 왜 그 행동을 골랐는지는 보존하지 않는다. 이 둘을 합치면 중간상 회피가 좋은 정책이었는지, 단지 성공하기 쉬운 후보가 먼저 관측됐는지 구분할 수 없다.",
        "An outcome grid preserves what formed but not what could have been selected or why an action was chosen. Without that separation, one cannot distinguish a superior intermediate-avoidance policy from a campaign that happened to observe easier candidates first."
      ),
      minimumAdvance: pair(
        "30회 이상인 한 전향 캠페인에서 후보 집합·점수·정책 버전·선택확률을 빠짐없이 기록하고, 결과를 보지 않는 두 구현이 행동 일치 90%와 Kendall τ 0.8을 넘기면 실제 정책 비교를 시작할 최소 조건을 충족한다.",
        "A prospective campaign of at least 30 attempts that completely logs candidate sets, scores, policy versions, and action probabilities—and is replayed by two outcome-blind implementations with at least 90% action agreement and Kendall tau 0.8—would meet the minimum condition for a real policy comparison."
      ),
      hypotheses: [
        { code: "H1", claim: pair("완전 원장 스키마 0.1은 고정된 네 정책의 행동을 결정론적으로 복원하기에 충분하다.", "Complete-ledger schema 0.1 is sufficient to reconstruct actions from the four frozen policies deterministically."), prediction: pair("서로 다른 정렬 절차를 쓴 두 구현이 수작업 정답과 모든 상태에서 같은 선택·순위를 낸다. 합성 24개 비교에서는 이 예측이 충족됐다.", "Two implementations using different ranking procedures match the manual golden choices and rankings in every state. This prediction held for all 24 synthetic comparisons."), reject: pair("실제 전향 원장을 완전하게 채운 뒤 일치율이나 τ가 기준 아래이면 충분성 주장을 기각하고 누락된 정책 상태를 스키마에 추가한다.", "Reject sufficiency and add the missing policy state to the schema if agreement or tau falls below threshold after a prospective ledger is completely populated.") },
        { code: "H2", claim: pair("관측된 불리한 중간상 이력은 쌍경로 회피 정책의 선택을 바꾸는 필수 상태다.", "Observed detrimental-intermediate history is decision-relevant state for the pairwise-path-avoidance policy."), prediction: pair("그 이력만 가리면 R2의 다음 행동이 사전 지정 상태의 상당수에서 달라진다. 합성 절제에서는 6개 중 3개가 바뀌었다.", "Masking only that history changes R2's next action in a substantial fraction of preregistered states; three of six synthetic states changed."), reject: pair("서로 다른 실제 화학계에서 이력을 제거해도 행동·반복 경로율·성공률이 허용차 안에 머물면 필수 상태라는 주장을 기각한다.", "Reject decision relevance if removing history leaves actions, repeated-path rate, and success within tolerance across distinct real chemical families.") },
        { code: "H3", claim: pair("선택확률이 없어도 정책이 정확히 결정론적으로 재생되면 오프정책 비교의 행동 메커니즘을 복원할 수 있다.", "Missing action probabilities need not block reconstruction when the policy is exactly and deterministically replayable."), prediction: pair("코드·후보 집합·동점 규칙이 고정된 시점에서는 재생 선택이 실제 행동과 일치하고 확률 1을 부여할 수 있다.", "Where code, candidate sets, and tie rules are frozen, replayed choices match logged actions and can be assigned probability one."), reject: pair("숨은 필터·수동 개입·불안정 동점 처리 때문에 행동이 완전 재현되지 않으면 결정론적 복원을 기각하고 인과 비교를 중단한다.", "Reject deterministic reconstruction and stop causal comparison if hidden filters, manual overrides, or unstable ties prevent exact action recovery.") }
      ],
      decisiveTest: pair(
        "한 화학계에서 30회 이상 후보 집합과 네 정책 점수를 전향 저장한다. 재생팀 두 곳은 결과를 가린 채 R0–R3 행동을 복원하고, 별도 화학계에서는 같은 예산으로 정책을 무작위 배정한다. 재생 순위와 전향 순위가 일치할 때만 확인 표적/실험의 정책 차이를 해석한다.",
        "Prospectively store candidate sets and all four policy scores for at least 30 attempts in one chemical family. Two replay teams, blinded to outcomes, reconstruct R0–R3 actions; a separate family randomizes policies under the same budget. Interpret policy differences in confirmed targets per experiment only if retrospective and prospective rankings agree."
      ),
      unresolved: pair("현재 100% 일치는 의도적으로 작은 합성 상태공간의 소프트웨어 검증이다. 실제 화학계의 누락 행동, 수동 개입, 확률적 정책과 분포 이동을 검증하지 않았다.", "The current 100% agreement is a software check on a deliberately small synthetic state space. It does not validate missing actions, manual interventions, stochastic policies, or distribution shift in real chemistry."),
      sourceIds: ["nature_arrows_2023", "github_arrows", "pmlr_ope_2016", "nature_fair_materials_2022"]
    },
    "UP-185": {
      role: pair("실험 결과표와 재생 가능한 사건 원장을 구분하는 데이터 층", "Data layer separating an outcome table from a replayable event ledger"),
      updatedDefinition: pair(
        "재사용 가능한 실패 데이터는 결과가 음성이라는 사실만 담지 않는다. 실행된 시도와 아직 실행되지 않은 후보를 구분하고, 원 신호의 체크섬, 공정 편차, 자동 판정과 독립 판정을 정책 결정과 분리해 저장해야 나중에 결과 정의나 탐색 규칙이 바뀌어도 다시 분석할 수 있다.",
        "Reusable failure data contain more than a negative outcome. Executed attempts must be separated from unexecuted candidates, while raw-signal checksums, process deviations, and automated and independent calls are stored separately from policy decisions so the campaign can be reanalyzed when outcome definitions or search rules change."
      ),
      knownBoundary: pair(
        "감사한 ARROWS YBCO 예제는 47개 전구체 집합의 200개 온도 행을 포함한다. 149개 행은 ‘Experimentally Verified=true’와 XRD x–y 배열을 함께 갖고 51개는 둘 다 없으며, Source 필드는 50개 행에만 있다. 논문이 보고한 YBCO 188회와 파일의 행·플래그 단위가 일치하지 않으므로 의미를 확인하기 전에는 어느 행도 독립 판정된 성공·실패 원장으로 간주할 수 없다.",
        "The audited ARROWS YBCO example contains 200 temperature rows across 47 precursor sets. Exactly 149 rows pair Experimentally Verified=true with XRD x–y arrays, 51 contain neither, and only 50 rows contain Source. Because these row and flag units do not align with the paper's 188 reported YBCO experiments, no row should be treated as an independently adjudicated success or failure ledger before the semantics are reconciled."
      ),
      bottleneck: pair(
        "같은 JSON 안에 실측 행과 채워진 후보 행이 함께 있어도 안정 ID, 시간순서와 판정 출처가 없으면 ‘실험하지 않음’, ‘원자료 없음’, ‘표적 없음’을 분리할 수 없다. 이 모호성은 결측 메커니즘을 결과 자체로 오인하게 만든다.",
        "Even when measured and populated candidate rows share one JSON file, the absence of stable IDs, chronology, and adjudication provenance prevents separation of not attempted, raw data unavailable, and target absent. That ambiguity turns the missingness mechanism into an apparent material outcome."
      ),
      minimumAdvance: pair(
        "실제 장비에서 생성된 연속 30회 원장을 스키마 0.1로 검증하고, XRD 체크섬과 독립 판정 중 하나를 삭제한 음성 대조가 자동으로 거부되며, 다른 기관이 같은 사건 수와 결과 상태를 복원하면 최소한의 상호운용성을 보인다.",
        "Validate 30 consecutive real instrument records against schema 0.1, require negative controls missing either the XRD checksum or independent call to fail automatically, and have another site recover the same event count and outcome states. That would demonstrate minimum interoperability."
      ),
      hypotheses: [
        { code: "H1", claim: pair("정책·공정·관측·판정을 분리한 스키마는 재생 구현에 필요한 최소 사건 구조를 보존한다.", "A schema separating policy, process, observation, and adjudication preserves the minimum event structure needed for replay."), prediction: pair("완전한 합성 기록 6개는 모두 검증되고 두 구현이 같은 행동을 복원한다. 이번 시험은 이 제한된 예측을 충족했다.", "All six complete synthetic records validate and both implementations recover the same actions; this cycle satisfied that limited prediction."), reject: pair("실제 ELN 변환에서 결정에 쓰인 상태가 스키마 밖에 남거나 두 사이트의 사건 수가 달라지면 현재 최소 구조를 기각한다.", "Reject the current minimum structure if decision state remains outside the schema during real ELN conversion or two sites recover different event counts.") },
        { code: "H2", claim: pair("Experimentally Verified 플래그는 실행 여부와 원 XRD 가용성을 나타내지만 독립 판정을 나타내지 않는다.", "The Experimentally Verified flag marks execution/raw-XRD availability rather than independent adjudication."), prediction: pair("플래그가 참인 행과 XRD 존재가 일치해도 별도 맹검 판정자·규칙·불일치 사유 필드는 나타나지 않는다.", "Rows flagged true coincide with XRD availability, while no separate blinded adjudicator, rule, or disagreement-reason field appears."), reject: pair("저자 정의나 추가 원장에서 이 플래그가 독립 판정 절차와 일대일로 연결됨이 확인되면 현재 해석을 기각한다.", "Reject this interpretation if author documentation or an additional ledger links the flag one-to-one to an independent adjudication procedure.") },
        { code: "H3", claim: pair("원 신호 체크섬과 독립 판정은 완전성 장식이 아니라 결과 재판정의 필수 조건이다.", "Raw-signal checksums and independent calls are prerequisites for outcome re-adjudication, not optional completeness metadata."), prediction: pair("두 필드 중 하나를 삭제한 모든 합성 기록이 스키마 검증에서 거부된다. 이번 음성 대조에서는 각각 6개 모두 거부됐다.", "Every synthetic record missing either field fails schema validation; all six records failed under each negative control in this cycle."), reject: pair("체크섬이나 독립 판정 없이도 별도 기관이 원 신호 동일성과 판정 계보를 검증 가능하게 복원하면 필수 필드의 형식을 재설계한다.", "Redesign the required representation if another site can verifiably recover raw-signal identity and adjudication lineage without checksums or independent calls.") }
      ],
      decisiveTest: pair(
        "ELN·로봇·XRD에서 나온 30회 연속 사건을 자동 변환하고 원 파일 수와 원장 사건 수를 대조한다. 두 번째 기관은 정책을 보지 않고 체크섬으로 원 신호를 가져와 성공·실패·불확정을 재판정한다. 누락률 0%, 사건 수 일치와 판정 불일치 10% 이하를 함께 요구한다.",
        "Automatically transform 30 consecutive events from an ELN, robot, and XRD system, then reconcile raw-file and ledger event counts. A second site, blinded to policy, retrieves raw signals by checksum and reassigns success, failure, or inconclusive. Require zero missing events, matching counts, and at most 10% adjudication disagreement."
      ),
      unresolved: pair("ARROWS 저장소의 감사 커밋에는 LICENSE 또는 COPYING 파일이 없어 코드·데이터의 재배포 허용범위를 확인하지 못했다. 이 사이트에는 원자료를 복사하지 않고 집계 필드 감사만 보존했다.", "The audited ARROWS commit contains no LICENSE or COPYING file, so redistribution rights for its code and data were not established. This site preserves aggregate field-audit results without copying the source data."),
      sourceIds: ["nature_arrows_2023", "github_arrows", "nature_fair_materials_2022", "pmlr_ope_2016"]
    },
    "UP-629": {
      role: pair("기록되지 않은 선택이 정책 효과를 식별 가능한지 판정하는 통계 층", "Statistical layer deciding whether unlogged selection leaves policy effects identifiable"),
      updatedDefinition: pair(
        "무작위가 아닌 결측에서는 누락 확률이 보이지 않는 결과와 연결된다. 적응형 실험에서는 이전 결과가 다음 후보와 관측 확률까지 바꾸므로, 후보 지지집합과 행동 확률을 모르면 다른 정책이 냈을 결과를 하나의 값으로 식별할 수 없다. 가능한 결론은 추가 가정에 따른 구간 또는 전향 무작위 시험일 수 있다.",
        "Under missing-not-at-random selection, the chance of absence depends on an unseen outcome. Adaptive experiments add a feedback loop: prior outcomes change both future candidates and their observation probabilities. Without candidate support and action propensities, another policy's counterfactual value is not point identified; the defensible result may be an assumption-indexed bound or a prospective randomized test."
      ),
      knownBoundary: pair(
        "순차 이중강건 오프정책 평가는 행동확률과 결과모형 중 하나의 오차에 버티도록 설계됐고 특정 조건에서 하한에 도달하지만, 일반 오프정책 평가는 본질적으로 어려울 수 있다. 공개 YBCO 예제에는 후보 집합 스냅숏과 선택확률이 없어 이 추정량의 가중치를 계산할 수 없다. 선택확률을 null로 둔 합성 기록은 스키마에는 유효하지만 인과 재생 자격에서는 제외됐다.",
        "Sequential doubly robust off-policy evaluation is designed to tolerate error in either action propensities or an outcome model and can match a lower bound in some settings, yet general off-policy evaluation can be intrinsically hard. The public YBCO example lacks candidate-set snapshots and action probabilities, so its weights cannot be computed. A synthetic record with null selection probability remained schema-valid but was excluded from causal-replay eligibility."
      ),
      bottleneck: pair(
        "관측된 행동만 남으면 선택되지 않은 후보가 존재했는지조차 알 수 없고, 확률 0인 행동에는 양의성이 깨진다. 결과모형이 아무리 좋아도 데이터 지지집합 밖의 정책 가치는 자료만으로 복원되지 않는다.",
        "When only observed actions remain, even the existence of unselected candidates is unknown, and actions assigned zero probability violate positivity. No outcome model can recover a policy value from data alone outside the logged support."
      ),
      minimumAdvance: pair(
        "한 캠페인에서 모든 후보와 성향을 저장해 이중강건 추정치, 직접 결과모형, 역확률 추정치와 전향 무작위 기준선의 차이를 보고하고, 지지집합 밖에서는 점 추정 대신 가정별 상·하한을 제시하면 식별 경계를 실증적으로 좁힌다.",
        "In one campaign, log every candidate and propensity, compare doubly robust, direct-model, inverse-probability, and prospective randomized estimates, and replace point estimates with assumption-indexed upper and lower bounds outside support. This would empirically narrow the identification boundary."
      ),
      hypotheses: [
        { code: "H1", claim: pair("정확한 결정론적 정책 재생은 누락된 선택확률을 확률 0 또는 1로 복원한다.", "Exact deterministic policy replay recovers missing propensities as zero or one."), prediction: pair("동일 후보·코드·상태에서 독립 구현이 실제 행동을 항상 재현하고 숨은 수동 개입이 없다.", "Independent implementations always recover the logged action from identical candidates, code, and state, with no hidden manual intervention."), reject: pair("단 한 시점이라도 완전한 입력에서 실제 행동을 재현하지 못하면 확률 1 가정을 기각하고 그 이후 정책 가치의 점 식별을 중단한다.", "Reject the probability-one assumption and stop point identification of subsequent policy value if any logged action cannot be reproduced from complete inputs.") },
        { code: "H2", claim: pair("지지집합이 겹치는 구간에서는 이중강건 추정이 결과모형 또는 성향모형 하나의 작은 오차에 견딘다.", "Within overlapping support, a doubly robust estimator tolerates modest misspecification of either the outcome or propensity model."), prediction: pair("한 모형만 의도적으로 어긋나게 한 합성·전향 자료에서 정책 가치 오차가 직접법과 단순 역확률법 중 나쁜 쪽보다 작다.", "On synthetic and prospective data with one model deliberately misspecified, policy-value error is lower than the worse of direct modeling and plain inverse weighting."), reject: pair("사전 지정 오차 범위와 유효표본크기에서 이중강건 추정의 편향·분산이 두 기준선보다 모두 나쁘면 적용을 중단한다.", "Stop using the estimator if its bias and variance are both worse than the two baselines within the preregistered misspecification range and effective sample size.") },
        { code: "H3", claim: pair("후보 지지집합이 겹치지 않는 정책 차이는 공개 결과표에서 점 식별할 수 없다.", "Policy differences outside overlapping candidate support are not point identified from a public outcome table."), prediction: pair("서로 다른 선택모형이 같은 관측 분포를 만들면서도 미관측 정책 가치를 다르게 낼 수 있다.", "Distinct selection models can reproduce the same observed distribution while implying different unobserved policy values."), reject: pair("추가 도구변수, 물리 제약 또는 무작위화가 미관측 행동 결과를 유일하게 제한하면 비식별 주장을 해당 범위에서 철회한다.", "Withdraw non-identification in any region where an additional instrument, physical constraint, or randomization uniquely restricts unobserved action outcomes.") }
      ],
      decisiveTest: pair(
        "합성 캠페인에서는 알려진 참 정책 가치로 세 추정량의 편향과 커버리지를 검증하고, 실제 30회 이상 캠페인에서는 각 단계의 전체 후보와 확률을 저장한다. 마지막 10회는 정책을 층화 무작위 배정해 오프정책 순위와 직접 비교하며, 유효표본크기와 지지집합 중첩이 기준 아래면 점 추정을 보고하지 않는다.",
        "Use a synthetic campaign with known policy values to test bias and coverage of three estimators, then log all candidates and probabilities in a real campaign of at least 30 attempts. Stratify-randomize policy during the final ten attempts for direct ranking; report no point estimate when effective sample size or support overlap falls below its frozen gate."
      ),
      unresolved: pair("합성 시험은 기록 구조의 논리를 확인했을 뿐 정책 가치 추정량의 편향·분산이나 신뢰구간 커버리지를 아직 계산하지 않았다. 다음 사이클은 알려진 잠재결과를 가진 시뮬레이터를 고정해야 한다.", "The synthetic replay checked record logic but did not yet calculate estimator bias, variance, or interval coverage for policy values. The next cycle must freeze a simulator with known potential outcomes."),
      sourceIds: ["pmlr_ope_2016", "nature_arrows_2023", "nature_fair_materials_2022", "github_arrows"]
    }
  };

  const causalConnection = connections.find(({ id }) => id === "CONN-MAT-006");
  if (causalConnection) {
    causalConnection.evidence = pair(
      "공개 YBCO 예제의 후보·행동확률 결손과 합성 R2 경로이력 절제가 이 연결의 두 축을 확인했다. 실제 정책 효과는 아직 판정하지 않았다.",
      "The public YBCO example's missing candidates and propensities, plus the synthetic R2 path-history ablation, verify both structural axes of this connection. Real policy effects remain unadjudicated."
    );
    causalConnection.transferableMethod = pair(
      "순차 오프정책 평가의 지지집합·성향·이중강건 판정을 자율 합성 후보 집합·선택확률·상 판정에 이전한다.",
      "Transfer support, propensity, and doubly robust diagnostics from sequential off-policy evaluation to autonomous-synthesis candidate sets, action probabilities, and phase outcomes."
    );
    causalConnection.validationStatus = pair("구조·소프트웨어 부분 검증 · 실제 캠페인 대기", "Structural and software checks passed; real campaign pending");
    causalConnection.sourceIds = [...new Set([...causalConnection.sourceIds, "nature_arrows_2023", "pmlr_ope_2016"])];
  }

  const cycle = {
    id: "RC-2026-03",
    title: "결과표에서 재생 가능한 정책 원장으로",
    titleEn: "From outcome table to replayable policy ledger",
    status: "active",
    startedOn: REVIEWED_ON,
    reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records),
    connectionIds: ["CONN-MAT-002", "CONN-MAT-004", "CONN-MAT-006"],
    selectionReason: "RC-2026-02가 남긴 정확한 다음 단계는 공개 ARROWS 예제의 필드 의미를 감사하고 완전 원장 스키마를 실제 코드로 재생하는 일이었다. 이 시험은 탐색 정책, 실패 기록과 무작위가 아닌 선택의 식별 조건을 한 번에 가르며, 실제 캠페인 전에 누락 상태와 잘못된 인과 주장을 값싸게 발견한다.",
    selectionReasonEn: "RC-2026-02 left a precise next step: audit field semantics in the public ARROWS example and replay the complete-ledger schema in executable code. This test jointly probes search policy, failure logging, and identification under non-random selection, exposing missing state and invalid causal claims cheaply before a real campaign.",
    verifiedFindings: [
      { text: "ARROWS³ 원 논문은 YBCO 47개 전구체 조합에서 188회 실험을 수행했고 순수 YBCO 10회와 부분 수율 83회를 보고한다. 공개 예제 파일의 200개 온도 행은 이 논문 분모와 같은 사건 단위가 아니다.", textEn: "The ARROWS³ primary study reports 188 YBCO experiments across 47 precursor combinations, with ten pure-YBCO and 83 partial-yield outcomes. The public example's 200 temperature rows are not the same event denominator.", sourceIds: ["nature_arrows_2023"] },
      { text: "감사 커밋의 YBCO 예제에는 47개 전구체 집합과 200개 온도 행이 있다. 149개만 Experimentally Verified=true와 원 XRD를 함께 가지며, 후보 집합 스냅숏·시간순서·선택확률·독립 판정은 없다.", textEn: "At the audited commit, the YBCO example contains 47 precursor sets and 200 temperature rows. Only 149 pair Experimentally Verified=true with raw XRD; candidate-set snapshots, chronology, action probabilities, and independent adjudication are absent.", sourceIds: ["github_arrows", "nature_arrows_2023"] },
      { text: "원본 합성 상태 6개와 고정 정책 4개에서 선언형 정렬과 삽입 정렬로 별도 작성한 두 재생 구현은 24개 선택, 전체 순위와 수작업 정답에 모두 일치했다.", textEn: "Across six original synthetic states and four frozen policies, independently written declarative-sort and insertion-rank implementations agreed on all 24 selections, complete rankings, and manual golden answers.", sourceIds: ["nature_arrows_2023", "pmlr_ope_2016"] },
      { text: "R2에서 관측된 불리한 경로만 제거한 절제는 6개 중 S2·S4·S5의 선택을 바꿨다. 반면 XRD 체크섬 또는 독립 판정을 삭제한 기록은 각각 6개 모두 스키마에서 거부됐다.", textEn: "Masking only observed detrimental paths changed R2 choices in S2, S4, and S5. Removing the XRD checksum or independent call caused all six records in each negative control to fail schema validation.", sourceIds: ["nature_arrows_2023", "nature_fair_materials_2022"] },
      { text: "선택확률 null은 스키마상 허용되지만, 정확한 결정론적 재생도 없으면 오프정책 인과평가 자격을 충족하지 않는다. 이는 데이터 완전성과 식별 가능성이 다른 판정임을 보여준다.", textEn: "A null selection probability is schema-valid but fails causal off-policy eligibility without exact deterministic replay. Data completeness and identifiability are therefore separate judgments.", sourceIds: ["pmlr_ope_2016"] }
    ],
    sharedProgram: {
      name: pair("전향 정책 원장과 오프정책 판정", "Prospective policy ledger and off-policy adjudication"),
      thesis: pair("정책 비교는 결과표가 아니라 당시 가능한 행동, 선택 메커니즘과 독립 결과 판정이 연결된 사건 원장에서 시작해야 한다.", "Policy comparison must begin from an event ledger linking available actions, the selection mechanism, and independent outcome adjudication—not from an outcome table."),
      design: pair("공개 예제 필드 감사를 고정하고, 두 독립 구현과 수작업 정답으로 합성 재생을 검증했다. 다음에는 알려진 잠재결과를 가진 시뮬레이터에서 정책 가치 추정량을 검정한 뒤 30회 이상 실제 전향 원장으로 이동한다.", "The public-example field audit is frozen, and synthetic replay is checked against two independent implementations and manual answers. Next, test policy-value estimators in a simulator with known potential outcomes before moving to a prospective real ledger of at least 30 attempts."),
      adjudication: pair("재생팀은 결과를 보지 않고 행동을 복원하고, 통계팀은 구현을 보지 않고 정답 순위·편향·커버리지를 판정한다. 실제 계측 판정자는 정책과 자동 호출을 보지 않는다.", "Replay teams reconstruct actions while blinded to outcomes; a statistical team blinded to implementation adjudicates golden rankings, bias, and coverage. Real measurement adjudicators see neither policy nor automated calls."),
      primaryMetrics: pair("선택 일치율, 전체 순위 Kendall τ, 완전 기록 검증률, 절제 선택변화율, 유효표본크기, 정책 가치 편향과 95% 구간 커버리지", "Selected-action agreement, full-ranking Kendall tau, complete-record validation, ablation choice-change rate, effective sample size, policy-value bias, and 95% interval coverage"),
      successRule: pair("실제 원장에서 두 재생 구현이 행동 일치 90%와 τ 0.8을 넘고, 알려진 참값 시뮬레이션에서 선택한 정책 가치 추정량의 95% 구간이 명목 커버리지를 유지한 뒤에만 전향 정책 비교로 진행한다.", "Proceed to prospective policy comparison only after two replay implementations exceed 90% action agreement and tau 0.8 on a real ledger, and the chosen policy-value estimator retains nominal 95% coverage in a simulator with known truth."),
      stopRule: pair("후보 지지집합, 선택확률 또는 정확한 결정론적 복원 중 어느 것도 없으면 인과 정책 비교를 중단한다. 합성 일치만으로 실제 정책 우위를 주장하지 않으며, 라이선스가 불명확한 원자료는 재배포하지 않는다.", "Stop causal policy comparison when neither candidate support, action propensities, nor exact deterministic reconstruction is available. Do not infer real policy superiority from synthetic agreement, and do not redistribute source data with unclear licensing."),
      status: pair("공개 필드 감사·합성 재생·음성 대조 완료 · 정책 가치와 실제 원장 시험 대기", "Public field audit, synthetic replay, and negative controls complete; policy-value and real-ledger tests pending")
    },
    artifacts: [
      { title: pair("ARROWS YBCO 필드 감사", "ARROWS YBCO field audit"), description: pair("감사 커밋·파일 해시, 200개 행의 필드 커버리지와 정책 재생에 필요한 결손을 기록한 집계 감사표", "Aggregate audit recording source commit and hash, coverage across 200 rows, and fields missing for policy replay"), url: "research/replay/arrows-ybco-field-audit.json", kind: "JSON" },
      { title: pair("합성 정책 재생 고정물", "Synthetic policy-replay fixture"), description: pair("여섯 상태, 네 고정 정책, 수작업 정답 순위와 경로이력 절제를 포함한 Apache-2.0 시험 자료", "Apache-2.0 test data with six states, four frozen policies, manual golden rankings, and path-history ablation"), url: "research/replay/synthetic-replay-fixture.json", kind: "JSON" },
      { title: pair("독립 재생 검증 결과", "Independent replay verification result"), description: pair("24개 선택·순위 일치, 스키마 음성 대조와 R2 절제 결과를 기계 판독 형태로 고정한 검증 기록", "Machine-readable record of 24 selection/ranking agreements, schema negative controls, and the R2 ablation"), url: "research/replay/verification-result.json", kind: "JSON" }
    ],
    log: [
      pair("ARROWS 저장소의 전체 LFS 원자료를 복제하지 않고 YBCO 예제 한 파일만 감사했으며, 저장소 라이선스가 확인되지 않아 집계 결과만 보존했다.", "Audited only the YBCO example rather than mirroring the full LFS data, and retained aggregates only because no repository license was located."),
      pair("논문의 188회 실험, 공개 파일의 200개 행과 149개 verified/XRD 행이 서로 다른 단위임을 확인하고 동일 분모로 취급하지 않았다.", "Kept the paper's 188 experiments, the public file's 200 rows, and its 149 verified/XRD rows as distinct units rather than forcing a common denominator."),
      pair("수작업 정답을 먼저 고정하고 정렬 구조가 다른 재생 구현 두 개를 작성해 공통 구현 오류가 일치로 숨는 위험을 줄였다.", "Froze manual golden answers and wrote two replay implementations with different ranking structures to reduce the chance that a shared implementation bug masquerades as agreement."),
      pair("완전 기록 6개, 체크섬 결손 6개, 독립 판정 결손 6개와 선택확률 결손을 각각 검증해 스키마 유효성과 인과평가 자격을 분리했다.", "Tested six complete records, six missing-checksum records, six missing-independent-call records, and a missing-propensity record to separate schema validity from causal eligibility."),
      pair("합성 100% 일치를 실제 ARROWS 정책 성과로 외삽하지 않았고, 다음 판정량을 정책 가치 편향·분산·커버리지로 좁혔다.", "Did not extrapolate 100% synthetic agreement to ARROWS policy performance, and narrowed the next endpoints to policy-value bias, variance, and coverage.")
    ],
    nextCycle: pair("알려진 잠재결과와 결과의존 검열을 가진 순차 합성 시뮬레이터를 고정하고 직접법·역확률법·이중강건법의 편향, 유효표본크기와 95% 커버리지를 비교한다. 동시에 ARROWS 200행과 논문 188회의 단위 차이에 대한 저자 문서 또는 공식 설명을 찾는다.", "Freeze a sequential synthetic simulator with known potential outcomes and outcome-dependent censoring, then compare bias, effective sample size, and 95% coverage for direct, inverse-probability, and doubly robust estimators. In parallel, seek author documentation or an official explanation reconciling the ARROWS file's 200 rows with the paper's 188 experiments."),
    sourceIds: ["nature_arrows_2023", "github_arrows", "pmlr_ope_2016", "nature_fair_materials_2022"]
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
    factSources: (window.RESEARCH_CYCLE_META?.factSources || 0) + 2
  };
})();
