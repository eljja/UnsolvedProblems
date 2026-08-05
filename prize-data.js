/* Official prize and challenge data, reviewed against organizer pages on 2026-08-05. */
(function () {
  "use strict";

  const meta = window.CATALOG_META;
  const sources = window.CATALOG_SOURCES;
  const problems = window.PROBLEMS;

  meta.prizeStatuses = {
    active: {
      label: "현재 상금·진행 중 경진",
      labelEn: "Active prize or competition",
      color: "#b06a12"
    },
    legacy: {
      label: "역사적 상금 제안",
      labelEn: "Historical prize offer",
      color: "#6f7680"
    }
  };

  meta.prizeTypes = {
    proof: { label: "증명·반례 상금", labelEn: "Proof or counterexample prize" },
    competition: { label: "연구경진 총상금", labelEn: "Research competition purse" },
    computation: { label: "계산 도전 상금", labelEn: "Computational challenge prize" }
  };

  Object.assign(sources, {
    clay_prize: {
      discipline: "mathematics",
      title: "Clay Mathematics Institute — Millennium Prize Problems and rules",
      url: "https://www.claymath.org/millennium-problems/"
    },
    ams_beal: {
      discipline: "mathematics",
      title: "American Mathematical Society — Beal Prize agreement and procedure",
      url: "https://www.ams.org/about-us/governance/council-meetings/council-minutes0114.pdf"
    },
    xprize_quantum: {
      discipline: "computer",
      title: "XPRIZE — Quantum Applications",
      url: "https://www.xprize.org/competitions/qc-apps"
    },
    xprize_healthspan: {
      discipline: "biology",
      title: "XPRIZE — Healthspan",
      url: "https://www.xprize.org/competitions/healthspan"
    },
    xprize_water: {
      discipline: "materials",
      title: "XPRIZE — Water Scarcity",
      url: "https://www.xprize.org/competitions/water"
    },
    xprize_wildfire: {
      discipline: "earth",
      title: "XPRIZE — Wildfire",
      url: "https://www.xprize.org/competitions/wildfire"
    },
    hutter_prize: {
      discipline: "computer",
      title: "Hutter Prize — 500,000€ Prize for Compressing Human Knowledge",
      url: "https://prize.hutter1.net/"
    },
    eff_coop: {
      discipline: "mathematics",
      title: "Electronic Frontier Foundation — Cooperative Computing Awards",
      url: "https://www.eff.org/awards/coop"
    },
    foresight_feynman: {
      discipline: "materials",
      title: "Foresight Institute — Feynman Grand Prize specifications",
      url: "https://foresight.org/prizes/feynman-prizes/"
    },
    erdos_prizes: {
      discipline: "mathematics",
      title: "Erdős Problems — Open problems and recorded prize offers",
      url: "https://www.erdosproblems.com/prizes/1000"
    }
  });

  const prizes = {
    clay_millennium: {
      title: "밀레니엄 문제 상금",
      titleEn: "Millennium Prize Problem",
      organization: "Clay 수학연구소",
      organizationEn: "Clay Mathematics Institute",
      type: "proof",
      status: "active",
      amount: "문제당 미화 100만 달러",
      amountEn: "US$1 million per problem",
      amountShort: "US$1M",
      amountShortEn: "US$1M",
      summary: "현재 미해결인 밀레니엄 문제 여섯 개 각각에 독립된 상금이 배정되어 있다.",
      summaryEn: "A separate prize is allocated to each of the six Millennium problems that remain unsolved.",
      conditions: "공인 학술 매체에 완전한 해법이 출판되고 2년 이상 지난 뒤, 세계 수학계의 일반적 승인을 얻어야 한다. 연구소는 직접 투고를 받지 않는다.",
      conditionsEn: "A complete solution must appear in a qualifying outlet, at least two years must pass, and it must gain general acceptance in the global mathematics community. CMI does not accept direct submissions.",
      sourceId: "clay_prize",
      rulesUrl: "https://www.claymath.org/millennium-problems/rules/",
      reviewedOn: "2026-08-05"
    },
    beal_prize: {
      title: "Beal 추측 상금",
      titleEn: "Beal Conjecture Prize",
      organization: "American Mathematical Society / D. Andrew Beal",
      organizationEn: "American Mathematical Society / D. Andrew Beal",
      type: "proof",
      status: "active",
      amount: "미화 100만 달러",
      amountEn: "US$1 million",
      amountShort: "US$1M",
      amountShortEn: "US$1M",
      summary: "Beal 추측의 증명 또는 반례에 대해 AMS가 보유한 기금에서 지급하는 상금이다.",
      summaryEn: "The AMS holds the fund for a prize awarded for a proof or counterexample to the Beal Conjecture.",
      conditions: "해법은 심사받는 존경받는 수학 학술지에 출판되어야 하며, AMS가 정한 절차에 따라 검증된다.",
      conditionsEn: "A solution must be published in a respected refereed mathematics journal and is evaluated under the AMS procedure.",
      sourceId: "ams_beal",
      rulesUrl: "https://www.ams.org/about-us/governance/council-meetings/council-minutes0114.pdf",
      reviewedOn: "2026-08-05"
    },
    xprize_quantum: {
      title: "XPRIZE Quantum Applications",
      titleEn: "XPRIZE Quantum Applications",
      organization: "XPRIZE Foundation / Google Quantum AI",
      organizationEn: "XPRIZE Foundation / Google Quantum AI",
      type: "competition",
      status: "active",
      amount: "총상금 미화 500만 달러",
      amountEn: "US$5 million total prize purse",
      amountShort: "총 US$5M",
      amountShortEn: "US$5M purse",
      summary: "건강·기후·에너지·재료에서 실질적 양자우위를 보일 알고리즘과 응용을 겨루는 2024–2027 경진이다.",
      summaryEn: "A 2024–2027 competition for algorithms and applications that can deliver meaningful quantum advantage in health, climate, energy, or materials.",
      conditions: "새 알고리즘, 새 응용 또는 자원 요구량의 큰 개선을 분석·벤치마크해야 한다. 경진은 진행 중이지만 단계별 등록·제출 기한은 별도 확인이 필요하다.",
      conditionsEn: "Entries must analyze and benchmark a novel algorithm, a new application, or a major resource improvement. The competition is active, but phase-specific entry deadlines must be checked separately.",
      sourceId: "xprize_quantum",
      rulesUrl: "https://www.xprize.org/competitions/qc-apps",
      reviewedOn: "2026-08-05"
    },
    xprize_healthspan: {
      title: "XPRIZE Healthspan",
      titleEn: "XPRIZE Healthspan",
      organization: "XPRIZE Foundation / Hevolution / SOLVE FSHD",
      organizationEn: "XPRIZE Foundation / Hevolution / SOLVE FSHD",
      type: "competition",
      status: "active",
      amount: "총상금 미화 1억 100만 달러",
      amountEn: "US$101 million total prize purse",
      amountShort: "총 US$101M",
      amountShortEn: "US$101M purse",
      summary: "50–80세의 근육·인지·면역 기능을 최소 10년, 목표 20년만큼 회복시키는 안전하고 접근 가능한 치료를 겨룬다.",
      summaryEn: "Teams compete to create safe, accessible therapies that restore muscle, cognitive, and immune function in people aged 50–80 by at least 10 years, with a goal of 20.",
      conditions: "치료 기간은 1년 이하여야 하고 정해진 기능·바이오마커 기준을 충족해야 한다. 경진은 진행 중이나 결선 진입·등록 조건은 공식 페이지에서 확인해야 한다.",
      conditionsEn: "Treatment must take no more than one year and meet specified functional and biomarker criteria. The competition is active, but finals eligibility and registration conditions must be checked on the official page.",
      sourceId: "xprize_healthspan",
      rulesUrl: "https://www.xprize.org/competitions/healthspan",
      reviewedOn: "2026-08-05"
    },
    xprize_water: {
      title: "XPRIZE Water Scarcity",
      titleEn: "XPRIZE Water Scarcity",
      organization: "XPRIZE Foundation / Mohamed bin Zayed Water Initiative",
      organizationEn: "XPRIZE Foundation / Mohamed bin Zayed Water Initiative",
      type: "competition",
      status: "active",
      amount: "총상금 미화 1억 1,900만 달러",
      amountEn: "US$119 million total prize purse",
      amountShort: "총 US$119M",
      amountShortEn: "US$119M purse",
      summary: "신뢰성·비용·지속가능성을 함께 만족하는 대규모 해수 담수화 시스템과 새로운 분리 재료·방법을 겨루는 2024–2028 경진이다.",
      summaryEn: "A 2024–2028 competition for large-scale seawater desalination systems and novel separation materials or methods that jointly meet reliability, cost, and sustainability goals.",
      conditions: "시스템 트랙은 하루 최소 100만 L를 1년간 생산해야 하고, 재료·방법 트랙은 10년 이상의 운전수명을 입증해야 한다. 현재 단계의 신규 참가 가능 여부는 별도 확인이 필요하다.",
      conditionsEn: "The system track must produce at least one million liters per day over one year; the materials and methods track must demonstrate an operating life of at least ten years. Current entry availability must be checked separately.",
      sourceId: "xprize_water",
      rulesUrl: "https://www.xprize.org/competitions/water",
      reviewedOn: "2026-08-05"
    },
    xprize_wildfire: {
      title: "XPRIZE Wildfire",
      titleEn: "XPRIZE Wildfire",
      organization: "XPRIZE Foundation / PG&E / Gordon and Betty Moore Foundation",
      organizationEn: "XPRIZE Foundation / PG&E / Gordon and Betty Moore Foundation",
      type: "competition",
      status: "active",
      amount: "총상금 미화 1,100만 달러",
      amountEn: "US$11 million total prize purse",
      amountShort: "총 US$11M",
      amountShortEn: "US$11M purse",
      summary: "우주 기반 조기감지와 대규모 지역의 자율 산불 탐지·진압 기술을 겨루는 2023–2026 경진이다.",
      summaryEn: "A 2023–2026 competition for space-based early detection and autonomous wildfire detection and suppression across large areas.",
      conditions: "트랙별 실제 환경 시험에서 속도·정확도·자율성·오탐 회피·진압 성능을 입증해야 한다. 결선 단계이므로 신규 참가가 가능하다는 뜻은 아니다.",
      conditionsEn: "Track-specific field tests assess speed, accuracy, autonomy, decoy rejection, and suppression. The competition is in its finals, so active status does not imply that new teams can enter.",
      sourceId: "xprize_wildfire",
      rulesUrl: "https://www.xprize.org/competitions/wildfire",
      reviewedOn: "2026-08-05"
    },
    hutter_compression: {
      title: "Hutter Prize",
      titleEn: "Hutter Prize",
      organization: "Marcus Hutter / Hutter Prize",
      organizationEn: "Marcus Hutter / Hutter Prize",
      type: "competition",
      status: "active",
      amount: "상금 기금 50만 유로",
      amountEn: "€500,000 prize fund",
      amountShort: "€500K 기금",
      amountShortEn: "€500K fund",
      summary: "인간 지식의 무손실 압축을 지능의 실용적 척도로 삼아 고정된 위키백과 말뭉치의 압축 기록을 개선하는 상금이다.",
      summaryEn: "The prize uses lossless compression of human knowledge as a practical proxy for intelligence and rewards improvements on a fixed Wikipedia corpus.",
      conditions: "공개된 규칙·말뭉치·실행시간·메모리 한도를 만족하는 재현 가능한 압축 프로그램으로 현재 기록을 개선해야 한다. 지급액은 개선률과 규칙에 따라 계산된다.",
      conditionsEn: "A reproducible compressor must improve the current record while meeting the published corpus, runtime, memory, and disclosure rules. Payment is calculated from the improvement under the current rules.",
      sourceId: "hutter_prize",
      rulesUrl: "https://prize.hutter1.net/",
      reviewedOn: "2026-08-05"
    },
    eff_large_prime: {
      title: "EFF Cooperative Computing Awards",
      titleEn: "EFF Cooperative Computing Awards",
      organization: "Electronic Frontier Foundation",
      organizationEn: "Electronic Frontier Foundation",
      type: "computation",
      status: "active",
      amount: "미화 15만·25만 달러",
      amountEn: "US$150,000 and US$250,000",
      amountShort: "US$150K/250K",
      amountShortEn: "US$150K/250K",
      summary: "최초의 1억 자리 소수와 10억 자리 소수를 발견한 개인 또는 팀에 각각 지급하는 분산계산 상금이다.",
      summaryEn: "Computational awards for the first individual or group to discover a prime with at least 100 million digits and one with at least one billion digits.",
      conditions: "특정 정수와 결정론적 소수성 증명, 동료심사 이전의 공개 발표, 재현 가능한 방법·코드·하드웨어 정보의 공개가 필요하다. 새로운 정리나 알고리즘만으로는 수상할 수 없다.",
      conditionsEn: "A claim needs a specific integer, a deterministic primality proof, prior open peer-reviewed publication, and reproducible disclosure of methods, code, and hardware. A theorem or algorithm alone is not eligible.",
      sourceId: "eff_coop",
      rulesUrl: "https://www.eff.org/awards/coop/rules",
      reviewedOn: "2026-08-05"
    },
    feynman_grand: {
      title: "Feynman Grand Prize",
      titleEn: "Feynman Grand Prize",
      organization: "Foresight Institute",
      organizationEn: "Foresight Institute",
      type: "competition",
      status: "active",
      amount: "미화 25만 달러",
      amountEn: "US$250,000",
      amountShort: "US$250K",
      amountShortEn: "US$250K",
      summary: "규정된 기능의 나노스케일 로봇팔과 나노스케일 계산장치를 모두 설계·제작·시연하는 팀을 위한 대상이다.",
      summaryEn: "A grand prize for the first team to design, build, and demonstrate both a functional nanoscale robotic arm and a nanoscale computing device meeting the specifications.",
      conditions: "두 장치를 모두 실제로 제작해 공개된 기능·치수·검증 규격을 충족해야 한다. 개념 설계나 한 장치만의 시연으로는 충분하지 않다.",
      conditionsEn: "Both devices must be physically constructed and meet the published functional, dimensional, and verification specifications; a concept or only one device is insufficient.",
      sourceId: "foresight_feynman",
      rulesUrl: "https://foresight.org/prizes/feynman-prizes/",
      reviewedOn: "2026-08-05"
    },
    erdos_sunflower: {
      title: "Erdős 해바라기 문제 상금 제안",
      titleEn: "Erdős sunflower-problem prize offer",
      organization: "Paul Erdős의 역사적 제안 / Erdős Problems 기록",
      organizationEn: "Historical offer by Paul Erdős / recorded by Erdős Problems",
      type: "proof",
      status: "legacy",
      amount: "미화 1,000달러 제안",
      amountEn: "US$1,000 historical offer",
      amountShort: "US$1K · 역사적",
      amountShortEn: "US$1K · legacy",
      summary: "Erdős가 해바라기 수의 지수형 상한을 밝히는 문제에 제안한 금액이 현재 공개 문제 데이터베이스에 기록되어 있다.",
      summaryEn: "A public problem database records Erdős's offer for settling the exponential-bound form of the sunflower problem.",
      conditions: "공식 기관이 현재 지급을 보증하는 상금으로 확인되지 않으므로 ‘역사적 제안’으로만 표시한다. 실제 수령 가능성을 전제해서는 안 된다.",
      conditionsEn: "No current institutional guarantee of payment was verified, so this is shown only as a historical offer and must not be treated as presently claimable.",
      sourceId: "erdos_prizes",
      rulesUrl: "https://www.erdosproblems.com/20",
      reviewedOn: "2026-08-05"
    }
  };

  problems.forEach(problem => { problem.prizeIds = []; });

  function attach(problemIds, prizeId) {
    const prize = prizes[prizeId];
    problemIds.forEach(problemId => {
      const problem = problems.find(item => item.id === problemId);
      if (!problem || !prize) return;
      problem.prizeIds = [...new Set([...(problem.prizeIds || []), prizeId])];
      problem.sourceIds = [...new Set([...problem.sourceIds, prize.sourceId])];
    });
  }

  attach(["UP-036", "UP-056", "UP-316", "UP-317", "UP-320", "UP-328", "UP-346"], "clay_millennium");
  attach(["UP-170"], "xprize_healthspan");
  attach(["UP-632"], "xprize_quantum");
  attach(["UP-338"], "erdos_sunflower");

  let nextId = Math.max(...problems.map(item => Number(item.id.slice(3)))) + 1;
  function add(problem) {
    problems.push({
      id: `UP-${String(nextId++).padStart(3, "0")}`,
      feasibility: "open",
      reviewedOn: "2026-08-05",
      selectionBasis: "official-prize-challenge",
      ...problem
    });
  }

  add({
    question: "Beal 추측은 참인가?",
    questionEn: "Is the Beal Conjecture true?",
    discipline: "mathematics",
    subfield: "지수 디오판토스 방정식",
    subfieldEn: "Exponential Diophantine Equations",
    approach: "theory",
    nature: "fundamental",
    sourceIds: ["ams_beal"],
    themes: [],
    importance: "core",
    whyOpen: "지수가 모두 2보다 큰 방정식 Aˣ+Bʸ=Cᶻ의 해가 공통 소인수를 가져야 한다는 주장은 방대한 계산 검증에도 일반적으로 증명되거나 반박되지 않았다.",
    whyOpenEn: "Despite extensive computation, it is unknown in general whether every solution to Aˣ+Bʸ=Cᶻ with all exponents greater than two must have a common prime factor.",
    solvedWhen: "조건을 만족하는 모든 양의 정수 해에서 A·B·C가 공통 소인수를 가짐을 증명하거나, 조건을 만족하지만 공통 소인수가 없는 구체적 반례를 제시해야 한다.",
    solvedWhenEn: "A solution must prove that A, B, and C share a prime factor in every qualifying positive-integer solution, or exhibit a qualifying counterexample with no common prime factor.",
    prizeIds: ["beal_prize"]
  });

  add({
    question: "하루 100만 L 이상의 바닷물을 저비용·저에너지·낮은 생태영향으로 장기간 담수화할 수 있는가?",
    questionEn: "Can more than one million liters of seawater per day be desalinated for long periods at low cost, low energy use, and low ecological impact?",
    discipline: "materials",
    subfield: "담수화·분리재료",
    subfieldEn: "Desalination & Separation Materials",
    approach: "engineering",
    nature: "system",
    sourceIds: ["xprize_water"],
    themes: ["climate", "sustainability"],
    importance: "roadmap",
    whyOpen: "높은 회수율과 낮은 에너지·비용을 추구하면 막 오염, 농축수 처리, 재료 수명과 해양 생태영향이 함께 악화되어 장기 대규모 검증을 통과한 통합 해법이 없다.",
    whyOpenEn: "Pursuing high recovery at low energy and cost worsens fouling, brine disposal, material lifetime, and ecological impacts, leaving no integrated solution validated at large scale for long durations.",
    solvedWhen: "대표 해수 조건에서 최소 하루 100만 L의 음용수를 1년 이상 안정 생산하고, 비용·에너지·배출·농축수·생태영향 및 확장성 기준을 함께 충족해야 한다.",
    solvedWhenEn: "A system must reliably produce at least one million liters of potable water per day for a year under representative seawater conditions while jointly meeting cost, energy, emissions, brine, ecological-impact, and scalability criteria.",
    prizeIds: ["xprize_water"]
  });

  add({
    question: "광대한 지역의 초기 산불을 수분 안에 정확히 감지하고 사람 없이 자율 진압할 수 있는가?",
    questionEn: "Can incipient wildfires across vast areas be detected accurately within minutes and suppressed autonomously without human intervention?",
    discipline: "earth",
    subfield: "산불 감지·대응",
    subfieldEn: "Wildfire Detection & Response",
    approach: "engineering",
    nature: "system",
    sourceIds: ["xprize_wildfire"],
    themes: ["climate", "security", "ai"],
    importance: "roadmap",
    whyOpen: "연기·구름·지형·통신 단절과 오탐 속에서 작은 발화를 놓치지 않으면서, 안전한 자율 비행·표적 식별·진압을 대규모로 연결한 시스템이 아직 없다.",
    whyOpenEn: "No large-scale system yet combines reliable detection of tiny ignitions amid smoke, clouds, terrain, connectivity gaps, and decoys with safe autonomous navigation, targeting, and suppression.",
    solvedWhen: "실제 규모의 시험구역에서 모든 목표 발화를 정해진 시간 안에 탐지·위치결정·진압하고, 유사한 미끼 발화는 건드리지 않으며 안전성과 재현성을 입증해야 한다.",
    solvedWhenEn: "In a full-scale field test, a system must detect, locate, and suppress every target ignition within the specified time, leave decoys untouched, and demonstrate safety and reproducibility.",
    prizeIds: ["xprize_wildfire"]
  });

  add({
    question: "고정된 인간 지식 말뭉치를 더 작고 빠르게 무손실 압축하는 일반 지능형 모델을 만들 수 있는가?",
    questionEn: "Can a general intelligent model compress a fixed corpus of human knowledge losslessly, more compactly and efficiently than the current record?",
    discipline: "computer",
    subfield: "지능·데이터 압축",
    subfieldEn: "Intelligence & Data Compression",
    approach: "engineering",
    nature: "system",
    sourceIds: ["hutter_prize"],
    themes: ["ai"],
    importance: "roadmap",
    whyOpen: "더 나은 세계모형은 데이터를 더 짧게 기술할 수 있다는 생각은 강력하지만, 일반 지식·언어 구조를 학습하면서 엄격한 무손실·실행자원·재현성 제약을 모두 만족시키기 어렵다.",
    whyOpenEn: "The idea that a better world model yields a shorter description is powerful, but learning general knowledge and language structure while meeting strict lossless, resource, and reproducibility constraints remains difficult.",
    solvedWhen: "공개 규칙의 고정 말뭉치에서 압축기와 압축 데이터의 합산 크기를 현재 기록보다 줄이고, 제한된 시간·메모리에서 누구나 같은 결과를 재현해야 한다.",
    solvedWhenEn: "On the fixed corpus under the public rules, the combined compressor and data size must beat the current record and be reproducible by others within the runtime and memory limits.",
    prizeIds: ["hutter_compression"]
  });

  add({
    question: "공개·재현 가능한 분산계산으로 1억 자리와 10억 자리 소수를 발견할 수 있는가?",
    questionEn: "Can open, reproducible distributed computing discover primes with 100 million and one billion decimal digits?",
    discipline: "mathematics",
    subfield: "계산 수론",
    subfieldEn: "Computational Number Theory",
    approach: "engineering",
    nature: "scale",
    sourceIds: ["eff_coop"],
    themes: ["security"],
    importance: "major",
    whyOpen: "알려진 소수 탐색·검증법은 있지만 목표 규모에서는 막대한 계산량, 오류 검출, 분산 자원 조정과 결정론적 검증 자료의 생성이 함께 필요하다.",
    whyOpenEn: "Prime-search and verification methods are known, but the target scale demands immense computation, error detection, distributed resource coordination, and generation of a deterministic verification record.",
    solvedWhen: "각 자리수 문턱을 넘는 특정 정수를 발견하고 결정론적으로 소수임을 증명하며, 방법·코드·하드웨어와 검증 자료를 공개해 독립 재현을 가능하게 해야 한다.",
    solvedWhenEn: "A specific integer beyond each digit threshold must be discovered and deterministically proved prime, with methods, code, hardware, and verification data openly disclosed for independent reproduction.",
    prizeIds: ["eff_large_prime"]
  });

  add({
    question: "원자정밀 제조로 기능성 나노 로봇팔과 나노 계산장치를 모두 제작·시연할 수 있는가?",
    questionEn: "Can atomically precise manufacturing build and demonstrate both a functional nanoscale robotic arm and a nanoscale computing device?",
    discipline: "materials",
    subfield: "원자정밀 제조",
    subfieldEn: "Atomically Precise Manufacturing",
    approach: "engineering",
    nature: "system",
    sourceIds: ["foresight_feynman"],
    themes: ["quantum"],
    importance: "roadmap",
    whyOpen: "개별 분자기계와 나노소자는 발전했지만, 원자 수준 제작오차·구동·에너지 공급·입출력·오류·조립을 통합해 규정된 두 기능 시스템으로 구현하지 못했다.",
    whyOpenEn: "Individual molecular machines and nanodevices have advanced, but atom-scale fabrication error, actuation, power, input-output, error control, and assembly have not been integrated into both specified functional systems.",
    solvedWhen: "공개 규격에 맞는 나노 로봇팔과 나노 계산장치를 실제 제작하고, 독립된 시험에서 요구된 이동·조작·계산 기능과 치수를 모두 검증해야 한다.",
    solvedWhenEn: "Both a nanoscale robotic arm and computing device must be physically built to the public specifications and independently verified for the required motion, manipulation, computation, and dimensions.",
    prizeIds: ["feynman_grand"]
  });

  window.CATALOG_PRIZES = prizes;
})();
