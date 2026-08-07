/*
 * Research-attempt designs for every catalog entry.
 *
 * These plans are testable proposals synthesized from each problem's reviewed
 * research brief. They are not claims that an idea is unprecedented in the
 * literature, nor claims that an open problem has been solved.
 */
(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const meta = window.CATALOG_META || {};
  const REVIEWED_ON = "2026-08-07";

  const pair = (ko, en) => ({ text: ko, textEn: en });
  const stem = value => String(value || "").replace(/[?？]\s*$/, "");
  const hasBatchim = char => {
    const code = char.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 && code % 28 !== 0;
  };
  const batchimIndex = char => {
    const code = char.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? code % 28 : 0;
  };
  function lastHangul(text) {
    return [...String(text || "")].reverse().find(char => /[가-힣]/.test(char)) || "";
  }
  function polishKorean(text, problem) {
    let result = String(text || "");
    const phrases = (problem?.technicalTopics || []).map(item => String(item.text || "").replace(/^[^:：]{1,80}[:：]\s*/, "")).filter(Boolean);
    for (const phrase of phrases) {
      const last = lastHangul(phrase);
      if (!last) continue;
      const object = hasBatchim(last) ? "을" : "를";
      const subject = hasBatchim(last) ? "이" : "가";
      const topic = hasBatchim(last) ? "은" : "는";
      const conjunction = hasBatchim(last) ? "과" : "와";
      const direction = hasBatchim(last) && batchimIndex(last) !== 8 ? "으로" : "로";
      for (const candidate of ["을", "를"]) result = result.replaceAll(`${phrase}${candidate}`, `${phrase}${object}`);
      for (const candidate of ["이", "가"]) result = result.replaceAll(`${phrase}${candidate}`, `${phrase}${subject}`);
      for (const candidate of ["은", "는"]) result = result.replaceAll(`${phrase}${candidate}`, `${phrase}${topic}`);
      for (const candidate of ["과", "와"]) result = result.replaceAll(`${phrase}${candidate}`, `${phrase}${conjunction}`);
      for (const candidate of ["으로", "로"]) result = result.replaceAll(`${phrase}${candidate}`, `${phrase}${direction}`);
    }
    return result;
  }
  const polishPair = (item, problem) => {
    if (item?.text) item.text = polishKorean(item.text, problem);
    return item;
  };
  const topicText = (problem, index, lang) => {
    const item = problem.technicalTopics?.[index] || problem.technicalTopics?.[0] || {};
    const raw = lang === "en" ? (item.textEn || item.text || "") : (item.text || "");
    return raw.replace(/^[^:：]{1,80}[:：]\s*/, "");
  };
  const attemptTitle = (problem, index, lang) => {
    const all = [...(problem.importantAttempts || []), ...(problem.recentAttempts || [])];
    const item = all[index % Math.max(all.length, 1)] || {};
    return lang === "en" ? (item.titleEn || item.title || "existing work") : (item.title || "기존 연구");
  };

  function anchorToQuestion(track, problem) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    if (!track.thesis.text.includes(qKo)) track.thesis.text = `“${qKo}”에 답하는 이 경로는 ${track.thesis.text}`;
    if (!track.thesis.textEn.includes(qEn)) {
      track.thesis.textEn = `For “${qEn},” this path tests the following claim: ${track.thesis.textEn}`;
    }
    return track;
  }

  const safetyByDiscipline = {
    medicine: pair(
      "환자·임상 자료를 다루는 단계는 사전심의, 충분한 설명과 동의, 개인정보 보호, 위해 감시와 독립된 안전성 검토를 전제로 한다. 이 설계는 진료 지침이 아니라 연구 가설이다.",
      "Any stage involving patients or clinical data requires prior review, informed consent, privacy protection, harm monitoring, and independent safety oversight. This design is a research hypothesis, not medical guidance."
    ),
    biology: pair(
      "생물학적 실험은 위험평가, 적절한 봉쇄, 윤리심의와 환경 방출 방지를 먼저 설계해야 한다. 여기서는 검증 논리만 제안하며 병원성·독성·회피 능력을 높이는 절차는 제시하지 않는다.",
      "Biological experiments must begin with risk assessment, appropriate containment, ethics review, and prevention of environmental release. Only validation logic is proposed here; no procedure for increasing pathogenicity, toxicity, or evasion is provided."
    ),
    chemistry: pair(
      "반응·물질 실험은 독성, 반응성, 압력·열 위험과 폐기 경로를 사전에 평가하고 승인된 시설의 표준 안전절차 안에서 수행해야 한다.",
      "Reaction and materials work must assess toxicity, reactivity, pressure and thermal hazards, and disposal routes in advance, and remain within approved facility procedures."
    ),
    agriculture: pair(
      "생물체·유전물질·환경 개입은 생물안전, 동물복지, 생태계 영향과 지역 규제를 검토한 뒤 단계적으로 확대해야 한다.",
      "Interventions involving organisms, genetic material, or environments require biosafety, animal-welfare, ecological-impact, and local-regulatory review before staged scale-up."
    ),
    computer: pair(
      "보안·AI 실험은 허가된 데이터와 격리된 환경에서 방어 목적으로 수행하고, 개인정보 침해나 실제 시스템 악용으로 이어질 수 있는 실행 절차는 공개하지 않는다.",
      "Security and AI experiments should use authorized data and isolated environments for defensive purposes; operational steps that could enable privacy violations or real-system abuse are excluded."
    ),
    social: pair(
      "사람과 사회 자료를 다루는 연구는 동의, 사생활, 차별 위험, 취약집단 보호와 개입의 분배 효과를 연구 설계의 일부로 다뤄야 한다.",
      "Research involving people or social data must treat consent, privacy, discrimination risk, protection of vulnerable groups, and distributional effects as part of the design."
    )
  };

  const defaultSafety = pair(
    "실행 전에는 해당 분야의 안전·윤리·법적 심사를 거치고, 작은 규모의 가역적 시험에서 근거가 쌓일 때만 다음 단계로 확장한다.",
    "Before implementation, obtain the relevant safety, ethics, and legal review, and advance only after evidence accumulates in small, reversible tests."
  );

  function diagnosis(problem) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const aKo = topicText(problem, 0, "ko");
    const aEn = topicText(problem, 0, "en");
    const bKo = topicText(problem, 1, "ko");
    const bEn = topicText(problem, 1, "en");
    const cKo = topicText(problem, 2, "ko");
    const cEn = topicText(problem, 2, "en");

    if (problem.nature === "boundary") {
      return {
        gap: pair(
          `“${qKo}”의 목표 자체를 다시 시도하기보다, ${aKo}를 금지하는 가정과 허용하는 가정을 분리해야 한다. 현재 남은 연구 가치는 ${bKo}에서 경계가 얼마나 날카로운지 밝히고, ${cKo}에 해당하는 가장 가까운 달성 가능 문제를 구성하는 데 있다.`,
          `Rather than retrying the forbidden objective in “${qEn},” the assumptions that rule out ${aEn} must be separated from those that permit it. The remaining research value is to sharpen the boundary around ${bEn} and construct the nearest attainable problem corresponding to ${cEn}.`
        ),
        question: pair(
          `${aKo}를 금지하는 최소 가정은 무엇이며, 그중 하나만 완화했을 때 ${cKo}를 어디까지 달성할 수 있는가?`,
          `What is the minimal set of assumptions that forbids ${aEn}, and how far can ${cEn} be achieved when exactly one of them is relaxed?`
        )
      };
    }

    return {
      gap: pair(
        `“${qKo}”에 관한 연구는 ${aKo}와 ${bKo}를 각각 진전시켰지만, 두 축을 같은 조건과 매개변수로 묶어 ${cKo}까지 예측하는 검증 고리가 아직 닫히지 않았다. 다음 진전은 성능 기록 하나가 아니라 경쟁 설명 중 무엇이 틀렸는지를 판정해야 한다.`,
        `Research on “${qEn}” has advanced ${aEn} and ${bEn} separately, but has not yet closed a validation loop that connects them under the same conditions and parameters through ${cEn}. The next advance must decide which competing explanation is wrong, not merely set another performance record.`
      ),
      question: pair(
        `${aKo}에서 갈라지는 경쟁 가설을 ${bKo}로 제한한 뒤, ${cKo}에서 한 번에 판별할 수 있는 최소 시험은 무엇인가?`,
        `What is the smallest test that constrains competing hypotheses diverging on ${aEn} through ${bEn}, then discriminates them through ${cEn} in one prospective evaluation?`
      )
    };
  }

  function makeTrack(problem, index) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const aKo = topicText(problem, 0, "ko");
    const aEn = topicText(problem, 0, "en");
    const bKo = topicText(problem, 1, "ko");
    const bEn = topicText(problem, 1, "en");
    const cKo = topicText(problem, 2, "ko");
    const cEn = topicText(problem, 2, "en");
    const priorKo = attemptTitle(problem, index + 3, "ko");
    const priorEn = attemptTitle(problem, index + 3, "en");
    const criterionKo = problem.resolutionCriterion;
    const criterionEn = problem.resolutionCriterionEn;
    const speculative = true;

    if (problem.nature === "boundary") {
      const tracks = [
        {
          title: pair("금지 정리의 가정 지도를 만든다", "Map the assumptions behind the impossibility theorem"),
          thesis: pair(`“${qKo}”를 막는 정리를 결론 하나로 읽지 않고, ${aKo}에 필요한 가정을 독립된 축으로 분해한다.`, `Treat the theorem blocking “${qEn}” not as one conclusion but as an assumption system whose independent axes determine ${aEn}.`),
          departure: pair(`기존 경계를 반복 설명하는 대신 ${priorKo}가 실제로 쓰는 가정과 쓰지 않는 가정을 기계 검증 가능한 의존성 그래프로 만든다.`, `Instead of restating the known boundary, turn the assumptions actually used—and not used—by ${priorEn} into a machine-checkable dependency graph.`),
          design: pair(`${aKo}, ${bKo}, ${cKo}를 각각 명제 노드로 두고, 증명의 모든 보조정리를 형식화한다. 각 가정을 하나씩 제거한 모형을 만들고 결론이 유지되는지 반례 탐색과 증명 보조기로 동시에 검사한다.`, `Represent ${aEn}, ${bEn}, and ${cEn} as proposition nodes and formalize every supporting lemma. Build models that remove one assumption at a time, then test whether the conclusion survives using both countermodel search and proof assistance.`),
          firstTest: pair(`${bKo}에 필요한 가정 하나를 제거해도 기존 금지 결론이 도출되는지, 아니면 유한한 최소 반례가 생기는지 확인한다.`, `Remove one assumption needed for ${bEn} and determine whether the prohibition still follows or a finite minimal counterexample appears.`),
          success: pair(`불가능 결론을 유지하는 최소 가정 집합, 또는 한 가정의 완화로 ${cKo}가 가능해지는 명시적 구성을 얻는다.`, `Obtain either a minimal assumption set that preserves impossibility or an explicit construction making ${cEn} possible after one assumption is relaxed.`),
          stopRule: pair(`모든 단일 가정 완화가 기존 정리와 동치인 조건으로 되돌아가면 이 경로를 중단하고 자원 제한이 다른 근사 문제로 옮긴다.`, `Stop if every single-assumption relaxation reduces to a condition equivalent to the existing theorem, and move to an approximation problem with different resource limits.`),
          dependencies: pair("정리의 형식화, 모형 탐색기, 해당 구조의 전문가 검토", "Formalization of the theorem, model finders, and expert review of the underlying structure"),
          risk: pair("숨은 정의 가정을 빠뜨리면 가짜 반례를 만들 수 있다.", "Omitting a hidden definitional assumption can produce a false counterexample.")
        },
        {
          title: pair("가장 가까운 달성 가능 문제를 구성한다", "Construct the nearest attainable problem"),
          thesis: pair(`${aKo}를 그대로 요구하지 않고, 정보·정확도·시간·에너지 가운데 하나의 자원만 유한하게 허용해 ${cKo}의 최적 근사를 찾는다.`, `Do not demand ${aEn} unchanged; allow a finite budget in exactly one of information, accuracy, time, or energy, and seek the optimal approximation to ${cEn}.`),
          departure: pair(`가능/불가능의 이분법을 넘어서 ${priorKo}의 경계를 연속적인 성능–자원 곡선으로 바꾼다.`, `Move beyond a possible/impossible dichotomy by turning the boundary in ${priorEn} into a continuous performance-resource curve.`),
          design: pair(`${bKo}를 오차 함수로 정의하고, 자원 예산별 구성적 상한과 정보론적·복잡도론적 하한을 독립적으로 유도한다. 두 경계가 만나는 구간을 계산 예제로 검증한다.`, `Define ${bEn} as an error functional, derive constructive upper bounds and information- or complexity-theoretic lower bounds independently for each resource budget, and test the meeting region with computed examples.`),
          firstTest: pair(`가장 작은 비자명한 사례에서 상한 구성과 하한 증명의 간격을 절반 이하로 줄일 수 있는지 본다.`, `In the smallest nontrivial case, test whether the gap between the constructive upper bound and proved lower bound can be cut by at least half.`),
          success: pair(`${cKo}에 대해 자원이 늘수록 최적 오차가 어떻게 감소하는지 증명된 곡선을 제시한다.`, `Produce a proved curve showing how optimal error for ${cEn} decreases as resources increase.`),
          stopRule: pair(`상·하한 간격이 사례 크기와 함께 벌어지고 새 불변량도 나타나지 않으면 선택한 자원 축을 폐기한다.`, `Abandon the chosen resource axis if upper and lower bounds diverge with instance size and no new invariant appears.`),
          dependencies: pair("근사 정의, 구성 알고리즘, 하한 기법과 소규모 계산", "An approximation definition, constructive algorithms, lower-bound methods, and small-instance computation"),
          risk: pair("근사 정의가 원래 문제의 의미를 제거하면 수학적으로 맞아도 연구 가치가 낮다.", "An approximation may be mathematically sound yet uninformative if its definition removes the meaning of the original problem.")
        },
        {
          title: pair("경계 정리의 강건성을 적대적으로 시험한다", "Stress-test the robustness of the boundary theorem"),
          thesis: pair(`${bKo} 주변에서 정의·오라클·잡음·상호작용 규칙을 체계적으로 변형해 경계가 깨지는 정확한 지점을 찾는다.`, `Systematically perturb definitions, oracles, noise, and interaction rules around ${bEn} to locate the exact point where the boundary breaks.`),
          departure: pair(`${priorKo}의 정방향 논증과 반대로, 결론을 깨뜨릴 가능성이 가장 큰 모델부터 생성하는 적대적 탐색을 사용한다.`, `Reverse the forward argument of ${priorEn} by adversarially generating the models most likely to break its conclusion.`),
          design: pair(`${aKo}의 허용 모델 공간을 문법으로 정의하고 작은 사례를 완전 열거한다. 발견된 반례 후보를 형식 검증하고, 살아남은 패턴에서 더 강한 경계 정리를 추측한다.`, `Define a grammar for the admissible model space of ${aEn} and exhaustively enumerate small cases. Formally verify candidate counterexamples and conjecture a stronger boundary from surviving patterns.`),
          firstTest: pair(`기존 정리의 가장 약한 비자명 사례를 재현한 뒤, 단 하나의 규칙 변경으로 ${cKo}가 달라지는 최소 모델을 찾는다.`, `Reproduce the weakest nontrivial case of the known theorem, then seek the smallest model in which one rule change alters ${cEn}.`),
          success: pair(`새 최소 반례, 또는 더 넓은 모델 계열에도 유지되는 강화된 불가능 정리를 얻는다.`, `Obtain either a new minimal counterexample or a strengthened impossibility theorem that survives a broader model class.`),
          stopRule: pair(`탐색 공간의 증가가 새로운 구조 없이 기존 예제를 복제하기만 하면 자동 탐색 범위를 동결한다.`, `Freeze automated expansion if a larger search space only reproduces known examples without exposing new structure.`),
          dependencies: pair("정확한 모델 문법, 완전 탐색, 형식 검증과 반례 최소화", "A precise model grammar, exhaustive search, formal verification, and counterexample minimization"),
          risk: pair("작은 모델의 패턴을 일반 정리로 성급히 외삽할 수 있다.", "Patterns from small models can be over-extrapolated into an unjustified general theorem.")
        }
      ];
      return anchorToQuestion({ ...tracks[index], speculative }, problem);
    }

    const theory = [
      {
        title: pair("증명 장벽부터 역설계한다", "Reverse-engineer the proof barrier"),
        thesis: pair(`“${qKo}”를 직접 공격하기보다 ${aKo}에서 ${cKo}로 넘어가는 가장 약한 미증명 연결고리 하나를 고립한다.`, `Instead of attacking “${qEn}” directly, isolate the weakest unproved link that transfers ${aEn} into ${cEn}.`),
        departure: pair(`${priorKo}의 도구를 더 크게 적용하는 대신, 알려진 접근들이 공통으로 실패하는 가정·불변량·환원 지점을 먼저 지도화한다.`, `Rather than scaling up the tools of ${priorEn}, first map the assumption, invariant, or reduction point at which known approaches fail in common.`),
        design: pair(`${aKo}, ${bKo}, ${cKo} 사이의 알려진 함의를 방향 그래프로 만들고 각 간선을 문헌 정리·계산 확인·추측으로 구분한다. 가장 약한 간선에 대해 제한된 구조 계열에서 보조정리를 증명한 뒤 범위를 한 축씩 넓힌다.`, `Build a directed implication graph among ${aEn}, ${bEn}, and ${cEn}, classifying every edge as theorem, computation, or conjecture. Prove the weakest edge on a restricted structural class, then widen one axis at a time.`),
        firstTest: pair(`${bKo}의 최소 비자명 계열에서 후보 보조정리가 알려진 예제와 적대적 반례를 모두 통과하는지 형식 검증한다.`, `Formally test whether the candidate lemma survives both known examples and adversarial counterexamples on the smallest nontrivial class of ${bEn}.`),
        success: pair(`새 보조정리가 기존 결과보다 엄밀히 넓은 계열을 포괄하고 ${criterionKo}`, `The new lemma must cover a strictly broader class than previous results and materially advance this criterion: ${criterionEn}`),
        stopRule: pair(`필요한 보조정리가 원래 명제와 동치이거나 이미 알려진 장벽을 그대로 재현하면 이 분해를 중단한다.`, `Stop this decomposition if the required lemma is equivalent to the original statement or merely reproduces a known barrier.`),
        dependencies: pair("정리 의존성 지도, 작은 사례 생성기, 증명 보조기와 분야별 장벽 목록", "A theorem-dependency map, small-instance generator, proof assistant, and field-specific barrier inventory"),
        risk: pair("부분정리의 기술적 진전이 전체 문제로 이어지지 않는 막다른 길일 수 있다.", "A technically stronger partial theorem may still be a dead end for the full problem.")
      },
      {
        title: pair("표현을 바꿔 보존량을 찾는다", "Change representation to expose an invariant"),
        thesis: pair(`${aKo}의 핵심 대상을 대수·기하·확률·연산자 표현 가운데 하나로 옮겨, ${bKo}를 건널 수 있는 단조량이나 보존량을 찾는다.`, `Translate the central objects in ${aEn} into an algebraic, geometric, probabilistic, or operator representation and seek a monotone quantity or invariant capable of bridging ${bEn}.`),
        departure: pair(`${priorKo}와 같은 표현 안에서 보조정리를 쌓는 대신, 정방향·역방향 번역이 모두 가능한 경우만 채택해 비유가 아닌 엄밀한 전달을 요구한다.`, `Instead of adding lemmas inside the representation used by ${priorEn}, accept only translations with rigorous forward and reverse maps, avoiding analogy without transfer.`),
        design: pair(`${aKo}의 핵심 대상을 두 개의 후보 표현으로 변환하고 ${cKo}가 각 표현에서 어떤 제약식이 되는지 유도한다. 작은 사례에서 계산된 불변량이 합성·극한·환원 아래 유지되는지 시험한다.`, `Transform the central objects of ${aEn} into two candidate representations and derive the constraint corresponding to ${cEn} in each. Test on small cases whether the computed invariant survives composition, limits, and reductions.`),
        firstTest: pair(`새 표현이 ${aKo}의 알려진 극단 사례를 하나의 식으로 재현하면서 기존 표현보다 더 강한 부등식이나 제약을 주는지 확인한다.`, `Check whether the new representation recovers known extremal cases of ${aEn} in one expression while yielding a stronger inequality or constraint than the current representation.`),
        success: pair(`번역 정리와 새 불변량이 기존 특수 사례 둘 이상을 통합하고 새로운 비자명한 경우를 증명한다.`, `A translation theorem and new invariant unify at least two known special cases and prove a previously nontrivial case.`),
        stopRule: pair(`역변환에 원래 난제와 동급의 미해결 가정이 필요하면 해당 표현을 폐기한다.`, `Discard the representation if its inverse map requires an unresolved assumption as hard as the original problem.`),
        dependencies: pair("교차 분야 이론가, 기호·수치 실험, 번역 정리의 형식 검증", "Cross-field theorists, symbolic and numerical experiments, and formal verification of the translation theorem"),
        risk: pair("아름다운 대응이 핵심 구조를 보존하지 않는 단순한 재표현일 수 있다.", "An elegant correspondence may be a mere reformulation that fails to preserve the decisive structure.")
      },
      {
        title: pair("반례 생성과 형식 증명을 한 고리로 묶는다", "Close the loop between counterexample search and formal proof"),
        thesis: pair(`“${qKo}”에 대한 성급한 일반 추측을 무너뜨릴 가능성이 큰 구조를 자동 생성하고, 실패 예제를 이용해 추측을 계속 좁히는 적대적 증명 탐색을 수행한다.`, `Automatically generate structures most likely to defeat premature general conjectures about “${qEn},” using every failed case to narrow the claim in an adversarial proof-search loop.`),
        departure: pair(`${priorKo}처럼 계산 확인과 인간 증명을 분리하지 않고, 반례 최소화 결과를 다음 보조정리의 정확한 전제로 되먹임한다.`, `Unlike ${priorEn}, do not separate computational checking from human proof: feed minimized counterexamples directly into the premises of the next lemma.`),
        design: pair(`${aKo}를 생성 문법으로 부호화하고, ${bKo}의 제약을 만족하는 작은 대상을 완전 탐색한다. 살아남은 추측만 증명 보조기에 넘기고, 실패하면 최소 반례에서 빠진 가정을 자동 추출한다.`, `Encode ${aEn} with a generative grammar and exhaustively search small objects satisfying ${bEn}. Pass only surviving conjectures to a proof assistant; on failure, extract the missing assumption from a minimized counterexample.`),
        firstTest: pair(`알려진 거짓 추측과 참인 특수정리를 섞은 기준집합에서 시스템이 반례와 증명을 올바르게 구분하는지 확인한다.`, `On a benchmark mixing known false conjectures and true special-case theorems, verify that the system separates counterexamples from proofs correctly.`),
        success: pair(`사람이 읽을 수 있고 독립 검증 가능한 새 정리, 또는 원래 명제를 무너뜨리는 명시적 반례를 산출한다.`, `Produce either a human-readable, independently checkable theorem or an explicit counterexample defeating the original statement.`),
        stopRule: pair(`탐색 복잡도만 증가하고 반례가 새 가정을 드러내지 않으면 생성 문법을 재설계할 때까지 확장을 멈춘다.`, `Stop scaling if search complexity grows while counterexamples reveal no new assumptions; redesign the generative grammar first.`),
        dependencies: pair("구조 생성기, 반례 최소화, 증명 보조기, 전문가 검토 가능한 증명 객체", "A structure generator, counterexample minimizer, proof assistant, and expert-auditable proof objects"),
        risk: pair("계산 범위에서 살아남은 추측을 일반적으로 참이라고 오인할 수 있다.", "A conjecture surviving the computed range can still be mistaken for a general truth.")
      }
    ];

    const experiment = [
      {
        title: pair("경쟁 가설의 차이가 최대인 실험을 먼저 한다", "Run the experiment where hypotheses disagree most"),
        thesis: pair(`“${qKo}”에 대한 감도를 평균적으로 높이기보다, ${aKo}에 관한 유력 가설들이 가장 다른 예측을 내는 조건을 최적화한다.`, `Instead of raising average sensitivity to “${qEn},” optimize the condition in which leading hypotheses about ${aEn} make maximally different predictions.`),
        departure: pair(`${priorKo}의 성능 확장보다 가설 제거량을 목적함수로 삼고, 음성 결과도 후보 공간을 크게 줄이도록 설계한다.`, `Use hypothesis elimination—not scale-up of ${priorEn}—as the objective, so even a null result sharply reduces the candidate space.`),
        design: pair(`${aKo}의 후보 모형을 공통 매개변수 공간에 놓고 ${bKo}의 계통오차를 포함한 사전 예측 분포를 만든다. 정보이득이 가장 큰 조건 하나를 잠근 뒤 맹검 측정하고 ${cKo}로 독립 확인한다.`, `Place candidate models for ${aEn} in a common parameter space and generate prospective predictive distributions including systematic error in ${bEn}. Lock the one condition with highest expected information gain, measure it blind, and confirm independently through ${cEn}.`),
        firstTest: pair(`소규모 파일럿에서 후보 두 개 이상의 예측 구간이 실제 계측 분해능보다 넓게 갈라지는지 확인한다.`, `In a small pilot, verify that the predicted intervals of at least two candidates separate by more than the achieved measurement resolution.`),
        success: pair(`사전에 고정한 판정 규칙으로 적어도 하나의 주요 가설을 배제하거나 ${criterionKo}`, `Using a preregistered decision rule, exclude at least one major hypothesis or materially satisfy this criterion: ${criterionEn}`),
        stopRule: pair(`현실적인 표본·노출에서 가설 간 차이가 계통오차보다 작으면 장비 규모 확대 전에 조건 선택을 폐기한다.`, `Abandon the chosen condition before scaling hardware if realistic samples or exposure leave hypothesis differences below systematic error.`),
        dependencies: pair("가설별 정량 예측, 최적 실험 설계, 맹검 분석과 독립 계측", "Quantitative predictions by hypothesis, optimal experimental design, blind analysis, and an independent measurement"),
        risk: pair("후보 목록 밖의 설명을 배제했다고 오해하거나 계통오차 모형이 정보이득을 과장할 수 있다.", "The design may overstate information gain through a bad systematic-error model or be mistaken for excluding hypotheses outside its candidate set.")
      },
      {
        title: pair("다른 물리 원리로 같은 신호를 잰다", "Measure the same signal through an orthogonal physical principle"),
        thesis: pair(`${bKo}에서 신호와 배경이 같은 장비 특성에 함께 의존한다면, ${cKo}를 다른 감지 원리와 표본 처리로 재측정한다.`, `If signal and background in ${bEn} depend on the same instrument property, remeasure ${cEn} with a different sensing principle and sample path.`),
        departure: pair(`${priorKo}의 정밀도만 높이지 않고, 오차 상관이 낮은 두 측정이 같은 잠재량을 추정하도록 공동 설계한다.`, `Do not merely improve the precision of ${priorEn}; jointly design two measurements with low error correlation to estimate the same latent quantity.`),
        design: pair(`${aKo}에 대해 기준 표본과 음성 대조를 공유하되 센서·보정·분석팀은 분리한다. 두 측정의 오차 공분산을 사전에 추정하고 결합 결과는 분석 잠금 뒤 공개한다.`, `For ${aEn}, share reference samples and negative controls while separating sensors, calibration, and analysis teams. Estimate error covariance prospectively and release the combined result only after analysis lock.`),
        firstTest: pair(`동일한 기준 표본에서 두 방법의 잔차 상관이 낮고, 알려진 주입 신호를 편향 없이 회수하는지 확인한다.`, `On the same reference samples, confirm low residual correlation between methods and unbiased recovery of known injected signals.`),
        success: pair(`서로 다른 오차 구조를 가진 두 방법이 ${cKo}의 크기와 방향에 합의하고 독립 연구실에서 재현된다.`, `Two methods with distinct error structures agree on the magnitude and direction of ${cEn}, with replication in an independent laboratory.`),
        stopRule: pair(`두 방법이 동일한 보정 표준이나 분석 가정에 지배돼 독립성이 사라지면 교차계측으로 간주하지 않는다.`, `Do not count the test as orthogonal if both methods are dominated by the same calibration standard or analysis assumption.`),
        dependencies: pair("독립 감지 원리, 공통 기준물질, 맹검 시료 배분과 오차 공분산 분석", "Independent sensing principles, common reference materials, blind sample allocation, and error-covariance analysis"),
        risk: pair("겉으로 다른 장비가 실제로는 같은 표본 준비 편향을 공유할 수 있다.", "Nominally different instruments can still share the same sample-preparation bias.")
      },
      {
        title: pair("순차적 다기관 반증 시험을 연다", "Run a sequential multisite falsification test"),
        thesis: pair(`${aKo}의 효과가 특정 장비·표본·분석에 묶이지 않는지 확인하기 위해, 다른 조건의 기관들이 같은 판정 규칙으로 ${cKo}를 시험한다.`, `Test whether the effect in ${aEn} survives beyond a particular instrument, sample, or analysis by having sites with different conditions evaluate ${cEn} under one decision rule.`),
        departure: pair(`${priorKo}의 단일 대규모 연구보다 작고 독립적인 복제들을 순차 결합해 이질성과 실패 조건을 먼저 학습한다.`, `Instead of one large extension of ${priorEn}, sequentially combine smaller independent replications to learn heterogeneity and failure conditions first.`),
        design: pair(`${bKo}의 핵심 교란요인을 기관별로 의도적으로 다르게 배치하고 공통 핵심 프로토콜·분석 코드를 사전 등록한다. 각 단계 후 효과 크기와 이질성 기준으로 계속·수정·중단을 결정한다.`, `Deliberately vary the principal confounders in ${bEn} across sites while preregistering a common core protocol and analysis code. After each stage, continue, revise, or stop based on effect size and heterogeneity.`),
        firstTest: pair(`서로 다른 두 기관이 같은 기준 표본과 숨겨진 대조에서 방향이 일치하는 효과를 회수하는지 본다.`, `Test whether two dissimilar sites recover directionally consistent effects from the same reference samples and hidden controls.`),
        success: pair(`사전 정의한 최소 효과가 기관·조건을 넘어 유지되거나, 효과가 성립하는 경계 조건을 정량적으로 규명한다.`, `Either the preregistered minimum effect survives across sites and conditions, or the boundary conditions under which it holds are quantified.`),
        stopRule: pair(`초기 두 번의 독립 시험에서 방향이 뒤집히고 설명 가능한 교란요인이 없으면 규모 확대를 중단한다.`, `Stop scale-up if the first two independent tests reverse direction without an identifiable confounder.`),
        dependencies: pair("공통 프로토콜, 독립 기관, 사전 등록, 공유 품질관리와 순차 통계", "A common protocol, independent sites, preregistration, shared quality control, and sequential statistics"),
        risk: pair("기관 차이를 제거하려다 실제 외적 타당성 문제를 숨길 수 있다.", "Over-harmonizing sites can hide the external-validity problem the design is meant to expose.")
      }
    ];

    const hybrid = [
      {
        title: pair("예측–시험–갱신의 폐루프 반증을 구축한다", "Build a closed loop of prediction, test, and revision"),
        thesis: pair(`“${qKo}”의 후보 설명들을 ${aKo}에 관한 같은 매개변수 공간에 올리고, 다음 데이터가 들어오기 전에 ${cKo}의 수치 예측을 고정한다.`, `Place competing explanations of “${qEn}” in a shared parameter space for ${aEn}, then freeze quantitative predictions for ${cEn} before new data arrive.`),
        departure: pair(`${priorKo}처럼 자료에 모형을 사후 적합하는 데서 멈추지 않고, 매 회차 가장 많은 후보를 제거할 관측·개입을 모형이 선택하게 한다.`, `Go beyond retrospective fitting in ${priorEn}: at each round, let the models select the observation or intervention expected to eliminate the most candidates.`),
        design: pair(`${aKo}와 ${bKo}를 연결하는 인과·기전 모형들을 공통 관측량으로 번역한다. 보정용 데이터와 판정용 데이터를 분리하고, 예상 정보이득이 가장 큰 시험을 수행한 뒤 실패 모형의 구조만 수정한다.`, `Translate causal or mechanistic models connecting ${aEn} and ${bEn} into common observables. Separate calibration data from adjudication data, perform the highest-information test, and revise only the structures of models that fail.`),
        firstTest: pair(`후보 모형 세 개 이상이 ${cKo}에 대해 측정 오차보다 큰 서로 다른 사전 예측을 내는지 확인한다.`, `Verify that at least three candidate models make distinct prospective predictions for ${cEn} separated by more than measurement error.`),
        success: pair(`반복 회차마다 후보 공간이 실제로 줄고, 살아남은 하나의 모형이 새 조건에서도 ${criterionKo}`, `The candidate space shrinks on each cycle, and one surviving model continues to satisfy this criterion under new conditions: ${criterionEn}`),
        stopRule: pair(`모형들이 자유 매개변수 조정으로 모든 결과를 흡수해 예측이 갈라지지 않으면 폐루프를 중단하고 모형 집합을 재정의한다.`, `Stop the loop and redefine the model set if free-parameter adjustment lets every model absorb every result without predictive separation.`),
        dependencies: pair("공통 매개변수 체계, 사전 예측 저장소, 능동 실험 설계와 독립 판정 데이터", "A shared parameterization, prospective-prediction registry, active experimental design, and independent adjudication data"),
        risk: pair("후보 모형 집합이 편향되면 폐루프가 가장 나은 설명이 아니라 가장 덜 나쁜 후보만 선택한다.", "A biased model set makes the loop select only the least-wrong candidate rather than the best explanation.")
      },
      {
        title: pair("환경이 바뀌어도 남는 기전을 찾는다", "Search for a mechanism invariant across environments"),
        thesis: pair(`환경·척도·집단이 바뀌어도 ${aKo}와 ${bKo}를 같은 방향으로 연결하는 조건부 관계만 후보 기전으로 남긴다.`, `Retain as candidate mechanisms only conditional relations connecting ${aEn} and ${bEn} in the same direction across environments, scales, or populations.`),
        departure: pair(`${priorKo}의 한 데이터셋 적합도를 높이기보다, 의도적으로 다른 환경에서 실패하지 않는 최소 기전 모형을 찾는다.`, `Instead of improving fit on the dataset used by ${priorEn}, seek the smallest mechanistic model that does not fail across deliberately different environments.`),
        design: pair(`${aKo}에 영향을 주는 교란·매개·결과 변수를 인과 그래프로 명시하고 자연실험 또는 안전한 개입을 선택한다. 환경별로 모형을 따로 맞추지 않고 같은 구조와 매개변수의 이동 가능성을 ${cKo}로 평가한다.`, `Specify confounders, mediators, and outcomes for ${aEn} in a causal graph and select natural experiments or safe interventions. Do not refit a separate model per environment; evaluate transport of the same structure and parameters through ${cEn}.`),
        firstTest: pair(`대조적인 두 환경에서 ${aKo}와 ${bKo} 사이의 핵심 조건부 효과가 부호와 크기 범위를 유지하는지 본다.`, `Test whether the principal conditional effect between ${aEn} and ${bEn} retains its sign and magnitude range in two contrasting environments.`),
        success: pair(`동일한 기전 모형이 보지 않은 환경의 결과를 사전에 예측하고 핵심 매개경로에 대한 개입 결과와 일치한다.`, `The same mechanistic model prospectively predicts an unseen environment and agrees with an intervention on its principal mediator.`),
        stopRule: pair(`환경마다 다른 자유 매개변수가 필요하거나 효과 부호가 반복해서 바뀌면 보편 기전 가설을 기각한다.`, `Reject the invariant-mechanism hypothesis if each environment requires distinct free parameters or the effect repeatedly reverses sign.`),
        dependencies: pair("인과 그래프, 이질적인 데이터·환경, 안전한 개입 또는 자연실험과 이동성 검정", "A causal graph, heterogeneous data or environments, safe interventions or natural experiments, and transportability tests"),
        risk: pair("관측되지 않은 환경 차이를 기전 불변성으로 잘못 해석할 수 있다.", "Unmeasured environmental differences can be mistaken for mechanistic invariance.")
      },
      {
        title: pair("모형 녹아웃 토너먼트를 사전 등록한다", "Preregister a model-knockout tournament"),
        thesis: pair(`${aKo}에 대한 주요 이론마다 ‘이 결과가 나오면 포기한다’는 녹아웃 조건을 선언하고 ${bKo}와 ${cKo}를 공동 판정한다.`, `For each major theory of ${aEn}, declare a knockout condition—what result would make proponents abandon it—and jointly adjudicate ${bEn} and ${cEn}.`),
        departure: pair(`${priorKo}처럼 각 접근이 서로 다른 데이터와 지표를 선택하지 못하게 하며, 모든 후보가 같은 숨겨진 시험집합을 통과하게 한다.`, `Prevent each approach from choosing its own data and metric, as in ${priorEn}; require every candidate to face the same hidden test set.`),
        design: pair(`경쟁 팀이 각자 모형·불확실성·실패 기준을 컨테이너화해 제출하고, 독립팀이 ${aKo}·${bKo}·${cKo}를 아우르는 새 자료에 실행한다. 성능뿐 아니라 보정, 강건성, 설명 일관성을 함께 평가한다.`, `Competing teams submit containerized models, uncertainties, and failure criteria; an independent team runs them on new data spanning ${aEn}, ${bEn}, and ${cEn}. Score calibration, robustness, and explanatory consistency alongside performance.`),
        firstTest: pair(`과거 자료를 시간 순서로 숨긴 모의 토너먼트에서 평가 체계가 이미 알려진 실패 모형을 실제로 탈락시키는지 확인한다.`, `Use a temporally hidden historical tournament to verify that the evaluation system actually eliminates models already known to fail.`),
        success: pair(`적어도 하나의 유력 모형이 자기 선언 조건으로 탈락하고, 생존 모형이 새 데이터에서 정량 예측력을 유지한다.`, `At least one leading model is eliminated by its own declared condition, while a survivor retains quantitative predictive skill on new data.`),
        stopRule: pair(`모든 팀이 녹아웃 조건을 회피하거나 평가지표가 과거 순위를 재현하지 못하면 실제 시험 전에 규칙을 재설계한다.`, `Redesign the rules before a live test if teams evade knockout conditions or the metric cannot reproduce historical rankings.`),
        dependencies: pair("경쟁 모형 팀, 독립 평가자, 숨겨진 데이터, 재현 가능한 실행환경과 사전 등록", "Competing modeling teams, independent adjudicators, hidden data, reproducible execution environments, and preregistration"),
        risk: pair("공통 지표가 한 이론 계열에 유리하거나 중요한 정성 예측을 누락할 수 있다.", "A common metric can privilege one theory class or omit an important qualitative prediction.")
      }
    ];

    const engineering = [
      {
        title: pair("가장 약한 연결부부터 역으로 설계한다", "Design backward from the weakest interface"),
        thesis: pair(`“${qKo}”의 최고 성능 부품을 더 개선하기보다, ${aKo}와 ${bKo}가 만나는 곳에서 전체 성공 확률을 가장 크게 낮추는 연결부를 먼저 바꾼다.`, `Instead of improving the best-performing component in “${qEn},” redesign the interface between ${aEn} and ${bEn} that most reduces end-to-end success probability.`),
        departure: pair(`${priorKo}의 구성요소별 기록을 합치는 대신 ${cKo}를 최종 판정량으로 고정하고 모든 하위 사양을 거꾸로 배분한다.`, `Rather than combining component records from ${priorEn}, fix ${cEn} as the end-to-end adjudication metric and allocate every lower-level specification backward from it.`),
        design: pair(`${cKo}의 실패를 기능·제조·제어·열화 원인으로 분해한 오류 예산을 만든다. 민감도 분석으로 지배적 연결부 하나를 고르고, 나머지 구성은 동결한 채 인터페이스 대안 두 개를 같은 통합 시제품에서 비교한다.`, `Decompose failure of ${cEn} into functional, manufacturing, control, and degradation error budgets. Select the dominant interface by sensitivity analysis, freeze other components, and compare two interface alternatives in the same integrated demonstrator.`),
        firstTest: pair(`부품 단독 성능이 아니라 통합 후 ${bKo}의 오류 전파가 기준 설계보다 절반 이하인지 확인한다.`, `Test whether propagation of error in ${bEn} after integration falls below half the baseline, rather than comparing isolated component performance.`),
        success: pair(`연결부 개선이 독립 반복 제작에서도 전체 판정량을 높이고 ${criterionKo}`, `The interface improvement raises the end-to-end metric in independently repeated builds and materially advances this criterion: ${criterionEn}`),
        stopRule: pair(`연결부를 바꿔도 전체 분산의 지배 원인이 다른 구성요소로 즉시 이동하면 해당 설계를 중단하고 시스템 분해를 다시 한다.`, `Stop the design and redo the system decomposition if changing the interface immediately shifts dominant variance to another component without improving the whole.`),
        dependencies: pair("종단 사양, 오류 예산, 민감도 분석, 비교 가능한 통합 시제품과 독립 계측", "An end-to-end specification, error budget, sensitivity analysis, comparable integrated prototypes, and independent metrology"),
        risk: pair("측정하기 쉬운 고장만 오류 예산에 넣어 실제 지배적 실패를 놓칠 수 있다.", "An error budget can omit the true dominant failure by including only what is easy to measure.")
      },
      {
        title: pair("실패가 먼저 학습되는 디지털 쌍둥이를 만든다", "Build a digital twin that learns from failure first"),
        thesis: pair(`${bKo}의 평균 작동을 모사하는 대신, ${aKo}의 극단 편차와 고장 전파를 재현하도록 디지털 쌍둥이를 훈련하고 다음 파괴시험을 선택하게 한다.`, `Instead of simulating average operation in ${bEn}, train a digital twin to reproduce extreme variation and failure propagation in ${aEn}, then let it select the next destructive test.`),
        departure: pair(`${priorKo}의 성공 사례 중심 보정에서 벗어나, 시뮬레이션이 가장 틀린 실패 모드를 우선 수집하는 능동 검증을 사용한다.`, `Move beyond success-case calibration in ${priorEn}; use active validation that collects the failure mode on which the simulation is most wrong.`),
        design: pair(`${aKo}의 제조 편차와 ${bKo}의 운용 편차를 확률분포로 모델링하고, 실제 고장 자료로 불확실성을 갱신한다. 쌍둥이가 ${cKo} 실패 확률을 가장 크게 바꿀 스트레스 조건을 제안하면 소규모 시험으로 확인한다.`, `Model manufacturing variation in ${aEn} and operating variation in ${bEn} as distributions, updating uncertainty with real failures. Let the twin propose the stress condition expected to change failure probability in ${cEn} most, then verify it in a small test.`),
        firstTest: pair(`이미 확보한 고장 사례를 숨기고, 쌍둥이가 고장 순서와 임계 조건을 기준모형보다 정확히 예측하는지 본다.`, `Hide existing failure cases and test whether the twin predicts failure ordering and threshold conditions more accurately than the baseline model.`),
        success: pair(`새로운 실패 모드를 사전에 예측하고, 그 예측으로 설계를 바꿨을 때 실제 수명·수율 또는 안전 여유가 재현성 있게 개선된다.`, `Prospectively predict a new failure mode and show that a design change based on it reproducibly improves lifetime, yield, or safety margin.`),
        stopRule: pair(`추가 고장 자료가 예측 불확실성을 줄이지 않거나 모형이 매 시험마다 재보정돼야 하면 자동 의사결정을 중단한다.`, `Stop automated decisions if added failure data do not reduce predictive uncertainty or the model requires complete recalibration after every test.`),
        dependencies: pair("추적 가능한 제조·운용 자료, 파괴시험, 불확실성 정량화와 물리 제약 모형", "Traceable manufacturing and operating data, destructive tests, uncertainty quantification, and physics-constrained models"),
        risk: pair("시뮬레이션에 없는 고장 모드는 높은 신뢰도의 잘못된 예측을 만들 수 있다.", "A failure mode absent from the simulator can produce a confidently wrong prediction.")
      },
      {
        title: pair("기능별 인증 사다리로 통합 위험을 낮춘다", "Use a function-by-function certification ladder"),
        thesis: pair(`${aKo}, ${bKo}, ${cKo}를 한 번에 완성하려 하지 않고, 각 단계가 다음 단계의 입력 사양을 실제로 보장하는 최소 통합체를 차례로 인증한다.`, `Do not attempt ${aEn}, ${bEn}, and ${cEn} all at once; certify a sequence of minimal integrated systems in which each stage guarantees the input specification of the next.`),
        departure: pair(`${priorKo}의 단일 시연보다 실패 위치를 식별할 수 있는 공개 관문을 두어, 중간 성과가 최종 통합에 누적되게 한다.`, `Replace a one-off demonstration like ${priorEn} with public gates that localize failure and make intermediate progress accumulate toward final integration.`),
        design: pair(`각 단계에 기능, 변동성, 수명, 안전성의 통과 기준을 둔다. 인터페이스 자료 형식과 시험 치구를 고정하고, 독립팀이 통과한 모듈만 다음 통합 단계에 사용한다.`, `Give each stage pass criteria for function, variation, lifetime, and safety. Freeze interface data formats and test fixtures, and allow only independently passed modules into the next integration stage.`),
        firstTest: pair(`${aKo}를 구현한 최소 모듈이 ${bKo}에 필요한 입출력 범위를 반복 제작 세 번에서 모두 만족하는지 확인한다.`, `Verify that the minimum module implementing ${aEn} meets the input-output envelope required by ${bEn} in three repeated builds.`),
        success: pair(`각 관문을 독립팀이 재현하고 마지막 통합체가 ${criterionKo}`, `Independent teams reproduce every gate and the final integrated system satisfies this criterion: ${criterionEn}`),
        stopRule: pair(`한 단계의 통과 사양이 다음 단계 성능을 예측하지 못하면 더 큰 통합 전에 관문 정의를 폐기한다.`, `Discard the gate definition before larger integration if passing one stage fails to predict performance at the next.`),
        dependencies: pair("모듈 인터페이스 표준, 공통 시험 치구, 반복 제작, 독립 인증과 공개 실패 보고", "Module-interface standards, common test fixtures, repeated builds, independent certification, and public failure reporting"),
        risk: pair("모듈별 최적화가 전체 시스템 최적점과 어긋나거나 관문 통과가 목적화될 수 있다.", "Module-level optimization can conflict with the system optimum, and passing gates can become an end in itself.")
      }
    ];

    const collections = { theory, experiment, hybrid, engineering };
    return anchorToQuestion({ ...collections[problem.approach][index], speculative }, problem);
  }

  function roadmap(problem) {
    const qKo = stem(problem.question);
    const qEn = stem(problem.questionEn);
    const aKo = topicText(problem, 0, "ko");
    const aEn = topicText(problem, 0, "en");
    const bKo = topicText(problem, 1, "ko");
    const bEn = topicText(problem, 1, "en");
    const cKo = topicText(problem, 2, "ko");
    const cEn = topicText(problem, 2, "en");
    const isBoundary = problem.nature === "boundary";

    return [
      {
        number: "01",
        title: pair("판정 가능한 질문으로 좁힌다", "Narrow the question to an adjudicable claim"),
        objective: pair(`“${qKo}”의 성공 조건을 ${aKo}에 관한 하나의 판정량과 허용 오차로 바꾸고, 경쟁 가설·숨은 가정·실패 사례를 같은 표에 정리한다.`, `Convert “${qEn}” into one adjudication metric and tolerance for ${aEn}; place competing hypotheses, hidden assumptions, and failure cases in one registry.`),
        output: pair("가설·가정 목록, 판정 규칙, 기준 데이터 또는 최소 사례, 재현 가능한 분석 환경", "A hypothesis-and-assumption registry, decision rule, reference data or minimal cases, and a reproducible analysis environment"),
        gate: pair("서로 다른 설명 두 개 이상이 같은 시험에서 명확히 다른 결과를 예측해야 다음 단계로 간다.", "Advance only when at least two distinct explanations make clearly different predictions on the same test.")
      },
      {
        number: "02",
        title: pair(isBoundary ? "최소 가정 완화를 시험한다" : "가장 싼 반증 시험을 한다", isBoundary ? "Test the smallest assumption relaxation" : "Run the cheapest falsification test"),
        objective: pair(
          isBoundary ? `${bKo}를 지탱하는 가정을 하나씩 제거해 ${cKo}가 바뀌는 최초 지점을 찾는다.` : `${bKo}의 주요 불확실성을 일부러 크게 드러내는 작은 증명·실험·시제품을 설계해 추천 경로의 핵심 전제를 먼저 공격한다.`,
          isBoundary ? `Remove assumptions supporting ${bEn} one at a time to find the first point at which ${cEn} changes.` : `Design a small proof, experiment, or prototype that deliberately exposes the dominant uncertainty in ${bEn} and attacks the recommended path's central premise first.`
        ),
        output: pair("사전 등록된 파일럿, 원자료·코드·증명 객체, 실패 원인과 업데이트된 불확실성", "A preregistered pilot, raw data and code or proof objects, failure causes, and updated uncertainty"),
        gate: pair("양성 결과뿐 아니라 음성 결과도 후보 공간이나 가정 집합을 실제로 줄여야 한다.", "Both positive and null outcomes must materially shrink the candidate space or assumption set.")
      },
      {
        number: "03",
        title: pair("대안 경로와 정면 비교한다", "Pit the leading path against an alternative"),
        objective: pair(`${aKo}와 ${bKo}를 함께 포함하는 숨겨진 기준집합에서 추천 경로와 가장 강한 대안 경로를 같은 자원·판정 규칙으로 비교한다.`, `Compare the recommended path with the strongest alternative on a hidden benchmark spanning ${aEn} and ${bEn}, using the same resource budget and decision rule.`),
        output: pair("분석 잠금된 비교 결과, 오차·반례·고장 분류, 계속할 경로 하나와 탈락 근거", "A locked comparative result, error/counterexample/failure taxonomy, one path to continue, and documented reasons for elimination"),
        gate: pair("선택 경로가 사전 정의한 최소 차이만큼 우세하고 독립 검토에서 판정이 유지돼야 한다.", "The selected path must exceed the preregistered minimum margin and survive independent review.")
      },
      {
        number: "04",
        title: pair("보지 않은 조건에서 깨뜨려 본다", "Try to break it under unseen conditions"),
        objective: pair(`${cKo}에 대해 새로운 사례·환경·기관·척도를 사용하고, 개발팀이 보지 못한 상태에서 예측·증명·장치를 독립 재현한다.`, `Use new cases, environments, sites, or scales for ${cEn}, with independent reproduction while the development team remains blind to the test.`),
        output: pair("독립 재현 보고서, 적용 범위와 실패 경계, 모형·프로토콜·설계의 고정 버전", "An independent replication report, scope and failure boundary, and a frozen version of the model, protocol, or design"),
        gate: pair("핵심 결론이 조건 변화 후에도 유지되고 실패 범위가 정량적으로 설명돼야 한다.", "The central conclusion must survive changed conditions, with failures quantitatively explained.")
      },
      {
        number: "05",
        title: pair(isBoundary ? "새 경계 정리와 근사 지도를 공개한다" : "해결 판정 패키지를 공개한다", isBoundary ? "Publish the new boundary and approximation map" : "Publish a resolution-grade evidence package"),
        objective: pair(
          isBoundary ? `${aKo}를 금지하는 최소 가정과 ${cKo}의 최적 근사 범위를 정리·구성·검증 코드로 함께 공개한다.` : `${problem.resolutionCriterion} 이 판정을 누구나 감사할 수 있도록 전체 증거 사슬과 실패 분석을 공개한다.`,
          isBoundary ? `Publish the minimal assumptions forbidding ${aEn} and the best attainable range for ${cEn}, together with theorem, construction, and verification code.` : `${problem.resolutionCriterionEn} Publish the full evidence chain and failure analysis so this judgment can be audited.`
        ),
        output: pair("원자료·코드·증명·설계 파일, 독립 검증 기록, 알려진 한계와 반증 조건", "Raw data, code, proof or design files, independent verification records, known limitations, and falsification conditions"),
        gate: pair("독립 집단이 같은 결론을 재현하고, 반례·대안 설명에 대한 공개 검토를 통과해야 한다.", "Independent groups must reproduce the conclusion and it must survive open review of counterexamples and alternative explanations.")
      }
    ];
  }

  function researchQuestions(problem) {
    const aKo = topicText(problem, 0, "ko");
    const aEn = topicText(problem, 0, "en");
    const bKo = topicText(problem, 1, "ko");
    const bEn = topicText(problem, 1, "en");
    const cKo = topicText(problem, 2, "ko");
    const cEn = topicText(problem, 2, "en");
    return [
      pair(`${aKo}를 두 유력 설명이 공유하지 못하는 하나의 정량 예측으로 바꾸려면 어떤 최소 가정이 필요한가?`, `What minimum assumptions turn ${aEn} into one quantitative prediction that two leading explanations cannot both share?`),
      pair(`${bKo}의 불확실성 가운데 결론을 실제로 뒤집을 수 있는 것은 무엇이며, 그것을 직접 측정하거나 증명할 수 있는가?`, `Which uncertainty in ${bEn} can actually reverse the conclusion, and can it be measured or proved directly?`),
      pair(`${cKo}를 개발 과정과 독립된 데이터·사례·기관에서 판정할 때도 같은 결과가 나오는가?`, `Does ${cEn} yield the same judgment on data, cases, or sites independent of development?`),
      pair(`어떤 결과가 나오면 현재의 추천 경로를 포기해야 하는지 연구 시작 전에 합의할 수 있는가?`, `Can the team agree before research begins on the result that would force abandonment of the recommended path?`)
    ];
  }

  function capabilities(problem) {
    const approach = problem.approach;
    const common = {
      theory: [pair("핵심 정의와 알려진 장벽을 다루는 분야 이론가", "Domain theorists covering the central definitions and known barriers"), pair("반례 탐색·기호 계산·형식 검증 인프라", "Counterexample search, symbolic computation, and formal-verification infrastructure"), pair("증명 의존성과 실패한 접근을 관리하는 공개 지식베이스", "An open knowledge base of proof dependencies and failed approaches")],
      experiment: [pair("독립 원리의 계측 장비와 기준물질·음성 대조", "Orthogonal instrumentation, reference materials, and negative controls"), pair("맹검·사전 등록·순차 분석을 설계할 통계 역량", "Statistical expertise in blinding, preregistration, and sequential analysis"), pair("조건이 다른 독립 연구기관과 원자료 공유 체계", "Independent sites with heterogeneous conditions and a raw-data sharing system")],
      hybrid: [pair("경쟁 기전 모형을 공통 관측량으로 번역하는 이론·실험 공동팀", "A joint theory-experiment team translating competing mechanisms into common observables"), pair("사전 예측 저장소, 능동 실험 설계와 불확실성 정량화", "A prospective-prediction registry, active experimental design, and uncertainty quantification"), pair("새 조건에서 모델을 독립 판정할 데이터·계측·개입 역량", "Data, measurement, or intervention capacity for independent adjudication under new conditions")],
      engineering: [pair("종단 사양·오류 예산·인터페이스를 함께 관리하는 시스템 설계팀", "A systems team jointly managing end-to-end specifications, error budgets, and interfaces"), pair("반복 제작, 가속수명·파괴시험과 추적 가능한 공정 자료", "Repeated fabrication, accelerated-life and destructive tests, and traceable process data"), pair("개발팀과 분리된 계측·인증 환경", "A metrology and certification environment independent of the development team")]
    };
    if (problem.nature === "boundary") return [pair("정리의 숨은 가정까지 추출할 형식화 역량", "Formalization expertise able to expose hidden assumptions in the theorem"), pair("유한 모형 탐색·반례 최소화·구성적 상한 계산", "Finite-model search, counterexample minimization, and constructive upper-bound computation"), pair("근사 문제가 원래 의미를 보존하는지 평가할 분야 전문가", "Domain experts able to judge whether an approximation preserves the original meaning")];
    return common[approach];
  }

  function pitfalls(problem) {
    const aKo = topicText(problem, 0, "ko");
    const aEn = topicText(problem, 0, "en");
    const bKo = topicText(problem, 1, "ko");
    const bEn = topicText(problem, 1, "en");
    const cKo = topicText(problem, 2, "ko");
    const cEn = topicText(problem, 2, "en");
    return [
      pair(`${aKo}의 대리 지표가 좋아진 것을 원래 난제가 해결된 것으로 해석하지 않는다.`, `Do not interpret improvement in a proxy for ${aEn} as resolution of the original problem.`),
      pair(`${bKo}에 맞춰 가설·임계값·분석을 사후 변경하면 판정 데이터와 탐색 데이터를 다시 분리한다.`, `If hypotheses, thresholds, or analyses are changed after seeing ${bEn}, separate exploratory and adjudication data again.`),
      pair(`${cKo}의 독립 재현 전에 최고 기록·시뮬레이션·특수 사례를 일반 해답으로 확대하지 않는다.`, `Do not promote a record, simulation, or special case into a general answer before independent reproduction of ${cEn}.`),
      pair("새로운 조합을 문헌상 최초라고 부르지 않는다. 선행연구 검색과 전문가 검토 뒤에도 독창성 주장은 별도로 입증해야 한다.", "Do not call a new combination literature-first. Any originality claim requires a separate prior-art search and expert review.")
    ];
  }

  const flagship = {
    "UP-001": {
      title: pair("모든 검출 채널이 공유하는 후보 장부를 만든다", "Build a candidate ledger shared by every detection channel"),
      thesis: pair("암흑물질 후보마다 질량·결합·생성 이력을 한 번만 적합하고, 직접검출·간접검출·충돌기·천체역학에 동시에 적용해 한 채널의 신호가 다른 채널의 수치 예측을 강제하게 한다.", "Fit mass, coupling, and production history once for each dark-matter candidate, then apply them jointly to direct detection, indirect detection, colliders, and astrophysical dynamics so a signal in one channel forces quantitative predictions in the others."),
      departure: pair("각 실험의 한계선을 나란히 놓는 수준을 넘어, 헤일로 모형과 계측 계통오차를 공유 잠재변수로 둔 전향적 교차채널 판정 체계를 만든다.", "Go beyond juxtaposing exclusion curves by creating a prospective cross-channel adjudication system with halo models and instrumental systematics represented as shared latent variables."),
      design: pair("후보별 공통 매개변수 사전을 만들고 각 관측소는 분석 잠금 전에 우도와 계통오차 모형을 제출한다. 한 채널에서 허용된 사후분포를 다른 채널의 숨겨진 자료에 전달해, 동일 후보가 핵반동·전자반동·감마선·누락운동량·소규모 구조를 함께 설명하는지 시험한다.", "Create a common parameter dictionary for each candidate and require observatories to submit likelihood and systematic-error models before analysis lock. Transfer the posterior allowed by one channel to hidden data from the others, testing whether one candidate jointly explains nuclear/electronic recoils, gamma rays, missing momentum, and small-scale structure."),
      firstTest: pair("공개된 과거 자료를 시간 순서로 숨긴 모의시험에서, 한 채널로 보정한 후보가 다음 채널의 결과를 계통오차 범위 안에서 예측하는지 확인한다.", "In a temporally hidden retrospective trial, test whether a candidate calibrated on one channel predicts the next channel within declared systematic uncertainty."),
      success: pair("서로 다른 물리 원리의 두 채널 이상에서 동일한 질량·결합 영역이 나타나고, 제3 채널의 사전 예측이 독립적으로 맞는다.", "The same mass-coupling region appears in at least two physically distinct channels and independently predicts a third channel prospectively."),
      stopRule: pair("공유 계통오차나 헤일로 사전분포를 바꿀 때마다 후보 영역이 이동해 교차 예측이 사라지면 해당 후보 장부를 기각한다.", "Reject the candidate ledger if its overlap disappears whenever shared systematics or halo priors are varied within defensible ranges."),
      dependencies: pair("검출 채널별 우도 공개, 공통 천체물리 nuisance 모형, 맹검 교차검증과 독립 통계팀", "Released channel likelihoods, common astrophysical nuisance models, blind cross-validation, and an independent statistics team"),
      risk: pair("공유 모형의 잘못된 가정이 여러 채널의 인위적 합의를 만들 수 있다.", "A wrong shared-model assumption can manufacture agreement across channels."),
      speculative: true
    },
    "UP-121": {
      title: pair("분자 수율이 아니라 진화 가능성의 출현을 시험한다", "Test for the emergence of evolvability, not molecular yield"),
      thesis: pair("생명 기원 실험의 판정량을 특정 분자의 생성량에서 벗어나, 같은 지구화학 환경 안에서 복제·변이·선택·구획화가 함께 지속되는 최소 진화 지수로 바꾼다.", "Replace molecular yield as the endpoint of origin-of-life experiments with a minimum evolvability index: sustained replication, variation, selection, and compartmentalization within one geochemically coherent environment."),
      departure: pair("각각 성공한 전생물 반응을 사후 조합하지 않고, 처음부터 에너지 흐름과 부산물까지 닫힌 환경에서 정보 유지와 기능 향상이 세대에 따라 나타나는지 판정한다.", "Do not retrospectively combine separately successful prebiotic reactions; test from the outset whether information retention and functional improvement emerge across generations in an environment closed over energy flow and by-products."),
      design: pair("가능한 초기 지구 광물·대기·습윤–건조 주기를 제한조건으로 고정하고, 자기촉매망·비효소 복제·막 성장을 동시에 추적한다. 분자 종 수가 아니라 계보 정보, 복제 충실도, 선택에 대한 반응, 에너지 비용이 시간에 따라 함께 개선되는지를 맹검 분석한다.", "Fix plausible early-Earth minerals, atmosphere, and wet-dry cycles as constraints, then track autocatalytic networks, enzyme-free replication, and membrane growth together. Blind the analysis to whether lineage information, replication fidelity, response to selection, and energy cost improve jointly over time—not merely the number of molecular species."),
      firstTest: pair("하나의 단순한 환경 주기에서 대조군보다 계보 정보가 더 오래 유지되고 선택압을 바꾸면 분자군의 기능 분포가 예측 가능한 방향으로 이동하는지 본다.", "In one simple environmental cycle, test whether lineage information persists longer than in controls and whether changing selection pressure shifts functional distributions in a predicted direction."),
      success: pair("외부에서 서열을 지정하지 않아도 복제·변이·선택이 여러 주기 지속되고, 독립 실험실이 같은 지구화학 조건에서 재현한다.", "Replication, variation, and selection persist for multiple cycles without externally specifying sequences, and an independent laboratory reproduces the transition under the same geochemical constraints."),
      stopRule: pair("관찰된 적응이 비생물적 분리·증폭 또는 분석 선택으로 설명되고 계보 정보가 대조군을 넘지 못하면 해당 환경 경로를 중단한다.", "Stop the environmental path if apparent adaptation is explained by abiotic sorting, amplification, or analysis selection and lineage information does not exceed controls."),
      dependencies: pair("장기 자동화 비평형 실험, 계보 추적, 지구화학 질량수지, 오염 통제와 독립 복제", "Long-running automated nonequilibrium experiments, lineage tracking, geochemical mass balance, contamination controls, and independent replication"),
      risk: pair("진화처럼 보이는 비생물적 선택과 현대 생물 오염을 구분하기 어렵다.", "Abiotic selection that resembles evolution and contamination by modern life are difficult to distinguish."),
      speculative: true
    },
    "UP-316": {
      title: pair("동치 명제들의 증명 의존성을 역추적한다", "Trace proof dependencies across equivalent formulations"),
      thesis: pair("리만 가설의 수많은 동치 조건을 목록이 아니라 방향성 증명 그래프로 만들고, 여러 경로가 공통으로 요구하지만 아직 증명되지 않은 최소 전달 보조정리를 찾는다.", "Turn the many equivalent formulations of the Riemann hypothesis from a list into a directed proof graph, then identify the smallest unproved transfer lemma required by multiple routes."),
      departure: pair("영점 계산이나 한 표현 안의 부등식을 더 밀어붙이기보다, 소수 오차항·양의성 조건·스펙트럼 해석 사이에서 실제로 재사용 가능한 병목을 고립한다.", "Rather than extending zero computations or inequalities in one representation, isolate a reusable bottleneck linking prime error terms, positivity criteria, and spectral interpretations."),
      design: pair("동치·함의 결과를 가정 강도와 정량 손실까지 표시해 형식화한다. 서로 다른 세 경로가 만나는 가장 약한 간선을 선택하고, 먼저 제한된 L함수 또는 절단 연산자에서 보조정리를 증명한 뒤 균일한 극한에 필요한 정확한 상계를 분리한다.", "Formalize equivalences and implications with assumption strength and quantitative loss. Select the weakest edge where three distinct routes meet, prove it first for a restricted L-function family or truncated operator, then isolate the exact uniform bound needed for the limit."),
      firstTest: pair("후보 전달 보조정리가 알려진 유사 제타함수의 참·거짓 사례를 올바르게 구분하고, 리만 제타함수의 유한 절단에서 수치적으로 안정적인지 본다.", "Test whether the candidate transfer lemma correctly separates true and false cases among known zeta analogues and remains numerically stable on finite truncations of the Riemann zeta function."),
      success: pair("새 보조정리가 기존에 따로 알려진 두 동치 경로를 엄밀히 연결하고, 전역 증명에 남는 미해결 조건을 하나의 명시적 균일 상계로 축소한다.", "The lemma rigorously connects two previously separate equivalence routes and reduces the remaining global proof to one explicit uniform bound."),
      stopRule: pair("전달 보조정리 자체가 리만 가설과 논리적으로 동치이거나 극한 과정에서 모든 정량 이득이 사라지면 이 경로를 중단한다.", "Stop if the transfer lemma is itself logically equivalent to the Riemann hypothesis or if every quantitative gain vanishes in the limiting step."),
      dependencies: pair("해석적 수론·연산자 이론 공동 검토, 정리 데이터베이스, 형식화와 고정밀 수치 실험", "Joint analytic-number-theory and operator-theory review, a theorem database, formalization, and high-precision numerical experiments"),
      risk: pair("동치 명제의 재배열만으로 새로운 증명력이 생긴다고 착각할 수 있다.", "Rearranging equivalent statements can be mistaken for gaining new proving power."),
      speculative: true
    },
    "UP-346": {
      title: pair("알려진 증명 장벽을 시험 단계에서부터 제외한다", "Exclude known proof barriers at the design stage"),
      thesis: pair("P 대 NP를 직접 증명하려는 후보 논증마다 상대화·자연적 증명·대수화 장벽을 통과하는지 먼저 검사하고, 통과한 구조만 제한 회로 하한 사다리에서 확장한다.", "For every candidate attack on P versus NP, first test whether it escapes relativization, natural-proofs, and algebrization barriers; extend only surviving structures along a ladder of restricted circuit lower bounds."),
      departure: pair("더 큰 계산 탐색보다 논증이 무엇을 구별할 수 있는지를 메타 수준에서 사전 검증해, 이미 불가능한 기법 계열에 자원을 쓰지 않는다.", "Instead of larger computational search, validate at the meta level what an argument can distinguish, avoiding investment in technique families already blocked."),
      design: pair("후보 불변량을 오라클 세계, 의사난수 함수가 존재하는 세계, 대수화된 계산모형에 각각 적용해 실패 여부를 자동 점검한다. 살아남은 불변량은 공식·분기 프로그램·제한 회로 계열에서 하한을 증명하고, 알고리즘–하한 변환으로 범위를 한 단계씩 넓힌다.", "Automatically test a candidate invariant in oracle worlds, worlds with pseudorandom functions, and algebrized models. For survivors, prove lower bounds on formulas, branching programs, or restricted circuits, then widen the class one step at a time through algorithm-to-lower-bound transfers."),
      firstTest: pair("이미 장벽에 막히는 고전 논증과 장벽을 피하는 알려진 제한 하한을 기준집합으로 삼아 필터가 정확히 구분하는지 확인한다.", "Benchmark the filter on classical arguments known to hit barriers and restricted lower bounds known to evade them, checking that it distinguishes the two correctly."),
      success: pair("세 장벽 중 적어도 하나를 명시적으로 피하는 새 불변량으로 기존보다 넓은 자연스러운 회로 계열에 초다항 하한을 증명한다.", "Use a new invariant that explicitly evades at least one major barrier to prove a superpolynomial lower bound for a broader natural circuit class."),
      stopRule: pair("후보 불변량이 장벽 검사를 통과하려면 계산하기 자체가 원래 문제만큼 어려워지거나 제한 계열 확장에서 붕괴하면 폐기한다.", "Discard the invariant if passing the barrier checks makes it as hard to compute as the original problem, or if it collapses when the restricted class is widened."),
      dependencies: pair("복잡도 장벽 형식화, 회로·증명복잡도 전문가, 작은 회로 탐색과 증명 보조기", "Formalized complexity barriers, circuit and proof-complexity experts, small-circuit search, and proof assistance"),
      risk: pair("장벽 하나를 피하는 것이 P≠NP에 충분하다는 뜻은 아니며 제한 하한이 확장되지 않을 수 있다.", "Evading one barrier is not sufficient for P≠NP, and a restricted lower bound may fail to scale."),
      speculative: true
    },
    "UP-744": {
      title: pair("독립 계측이 가능한 최소 나노시스템부터 닫는다", "Close the smallest nanosystem that independent metrology can certify"),
      thesis: pair("완전한 나노 로봇팔과 계산장치를 한 번에 만들기보다, 원자 배치·구동·입출력·오류의 전체 사슬을 외부에서 판정할 수 있는 최소 폐루프 기능체를 먼저 제작한다.", "Rather than building a complete nanoscale robotic arm and computer at once, first fabricate the smallest closed-loop functional system whose full chain of atomic placement, actuation, input/output, and error can be externally adjudicated."),
      departure: pair("개별 분자기계의 동작 시연에서 벗어나 제작 전에 계측 가능성과 오류 예산을 고정하고, 기능 증거가 구조 추정에 의존하지 않게 한다.", "Move beyond demonstrations of isolated molecular machines by fixing metrology and error budgets before fabrication, so functional evidence does not depend on inferred structure."),
      design: pair("한 입력을 받아 두 상태 중 하나를 선택하고 기계적 위치 변화와 논리 출력을 함께 내는 최소 장치를 정의한다. 원자 배치 오류, 에너지 전달, 열잡음, 판독 오류의 예산을 배분하고 서로 다른 두 계측 원리로 구조와 기능을 맹검 판정한다.", "Define a minimum device that accepts one input, selects one of two states, and emits both a mechanical displacement and logical output. Allocate budgets for placement error, energy delivery, thermal noise, and readout error, then blind-adjudicate structure and function with two distinct measurement principles."),
      firstTest: pair("반복 제작한 세 장치에서 같은 입력–상태–출력 전이가 기준 오차 안에 나타나고, 계측팀이 표본 정체를 모른 채 기능 장치와 대조군을 구분하는지 본다.", "Across three repeated builds, test whether the same input-state-output transition appears within tolerance and whether a blinded metrology team distinguishes functional devices from controls."),
      success: pair("최소 기능체를 독립 재현한 뒤 동일한 인터페이스를 유지하며 자유도와 논리 상태 수를 단계적으로 늘려 두 최종 장치 사양에 연결한다.", "After independent reproduction of the minimal functional system, increase degrees of freedom and logical state count while preserving the same interface, linking the ladder to both final device specifications."),
      stopRule: pair("기능 판정이 표본 손상이나 간접 구조 추정에 의존하거나 반복 제작에서 오류가 누적되면 더 복잡한 조립으로 확장하지 않는다.", "Do not scale to more complex assembly if function can be judged only through sample-damaging or indirect structural inference, or if errors accumulate across repeated builds."),
      dependencies: pair("원자정밀 합성, 독립 다중모달 계측, 저잡음 구동·판독, 오류 예산과 반복 제작", "Atomically precise synthesis, independent multimodal metrology, low-noise actuation/readout, error budgeting, and repeated fabrication"),
      risk: pair("계측이 장치를 교란하거나 최소 기능체의 인터페이스가 더 큰 시스템으로 확장되지 않을 수 있다.", "Measurement may disturb the device, or the minimum system's interface may fail to scale to larger systems."),
      speculative: true
    }
  };

  for (const problem of problems) {
    const view = diagnosis(problem);
    const tracks = [makeTrack(problem, 0), makeTrack(problem, 1), makeTrack(problem, 2)];
    if (flagship[problem.id]) tracks[0] = flagship[problem.id];
    tracks.forEach(track => ["title", "thesis", "departure", "design", "firstTest", "success", "stopRule", "dependencies", "risk"].forEach(key => polishPair(track[key], problem)));
    const gates = roadmap(problem);
    gates.forEach(gate => ["title", "objective", "output", "gate"].forEach(key => polishPair(gate[key], problem)));
    const questions = researchQuestions(problem).map(item => polishPair(item, problem));
    const needed = capabilities(problem).map(item => polishPair(item, problem));
    const warnings = pitfalls(problem).map(item => polishPair(item, problem));
    problem.solutionLab = {
      diagnosis: polishKorean(view.gap.text, problem),
      diagnosisEn: view.gap.textEn,
      centralQuestion: polishKorean(view.question.text, problem),
      centralQuestionEn: view.question.textEn,
      tracks,
      roadmap: gates,
      researchQuestions: questions,
      capabilities: needed,
      pitfalls: warnings,
      safetyNote: polishKorean((safetyByDiscipline[problem.discipline] || defaultSafety).text, problem),
      safetyNoteEn: (safetyByDiscipline[problem.discipline] || defaultSafety).textEn,
      reviewedOn: REVIEWED_ON
    };
  }

  window.SOLUTION_CONTEXT_META = {
    version: REVIEWED_ON,
    problems: problems.length,
    proposals: problems.length * 3,
    scope: "Three falsifiable research proposals, a five-gate roadmap, required capabilities, risks, and stop rules for every catalog entry",
    scopeKo: "각 항목당 반증 가능한 연구 제안 3개, 5단계 관문, 필요 역량, 위험과 중단 조건"
  };
})();
