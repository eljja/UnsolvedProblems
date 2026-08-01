/*
 * Curated research-question dataset.
 * Classification is editorial and intended for navigation, not a claim of consensus.
 */
(function () {
  const META = {
    disciplines: {
      physics: { label: "물리학", color: "#567f99", soft: "#dce8ee" },
      chemistry: { label: "화학", color: "#b56f3f", soft: "#f1dfd2" },
      biology: { label: "생물학", color: "#5f8d68", soft: "#dce9dc" },
      materials: { label: "재료공학", color: "#8b6f9f", soft: "#e7dfee" },
      semiconductor: { label: "반도체·전자", color: "#b89331", soft: "#f2e7c9" }
    },
    approaches: {
      theory: { label: "이론 중심", color: "#4169a1", description: "수학적 구조, 원리 또는 예측 모형의 진전이 먼저 필요한 문제" },
      experiment: { label: "실험 중심", color: "#cf6d3d", description: "새로운 관측, 실험계 또는 데이터가 결정적인 문제" },
      hybrid: { label: "이론+실험", color: "#4e9276", description: "설명과 검증이 반복적으로 함께 전진해야 하는 문제" },
      engineering: { label: "공학·시스템", color: "#8d619b", description: "원리 입증을 넘어 규모, 수율, 비용, 신뢰성을 해결해야 하는 문제" }
    },
    natures: {
      fundamental: { label: "근본 원리", color: "#3f72a6", description: "현상의 원인이나 지배 법칙 자체가 충분히 알려지지 않음" },
      prediction: { label: "예측·모델", color: "#d17a37", description: "현상은 알지만 필요한 정확도와 범위에서 예측하지 못함" },
      measurement: { label: "관측·계측", color: "#559268", description: "질문을 판별할 감도, 해상도 또는 실험 접근법이 부족함" },
      scale: { label: "확장·재현", color: "#b85c59", description: "작은 규모의 성공을 실제 규모에서 균일하게 재현하지 못함" },
      system: { label: "설계·시스템", color: "#4c9696", description: "여러 상충 조건을 동시에 만족하는 전체 해법이 없음" },
      boundary: { label: "불가능 경계", color: "#8d619b", description: "확립된 법칙이나 정보 부족이 금지하는 영역을 표시" }
    },
    feasibility: {
      open: { label: "해결 가능성 열림", color: "#4c9272", description: "현재 이론이 금지하지 않으며 연구로 답할 가능성이 열려 있음" },
      current: { label: "현재 기술로 불가능", color: "#d49a34", description: "원칙상 가능할 수 있으나 현재의 에너지, 시간, 해상도 또는 데이터가 부족함" },
      practical: { label: "현실적 한계", color: "#c76b45", description: "조합 폭발, 비용, 시간 또는 제어 복잡도가 실용적 장벽을 이룸" },
      impossible: { label: "이론적 불가능", color: "#8d5573", description: "현재 확립된 법칙·정리 또는 소실된 정보가 요구를 금지함" }
    }
  };

  const SOURCES = {
    clay: { discipline: "physics", title: "Clay Mathematics Institute — Millennium Problems", url: "https://www.claymath.org/millennium-problems/" },
    cern: { discipline: "physics", title: "CERN — Open questions in particle physics", url: "https://home.cern/science/physics/open-questions" },
    nasa_dm: { discipline: "physics", title: "NASA Science — Dark Matter", url: "https://science.nasa.gov/universe/dark-matter-dark-energy/" },
    ligo: { discipline: "physics", title: "LIGO Scientific Collaboration", url: "https://www.ligo.org/science.php" },
    doe_hep: { discipline: "physics", title: "DOE Office of High Energy Physics", url: "https://science.osti.gov/hep" },
    doe_qis: { discipline: "physics", title: "DOE Quantum Information Science", url: "https://science.osti.gov/Initiatives/QIS" },

    doe_chem: { discipline: "chemistry", title: "DOE Basic Energy Sciences — Chemical Sciences", url: "https://science.osti.gov/bes/csgb" },
    doe_catalysis: { discipline: "chemistry", title: "DOE — Basic Research Needs: Catalysis Science", url: "https://science.osti.gov/-/media/bes/pdf/reports/2017/BRN_CatalysisScience_rpt.pdf" },
    nist_chem: { discipline: "chemistry", title: "NIST Chemistry WebBook", url: "https://webbook.nist.gov/chemistry/" },
    iupac: { discipline: "chemistry", title: "IUPAC — Top Ten Emerging Technologies in Chemistry", url: "https://iupac.org/what-we-do/top-ten/" },
    nsf_chem: { discipline: "chemistry", title: "NSF Division of Chemistry", url: "https://www.nsf.gov/div/index.jsp?div=CHE" },

    nih_brain: { discipline: "biology", title: "NIH BRAIN Initiative", url: "https://braininitiative.nih.gov/" },
    encode: { discipline: "biology", title: "NHGRI ENCODE Project", url: "https://www.genome.gov/Funded-Programs-Projects/ENCODE-Project-ENCyclopedia-Of-DNA-Elements" },
    hca: { discipline: "biology", title: "Human Cell Atlas", url: "https://www.humancellatlas.org/" },
    nih_aging: { discipline: "biology", title: "National Institute on Aging — Research Divisions", url: "https://www.nia.nih.gov/research" },
    nih_microbiome: { discipline: "biology", title: "NIH Human Microbiome Project", url: "https://commonfund.nih.gov/hmp" },
    ncbi: { discipline: "biology", title: "NCBI — Genomes and biological data", url: "https://www.ncbi.nlm.nih.gov/" },

    doe_materials: { discipline: "materials", title: "DOE Basic Energy Sciences — Materials Sciences", url: "https://science.osti.gov/bes/mse" },
    doe_quantum_materials: { discipline: "materials", title: "DOE — Basic Research Needs for Quantum Materials", url: "https://science.osti.gov/-/media/bes/pdf/reports/2016/BRN_Quantum_Materials_for_Energy_Relevant_Technology.pdf" },
    doe_superconductivity: { discipline: "materials", title: "DOE — Basic Research Needs for Superconductivity", url: "https://science.osti.gov/-/media/bes/pdf/reports/files/Basic_Research_Needs_for_Superconductivity_rpt.pdf" },
    nist_materials: { discipline: "materials", title: "NIST Materials Genome Initiative", url: "https://www.nist.gov/mgi" },
    doe_critical: { discipline: "materials", title: "DOE Critical Materials", url: "https://www.energy.gov/cmm/critical-materials" },

    doe_micro: { discipline: "semiconductor", title: "DOE Microelectronics Initiative", url: "https://science.osti.gov/Initiatives/Microelectronics" },
    src_decadal: { discipline: "semiconductor", title: "SRC — Decadal Plan for Semiconductors", url: "https://www.src.org/about/decadal-plan/" },
    src_mapt: { discipline: "semiconductor", title: "SRC — MAPT Roadmap 2.0", url: "https://www.src.org/about/mapt-roadmap/" },
    nist_metrology: { discipline: "semiconductor", title: "NIST CHIPS Metrology Program", url: "https://www.nist.gov/chips/research-development-programs/metrology-program" },
    nist_packaging: { discipline: "semiconductor", title: "NIST National Advanced Packaging Manufacturing Program", url: "https://www.nist.gov/chips/research-development-programs/national-advanced-packaging-manufacturing-program" },
    darpa_eri: { discipline: "semiconductor", title: "DARPA Electronics Resurgence Initiative", url: "https://eri-summit.darpa.mil/what-is-eri" },
    nist_security: { discipline: "semiconductor", title: "NIST Hardware Security", url: "https://csrc.nist.gov/Projects/hardware-security" },
    epa_semiconductor: { discipline: "semiconductor", title: "US EPA — Semiconductor Industry Emissions", url: "https://www.epa.gov/eps-partnership/semiconductor-industry" }
  };

  const DEFAULT_WHY = {
    fundamental: "경쟁하는 설명이 남아 있거나, 알려진 이론들이 이 영역에서 서로 양립하지 않는다.",
    prediction: "필요한 자유도와 상호작용이 너무 많아 현재 모형이 관측 범위 전체를 정량적으로 재현하지 못한다.",
    measurement: "판별에 필요한 신호가 너무 약하거나 짧고, 대상에 접근하는 측정 자체가 상태를 바꾸거나 충분한 해상도를 제공하지 못한다.",
    scale: "작은 규모의 원리 입증은 있지만 결함, 변동성, 비용과 수율이 규모와 함께 악화된다.",
    system: "개별 요소의 개선이 다른 성능을 악화시키며, 전체 조건을 동시에 만족하는 설계 원칙이 없다.",
    boundary: "답을 찾지 못한 것이 아니라 현재의 법칙, 정리 또는 사용 가능한 정보가 요구 조건을 금지한다."
  };
  const DEFAULT_SOLVED = {
    fundamental: "하나의 설명이 독립적인 관측을 정량 예측하고 대안 설명을 구별하는 새로운 검증을 통과할 때",
    prediction: "훈련 범위 밖의 조건과 여러 규모에서 사전 예측이 반복 검증될 때",
    measurement: "독립된 방법들이 필요한 감도와 해상도로 같은 결과를 재현할 때",
    scale: "현실적인 규모에서 성능·수율·수명·비용 목표를 동시에 재현할 때",
    system: "전체 시스템 경계를 포함한 벤치마크에서 기존 해법보다 지속적으로 우수할 때",
    boundary: "경계의 전제가 명시되고, 왜 위반할 수 없는지가 검증 가능한 형태로 제시될 때"
  };

  function G(discipline, subfield, approach, nature, feasibility, sources, items, extra = {}) {
    return { discipline, subfield, approach, nature, feasibility, sources, items, ...extra };
  }

  const GROUPS = [
    // Physics — 60 open questions
    G("physics", "우주론", "hybrid", "fundamental", "open", ["nasa_dm", "doe_hep"], [
      "암흑물질은 어떤 입자 또는 장으로 이루어져 있는가?",
      "암흑에너지의 물리적 본질은 무엇인가?",
      "허블 상수 측정값의 불일치는 새로운 물리의 신호인가?",
      "우주는 왜 물질이 반물질보다 훨씬 많은가?",
      "우주의 초기 조건은 무엇이 결정했는가?"
    ]),
    G("physics", "초기 우주", "hybrid", "measurement", "current", ["nasa_dm", "doe_hep"], [
      "우주 인플레이션은 실제로 일어났으며 어떤 장이 이를 일으켰는가?",
      "원시 중력파를 우주배경복사에서 검출할 수 있는가?",
      "재가열 시기의 물리 과정을 관측으로 복원할 수 있는가?",
      "우주가 유한한지 무한한지 관측으로 판정할 수 있는가?",
      "관측 가능한 우주 밖의 구조에 대해 무엇을 알 수 있는가?"
    ]),
    G("physics", "입자물리", "hybrid", "fundamental", "open", ["cern", "doe_hep"], [
      "표준모형 너머의 다음 기본 입자는 무엇인가?",
      "중성미자의 질량은 어떤 기작으로 생기는가?",
      "중성미자는 자신의 반입자인 마요라나 입자인가?",
      "강한 CP 문제는 왜 자연스럽게 0에 가까운가?",
      "세 세대의 쿼크와 렙톤은 왜 존재하는가?"
    ]),
    G("physics", "고에너지 탐색", "experiment", "measurement", "current", ["cern", "doe_hep"], [
      "양성자 붕괴는 실제로 일어나는가?",
      "자기 단극자는 존재하는가?",
      "액시온 또는 액시온 유사 입자를 직접 검출할 수 있는가?",
      "초대칭 입자가 자연에 존재하는가?",
      "플랑크 규모의 물리를 간접적으로 검증할 관측량이 있는가?"
    ]),
    G("physics", "중력", "theory", "fundamental", "open", ["ligo", "doe_hep"], [
      "중력을 양자역학과 일관되게 통합하는 이론은 무엇인가?",
      "블랙홀 정보 역설의 완전한 해답은 무엇인가?",
      "시공간은 더 근본적인 양자 자유도에서 출현하는가?",
      "특이점은 완성된 중력이론에서 사라지는가?",
      "중력의 양자성을 실험적으로 증명할 수 있는가?"
    ]),
    G("physics", "양자 기초", "hybrid", "fundamental", "open", ["doe_qis"], [
      "양자 측정에서 단일 결과는 어떻게 나타나는가?",
      "파동함수는 실재인가 지식의 표현인가?",
      "객관적 붕괴 모형은 표준 양자역학과 구별되는가?",
      "양자–고전 경계는 정확히 어디에서 생기는가?",
      "보른 규칙은 더 깊은 원리에서 유도되는가?"
    ]),
    G("physics", "응집물질", "hybrid", "fundamental", "open", ["doe_materials", "doe_quantum_materials"], [
      "고온 초전도성의 보편적인 미시 기작은 무엇인가?",
      "이상 금속의 선형 저항은 왜 나타나는가?",
      "양자 스핀 액체를 결정적으로 식별하는 관측은 무엇인가?",
      "강상관 전자계의 상도를 제일원리에서 예측할 수 있는가?",
      "비평형 양자물질의 새로운 안정 상태를 체계적으로 분류할 수 있는가?"
    ]),
    G("physics", "유체·비선형", "theory", "prediction", "practical", ["clay"], [
      "3차원 나비에–스토크스 방정식의 해는 항상 매끄러운가?",
      "난류의 보편적인 닫힌 이론을 만들 수 있는가?",
      "난류 천이의 임계 조건을 임의 형상에서 예측할 수 있는가?",
      "극한 사건과 희귀 파동을 사전에 예측할 수 있는가?",
      "다중규모 혼돈계의 장기 통계량을 미시 방정식에서 계산할 수 있는가?"
    ]),
    G("physics", "플라즈마·핵융합", "engineering", "system", "open", ["doe_hep"], [
      "핵융합 플라즈마의 난류 수송을 예측하고 제어할 수 있는가?",
      "붕괴와 엣지 국소모드를 손상 전에 억제할 수 있는가?",
      "고에너지 중성자 환경에서 장수명 핵융합 재료를 만들 수 있는가?",
      "관성가둠 핵융합을 높은 반복률과 순에너지로 운전할 수 있는가?",
      "핵융합 발전소의 삼중수소 연료주기를 자급할 수 있는가?"
    ]),
    G("physics", "천체물리", "hybrid", "prediction", "open", ["nasa_dm", "ligo"], [
      "빠른 전파 폭발의 모든 기원과 다양성을 설명할 수 있는가?",
      "초고에너지 우주선은 어디서 어떻게 가속되는가?",
      "블랙홀 제트는 어떻게 형성되고 입자를 가속하는가?",
      "초신성 폭발을 처음부터 끝까지 예측할 수 있는가?",
      "중성자별 내부의 초고밀도 물질 상태방정식은 무엇인가?"
    ]),
    G("physics", "핵·강입자", "hybrid", "prediction", "open", ["doe_hep"], [
      "쿼크와 글루온에서 핵의 구조와 결합을 정밀 계산할 수 있는가?",
      "쿼크–글루온 플라즈마는 왜 거의 완전한 유체처럼 흐르는가?",
      "중성자 과잉 핵의 한계선은 어디인가?",
      "r-과정 원소합성의 정확한 천체 장소는 무엇인가?",
      "핵분열 생성물 분포를 제일원리에서 예측할 수 있는가?"
    ]),
    G("physics", "통계·수리물리", "theory", "fundamental", "open", ["clay"], [
      "양–밀스 이론의 질량 간극을 엄밀히 증명할 수 있는가?",
      "비평형 통계역학의 보편 법칙은 무엇인가?",
      "유리 전이에는 진정한 열역학적 상전이가 존재하는가?",
      "양자 다체계의 열평형화 조건을 완전히 분류할 수 있는가?",
      "복잡계에서 거시적 인과 법칙이 어떻게 출현하는가?"
    ]),

    // Chemistry — 60 open questions
    G("chemistry", "전자구조", "theory", "prediction", "practical", ["doe_chem", "nsf_chem"], [
      "강상관 분자의 바닥상태를 효율적이고 정확하게 계산할 수 있는가?",
      "전이금속 화합물의 스핀 상태와 반응성을 사전에 예측할 수 있는가?",
      "들뜬상태와 광화학 반응경로를 정량적으로 계산할 수 있는가?",
      "상대론 효과가 큰 원소의 화학을 통일적으로 예측할 수 있는가?",
      "계산 정확도와 비용을 모두 보증하는 전자구조 방법이 가능한가?"
    ]),
    G("chemistry", "반응 동역학", "hybrid", "fundamental", "open", ["doe_chem", "nist_chem"], [
      "결합이 끊어지고 생기는 순간의 전자–핵 운동을 완전히 추적할 수 있는가?",
      "용액 반응의 전이상태는 실제로 어떤 동적 구조를 갖는가?",
      "비통계적 반응경로는 언제 지배적이 되는가?",
      "양자 터널링이 복잡한 실온 반응에 얼마나 기여하는가?",
      "반응 선택성을 초기 분자 운동만으로 제어할 수 있는가?"
    ]),
    G("chemistry", "촉매", "hybrid", "prediction", "open", ["doe_catalysis", "doe_chem"], [
      "실제 작동 중 촉매의 활성점은 정확히 무엇인가?",
      "촉매의 활성·선택성·안정성을 구조에서 동시에 예측할 수 있는가?",
      "비귀금속 촉매로 귀금속 수준의 성능과 수명을 달성할 수 있는가?",
      "효소의 높은 선택성과 온화한 조건을 인공 촉매로 재현할 수 있는가?",
      "촉매 열화와 재구성을 실시간으로 예측하고 되돌릴 수 있는가?"
    ]),
    G("chemistry", "합성", "engineering", "system", "open", ["iupac", "nsf_chem"], [
      "원하는 임의 분자를 짧고 고수율로 합성하는 일반 전략이 가능한가?",
      "합성경로 계획이 미지 반응까지 창의적으로 제안하고 검증할 수 있는가?",
      "입체선택성을 촉매 설계만으로 완전히 제어할 수 있는가?",
      "보호기와 유해 시약 없는 복잡분자 합성이 가능한가?",
      "실험실 합성을 연속공정으로 자동 확장할 수 있는가?"
    ]),
    G("chemistry", "생명 기원 화학", "hybrid", "fundamental", "current", ["nsf_chem"], [
      "무생물 화학에서 자기복제 분자계는 어떻게 출현했는가?",
      "최초의 대사와 최초의 유전정보 중 무엇이 먼저였는가?",
      "생체 분자의 단일 키랄성은 어떻게 선택되었는가?",
      "초기 지구에서 뉴클레오타이드와 펩타이드는 어떤 경로로 축적되었는가?",
      "화학계가 진화 가능한 개체로 전환되는 최소 조건은 무엇인가?"
    ]),
    G("chemistry", "용액·계면", "hybrid", "fundamental", "open", ["doe_chem", "nist_chem"], [
      "물의 이상 성질을 하나의 미시 그림으로 설명할 수 있는가?",
      "이온의 구체적 효과를 보편적으로 예측할 수 있는가?",
      "고체–액체 계면의 용매층이 반응을 어떻게 바꾸는가?",
      "소수성 효과를 넓은 길이척도에서 통일적으로 기술할 수 있는가?",
      "나노구속 공간에서 물과 전해질의 상거동은 어떻게 달라지는가?"
    ]),
    G("chemistry", "전기화학", "hybrid", "prediction", "open", ["doe_chem", "doe_catalysis"], [
      "전극–전해질 계면의 실제 전기이중층 구조는 무엇인가?",
      "덴드라이트의 핵생성과 성장을 사전에 예측하고 막을 수 있는가?",
      "고체전해질 계면막의 형성과 수명을 분자 수준에서 설명할 수 있는가?",
      "산소발생·환원 반응의 과전압을 근본적으로 낮출 수 있는가?",
      "전기화학 반응의 전위·전류·선택성을 제일원리에서 예측할 수 있는가?"
    ]),
    G("chemistry", "에너지·탄소 화학", "engineering", "scale", "open", ["doe_catalysis", "iupac"], [
      "물과 햇빛만으로 연료를 만드는 인공광합성을 실용화할 수 있는가?",
      "CO₂를 낮은 에너지로 원하는 탄소 제품에 선택 전환할 수 있는가?",
      "질소를 온화한 조건에서 암모니아로 고효율 고정할 수 있는가?",
      "수소를 안전하고 가볍게 저장·방출하는 물질계를 만들 수 있는가?",
      "화학산업의 고온 열공정을 전기화하면서 제품 품질을 유지할 수 있는가?"
    ]),
    G("chemistry", "환경·대기", "hybrid", "prediction", "open", ["nsf_chem", "nist_chem"], [
      "대기 에어로졸의 생성·노화·구름 효과를 분자에서 기후까지 예측할 수 있는가?",
      "PFAS를 유해 부산물 없이 완전히 분해할 수 있는가?",
      "미세플라스틱의 장기 화학변환과 독성을 예측할 수 있는가?",
      "환경 속 복합오염물의 혼합 독성을 사전에 계산할 수 있는가?",
      "극미량 오염물의 전 지구 순환과 최종 행방을 추적할 수 있는가?"
    ]),
    G("chemistry", "계산·AI 화학", "hybrid", "prediction", "practical", ["nsf_chem", "nist_chem"], [
      "학습 데이터 밖의 화학을 신뢰성 있게 예측하는 AI를 만들 수 있는가?",
      "화학 AI의 불확실성과 실패 영역을 정량적으로 보증할 수 있는가?",
      "반응 조건과 수율 데이터를 편향 없이 대규모로 표준화할 수 있는가?",
      "분자 설계에서 인과관계와 단순 상관관계를 구별할 수 있는가?",
      "전체 화학공간을 탐색하지 않고 최적 후보를 보장할 수 있는가?"
    ]),
    G("chemistry", "초분자·자기조립", "hybrid", "fundamental", "open", ["nsf_chem", "iupac"], [
      "분자 구성요소에서 최종 자기조립 구조를 일반적으로 예측할 수 있는가?",
      "오류를 스스로 교정하는 다단계 자기조립을 설계할 수 있는가?",
      "비평형 화학계가 에너지를 소비해 조직을 유지하는 법칙은 무엇인가?",
      "인공 분자기계들을 협동하는 시스템으로 연결할 수 있는가?",
      "생체 수준의 적응성과 기억을 가진 화학계를 만들 수 있는가?"
    ]),
    G("chemistry", "분석·계측", "experiment", "measurement", "current", ["nist_chem", "doe_chem"], [
      "단일 분자의 모든 구조 변화를 실시간 3차원으로 관찰할 수 있는가?",
      "반응 중간체의 농도와 수명이 극히 작아도 비침습적으로 검출할 수 있는가?",
      "복잡 혼합물의 모든 성분과 입체구조를 한 번에 규명할 수 있는가?",
      "세포 안의 화학반응을 분자 해상도로 정량 측정할 수 있는가?",
      "표면 아래 묻힌 계면의 화학상태를 작동 중 직접 볼 수 있는가?"
    ]),

    // Biology — 60 open questions
    G("biology", "생명 기원·진화", "hybrid", "fundamental", "current", ["ncbi"], [
      "생명은 지구에서 정확히 언제 어디서 어떻게 시작되었는가?",
      "최초의 세포는 어떤 화학계에서 출현했는가?",
      "진핵세포의 복잡성은 어떤 순서로 진화했는가?",
      "다세포성은 왜 여러 계통에서 반복해 출현했는가?",
      "진화의 주요 전환을 예측하는 일반 원리가 존재하는가?"
    ]),
    G("biology", "유전체", "hybrid", "prediction", "open", ["encode", "ncbi"], [
      "비암호화 DNA의 기능을 염기서열만으로 예측할 수 있는가?",
      "유전자형에서 복잡한 표현형을 정량 예측할 수 있는가?",
      "희귀 변이와 구조 변이의 질병 효과를 정확히 판정할 수 있는가?",
      "유전체의 3차원 접힘이 유전자 조절을 어떻게 결정하는가?",
      "개체마다 다른 유전자 조절 규칙을 통합 모델링할 수 있는가?"
    ]),
    G("biology", "후성유전", "hybrid", "fundamental", "open", ["encode", "hca"], [
      "후성유전 표지는 원인인가 결과인가?",
      "세포는 분열 뒤에도 정체성을 어떻게 기억하는가?",
      "후성유전 정보는 세대를 넘어 어느 정도 전달되는가?",
      "환경 노출이 장기 유전자 조절 변화로 고정되는 과정은 무엇인가?",
      "후성유전 상태를 안전하고 정확하게 재설정할 수 있는가?"
    ]),
    G("biology", "세포생물학", "hybrid", "fundamental", "open", ["hca"], [
      "세포는 크기와 형태를 어떻게 감지하고 유지하는가?",
      "막 없는 소기관의 형성과 기능을 일반적으로 예측할 수 있는가?",
      "세포 내 혼잡 환경에서 분자 반응은 어떻게 조직되는가?",
      "소기관 사이 접촉점은 대사와 신호를 어떻게 조절하는가?",
      "세포가 죽음·정지·분화를 선택하는 통합 의사결정 원리는 무엇인가?"
    ]),
    G("biology", "발생·재생", "hybrid", "prediction", "open", ["hca", "ncbi"], [
      "하나의 수정란이 정확한 몸의 형태를 만드는 규칙은 무엇인가?",
      "발생의 견고성과 개체 차이는 어떻게 동시에 생기는가?",
      "기관의 크기와 비율은 어떤 피드백으로 결정되는가?",
      "어떤 동물은 기관을 재생하지만 인간은 왜 제한적인가?",
      "줄기세포에서 완전한 기능성 장기를 안전하게 만들 수 있는가?"
    ]),
    G("biology", "뇌·의식", "hybrid", "fundamental", "open", ["nih_brain"], [
      "의식 경험은 신경 활동에서 어떻게 발생하는가?",
      "기억은 세포와 회로에 정확히 어떤 형태로 저장되는가?",
      "수면은 왜 필요하며 꿈의 기능은 무엇인가?",
      "뇌는 감각에서 안정된 세계모형을 어떻게 구성하는가?",
      "감정·가치·의사결정은 어떤 공통 계산 원리로 연결되는가?"
    ]),
    G("biology", "신경회로", "experiment", "measurement", "current", ["nih_brain"], [
      "인간 뇌의 세포형과 연결망을 충분한 해상도로 완성할 수 있는가?",
      "살아 있는 뇌 전체의 활동을 단일세포 수준으로 측정할 수 있는가?",
      "신경회로의 인과 기능을 비침습적으로 조작할 수 있는가?",
      "개인별 뇌 연결 차이와 행동 차이를 연결할 수 있는가?",
      "정신질환을 증상이 아니라 회로 기작으로 분류할 수 있는가?"
    ]),
    G("biology", "면역", "hybrid", "prediction", "open", ["hca", "ncbi"], [
      "면역계는 자기와 비자기를 어떻게 학습하고 갱신하는가?",
      "왜 어떤 감염은 평생 면역을 만들고 다른 감염은 그렇지 않은가?",
      "자가면역질환이 시작되는 최초 사건은 무엇인가?",
      "종양 미세환경의 면역반응을 환자별로 예측할 수 있는가?",
      "면역 노화와 만성 염증을 안전하게 되돌릴 수 있는가?"
    ]),
    G("biology", "미생물군", "hybrid", "fundamental", "open", ["nih_microbiome"], [
      "건강한 인간 미생물군의 보편적 정의가 가능한가?",
      "미생물군 변화가 질병의 원인인지 결과인지 판별할 수 있는가?",
      "미생물 대사산물이 뇌와 면역에 미치는 인과 경로는 무엇인가?",
      "개인별 미생물 생태계의 치료 반응을 예측할 수 있는가?",
      "안정적이고 안전한 합성 미생물군을 설계할 수 있는가?"
    ]),
    G("biology", "노화", "hybrid", "fundamental", "open", ["nih_aging"], [
      "노화의 여러 표지 중 무엇이 근본 원인인가?",
      "생물학적 나이를 보편적으로 측정할 수 있는가?",
      "노화 속도를 늦추면서 암 위험을 증가시키지 않을 수 있는가?",
      "부분적 세포 재프로그래밍을 안전하게 사용할 수 있는가?",
      "건강수명 연장이 서로 다른 조직에서 어떻게 조정되어야 하는가?"
    ]),
    G("biology", "생태·지구생물학", "hybrid", "prediction", "practical", ["ncbi"], [
      "생태계의 급격한 붕괴 임계점을 사전에 예측할 수 있는가?",
      "종 다양성이 생태계 안정성을 만드는 일반 법칙은 무엇인가?",
      "기후변화에 따른 종 이동과 적응을 정확히 예측할 수 있는가?",
      "해양·토양 미생물의 전 지구 탄소 순환 기여를 정량화할 수 있는가?",
      "멸종이 생태계 기능에 미치는 연쇄효과를 예측할 수 있는가?"
    ]),
    G("biology", "시스템·정밀의학", "engineering", "system", "open", ["hca", "encode", "ncbi"], [
      "세포의 모든 오믹스 층을 하나의 인과모형으로 통합할 수 있는가?",
      "환자별 질병 경과와 치료 반응을 사전에 예측할 수 있는가?",
      "암의 진화와 약물 내성을 치료 중 실시간 추적·차단할 수 있는가?",
      "희귀질환의 원인을 소수 환자 데이터만으로 찾을 수 있는가?",
      "디지털 생물모형이 실제 임상 결정을 신뢰성 있게 대신할 수 있는가?"
    ]),

    // Materials science — 60 open questions
    G("materials", "재료 발견", "hybrid", "prediction", "practical", ["nist_materials", "doe_materials"], [
      "원하는 물성을 입력하면 합성 가능한 재료를 역설계할 수 있는가?",
      "방대한 조성·구조 공간을 탐색하지 않고 최적 재료를 찾을 수 있는가?",
      "계산상 안정한 물질이 실제로 합성 가능한지 예측할 수 있는가?",
      "재료 AI가 학습 범위 밖의 새로운 화학계를 신뢰성 있게 제안할 수 있는가?",
      "실패한 합성 실험까지 포함한 표준 재료 데이터를 구축할 수 있는가?"
    ]),
    G("materials", "결함·미세구조", "hybrid", "fundamental", "open", ["doe_materials", "nist_materials"], [
      "결함의 생성·이동·상호작용에서 거시 물성을 예측할 수 있는가?",
      "공정 중 미세구조의 비평형 진화를 정확히 제어할 수 있는가?",
      "결정립계의 원자구조와 특성을 일반적으로 예측할 수 있는가?",
      "유익한 결함만 선택적으로 만들어 기능을 높일 수 있는가?",
      "방사선 손상 재료의 장기 구조 변화를 가속시험으로 예측할 수 있는가?"
    ]),
    G("materials", "계면·접착", "hybrid", "fundamental", "open", ["doe_materials", "nist_materials"], [
      "서로 다른 재료 계면의 결합·전하·열전달을 통합 설명할 수 있는가?",
      "접착 강도를 표면 화학과 거칠기에서 사전 예측할 수 있는가?",
      "고체–고체 계면 반응과 상 형성을 실시간 제어할 수 있는가?",
      "계면 열저항을 원자구조 설계로 자유롭게 조절할 수 있는가?",
      "매몰 계면의 구조와 화학을 비파괴로 3차원 측정할 수 있는가?"
    ]),
    G("materials", "파괴·피로", "hybrid", "prediction", "open", ["doe_materials", "nist_materials"], [
      "균열이 언제 어디서 시작될지 미세구조에서 예측할 수 있는가?",
      "복합 하중 아래 피로수명을 짧은 시험으로 정확히 예측할 수 있는가?",
      "수소취성의 지배 기작을 재료와 조건별로 통일할 수 있는가?",
      "스스로 균열을 감지하고 반복 치유하는 구조재료를 만들 수 있는가?",
      "초고강도와 높은 연성을 동시에 달성하는 일반 설계 원리는 무엇인가?"
    ]),
    G("materials", "열·열전", "hybrid", "prediction", "open", ["doe_materials"], [
      "비정질과 복잡결정의 열전도를 제일원리에서 예측할 수 있는가?",
      "전자전도는 높고 열전도는 낮은 고성능 열전재료를 일반적으로 설계할 수 있는가?",
      "극한 열유속을 장기간 견디는 재료와 계면을 만들 수 있는가?",
      "나노스케일 비푸리에 열전달의 보편적 모형은 무엇인가?",
      "열을 전기신호처럼 정류·증폭·기억하는 재료를 만들 수 있는가?"
    ]),
    G("materials", "초전도", "hybrid", "fundamental", "open", ["doe_superconductivity"], [
      "상압 상온 초전도체가 가능한가?",
      "비정상 초전도체의 쌍 형성 기작을 통일적으로 설명할 수 있는가?",
      "높은 임계온도·임계전류·자기장을 동시에 달성할 수 있는가?",
      "초전도체의 자속 고정을 원자 수준에서 최적화할 수 있는가?",
      "고압 초전도상을 상압에서 준안정하게 보존할 수 있는가?"
    ]),
    G("materials", "양자재료", "hybrid", "fundamental", "open", ["doe_quantum_materials"], [
      "위상상태를 실온에서 안정적으로 구현하고 제어할 수 있는가?",
      "양자 스핀 액체의 확정적 재료 서명을 찾을 수 있는가?",
      "강상관 물질의 상을 조성·압력·변형으로 예측 설계할 수 있는가?",
      "2차원 자성과 초전도성을 소자 규모에서 안정화할 수 있는가?",
      "비평형 구동으로 평형에는 없는 유용한 양자상을 만들 수 있는가?"
    ]),
    G("materials", "배터리·에너지", "engineering", "system", "open", ["doe_materials", "doe_critical"], [
      "고체전해질 배터리의 계면저항과 덴드라이트를 동시에 해결할 수 있는가?",
      "고에너지밀도 금속 음극을 높은 수명과 안전성으로 사용할 수 있는가?",
      "코발트·니켈 등 희소원소 없는 고성능 전극을 만들 수 있는가?",
      "배터리 열화 상태와 잔여수명을 비침습적으로 정확히 예측할 수 있는가?",
      "장주기 전력망 저장을 저비용·고효율·장수명으로 달성할 수 있는가?"
    ]),
    G("materials", "고분자·연성재료", "hybrid", "prediction", "open", ["doe_materials"], [
      "고분자 서열과 가공조건에서 최종 물성을 예측할 수 있는가?",
      "강하고 질기며 완전 재활용 가능한 고분자를 만들 수 있는가?",
      "열경화성 수지를 원료 수준으로 되돌리는 범용 화학이 가능한가?",
      "연성 전자재료의 반복 변형 수명을 미세구조에서 예측할 수 있는가?",
      "자극에 적응하고 기억하는 인공 연성재료를 설계할 수 있는가?"
    ]),
    G("materials", "바이오·복합재료", "engineering", "scale", "open", ["doe_materials", "nist_materials"], [
      "생체조직처럼 강도·치유·감지 기능을 통합한 재료를 만들 수 있는가?",
      "이식재의 면역반응과 장기 열화를 환자별로 예측할 수 있는가?",
      "뼈·치아·껍질의 계층구조를 산업 규모로 재현할 수 있는가?",
      "섬유복합재의 내부 손상을 작동 중 비파괴로 추적할 수 있는가?",
      "자연재료보다 가볍고 질긴 대면적 복합재를 결함 없이 만들 수 있는가?"
    ]),
    G("materials", "제조·공정", "engineering", "scale", "open", ["nist_materials", "doe_materials"], [
      "실험실 재료를 대량생산해도 동일한 미세구조와 물성을 유지할 수 있는가?",
      "적층제조 부품의 기공·잔류응력·조직을 실시간 폐루프 제어할 수 있는가?",
      "공정–구조–물성–수명을 잇는 검증된 디지털 트윈을 만들 수 있는가?",
      "극한환경 재료의 수십 년 수명을 짧은 시험으로 인증할 수 있는가?",
      "원자층 정밀도와 산업 처리량을 동시에 갖는 제조법이 가능한가?"
    ]),
    G("materials", "순환·핵심소재", "engineering", "system", "open", ["doe_critical", "nist_materials"], [
      "혼합 폐기물에서 핵심원소를 낮은 에너지로 선택 회수할 수 있는가?",
      "재활용을 반복해도 성능이 저하되지 않는 재료 순환계를 만들 수 있는가?",
      "희토류 없는 고성능 영구자석을 만들 수 있는가?",
      "독성·탄소·물·공급망 위험을 물성과 함께 역설계할 수 있는가?",
      "복합재와 전자제품을 처음부터 분해·수리 가능하게 설계할 수 있는가?"
    ]),

    // Semiconductor & electronics — 60 open questions
    G("semiconductor", "소자 물리", "theory", "fundamental", "open", ["doe_micro", "src_decadal"], [
      "빠르고 신뢰할 수 있는 전자 스위치가 란다우어 한계에 얼마나 접근할 수 있는가?",
      "실온에서 볼츠만 subthreshold 한계를 안정적으로 우회할 수 있는가?",
      "원자 크기 접촉비저항의 실질적 하한은 얼마인가?",
      "나노소자의 1/f 잡음과 랜덤 전신 잡음을 원자 결함에서 예측할 수 있는가?",
      "전자–포논 비평형 수송과 발열을 제일원리로 계산할 수 있는가?"
    ]),
    G("semiconductor", "CMOS 미세화", "engineering", "system", "open", ["doe_micro", "src_mapt"], [
      "GAA 나노시트를 더 축소하면서 구동전류와 정전기 제어를 유지할 수 있는가?",
      "nFET과 pFET을 수직 적층한 CFET을 높은 수율로 제조할 수 있는가?",
      "하부 회로를 손상시키지 않는 저온 단일칩 3차원 집적이 가능한가?",
      "초미세 SRAM의 읽기·쓰기·누설 상충관계를 해결할 수 있는가?",
      "트랜지스터당 비용이 더 이상 감소하지 않는 경제적 한계를 넘을 수 있는가?"
    ]),
    G("semiconductor", "Beyond-CMOS", "hybrid", "scale", "open", ["doe_micro", "nist_metrology"], [
      "웨이퍼 규모 2차원 반도체로 균형 잡힌 n형·p형 CMOS를 만들 수 있는가?",
      "2차원 반도체에 페르미 준위 고정 없는 저저항 접점을 만들 수 있는가?",
      "탄소나노튜브의 키랄리티를 분리하고 수십억 개를 정렬할 수 있는가?",
      "터널·음의 정전용량·스핀 소자가 시스템 수준에서 CMOS를 능가할 수 있는가?",
      "분자·단일원자 트랜지스터를 동일 특성으로 대량생산할 수 있는가?"
    ]),
    G("semiconductor", "재료·공정", "hybrid", "prediction", "open", ["nist_metrology", "src_mapt"], [
      "원자층 절연막의 계면 트랩과 시간 의존 파괴를 예측할 수 있는가?",
      "구리보다 낮은 실제 나노배선 저항을 갖는 대체 금속은 무엇인가?",
      "완전한 영역 선택 증착과 무손상 원자층 식각을 구현할 수 있는가?",
      "플라즈마 공정이 만드는 잠재 손상을 실시간 측정할 수 있는가?",
      "새 재료 레시피를 300 mm 팹으로 빠르게 이전할 수 있는가?"
    ]),
    G("semiconductor", "EUV·계측", "experiment", "measurement", "current", ["nist_metrology", "src_mapt"], [
      "High-NA EUV의 해상도–거칠기–감도 상충관계를 깰 수 있는가?",
      "광자 샷 잡음이 만드는 확률적 단선·브리지 결함을 제거할 수 있는가?",
      "EUV 다층 마스크 내부 결함을 노광 파장에서 전수 검사할 수 있는가?",
      "여러 층의 에지 배치 오차를 원자 크기에 가까운 정확도로 제어할 수 있는가?",
      "묻힌 3차원 구조의 원소·형상·전기 특성을 인라인 측정할 수 있는가?"
    ]),
    G("semiconductor", "배선·열", "engineering", "system", "open", ["src_mapt", "nist_metrology"], [
      "나노 구리배선의 저항 급증과 전자이동을 어떻게 해결할 것인가?",
      "배선 RC 지연이 트랜지스터 이득을 압도하는 문제를 넘을 수 있는가?",
      "후면 전력 공급망과 전면 신호망을 함께 최적화할 수 있는가?",
      "3차원 적층칩 중심부의 열을 효율적으로 제거할 수 있는가?",
      "칩 내부 데이터 이동 에너지를 획기적으로 낮출 수 있는가?"
    ]),
    G("semiconductor", "메모리·인메모리", "engineering", "system", "open", ["src_decadal", "nist_metrology"], [
      "DRAM 축소와 리프레시 전력 문제를 동시에 해결할 수 있는가?",
      "ReRAM 필라멘트의 변동성과 내구성을 원자 수준에서 제어할 수 있는가?",
      "MRAM의 쓰기 에너지·속도·보존성 상충관계를 해결할 수 있는가?",
      "아날로그 메모리를 충분한 정밀도와 장기 안정성으로 만들 수 있는가?",
      "주변회로까지 포함한 인메모리 연산이 실제 시스템에서 우수할 수 있는가?"
    ]),
    G("semiconductor", "칩렛·패키징", "engineering", "scale", "open", ["nist_packaging", "src_mapt"], [
      "서로 다른 공급자의 칩렛을 완전히 상호운용 가능하게 만들 수 있는가?",
      "1 μm 이하 피치 하이브리드 본딩을 높은 수율로 구현할 수 있는가?",
      "본딩 계면의 보이드와 오염을 파괴 없이 전수 검사할 수 있는가?",
      "수백 개 칩렛의 열·전력·신호 무결성을 동시에 보장할 수 있는가?",
      "불량 칩렛을 시험하고 교체할 수 있는 수리형 패키지가 가능한가?"
    ]),
    G("semiconductor", "아날로그·RF", "hybrid", "system", "open", ["src_decadal", "src_mapt"], [
      "센서 원시 데이터를 정보 손실 없이 10만 대 1로 축약할 수 있는가?",
      "ADC의 속도·해상도·전력 사이 한계를 새로운 원리로 넘을 수 있는가?",
      "전력증폭기의 효율–선형성–대역폭 상충관계를 깰 수 있는가?",
      "소형·고출력·고감도 THz 송수신기를 만들 수 있는가?",
      "아날로그·RF 회로 설계를 디지털 수준으로 자동화할 수 있는가?"
    ]),
    G("semiconductor", "전력전자", "engineering", "scale", "open", ["doe_micro", "src_mapt"], [
      "SiC MOS 계면의 낮은 이동도와 문턱전압 불안정을 해결할 수 있는가?",
      "GaN HEMT의 트랩과 동적 온저항 문제를 제거할 수 있는가?",
      "초광대역갭 반도체에서 안정적인 p형 도핑을 구현할 수 있는가?",
      "수십 kV 전력모듈의 절연·부분방전·열 피로를 장기 제어할 수 있는가?",
      "소자·구동·자성체·커패시터·냉각을 함께 최적화할 수 있는가?"
    ]),
    G("semiconductor", "포토닉스·양자", "engineering", "system", "open", ["doe_micro", "nist_metrology"], [
      "실리콘 위에 효율적이고 장수명인 레이저를 대량 집적할 수 있는가?",
      "광 I/O가 패키징과 레이저를 포함해 1 pJ/bit 이하를 달성할 수 있는가?",
      "수백만 큐비트의 제어·판독을 극저온 발열 한도 안에서 수행할 수 있는가?",
      "큐비트 재현성과 재료 잡음의 원인을 제조 전에 예측할 수 있는가?",
      "마이크로파와 광자를 낮은 잡음으로 양자 변환할 수 있는가?"
    ]),
    G("semiconductor", "EDA·제조·보안", "engineering", "system", "open", ["darpa_eri", "nist_security", "epa_semiconductor"], [
      "수천억 트랜지스터의 전기·열·기계 거동을 함께 시뮬레이션할 수 있는가?",
      "AI가 만든 회로의 정확성과 보안을 형식적으로 증명할 수 있는가?",
      "3차원 칩렛 시스템을 충분한 고장 검출률로 시험할 수 있는가?",
      "하드웨어 트로이 목마와 부채널을 낮은 오버헤드로 차단할 수 있는가?",
      "PFAS와 불소계 온실가스 없이 첨단 반도체를 제조할 수 있는가?"
    ]),

    // Known boundaries — deliberately separated from open problems
    G("physics", "알려진 물리 경계", "theory", "boundary", "impossible", ["doe_qis"], [
      "에너지 공급 없이 영구적으로 일을 생산하는 영구기관을 만들 수 있는가?",
      "상대론의 인과율을 유지하면서 빛보다 빠르게 정보를 보낼 수 있는가?",
      "단 하나의 미지 양자상태를 완벽하게 측정하고 복제할 수 있는가?"
    ], { whyOpen: "열역학 법칙, 상대론적 인과율, 양자 무복제 정리가 각각 요구를 금지한다.", solvedWhen: "새로운 난제가 아니라 어떤 전제에서 금지되는지를 명확히 이해하는 경계 사례다." }),
    G("chemistry", "알려진 화학 경계", "theory", "boundary", "impossible", ["nist_chem"], [
      "닫힌 평형 화학계에서 자유에너지 변화 없이 순환적으로 일을 얻을 수 있는가?",
      "원자·전하 보존을 어기면서 원하는 생성물을 합성할 수 있는가?",
      "분리 대상에 관한 정보와 자유에너지 비용 없이 완전한 분리를 수행할 수 있는가?"
    ], { whyOpen: "열역학과 보존법칙이 이런 형태의 요구를 금지하며, 실제 분리는 엔트로피와 정보 비용을 갖는다.", solvedWhen: "해결 대상이 아니라 공정 목표를 설정할 때 지켜야 할 이론적 하한으로 사용된다." }),
    G("biology", "정보가 소실된 생물 경계", "theory", "boundary", "impossible", ["ncbi"], [
      "어떤 유전·형태 정보도 남지 않은 멸종 개체를 동일한 개체로 복원할 수 있는가?",
      "측정하지 않은 과거 생태계의 모든 개체 상태를 유일하게 재구성할 수 있는가?",
      "동일한 유전체만으로 한 사람의 기억과 경험까지 완전히 복제할 수 있는가?"
    ], { whyOpen: "소실된 초기조건과 경험 정보는 현재 자료에 존재하지 않아 유일한 역문제가 되지 않는다.", solvedWhen: "복원 가능한 범위와 소실된 정보를 구분하고 불확실성을 명시하는 것이 올바른 목표다." }),
    G("materials", "재료의 현실적 경계", "engineering", "boundary", "practical", ["doe_materials"], [
      "거시 재료의 모든 원자를 개별 제어하면서 산업 처리량을 유지할 수 있는가?",
      "모든 온도·하중·환경에서 영원히 열화하지 않는 구조재료를 만들 수 있는가?",
      "모든 핵심 물성을 동시에 각자의 이론적 최댓값으로 만드는 단일 재료가 가능한가?"
    ], { whyOpen: "자유도 수, 열적 요동, 결함 통계와 상충 물성이 현실적 또는 열역학적 한계를 만든다.", solvedWhen: "절대 목표 대신 용도별 파레토 한계와 허용 수명을 정량화할 때 설계 가능한 문제가 된다." }),
    G("semiconductor", "전자정보의 경계", "theory", "boundary", "impossible", ["doe_micro", "src_decadal"], [
      "유한 온도에서 에너지와 오류를 전혀 발생시키지 않는 빠른 비가역 논리게이트가 가능한가?",
      "유한한 중복만으로 크기와 종류가 무제한인 모든 하드웨어 오류를 완벽히 정정할 수 있는가?",
      "임의의 복잡한 칩과 환경을 유한한 측정만으로 완전히 동일하게 복제·검증할 수 있는가?"
    ], { whyOpen: "열역학적 정보비용, 유한 부호의 정정 한계와 불완전한 관측정보가 절대적 요구를 막는다.", solvedWhen: "오류·에너지·환경의 범위를 한정하고 달성 가능한 하한과 보증 수준을 명시해야 한다." })
  ];

  let index = 0;
  const PROBLEMS = GROUPS.flatMap(group => group.items.map(question => {
    index += 1;
    return {
      id: `UP-${String(index).padStart(3, "0")}`,
      question,
      discipline: group.discipline,
      subfield: group.subfield,
      approach: group.approach,
      nature: group.nature,
      feasibility: group.feasibility,
      sourceIds: group.sources,
      whyOpen: group.whyOpen || DEFAULT_WHY[group.nature],
      solvedWhen: group.solvedWhen || DEFAULT_SOLVED[group.nature]
    };
  }));

  window.CATALOG_META = META;
  window.CATALOG_SOURCES = SOURCES;
  window.PROBLEMS = PROBLEMS;
})();
