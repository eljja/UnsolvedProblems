/* Evidence-led expansion: no per-discipline or per-subfield count quotas. */
(function () {
  "use strict";

  const meta = window.CATALOG_META;
  const sources = window.CATALOG_SOURCES;
  const problems = window.PROBLEMS;

  meta.importance = {
    core: {
      label: "핵심 난제",
      labelEn: "Core open problem",
      color: "#b64b32",
      rank: 4,
      description: "오랫동안 분야의 방향을 규정해 온 명명된 난제 또는 여러 연구축을 바꿀 수 있는 질문",
      descriptionEn: "A named or field-defining question whose resolution could redirect several lines of research."
    },
    roadmap: {
      label: "로드맵 우선과제",
      labelEn: "Roadmap priority",
      color: "#d28b2f",
      rank: 3,
      description: "학술원·연구기관·학회 로드맵에서 현재의 전략적 우선순위로 반복 제시된 질문",
      descriptionEn: "A question repeatedly identified as a current strategic priority in authoritative research roadmaps."
    },
    major: {
      label: "주요 프런티어",
      labelEn: "Major frontier",
      color: "#4f8791",
      rank: 2,
      description: "전문 분야에서 과학적·기술적 파급력이 큰 미해결 연구 프런티어",
      descriptionEn: "A consequential unresolved frontier recognized within its specialist research community."
    },
    boundary: {
      label: "불가능 경계",
      labelEn: "Impossibility boundary",
      color: "#7e648c",
      rank: 1,
      description: "미해결 질문과 구별해 표시한 이론적 불가능 또는 정보·현실의 절대적 경계",
      descriptionEn: "A theoretical, informational, or practical boundary shown separately from open research questions."
    }
  };

  Object.assign(sources, {
    p5_2023: {
      discipline: "physics",
      title: "DOE/NSF — 2023 Particle Physics Project Prioritization Panel (P5)",
      url: "https://science.osti.gov/hep/Community-Resources/Reports"
    },
    astro2020: {
      discipline: "physics",
      title: "National Academies — Pathways to Discovery in Astronomy and Astrophysics for the 2020s",
      url: "https://nap.nationalacademies.org/catalog/26141/pathways-to-discovery-in-astronomy-and-astrophysics-for-the-2020s"
    },
    bes_grand: {
      discipline: "chemistry",
      title: "DOE Basic Energy Sciences — Grand Challenges",
      url: "https://science.osti.gov/bes/efrc/Research/Grand-Challenges"
    },
    nhgri_vision: {
      discipline: "biology",
      title: "NHGRI — 2020 Strategic Vision for Human Genomics",
      url: "https://www.genome.gov/2020SV"
    },
    nih_plan: {
      discipline: "biology",
      title: "NIH — NIH-Wide Strategic Plan",
      url: "https://www.nih.gov/about-nih/nih-wide-strategic-plan"
    },
    cise_future: {
      discipline: "computer",
      title: "NSF CISE — Future Computing Research",
      url: "https://www.nsf.gov/funding/opportunities/future-core-computer-information-science-engineering-future-computing"
    },
    nhlbi_vision: {
      discipline: "medicine",
      title: "NHLBI — Strategic Vision and Compelling Questions",
      url: "https://www.nhlbi.nih.gov/about/strategic-vision"
    },
    ninds_priorities: {
      discipline: "medicine",
      title: "NINDS — Research Priorities",
      url: "https://www.ninds.nih.gov/funding/about-funding/ninds-research-priorities"
    },
    nasa_taxonomy: {
      discipline: "mechanical",
      title: "NASA — 2024 Technology Taxonomy",
      url: "https://www.nasa.gov/wp-content/uploads/2024/10/nasa-2024-technology-taxonomy-report-low-resolution-final-20240730-tagged.pdf"
    },
    obssr_plan: {
      discipline: "cognitive",
      title: "NIH OBSSR — Strategic Plan 2025–2029 Research Priorities",
      url: "https://obssr.od.nih.gov/about/strategic-plan-2025-2029/research-priorities"
    },
    usda_blueprint: {
      discipline: "agriculture",
      title: "USDA — Science Blueprint",
      url: "https://www.usda.gov/sites/default/files/documents/usda-science-blueprint.pdf"
    },
    nas_dbasse_priority: {
      discipline: "social",
      title: "National Academies — Behavioral and Social Sciences Research Priorities",
      url: "https://www.nationalacademies.org/dbasse/division-of-behavioral-and-social-sciences-and-education"
    }
  });

  const coreIds = new Set([
    "UP-001", "UP-002", "UP-004", "UP-012", "UP-021", "UP-022", "UP-026", "UP-031", "UP-036", "UP-037",
    "UP-074", "UP-079", "UP-084", "UP-089", "UP-099", "UP-100", "UP-101", "UP-105", "UP-114",
    "UP-127", "UP-132", "UP-147", "UP-152", "UP-153", "UP-157", "UP-162", "UP-172", "UP-177",
    "UP-190", "UP-210", "UP-220", "UP-230", "UP-235", "UP-250",
    "UP-253", "UP-258", "UP-259", "UP-263", "UP-273", "UP-278", "UP-283", "UP-293", "UP-303", "UP-305",
    "UP-316", "UP-317", "UP-318", "UP-319", "UP-320", "UP-321", "UP-322", "UP-324", "UP-328", "UP-332", "UP-336", "UP-337", "UP-340",
    "UP-346", "UP-347", "UP-348", "UP-349", "UP-358", "UP-362", "UP-363", "UP-365",
    "UP-376", "UP-379", "UP-384", "UP-385", "UP-388", "UP-390",
    "UP-406", "UP-410", "UP-411", "UP-412", "UP-414", "UP-415", "UP-418", "UP-422",
    "UP-436", "UP-440", "UP-444", "UP-445", "UP-448", "UP-452",
    "UP-466", "UP-470", "UP-474", "UP-478", "UP-482", "UP-486",
    "UP-496", "UP-498", "UP-500", "UP-502", "UP-504", "UP-507", "UP-516", "UP-520",
    "UP-526", "UP-528", "UP-530", "UP-534", "UP-538", "UP-542", "UP-549", "UP-550"
  ]);

  problems.forEach(problem => {
    problem.importance = problem.nature === "boundary" ? "boundary" : (coreIds.has(problem.id) ? "core" : "major");
    problem.reviewedOn = "2026-08-01";
    problem.selectionBasis = coreIds.has(problem.id) ? "field-defining" : "curated-frontier";
  });

  const defaults = {
    fundamental: {
      ko: "여러 경쟁 설명이 남아 있고, 현재의 관측과 이론만으로 지배 원리를 판별하지 못한다.",
      en: "Competing explanations remain, and current observations and theory do not identify the governing principle.",
      solvedKo: "서로 다른 계와 조건을 설명하면서 경쟁 가설을 가르는 정량 예측이 독립적으로 검증되어야 한다.",
      solvedEn: "A solution must explain multiple systems and make independently verified quantitative predictions that discriminate among alternatives."
    },
    prediction: {
      ko: "자유도·상호작용·환경 의존성이 커서 현재 모형은 새로운 조건에서 신뢰할 수 있는 사전 예측을 하지 못한다.",
      en: "Many degrees of freedom, interactions, and environmental dependencies prevent reliable prediction in new conditions.",
      solvedKo: "보정에 쓰지 않은 조건과 규모에서 불확실성까지 포함한 사전 예측이 반복 검증되어야 한다.",
      solvedEn: "Prospective predictions, including calibrated uncertainty, must be repeatedly validated outside calibration conditions and scales."
    },
    measurement: {
      ko: "판별에 필요한 신호·기록·해상도 또는 비교 가능한 표준 데이터가 아직 부족하다.",
      en: "The signal, record, resolution, or comparable reference data needed to discriminate among answers is still missing.",
      solvedKo: "독립된 측정법과 연구집단이 필요한 감도·해상도로 같은 결론을 재현해야 한다.",
      solvedEn: "Independent methods and teams must reproduce the same conclusion at the required sensitivity and resolution."
    },
    scale: {
      ko: "원리 입증은 있지만 변동성·결함·비용·수명 문제가 실제 규모에서 함께 악화된다.",
      en: "Proofs of principle exist, but variability, defects, cost, and lifetime degrade together at realistic scale.",
      solvedKo: "현실적 규모와 운전 기간에서 성능·안전·수율·비용 목표가 동시에 재현되어야 한다.",
      solvedEn: "Performance, safety, yield, and cost targets must be reproduced together at realistic scale and operating duration."
    },
    system: {
      ko: "개별 요소의 개선이 다른 목표를 악화시켜 전체 시스템에서 검증된 해법이 없다.",
      en: "Improving one component degrades other objectives, leaving no validated whole-system solution.",
      solvedKo: "대표 환경의 종단 간 시험에서 안전성·성능·비용·지속가능성 목표를 함께 달성해야 한다.",
      solvedEn: "An end-to-end system must meet safety, performance, cost, and sustainability goals in representative environments."
    }
  };

  let nextId = Math.max(...problems.map(item => Number(item.id.slice(3)))) + 1;
  const additions = [];

  function add({ discipline, subfield, subfieldEn, approach, nature, feasibility = "open", sourceIds, themes = [], items }) {
    const copy = defaults[nature];
    items.forEach(([question, questionEn, importance = "roadmap", itemThemes]) => {
      additions.push({
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
        importance,
        whyOpen: copy.ko,
        whyOpenEn: copy.en,
        solvedWhen: copy.solvedKo,
        solvedWhenEn: copy.solvedEn,
        reviewedOn: "2026-08-01",
        selectionBasis: importance === "core" ? "field-defining" : "authoritative-roadmap"
      });
    });
  }

  // Physics — gaps identified against P5, Astro2020, and DOE BES priorities.
  add({ discipline: "physics", subfield: "힉스·정밀 대칭", subfieldEn: "Higgs & Precision Symmetries", approach: "hybrid", nature: "fundamental", sourceIds: ["p5_2023", "cern"], themes: ["quantum"], items: [
    ["힉스 보손의 자기결합과 힉스 퍼텐셜의 정확한 형태는 무엇인가?", "What are the Higgs boson's self-coupling and the exact shape of the Higgs potential?", "core"],
    ["전기약 대칭 깨짐은 힉스 장만으로 완전히 설명되는가?", "Is electroweak symmetry breaking fully explained by the Higgs field alone?"],
    ["하전 렙톤 맛깔 위반은 표준모형 예측을 넘어 관측되는가?", "Can charged-lepton flavor violation be observed beyond Standard Model predictions?"],
    ["전자·중성자 전기쌍극자 모멘트는 새로운 CP 위반을 드러내는가?", "Will electron or neutron electric dipole moments reveal new CP violation?"]
  ]});
  add({ discipline: "physics", subfield: "중성미자 정밀물리", subfieldEn: "Precision Neutrino Physics", approach: "experiment", nature: "measurement", sourceIds: ["p5_2023", "doe_hep"], themes: ["quantum"], items: [
    ["중성미자 질량의 순서와 렙톤 부문의 CP 위반은 무엇인가?", "What are the neutrino mass ordering and the amount of CP violation in the lepton sector?", "core"]
  ]});
  add({ discipline: "physics", subfield: "강한 상호작용", subfieldEn: "Strong Interactions", approach: "hybrid", nature: "fundamental", sourceIds: ["p5_2023", "doe_hep"], items: [
    ["QCD의 가둠과 양성자 질량의 출현을 하나의 계산으로 설명할 수 있는가?", "Can one calculation explain QCD confinement and the emergence of the proton's mass?", "core"]
  ]});
  add({ discipline: "physics", subfield: "태양·우주 플라즈마", subfieldEn: "Solar & Space Plasma", approach: "hybrid", nature: "prediction", sourceIds: ["astro2020", "nasa_dm"], themes: ["space", "security"], items: [
    ["태양 코로나는 어떻게 가열되고 태양풍은 어떻게 가속되는가?", "How is the solar corona heated, and how is the solar wind accelerated?"],
    ["나노헤르츠 중력파 배경을 만드는 천체와 초기우주 성분을 분리할 수 있는가?", "Can the astrophysical and primordial components of the nanohertz gravitational-wave background be separated?"]
  ]});

  // Chemistry — gaps from BES grand challenges and current chemical-science roadmaps.
  add({ discipline: "chemistry", subfield: "선택적 결합 활성화", subfieldEn: "Selective Bond Activation", approach: "hybrid", nature: "fundamental", sourceIds: ["bes_grand", "doe_catalysis"], themes: ["energy", "sustainability"], items: [
    ["메탄과 경질 알케인의 특정 C–H 결합만 온화하게 활성화할 수 있는가?", "Can one selected C–H bond in methane or light alkanes be activated under mild conditions?", "core"],
    ["재생전력으로 C–C와 C–N 결합을 고선택적으로 만드는 일반 전기합성 원리는 무엇인가?", "What general electrosynthetic principles enable highly selective C–C and C–N bond formation using renewable electricity?"]
  ]});
  add({ discipline: "chemistry", subfield: "분리·핵화학", subfieldEn: "Separations & Nuclear Chemistry", approach: "engineering", nature: "system", sourceIds: ["doe_chem", "bes_grand"], themes: ["energy", "sustainability", "security"], items: [
    ["사용후핵연료의 악티늄족과 핵분열생성물을 낮은 폐기물로 선택 분리할 수 있는가?", "Can actinides and fission products in spent nuclear fuel be selectively separated with little secondary waste?"],
    ["습도와 오염물 변화에도 낮은 재생에너지로 직접공기포집을 지속할 수 있는가?", "Can direct air capture operate with low regeneration energy despite changing humidity and contaminants?", "roadmap", ["climate", "sustainability"]]
  ]});
  add({ discipline: "chemistry", subfield: "순환 분자설계", subfieldEn: "Circular Molecular Design", approach: "engineering", nature: "scale", sourceIds: ["iupac", "bes_grand"], themes: ["sustainability"], items: [
    ["원재료와 같은 성능으로 무한에 가깝게 해중합·재중합되는 고분자를 설계할 수 있는가?", "Can polymers be designed for repeated depolymerization and repolymerization with virgin-equivalent performance?"],
    ["혼합 플라스틱을 분류 없이 고부가 단일 원료로 전환할 수 있는가?", "Can mixed plastics be converted into a high-value single feedstock without sorting?"]
  ]});
  add({ discipline: "chemistry", subfield: "기계·스핀 화학", subfieldEn: "Mechano- & Spin Chemistry", approach: "hybrid", nature: "fundamental", sourceIds: ["nsf_chem", "bes_grand"], themes: ["quantum"], items: [
    ["기계적 힘이 화학반응 경로와 선택성을 바꾸는 법칙을 사전 예측할 수 있는가?", "Can the way mechanical force changes reaction pathways and selectivity be predicted?"],
    ["키랄 분자의 스핀 선택성은 어떤 기작에서 나오며 보편적인가?", "What mechanism produces chirality-induced spin selectivity, and is it universal?"]
  ]});
  add({ discipline: "chemistry", subfield: "자율실험", subfieldEn: "Autonomous Experimentation", approach: "engineering", nature: "system", sourceIds: ["iupac", "nsf_chem"], themes: ["ai"], items: [
    ["자율실험실이 실패·음성 결과까지 학습해 새로운 반응을 재현 가능하게 발견할 수 있는가?", "Can autonomous laboratories learn from failed and negative results to discover reproducible new reactions?"]
  ]});

  // Biology — missing molecular, plant, host-pathogen, and biodiversity frontiers.
  add({ discipline: "biology", subfield: "단백질·RNA 동역학", subfieldEn: "Protein & RNA Dynamics", approach: "hybrid", nature: "prediction", sourceIds: ["nih_plan", "ncbi"], themes: ["health", "ai"], items: [
    ["서열과 세포 환경에서 단백질의 전체 동적 앙상블과 기능을 예측할 수 있는가?", "Can a protein's full dynamic ensemble and function be predicted from sequence and cellular environment?", "core"],
    ["RNA의 구조·변형·국소화·분해를 서열에서 통합 예측할 수 있는가?", "Can RNA structure, modification, localization, and decay be predicted jointly from sequence?"],
    ["무질서 단백질의 응축·결합·질병 기능을 일반 원리로 설명할 수 있는가?", "Can general principles explain the condensation, binding, and disease roles of intrinsically disordered proteins?"]
  ]});
  add({ discipline: "biology", subfield: "체세포 유전체·세포상태", subfieldEn: "Somatic Genomes & Cell States", approach: "hybrid", nature: "measurement", sourceIds: ["nhgri_vision", "hca"], themes: ["health"], items: [
    ["평생 축적되는 체세포 모자이크 변이가 정상 기능과 질병에 얼마나 기여하는가?", "How much do lifelong somatic mosaic variants contribute to normal function and disease?"],
    ["인간의 모든 세포상태와 상태 전환을 시간·공간적으로 지도화할 수 있는가?", "Can every human cell state and state transition be mapped across space and time?", "core"],
    ["같은 유전체가 세포형별 환경 반응을 다르게 만드는 인과 조절 규칙은 무엇인가?", "What causal regulatory rules make the same genome respond differently across cell types?"]
  ]});
  add({ discipline: "biology", subfield: "식물 시스템 생물학", subfieldEn: "Plant Systems Biology", approach: "hybrid", nature: "fundamental", sourceIds: ["nih_plan", "ncbi"], themes: ["climate", "sustainability"], items: [
    ["식물은 발달 신호와 빛·온도·물 스트레스를 어떻게 통합해 성장을 결정하는가?", "How do plants integrate developmental signals with light, temperature, and water stress to determine growth?"],
    ["식물–미생물 공생이 영양 획득과 면역을 함께 조절하는 보편 원리는 무엇인가?", "What general principles let plant–microbe symbioses coordinate nutrient acquisition and immunity?"]
  ]});
  add({ discipline: "biology", subfield: "숙주·병원체 진화", subfieldEn: "Host–Pathogen Evolution", approach: "hybrid", nature: "prediction", sourceIds: ["nih_plan", "ncbi"], themes: ["health", "security"], items: [
    ["동물 바이러스가 인간 전파 능력을 획득하는 진화 경로를 사전에 예측할 수 있는가?", "Can the evolutionary path by which animal viruses acquire human transmissibility be predicted?"],
    ["숙주와 병원체의 군비경쟁이 독성·전파성·면역회피를 어떻게 함께 결정하는가?", "How does host–pathogen coevolution jointly determine virulence, transmission, and immune escape?"]
  ]});
  add({ discipline: "biology", subfield: "생물권의 미지 다양성", subfieldEn: "Unknown Biosphere Diversity", approach: "experiment", nature: "measurement", sourceIds: ["ncbi", "nih_plan"], themes: ["climate", "sustainability"], items: [
    ["지구에 실제로 몇 종이 존재하며 미기록 미생물 계통의 기능은 무엇인가?", "How many species actually exist on Earth, and what functions do uncataloged microbial lineages perform?", "core"],
    ["깊은 지하 생물권의 범위·에너지 흐름·진화 속도는 무엇인가?", "What are the extent, energy flows, and evolutionary rates of the deep subsurface biosphere?"],
    ["환경 DNA만으로 생태계의 종·개체수·기능 변화를 정량 복원할 수 있는가?", "Can environmental DNA quantitatively reconstruct changes in species, abundance, and ecosystem function?"]
  ]});
  add({ discipline: "biology", subfield: "최소 생명·합성생물학", subfieldEn: "Minimal Life & Synthetic Biology", approach: "engineering", nature: "system", sourceIds: ["nih_plan", "ncbi"], themes: ["health", "security"], items: [
    ["독립적으로 성장·복제·진화하는 세포의 최소 구성은 무엇인가?", "What is the minimal composition of a cell capable of autonomous growth, replication, and evolution?", "core"],
    ["합성 유전자회로가 진화와 환경 변화에도 장기간 예측대로 작동하게 할 수 있는가?", "Can synthetic gene circuits remain predictable over long periods despite evolution and environmental change?"]
  ]});

  // Materials engineering — high-impact gaps not covered by the earlier equal-size groups.
  add({ discipline: "materials", subfield: "부식·환경열화", subfieldEn: "Corrosion & Environmental Degradation", approach: "hybrid", nature: "prediction", sourceIds: ["doe_materials", "nist_materials"], themes: ["security", "sustainability"], items: [
    ["국부 부식의 시작 위치와 시간을 실제 환경 이력에서 예측할 수 있는가?", "Can the location and time of localized-corrosion initiation be predicted from real environmental histories?", "core"],
    ["수소·방사선·염분이 결합된 환경의 재료 열화를 가속시험으로 재현할 수 있는가?", "Can accelerated tests reproduce degradation under coupled hydrogen, radiation, and salt environments?"]
  ]});
  add({ discipline: "materials", subfield: "시멘트·건설재료", subfieldEn: "Cement & Construction Materials", approach: "engineering", nature: "scale", sourceIds: ["doe_materials", "doe_critical"], themes: ["climate", "sustainability"], items: [
    ["포틀랜드 시멘트보다 탄소가 훨씬 적고 수백 년 내구성을 갖는 결합재를 보편적으로 만들 수 있는가?", "Can broadly deployable binders achieve far lower carbon than Portland cement and centuries of durability?"],
    ["노후 콘크리트의 내부 손상과 잔여수명을 비파괴로 정량화할 수 있는가?", "Can internal damage and remaining life in aging concrete be quantified non-destructively?"]
  ]});
  add({ discipline: "materials", subfield: "막·분리재료", subfieldEn: "Membranes & Separation Materials", approach: "engineering", nature: "system", sourceIds: ["bes_grand", "doe_materials"], themes: ["energy", "climate", "sustainability"], items: [
    ["투과도·선택도·오염저항·수명을 동시에 높이는 분리막 설계가 가능한가?", "Can membrane permeability, selectivity, fouling resistance, and lifetime be improved simultaneously?", "core"],
    ["분자 크기가 비슷한 혼합물을 열 없이 산업 규모로 분리할 수 있는가?", "Can mixtures of similarly sized molecules be separated at industrial scale without thermal processing?"]
  ]});
  add({ discipline: "materials", subfield: "비정질·복잡합금", subfieldEn: "Glasses & Complex Alloys", approach: "hybrid", nature: "fundamental", sourceIds: ["doe_materials", "nist_materials"], items: [
    ["유리의 구조와 이완 이력에서 취성·노화·유리전이를 예측할 수 있는가?", "Can brittleness, aging, and glass transition be predicted from a glass's structure and relaxation history?"],
    ["고엔트로피·복잡농축합금의 상과 장기 안정성을 조성에서 예측할 수 있는가?", "Can phases and long-term stability of high-entropy and complex-concentrated alloys be predicted from composition?"]
  ]});
  add({ discipline: "materials", subfield: "광전·메타재료", subfieldEn: "Optoelectronic & Metamaterials", approach: "engineering", nature: "scale", sourceIds: ["doe_materials", "bes_grand"], themes: ["energy", "quantum"], items: [
    ["페로브스카이트 태양전지를 독성·봉지·수명 문제 없이 대면적으로 제조할 수 있는가?", "Can perovskite solar cells be manufactured at large area without unresolved toxicity, encapsulation, and lifetime problems?"],
    ["손실이 낮고 넓은 대역에서 동작하는 재구성 가능 메타재료를 대면적으로 만들 수 있는가?", "Can low-loss, broadband, reconfigurable metamaterials be manufactured over large areas?"]
  ]});

  // Semiconductors — explicit seismic shifts in the SRC Decadal Plan and MAPT roadmap.
  add({ discipline: "semiconductor", subfield: "새 계산 궤적", subfieldEn: "New Computing Trajectories", approach: "engineering", nature: "system", sourceIds: ["src_decadal", "doe_micro"], themes: ["ai", "energy"], items: [
    ["현 세대 대비 백만 배 높은 시스템 에너지 효율을 주는 계산 패러다임을 실증할 수 있는가?", "Can a computing paradigm demonstrate a million-fold system-level energy-efficiency improvement over today's trajectory?", "core"],
    ["가변 정밀도와 희소성을 쓰는 AI 하드웨어가 정확도·안전·효율을 함께 보장할 수 있는가?", "Can AI hardware using variable precision and sparsity jointly guarantee accuracy, safety, and efficiency?"]
  ]});
  add({ discipline: "semiconductor", subfield: "데이터 이동·저장 한계", subfieldEn: "Data Movement & Storage Limits", approach: "engineering", nature: "scale", sourceIds: ["src_decadal", "src_mapt"], themes: ["ai", "energy"], items: [
    ["피크 1 Tb/s 통신을 0.1 nJ/bit 미만으로 시스템 전체에서 달성할 수 있는가?", "Can peak 1 Tb/s communication be achieved below 0.1 nJ/bit at whole-system level?"],
    ["실리콘 공급 증가보다 빠른 저장 수요를 100배 고밀도 비휘발성 기술로 감당할 수 있는가?", "Can nonvolatile technologies with 100-fold greater density meet storage demand growing faster than silicon supply?"]
  ]});
  add({ discipline: "semiconductor", subfield: "검증 가능한 이기종 집적", subfieldEn: "Verifiable Heterogeneous Integration", approach: "engineering", nature: "system", sourceIds: ["src_mapt", "nist_security"], themes: ["security"], items: [
    ["서로 다른 설계·공정의 칩렛을 공급망 전체에서 진품성과 무결성을 증명할 수 있는가?", "Can authenticity and integrity of chiplets from different designs and processes be proven across the supply chain?"],
    ["소자·회로·패키지·냉각·소프트웨어를 하나의 검증된 3차원 공동설계 흐름으로 묶을 수 있는가?", "Can devices, circuits, packages, cooling, and software be unified in one validated 3D co-design flow?"],
    ["극저온 CMOS가 양자 프로세서의 열·잡음·배선 한계를 실제 규모에서 줄일 수 있는가?", "Can cryogenic CMOS reduce the thermal, noise, and wiring limits of quantum processors at realistic scale?", "roadmap", ["quantum"]]
  ]});
  add({ discipline: "semiconductor", subfield: "팹 전환·지속가능성", subfieldEn: "Fab Transfer & Sustainability", approach: "engineering", nature: "prediction", sourceIds: ["src_mapt", "epa_semiconductor"], themes: ["sustainability"], items: [
    ["한 팹에서 학습한 공정 디지털 트윈을 다른 장비·팹에 예측력 손실 없이 이전할 수 있는가?", "Can a process digital twin learned in one fab transfer to different tools and fabs without losing predictive validity?"],
    ["첨단 노드의 성능 향상과 물·전력·화학물질 총사용량 감소를 동시에 달성할 수 있는가?", "Can advanced-node performance improve while total water, electricity, and chemical use all decline?"]
  ]});

  // Mathematics & statistics — named problem lists plus foundational statistical gaps.
  add({ discipline: "mathematics", subfield: "수론의 고전 난제", subfieldEn: "Classical Number-Theory Problems", approach: "theory", nature: "fundamental", sourceIds: ["aim_math", "nsf_math"], items: [
    ["콜라츠 추측은 모든 양의 정수에 대해 참인가?", "Is the Collatz conjecture true for every positive integer?", "core"],
    ["샤누엘 추측은 복소수 지수함수의 대수적 독립성을 정확히 기술하는가?", "Does Schanuel's conjecture correctly characterize algebraic independence for the complex exponential function?", "core"],
    ["1이 아닌 홀수 완전수는 존재하는가?", "Does an odd perfect number exist?", "core"],
    ["모든 n≥2에 대해 4/n을 세 단위분수의 합으로 쓸 수 있는가?", "Can 4/n be written as a sum of three unit fractions for every integer n at least two?"],
    ["모든 연속한 제곱수 사이에는 소수가 존재하는가?", "Is there always a prime between consecutive perfect squares?"],
    ["모든 면 대각선과 공간 대각선이 정수인 완전 직육면체가 존재하는가?", "Does a perfect cuboid with all integer face and space diagonals exist?"]
  ]});
  add({ discipline: "mathematics", subfield: "랑글랜즈·대수적 순환", subfieldEn: "Langlands & Algebraic Cycles", approach: "theory", nature: "fundamental", sourceIds: ["aim_math", "nsf_math"], items: [
    ["랑글랜즈 함자성 원리는 모든 관련 환원군에 대해 성립하는가?", "Does Langlands functoriality hold for all relevant reductive groups?", "core"],
    ["테이트 추측은 유한생성 체 위 대수다양체의 순환을 정확히 기술하는가?", "Does the Tate conjecture correctly describe algebraic cycles on varieties over finitely generated fields?", "core"],
    ["대수적 순환에 관한 표준 추측들은 참인가?", "Are the standard conjectures on algebraic cycles true?", "core"],
    ["퐁텐–마주르 추측은 기하에서 오는 갈루아 표현을 정확히 분류하는가?", "Does the Fontaine–Mazur conjecture correctly classify Galois representations arising from geometry?"],
    ["바움–콘 추측은 모든 국소콤팩트 군에 대해 성립하는가?", "Does the Baum–Connes conjecture hold for every locally compact group?"]
  ]});
  add({ discipline: "mathematics", subfield: "기하측도·해석", subfieldEn: "Geometric Measure Theory & Analysis", approach: "theory", nature: "fundamental", sourceIds: ["aim_math", "nsf_math"], items: [
    ["카케야 집합은 모든 차원에서 전체 하우스도르프 차원을 갖는가?", "Do Kakeya sets have full Hausdorff dimension in every dimension?", "core"],
    ["팔코너 거리 추측의 임계 차원 경계는 참인가?", "Is the critical dimension bound in Falconer's distance conjecture correct?"],
    ["3차원 이징 모형의 임계거동을 엄밀하고 정확하게 결정할 수 있는가?", "Can the critical behavior of the three-dimensional Ising model be determined rigorously and exactly?", "core"]
  ]});
  add({ discipline: "mathematics", subfield: "극단조합론", subfieldEn: "Extremal Combinatorics", approach: "theory", nature: "fundamental", sourceIds: ["aim_math", "nsf_math"], items: [
    ["로타의 기저 추측은 모든 매트로이드와 기저 모음에 성립하는가?", "Does Rota's basis conjecture hold for every matroid and collection of bases?"],
    ["카체타–해그크비스트 추측은 모든 유향그래프에 성립하는가?", "Does the Caccetta–Häggkvist conjecture hold for every directed graph?"],
    ["평면의 단위거리 그래프 색칠수는 정확히 얼마인가?", "What is the exact chromatic number of the plane?", "core"]
  ]});
  add({ discipline: "mathematics", subfield: "통계 추론의 기초", subfieldEn: "Foundations of Statistical Inference", approach: "theory", nature: "prediction", sourceIds: ["nsf_math", "aim_math"], themes: ["ai"], items: [
    ["숨은 교란과 선택 편향이 있을 때 관측자료만으로 인과구조를 어디까지 식별할 수 있는가?", "How much causal structure is identifiable from observational data with hidden confounding and selection bias?", "core"],
    ["분포 이동 뒤에도 유효한 불확실성 구간을 유한 표본에서 보장할 수 있는가?", "Can finite-sample uncertainty intervals remain valid after distribution shift?"],
    ["모형·변수·가설을 데이터로 선택한 뒤에도 정확한 추론을 일반적으로 수행할 수 있는가?", "Can exact inference be performed generally after models, variables, or hypotheses are selected from the same data?"],
    ["고차원 비모수 추론의 계산 가능성과 통계적 최적성 사이 간극은 무엇인가?", "What is the gap between computational feasibility and statistical optimality in high-dimensional nonparametric inference?"],
    ["차등 개인정보보호 아래에서 복잡한 적응형 분석의 통계적 유효성을 보장할 수 있는가?", "Can statistical validity be guaranteed for complex adaptive analyses under differential privacy?", "roadmap", ["ai", "security"]],
    ["무작위가 아닌 결측의 생성과정을 알지 못해도 모집단 결론을 식별할 수 있는가?", "Can population conclusions be identified when the mechanism producing non-random missingness is unknown?"]
  ]});

  // Computer science & AI — NSF CISE foundations, systems, quantum, security, and human-centered computing.
  add({ discipline: "computer", subfield: "복잡도 하한", subfieldEn: "Complexity Lower Bounds", approach: "theory", nature: "fundamental", sourceIds: ["nsf_cise", "cise_future"], themes: ["quantum"], items: [
    ["NP 문제에 대한 일반 회로 하한을 증명할 수 있는가?", "Can general circuit lower bounds be proved for problems in NP?", "core"],
    ["그래프 동형성 문제는 결정적 다항시간에 풀 수 있는가?", "Can graph isomorphism be solved in deterministic polynomial time?", "core"],
    ["양자우위가 잡음·입출력 비용을 포함한 유용한 문제에서도 유지되는 정확한 조건은 무엇인가?", "Under what exact conditions does quantum advantage survive noise and input-output costs on useful problems?"]
  ]});
  add({ discipline: "computer", subfield: "검증 가능한 양자계산", subfieldEn: "Verifiable Quantum Computing", approach: "hybrid", nature: "system", sourceIds: ["nsf_cise", "doe_qis"], themes: ["quantum", "security"], items: [
    ["실용적 오버헤드로 범용 결함허용 양자계산을 달성할 수 있는가?", "Can universal fault-tolerant quantum computation be achieved with practical overhead?", "core"],
    ["고전 검증자가 대규모 양자계산의 정답을 효율적으로 인증할 수 있는가?", "Can a classical verifier efficiently certify the result of a large quantum computation?"]
  ]});
  add({ discipline: "computer", subfield: "프로그램 합성·전스택 검증", subfieldEn: "Program Synthesis & Full-Stack Verification", approach: "engineering", nature: "system", sourceIds: ["cise_future", "nsf_cise"], themes: ["security"], items: [
    ["불완전한 자연어 요구사항에서 의도에 맞는 프로그램과 증명을 함께 합성할 수 있는가?", "Can a program and its proof be synthesized jointly from incomplete natural-language requirements?"],
    ["하드웨어에서 운영체제·컴파일러·응용까지 종단 간 보안 속성을 조합적으로 증명할 수 있는가?", "Can end-to-end security properties be proved compositionally from hardware through operating system, compiler, and application?", "core"]
  ]});
  add({ discipline: "computer", subfield: "적대 환경 분산시스템", subfieldEn: "Distributed Systems in Adversarial Environments", approach: "engineering", nature: "system", sourceIds: ["cise_future", "nist_cyber"], themes: ["security"], items: [
    ["구성원이 계속 바뀌는 비동기 네트워크에서 비잔틴 안전성과 활성을 함께 보장할 수 있는가?", "Can Byzantine safety and liveness both be guaranteed in an asynchronous network with continuously changing membership?"],
    ["경로 탈취·검열·대규모 장애에 강한 인터넷 라우팅을 점진적으로 배포할 수 있는가?", "Can Internet routing resilient to hijacking, censorship, and large failures be deployed incrementally?"]
  ]});
  add({ discipline: "computer", subfield: "AI 감독·정렬 검증", subfieldEn: "AI Oversight & Alignment Verification", approach: "hybrid", nature: "measurement", sourceIds: ["nist_ai", "cise_future"], themes: ["ai", "security"], items: [
    ["인간보다 복잡한 산출물을 내는 AI를 신뢰성 있게 확장 감독할 수 있는가?", "Can AI outputs more complex than human evaluators can produce be overseen reliably at scale?", "core"],
    ["AI의 기만·상황인식·목표 불일치를 배포 전에 판별하는 평가가 가능한가?", "Can evaluations detect deception, situational awareness, and goal misalignment before deployment?"],
    ["기계적 해석으로 특정 내부 회로가 행동의 원인임을 검증할 수 있는가?", "Can mechanistic interpretability verify that a particular internal circuit causally produces a behavior?"]
  ]});
  add({ discipline: "computer", subfield: "지속학습·기억", subfieldEn: "Continual Learning & Memory", approach: "hybrid", nature: "fundamental", sourceIds: ["nsf_cise", "cise_future"], themes: ["ai"], items: [
    ["학습 시스템이 치명적 망각 없이 새 기술을 평생 축적하고 조합할 수 있는가?", "Can a learning system accumulate and compose new skills throughout its lifetime without catastrophic forgetting?"],
    ["신경망이 변수·관계·규칙을 조합적으로 재사용하는 체계적 일반화를 달성할 수 있는가?", "Can neural networks achieve systematic generalization by compositionally reusing variables, relations, and rules?"]
  ]});
  add({ discipline: "computer", subfield: "데이터 권리·모델 삭제", subfieldEn: "Data Rights & Model Deletion", approach: "engineering", nature: "system", sourceIds: ["nist_ai", "nist_cyber"], themes: ["ai", "security"], items: [
    ["대형 학습모형에서 특정 데이터의 영향을 완전하고 검증 가능하게 삭제할 수 있는가?", "Can the influence of selected data be removed completely and verifiably from a large trained model?"],
    ["개인정보·공정성·정확도 사이의 상충을 실제 모집단 변화 속에서 보증할 수 있는가?", "Can privacy, fairness, and accuracy tradeoffs be guaranteed as real populations change?"]
  ]});
  add({ discipline: "computer", subfield: "인간–AI 집단지능", subfieldEn: "Human–AI Collective Intelligence", approach: "hybrid", nature: "prediction", sourceIds: ["nsf_cise", "cise_future"], themes: ["ai", "security"], items: [
    ["사람과 AI의 결합 판단이 양쪽보다 더 정확하면서 책임소재도 보존되는 조건은 무엇인가?", "Under what conditions can joint human–AI decisions outperform both while preserving accountability?"],
    ["계산량이 증가해도 전체 수명주기 에너지·물·탄소 사용을 감소시키는 컴퓨팅 체계를 만들 수 있는가?", "Can computing systems reduce lifecycle energy, water, and carbon use even as computational demand grows?", "roadmap", ["ai", "energy", "sustainability"]]
  ]});

  // Earth & environmental science — top-level Earth-system targets and observation gaps.
  add({ discipline: "earth", subfield: "심부지구·행성 분화", subfieldEn: "Deep Earth & Planetary Differentiation", approach: "hybrid", nature: "fundamental", sourceIds: ["nas_esas", "doe_eess"], themes: ["climate"], items: [
    ["지구의 핵·맨틀·지각은 언제 어떤 과정으로 분화했는가?", "When and by what processes did Earth's core, mantle, and crust differentiate?", "core"],
    ["대륙지각은 어떻게 시작되었고 장기간 유지되는가?", "How did continental crust originate, and how is it maintained over geologic time?"],
    ["탄소와 물은 섭입대와 맨틀을 거쳐 얼마나 빠르게 순환하는가?", "How rapidly do carbon and water cycle through subduction zones and the mantle?"]
  ]});
  add({ discipline: "earth", subfield: "지진 핵생성·느린 미끄럼", subfieldEn: "Earthquake Nucleation & Slow Slip", approach: "hybrid", nature: "measurement", sourceIds: ["usgs_hazards", "nas_esas"], themes: ["security"], items: [
    ["큰 지진에는 관측 가능한 보편적 핵생성 단계가 존재하는가?", "Do large earthquakes have an observable universal nucleation phase?", "core"],
    ["느린 미끄럼과 유체 이동은 거대지진의 시기와 규모를 어떻게 바꾸는가?", "How do slow slip and fluid migration alter the timing and size of great earthquakes?"],
    ["지열·탄소저장·자원개발이 유발할 최대 지진 규모를 사전에 제한할 수 있는가?", "Can the maximum earthquake induced by geothermal operations, carbon storage, or resource extraction be bounded in advance?"]
  ]});
  add({ discipline: "earth", subfield: "대기 산화·몬순", subfieldEn: "Atmospheric Oxidation & Monsoons", approach: "hybrid", nature: "prediction", sourceIds: ["noaa_research", "nas_esas"], themes: ["climate", "health"], items: [
    ["대기의 산화능과 OH 라디칼 분포가 오염물·메탄 수명을 어떻게 결정하는가?", "How do atmospheric oxidizing capacity and OH distributions determine pollutant and methane lifetimes?"],
    ["아시아·아프리카 몬순의 급격한 전환과 지역 강수 임계값을 예측할 수 있는가?", "Can abrupt transitions and regional rainfall thresholds in Asian and African monsoons be predicted?"]
  ]});
  add({ discipline: "earth", subfield: "해양 생지화학 변화", subfieldEn: "Changing Ocean Biogeochemistry", approach: "hybrid", nature: "prediction", sourceIds: ["noaa_research", "nas_esas"], themes: ["climate", "sustainability"], items: [
    ["해양 탈산소화와 산성화가 먹이망과 탄소펌프를 함께 어떻게 바꿀 것인가?", "How will ocean deoxygenation and acidification jointly alter food webs and the biological carbon pump?", "core"],
    ["연안 저산소수역과 유해조류 대발생의 임계 전환을 사전에 예측할 수 있는가?", "Can tipping transitions in coastal dead zones and harmful algal blooms be predicted in advance?"]
  ]});
  add({ discipline: "earth", subfield: "탄소제거 검증", subfieldEn: "Carbon-Removal Verification", approach: "engineering", nature: "measurement", sourceIds: ["doe_eess", "nas_esas"], themes: ["climate", "sustainability"], items: [
    ["대규모 이산화탄소 제거의 추가성·누출·영구성을 수십 년 동안 검증할 수 있는가?", "Can additionality, leakage, and permanence of large-scale carbon dioxide removal be verified over decades?", "core"],
    ["지중 탄소저장의 단층 누출과 압력 전파를 주입 전에 신뢰성 있게 예측할 수 있는가?", "Can fault leakage and pressure propagation in geologic carbon storage be predicted reliably before injection?"]
  ]});
  add({ discipline: "earth", subfield: "지하수 오염의 유산", subfieldEn: "Groundwater Contamination Legacies", approach: "hybrid", nature: "prediction", sourceIds: ["usgs_hazards", "doe_eess"], themes: ["health", "sustainability"], items: [
    ["수십 년 축적된 질산염·비소·PFAS 오염의 이동과 회복 시간을 유역 규모로 예측할 수 있는가?", "Can the transport and recovery time of decades-old nitrate, arsenic, and PFAS contamination be predicted at watershed scale?"]
  ]});

  // Medicine & health — major disease systems missing from the earlier quota-limited catalog.
  add({ discipline: "medicine", subfield: "심혈관 질환", subfieldEn: "Cardiovascular Disease", approach: "hybrid", nature: "prediction", sourceIds: ["nhlbi_vision", "nih_common"], themes: ["health"], items: [
    ["동맥경화반을 안전하게 퇴행시키고 파열 위험을 없앨 수 있는가?", "Can atherosclerotic plaques be regressed safely and their rupture risk eliminated?", "core"],
    ["박출률 보존 심부전의 서로 다른 기전을 환자별로 분류하고 치료할 수 있는가?", "Can the distinct mechanisms of heart failure with preserved ejection fraction be classified and treated patient by patient?"],
    ["치명적 부정맥과 돌연사를 발생 전에 정확히 예측하고 예방할 수 있는가?", "Can lethal arrhythmias and sudden cardiac death be predicted and prevented before they occur?", "core"],
    ["고혈압의 개인별 지배 기전을 측정해 원인 치료를 선택할 수 있는가?", "Can each patient's dominant mechanism of hypertension be measured to select causal treatment?"]
  ]});
  add({ discipline: "medicine", subfield: "대사·비만·간질환", subfieldEn: "Metabolism, Obesity & Liver Disease", approach: "hybrid", nature: "fundamental", sourceIds: ["nih_common", "nhlbi_vision"], themes: ["health"], items: [
    ["체중의 생리적 설정점은 어떻게 만들어지고 안전하게 장기 재설정될 수 있는가?", "How is the physiological body-weight set point established, and can it be reset safely for the long term?", "core"],
    ["제2형 당뇨병의 이질적 원인을 구분해 지속적 관해를 예측할 수 있는가?", "Can heterogeneous causes of type 2 diabetes be distinguished to predict durable remission?"],
    ["지방간이 염증·섬유화·간암으로 진행하는 환자를 조기에 판별하고 되돌릴 수 있는가?", "Can patients whose fatty liver will progress to inflammation, fibrosis, and cancer be identified early and reversed?"],
    ["제1형 당뇨병의 자가면역을 정상 방어면역을 보존하며 항원 특이적으로 멈출 수 있는가?", "Can type 1 diabetes autoimmunity be stopped antigen-specifically while preserving normal immune defense?"]
  ]});
  add({ discipline: "medicine", subfield: "통증·여성·생식 건강", subfieldEn: "Pain, Women's & Reproductive Health", approach: "hybrid", nature: "fundamental", sourceIds: ["nih_common", "nih_plan"], themes: ["health"], items: [
    ["만성 통증이 조직 손상과 분리되어 지속되는 신경·면역 기전은 무엇인가?", "What neural and immune mechanisms let chronic pain persist after it separates from tissue damage?", "core"],
    ["중독·진정 없이 다양한 만성 통증을 장기간 조절할 수 있는가?", "Can diverse chronic pain conditions be controlled long term without addiction or sedation?"],
    ["자궁내막증의 원인을 밝히고 수술 없이 조기 진단할 수 있는가?", "Can the causes of endometriosis be established and the disease diagnosed early without surgery?", "core"],
    ["자간전증을 임상 발병 전에 예측하고 산모·태아 모두에게 안전하게 예방할 수 있는가?", "Can preeclampsia be predicted before clinical onset and prevented safely for both mother and fetus?"],
    ["조산과 사산으로 이어지는 서로 다른 경로를 구분해 예방할 수 있는가?", "Can the distinct pathways leading to preterm birth and stillbirth be distinguished and prevented?"]
  ]});
  add({ discipline: "medicine", subfield: "지속감염·치료", subfieldEn: "Persistent Infection & Cure", approach: "hybrid", nature: "fundamental", sourceIds: ["niaid_research", "who_research"], themes: ["health", "security"], items: [
    ["HIV 저장소를 제거하거나 평생 치료 없이 억제하는 완치가 가능한가?", "Can HIV reservoirs be eliminated or controlled without lifelong therapy?", "core"],
    ["결핵균의 잠복·재활성화를 결정하는 숙주와 세균의 상태는 무엇인가?", "What host and bacterial states determine tuberculosis latency and reactivation?"],
    ["패혈증의 서로 다른 면역·대사 아형을 수시간 안에 구분해 맞춤 치료할 수 있는가?", "Can distinct immune and metabolic endotypes of sepsis be identified within hours and treated accordingly?", "core"],
    ["감염 뒤 장기 증후군의 바이러스 잔존·면역·신경 기전을 환자별로 구분할 수 있는가?", "Can viral persistence, immune, and neural mechanisms of post-infectious syndromes be distinguished patient by patient?"]
  ]});
  add({ discipline: "medicine", subfield: "장기 기능 회복", subfieldEn: "Restoration of Organ Function", approach: "engineering", nature: "system", sourceIds: ["nih_common", "ninds_priorities"], themes: ["health"], items: [
    ["만성콩팥병의 진행을 멈추고 손실된 네프론 기능을 회복할 수 있는가?", "Can chronic kidney disease progression be stopped and lost nephron function restored?"],
    ["손상된 달팽이관 유모세포와 청신경 연결을 재생해 자연 청력을 회복할 수 있는가?", "Can cochlear hair cells and auditory-nerve connections be regenerated to restore natural hearing?"],
    ["망막 신경세포와 시신경을 재생해 성인 시각 경로를 다시 연결할 수 있는가?", "Can retinal neurons and the optic nerve be regenerated to reconnect adult visual pathways?"],
    ["뇌졸중 뒤 기능 회복을 제한하는 회로와 면역 환경을 안전하게 재설정할 수 있는가?", "Can the circuitry and immune environment limiting recovery after stroke be reset safely?"]
  ]});
  add({ discipline: "medicine", subfield: "예방·건강격차", subfieldEn: "Prevention & Health Disparities", approach: "hybrid", nature: "system", sourceIds: ["who_research", "nhlbi_vision"], themes: ["health", "sustainability"], items: [
    ["효과적인 예방·치료가 지역·소득·인종에 따라 다른 성과를 내는 기전을 제거할 수 있는가?", "Can the mechanisms causing effective prevention and treatment to yield different outcomes across place, income, and race be eliminated?"],
    ["여러 만성질환과 다약제 복용을 가진 노인의 치료를 질병별 지침보다 안전하게 최적화할 수 있는가?", "Can care for older adults with multimorbidity and polypharmacy be optimized more safely than disease-by-disease guidelines?"]
  ]});

  // Mechanical, aerospace & robotics — underrepresented physics, reliability, and mission-system gaps.
  add({ discipline: "mechanical", subfield: "마찰·마모·윤활", subfieldEn: "Friction, Wear & Lubrication", approach: "hybrid", nature: "prediction", sourceIds: ["nasa_taxonomy", "nist_manufacturing"], themes: ["energy", "sustainability"], items: [
    ["마찰계수와 마모수명을 원자·표면 상태에서 실제 접촉 규모까지 예측할 수 있는가?", "Can friction coefficients and wear life be predicted from atomic and surface states up to real contact scales?", "core"],
    ["윤활막이 끊어지는 순간과 스커핑·시저의 시작을 운전 중 예측할 수 있는가?", "Can lubricant-film breakdown and the onset of scuffing or seizure be predicted during operation?"],
    ["액체 윤활 없이 극한 온도·진공·방사선에서 장수명 기계 접촉을 만들 수 있는가?", "Can long-life mechanical contacts operate without liquid lubricants under extreme temperature, vacuum, and radiation?"]
  ]});
  add({ discipline: "mechanical", subfield: "비등·열관리 한계", subfieldEn: "Boiling & Thermal Limits", approach: "hybrid", nature: "fundamental", sourceIds: ["nasa_taxonomy", "doe_manufacturing"], themes: ["energy"], items: [
    ["복잡한 표면과 유동에서 비등 위기와 임계 열유속을 사전에 예측할 수 있는가?", "Can boiling crisis and critical heat flux be predicted on complex surfaces and in complex flows?", "core"],
    ["펌프 없이 넓은 열부하 범위를 안정적으로 처리하는 수동 열관리계를 만들 수 있는가?", "Can passive thermal-management systems handle a wide heat-load range stably without pumps?"]
  ]});
  add({ discipline: "mechanical", subfield: "연소 불안정·신추진", subfieldEn: "Combustion Instability & Advanced Propulsion", approach: "hybrid", nature: "prediction", sourceIds: ["nasa_taxonomy", "nasa_armd"], themes: ["energy", "security"], items: [
    ["고압 반응유동의 연소 불안정을 설계 전에 예측하고 넓은 운전영역에서 억제할 수 있는가?", "Can combustion instability in high-pressure reacting flows be predicted before design and suppressed over a wide operating envelope?", "core"],
    ["회전폭굉·압력증가 연소가 내구성·배출·제어를 포함해 기존 터빈보다 우수할 수 있는가?", "Can rotating-detonation or pressure-gain combustion outperform conventional turbines when durability, emissions, and control are included?"]
  ]});
  add({ discipline: "mechanical", subfield: "인간–로봇 신체 증강", subfieldEn: "Human–Robot Physical Augmentation", approach: "engineering", nature: "system", sourceIds: ["nasa_taxonomy", "nasa_autonomy"], themes: ["health", "security"], items: [
    ["외골격이 사용자의 의도·피로·부상위험을 실시간 추정해 에너지 비용 없이 자연스럽게 보조할 수 있는가?", "Can an exoskeleton infer intent, fatigue, and injury risk in real time and assist naturally without increasing metabolic cost?"],
    ["사람과 로봇이 물리적 접촉 작업을 하면서 충돌·오해·책임 위험을 함께 제한할 수 있는가?", "Can people and robots share contact-rich work while jointly bounding collision, misunderstanding, and accountability risks?"]
  ]});
  add({ discipline: "mechanical", subfield: "자율 정비·우주 조립", subfieldEn: "Autonomous Maintenance & In-Space Assembly", approach: "engineering", nature: "system", sourceIds: ["nasa_taxonomy", "nasa_autonomy"], themes: ["space", "security"], items: [
    ["사람과 지상 지원 없이 우주 시스템이 고장을 진단하고 부품을 수리·재제조할 수 있는가?", "Can a space system diagnose failures and repair or remanufacture parts without crew or ground support?"],
    ["수백 미터급 우주 구조물을 궤도에서 정밀 조립하고 형상·진동을 유지할 수 있는가?", "Can hundred-meter-scale space structures be assembled in orbit and maintain precise shape and vibration control?"]
  ]});

  // Cognitive science & psychology — BRAIN and behavioral-science priority gaps.
  add({ discipline: "cognitive", subfield: "주의·작업기억", subfieldEn: "Attention & Working Memory", approach: "hybrid", nature: "fundamental", sourceIds: ["brain_priorities", "obssr_plan"], themes: ["health"], items: [
    ["뇌는 수많은 입력 중 무엇을 의식적 처리 대상으로 선택하는가?", "How does the brain select which of many inputs receives conscious processing?", "core"],
    ["작업기억의 내용과 용량 제한은 어떤 동적 신경표상에서 생기는가?", "What dynamic neural representations produce working-memory contents and capacity limits?", "core"],
    ["주의가 지각을 개선할 때 정보 자체와 판단 기준은 각각 어떻게 바뀌는가?", "When attention improves perception, how do sensory information and decision criteria change separately?"]
  ]});
  add({ discipline: "cognitive", subfield: "자아·행위주체성", subfieldEn: "Self & Agency", approach: "hybrid", nature: "fundamental", sourceIds: ["brain_priorities", "nimh_plan"], themes: ["health"], items: [
    ["신체 소유감과 지속적인 자아감은 여러 감각·기억에서 어떻게 구성되는가?", "How are body ownership and a continuous sense of self constructed from multiple senses and memories?", "core"],
    ["자신이 행동을 일으켰다는 행위주체감은 뇌에서 어떻게 계산되고 왜 왜곡되는가?", "How is the sense of agency computed in the brain, and why is it sometimes distorted?"],
    ["내적 언어와 심상은 외부 감각 표상과 어떤 회로를 공유하는가?", "Which circuits do inner speech and mental imagery share with external sensory representations?"]
  ]});
  add({ discipline: "cognitive", subfield: "개념·추론·창의성", subfieldEn: "Concepts, Reasoning & Creativity", approach: "hybrid", nature: "fundamental", sourceIds: ["nsf_bcs", "obssr_plan"], themes: ["ai"], items: [
    ["뇌는 추상 개념과 관계를 감각 사례를 넘어 어떻게 표현하는가?", "How does the brain represent abstract concepts and relations beyond sensory examples?", "core"],
    ["통찰과 창의적 재구성이 일어나는 시점을 예측하고 촉진할 수 있는가?", "Can the moment of insight and creative restructuring be predicted and facilitated?"],
    ["인간의 논리·확률·인과 추론은 하나의 계산 체계인가 여러 전략의 조합인가?", "Are human logical, probabilistic, and causal reasoning one computational system or a combination of strategies?"]
  ]});
  add({ discipline: "cognitive", subfield: "수면·인지 회복", subfieldEn: "Sleep & Cognitive Restoration", approach: "hybrid", nature: "prediction", sourceIds: ["brain_priorities", "nimh_plan"], themes: ["health"], items: [
    ["수면 단계별 신경활동이 기억 공고화·정서조절·대사 회복을 어떻게 나누어 수행하는가?", "How do neural activities across sleep stages divide the work of memory consolidation, emotion regulation, and metabolic restoration?"],
    ["개인에게 필요한 수면량과 수면 부족의 장기 인지 영향을 객관적으로 예측할 수 있는가?", "Can an individual's sleep need and the long-term cognitive effects of sleep loss be predicted objectively?"]
  ]});
  add({ discipline: "cognitive", subfield: "문화 간 재현성", subfieldEn: "Cross-Cultural Generalizability", approach: "hybrid", nature: "measurement", sourceIds: ["obssr_plan", "nsf_bcs"], themes: ["health"], items: [
    ["제한된 문화권에서 발견한 인지 법칙이 다른 언어·제도·생활환경에서도 성립할지 예측할 수 있는가?", "Can we predict whether cognitive laws found in a narrow set of cultures will hold across other languages, institutions, and ecologies?", "core"],
    ["자기보고·행동·생리·신경 측정이 가리키는 심리구성개념을 공통 척도로 정렬할 수 있는가?", "Can psychological constructs inferred from self-report, behavior, physiology, and neural measures be aligned on a common scale?"]
  ]});

  // Agriculture & food science — USDA/CGIAR priorities not represented in the fixed four-per-group scheme.
  add({ discipline: "agriculture", subfield: "생물학적 질소·인 이용", subfieldEn: "Biological Nitrogen & Phosphorus Use", approach: "engineering", nature: "system", sourceIds: ["usda_blueprint", "cgiar"], themes: ["climate", "sustainability"], items: [
    ["곡물 작물이 미생물과 공생해 비료 없이 충분한 질소를 고정하게 할 수 있는가?", "Can cereal crops form symbioses that fix enough nitrogen without fertilizer?", "core"],
    ["토양에 고정된 인을 작물이 이용하게 하면서 수질오염과 유한 인광석 의존을 줄일 수 있는가?", "Can crops access fixed soil phosphorus while reducing water pollution and dependence on finite phosphate rock?"]
  ]});
  add({ discipline: "agriculture", subfield: "유전자형–환경–관리", subfieldEn: "Genotype–Environment–Management", approach: "hybrid", nature: "prediction", sourceIds: ["usda_blueprint", "usda_ars"], themes: ["climate", "ai"], items: [
    ["유전자형·토양·날씨·관리의 상호작용에서 지역별 수량과 품질을 사전에 예측할 수 있는가?", "Can local yield and quality be predicted prospectively from genotype, soil, weather, and management interactions?", "core"],
    ["깊은 뿌리와 가변 뿌리구조를 육종해 가뭄 저항성과 영양 이용을 함께 높일 수 있는가?", "Can deep and plastic root architectures be bred to improve both drought resistance and nutrient capture?"]
  ]});
  add({ discipline: "agriculture", subfield: "내구성 작물면역·잡초", subfieldEn: "Durable Crop Immunity & Weeds", approach: "hybrid", nature: "prediction", sourceIds: ["usda_nifa", "cgiar"], themes: ["sustainability", "security"], items: [
    ["병원체 진화에도 수십 년 유지되는 광범위 작물 면역을 설계할 수 있는가?", "Can broad crop immunity be designed to remain effective for decades despite pathogen evolution?", "core"],
    ["제초제 저항성 잡초를 새로운 저항성 진화 없이 농경지 규모에서 억제할 수 있는가?", "Can herbicide-resistant weeds be controlled at landscape scale without selecting new resistance?"],
    ["유익한 작물 미생물군을 서로 다른 토양과 계절에 안정적으로 이식할 수 있는가?", "Can beneficial crop microbiomes be transferred reliably across soils and seasons?"]
  ]});
  add({ discipline: "agriculture", subfield: "축산·양식 기후회복력", subfieldEn: "Climate-Resilient Livestock & Aquaculture", approach: "engineering", nature: "system", sourceIds: ["usda_blueprint", "fao_framework"], themes: ["climate", "health", "sustainability"], items: [
    ["고온 스트레스에서 동물의 건강·번식·생산성을 함께 유지할 수 있는가?", "Can animal health, reproduction, and productivity all be maintained under heat stress?"],
    ["양식장의 질병을 항생제와 야생생물 피해 없이 예방하는 백신·사육체계를 만들 수 있는가?", "Can vaccines and husbandry prevent aquaculture disease without antibiotics or harm to wild populations?"]
  ]});
  add({ discipline: "agriculture", subfield: "영양·발효 식품시스템", subfieldEn: "Nutrition & Fermentation Food Systems", approach: "engineering", nature: "scale", sourceIds: ["usda_blueprint", "usda_ars"], themes: ["health", "sustainability"], items: [
    ["생물강화 작물의 미량영양소가 저장·조리 뒤에도 흡수 가능한 형태로 유지되는가?", "Can micronutrients in biofortified crops remain bioavailable after storage and cooking?"],
    ["정밀발효 단백질을 낮은 에너지·원료 부담으로 세계 식품 규모까지 확장할 수 있는가?", "Can precision-fermented protein scale to global food volumes with low energy and feedstock burdens?"],
    ["초가공식품의 물성·첨가물·섭취속도 중 무엇이 건강영향의 원인인지 분리할 수 있는가?", "Can the causal roles of texture, additives, and eating rate in ultra-processed-food health effects be separated?"]
  ]});
  add({ discipline: "agriculture", subfield: "재생농업 검증", subfieldEn: "Verification of Regenerative Agriculture", approach: "hybrid", nature: "measurement", sourceIds: ["usda_blueprint", "fao_framework"], themes: ["climate", "sustainability"], items: [
    ["재생농업의 토양탄소·생물다양성·수량 효과를 지역과 수십 년에 걸쳐 인과적으로 검증할 수 있는가?", "Can the causal effects of regenerative agriculture on soil carbon, biodiversity, and yield be verified across regions and decades?", "core"]
  ]});

  // Social, economic & complex systems — current institutions, technology, welfare, and generalization gaps.
  add({ discipline: "social", subfield: "AI·자동화와 노동", subfieldEn: "AI, Automation & Labor", approach: "hybrid", nature: "prediction", sourceIds: ["nsf_sbe", "worldbank_research"], themes: ["ai", "sustainability"], items: [
    ["생성형 AI와 자동화가 직무·임금·생산성·불평등을 장기적으로 어떻게 함께 바꾸는가?", "How will generative AI and automation jointly change tasks, wages, productivity, and inequality over the long run?", "core"],
    ["기술 전환의 생산성 이익을 노동자 이동과 재훈련 손실 없이 분배하는 제도는 무엇인가?", "Which institutions distribute productivity gains from technological transitions without large worker-displacement and retraining losses?"]
  ]});
  add({ discipline: "social", subfield: "거시정책 상호작용", subfieldEn: "Macroeconomic Policy Interactions", approach: "hybrid", nature: "prediction", sourceIds: ["worldbank_research", "nsf_ses"], items: [
    ["높은 부채·공급충격·저성장 환경에서 통화·재정정책의 장기 상호작용을 신뢰성 있게 예측할 수 있는가?", "Can the long-run interaction of monetary and fiscal policy be predicted reliably under high debt, supply shocks, and low growth?"],
    ["개발 함정에서 제도·인적자본·인프라 중 어떤 변화가 지속 성장의 원인인가?", "Which changes in institutions, human capital, or infrastructure causally break development traps?", "core"]
  ]});
  add({ discipline: "social", subfield: "차별·교육·범죄", subfieldEn: "Discrimination, Education & Crime", approach: "hybrid", nature: "measurement", sourceIds: ["nsf_sbe", "nas_dbasse_priority"], themes: ["security"], items: [
    ["제도적 차별의 누적 효과를 개인 선택과 다른 제약에서 분리해 측정할 수 있는가?", "Can cumulative institutional discrimination be measured separately from individual choices and other constraints?", "core"],
    ["어떤 조기교육 개입이 세대 간 이동성을 성인기까지 지속적으로 높이는가?", "Which early-education interventions raise intergenerational mobility persistently into adulthood?"],
    ["범죄를 줄이면서 정당성·신뢰·재통합을 높이는 경찰·사법 제도 조합은 무엇인가?", "Which combinations of policing and justice reduce crime while increasing legitimacy, trust, and reintegration?"]
  ]});
  add({ discipline: "social", subfield: "기후 적응의 분배", subfieldEn: "Distribution of Climate Adaptation", approach: "hybrid", nature: "system", sourceIds: ["worldbank_research", "nas_dbasse_priority"], themes: ["climate", "sustainability", "security"], items: [
    ["기후 적응 투자와 이주 정책의 비용·혜택·위험이 계층과 세대에 어떻게 분배되는가?", "How are the costs, benefits, and risks of climate adaptation and migration policy distributed across classes and generations?", "core"],
    ["보험과 재난지원이 위험 감소를 유도하면서 취약계층의 퇴거와 부채를 막게 설계할 수 있는가?", "Can insurance and disaster aid encourage risk reduction while preventing displacement and debt among vulnerable groups?"]
  ]});
  add({ discipline: "social", subfield: "AI·플랫폼 거버넌스", subfieldEn: "AI & Platform Governance", approach: "hybrid", nature: "system", sourceIds: ["nsf_sbe", "nas_dbasse_priority"], themes: ["ai", "security"], items: [
    ["국경을 넘는 고성능 AI의 안전·경쟁·혁신을 함께 관리하는 집행 가능한 제도를 만들 수 있는가?", "Can enforceable institutions jointly govern safety, competition, and innovation for high-capability AI across borders?", "core"],
    ["오정보 개입이 신뢰·표현·정치참여를 해치지 않고 장기 행동을 개선할 수 있는가?", "Can misinformation interventions improve long-term behavior without damaging trust, expression, or political participation?"],
    ["플랫폼 설계의 작은 변화가 사회 규범과 집단 극화에 미치는 장기 인과효과를 측정할 수 있는가?", "Can the long-run causal effects of small platform-design changes on social norms and group polarization be measured?"]
  ]});
  add({ discipline: "social", subfield: "인구·이주·도시 전환", subfieldEn: "Demography, Migration & Urban Transition", approach: "hybrid", nature: "prediction", sourceIds: ["worldbank_research", "nsf_sbe"], themes: ["sustainability"], items: [
    ["세계적 출산율 하락이 가족·노동·재정·혁신에 미칠 비선형 장기효과는 무엇인가?", "What nonlinear long-run effects will global fertility decline have on families, labor, public finance, and innovation?", "core"],
    ["이민자의 통합과 사회 신뢰를 함께 높이는 주거·교육·노동정책은 무엇인가?", "Which housing, education, and labor policies improve both immigrant integration and social trust?"],
    ["원격·혼합근무는 도시 집적의 생산성 이점과 지역 불평등을 어떻게 재구성하는가?", "How does remote and hybrid work reshape urban agglomeration benefits and regional inequality?"]
  ]});
  add({ discipline: "social", subfield: "과학·복지의 측정", subfieldEn: "Measurement of Science & Welfare", approach: "hybrid", nature: "measurement", sourceIds: ["nsf_sbe", "nas_dbasse_priority"], themes: ["sustainability"], items: [
    ["어떤 연구조직·지원방식·협업 구조가 장기적으로 혁신적이고 재현 가능한 과학을 만드는가?", "Which research organizations, funding mechanisms, and collaboration structures produce innovative and reproducible science over the long run?"],
    ["GDP를 넘어 건강·시간·환경·불평등을 함께 반영하는 복지척도를 정책에 사용할 수 있는가?", "Can a welfare measure combining health, time, environment, and inequality beyond GDP guide policy?", "core"],
    ["사회과학 결과가 다른 제도·문화·시대에 일반화될 조건을 연구 전에 예측할 수 있는가?", "Can the conditions under which a social-science result generalizes across institutions, cultures, and eras be predicted before the study?", "core"]
  ]});

  problems.push(...additions);
})();
