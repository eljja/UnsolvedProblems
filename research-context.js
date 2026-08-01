/*
 * Bilingual research context for every catalog entry.
 *
 * The attempt cards summarize established research programs and recent
 * directions supported by each entry's linked institutional sources. They are
 * deliberately not presented as an exhaustive paper bibliography.
 */
(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const meta = window.CATALOG_META;
  const sources = window.CATALOG_SOURCES || {};

  const disciplineLens = {
    physics: [
      "물리학에서는 같은 관측을 설명하는 이론이 여럿일 수 있고, 접근 가능한 에너지·시간·길이 척도가 제한되기 때문에 수학적 일관성과 관측 판별력을 동시에 요구한다.",
      "In physics, several theories can fit the same observations while accessible energy, time, and length scales remain limited, so both mathematical consistency and observational discrimination are required."
    ],
    chemistry: [
      "화학에서는 전자구조, 반응경로, 용매·계면, 온도와 시간 척도가 얽혀 있어 계산 가능한 모형과 실제 반응계 사이의 간극을 닫는 일이 핵심이다.",
      "In chemistry, electronic structure, reaction pathways, solvents, interfaces, temperature, and time scales are entangled, making the gap between tractable models and real reaction environments central."
    ],
    biology: [
      "생물학에서는 진화적 역사, 개체 차이, 환경과 다중 규모 피드백 때문에 상관관계를 원인으로 오인하지 않으면서 세포에서 개체·생태계까지 연결해야 한다.",
      "In biology, evolutionary history, individual variation, environment, and multiscale feedback make it necessary to connect cells to organisms and ecosystems without mistaking correlation for causation."
    ],
    materials: [
      "재료공학에서는 조성만이 아니라 결함, 미세구조, 공정 이력과 사용 환경이 성능을 결정하므로 발견·합성·특성평가·수명 검증을 하나의 고리로 다뤄야 한다.",
      "In materials engineering, defects, microstructure, processing history, and service environment matter alongside composition, so discovery, synthesis, characterization, and lifetime validation must form one loop."
    ],
    semiconductor: [
      "반도체·전자공학에서는 소자 물리의 개선이 배선, 메모리, 열, 변동성, 수율과 시스템 비용으로 상쇄될 수 있어 소자부터 회로·패키지·시스템까지 공동 최적화해야 한다.",
      "In semiconductor and electronic engineering, device gains can be erased by interconnect, memory, heat, variability, yield, and system cost, requiring co-optimization from devices through circuits, packaging, and systems."
    ],
    mathematics: [
      "수학·통계학에서는 매우 많은 사례의 계산 확인도 일반 증명을 대신하지 못하며, 정의와 가정 아래 모든 경우를 포괄하거나 명시적 반례 하나를 제시해야 한다.",
      "In mathematics and statistics, checking vast numbers of cases cannot replace a general proof; all cases under stated assumptions must be covered, or one explicit counterexample must be produced."
    ],
    computer: [
      "컴퓨터과학·AI에서는 최악 경우 복잡도, 평균적 성능, 데이터 분포, 적대적 환경과 실제 자원 비용이 서로 달라 이론 보장과 공개 벤치마크의 재현성을 함께 따져야 한다.",
      "In computer science and AI, worst-case complexity, average performance, data distributions, adversarial settings, and real resource costs differ, so theoretical guarantees and reproducible public benchmarks must be assessed together."
    ],
    earth: [
      "지구·환경과학에서는 단 한 번의 지구, 불완전한 과거 기록, 희소 관측과 결합된 비선형 과정 때문에 관측·대리자료·모형을 일관되게 통합해야 한다.",
      "In Earth and environmental science, one planet, incomplete historical records, sparse observations, and coupled nonlinear processes require coherent integration of observations, proxies, and models."
    ],
    medicine: [
      "의학·보건과학에서는 기전의 타당성만으로 충분하지 않고, 다양한 환자 집단에서 임상적으로 의미 있는 이득과 위해를 전향적으로 비교하고 재현해야 한다.",
      "In medicine and health, mechanistic plausibility is not enough; clinically meaningful benefit and harm must be prospectively compared and reproduced across diverse patient populations."
    ],
    mechanical: [
      "기계·항공·로봇 분야에서는 모델 오차, 제조 공차, 센서·구동기 한계와 예측하지 못한 운용 조건이 결합되므로 실험실 성능을 안전한 현장 성능으로 이어야 한다.",
      "In mechanical, aerospace, and robotics research, model error, manufacturing tolerance, sensor and actuator limits, and unforeseen operating conditions combine, so laboratory performance must translate into safe field performance."
    ],
    cognitive: [
      "인지과학·심리학에서는 잠재 개념을 직접 측정하기 어렵고 과제·문화·발달·개인차의 영향을 받으므로 행동, 생리, 뇌 측정과 인과적 개입을 교차 검증해야 한다.",
      "In cognitive science and psychology, latent constructs are hard to measure directly and depend on task, culture, development, and individual differences, requiring cross-validation among behavior, physiology, brain measures, and causal interventions."
    ],
    agriculture: [
      "농업·식품과학에서는 유전형, 토양, 기후, 미생물군, 경영과 시장이 동시에 작동하므로 통제 실험의 성과가 여러 지역과 계절의 농장에서 유지되는지 확인해야 한다.",
      "In agriculture and food science, genotype, soil, climate, microbiomes, management, and markets act together, so results from controlled studies must persist across farms, regions, and seasons."
    ],
    social: [
      "사회·경제·복잡계에서는 행위자가 제도와 예측에 반응하고 무작위 실험이 제한되는 경우가 많아 인과 식별, 외적 타당성, 윤리와 정책 피드백을 함께 다뤄야 한다.",
      "In social, economic, and complex systems, agents react to institutions and forecasts while randomized experiments are often constrained, so causal identification, external validity, ethics, and policy feedback must be treated together."
    ]
  };

  const natureLens = {
    fundamental: [
      "핵심 병목은 현상을 낳는 지배 원리를 특정하고, 경쟁 설명들이 서로 다른 예측을 내는 조건을 찾는 데 있다.",
      "The central bottleneck is to identify the governing principle and find conditions under which competing explanations make different predictions."
    ],
    prediction: [
      "핵심 병목은 보정·훈련에 쓰지 않은 조건에서도 오차와 불확실성을 정직하게 제시하는 예측을 만드는 데 있다.",
      "The central bottleneck is prediction outside calibration or training conditions with honestly quantified error and uncertainty."
    ],
    measurement: [
      "핵심 병목은 신호와 잡음·편향을 분리할 감도, 선택성, 표준물질 또는 독립적인 측정 원리를 확보하는 데 있다.",
      "The central bottleneck is obtaining the sensitivity, selectivity, reference standards, or independent measurement principles needed to separate signal from noise and bias."
    ],
    scale: [
      "핵심 병목은 작은 표본이나 실험실 조건의 성공을 품질·수율·비용·수명까지 포함한 실제 규모에서 재현하는 데 있다.",
      "The central bottleneck is reproducing small-sample or laboratory success at realistic scale while preserving quality, yield, cost, and lifetime."
    ],
    system: [
      "핵심 병목은 성능 하나를 최대화하는 것이 아니라 안전, 효율, 비용, 견고성처럼 충돌하는 요구를 전체 시스템에서 동시에 만족시키는 데 있다.",
      "The central bottleneck is not maximizing one metric but satisfying conflicting demands such as safety, efficiency, cost, and robustness across the whole system."
    ],
    boundary: [
      "이 항목은 통상적인 의미의 미해결 난제가 아니라, 어떤 가정과 자원 아래 요구가 금지되는지를 분명히 하는 경계 문제다.",
      "This entry is not an ordinary open problem but a boundary question that clarifies under which assumptions and resources a requested outcome is forbidden."
    ]
  };

  const approachLens = {
    theory: [
      "따라서 우선 필요한 것은 정의와 가정을 정교화하고 정리·모형·알고리즘으로 가능한 경우와 불가능한 경우를 분리하는 이론적 진전이다.",
      "The first need is therefore theoretical progress that sharpens definitions and assumptions and separates possible from impossible cases through theorems, models, or algorithms."
    ],
    experiment: [
      "따라서 우선 필요한 것은 기존 설명들이 갈라지는 조건을 겨냥한 새로운 실험계, 더 나은 계측과 독립 반복이다.",
      "The first need is therefore a new experimental platform, improved measurement, and independent replication targeted at conditions where existing explanations diverge."
    ],
    hybrid: [
      "따라서 이론이 판별 가능한 예측을 내고 실험·관측이 다시 모형을 수정하는 폐루프가 반복되어야 한다.",
      "Theory must therefore make discriminating predictions while experiments or observations feed back to revise the model in a repeated closed loop."
    ],
    engineering: [
      "따라서 구성요소의 원리 증명을 넘어 통합 시제품, 극한·수명 시험, 제조성과 현장 운용 자료가 필요하다.",
      "Beyond component-level proof of principle, integrated prototypes, stress and lifetime tests, manufacturability evidence, and field-operating data are therefore needed."
    ]
  };

  const methods = {
    physics: [
      ["대칭·유효이론과 해석 모형", "Symmetry, effective theory, and analytic models", "보존법칙, 대칭, 극한 경우와 유효 자유도를 이용해 가능한 설명을 줄이고 서로 다른 이론의 정량 예측을 도출해 왔다.", "Researchers have used conservation laws, symmetry, limiting cases, and effective degrees of freedom to narrow explanations and derive quantitative predictions from competing theories."],
      ["정밀 관측과 판별 실험", "Precision observations and discriminating experiments", "검출기 감도와 배경 억제를 높이고 서로 다른 에너지·시간·길이 척도를 조사해 이론들이 갈라지는 신호를 찾는 시도가 이어졌다.", "Work has improved detector sensitivity and background rejection while probing distinct energy, time, and length scales for signals on which theories disagree."],
      ["수치·격자 계산과 통계 추론", "Numerical, lattice, and statistical inference", "해석적으로 풀 수 없는 영역을 대규모 계산으로 근사하고, 모의자료와 실제 관측을 같은 통계 틀에서 비교해 허용 영역을 좁혀 왔다.", "Large-scale computation has approximated analytically inaccessible regimes, while simulated and observed data have been compared in a common statistical framework to narrow viable regions."]
    ],
    chemistry: [
      ["전자구조·반응기구 계산", "Electronic-structure and mechanism calculations", "양자화학, 분자동역학과 미세반응 속도론을 결합해 중간체·전이상태·속도결정 단계를 예측하고 후보 기구를 비교해 왔다.", "Quantum chemistry, molecular dynamics, and microkinetics have been combined to predict intermediates, transition states, rate-limiting steps, and compare candidate mechanisms."],
      ["합성 제어와 분광학적 추적", "Controlled synthesis and spectroscopic tracking", "온도·압력·용매·계면을 조절한 실험과 시간분해·현장 분광법으로 반응 중간체와 구조 변화를 직접 포착하려는 시도가 축적됐다.", "Controlled temperature, pressure, solvent, and interface experiments, together with time-resolved and in-situ spectroscopy, have sought to capture intermediates and structural changes directly."],
      ["조합 탐색과 기준물질 검증", "Combinatorial search and reference validation", "촉매·분자·조건 공간을 병렬 탐색하고 표준 시료와 독립 분석법으로 활성을 재검증해 재현 가능한 구조–성능 관계를 찾으려 했다.", "Catalyst, molecule, and condition spaces have been screened in parallel, with activity rechecked against reference samples and independent assays to establish reproducible structure–performance relations."]
    ],
    biology: [
      ["비교·진화·기전 모형", "Comparative, evolutionary, and mechanistic models", "종·집단·세포 상태를 비교하고 진화적 제약과 생물물리 모형을 이용해 공통 원리와 계통 특이적 설명을 분리해 왔다.", "Comparisons across species, populations, and cell states, together with evolutionary constraints and biophysical models, have separated common principles from lineage-specific explanations."],
      ["유전·세포 교란 실험", "Genetic and cellular perturbation", "유전자 편집, 기능 상실·획득, 약물과 환경 교란을 통해 관찰된 연관성이 실제로 표현형을 일으키는지 검정해 왔다.", "Genome editing, loss- and gain-of-function studies, drugs, and environmental perturbations have tested whether observed associations actually cause phenotypes."],
      ["다중오믹스·계보·장기 추적", "Multi-omics, lineage, and longitudinal tracking", "유전체·전사체·단백질·대사체와 공간·계보 정보를 결합하고 시간에 따라 추적해 상태 전이와 개체 차이를 재구성해 왔다.", "Genomic, transcriptomic, proteomic, metabolic, spatial, and lineage information has been integrated over time to reconstruct state transitions and individual variation."]
    ],
    materials: [
      ["구조–공정–물성 모형", "Structure–process–property models", "원자 계산, 상장 모형과 연속체 해석을 연결해 조성·결함·미세구조·공정이 목표 물성으로 이어지는 경로를 모델링해 왔다.", "Atomistic calculations, phase-field models, and continuum analysis have been linked to model how composition, defects, microstructure, and processing produce target properties."],
      ["제어 합성과 다중모달 특성평가", "Controlled synthesis and multimodal characterization", "공정 변수를 체계적으로 바꾸고 회절·현미경·분광·열기계 측정을 결합해 실제 활성 구조와 열화 시작점을 찾으려 했다.", "Process variables have been varied systematically while diffraction, microscopy, spectroscopy, and thermomechanical measurements were combined to identify active structures and degradation onset."],
      ["시제품·가속수명·스케일업", "Prototypes, accelerated life tests, and scale-up", "쿠폰과 소자 수준 시제품을 반복 제작하고 가속 스트레스와 파일럿 공정을 이용해 성능 분산, 고장 모드와 제조 수율을 평가해 왔다.", "Repeated coupon- and device-scale prototypes, accelerated stress tests, and pilot processes have been used to assess performance spread, failure modes, and manufacturing yield."]
    ],
    semiconductor: [
      ["수송·소자 물리 모형", "Transport and device-physics models", "양자·열·전하 수송과 계면·결함을 함께 계산해 새로운 소자의 한계, 변동성, 에너지–지연 절충을 예측해 왔다.", "Quantum, thermal, and charge transport have been modeled with interfaces and defects to predict device limits, variability, and energy–delay tradeoffs."],
      ["공정 분할·계측·수율 학습", "Process splits, metrology, and yield learning", "웨이퍼 공정 조건을 분할하고 구조·전기 계측과 고장 분석을 연결해 원인 변수를 찾고 공정 창을 넓히는 시도가 이어졌다.", "Wafer process splits, structural and electrical metrology, and failure analysis have been linked to identify causal variables and widen process windows."],
      ["회로·아키텍처 공동 최적화", "Circuit and architecture co-optimization", "소자 모델을 회로, 메모리, 배선, 패키지와 워크로드 평가에 넣어 국소적 성능 향상이 시스템 이득으로 남는지 검증해 왔다.", "Device models have been embedded in circuit, memory, interconnect, packaging, and workload studies to test whether local improvements survive as system-level gains."]
    ],
    mathematics: [
      ["직접 증명과 구조적 환원", "Direct proof and structural reduction", "정의에서 출발한 해석·대수·기하·확률적 도구로 특수 경우를 증명하고, 일반 문제를 더 단순하거나 이미 알려진 명제로 환원해 왔다.", "Analytic, algebraic, geometric, and probabilistic tools have proved special cases and reduced general statements to simpler or already understood propositions."],
      ["계산 탐색과 반례 경계 확장", "Computational search and counterexample bounds", "대규모 계산으로 방대한 사례를 확인하고 극단 구조를 탐색해 추측을 다듬거나 반례가 존재할 수 있는 범위를 밀어 왔다.", "Large computations have checked vast families and searched extremal structures, refining conjectures and pushing the region in which counterexamples could remain."],
      ["분야 간 연결과 형식 검증", "Cross-field bridges and formal verification", "서로 다른 수학 언어 사이의 대응을 만들고 핵심 보조정리를 형식화해 숨은 가정과 증명 공백을 드러내는 접근이 사용됐다.", "Correspondences between mathematical languages and formalization of key lemmas have been used to expose hidden assumptions and proof gaps."]
    ],
    computer: [
      ["복잡도 경계와 형식적 보장", "Complexity bounds and formal guarantees", "하한·상한, 환원, 불변식과 형식 검증으로 어떤 계산·학습·보안 목표가 주어진 자원에서 가능한지 규명해 왔다.", "Lower and upper bounds, reductions, invariants, and formal verification have been used to determine which computational, learning, or security goals are possible under stated resources."],
      ["공개 벤치마크와 스트레스 시험", "Open benchmarks and stress testing", "표준 데이터·워크로드와 숨은 평가 집합을 만들고 분포 변화, 적대적 입력, 실패 사례에서 방법을 비교해 왔다.", "Standard datasets, workloads, and held-out evaluations have compared methods under distribution shift, adversarial inputs, and known failure cases."],
      ["시스템 시제품과 재현 연구", "System prototypes and reproduction studies", "알고리즘을 실제 하드웨어·네트워크·사용자 환경에 구현하고 코드·모형·실험 설정을 공개해 확장성과 재현성을 시험해 왔다.", "Algorithms have been implemented on real hardware, networks, and user environments, with code, models, and experimental setups released to test scalability and reproducibility."]
    ],
    earth: [
      ["현장·위성·대리자료 관측", "Field, satellite, and proxy observations", "현장 관측망, 원격탐사와 퇴적물·빙핵·생물 지표를 결합해 짧은 계기 기록을 확장하고 변화의 공간 구조를 복원해 왔다.", "Field networks, remote sensing, and sediment, ice-core, and biological proxies have extended short instrumental records and reconstructed spatial patterns of change."],
      ["결합 모형과 자료동화", "Coupled models and data assimilation", "대기·해양·육지·빙권·생태 과정을 결합하고 관측을 지속적으로 동화해 초기조건, 매개변수와 구조 오차의 영향을 분리하려 했다.", "Atmosphere, ocean, land, cryosphere, and ecosystem processes have been coupled while observations were assimilated to separate initial-condition, parameter, and structural errors."],
      ["자연실험·과거사건·앙상블", "Natural experiments, past events, and ensembles", "분출·가뭄·지진·정책 변화 같은 사건과 다중 모형 앙상블을 이용해 원인 귀속과 극한사건 확률을 검정해 왔다.", "Eruptions, droughts, earthquakes, policy changes, and multimodel ensembles have been used as natural experiments to test attribution and extreme-event probabilities."]
    ],
    medicine: [
      ["기전 연구와 전임상 모형", "Mechanistic studies and preclinical models", "환자 시료, 세포·오가노이드와 동물 모형을 교차해 표적 경로를 찾고 개입이 예상한 생물학적 효과를 내는지 시험해 왔다.", "Patient samples, cells, organoids, and animal models have been cross-compared to identify target pathways and test whether interventions produce the expected biological effect."],
      ["코호트·바이오마커·위험층화", "Cohorts, biomarkers, and risk stratification", "장기 코호트와 임상 기록에서 노출·분자 표지·경과를 연결하고 외부 집단에서 위험 예측과 환자군 구분을 검증해 왔다.", "Longitudinal cohorts and clinical records have linked exposures, molecular markers, and outcomes, with external populations used to validate risk prediction and patient stratification."],
      ["무작위 임상시험과 실제진료 근거", "Randomized trials and real-world evidence", "대조 임상시험으로 효과와 위해를 비교하고 등록자료·전자건강기록·시판 후 감시로 더 넓은 환자와 장기간의 결과를 확인해 왔다.", "Controlled trials have compared benefit and harm, while registries, health records, and post-market surveillance have assessed broader populations and longer-term outcomes."]
    ],
    mechanical: [
      ["지배방정식·축소·불확실성 모형", "Governing, reduced-order, and uncertainty models", "고충실도 물리 모형과 축소 모형을 연결하고 공차·하중·환경의 불확실성을 전파해 설계 한계와 실패 조건을 예측해 왔다.", "High-fidelity physics and reduced-order models have been linked while tolerance, load, and environmental uncertainties were propagated to predict design limits and failure conditions."],
      ["시험설비와 하드웨어 폐루프", "Test facilities and hardware-in-the-loop", "풍동·진동·열·피로 시험과 하드웨어-인-더-루프를 이용해 센서, 제어기와 구조가 예외 상황에서 어떻게 상호작용하는지 검증해 왔다.", "Wind-tunnel, vibration, thermal, fatigue, and hardware-in-the-loop tests have examined how sensors, controllers, and structures interact in off-nominal conditions."],
      ["통합 시제품과 현장 실증", "Integrated prototypes and field demonstration", "부분품에서 통합 시제품으로 단계적으로 확장하고 반복 운용·고장 주입·인증 시험으로 안전성과 정비 가능성을 평가해 왔다.", "Programs have scaled from components to integrated prototypes and used repeated operation, fault injection, and qualification tests to evaluate safety and maintainability."]
    ],
    cognitive: [
      ["계산 이론과 판별 과제", "Computational theories and discriminating tasks", "인지 과정을 명시적 계산 모형으로 만들고 경쟁 이론이 다른 행동 패턴을 예측하는 과제를 설계해 왔다.", "Cognitive processes have been cast as explicit computational models, with tasks designed so competing theories predict different behavioral patterns."],
      ["뇌·생리 측정과 인과 교란", "Brain and physiological measurement with causal perturbation", "뇌영상, 전기생리, 안구·자율신경 측정과 자극·약리·병변 자료를 결합해 상관된 신호와 필수 기전을 구분해 왔다.", "Neuroimaging, electrophysiology, ocular and autonomic measures, stimulation, pharmacology, and lesion evidence have been combined to distinguish correlated signals from necessary mechanisms."],
      ["장기·다기관·교차문화 재현", "Longitudinal, multisite, and cross-cultural replication", "발달과 개인 내 변화를 추적하고 여러 기관·언어·문화에서 동일한 과제와 측정 불변성을 시험해 일반화 범위를 확인해 왔다.", "Development and within-person change have been tracked while common tasks and measurement invariance were tested across sites, languages, and cultures to assess generalizability."]
    ],
    agriculture: [
      ["유전체·육종·생리 모형", "Genomics, breeding, and physiological models", "유전 변이와 형질을 연결하고 작물·가축 생리 모형과 선택 실험을 결합해 다형질 개선의 가능 범위를 탐색해 왔다.", "Genetic variation has been linked to traits while physiological models and selection experiments explored the feasible range of multi-trait improvement."],
      ["통제 포장·온실·미생물 실험", "Controlled field, greenhouse, and microbiome experiments", "물·영양·병원체·관리 조건을 조절하고 토양·식물·동물 미생물군을 교란해 생산성과 회복탄력성의 원인을 시험해 왔다.", "Water, nutrients, pathogens, and management have been controlled while soil, plant, and animal microbiomes were perturbed to test causes of productivity and resilience."],
      ["다환경 농장시험과 전과정 평가", "Multi-environment farm trials and life-cycle assessment", "여러 지역·계절·경영 조건의 시험에서 수량, 품질, 비용과 환경 영향을 함께 측정해 실험실 성과의 현장 지속성을 평가해 왔다.", "Trials across regions, seasons, and management systems have jointly measured yield, quality, cost, and environmental impact to test whether laboratory gains persist in practice."]
    ],
    social: [
      ["인과·게임·네트워크 모형", "Causal, game-theoretic, and network models", "행위자, 제도와 상호작용을 명시한 모형으로 가능한 메커니즘을 정리하고 관측 자료에서 구별할 수 있는 함의를 도출해 왔다.", "Models with explicit agents, institutions, and interactions have organized possible mechanisms and derived implications that can be distinguished in observed data."],
      ["자연실험과 연결 행정자료", "Natural experiments and linked administrative data", "정책·규칙·충격의 시공간 차이와 대규모 행정·거래 자료를 이용해 단순 상관보다 강한 인과 추정을 시도해 왔다.", "Variation in policies, rules, and shocks, together with large linked administrative and transaction data, has supported causal estimates stronger than simple association."],
      ["현장 개입·에이전트 모의·재현", "Field interventions, agent simulation, and replication", "무작위 또는 단계적 정책 개입과 에이전트 기반 모의를 비교하고 다른 지역·시기에 반복해 효과의 이질성과 일반화 한계를 평가해 왔다.", "Randomized or phased policy interventions have been compared with agent-based simulations and repeated across places and periods to assess heterogeneous effects and limits to generalization."]
    ]
  };

  const recent = {
    physics: [
      ["다중신호·고정밀 데이터 결합", "Multimessenger and high-precision data fusion", "서로 다른 검출기와 관측창의 자료를 공동 분석하고 체계오차를 공유 모형으로 다뤄 약한 신호의 신뢰도를 높이는 흐름이다.", "Data from distinct detectors and observational windows are being jointly analyzed, with shared models of systematic error used to strengthen weak-signal claims."],
      ["가속 시뮬레이션과 시뮬레이션 기반 추론", "Accelerated simulation and simulation-based inference", "미분 가능한 계산, 대리모형과 생성형 추론을 물리 제약과 결합해 고차원 매개변수 공간을 더 빠르게 탐색하는 흐름이다.", "Differentiable computation, surrogate models, and generative inference are being combined with physical constraints to explore high-dimensional parameter spaces faster."],
      ["차세대 검출기·양자센서·공동 시험장", "Next-generation detectors, quantum sensors, and shared testbeds", "더 낮은 잡음과 새로운 대역을 겨냥한 센서, 극저온·우주·지하 시설과 공개 시험장을 통해 기존 장비가 보지 못한 영역을 여는 흐름이다.", "Lower-noise sensors, new bands, cryogenic, space, and underground facilities, and shared testbeds aim to open regimes inaccessible to existing instruments."]
    ],
    chemistry: [
      ["오페란도·시간분해 다중분광", "Operando, time-resolved multimodal spectroscopy", "실제 작동 조건에서 구조·조성·전자상태와 생성물을 동시에 시간분해해 정적인 사후 분석이 놓친 반응 경로를 찾는 흐름이다.", "Structure, composition, electronic state, and products are being resolved together under working conditions to reveal pathways missed by static post-mortem analysis."],
      ["AI·로봇을 이용한 자율 실험", "AI- and robotics-enabled autonomous experimentation", "문헌·계산에서 후보를 제안하고 로봇 합성·분석 결과를 다시 학습하는 능동학습 폐루프로 탐색 비용을 줄이는 흐름이다.", "Active-learning loops now propose candidates from literature and computation, run robotic synthesis and analysis, and learn from results to reduce search cost."],
      ["제일원리–반응기–공정 다중규모 연결", "Ab initio-to-reactor multiscale coupling", "전자 수준의 에너지 지형을 미세반응망, 전달 현상과 공정 모형까지 이어 실제 조건의 선택성과 안정성을 예측하려는 흐름이다.", "Electronic energy landscapes are being connected to microkinetic networks, transport, and process models to predict selectivity and stability under realistic conditions."]
    ],
    biology: [
      ["단일세포·공간 다중오믹스 지도", "Single-cell and spatial multi-omics atlases", "세포의 위치, 계보와 여러 분자층을 동시에 측정해 희귀 상태와 조직 미세환경의 상호작용을 해상도 높게 복원하는 흐름이다.", "Cell location, lineage, and multiple molecular layers are being measured together to resolve rare states and tissue-microenvironment interactions at higher resolution."],
      ["CRISPR 대규모 인과 스크린", "Large-scale CRISPR causal screens", "유전자·조절요소를 조합적으로 교란하고 단일세포 판독과 결합해 연관성 목록을 인과 회로로 바꾸려는 흐름이다.", "Combinatorial perturbation of genes and regulatory elements is being paired with single-cell readouts to turn association lists into causal circuits."],
      ["구조·생성 AI와 종단 생물지도", "Structural and generative AI with longitudinal atlases", "단백질·세포 상태의 예측·설계 모형을 장기 추적 자료와 실험 검증에 연결해 새로운 가설을 빠르게 순환시키는 흐름이다.", "Predictive and generative models of proteins and cell states are being linked to longitudinal data and experimental validation to cycle hypotheses faster."]
    ],
    materials: [
      ["물리 제약 AI와 폐루프 재료발견", "Physics-aware AI and closed-loop materials discovery", "물리 제약을 넣은 기초·생성 모형이 후보를 제안하고 합성·특성평가 결과로 다시 갱신되는 폐루프를 구축하는 흐름이다.", "Physics-constrained foundation and generative models are proposing candidates and updating from synthesis and characterization in closed loops."],
      ["싱크로트론·중성자·현장 다중모달 분석", "Synchrotron, neutron, and in-situ multimodal analysis", "작동 중 구조, 화학상태, 변형과 열화를 여러 길이·시간 척도에서 동시에 측정해 기능의 실제 기원을 찾는 흐름이다.", "Structure, chemical state, strain, and degradation are being measured during operation across length and time scales to identify the true origin of function."],
      ["디지털 트윈·자율 실험실·파일럿 연계", "Digital twins, autonomous laboratories, and pilot linkage", "계산–로봇 실험–공정 데이터–수명 시험을 연결해 발견 단계에서 제조 가능성과 열화를 함께 최적화하는 흐름이다.", "Computation, robotic experiments, process data, and lifetime testing are being linked so manufacturability and degradation can be optimized during discovery."]
    ],
    semiconductor: [
      ["소자–회로–시스템 공동 최적화", "Device–circuit–system co-optimization", "AI·고성능 컴퓨팅 워크로드를 기준으로 소자, 메모리, 배선, 냉각과 알고리즘을 함께 탐색해 실제 에너지·지연 이득을 평가하는 흐름이다.", "Devices, memory, interconnect, cooling, and algorithms are being explored together against AI and HPC workloads to assess real energy and latency gains."],
      ["칩렛·3D 집적과 첨단 패키징", "Chiplets, 3D integration, and advanced packaging", "서로 다른 공정의 로직·메모리·센서를 짧은 고밀도 연결로 통합하고 열·전력·테스트·표준 인터페이스를 함께 해결하는 흐름이다.", "Logic, memory, and sensors from different processes are being integrated through short dense links while heat, power, test, and standard interfaces are addressed together."],
      ["AI 계측·수율·신뢰성 학습", "AI-enabled metrology, yield, and reliability learning", "공정 중 대용량 계측과 전기 시험을 결함·고장 자료와 연결해 이상을 조기에 찾고 장기 수명을 예측하는 흐름이다.", "High-volume inline metrology and electrical test data are being linked to defect and failure evidence to detect anomalies early and predict long-term lifetime."]
    ],
    mathematics: [
      ["컴퓨터 보조 증명과 대규모 탐색", "Computer-assisted proof and large-scale search", "엄밀한 오차 경계가 있는 계산, SAT·최적화 탐색과 인증서를 이용해 사람이 다루기 어려운 사례 공간을 검증하는 흐름이다.", "Certified numerics, SAT and optimization search, and checkable certificates are being used to verify case spaces too large for unaided human analysis."],
      ["증명 보조기와 형식화 라이브러리", "Proof assistants and formal libraries", "핵심 정리와 배경 이론을 기계 검증 가능한 형태로 축적해 긴 논증의 의존관계와 숨은 전제를 확인하는 흐름이다.", "Core theorems and background theory are being accumulated in machine-checkable form to audit dependencies and hidden assumptions in long arguments."],
      ["대수·기하·확률·계산의 교차", "Bridges among algebra, geometry, probability, and computation", "한 분야의 불변량과 구조를 다른 분야의 언어로 옮겨 기존 접근에서 보이지 않던 제약과 귀납 구조를 찾는 흐름이다.", "Invariants and structures are being translated across fields to expose constraints and inductive patterns invisible to a single established approach."]
    ],
    computer: [
      ["기초·생성 모형과 자기지도 학습", "Foundation and generative models with self-supervision", "대규모 비표지 자료에서 표현을 학습한 뒤 과제별 자료·도구·외부 메모리와 결합해 일반화 범위를 넓히는 흐름이다.", "Representations learned from large unlabeled corpora are being combined with task data, tools, and external memory to broaden generalization."],
      ["형식 검증·강건성·보안의 결합", "Joint formal verification, robustness, and security", "정상 평균 성능뿐 아니라 분포 변화, 적대 공격, 권한 오용과 최악 경우를 함께 시험하고 일부 속성은 증명하려는 흐름이다.", "Systems are being evaluated under distribution shift, adversarial attack, privilege misuse, and worst-case conditions, with selected properties formally proved."],
      ["공개 시험장과 실제 규모 인프라", "Open testbeds and real-scale infrastructure", "모형·알고리즘을 실제 사용자, 네트워크, 로봇과 컴퓨팅 자원에서 장기간 비교할 수 있는 공유 시험장과 평가 규약을 만드는 흐름이다.", "Shared testbeds and evaluation protocols are being built for long-duration comparison of models and algorithms with real users, networks, robots, and compute resources."]
    ],
    earth: [
      ["위성·항공·현장 센서 융합", "Satellite, airborne, and field-sensor fusion", "고빈도 위성, 레이더·라이다, 드론과 지상·해양 센서를 같은 좌표·불확실성 체계로 결합해 관측 공백을 줄이는 흐름이다.", "High-cadence satellites, radar, lidar, drones, and ground and ocean sensors are being fused in common coordinate and uncertainty frameworks to reduce observing gaps."],
      ["고해상도 지구시스템 모형과 자료동화", "High-resolution Earth-system models and data assimilation", "구름·해류·빙권·생태·인간 활동을 더 세밀하게 표현하고 실시간 관측을 동화해 지역 예측과 극한사건 확률을 개선하는 흐름이다.", "Clouds, currents, ice, ecosystems, and human activity are being resolved more finely while real-time observations are assimilated to improve regional forecasts and extreme-event probabilities."],
      ["AI 위험예측과 장기관측망", "AI hazard prediction and sustained observing networks", "물리 모형과 기계학습을 결합하고 표준화된 장기 관측망으로 드문 사건, 복합재난과 느린 변화를 조기에 탐지하는 흐름이다.", "Physics-based models and machine learning are being combined with standardized long-term networks to detect rare events, compound hazards, and slow change earlier."]
    ],
    medicine: [
      ["다중오믹스 코호트와 연합 데이터", "Multi-omics cohorts and federated data", "분자층, 영상, 임상 기록과 생활환경 자료를 장기간 연결하되 기관 간 데이터 이동과 개인정보 위험을 줄이는 분석 체계를 구축하는 흐름이다.", "Molecular, imaging, clinical, and environmental data are being linked longitudinally while federated analysis reduces cross-institution data movement and privacy risk."],
      ["적응형·플랫폼 임상시험", "Adaptive and platform trials", "여러 치료와 환자 하위군을 공통 대조군 아래 평가하고 중간 결과에 따라 배정을 조정해 더 빠르고 정보량 높은 비교를 만드는 흐름이다.", "Multiple therapies and patient subgroups are being evaluated against shared controls, with allocations adapted to interim evidence for faster, more informative comparisons."],
      ["디지털 바이오마커·AI의 전향 검증", "Prospective validation of digital biomarkers and AI", "웨어러블·영상·임상 AI를 실제 진료 흐름에 넣고 사전에 정한 결과, 안전성, 편향과 임상 유용성을 전향적으로 시험하는 흐름이다.", "Wearable, imaging, and clinical AI systems are being placed in real care pathways and prospectively tested for prespecified outcomes, safety, bias, and clinical utility."]
    ],
    mechanical: [
      ["디지털 트윈과 하드웨어-인-더-루프", "Digital twins and hardware-in-the-loop", "센서 자료로 운용 중 모형을 갱신하고 실제 제어기·구동기를 가상 환경과 연결해 고장과 극한 조건을 안전하게 시험하는 흐름이다.", "Operational sensor data update models while real controllers and actuators connect to virtual environments for safe testing of faults and extremes."],
      ["자율 로봇과 폐루프 제어", "Autonomous robotics and closed-loop control", "학습 기반 인지·계획을 물리 제약, 안전 필터와 실시간 상태 추정에 결합해 불확실한 환경에서의 견고성을 높이는 흐름이다.", "Learning-based perception and planning are being combined with physical constraints, safety filters, and real-time state estimation for robustness in uncertain environments."],
      ["첨단 제조와 현장 자격검증", "Advanced manufacturing and field qualification", "적층·복합재·현장 제조 부품을 비파괴검사, 디지털 공정 이력과 반복 운용 시험에 연결해 인증 가능한 신뢰성을 확보하는 흐름이다.", "Additive, composite, and in-situ manufactured parts are being linked to nondestructive inspection, digital process histories, and repeated operation to establish certifiable reliability."]
    ],
    cognitive: [
      ["대규모 다기관 종단 코호트", "Large multisite longitudinal cohorts", "동일한 행동·뇌·환경 측정을 발달과 노화에 걸쳐 반복하고 표본 대표성과 측정 불변성을 점검하는 흐름이다.", "Common behavioral, brain, and environmental measures are being repeated across development and aging while sampling representativeness and measurement invariance are audited."],
      ["계산인지 모형과 다중모달 뇌자료", "Computational cognitive models with multimodal brain data", "과제 수준의 계산 변수와 영상·전기생리·생리 신호를 개인 수준에서 연결해 설명과 예측을 동시에 평가하는 흐름이다.", "Task-level computational variables are being linked to imaging, electrophysiology, and physiology within individuals to test explanation and prediction together."],
      ["모바일 측정과 인과적 미세개입", "Mobile sensing and causal micro-interventions", "스마트폰·웨어러블로 일상 맥락을 촘촘히 측정하고 무작위 시점 개입으로 실험실 밖에서 상태 변화의 원인을 시험하는 흐름이다.", "Smartphones and wearables densely measure daily context while randomized-time interventions test causes of state change outside the laboratory."]
    ],
    agriculture: [
      ["고처리량 현장 표현형·원격탐사", "High-throughput field phenotyping and remote sensing", "드론·위성·저가 카메라와 자동 플랫폼으로 생육·스트레스·수량을 반복 측정해 유전형–환경 반응 자료를 확장하는 흐름이다.", "Drones, satellites, low-cost cameras, and automated platforms repeatedly measure growth, stress, and yield to expand genotype–environment response data."],
      ["유전체 편집·팬유전체·미생물군", "Genome editing, pangenomes, and microbiomes", "다양한 유전자원을 팬유전체로 정리하고 정밀 편집과 미생물군 조절을 결합해 복합 형질의 인과 요인을 검증하는 흐름이다.", "Diverse genetic resources are organized as pangenomes, while precision editing and microbiome manipulation test causal drivers of complex traits."],
      ["리빙랩·디지털 농업·다환경 시험", "Living labs, digital agriculture, and multi-environment trials", "농가와 함께 센서·예측·의사결정을 운영하고 여러 토양·기후·경영 조건에서 경제성과 지속가능성을 동시에 비교하는 흐름이다.", "Sensors, forecasts, and decisions are being operated with farmers while economics and sustainability are compared across soils, climates, and management systems."]
    ],
    social: [
      ["연결 행정·플랫폼 자료와 개인정보 보호", "Linked administrative and platform data with privacy safeguards", "행정, 거래, 이동과 온라인 자료를 안전하게 연결해 더 세밀한 동학을 보되 대표성·동의·재식별 위험을 함께 평가하는 흐름이다.", "Administrative, transaction, mobility, and online data are being securely linked for finer dynamics while representativeness, consent, and re-identification risks are audited."],
      ["현대적 인과추론과 자연실험", "Modern causal inference and natural experiments", "정책 경계, 단계적 도입과 외생 충격을 활용하고 합성대조·이중강건 추정 등으로 가정 민감도와 이질적 효과를 검증하는 흐름이다.", "Policy boundaries, phased rollouts, and exogenous shocks are being paired with synthetic controls and doubly robust methods to test assumption sensitivity and heterogeneous effects."],
      ["에이전트·네트워크 모의와 사전등록 다기관 연구", "Agent and network simulation with preregistered multisite studies", "미시 행동에서 거시 패턴이 생기는 모의를 실제 개입 자료로 보정하고 여러 장소에서 사전등록된 예측을 시험하는 흐름이다.", "Simulations linking micro behavior to macro patterns are being calibrated with intervention data, then preregistered predictions are tested across sites."]
    ]
  };

  const customEstablished = {
    "UP-121": [
      ["전생물 화학과 선택적 합성", "Prebiotic chemistry and selective synthesis", "초기 지구에서 가능했을 에너지원·광물·대기·습윤–건조 주기를 재현해 핵산·펩타이드·지질 전구체가 함께 농축되고 선택되는 경로를 시험해 왔다.", "Experiments recreating plausible early-Earth energy sources, minerals, atmospheres, and wet–dry cycles have tested routes that jointly concentrate and select nucleic-acid, peptide, and lipid precursors."],
      ["RNA 세계·대사 우선 가설의 경쟁 검증", "Competing RNA-world and metabolism-first tests", "복제·촉매·대사 가운데 무엇이 먼저 자립적 순환을 만들 수 있는지 비교하고, 각 가설이 요구하는 화학적 병목을 실험으로 좁혀 왔다.", "Researchers have compared whether replication, catalysis, or metabolism could first form a self-sustaining cycle and experimentally narrowed the chemical bottlenecks of each hypothesis."],
      ["프로토셀과 비평형 자기조직화", "Protocells and nonequilibrium self-organization", "막 소포, 구획화, 성장·분열과 정보분자의 복제를 한 시스템에 결합해 화학 반응망이 진화 가능한 단위로 전환되는 조건을 탐색해 왔다.", "Membrane vesicles, compartmentalization, growth, division, and information replication have been combined to study when chemical networks become evolvable units."]
    ],
    "UP-346": [
      ["회로 복잡도 하한", "Circuit-complexity lower bounds", "제한된 회로 계층에서 초다항 하한을 증명한 뒤 그 기법을 일반 불 대수 회로로 확장하려는 프로그램이 P≠NP 증명의 핵심 경로로 이어져 왔다.", "A central program proves superpolynomial lower bounds for restricted circuit classes and seeks techniques that extend to general Boolean circuits as a route to P≠NP."],
      ["증명 복잡도와 SAT 하한", "Proof complexity and SAT lower bounds", "명제 증명 체계에서 짧은 증명이 존재하지 않는 공식들을 구성하고, SAT 알고리즘의 시간 하한과 연결해 효율적 증명의 한계를 연구해 왔다.", "Researchers construct formulas lacking short proofs in propositional systems and connect them to SAT time lower bounds to study limits of efficient proof."],
      ["장벽 정리와 우회 전략", "Barrier theorems and routes around them", "상대화, 자연스러운 증명, 대수화 장벽이 왜 넓은 기법군을 막는지 분석하고 비자연적·비상대화·메타복잡도 접근으로 우회하려 해 왔다.", "Relativization, natural-proofs, and algebrization barriers explain why broad technique families fail, motivating non-natural, non-relativizing, and meta-complexity routes."]
    ],
    "UP-632": [
      ["복잡도 기반 양자 분리", "Complexity-based quantum separations", "고전 알고리즘에 대한 조건부·무조건부 하한과 양자 알고리즘의 상한을 비교해 어떤 문제 구조가 근본적 분리를 만드는지 연구해 왔다.", "Conditional and unconditional classical lower bounds have been compared with quantum upper bounds to identify problem structures that yield fundamental separations."],
      ["자원 추정과 오류정정 문턱", "Resource estimation and error-correction thresholds", "논리 큐비트, 게이트, 마법상태, 오류율, 디코딩과 런타임을 끝까지 계산해 형식적 속도향상이 실제 장비 이득으로 남는지 평가해 왔다.", "End-to-end counts of logical qubits, gates, magic states, error rates, decoding, and runtime test whether formal speedups survive on physical hardware."],
      ["고전 기준선과 유용성 벤치마크", "Classical baselines and utility benchmarks", "최적화된 CPU·GPU·텐서망·문제특화 알고리즘과 입출력·전처리 비용까지 포함해 같은 정확도와 에너지 예산에서 양자 실험을 비교해 왔다.", "Quantum experiments have been compared with optimized CPU, GPU, tensor-network, and problem-specific baselines at matched accuracy and energy, including input and preprocessing costs."]
    ]
  };

  const customRecent = {
    "UP-121": [
      ["지구화학적으로 일관된 원팟 반응망", "Geochemically consistent one-pot reaction networks", "서로 양립하지 않는 정제 단계 대신 같은 환경에서 핵산·아미노산·지질 전구체가 함께 생성·선택되는 반응망을 찾는 흐름이다.", "Work increasingly seeks reaction networks that co-produce and select nucleic-acid, amino-acid, and lipid precursors in one plausible environment rather than incompatible purified steps."],
      ["자동화된 장기 비평형 진화 실험", "Automated long-duration nonequilibrium evolution experiments", "로봇 미세유체와 연속 분석으로 수천 회의 환경 주기를 가하고 복제·구획화·선택이 함께 나타나는 드문 전이를 포착하려는 흐름이다.", "Robotic microfluidics and continuous analysis apply thousands of environmental cycles to capture rare transitions where replication, compartmentalization, and selection emerge together."],
      ["행성과학·실험·합성생물학의 통합", "Integration of planetary science, experiments, and synthetic biology", "초기 지구·해양·대기 모형이 허용하는 조건을 실험 입력으로 쓰고 최소세포·인공세포 결과로 생명 전 단계의 판정 기준을 다듬는 흐름이다.", "Early-Earth ocean and atmosphere models now constrain experiments, while minimal and synthetic cells refine criteria for the transition from chemistry to life."]
    ],
    "UP-346": [
      ["메타복잡도와 MCSP", "Meta-complexity and MCSP", "함수 자체의 회로 복잡도를 판정하는 문제를 평균 경우 경도, 의사난수성과 하한 증명에 연결해 기존 장벽을 우회하려는 흐름이다.", "Problems that decide a function's own circuit complexity are being linked to average-case hardness, pseudorandomness, and lower bounds as a route around established barriers."],
      ["알고리즘–하한 변환의 정밀화", "Sharper algorithms-to-lower-bounds connections", "제한된 회로 클래스에 대한 조금 더 빠른 SAT·학습 알고리즘을 새로운 회로 하한으로 변환하는 연결을 더 넓은 모형에 확장하는 흐름이다.", "Slightly faster SAT and learning algorithms for restricted circuit classes are being converted into new lower bounds and extended toward broader models."],
      ["대수·기하적 복잡도와 형식 탐색", "Algebraic-geometric complexity and formal search", "텐서·다항식의 궤도와 불변량, 증명 보조기와 자동 추측 탐색을 결합해 새로운 하한 인증서를 찾는 흐름이다.", "Tensor and polynomial orbits and invariants are being combined with proof assistants and automated conjecture search to seek new lower-bound certificates."]
    ],
    "UP-632": [
      ["오류정정 포함 종단 자원 회계", "End-to-end accounting with error correction", "논리 알고리즘만이 아니라 상태 준비, 오류정정, 디코딩, 통신, 측정과 고전 후처리를 포함한 전체 자원을 공개 비교하는 흐름이다.", "Resource comparisons increasingly include state preparation, error correction, decoding, communication, measurement, and classical post-processing rather than only logical algorithms."],
      ["유용 문제 중심의 검증 가능한 벤치마크", "Verifiable benchmarks centered on useful tasks", "화학·재료·최적화·학습 문제에서 정답 또는 품질을 독립 검증할 수 있고 강한 고전 기준선이 있는 과제를 설계하는 흐름이다.", "Benchmarks are being designed around chemistry, materials, optimization, and learning tasks whose output quality can be independently verified against strong classical baselines."],
      ["모듈형 하드웨어와 양자–고전 공동 설계", "Modular hardware and quantum–classical co-design", "큐비트 방식, 연결망, 컴파일러, 오류완화·정정과 고전 가속기를 함께 최적화해 특정 워크로드에서 손익분기점을 낮추는 흐름이다.", "Qubit modality, connectivity, compilers, mitigation or correction, and classical accelerators are being co-optimized to lower the break-even point for specific workloads."]
    ]
  };

  const boundaryMethods = [
    ["금지 정리와 하한 증명", "No-go theorems and lower bounds", "보존법칙, 정보이론, 계산복잡도 또는 수학적 불변량으로 어떤 요구가 주어진 전제 아래 성립할 수 없음을 증명해 경계를 세워 왔다.", "Conservation laws, information theory, complexity, and mathematical invariants have been used to prove that a requested outcome cannot hold under stated assumptions."],
    ["사고실험과 극한·반례 구성", "Thought experiments, limiting cases, and counterexamples", "요구를 극단 조건에 적용하거나 모순을 일으키는 구체적 사례를 구성해 직관이 빠뜨린 자원·정보·인과 제약을 드러내 왔다.", "Applying demands to limiting cases or constructing explicit contradictions has exposed resource, information, and causal constraints hidden by intuition."],
    ["전제 완화와 가능 영역 재정의", "Relaxing assumptions and redefining the feasible region", "정확성, 시간, 에너지, 정보 접근 또는 보편성 요구를 하나씩 완화해 무엇을 포기하면 근사적·조건부 해법이 가능한지 연구해 왔다.", "Accuracy, time, energy, information access, or universality assumptions have been relaxed one at a time to determine which approximate or conditional goals remain feasible."]
  ];

  const boundaryRecent = [
    ["자원 인식형 정밀 하한", "Resource-aware sharper lower bounds", "시간·메모리·에너지·통신·표본 수를 함께 세는 더 현실적인 모형에서 불가능 경계와 절충 곡선을 정밀화하는 흐름이다.", "Impossibility boundaries and tradeoff curves are being sharpened in realistic models that jointly count time, memory, energy, communication, and samples."],
    ["기계 검증 가능한 경계 증명", "Machine-checkable boundary proofs", "복잡한 금지 정리와 인증서를 증명 보조기 또는 독립 검증 코드로 확인해 숨은 전제와 구현 오류를 줄이는 흐름이다.", "Complex no-go results and certificates are being checked with proof assistants or independent verification code to reduce hidden assumptions and implementation error."],
    ["근사·확률·제한영역 해법의 지도화", "Mapping approximate, probabilistic, and restricted solutions", "보편적·완전한 해법 대신 허용 오차, 성공 확률과 입력 영역을 명시해 이론적 금지와 실용적으로 유용한 목표 사이를 지도화하는 흐름이다.", "Rather than demand universal exact solutions, work specifies error, success probability, and input regimes to map the space between theoretical prohibition and useful restricted goals."]
  ];

  function sourceFor(problem, index) {
    const ids = problem.sourceIds || [];
    return ids[index % ids.length];
  }

  function attempt(entry, problem, index, isRecent) {
    const discipline = meta.disciplines[problem.discipline];
    const sourceId = sourceFor(problem, index);
    const focusKo = problem.nature === "boundary"
      ? `이 경계 사례에서는 ‘${problem.question}’의 전제와 자원 범위를 명시하는 데 적용된다.`
      : `${problem.subfield}의 ‘${problem.question}’을 판별 가능한 하위 질문으로 좁히는 데 적용된다.`;
    const focusEn = problem.nature === "boundary"
      ? `For this boundary case, it is applied by making the assumptions and resource scope of “${problem.questionEn}” explicit.`
      : `For ${problem.subfieldEn}, it is applied by narrowing “${problem.questionEn}” into discriminating subquestions.`;
    return {
      title: entry[0],
      titleEn: entry[1],
      description: `${entry[2]} ${focusKo}`,
      descriptionEn: `${entry[3]} ${focusEn}`,
      period: isRecent ? "2023–2026 연구 흐름" : "축적된 핵심 접근",
      periodEn: isRecent ? "2023–2026 direction" : "Established approach",
      sourceId,
      discipline: discipline.label,
      disciplineEn: discipline.labelEn
    };
  }

  function buildOverview(problem) {
    const discipline = meta.disciplines[problem.discipline];
    const importance = meta.importance[problem.importance];
    const sourceNames = (problem.sourceIds || []).map(id => sources[id]?.title).filter(Boolean).slice(0, 3);
    const evidenceKo = sourceNames.length
      ? `수록과 연구 방향의 근거는 ${sourceNames.join(" · ")}의 문제 목록·연구 프로그램·로드맵이며, 아래 시도는 개별 논문 3편을 뜻하기보다 이 근거들에서 반복되는 대표 연구축을 요약한다.`
      : "아래 시도는 단일 논문 목록이 아니라 이 분야에서 반복되어 온 대표 연구축을 요약한다.";
    const evidenceEn = sourceNames.length
      ? `Catalog inclusion and research directions are grounded in the problem lists, programs, or roadmaps of ${sourceNames.join(" · ")}; the attempts below summarize recurring research programs rather than claiming to be three exhaustive papers.`
      : "The attempts below summarize recurring research programs rather than an exhaustive three-paper bibliography.";
    const criterionKo = /[.!?]$/.test(problem.solvedWhen) ? problem.solvedWhen : `${problem.solvedWhen}.`;
    const criterionEn = /[.!?]$/.test(problem.solvedWhenEn) ? problem.solvedWhenEn : `${problem.solvedWhenEn}.`;
    const resolutionKo = problem.nature === "boundary"
      ? `경계를 바꾸려면 적용한 전제 가운데 무엇이 실제 세계에서 성립하지 않는지 보이거나, 요구 조건을 완화한 새로운 문제를 정의해야 한다. 현재 분류에서의 판정 기준은 다음과 같다: ${criterionKo}`
      : `해결 주장은 한 데이터셋이나 한 시제품의 성과만으로는 충분하지 않다. 이 카탈로그가 사용하는 판정 기준은 다음과 같다: ${criterionKo}`;
    const resolutionEn = problem.nature === "boundary"
      ? `Changing the boundary would require showing which stated assumption fails in the real setting, or defining a new problem with relaxed demands. The present catalog criterion is: ${criterionEn}`
      : `A claim of resolution cannot rest on one dataset or one prototype alone. This catalog uses the following criterion: ${criterionEn}`;

    return {
      overview: `‘${problem.question}’이라는 질문은 ${discipline.label}의 ${problem.subfield}에서 다루는 ${importance.label}다. ${problem.whyOpen} ${disciplineLens[problem.discipline][0]} ${natureLens[problem.nature][0]} ${approachLens[problem.approach][0]} ${resolutionKo} ${evidenceKo}`,
      overviewEn: `“${problem.questionEn}” is a ${importance.labelEn.toLowerCase()} in ${problem.subfieldEn}, within ${discipline.labelEn}. ${problem.whyOpenEn} ${disciplineLens[problem.discipline][1]} ${natureLens[problem.nature][1]} ${approachLens[problem.approach][1]} ${resolutionEn} ${evidenceEn}`
    };
  }

  for (const problem of problems) {
    const overview = buildOverview(problem);
    const established = customEstablished[problem.id] || (problem.nature === "boundary" ? boundaryMethods : methods[problem.discipline]);
    const current = customRecent[problem.id] || (problem.nature === "boundary" ? boundaryRecent : recent[problem.discipline]);
    problem.overview = overview.overview;
    problem.overviewEn = overview.overviewEn;
    problem.importantAttempts = established.map((entry, index) => attempt(entry, problem, index, false));
    problem.recentAttempts = current.map((entry, index) => attempt(entry, problem, index, true));
    problem.researchContextReviewedOn = "2026-08-02";
  }

  window.RESEARCH_CONTEXT_META = {
    version: "2026-08-02",
    scope: "3 established research programs and 3 current directions per catalog entry",
    scopeKo: "각 항목당 대표적 해결 시도 3개와 2023–2026 최근 연구 방향 3개"
  };
})();
