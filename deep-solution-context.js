/*
 * Deeper problem-specific research programs.
 *
 * This layer turns each open question into a competition among explicit
 * hypotheses, a bottleneck chain, auditable work packages, and decision rules.
 * It proposes research directions; it does not claim a solution or literature
 * priority.
 */
(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });
  const stem = value => String(value || "").replace(/[?？]\s*$/, "");
  const topic = (problem, index, language) => {
    const item = problem.technicalTopics?.[index] || problem.technicalTopics?.[0] || {};
    const value = language === "en" ? (item.textEn || item.text || "") : (item.text || "");
    return value.replace(/^[^:：]{1,80}[:：]\s*/, "");
  };
  const attempt = (problem, index, language) => {
    const items = [...(problem.importantAttempts || []), ...(problem.recentAttempts || [])];
    const item = items[index % Math.max(items.length, 1)] || {};
    return language === "en" ? (item.titleEn || item.title || "reviewed work") : (item.title || "검토된 연구");
  };

  const lastHangul = value => [...String(value || "")].reverse().find(char => /[가-힣]/.test(char));
  const hasBatchim = value => {
    const char = lastHangul(value);
    return char ? (char.charCodeAt(0) - 0xac00) % 28 !== 0 : false;
  };
  function polishKorean(text, problem) {
    if (!text) return text;
    const phrases = [
      ...(problem.technicalTopics || []).map(item => String(item.text || "").replace(/^[^:：]{1,80}[:：]\s*/, "")),
      ...(problem.importantAttempts || []).map(item => item.title),
      ...(problem.recentAttempts || []).map(item => item.title),
      transferLens[problem.discipline]?.text
    ].filter(Boolean).sort((a, b) => b.length - a.length);
    const particleSets = [
      { candidates: ["을", "를"], choose: value => hasBatchim(value) ? "을" : "를" },
      { candidates: ["이", "가"], choose: value => hasBatchim(value) ? "이" : "가" },
      { candidates: ["은", "는"], choose: value => hasBatchim(value) ? "은" : "는" },
      { candidates: ["과", "와"], choose: value => hasBatchim(value) ? "과" : "와" },
      { candidates: ["으로", "로"], choose: value => hasBatchim(value) ? "으로" : "로" }
    ];
    let polished = text;
    for (const phrase of phrases) {
      for (const { candidates, choose } of particleSets) {
        const correct = choose(phrase);
        for (const wrapper of ["", "”", "」", "』"]) {
          for (const candidate of candidates) {
            polished = polished.replaceAll(`${phrase}${wrapper}${candidate}`, `${phrase}${wrapper}${correct}`);
          }
        }
      }
    }
    return polished;
  }
  function polishDeep(value, problem) {
    if (Array.isArray(value)) {
      value.forEach(item => polishDeep(item, problem));
      return value;
    }
    if (!value || typeof value !== "object") return value;
    if (typeof value.text === "string") value.text = polishKorean(value.text, problem);
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") polishDeep(nested, problem);
    }
    return value;
  }

  const transferLens = {
    physics: pair("계측과 인과추론", "metrology and causal inference"),
    chemistry: pair("제어이론과 반응망 식별", "control theory and reaction-network identification"),
    biology: pair("비평형 물리와 계보 추적", "nonequilibrium physics and lineage tracking"),
    materials: pair("신뢰성 공학과 공정 제어", "reliability engineering and process control"),
    semiconductor: pair("시스템 식별과 수율 공학", "system identification and yield engineering"),
    mathematics: pair("형식 검증과 프로그램 합성", "formal verification and program synthesis"),
    computer: pair("증명복잡도와 적대적 평가", "proof complexity and adversarial evaluation"),
    earth: pair("자료동화와 자연실험", "data assimilation and natural experiments"),
    medicine: pair("표적시험 설계와 인과 이동성", "target-trial design and causal transportability"),
    mechanical: pair("고장허용 시스템과 디지털 쌍둥이", "fault-tolerant systems and digital twins"),
    cognitive: pair("측정불변성과 계산모형 비교", "measurement invariance and computational model comparison"),
    agriculture: pair("도메인 적응과 다환경 시험", "domain adaptation and multi-environment trials"),
    social: pair("인과 식별과 메커니즘 설계", "causal identification and mechanism design")
  };

  const minimumAdvanceByApproach = {
    theory: (qKo, qEn, cKo, cEn) => pair(
      `“${qKo}” 전체를 곧바로 증명하지 못하더라도, ${cKo}에 관해 기존 정리에서 논리적으로 따라오지 않는 새 구조 계열을 엄밀히 처리하거나 최소 반례를 제시하면 의미 있는 전진이다.`,
      `Even without immediately settling “${qEn},” a meaningful advance would rigorously handle a new structural class not implied by existing theorems about ${cEn}, or produce a minimal counterexample.`
    ),
    experiment: (qKo, qEn, cKo, cEn) => pair(
      `“${qKo}”의 최종 답에 이르지 못하더라도, ${cKo}에서 유력 설명 둘의 예측을 독립 계측으로 갈라놓고 한쪽을 사전 기준에 따라 배제하면 의미 있는 전진이다.`,
      `Even without a final answer to “${qEn},” a meaningful advance would use an independent measurement of ${cEn} to separate two leading explanations and exclude one by a preregistered rule.`
    ),
    hybrid: (qKo, qEn, cKo, cEn) => pair(
      `“${qKo}”의 완전한 기전을 확정하지 못하더라도, 한 환경에서 정한 구조와 매개변수로 “${cKo}”에 관한 보지 않은 조건을 사전 예측하고 독립 자료에서 재현하면 의미 있는 전진이다.`,
      `Even without a complete mechanism for “${qEn},” a meaningful advance would use structure and parameters fixed in one environment to predict unseen conditions involving ${cEn}, then reproduce the result independently.`
    ),
    engineering: (qKo, qEn, cKo, cEn) => pair(
      `“${qKo}”의 최종 시스템을 완성하지 못하더라도, “${cKo}”의 성능과 기능을 외부에서 판정할 수 있는 최소 통합체를 반복 제작하고 오류 예산을 닫으면 의미 있는 전진이다.`,
      `Even without completing the final system in “${qEn},” a meaningful advance would repeatedly build a minimum integrated demonstrator whose performance on ${cEn} can be externally adjudicated, then close its error budget.`
    )
  };

  function boundaryMinimumAdvance(qKo, qEn, cKo, cEn) {
    return pair(
      `“${qKo}”의 금지 결론을 반복하는 대신, 금지를 유지하는 최소 가정 집합을 줄이거나 ${cKo}에 대한 구성적 상한과 증명된 하한 사이의 간격을 좁히면 의미 있는 전진이다.`,
      `Rather than restating the prohibition in “${qEn},” a meaningful advance would reduce the minimal assumption set that preserves it or narrow the gap between constructive upper and proved lower bounds for ${cEn}.`
    );
  }

  function logicChain(problem) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const aKo = topic(problem, 0, "ko");
    const aEn = topic(problem, 0, "en");
    const bKo = topic(problem, 1, "ko");
    const bEn = topic(problem, 1, "en");
    const cKo = topic(problem, 2, "ko");
    const cEn = topic(problem, 2, "en");
    return [
      {
        code: "L1",
        title: pair("출발 조건을 고정한다", "Freeze the starting conditions"),
        claim: pair(`“${qKo}”의 입력 범위와 허용 가정을 명시하고, 첫 기술축 “${aKo}”를 공통 좌표계·정의·단위로 고정한다.`, `State the admissible inputs and assumptions for “${qEn},” then freeze the first technical axis—${aEn}—in a common coordinate system, definition, and unit.`),
        failure: pair(`표본·계산모형·운용환경이 접근마다 다르면 이후 결과는 같은 문제에 대한 비교가 아니다.`, `If samples, computational models, or operating environments differ by approach, later results are not comparisons of the same problem.`)
      },
      {
        code: "L2",
        title: pair("병목을 하나의 연결 명제로 바꾼다", "Turn the bottleneck into one bridge claim"),
        claim: pair(`첫 기술축과 둘째 기술축 사이, 즉 “${aKo}”에서 “${bKo}”로 넘어가는 관계를 방향·크기·적용범위가 있는 명제로 쓴다.`, `Write the relation from ${aEn} to ${bEn} as a claim with a direction, magnitude, and domain of validity.`),
        failure: pair(`연결 명제가 자유 매개변수로 모든 결과를 설명하면 반증할 수 없으므로 연구 가설이 아니다.`, `If free parameters let the bridge claim explain every outcome, it is unfalsifiable and therefore not a research hypothesis.`)
      },
      {
        code: "L3",
        title: pair("독립된 판정량으로 번역한다", "Translate the claim into an independent adjudicator"),
        claim: pair(`연결 명제가 맞을 때만 나타나는 결과를 셋째 기술축 “${cKo}”에서 정하고, 개발에 쓰지 않은 자료·사례·기관으로 판정한다.`, `Define an outcome in the third technical axis—${cEn}—that appears only if the bridge claim is correct, and adjudicate it using data, cases, or sites not used in development.`),
        failure: pair(`판정량이 보정에 사용된 자료나 같은 오차 원리에 의존하면 자기검증 순환이 생긴다.`, `If the adjudicator depends on calibration data or the same error principle, the design becomes circular self-validation.`)
      },
      {
        code: "L4",
        title: pair("해결 기준과 직접 연결한다", "Connect directly to the resolution criterion"),
        claim: pair(`${problem.resolutionCriterion} 중간 결과는 이 기준의 어떤 문장을 얼마나 좁혔는지 명시해야 한다.`, `${problem.resolutionCriterionEn} Every intermediate result must state which clause of this criterion it narrows and by how much.`),
        failure: pair(`셋째 기술축의 기록이 좋아져도 원래 질문 “${qKo}”의 판정 범위를 넓히지 못하면 최적화 성과일 뿐 해결 진전은 아니다.`, `Even a record on the third axis is optimization rather than progress on “${qEn}” if it does not expand the adjudicated scope of the original question.`)
      }
    ];
  }

  function hypotheses(problem) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const aKo = topic(problem, 0, "ko");
    const aEn = topic(problem, 0, "en");
    const bKo = topic(problem, 1, "ko");
    const bEn = topic(problem, 1, "en");
    const cKo = topic(problem, 2, "ko");
    const cEn = topic(problem, 2, "en");

    const sets = {
      theory: [
        {
          code: "H1",
          title: pair("숨은 불변량이 존재한다", "A hidden invariant exists"),
          claim: pair(`“${qKo}”의 대상에는 “${aKo}”와 “${bKo}”를 함께 제약하는 단조량 또는 보존량이 있다.`, `The objects in “${qEn}” contain a monotone quantity or invariant jointly constraining ${aEn} and ${bEn}.`),
          prediction: pair(`제한된 비자명 계열에서 그 양이 합성·환원·극한 아래 유지되며 “${cKo}”에 기존보다 강한 경계를 준다.`, `On a restricted nontrivial class, the quantity survives composition, reduction, and limits while giving a stronger bound on ${cEn}.`),
          test: pair(`알려진 참 사례와 거짓 유사사례를 섞은 기준집합에서 후보 불변량의 분리력을 형식 검증한다.`, `Formally test the candidate invariant on a benchmark mixing known true cases with false analogues.`),
          reject: pair(`거짓 유사사례에서도 같은 값을 갖거나 정방향 번역에서 정보가 소실되면 H1을 기각한다.`, `Reject H1 if false analogues share the same value or the forward translation loses the decisive information.`)
        },
        {
          code: "H2",
          title: pair("특정 반례 계열이 모든 기존 접근을 막는다", "One counterfamily blocks the known approaches"),
          claim: pair(`“${bKo}”에 숨어 있는 극단 구조가 ${attempt(problem, 0, "ko")}와 ${attempt(problem, 4, "ko")}의 공통 실패 원인이다.`, `An extremal structure hidden in ${bEn} is the common failure mode of ${attempt(problem, 0, "en")} and ${attempt(problem, 4, "en")}.`),
          prediction: pair(`작은 사례에서 반례를 최소화하면 서로 다른 증명 시도가 같은 국소 패턴에서 멈춘다.`, `Minimizing counterexamples on small instances makes distinct proof attempts stop on the same local pattern.`),
          test: pair(`후보 반례 문법을 완전 탐색하고 실패한 보조정리의 전제와 최소 반례의 특징을 대조한다.`, `Exhaustively search a candidate-counterexample grammar and compare minimized features with the premises of failed lemmas.`),
          reject: pair(`접근마다 최소 반례가 구조적으로 다르거나 공통 패턴을 제거해도 장벽이 남으면 H2를 기각한다.`, `Reject H2 if minimized counterexamples differ structurally by approach or the barrier remains after removing the common pattern.`)
        },
        {
          code: "H3",
          title: pair("현재 정의 또는 가정이 너무 강하다", "The current definition or assumptions are too strong"),
          claim: pair(`“${cKo}”를 요구하는 현재 형식화는 “${qKo}”의 본질보다 강한 보조 가정을 함께 요구한다.`, `The current formalization demanding ${cEn} also imposes an auxiliary assumption stronger than the essence of “${qEn}."`),
          prediction: pair(`가정 하나를 완화한 인접 문제에서는 H1의 불변량 또는 H2의 반례 구조가 명시적으로 계산된다.`, `On a neighboring problem with one assumption relaxed, the invariant from H1 or counterstructure from H2 becomes explicitly computable.`),
          test: pair(`가정 격자를 만들고 한 번에 하나만 토글한 유한 모형에서 정리의 결론이 바뀌는 최소 지점을 찾는다.`, `Build an assumption lattice and toggle one assumption at a time in finite models to find the minimal point where the theorem changes.`),
          reject: pair(`모든 단일 완화가 원래 명제와 동치이거나 문제의 의미를 제거하면 H3을 기각한다.`, `Reject H3 if every single relaxation is equivalent to the original statement or removes the meaning of the problem.`)
        }
      ],
      experiment: [
        {
          code: "H1",
          title: pair("신호는 실재하며 예측된 조건을 따른다", "The signal is real and follows the predicted condition"),
          claim: pair(`“${qKo}”의 신호는 “${aKo}”에서 발생하며 “${bKo}”가 정한 조건에 따라 크기 또는 빈도가 체계적으로 변한다.`, `The signal in “${qEn}” originates in ${aEn}, with magnitude or frequency changing systematically under the conditions defined by ${bEn}.`),
          prediction: pair(`분석 전에 고정한 조건 변화가 “${cKo}”에서 방향과 크기가 있는 반응을 만든다.`, `A condition change fixed before analysis produces a directional, quantitative response in ${cEn}.`),
          test: pair(`가설 간 예상 정보이득이 가장 큰 조건에서 맹검 파일럿을 수행하고 독립 감지 원리로 같은 잠재량을 측정한다.`, `Run a blinded pilot where expected information gain among hypotheses is greatest, measuring the same latent quantity with an independent sensing principle.`),
          reject: pair(`독립 계측에서 방향이 일치하지 않거나 효과가 사전 최소치보다 작으면 H1을 기각한다.`, `Reject H1 if the independent measurement disagrees in direction or the effect falls below the preregistered minimum.`)
        },
        {
          code: "H2",
          title: pair("관측은 공유 계통오차 또는 선택 편향이다", "The observation is a shared systematic or selection effect"),
          claim: pair(`“${bKo}”의 보정·표본 선택·배경 모형 가운데 하나가 “${aKo}”처럼 보이는 신호를 만든다.`, `A calibration, sample-selection, or background-model choice in ${bEn} creates a signal resembling ${aEn}.`),
          prediction: pair(`장비·분석·표본 경로를 바꾸면 “${cKo}”의 효과가 사라지거나 보정 변수와 함께 이동한다.`, `Changing instrument, analysis, or sample path makes the effect in ${cEn} disappear or move with a calibration variable.`),
          test: pair(`숨겨진 음성 대조와 신호 주입을 포함해 두 계측법의 잔차 공분산을 측정한다.`, `Measure residual covariance between two measurement methods using hidden negative controls and signal injections.`),
          reject: pair(`오차 상관이 낮은 독립 방법에서도 같은 효과가 유지되고 보정 변수와 분리되면 H2를 기각한다.`, `Reject H2 if the effect survives an independent low-error-correlation method and separates from calibration variables.`)
        },
        {
          code: "H3",
          title: pair("효과는 실재하지만 특정 영역에만 존재한다", "The effect is real but regime-specific"),
          claim: pair(`“${qKo}”에 대한 서로 다른 결과는 모순이 아니라 “${bKo}”의 숨은 영역 전환을 섞어 분석한 결과다.`, `Conflicting results on “${qEn}” arise not from contradiction but from mixing hidden regime transitions in ${bEn}.`),
          prediction: pair(`환경·표본·시간척도를 층화하면 “${cKo}”의 효과가 특정 경계의 양쪽에서 일관되게 달라진다.`, `Stratifying environment, sample, or timescale makes the effect in ${cEn} differ consistently across a specific boundary.`),
          test: pair(`대조적인 두 기관에서 같은 핵심 프로토콜을 쓰되 영역 변수는 의도적으로 다르게 배치한다.`, `Use the same core protocol at two contrasting sites while deliberately varying the candidate regime variable.`),
          reject: pair(`영역을 분리해도 효과 방향이 불안정하거나 경계가 자료마다 이동하면 H3을 기각한다.`, `Reject H3 if effect direction remains unstable after stratification or the boundary moves from dataset to dataset.`)
        }
      ],
      hybrid: [
        {
          code: "H1",
          title: pair("환경을 넘어 유지되는 하나의 기전이 있다", "One mechanism is invariant across environments"),
          claim: pair(`“${aKo}”와 “${bKo}”를 연결하는 동일한 기전이 환경이 바뀌어도 “${cKo}”를 예측한다.`, `The same mechanism connecting ${aEn} and ${bEn} predicts ${cEn} across changing environments.`),
          prediction: pair(`한 환경에서 고정한 구조와 매개변수가 보지 않은 환경의 결과를 보정 범위 안에서 맞힌다.`, `Structure and parameters frozen in one environment predict an unseen environment within calibration bounds.`),
          test: pair(`경쟁 모형의 사전 예측을 저장한 뒤 정보이득이 가장 큰 새 환경 또는 안전한 개입에서 판정한다.`, `Register prospective predictions from competing models, then adjudicate them in the new environment or safe intervention with highest information gain.`),
          reject: pair(`환경마다 별도 자유 매개변수가 필요하거나 핵심 효과의 부호가 바뀌면 H1을 기각한다.`, `Reject H1 if each environment needs separate free parameters or the principal effect changes sign.`)
        },
        {
          code: "H2",
          title: pair("기전처럼 보이는 관계는 대리변수 누출이다", "The apparent mechanism is proxy leakage"),
          claim: pair(`“${bKo}”의 관측 변수는 원인 자체가 아니라 “${aKo}”와 함께 움직이는 대리변수다.`, `The observed variable in ${bEn} is not causal; it is a proxy that co-moves with ${aEn}.`),
          prediction: pair(`대리변수와 원인을 분리하는 자연실험·개입에서는 기존 모형의 “${cKo}” 예측이 무너진다.`, `In a natural experiment or intervention separating proxy from cause, the existing prediction for ${cEn} fails.`),
          test: pair(`인과 그래프에서 대리경로를 차단하는 환경을 선택하고 모형 재학습 없이 결과를 예측한다.`, `Choose an environment that blocks the proxy path in a causal graph and predict the result without retraining.`),
          reject: pair(`대리경로를 차단해도 같은 매개효과와 시간 순서가 유지되면 H2를 기각한다.`, `Reject H2 if the same mediated effect and temporal ordering persist after blocking the proxy path.`)
        },
        {
          code: "H3",
          title: pair("하나가 아니라 전환되는 두 기전이 있다", "Two mechanisms switch rather than one mechanism persists"),
          claim: pair(`“${qKo}”는 단일 기전이 아니라 “${bKo}”의 임계 조건에서 지배권이 바뀌는 두 과정의 합이다.`, `“${qEn}” is not governed by one mechanism but by two processes that exchange dominance at a threshold in ${bEn}.`),
          prediction: pair(`임계점 주변에서 “${cKo}”의 평균뿐 아니라 분산·지연·경로의 형태가 함께 바뀐다.`, `Near the threshold, not only the mean but also variance, delay, and trajectory shape in ${cEn} change together.`),
          test: pair(`임계 후보를 가로지르는 조밀한 조건에서 두 기전 모형과 단일 연속 모형을 숨겨진 자료로 비교한다.`, `Across dense conditions spanning the candidate threshold, compare a two-mechanism model with a single continuous model on hidden data.`),
          reject: pair(`단일 모형이 복잡도 벌점을 포함해 같은 외삽력을 보이면 H3을 기각한다.`, `Reject H3 if one model has equal extrapolative power after accounting for complexity.`)
        }
      ],
      engineering: [
        {
          code: "H1",
          title: pair("하나의 연결부가 종단 성능을 지배한다", "One interface dominates end-to-end performance"),
          claim: pair(`“${aKo}”와 “${bKo}” 사이의 연결부 하나가 “${qKo}”의 성공 확률 대부분을 결정한다.`, `One interface between ${aEn} and ${bEn} determines most of the success probability in “${qEn}."`),
          prediction: pair(`다른 구성요소를 동결하고 이 연결부만 바꾸면 “${cKo}”의 분산과 실패율이 함께 크게 줄어든다.`, `Freezing other components and changing only this interface sharply reduces both variance and failure rate in ${cEn}.`),
          test: pair(`오류 예산의 민감도 순위 1위 연결부에 두 대안을 적용한 짝지은 통합 시제품을 비교한다.`, `Compare paired integrated prototypes using two alternatives at the top-ranked interface in the error-budget sensitivity analysis.`),
          reject: pair(`개선 후 지배적 오류가 다른 구성요소로 이동해 전체 판정량이 늘지 않으면 H1을 기각한다.`, `Reject H1 if dominant error merely shifts to another component without improving the end-to-end metric.`)
        },
        {
          code: "H2",
          title: pair("실패는 여러 작은 오차의 상관 누적이다", "Failure is correlated accumulation of small errors"),
          claim: pair(`“${bKo}”의 작은 편차들이 독립이 아니어서 함께 누적될 때 “${cKo}”의 실패를 만든다.`, `Small deviations in ${bEn} are correlated and jointly produce failure in ${cEn}.`),
          prediction: pair(`단일 부품 사양은 모두 통과해도 특정 조합과 순서에서 종단 실패가 집중된다.`, `Individual components pass specification, yet end-to-end failures concentrate in particular combinations and sequences.`),
          test: pair(`추적 가능한 반복 제작 자료로 오차 공분산 그래프를 만들고 숨겨진 제작분의 실패 순서를 예측한다.`, `Build an error-covariance graph from traceable repeated builds and predict failure ordering on held-out builds.`),
          reject: pair(`독립 오차모형이 같은 예측력을 보이거나 상관을 제거해도 수율이 오르지 않으면 H2를 기각한다.`, `Reject H2 if an independent-error model predicts equally well or removing correlation does not raise yield.`)
        },
        {
          code: "H3",
          title: pair("규모 전환에서 새로운 고장모드가 출현한다", "A new failure mode emerges at scale transition"),
          claim: pair(`“${qKo}”의 병목은 부품 성능이 아니라 ${attempt(problem, 5, "ko")}에서 드러나는 규모·수명 전환이다.`, `The bottleneck in “${qEn}” is not component performance but a scale or lifetime transition exposed by ${attempt(problem, 5, "en")}.`),
          prediction: pair(`최소 통합체에서는 보이지 않던 열화·제어·제조 변동이 규모 증가와 함께 비선형적으로 커진다.`, `Degradation, control error, or manufacturing variation absent in the minimum demonstrator grows nonlinearly with scale.`),
          test: pair(`인터페이스는 고정한 채 규모를 세 단계로 늘리고 고장모드의 출현 순서와 임계점을 사전 예측한다.`, `Hold interfaces fixed while increasing scale through three stages, prospectively predicting failure order and thresholds.`),
          reject: pair(`동일한 정규화 법칙으로 모든 규모의 오차가 설명되고 새 모드가 없으면 H3을 기각한다.`, `Reject H3 if one normalized scaling law explains all errors and no new failure mode appears.`)
        }
      ]
    };

    if (problem.nature !== "boundary") return sets[problem.approach];
    return [
      {
        code: "H1", title: pair("현재 불가능 경계는 날카롭다", "The current impossibility boundary is tight"),
        claim: pair(`“${qKo}”를 금지하는 알려진 가정들은 모두 필요하며 “${aKo}”에서 더 약한 가정으로 같은 결론을 얻을 수 있다.`, `All known assumptions forbidding “${qEn}” are necessary, and the same conclusion can be obtained from weaker assumptions on ${aEn}.`),
        prediction: pair(`가정을 하나씩 제거한 유한 모형에서도 “${cKo}”의 금지 결론이 대부분 유지된다.`, `Removing assumptions one at a time in finite models usually preserves the prohibition on ${cEn}.`),
        test: pair(`정리 의존성을 형식화하고 최소 가정 부분집합을 모형 탐색기로 계산한다.`, `Formalize theorem dependencies and compute minimal assumption subsets with model finders.`),
        reject: pair(`가정 하나의 제거로 명시적 구성이 나오고 나머지 가정을 보존하면 H1을 기각한다.`, `Reject H1 if removing one assumption yields an explicit construction while preserving the rest.`)
      },
      {
        code: "H2", title: pair("가정 하나를 완화하면 비자명한 탈출구가 생긴다", "One relaxed assumption opens a nontrivial escape"),
        claim: pair(`“${bKo}”에 쓰인 특정 가정 하나가 금지 결론을 실제로 지탱하며, 이를 완화하면 문제의 의미를 유지한 채 “${cKo}”가 가능해진다.`, `One specific assumption used in ${bEn} actually supports the prohibition; relaxing it makes ${cEn} possible without erasing the problem's meaning.`),
        prediction: pair(`가정 완화량과 달성 성능 사이에 연속적이고 구성 가능한 자원–오차 곡선이 나타난다.`, `A continuous, constructive resource-error curve appears between the degree of relaxation and attainable performance.`),
        test: pair(`가정 완화량을 한 축으로 두고 구성적 상한과 정보·복잡도 하한을 독립 유도한다.`, `Use relaxation magnitude as one axis and independently derive constructive upper bounds and information- or complexity-theoretic lower bounds.`),
        reject: pair(`완화가 즉시 사소한 문제로 붕괴하거나 상·하한 간격이 규모와 함께 벌어지면 H2를 기각한다.`, `Reject H2 if relaxation immediately trivializes the problem or the upper-lower gap widens with scale.`)
      },
      {
        code: "H3", title: pair("금지는 맞지만 최적 근사는 알려지지 않았다", "The prohibition is correct but the optimal approximation is unknown"),
        claim: pair(`“${qKo}”의 정확한 목표는 불가능하지만 “${aKo}”의 자원을 유한하게 허용한 최적 근사는 기존보다 훨씬 가깝다.`, `The exact objective in “${qEn}” is impossible, but the optimal approximation with finite resources in ${aEn} is much closer than currently known.`),
        prediction: pair(`작은 사례에서 계산된 최적값이 알려진 구성과 하한 사이의 동일한 구조적 간극을 반복해 보인다.`, `Computed optima on small cases repeatedly expose the same structural gap between known constructions and lower bounds.`),
        test: pair(`작은 사례를 완전 열거해 최적해를 구하고 그 패턴에서 새 구성과 하한 불변량을 동시에 추출한다.`, `Exhaustively solve small cases and extract both a new construction and a lower-bound invariant from the pattern.`),
        reject: pair(`작은 사례의 최적 구조가 크기마다 바뀌어 일반화할 불변량이 없으면 H3을 기각한다.`, `Reject H3 if optimal structures change with every size and reveal no generalizable invariant.`)
      }
    ];
  }

  function workPackages(problem) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const aKo = topic(problem, 0, "ko");
    const aEn = topic(problem, 0, "en");
    const bKo = topic(problem, 1, "ko");
    const bEn = topic(problem, 1, "en");
    const cKo = topic(problem, 2, "ko");
    const cEn = topic(problem, 2, "en");
    const methods = {
      theory: pair(`함의 그래프·가정 격자·최소 반례 생성기를 만들고 “${aKo}”에서 가장 약한 미증명 간선을 고른다.`, `Build an implication graph, assumption lattice, and minimal-counterexample generator, then choose the weakest unproved edge in ${aEn}.`),
      experiment: pair(`“${aKo}”의 신호·배경 모형을 공통 우도로 쓰고 “${bKo}”의 계통오차를 포함해 기대 정보이득을 계산한다.`, `Express signal and background models for ${aEn} in a common likelihood and compute expected information gain including systematics in ${bEn}.`),
      hybrid: pair(`“${aKo}”와 “${bKo}”를 공통 인과·기전 모형으로 번역하고 환경별로 다시 맞추지 않는 이동성 시험을 설계한다.`, `Translate ${aEn} and ${bEn} into a common causal or mechanistic model and design a transport test without refitting by environment.`),
      engineering: pair(`“${aKo}”에서 “${bKo}”로 전파되는 오류를 공분산이 있는 오류 예산과 고장나무로 표현한다.`, `Represent error propagation from ${aEn} to ${bEn} with a covariance-aware error budget and fault tree.`)
    };
    if (problem.nature === "boundary") methods[problem.approach] = pair(`“${aKo}”를 금지하는 가정을 형식화하고 한 번에 하나씩 제거하는 모형 탐색과 상·하한 계산을 병행한다.`, `Formalize assumptions forbidding ${aEn}, remove them one at a time with model search, and compute upper and lower bounds in parallel.`);
    return [
      {
        code: "WP1", title: pair("기준선과 실패 기록을 재구성한다", "Reconstruct the baseline and failure record"),
        objective: pair(`“${qKo}”에 대한 ${attempt(problem, 0, "ko")}, ${attempt(problem, 1, "ko")}, ${attempt(problem, 3, "ko")}의 입력·가정·성공범위·실패범위를 같은 표로 정규화한다.`, `Normalize inputs, assumptions, successful regimes, and failure regimes from ${attempt(problem, 0, "en")}, ${attempt(problem, 1, "en")}, and ${attempt(problem, 3, "en")} for “${qEn}."`),
        method: pair("대표 결과 하나를 독립 재현하고, 재현되지 않는 부분은 데이터·코드·증명 의존성·공정 이력 중 어디에서 갈리는지 추적한다.", "Independently reproduce one representative result and trace any divergence to data, code, proof dependencies, or process history."),
        deliverable: pair("비교 가능한 기준선, 실패 사례 저장소, 가정·데이터 계보와 재현 보고서", "A comparable baseline, failure-case repository, assumption/data lineage, and replication report"),
        gate: pair("서로 다른 접근의 결과를 동일한 판정량으로 다시 계산할 수 있어야 WP2로 간다.", "Advance to WP2 only when results from distinct approaches can be recomputed under one adjudication metric.")
      },
      {
        code: "WP2", title: pair("가설이 갈라지는 지점을 계산한다", "Compute where the hypotheses diverge"),
        objective: pair(`H1–H3가 “${bKo}”에서 측정오차·계산오차·정리의 여유보다 크게 다른 예측을 내는 최소 조건을 찾는다.`, `Find the minimum condition in ${bEn} where H1–H3 differ by more than measurement error, computational error, or theorem slack.`),
        method: methods[problem.approach],
        deliverable: pair("가설별 사전 예측, 핵심 nuisance·가정 목록, 정보이득 또는 증명력 지도", "Prospective predictions by hypothesis, a list of decisive nuisances or assumptions, and an information-gain or proof-power map"),
        gate: pair("적어도 두 가설의 예측 구간이 명확히 갈라지고 음성 결과도 후보를 줄여야 WP3로 간다.", "Advance to WP3 only when at least two hypothesis intervals clearly separate and a null result would still shrink the candidate set.")
      },
      {
        code: "WP3", title: pair("새 결합을 최소 규모로 구현한다", "Implement the new combination at minimum scale"),
        objective: pair(`${attempt(problem, 4, "ko")}의 최신 도구와 ${transferLens[problem.discipline].text}의 검증 논리를 결합해 “${cKo}”를 직접 판정하는 최소 증명·실험·시제품을 만든다.`, `Combine the current tools of ${attempt(problem, 4, "en")} with validation logic from ${transferLens[problem.discipline].textEn} to build the minimum proof, experiment, or prototype directly adjudicating ${cEn}.`),
        method: pair(`개발 자료와 판정 자료를 분리하고, 분석·증명·설계 선택을 잠근 뒤 H1–H3의 기각 규칙을 한 번에 적용한다.`, `Separate development from adjudication data, lock analysis/proof/design choices, and apply the rejection rules for H1–H3 in one pass.`),
        deliverable: pair("재현 가능한 실행물, 원자료·증명 객체·설계 파일, 사전 등록된 판정 결과와 실패 분석", "A reproducible artifact, raw data/proof objects/design files, a preregistered decision result, and failure analysis"),
        gate: pair(`“${cKo}”의 결과가 기준선보다 좋아야 할 뿐 아니라 어떤 가설이 왜 탈락했는지 설명해야 WP4로 간다.`, `Advance to WP4 only if ${cEn} improves on baseline and the result explains which hypothesis failed and why.`)
      },
      {
        code: "WP4", title: pair("개발팀과 분리해 깨뜨려 본다", "Try to break it independently of the development team"),
        objective: pair(`“${qKo}”의 결론을 새로운 사례·환경·기관·척도에서 재현하고, 추천 경로의 중단 조건을 적대적으로 시험한다.`, `Reproduce the conclusion about “${qEn}” on new cases, environments, sites, or scales, and adversarially test the recommended path's stop rule.`),
        method: pair("개발팀이 보지 못한 기준집합, 독립 구현, 실패 사례 공개와 반대 가설 팀의 사전 검토를 사용한다.", "Use a benchmark hidden from developers, an independent implementation, public failure cases, and prereview by teams supporting rival hypotheses."),
        deliverable: pair("독립 재현 보고서, 적용 범위와 실패 경계, 동결된 최종 모형·프로토콜·증명·설계", "An independent replication report, scope and failure boundary, and a frozen final model, protocol, proof, or design"),
        gate: pair(`${problem.resolutionCriterion} 이 기준이 독립 검토에서 충족되지 않으면 ‘해결’로 부르지 않는다.`, `${problem.resolutionCriterionEn} Do not call the problem solved unless independent review confirms this criterion.`)
      }
    ];
  }

  function uncertaintyBudget(problem) {
    const aKo = topic(problem, 0, "ko");
    const aEn = topic(problem, 0, "en");
    const bKo = topic(problem, 1, "ko");
    const bEn = topic(problem, 1, "en");
    const cKo = topic(problem, 2, "ko");
    const cEn = topic(problem, 2, "en");
    return [
      {
        code: "U1", category: pair("정의·모형", "Definition and model"),
        source: pair(`“${aKo}”를 표현하는 정의·계산모형·기전 모형의 선택`, `Choice of definition, computational model, or mechanism representing ${aEn}`),
        control: pair("두 개 이상의 표현에서 결론이 유지되는지 확인하고 가정 의존성을 공개한다.", "Check whether the conclusion survives at least two representations and publish assumption dependence."),
        threshold: pair("표현을 바꾸면 결론의 부호나 참·거짓이 바뀌는 경우 판정을 보류한다.", "Withhold adjudication if changing representation reverses the sign or truth value of the conclusion.")
      },
      {
        code: "U2", category: pair("자료·계측·계산", "Data, measurement, and computation"),
        source: pair(`“${bKo}”에서 발생하는 표본오차·계통오차·수치오차·검색 편향`, `Sampling error, systematic error, numerical error, or search bias arising in ${bEn}`),
        control: pair("오차 항목별 상한과 공분산을 기록하고 독립 원리의 대조·검산을 둔다.", "Record bounds and covariance for each error source and use an independent-principle control or cross-check."),
        threshold: pair("가설 간 차이가 합성 불확실성보다 작으면 규모 확대나 일반화를 중단한다.", "Stop scale-up or generalization if hypothesis separation is smaller than combined uncertainty.")
      },
      {
        code: "U3", category: pair("이동·규모·외삽", "Transport, scale, and extrapolation"),
        source: pair(`“${cKo}”를 새로운 환경·구조 크기·시간척도에 옮길 때 생기는 분포 이동`, `Distribution shift when transporting ${cEn} to a new environment, structural size, or timescale`),
        control: pair("보지 않은 조건을 미리 정하고 같은 구조·매개변수·사양으로 예측한다.", "Predeclare unseen conditions and predict them with the same structure, parameters, and specification."),
        threshold: pair("조건마다 재보정해야만 성능이 유지되면 일반 해답이 아니라 국소 해답으로 분류한다.", "Classify the result as local rather than general if every condition requires recalibration.")
      },
      {
        code: "U4", category: pair("연구자 선택", "Researcher degrees of freedom"),
        source: pair("가설·제외 기준·분석·보조정리·평가지표를 결과를 본 뒤 바꾸는 선택", "Changing hypotheses, exclusions, analyses, lemmas, or metrics after seeing results"),
        control: pair("탐색과 판정 자료를 분리하고 버전별 선택을 기록하며 최종 규칙을 잠근다.", "Separate exploration from adjudication, record choices by version, and lock the final rule."),
        threshold: pair("판정 자료를 본 뒤 핵심 규칙을 바꾸면 새 독립 판정집합을 요구한다.", "Require a new independent adjudication set whenever a central rule changes after inspection.")
      }
    ];
  }

  function decisionTree(problem) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const bKo = topic(problem, 1, "ko");
    const bEn = topic(problem, 1, "en");
    const cKo = topic(problem, 2, "ko");
    const cEn = topic(problem, 2, "en");
    return [
      {
        condition: pair(`H1–H3가 “${bKo}”에서 사전 예측대로 갈라진다.`, `H1–H3 separate prospectively in ${bEn}.`),
        action: pair(`가장 정보이득이 큰 한 시험만 수행하고, 살아남은 가설을 “${cKo}”의 독립 판정으로 보낸다.`, `Run only the single highest-information test and send surviving hypotheses to independent adjudication on ${cEn}.`),
        meaning: pair("자원은 감도 향상보다 가설 제거에 우선 배분한다.", "Allocate resources to hypothesis elimination before sensitivity improvement.")
      },
      {
        condition: pair(`예측 차이가 “${bKo}”의 불확실성 안에 묻힌다.`, `Prediction differences are buried within uncertainty in ${bEn}.`),
        action: pair("장비·계산량·표본을 바로 늘리지 않고 공유 오차를 끊는 표현·계측·대조를 먼저 바꾼다.", "Do not immediately scale instruments, computation, or samples; first change the representation, measurement, or control that breaks shared error."),
        meaning: pair("현재 병목은 자료량이 아니라 판별 가능성이다.", "The current bottleneck is discriminability, not data volume.")
      },
      {
        condition: pair(`새 결과가 H1–H3를 모두 기각하지만 “${cKo}”에서 재현된다.`, `A new result rejects H1–H3 yet reproduces in ${cEn}.`),
        action: pair(`결과를 이상치로 버리지 말고 “${qKo}”의 후보 공간을 넓히는 새 H4를 등록한 뒤 최소 추가 시험을 설계한다.`, `Do not discard it as an outlier; register a new H4 expanding the candidate space for “${qEn}” and design the smallest additional test.`),
        meaning: pair("기존 후보 집합 자체가 불완전하다는 증거다.", "This is evidence that the candidate set itself is incomplete.")
      },
      {
        condition: pair(`추천 경로가 개발 자료에서는 성공하지만 독립 판정에서 실패한다.`, `The recommended path succeeds on development data but fails independent adjudication.`),
        action: pair("성공한 부분만 홍보하지 않고 이동 실패·과적합·숨은 가정 가운데 원인을 분류해 실패 저장소에 남긴다.", "Do not publicize only the successful portion; classify the cause as transport failure, overfitting, or hidden assumption and preserve it in the failure repository."),
        meaning: pair("실패는 경로를 버릴 근거이자 다음 가설의 입력이다.", "Failure is both evidence to abandon the path and input to the next hypothesis.")
      }
    ];
  }

  function synthesis(problem) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const bKo = topic(problem, 1, "ko");
    const bEn = topic(problem, 1, "en");
    const cKo = topic(problem, 2, "ko");
    const cEn = topic(problem, 2, "en");
    const lens = transferLens[problem.discipline];
    return {
      candidate: pair(
        `${attempt(problem, 4, "ko")}의 최신 도구를 ${lens.text}의 반증·검증 구조와 결합한다. 핵심은 “${bKo}”를 사후 설명 변수가 아니라 다음 시험을 선택하는 상태변수로 쓰고, “${cKo}”를 개발과 독립된 최종 판정량으로 고정하는 것이다.`,
        `Combine the current tools of ${attempt(problem, 4, "en")} with the falsification and validation structure of ${lens.textEn}. Use ${bEn} not as a retrospective explanatory variable but as a state variable selecting the next test, while freezing ${cEn} as an adjudicator independent of development.`
      ),
      why: pair(
        `“${qKo}”에 대한 기존 접근은 도구·자료·이론을 각각 개선했지만, 이 결합은 한 회차의 결과가 다음 회차의 가설 공간과 시험 조건을 동시에 줄이도록 만든다. 성공보다 정보이득과 반증력을 최적화한다는 점이 다르다.`,
        `Existing approaches to “${qEn}” improve tools, data, or theory separately. This combination makes each round shrink both the next hypothesis space and next test conditions, optimizing information gain and falsification power rather than success alone.`
      ),
      noveltyCheck: pair(
        `이 결합을 새롭다고 주장하기 전에 “${qKo}”, “${attempt(problem, 4, "ko")}”, “${lens.text}”, “${bKo}”, “${cKo}”의 쌍별·삼중 조합으로 선행연구를 검색하고, 같은 판정 구조가 이미 제안됐는지 분야 전문가가 확인해야 한다.`,
        `Before claiming novelty, search pairwise and triple combinations of “${qEn},” “${attempt(problem, 4, "en")}," “${lens.textEn}," “${bEn}," and “${cEn}," then have domain experts check whether the same adjudication structure already exists.`
      )
    };
  }

  for (const problem of problems) {
    if (!problem.solutionLab) continue;
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const cKo = topic(problem, 2, "ko");
    const cEn = topic(problem, 2, "en");
    const minimum = problem.nature === "boundary"
      ? boundaryMinimumAdvance(qKo, qEn, cKo, cEn)
      : minimumAdvanceByApproach[problem.approach](qKo, qEn, cKo, cEn);
    const deepDive = {
      minimumAdvance: minimum.text,
      minimumAdvanceEn: minimum.textEn,
      logicChain: logicChain(problem),
      hypotheses: hypotheses(problem),
      workPackages: workPackages(problem),
      uncertaintyBudget: uncertaintyBudget(problem),
      decisionTree: decisionTree(problem),
      synthesis: synthesis(problem),
      reviewedOn: REVIEWED_ON
    };
    deepDive.minimumAdvance = polishKorean(deepDive.minimumAdvance, problem);
    problem.solutionLab.deepDive = polishDeep(deepDive, problem);
  }

  window.DEEP_SOLUTION_CONTEXT_META = {
    version: REVIEWED_ON,
    problems: problems.length,
    hypothesisRows: problems.length * 3,
    workPackages: problems.length * 4,
    scope: "Problem-specific minimum advances, bottleneck chains, competing hypotheses, work packages, uncertainty budgets, and decision trees",
    scopeKo: "문제별 최소 진전, 병목 사슬, 경쟁 가설, 작업 패키지, 불확실성 예산과 판정 트리"
  };
})();
