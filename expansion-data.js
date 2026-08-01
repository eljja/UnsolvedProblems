/* Additional disciplines and cross-disciplinary themes. */
(function () {
  "use strict";

  const meta = window.CATALOG_META;
  const sources = window.CATALOG_SOURCES;
  const problems = window.PROBLEMS;

  Object.assign(meta.disciplines, {
    mathematics: { label: "수학·통계학", labelEn: "Mathematics & Statistics", color: "#675c9c", soft: "#e6e0f0" },
    computer: { label: "컴퓨터과학·AI", labelEn: "Computer Science & AI", color: "#327f88", soft: "#d9eaeb" },
    earth: { label: "지구·환경과학", labelEn: "Earth & Environmental Science", color: "#638d3d", soft: "#e1ead7" },
    medicine: { label: "의학·보건과학", labelEn: "Medicine & Health", color: "#c4536a", soft: "#f2dce1" },
    mechanical: { label: "기계·항공·로봇", labelEn: "Mechanical, Aerospace & Robotics", color: "#5e7391", soft: "#dfe5ec" },
    cognitive: { label: "인지과학·심리학", labelEn: "Cognitive Science & Psychology", color: "#a86689", soft: "#eddfe7" },
    agriculture: { label: "농업·식품과학", labelEn: "Agriculture & Food Science", color: "#a77d2f", soft: "#eee5d2" },
    social: { label: "사회·경제·복잡계", labelEn: "Social, Economic & Complex Systems", color: "#84664f", soft: "#e9e0da" }
  });

  meta.themes = {
    energy: { label: "에너지", labelEn: "Energy", color: "#d18433" },
    space: { label: "우주", labelEn: "Space", color: "#5269a4" },
    quantum: { label: "양자", labelEn: "Quantum", color: "#7656a6" },
    climate: { label: "기후", labelEn: "Climate", color: "#4f8ba0" },
    ai: { label: "AI", labelEn: "AI", color: "#3a8a77" },
    sustainability: { label: "지속가능성", labelEn: "Sustainability", color: "#6f913f" },
    health: { label: "건강", labelEn: "Health", color: "#bd596d" },
    security: { label: "안전·보안", labelEn: "Safety & Security", color: "#9a5a45" }
  };

  Object.assign(sources, {
    clay_math: { discipline: "mathematics", title: "Clay Mathematics Institute — Millennium Problems", url: "https://www.claymath.org/millennium-problems/" },
    aim_math: { discipline: "mathematics", title: "American Institute of Mathematics — Problem Lists", url: "https://aimath.org/problemlists/" },
    nsf_math: { discipline: "mathematics", title: "NSF Division of Mathematical Sciences", url: "https://www.nsf.gov/mps/dms" },

    nsf_cise: { discipline: "computer", title: "NSF — Computer and Information Science and Engineering", url: "https://www.nsf.gov/cise" },
    nitrd_ai: { discipline: "computer", title: "NITRD — Artificial Intelligence R&D", url: "https://www.nitrd.gov/coordination-areas/ai/" },
    nist_ai: { discipline: "computer", title: "NIST — AI Risk Management Framework", url: "https://www.nist.gov/itl/ai-risk-management-framework" },
    nist_cyber: { discipline: "computer", title: "NIST — Cybersecurity Framework", url: "https://www.nist.gov/cyberframework" },

    nas_esas: { discipline: "earth", title: "National Academies — Earth Science Decadal Survey 2028–2037", url: "https://www.nationalacademies.org/projects/CAST-ASA-26-03/about" },
    doe_eess: { discipline: "earth", title: "DOE — Earth and Environmental Systems Sciences", url: "https://ess.science.energy.gov/eessd-strategic-plan/" },
    noaa_research: { discipline: "earth", title: "NOAA Research", url: "https://research.noaa.gov/" },
    usgs_hazards: { discipline: "earth", title: "USGS — Natural Hazards", url: "https://www.usgs.gov/mission-areas/natural-hazards/programs" },

    who_research: { discipline: "medicine", title: "WHO — Research for Health", url: "https://www.who.int/our-work/science-division/research-for-health" },
    nih_common: { discipline: "medicine", title: "NIH Common Fund", url: "https://commonfund.nih.gov/" },
    nci_research: { discipline: "medicine", title: "National Cancer Institute — Research", url: "https://www.cancer.gov/research" },
    niaid_research: { discipline: "medicine", title: "NIAID — Research", url: "https://www.niaid.nih.gov/research" },

    nasa_armd: { discipline: "mechanical", title: "NASA — Aeronautics Research Mission Directorate", url: "https://www.nasa.gov/directorates/armd/" },
    nasa_autonomy: { discipline: "mechanical", title: "NASA — Autonomy Verification & Validation Roadmap", url: "https://ntrs.nasa.gov/citations/20230003734" },
    nist_manufacturing: { discipline: "mechanical", title: "NIST — Smart Manufacturing", url: "https://www.nist.gov/topics/smart-manufacturing" },
    doe_manufacturing: { discipline: "mechanical", title: "DOE — Advanced Materials and Manufacturing Technologies", url: "https://www.energy.gov/eere/ammto/advanced-materials-and-manufacturing-technologies-office" },

    brain_priorities: { discipline: "cognitive", title: "NIH BRAIN Initiative — Priority Areas", url: "https://www.braininitiative.nih.gov/vision/priority-areas" },
    nimh_plan: { discipline: "cognitive", title: "NIMH — Strategic Plan for Research", url: "https://www.nimh.nih.gov/about/strategic-planning-reports/accomplishing-the-mission" },
    nsf_bcs: { discipline: "cognitive", title: "NSF — Behavioral and Cognitive Sciences", url: "https://www.nsf.gov/sbe/bcs" },
    nidcd_research: { discipline: "cognitive", title: "NIDCD — Research", url: "https://www.nidcd.nih.gov/research" },

    fao_framework: { discipline: "agriculture", title: "FAO — Strategic Framework for Agrifood Systems", url: "https://www.fao.org/climate-change/what-we-do/fao-strategic-framework/en" },
    usda_nifa: { discipline: "agriculture", title: "USDA NIFA — Topics", url: "https://www.nifa.usda.gov/topics" },
    usda_ars: { discipline: "agriculture", title: "USDA Agricultural Research Service", url: "https://www.ars.usda.gov/research/" },
    cgiar: { discipline: "agriculture", title: "CGIAR — Research Portfolio", url: "https://www.cgiar.org/research/cgiar-portfolio/" },

    nsf_sbe: { discipline: "social", title: "NSF — Social, Behavioral and Economic Sciences", url: "https://www.nsf.gov/sbe/about" },
    nsf_ses: { discipline: "social", title: "NSF — Social and Economic Sciences", url: "https://www.nsf.gov/sbe/ses" },
    nas_dbasse: { discipline: "social", title: "National Academies — Behavioral and Social Sciences and Education", url: "https://www.nationalacademies.org/dbasse/division-of-behavioral-and-social-sciences-and-education" },
    worldbank_research: { discipline: "social", title: "World Bank — Research", url: "https://www.worldbank.org/en/research" }
  });

  const defaults = {
    fundamental: {
      ko: "경쟁하는 설명이 남아 있거나 핵심 원리를 판별할 충분한 증거가 없다.",
      en: "Competing explanations remain, or evidence is insufficient to identify the governing principle.",
      solvedKo: "하나의 설명이 독립적인 증거를 정량적으로 예측하고 대안을 구별해야 한다.",
      solvedEn: "A solution must make quantitative, independently confirmed predictions that distinguish it from alternatives."
    },
    prediction: {
      ko: "상호작용과 자유도가 많아 현재 모형이 새로운 조건에서 안정적인 예측을 하지 못한다.",
      en: "Many interacting degrees of freedom prevent current models from predicting reliably in new conditions.",
      solvedKo: "훈련이나 보정 범위 밖에서도 사전 예측이 반복적으로 검증되어야 한다.",
      solvedEn: "Predictions must be repeatedly validated outside the data or conditions used for calibration."
    },
    measurement: {
      ko: "필요한 신호·기록·해상도가 부족하거나 측정 자체가 대상에 영향을 준다.",
      en: "The necessary signal, record, or resolution is missing, or measurement itself perturbs the target.",
      solvedKo: "독립된 측정법들이 필요한 감도와 해상도로 같은 결과를 재현해야 한다.",
      solvedEn: "Independent methods must reproduce the same result at the required sensitivity and resolution."
    },
    scale: {
      ko: "작은 규모의 성과가 변동성·비용·결함 때문에 현실 규모에서 유지되지 않는다.",
      en: "Small-scale success does not survive real-world variability, cost, and defects.",
      solvedKo: "현실적인 규모에서 성능·수명·비용 목표가 함께 재현되어야 한다.",
      solvedEn: "Performance, lifetime, and cost targets must be reproduced together at realistic scale."
    },
    system: {
      ko: "개별 요소의 개선이 다른 목표를 악화시켜 전체 조건을 만족하는 설계가 없다.",
      en: "Improving one component degrades another objective, leaving no validated whole-system design.",
      solvedKo: "전체 시스템 경계를 포함한 시험에서 안전성·성능·비용 목표를 동시에 달성해야 한다.",
      solvedEn: "A complete system must meet safety, performance, and cost targets in representative tests."
    },
    boundary: {
      ko: "계산가능성, 정보 부족 또는 물리·논리 법칙이 절대적인 요구를 금지한다.",
      en: "Computability, missing information, or established physical or logical laws forbid the absolute demand.",
      solvedKo: "불가능성의 전제를 명시하고 달성 가능한 제한형 문제와 하한을 제시해야 한다.",
      solvedEn: "The assumptions behind the impossibility must be stated, together with achievable restricted versions and bounds."
    }
  };

  let nextId = Math.max(...problems.map(item => Number(item.id.slice(3)))) + 1;
  const added = [];
  function BG(discipline, subfield, subfieldEn, approach, nature, feasibility, sourceIds, items, themes = []) {
    const base = defaults[nature];
    items.forEach(item => {
      const [question, questionEn, itemThemes] = item;
      added.push({
        id: `UP-${String(nextId++).padStart(3, "0")}`,
        question,
        questionEn,
        discipline,
        subfield,
        subfieldEn,
        approach,
        nature,
        feasibility,
        sourceIds,
        themes: itemThemes || themes,
        whyOpen: base.ko,
        whyOpenEn: base.en,
        solvedWhen: base.solvedKo,
        solvedWhenEn: base.solvedEn
      });
    });
  }

  BG("mathematics", "수론", "Number Theory", "theory", "fundamental", "open", ["clay_math", "aim_math"], [
    ["리만 가설은 참인가?", "Is the Riemann hypothesis true?"],
    ["버치–스위너턴다이어 추측은 모든 타원곡선에 성립하는가?", "Does the Birch–Swinnerton-Dyer conjecture hold for every elliptic curve?"],
    ["쌍둥이 소수는 무한히 많은가?", "Are there infinitely many twin primes?"],
    ["2보다 큰 모든 짝수는 두 소수의 합인가?", "Is every even integer greater than two the sum of two primes?"]
  ]);
  BG("mathematics", "대수·대수기하", "Algebra & Algebraic Geometry", "theory", "fundamental", "open", ["clay_math", "aim_math"], [
    ["호지 추측은 모든 매끄러운 복소 사영다양체에 성립하는가?", "Does the Hodge conjecture hold for every smooth complex projective variety?"],
    ["모든 유한군은 유리수체 위 갈루아 군으로 나타나는가?", "Does every finite group occur as a Galois group over the rational numbers?"],
    ["야코비안 추측은 모든 차원에서 참인가?", "Is the Jacobian conjecture true in every dimension?"],
    ["디오판토스 방정식의 유리점 존재를 판정하는 통일 이론이 있는가?", "Is there a unified theory deciding the existence of rational points on Diophantine equations?"]
  ]);
  BG("mathematics", "기하·위상수학", "Geometry & Topology", "theory", "fundamental", "open", ["aim_math", "nsf_math"], [
    ["매끄러운 4차원 푸앵카레 추측은 참인가?", "Is the smooth four-dimensional Poincaré conjecture true?"],
    ["4차원 다양체의 매끄러운 구조를 완전히 분류할 수 있는가?", "Can smooth structures on four-manifolds be completely classified?"],
    ["쌍곡매듭의 부피와 양자 불변량을 잇는 부피 추측은 참인가?", "Is the volume conjecture linking hyperbolic knots and quantum invariants true?"],
    ["양의 단면곡률을 갖는 다양체를 분류할 수 있는가?", "Can manifolds with positive sectional curvature be classified?"]
  ]);
  BG("mathematics", "해석·편미분방정식", "Analysis & Partial Differential Equations", "theory", "prediction", "open", ["clay_math", "nsf_math"], [
    ["3차원 나비에–스토크스 방정식의 해는 항상 존재하고 매끄러운가?", "Do smooth solutions to the three-dimensional Navier–Stokes equations always exist?"],
    ["3차원 오일러 방정식은 유한 시간에 특이점을 만드는가?", "Can the three-dimensional Euler equations develop a finite-time singularity?"],
    ["비선형 분산방정식의 전역 정칙성을 판정하는 일반 조건은 무엇인가?", "What general conditions determine global regularity for nonlinear dispersive equations?"],
    ["자유경계 문제의 특이점 형성을 보편적으로 분류할 수 있는가?", "Can singularity formation in free-boundary problems be classified universally?"]
  ]);
  BG("mathematics", "확률·동역학", "Probability & Dynamical Systems", "theory", "prediction", "open", ["aim_math", "nsf_math"], [
    ["KPZ 보편성은 어떤 확률 성장계에서 엄밀히 성립하는가?", "For which stochastic growth systems can KPZ universality be proved rigorously?"],
    ["3차원 자기회피 보행의 임계지수를 정확히 결정할 수 있는가?", "Can the critical exponents of the three-dimensional self-avoiding walk be determined exactly?"],
    ["고차원 동역학계의 장기 거동을 유한한 불변량으로 분류할 수 있는가?", "Can long-term behavior of high-dimensional dynamical systems be classified by finitely many invariants?"],
    ["희귀사건 확률을 고차원 비평형계에서 신뢰성 있게 계산할 수 있는가?", "Can rare-event probabilities be computed reliably in high-dimensional nonequilibrium systems?"]
  ]);
  BG("mathematics", "조합론·그래프", "Combinatorics & Graph Theory", "theory", "fundamental", "open", ["aim_math", "nsf_math"], [
    ["하다비거 추측은 모든 그래프에 성립하는가?", "Does Hadwiger's conjecture hold for every graph?"],
    ["에르되시–하이날 추측은 참인가?", "Is the Erdős–Hajnal conjecture true?"],
    ["해바라기 추측의 최적 경계는 무엇인가?", "What is the optimal bound in the sunflower conjecture?"],
    ["정점이 세 개 이상인 모든 유한 그래프는 부분그래프 목록으로 복원되는가?", "Is every finite graph with at least three vertices reconstructible from its vertex-deleted subgraphs?"]
  ]);
  BG("mathematics", "논리·수학기초", "Logic & Foundations", "theory", "fundamental", "open", ["aim_math", "nsf_math"], [
    ["연속체 가설을 판정할 자연스러운 새 공리 체계가 존재하는가?", "Is there a natural new axiom system that decides the continuum hypothesis?"],
    ["큰 기수까지 포괄하는 표준 내부모형 이론을 만들 수 있는가?", "Can a canonical inner-model theory encompassing large cardinals be built?"],
    ["수학적 증명의 의미를 보존하면서 전 분야를 형식화할 수 있는가?", "Can all major areas of mathematics be formalized while preserving the meaning of proofs?"],
    ["유한 조합론에서 독립 명제의 경계를 체계적으로 분류할 수 있는가?", "Can independence phenomena in finite combinatorics be classified systematically?"]
  ]);
  BG("mathematics", "증명가능성의 경계", "Limits of Provability", "theory", "boundary", "impossible", ["clay_math", "nsf_math"], [
    ["모든 산술 명제의 참과 거짓을 항상 끝나게 판정하는 알고리즘이 가능한가?", "Can an algorithm always terminate and decide the truth of every arithmetic statement?"],
    ["산술을 포함하면서 완전하고 모순 없고 재귀적으로 공리화 가능한 형식체계가 존재하는가?", "Can a formal system containing arithmetic be complete, consistent, and recursively axiomatizable?"]
  ]);

  BG("computer", "복잡도·알고리즘", "Complexity & Algorithms", "theory", "fundamental", "open", ["nsf_cise", "clay_math"], [
    ["P와 NP는 서로 같은가?", "Is P equal to NP?"],
    ["안전한 암호에 필요한 일방향 함수는 존재하는가?", "Do one-way functions needed for secure cryptography exist?"],
    ["무작위화를 쓰는 효율적 알고리즘은 항상 결정적 알고리즘으로 대체 가능한가?", "Can every efficient randomized algorithm be replaced by an efficient deterministic one?"],
    ["양자컴퓨터가 고전컴퓨터보다 본질적으로 빠른 문제의 정확한 범위는 무엇인가?", "What is the exact class of problems for which quantum computers are inherently faster than classical ones?"],
  ], ["quantum"]);
  BG("computer", "소프트웨어·분산시스템", "Software & Distributed Systems", "engineering", "system", "open", ["nsf_cise"], [
    ["현실적인 네트워크 장애 아래에서도 확장 가능하고 검증된 합의를 달성할 수 있는가?", "Can scalable, verified consensus be achieved under realistic network failures?"],
    ["수억 줄 규모 소프트웨어의 핵심 동작을 종단 간 형식 검증할 수 있는가?", "Can critical behavior in software with hundreds of millions of lines be verified end to end?"],
    ["대규모 동시성 프로그램의 모든 경쟁 상태를 사전에 검출할 수 있는가?", "Can every race condition in large concurrent programs be detected before deployment?"],
    ["분산시스템이 알려지지 않은 장애에서 스스로 복구하면서 안전성을 유지할 수 있는가?", "Can distributed systems self-recover from unknown failures while preserving safety?"]
  ], ["security"]);
  BG("computer", "암호·사이버보안", "Cryptography & Cybersecurity", "hybrid", "system", "open", ["nist_cyber", "nsf_cise"], [
    ["양자 공격 이후에도 장기간 안전한 암호 가정을 실증적으로 신뢰할 수 있는가?", "Can cryptographic assumptions remain trustworthy for decades after quantum attacks become possible?"],
    ["복잡한 실제 프로토콜의 조합 가능 보안을 증명할 수 있는가?", "Can composable security be proved for complex real-world protocols?"],
    ["성능 저하 없이 모든 부채널을 차단하는 시스템을 만들 수 있는가?", "Can systems block every relevant side channel without prohibitive performance loss?"],
    ["사람이 실수해도 안전한 인증과 권한 시스템을 설계할 수 있는가?", "Can authentication and authorization remain secure despite ordinary human mistakes?"]
  ], ["security", "quantum"]);
  BG("computer", "머신러닝 이론", "Machine Learning Theory", "theory", "prediction", "open", ["nitrd_ai", "nsf_cise"], [
    ["과대매개변수 신경망이 왜 새로운 데이터에 일반화하는가?", "Why do overparameterized neural networks generalize to new data?"],
    ["모델·데이터·계산량의 스케일링 법칙을 원리에서 유도할 수 있는가?", "Can scaling laws for models, data, and compute be derived from first principles?"],
    ["분포 밖 상황에서 실패 여부를 사전에 보증할 수 있는가?", "Can failure under distribution shift be certified before deployment?"],
    ["원인 구조를 스스로 발견하는 표현학습이 가능한가?", "Can representation learning discover causal structure autonomously?"]
  ], ["ai"]);
  BG("computer", "신뢰할 수 있는 AI", "Trustworthy AI", "hybrid", "fundamental", "open", ["nist_ai", "nitrd_ai"], [
    ["대규모 AI의 내부 표현과 추론을 인간이 충실하게 해석할 수 있는가?", "Can humans faithfully interpret the internal representations and reasoning of large AI systems?"],
    ["학습보다 강한 능력을 가진 AI의 목표를 인간 의도와 안정적으로 정렬할 수 있는가?", "Can the goals of AI systems more capable than their trainers remain reliably aligned with human intent?"],
    ["적대적 입력과 전략적 조작에 강건한 학습 시스템을 만들 수 있는가?", "Can learning systems be made robust to adversarial inputs and strategic manipulation?"],
    ["AI가 모르는 것을 알고 보정된 불확실성을 보고하게 할 수 있는가?", "Can AI systems know what they do not know and report calibrated uncertainty?"]
  ], ["ai", "security"]);
  BG("computer", "로봇·체화지능", "Robotics & Embodied Intelligence", "engineering", "system", "open", ["nsf_cise", "nitrd_ai"], [
    ["로봇이 처음 보는 물체를 사람 수준으로 능숙하게 조작할 수 있는가?", "Can robots manipulate unfamiliar objects with human-level dexterity?"],
    ["체화된 에이전트가 물리 세계의 인과 모형을 지속적으로 학습할 수 있는가?", "Can embodied agents continually learn causal models of the physical world?"],
    ["실패 비용이 큰 환경에서 탐색하면서도 안전을 보장할 수 있는가?", "Can an agent explore while guaranteeing safety in environments where failure is costly?"],
    ["수많은 자율 에이전트가 중앙 통제 없이 안정적으로 협력할 수 있는가?", "Can many autonomous agents cooperate stably without centralized control?"]
  ], ["ai", "security"]);
  BG("computer", "네트워크·데이터 인프라", "Networks & Data Infrastructure", "engineering", "scale", "open", ["nsf_cise", "nist_cyber"], [
    ["인터넷 규모의 장애 전파를 실시간 예측하고 차단할 수 있는가?", "Can cascading failures at Internet scale be predicted and contained in real time?"],
    ["개인정보를 노출하지 않으면서 고정밀 통계와 학습을 제공할 수 있는가?", "Can high-accuracy statistics and learning be provided without exposing personal data?"],
    ["세계 규모 데이터 저장에서 일관성·가용성·효율을 동시에 높일 수 있는가?", "Can consistency, availability, and efficiency all be improved in global-scale data storage?"],
    ["계산 수요가 증가해도 정보기술의 총 에너지와 자원 사용을 줄일 수 있는가?", "Can total energy and resource use of information technology fall while computing demand grows?"]
  ], ["security", "sustainability", "energy"]);
  BG("computer", "계산가능성의 경계", "Limits of Computation", "theory", "boundary", "impossible", ["nsf_cise", "clay_math"], [
    ["임의의 프로그램이 멈출지 항상 판정하는 알고리즘을 만들 수 있는가?", "Can an algorithm always decide whether an arbitrary program will halt?"],
    ["임의의 프로그램이 비자명한 의미 속성을 갖는지 항상 판정할 수 있는가?", "Can an algorithm always decide whether an arbitrary program has a nontrivial semantic property?"]
  ]);

  BG("earth", "기후 시스템", "Climate System", "hybrid", "prediction", "open", ["nas_esas", "doe_eess"], [
    ["온실가스가 두 배가 될 때 지구의 평형 기후 민감도는 정확히 얼마인가?", "What is Earth's exact equilibrium climate sensitivity to a doubling of greenhouse gases?"],
    ["구름의 미세물리와 기후 피드백을 정확히 연결할 수 있는가?", "Can cloud microphysics and climate feedbacks be linked accurately?"],
    ["지역별 강수 변화를 수십 년 전에 신뢰성 있게 예측할 수 있는가?", "Can regional precipitation changes be predicted reliably decades ahead?"],
    ["주요 기후 티핑 포인트의 임계값과 가역성은 무엇인가?", "What are the thresholds and reversibility of major climate tipping points?"]
  ], ["climate"]);
  BG("earth", "극한기상·예측", "Extreme Weather & Prediction", "hybrid", "prediction", "open", ["noaa_research", "nas_esas"], [
    ["계절에서 수년 규모의 기후 예측을 지역 수준에서 개선할 수 있는가?", "Can regional climate prediction be improved from seasonal to multi-year timescales?"],
    ["폭염·가뭄·홍수가 결합된 복합재난을 사전에 예측할 수 있는가?", "Can compound disasters involving heat, drought, and flooding be predicted in advance?"],
    ["강한 대류폭풍과 토네이도의 발생 위치를 충분히 일찍 예측할 수 있는가?", "Can the initiation location of severe convective storms and tornadoes be predicted early enough?"],
    ["개별 극한현상에 대한 기후변화의 기여도를 신속하고 정확하게 산정할 수 있는가?", "Can the contribution of climate change to individual extremes be estimated rapidly and accurately?"]
  ], ["climate", "security"]);
  BG("earth", "해양·빙권", "Ocean & Cryosphere", "hybrid", "measurement", "current", ["noaa_research", "nas_esas"], [
    ["대서양 자오선 역전순환은 언제 얼마나 약해질 것인가?", "When and by how much will the Atlantic Meridional Overturning Circulation weaken?"],
    ["남극과 그린란드 빙상의 급격한 붕괴가 시작되는 조건은 무엇인가?", "What conditions trigger rapid collapse of the Antarctic and Greenland ice sheets?"],
    ["지역별 해수면 상승과 극한 수위를 정확히 예측할 수 있는가?", "Can regional sea-level rise and extreme water levels be predicted accurately?"],
    ["해양의 열과 탄소 흡수 능력이 미래에 어떻게 변할 것인가?", "How will the ocean's capacity to absorb heat and carbon change in the future?"]
  ], ["climate"]);
  BG("earth", "고체지구·자연재해", "Solid Earth & Natural Hazards", "hybrid", "prediction", "open", ["usgs_hazards", "nas_esas"], [
    ["큰 지진의 발생 위치·시간·규모를 유용한 정확도로 예측할 수 있는가?", "Can the location, time, and magnitude of large earthquakes be predicted with useful accuracy?"],
    ["맨틀 대류와 판구조 운동을 지질시대 전체에 걸쳐 복원할 수 있는가?", "Can mantle convection and plate motion be reconstructed across geologic time?"],
    ["지구 자기장은 어떻게 생성되고 왜 역전되는가?", "How is Earth's magnetic field generated, and why does it reverse?"],
    ["화산 분화의 전환점과 최종 규모를 실시간 예측할 수 있는가?", "Can volcanic eruption transitions and final magnitude be predicted in real time?"]
  ], ["security"]);
  BG("earth", "물·토지·생태계", "Water, Land & Ecosystems", "hybrid", "prediction", "open", ["doe_eess", "usgs_hazards"], [
    ["고갈되는 지하수의 회복 가능량과 시간을 정확히 추정할 수 있는가?", "Can the recoverable volume and recovery time of depleted groundwater be estimated accurately?"],
    ["토양 탄소가 기후와 토지 이용 변화에 어떻게 반응할 것인가?", "How will soil carbon respond to climate and land-use change?"],
    ["산불 체제의 급격한 변화를 생태·기후·관리 자료로 예측할 수 있는가?", "Can abrupt shifts in wildfire regimes be predicted from ecological, climate, and management data?"],
    ["식생과 대기의 피드백이 지역 수문순환을 어떻게 바꾸는가?", "How do vegetation–atmosphere feedbacks alter regional water cycles?"]
  ], ["climate", "sustainability"]);
  BG("earth", "생지화학·오염", "Biogeochemistry & Pollution", "hybrid", "prediction", "open", ["doe_eess", "noaa_research"], [
    ["영구동토와 습지에서 방출될 탄소와 메탄의 양은 얼마인가?", "How much carbon and methane will be released from permafrost and wetlands?"],
    ["자연 탄소 흡수원이 언제 약화되거나 역전될 것인가?", "When will natural carbon sinks weaken or reverse?"],
    ["에어로졸의 생애주기와 구름 효과를 전 지구적으로 정량화할 수 있는가?", "Can aerosol life cycles and cloud effects be quantified globally?"],
    ["잔류성 오염물질과 미세플라스틱의 장기 행방과 생태 영향을 예측할 수 있는가?", "Can the long-term fate and ecological effects of persistent pollutants and microplastics be predicted?"]
  ], ["climate", "sustainability"]);
  BG("earth", "지구관측·통합모형", "Earth Observation & Integrated Models", "hybrid", "system", "open", ["nas_esas", "noaa_research"], [
    ["관측되지 않은 규모의 과정들을 지구시스템 모형에 정확히 매개화할 수 있는가?", "Can unresolved processes be parameterized accurately in Earth-system models?"],
    ["위성·현장·과거 기록을 편향 없이 하나의 동적 지구 모형에 통합할 수 있는가?", "Can satellite, in-situ, and historical records be integrated into one dynamic Earth model without bias?"],
    ["고기후 기록에서 지역별 극한과 급격한 전환을 복원할 수 있는가?", "Can regional extremes and abrupt transitions be reconstructed from paleoclimate records?"],
    ["도시의 열·물·대기질을 건물 규모부터 지역 기후까지 함께 예측할 수 있는가?", "Can urban heat, water, and air quality be predicted jointly from building to regional scales?"]
  ], ["climate", "ai", "sustainability"]);
  BG("earth", "예측과 기록의 경계", "Limits of Prediction & Records", "theory", "boundary", "impossible", ["noaa_research", "usgs_hazards"], [
    ["초기상태를 유한 정밀도로만 알면서 먼 미래의 정확한 날씨를 무기한 예측할 수 있는가?", "Can exact weather be predicted indefinitely when the initial state is known only to finite precision?"],
    ["아무 기록도 남지 않은 과거 지구의 모든 국소 상태를 유일하게 복원할 수 있는가?", "Can every local state of Earth's unrecorded past be reconstructed uniquely?"]
  ], ["climate"]);

  BG("medicine", "암", "Cancer", "hybrid", "fundamental", "open", ["nci_research", "nih_common"], [
    ["암 전이를 시작하고 특정 장기에 정착하게 하는 보편 원리는 무엇인가?", "What general principles initiate cancer metastasis and determine organ colonization?"],
    ["종양이 치료 저항성을 획득하기 전에 예측하고 차단할 수 있는가?", "Can treatment resistance be predicted and blocked before a tumor acquires it?"],
    ["증상이 나타나기 전에 치명적 암을 과잉진단 없이 검출할 수 있는가?", "Can lethal cancers be detected before symptoms without harmful overdiagnosis?"],
    ["종양 내부의 진화와 미세환경을 환자별 치료에 실시간 반영할 수 있는가?", "Can intratumor evolution and microenvironment be incorporated into patient-specific treatment in real time?"]
  ], ["health"]);
  BG("medicine", "감염병·항생제 내성", "Infectious Disease & Antimicrobial Resistance", "hybrid", "prediction", "open", ["niaid_research", "who_research"], [
    ["동물 병원체가 사람 사이에서 확산할 시점을 사전에 예측할 수 있는가?", "Can we predict when an animal pathogen will become capable of sustained human transmission?"],
    ["항생제 내성의 진화를 치료와 공중보건 개입으로 장기간 억제할 수 있는가?", "Can antimicrobial resistance evolution be suppressed long term through treatment and public-health interventions?"],
    ["빠르게 변이하는 바이러스에 광범위하고 오래가는 백신을 만들 수 있는가?", "Can broadly protective, durable vaccines be made for rapidly evolving viruses?"],
    ["급성 감염 뒤 장기 증후군이 남는 원인과 치료 표적은 무엇인가?", "What causes post-acute infection syndromes, and what are their treatment targets?"]
  ], ["health", "security"]);
  BG("medicine", "신경·정신질환", "Neurological & Mental Disorders", "hybrid", "fundamental", "open", ["nih_common", "who_research"], [
    ["알츠하이머병의 시작 원인과 되돌릴 수 있는 시점은 무엇인가?", "What initiates Alzheimer's disease, and at what stage is it reversible?"],
    ["정신질환을 증상군이 아니라 재현 가능한 생물학적 기전으로 분류할 수 있는가?", "Can mental disorders be classified by reproducible biological mechanisms rather than symptom clusters?"],
    ["파킨슨병과 운동신경질환의 신경퇴행을 멈추거나 되돌릴 수 있는가?", "Can neurodegeneration in Parkinson's disease and motor neuron disease be stopped or reversed?"],
    ["개인에게 효과적인 우울증 치료를 시행 전에 예측할 수 있는가?", "Can the effective depression treatment for an individual be predicted before treatment begins?"]
  ], ["health"]);
  BG("medicine", "면역·만성질환", "Immunity & Chronic Disease", "hybrid", "fundamental", "open", ["niaid_research", "nih_common"], [
    ["자가면역질환을 일으키는 최초의 면역 오작동은 무엇인가?", "What is the first immune malfunction that initiates autoimmune disease?"],
    ["만성 저등급 염증의 원인과 장기 손상을 안전하게 차단할 수 있는가?", "Can the causes and long-term damage of chronic low-grade inflammation be blocked safely?"],
    ["진행성 섬유화를 정상 조직으로 되돌릴 수 있는가?", "Can advanced fibrosis be reversed into normal functional tissue?"],
    ["알레르기 면역기억을 전신 면역을 해치지 않고 재설정할 수 있는가?", "Can allergic immune memory be reset without compromising systemic immunity?"]
  ], ["health"]);
  BG("medicine", "재생·유전·희귀질환", "Regeneration, Genetics & Rare Disease", "engineering", "scale", "open", ["nih_common", "who_research"], [
    ["손상된 인간 장기를 원래 구조와 기능으로 재생할 수 있는가?", "Can damaged human organs be regenerated to their original structure and function?"],
    ["한 번의 유전자 치료가 평생 안전하고 안정적인 효과를 유지할 수 있는가?", "Can a single gene therapy remain safe and effective for a lifetime?"],
    ["소수 환자와 불완전한 변이 정보만으로 희귀질환을 진단할 수 있는가?", "Can rare diseases be diagnosed from very few patients and incomplete variant information?"],
    ["평생 면역억제 없이 이식 장기에 특이적인 면역관용을 만들 수 있는가?", "Can transplant-specific immune tolerance be induced without lifelong immunosuppression?"]
  ], ["health"]);
  BG("medicine", "정밀진단·치료", "Precision Diagnosis & Treatment", "hybrid", "prediction", "open", ["nih_common", "nci_research"], [
    ["질병과 단순히 연관된 표지자에서 실제 원인 표적을 구별할 수 있는가?", "Can causal disease targets be distinguished from merely associated biomarkers?"],
    ["다중오믹스와 생활 자료로 개인의 임상 경과를 신뢰성 있게 예측할 수 있는가?", "Can individual clinical trajectories be predicted reliably from multi-omics and life data?"],
    ["극미량 잔존질환을 임상 재발 전에 정확히 검출할 수 있는가?", "Can minimal residual disease be detected accurately before clinical relapse?"],
    ["약효와 독성을 함께 고려한 개인별 용량을 실시간 최적화할 수 있는가?", "Can patient-specific dosing be optimized in real time for both efficacy and toxicity?"]
  ], ["health", "ai"]);
  BG("medicine", "임상시험·공중보건", "Clinical Trials & Public Health", "hybrid", "system", "open", ["who_research", "nih_common"], [
    ["평균 치료효과에서 개인과 하위집단의 실제 효과를 정확히 추정할 수 있는가?", "Can true individual and subgroup effects be inferred from average treatment effects?"],
    ["대리 평가변수가 장기 생존과 삶의 질을 언제 신뢰성 있게 대신하는가?", "When can surrogate endpoints reliably stand in for long-term survival and quality of life?"],
    ["효과가 입증된 의료 개입을 다양한 현실 보건체계에서 같은 성과로 구현할 수 있는가?", "Can proven medical interventions achieve the same outcomes across diverse real-world health systems?"],
    ["새로운 팬데믹에서 개입의 효과와 부작용을 충분히 빠르게 판정할 수 있는가?", "Can the benefits and harms of interventions be determined fast enough during a new pandemic?"]
  ], ["health", "security"]);
  BG("medicine", "의학적 추론의 경계", "Limits of Medical Inference", "theory", "boundary", "impossible", ["who_research", "nih_common"], [
    ["불완전한 정보만으로 한 개인의 평생 건강 사건을 오차 없이 예측할 수 있는가?", "Can every lifetime health event of an individual be predicted without error from incomplete information?"],
    ["같은 개인에게 치료한 경우와 치료하지 않은 경우의 결과를 동시에 직접 관측할 수 있는가?", "Can the treated and untreated outcomes for the same individual be observed directly at the same time?"]
  ], ["health"]);

  BG("mechanical", "유체·난류공학", "Fluid & Turbulence Engineering", "hybrid", "prediction", "open", ["nasa_armd", "doe_manufacturing"], [
    ["복잡한 실제 형상에서 층류–난류 천이를 설계 단계에 예측할 수 있는가?", "Can laminar-to-turbulent transition be predicted during design for complex real-world geometries?"],
    ["능동 유동제어로 항력과 소음을 넓은 운전 범위에서 안정적으로 줄일 수 있는가?", "Can active flow control reduce drag and noise robustly across a wide operating envelope?"],
    ["기포·액적·입자가 섞인 다상유동을 산업 규모에서 정확히 예측할 수 있는가?", "Can multiphase flows containing bubbles, droplets, and particles be predicted accurately at industrial scale?"],
    ["캐비테이션의 발생과 침식 수명을 형상과 운전조건에서 계산할 수 있는가?", "Can cavitation onset and erosion lifetime be computed from geometry and operating conditions?"]
  ], ["energy"]);
  BG("mechanical", "자율제어·안전", "Autonomous Control & Safety", "engineering", "system", "open", ["nasa_autonomy", "nasa_armd"], [
    ["학습 부품을 포함한 자율시스템을 모든 중요 상황에서 인증할 수 있는가?", "Can autonomous systems containing learned components be certified for all safety-critical situations?"],
    ["알려지지 않은 동역학과 고장에도 안정성을 보장하는 적응제어가 가능한가?", "Can adaptive control guarantee stability under unknown dynamics and failures?"],
    ["사람과 자동화의 권한 전환이 혼란 없이 이루어지는 일반 설계 원리는 무엇인가?", "What general design principles enable confusion-free transfer of authority between humans and automation?"],
    ["통신이 끊기고 일부가 고장 나도 로봇 군집이 안전하게 임무를 계속할 수 있는가?", "Can robot swarms continue missions safely after communication loss and partial failures?"]
  ], ["ai", "security"]);
  BG("mechanical", "추진·열유체", "Propulsion & Thermofluids", "hybrid", "system", "open", ["nasa_armd", "doe_manufacturing"], [
    ["극초음속 비행의 연소·충격파·열하중을 동시에 안정적으로 제어할 수 있는가?", "Can combustion, shock waves, and thermal loads in hypersonic flight be controlled simultaneously?"],
    ["대형 항공기를 장거리 운항할 수 있는 고비에너지 전기추진이 가능한가?", "Can high-specific-energy electric propulsion support long-range large aircraft?"],
    ["수소 항공기의 저장·누출·연소·기후 영향을 함께 해결할 수 있는가?", "Can storage, leakage, combustion, and climate impacts of hydrogen aviation be solved together?"],
    ["현실적인 재료와 비용으로 열기관의 효율을 한계에 가깝게 높일 수 있는가?", "Can heat-engine efficiency approach fundamental limits with practical materials and cost?"]
  ], ["energy", "climate"]);
  BG("mechanical", "구조·제조", "Structures & Manufacturing", "engineering", "scale", "open", ["nist_manufacturing", "doe_manufacturing"], [
    ["복합재 구조의 미세 손상에서 전체 파괴 시점을 예측할 수 있는가?", "Can global failure time be predicted from microscale damage in composite structures?"],
    ["적층제조 부품을 공정마다 파괴시험 없이 인증할 수 있는가?", "Can additively manufactured parts be certified without destructive testing for every process run?"],
    ["환경과 하중에 맞춰 형태를 바꾸는 구조를 피로 없이 만들 수 있는가?", "Can morphing structures adapt to environment and load without fatigue failure?"],
    ["원자·미세·부품 규모 설계를 하나의 제조 가능성 모형으로 연결할 수 있는가?", "Can atomic, microstructural, and component design be linked in one manufacturability model?"]
  ], ["sustainability"]);
  BG("mechanical", "로봇 메커니즘", "Robotic Mechanisms", "engineering", "system", "open", ["nasa_autonomy", "nist_manufacturing"], [
    ["로봇 손이 다양한 물체를 사람처럼 빠르고 섬세하게 다룰 수 있는가?", "Can robotic hands manipulate diverse objects as quickly and delicately as humans?"],
    ["다리 로봇이 낯선 지형에서 넘어져도 스스로 복구하며 장시간 이동할 수 있는가?", "Can legged robots travel for long periods over unfamiliar terrain and recover from falls?"],
    ["연성로봇의 무한에 가까운 자유도를 실시간으로 정확히 제어할 수 있는가?", "Can the near-infinite degrees of freedom of soft robots be controlled accurately in real time?"],
    ["정비 없이 수년간 작동하는 자율로봇을 설계할 수 있는가?", "Can autonomous robots operate for years without maintenance?"]
  ], ["ai"]);
  BG("mechanical", "우주·극한환경 시스템", "Space & Extreme-Environment Systems", "engineering", "scale", "open", ["nasa_armd", "nasa_autonomy"], [
    ["재사용 우주선의 재진입 열차폐를 가볍고 반복 가능하게 만들 수 있는가?", "Can reusable spacecraft thermal protection be made lightweight and reliably repeatable?"],
    ["우주 파편을 추가 위험 없이 대규모로 제거할 수 있는가?", "Can orbital debris be removed at scale without creating additional risk?"],
    ["달과 화성의 현지 자원으로 연료·산소·구조물을 안정적으로 생산할 수 있는가?", "Can local lunar and Martian resources reliably produce fuel, oxygen, and structures?"],
    ["심우주에서 폐쇄형 생명유지계를 수년간 안정적으로 운용할 수 있는가?", "Can closed-loop life-support systems operate reliably for years in deep space?"]
  ], ["space", "sustainability"]);
  BG("mechanical", "시스템 신뢰성", "System Reliability", "engineering", "prediction", "open", ["nist_manufacturing", "nasa_autonomy"], [
    ["디지털 트윈이 실제 시스템의 미관측 고장까지 예측한다는 것을 검증할 수 있는가?", "Can a digital twin be validated to predict previously unobserved failures in a real system?"],
    ["거의 발생하지 않는 치명적 고장의 확률을 제한된 시험으로 추정할 수 있는가?", "Can the probability of extremely rare catastrophic failures be estimated from limited testing?"],
    ["상태기반 정비가 안전성과 비용을 함께 최적화하도록 보증할 수 있는가?", "Can condition-based maintenance be guaranteed to optimize both safety and cost?"],
    ["공급망과 물리 시스템의 연쇄고장을 설계 단계에서 차단할 수 있는가?", "Can cascading failures across supply chains and physical systems be prevented during design?"]
  ], ["ai", "security"]);
  BG("mechanical", "제어·예측의 경계", "Limits of Control & Prediction", "theory", "boundary", "impossible", ["nasa_autonomy", "nist_manufacturing"], [
    ["초기상태를 유한 정밀도로만 알면서 혼돈 난류의 모든 순간을 무기한 정확히 예측할 수 있는가?", "Can every instant of chaotic turbulence be predicted indefinitely from a finitely precise initial state?"],
    ["크기가 제한된 제어기로 제한 없는 모든 외란에서도 임의 시스템을 완벽히 제어할 수 있는가?", "Can a bounded controller perfectly regulate an arbitrary system under unbounded disturbances?"]
  ], ["security"]);

  BG("cognitive", "의식", "Consciousness", "hybrid", "fundamental", "open", ["brain_priorities", "nimh_plan"], [
    ["주관적 의식 경험은 뇌의 물리적 활동에서 어떻게 발생하는가?", "How does subjective conscious experience arise from physical brain activity?"],
    ["분산된 뇌 활동은 어떻게 하나의 통일된 경험을 만드는가?", "How does distributed brain activity produce a unified experience?"],
    ["마취·수면·혼수에서 의식이 사라지고 돌아오는 정확한 전환 조건은 무엇인가?", "What exact transitions cause consciousness to disappear and return in anesthesia, sleep, and coma?"],
    ["말하거나 움직일 수 없는 대상의 의식 수준을 객관적으로 측정할 수 있는가?", "Can consciousness be measured objectively in a subject who cannot communicate or move?"]
  ], ["health"]);
  BG("cognitive", "지각", "Perception", "hybrid", "fundamental", "open", ["brain_priorities", "nsf_bcs"], [
    ["색·형태·운동·위치 정보는 어떻게 하나의 지각 대상으로 결합되는가?", "How are color, form, motion, and location bound into one perceived object?"],
    ["뇌는 변하는 감각 입력에서도 대상의 항상성을 어떻게 유지하는가?", "How does the brain preserve object constancy across changing sensory input?"],
    ["환각과 착각이 발생할 시점을 개인별로 예측할 수 있는가?", "Can hallucinations and illusions be predicted for an individual?"],
    ["서로 다른 감각의 시간과 공간 정보를 뇌가 어떻게 최적으로 통합하는가?", "How does the brain optimally integrate temporal and spatial information across senses?"]
  ]);
  BG("cognitive", "기억·학습", "Memory & Learning", "hybrid", "fundamental", "open", ["brain_priorities", "nsf_bcs"], [
    ["특정 기억의 내용은 세포와 연결망에 정확히 어떻게 저장되는가?", "How is the content of a specific memory stored in cells and networks?"],
    ["새 기억은 어떻게 장기기억으로 공고화되면서 기존 기억과 통합되는가?", "How are new memories consolidated and integrated with existing memories?"],
    ["망각은 수동적 소실인가 능동적 계산인가?", "Is forgetting passive decay or an active computation?"],
    ["한 맥락에서 배운 지식을 전혀 다른 문제에 안정적으로 전이하는 원리는 무엇인가?", "What enables knowledge learned in one context to transfer reliably to a very different problem?"]
  ]);
  BG("cognitive", "언어·사고", "Language & Thought", "hybrid", "fundamental", "open", ["nidcd_research", "nsf_bcs"], [
    ["인간 언어의 생산성과 재귀성은 진화와 발달에서 어떻게 출현했는가?", "How did the productivity and recursion of human language emerge in evolution and development?"],
    ["문장의 형식 구조가 실제 의미 표현으로 변환되는 원리는 무엇인가?", "How is the formal structure of a sentence transformed into a representation of meaning?"],
    ["언어는 사고의 범주와 추론을 어느 정도 형성하는가?", "To what extent does language shape categories of thought and reasoning?"],
    ["아이는 제한된 입력만으로 언어의 추상 규칙을 어떻게 학습하는가?", "How do children learn abstract rules of language from limited input?"]
  ]);
  BG("cognitive", "의사결정·감정", "Decision-Making & Emotion", "hybrid", "prediction", "open", ["nimh_plan", "nsf_bcs"], [
    ["가치·위험·보상을 계산하는 공통 신경 원리는 무엇인가?", "What common neural principles compute value, risk, and reward?"],
    ["인지 편향이 언제 적응적 지름길이고 언제 체계적 오류가 되는가?", "When is a cognitive bias an adaptive shortcut, and when is it a systematic error?"],
    ["감정은 지각·기억·행동 선택을 어떤 계산으로 조절하는가?", "Through what computations does emotion regulate perception, memory, and action selection?"],
    ["자신의 판단 정확도에 대한 확신은 어떻게 계산되고 교정되는가?", "How is confidence in one's own judgments computed and calibrated?"]
  ], ["health"]);
  BG("cognitive", "발달·개인차", "Development & Individual Differences", "hybrid", "prediction", "open", ["nimh_plan", "brain_priorities"], [
    ["유전과 환경은 개인의 인지능력과 성격 차이를 어떻게 함께 만드는가?", "How do genes and environments jointly produce individual differences in cognition and personality?"],
    ["학습과 회복의 결정적 시기는 무엇이 열고 닫는가?", "What opens and closes critical periods for learning and recovery?"],
    ["정상적인 인지노화와 병적 저하를 초기부터 구별할 수 있는가?", "Can healthy cognitive aging be distinguished from pathological decline at an early stage?"],
    ["신경다양성의 장점과 어려움을 개인과 환경의 상호작용으로 예측할 수 있는가?", "Can the strengths and challenges of neurodiversity be predicted from person–environment interactions?"]
  ], ["health"]);
  BG("cognitive", "사회인지·문화", "Social Cognition & Culture", "hybrid", "prediction", "open", ["nsf_bcs", "brain_priorities"], [
    ["사람은 다른 사람의 믿음과 의도를 어떻게 빠르게 추론하는가?", "How do people rapidly infer the beliefs and intentions of others?"],
    ["집단지성이 개인들의 능력을 넘어서는 조건은 무엇인가?", "Under what conditions does collective intelligence exceed the abilities of individuals?"],
    ["문화적 지식은 세대를 거치며 어떻게 안정화되고 혁신되는가?", "How is cultural knowledge stabilized and innovated across generations?"],
    ["낯선 사람 사이의 협력과 신뢰를 만드는 보편 조건은 무엇인가?", "What general conditions create cooperation and trust among strangers?"]
  ]);
  BG("cognitive", "마음 측정의 경계", "Limits of Measuring Minds", "theory", "boundary", "impossible", ["brain_priorities", "nsf_bcs"], [
    ["외부 관측만으로 다른 사람의 사적 경험 전체를 동일하게 복원할 수 있는가?", "Can another person's complete private experience be reconstructed identically from external observations alone?"],
    ["개인의 모든 내부 상태와 미래 입력을 알지 못하면서 선택을 영원히 오차 없이 예측할 수 있는가?", "Can a person's choices be predicted forever without error when all internal states and future inputs are unknown?"]
  ]);

  BG("agriculture", "작물·유전", "Crops & Genetics", "hybrid", "prediction", "open", ["usda_ars", "cgiar"], [
    ["수량·영양·내재해성을 동시에 높이는 작물 유전자형을 예측 설계할 수 있는가?", "Can crop genotypes be designed to improve yield, nutrition, and stress tolerance simultaneously?"],
    ["다년생 곡물이 주요 일년생 곡물의 생산성과 품질을 달성할 수 있는가?", "Can perennial grains match the productivity and quality of major annual grains?"],
    ["광합성의 실제 포장 효율을 큰 부작용 없이 획기적으로 높일 수 있는가?", "Can field photosynthetic efficiency be increased dramatically without major tradeoffs?"],
    ["지역 고유의 소외 작물을 빠르게 개량하면서 유전다양성을 보존할 수 있는가?", "Can locally important orphan crops be improved rapidly while preserving genetic diversity?"]
  ], ["climate", "sustainability"]);
  BG("agriculture", "토양·미생물군", "Soil & Microbiomes", "hybrid", "fundamental", "open", ["usda_ars", "fao_framework"], [
    ["농경지 토양 탄소를 장기간 늘리면서 수량을 유지할 수 있는가?", "Can agricultural soil carbon be increased for decades while maintaining yields?"],
    ["식물과 토양 미생물군의 인과관계를 이용해 안정적인 생산성을 설계할 수 있는가?", "Can causal plant–soil microbiome relationships be used to engineer stable productivity?"],
    ["질소와 인 순환을 손실 없이 작물 수요에 맞출 수 있는가?", "Can nitrogen and phosphorus cycling be matched to crop demand without losses?"],
    ["심하게 침식되고 염류화된 토양의 기능을 경제적으로 복원할 수 있는가?", "Can severely eroded and salinized soils be restored economically?"]
  ], ["climate", "sustainability"]);
  BG("agriculture", "병해충·생물다양성", "Pests, Disease & Biodiversity", "hybrid", "prediction", "open", ["usda_nifa", "cgiar"], [
    ["새로운 작물 병원체와 해충의 발생·확산을 한 철 전에 예측할 수 있는가?", "Can the emergence and spread of new crop pathogens and pests be predicted a season ahead?"],
    ["농약과 저항성 품종에 대한 진화를 장기적으로 늦출 수 있는가?", "Can evolution of resistance to pesticides and resistant cultivars be slowed long term?"],
    ["비표적 생물을 해치지 않는 안정적인 생물학적 방제를 설계할 수 있는가?", "Can stable biological control be designed without harming non-target organisms?"],
    ["수분매개자 감소를 되돌리면서 농업 생산성을 유지할 수 있는가?", "Can pollinator decline be reversed while maintaining agricultural productivity?"]
  ], ["sustainability"]);
  BG("agriculture", "축산·수산", "Livestock & Aquaculture", "engineering", "system", "open", ["fao_framework", "usda_ars"], [
    ["반추동물 메탄을 건강과 생산성 저하 없이 크게 줄일 수 있는가?", "Can ruminant methane emissions be cut sharply without harming health or productivity?"],
    ["고밀도 사육에서 감염병을 항생제 의존 없이 통제할 수 있는가?", "Can infectious disease in intensive animal production be controlled without antibiotic dependence?"],
    ["동물의 복지 상태를 종과 환경에 걸쳐 객관적으로 측정할 수 있는가?", "Can animal welfare be measured objectively across species and environments?"],
    ["양식 사료를 야생어획과 경작지 부담 없이 지속가능하게 공급할 수 있는가?", "Can aquaculture feed be supplied sustainably without pressure on wild fisheries or cropland?"]
  ], ["climate", "health", "sustainability"]);
  BG("agriculture", "식품·영양", "Food & Nutrition", "hybrid", "prediction", "open", ["fao_framework", "usda_nifa"], [
    ["개인의 대사와 미생물군에 맞는 식단 반응을 장기간 예측할 수 있는가?", "Can long-term dietary responses be predicted from an individual's metabolism and microbiome?"],
    ["식품 가공의 구조적 변화가 장기 건강에 미치는 인과효과는 무엇인가?", "What causal effects do structural changes from food processing have on long-term health?"],
    ["대체단백질이 맛·영양·가격·환경성을 동시에 충족할 수 있는가?", "Can alternative proteins meet taste, nutrition, price, and environmental goals simultaneously?"],
    ["복잡한 공급망에서 식품 병원체와 독소를 유통 전에 검출할 수 있는가?", "Can foodborne pathogens and toxins be detected before distribution in complex supply chains?"]
  ], ["health", "sustainability"]);
  BG("agriculture", "기후·물 적응", "Climate & Water Adaptation", "engineering", "scale", "open", ["fao_framework", "cgiar"], [
    ["동시에 발생하는 폭염과 가뭄에서도 안정적인 수량을 유지할 수 있는가?", "Can yields remain stable under simultaneous heat and drought?"],
    ["관개용수를 줄이면서 지역 지하수와 수확량을 함께 보전할 수 있는가?", "Can irrigation be reduced while preserving both regional groundwater and yields?"],
    ["해수와 염류 토양을 활용하는 주요 식량작물 체계를 만들 수 있는가?", "Can major food-crop systems be developed for saline soils and brackish water?"],
    ["기후변화 속도보다 빠르게 품종·재배법·공급망을 적응시킬 수 있는가?", "Can cultivars, farming practices, and supply chains adapt faster than climate change?"]
  ], ["climate", "sustainability"]);
  BG("agriculture", "식량시스템·순환", "Food Systems & Circularity", "engineering", "system", "open", ["fao_framework", "usda_nifa"], [
    ["수확 후 손실과 소비자 음식물 쓰레기를 품질 저하 없이 절반 이하로 줄일 수 있는가?", "Can post-harvest loss and consumer food waste be cut by more than half without reducing quality?"],
    ["전쟁·팬데믹·기후 충격에도 지역 식량공급망이 기능하게 만들 수 있는가?", "Can regional food supply chains function through war, pandemics, and climate shocks?"],
    ["농장에서 식탁까지 환경·노동·안전 정보를 신뢰성 있게 추적할 수 있는가?", "Can environmental, labor, and safety information be traced reliably from farm to table?"],
    ["도시와 농촌 사이의 질소·인·유기물 순환을 경제적으로 닫을 수 있는가?", "Can nitrogen, phosphorus, and organic-matter loops between cities and farms be closed economically?"]
  ], ["climate", "security", "sustainability"]);
  BG("agriculture", "농업 예측의 경계", "Limits of Agricultural Prediction", "theory", "boundary", "impossible", ["fao_framework", "usda_ars"], [
    ["미래 날씨와 모든 생물 상호작용을 알지 못하면서 각 밭의 수확량을 오차 없이 예측할 수 있는가?", "Can every field's yield be predicted without error when future weather and all biological interactions are unknown?"],
    ["기록과 생물학적 흔적이 모두 사라진 과거 농업생태계의 정확한 상태를 복원할 수 있는가?", "Can the exact state of a past agroecosystem be reconstructed after all records and biological traces are lost?"]
  ], ["climate", "sustainability"]);

  BG("social", "거시경제·금융", "Macroeconomics & Finance", "hybrid", "prediction", "open", ["nsf_ses", "worldbank_research"], [
    ["경기침체의 시작·깊이·기간을 정책 대응에 충분히 일찍 예측할 수 있는가?", "Can the onset, depth, and duration of recessions be predicted early enough for policy response?"],
    ["인플레이션 기대·공급충격·임금의 상호작용을 안정적으로 모델링할 수 있는가?", "Can interactions among inflation expectations, supply shocks, and wages be modeled reliably?"],
    ["국가와 시대에 따른 생산성 성장 차이의 근본 원인은 무엇인가?", "What fundamentally causes differences in productivity growth across countries and eras?"],
    ["자산 거품과 금융 붕괴를 정상적 가격 변동과 사전에 구별할 수 있는가?", "Can asset bubbles and financial collapses be distinguished in advance from normal price variation?"]
  ], ["security"]);
  BG("social", "불평등·이동성", "Inequality & Mobility", "hybrid", "fundamental", "open", ["nsf_sbe", "worldbank_research"], [
    ["소득·부·건강·교육 불평등을 함께 만드는 인과구조는 무엇인가?", "What causal structure jointly produces inequalities in income, wealth, health, and education?"],
    ["어떤 정책 조합이 성장과 사회이동성을 해치지 않고 불평등을 지속적으로 낮추는가?", "Which policy combinations reduce inequality durably without harming growth or mobility?"],
    ["부의 집중은 어떤 조건에서 스스로 강화되거나 완화되는가?", "Under what conditions does wealth concentration reinforce or reverse itself?"],
    ["세대 간 지위 전달에서 가족·학교·지역·제도의 기여를 분리할 수 있는가?", "Can the roles of family, school, place, and institutions in intergenerational status transmission be separated?"]
  ]);
  BG("social", "제도·거버넌스", "Institutions & Governance", "hybrid", "prediction", "open", ["nsf_sbe", "nas_dbasse"], [
    ["민주적 제도가 충격에도 안정적으로 유지되는 조건은 무엇인가?", "What conditions keep democratic institutions stable under shocks?"],
    ["부패를 다른 비공식 제도로 밀어내지 않고 장기간 줄이는 방법은 무엇인가?", "How can corruption be reduced durably without displacing it into other informal institutions?"],
    ["사람들이 정당하다고 받아들이며 실제로 준수하는 정책을 예측 설계할 수 있는가?", "Can policies be designed predictively so that people regard them as legitimate and comply?"],
    ["과학·정부·언론에 대한 신뢰가 붕괴하고 회복되는 인과과정은 무엇인가?", "What causal processes drive the collapse and recovery of trust in science, government, and media?"]
  ]);
  BG("social", "정보·사회연결망", "Information & Social Networks", "hybrid", "prediction", "open", ["nsf_sbe", "nsf_ses"], [
    ["오정보가 사실보다 빠르게 퍼지는 조건을 사전에 식별할 수 있는가?", "Can the conditions under which misinformation spreads faster than truth be identified in advance?"],
    ["정치적 양극화를 줄이면서 표현의 자유와 참여를 유지할 수 있는가?", "Can political polarization be reduced while preserving free expression and participation?"],
    ["온라인 집단의 관심과 행동이 급격히 전환되는 시점을 예측할 수 있는가?", "Can abrupt shifts in online collective attention and behavior be predicted?"],
    ["디지털 플랫폼의 알고리즘과 사용자 행동 사이의 장기 피드백을 측정할 수 있는가?", "Can long-term feedback between platform algorithms and user behavior be measured?"]
  ], ["ai", "security"]);
  BG("social", "갈등·협력", "Conflict & Cooperation", "hybrid", "prediction", "open", ["nsf_ses", "nas_dbasse"], [
    ["무력충돌의 발발을 거짓경보 없이 유용하게 예측할 수 있는가?", "Can armed conflict onset be predicted usefully without excessive false alarms?"],
    ["평화협정이 수십 년간 지속되는 조건은 무엇인가?", "What conditions allow peace agreements to endure for decades?"],
    ["대규모 집단행동에서 무임승차를 억제하고 협력을 유지하는 제도는 무엇인가?", "Which institutions suppress free-riding and sustain cooperation in large-scale collective action?"],
    ["기후·어장·물 같은 국제 공유자원을 공정하고 안정적으로 관리할 수 있는가?", "Can international commons such as climate, fisheries, and water be governed fairly and stably?"]
  ], ["climate", "security", "sustainability"]);
  BG("social", "도시·인구", "Cities & Population", "hybrid", "system", "open", ["worldbank_research", "nsf_sbe"], [
    ["도시 규모가 생산성·혁신·범죄·에너지 사용에 미치는 법칙은 보편적인가?", "Are the effects of city size on productivity, innovation, crime, and energy use universal?"],
    ["기후·갈등·경제가 결합된 이주 흐름을 장기간 예측할 수 있는가?", "Can long-term migration flows driven jointly by climate, conflict, and economics be predicted?"],
    ["주거비를 낮추면서 접근성·지역공동체·환경성을 함께 개선할 수 있는가?", "Can housing costs fall while accessibility, community, and environmental performance improve together?"],
    ["저출산·고령화·수명 변화의 장기 사회효과를 신뢰성 있게 예측할 수 있는가?", "Can the long-term social effects of low fertility, aging, and longevity change be predicted reliably?"]
  ], ["climate", "sustainability"]);
  BG("social", "측정·인과추론", "Measurement & Causal Inference", "hybrid", "measurement", "open", ["nsf_sbe", "nas_dbasse"], [
    ["무작위 실험이 불가능한 사회정책의 인과효과를 편향 없이 추정할 수 있는가?", "Can causal effects of social policies be estimated without bias when randomized experiments are impossible?"],
    ["한 사회에서 얻은 결과가 다른 문화·시대·제도에서도 재현될지 예측할 수 있는가?", "Can we predict whether findings from one society will replicate across cultures, eras, and institutions?"],
    ["관측된 행동에서 숨은 선호·규범·제약을 유일하게 식별할 수 있는가?", "Can hidden preferences, norms, and constraints be identified uniquely from observed behavior?"],
    ["수십 년 뒤 나타나는 정책효과를 현재 자료로 신뢰성 있게 평가할 수 있는가?", "Can policy effects that emerge decades later be evaluated reliably with current data?"]
  ]);
  BG("social", "사회적 추론의 경계", "Limits of Social Inference", "theory", "boundary", "impossible", ["nsf_sbe", "nas_dbasse"], [
    ["같은 사회가 정책을 시행한 역사와 시행하지 않은 역사를 동시에 직접 관측할 수 있는가?", "Can the same society's history with and without a policy be observed directly at the same time?"],
    ["모든 개인의 내부상태와 미래 충격을 알지 못하면서 사회 전체의 행동을 영원히 오차 없이 예측할 수 있는가?", "Can a society's behavior be predicted forever without error when individuals' internal states and future shocks are unknown?"]
  ]);

  problems.push(...added);

  function inferThemes(problem) {
    const found = new Set(problem.themes || []);
    const text = `${problem.discipline} ${problem.subfield} ${problem.question} ${problem.questionEn || ""}`.toLowerCase();
    const rules = {
      energy: /에너지|핵융합|배터리|전력|연료|수소|암모니아|열전|energy|fusion|battery|power grid|fuel|hydrogen/,
      space: /우주|천체|블랙홀|행성|궤도|space|cosmo|astro|black hole|planet|orbital/,
      quantum: /양자|쿼크|큐비트|초전도|스핀|위상상태|quantum|quark|qubit|superconduct|spin liquid/,
      climate: /기후|대기|해양|빙상|날씨|탄소 순환|climate|atmospher|ocean|ice sheet|weather/,
      ai: /인공지능|머신러닝|\bai\b|학습 시스템|신경망|machine learning|neural network|artificial intelligence/,
      sustainability: /지속|재활용|오염|폐기|희소|환경|탄소|식량|농업|물 부족|sustain|recycl|pollut|waste|agric|food system/,
      health: /의학|질병|환자|면역|암|노화|뇌|건강|치료|medicine|disease|patient|immune|cancer|health|treatment/,
      security: /안전|보안|장애|재난|위험|암호|security|safety|failure|hazard|disaster|cryptograph/
    };
    Object.entries(rules).forEach(([key, pattern]) => { if (pattern.test(text)) found.add(key); });
    return [...found];
  }

  problems.forEach(problem => { problem.themes = inferThemes(problem); });
})();
