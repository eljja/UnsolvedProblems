/*
 * Curated research cycles and structural links between open problems.
 *
 * Facts below are tied to the cited primary literature. Research hypotheses,
 * thresholds, and proposed experiments are prospective designs, not claims of
 * solved problems or literature priority.
 */
(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    nature_mattergen_2025: {
      discipline: "materials",
      title: "A generative model for inorganic materials design",
      url: "https://www.nature.com/articles/s41586-025-08628-5",
      evidenceLabel: "동료심사 원 연구",
      evidenceLabelEn: "Peer-reviewed primary study",
      reviewedOn: REVIEWED_ON
    },
    nature_gnome_2023: {
      discipline: "materials",
      title: "Scaling deep learning for materials discovery",
      url: "https://www.nature.com/articles/s41586-023-06735-9",
      evidenceLabel: "동료심사 원 연구",
      evidenceLabelEn: "Peer-reviewed primary study",
      reviewedOn: REVIEWED_ON
    },
    nature_alab_2023: {
      discipline: "materials",
      title: "An autonomous laboratory for the accelerated synthesis of inorganic materials",
      url: "https://www.nature.com/articles/s41586-023-06734-w",
      evidenceLabel: "수정 반영 원 연구",
      evidenceLabelEn: "Corrected primary study",
      reviewedOn: REVIEWED_ON
    },
    nature_alab_correction_2026: {
      discipline: "materials",
      title: "Author Correction: An autonomous laboratory for the accelerated synthesis of inorganic materials",
      url: "https://www.nature.com/articles/s41586-025-09992-y",
      evidenceLabel: "공식 저자 정정",
      evidenceLabelEn: "Official author correction",
      reviewedOn: REVIEWED_ON
    },
    prx_autonomous_synthesis_2024: {
      discipline: "materials",
      title: "Challenges in High-Throughput Inorganic Materials Prediction and Autonomous Synthesis",
      url: "https://journals.aps.org/prxenergy/abstract/10.1103/PRXEnergy.3.011002",
      evidenceLabel: "동료심사 비판 분석",
      evidenceLabelEn: "Peer-reviewed critical analysis",
      reviewedOn: REVIEWED_ON
    },
    npj_synthnn_2023: {
      discipline: "materials",
      title: "Predicting the synthesizability of crystalline inorganic materials from the data of known material compositions",
      url: "https://www.nature.com/articles/s41524-023-01114-4",
      evidenceLabel: "동료심사 원 연구",
      evidenceLabelEn: "Peer-reviewed primary study",
      reviewedOn: REVIEWED_ON
    },
    rsc_matfold_2025: {
      discipline: "materials",
      title: "MatFold: systematic insights into materials discovery models' performance through standardized cross-validation protocols",
      url: "https://pubs.rsc.org/en/content/articlehtml/2025/dd/d4dd00250d",
      evidenceLabel: "동료심사 방법·벤치마크",
      evidenceLabelEn: "Peer-reviewed method and benchmark",
      reviewedOn: REVIEWED_ON
    },
    neurips_covariate_shift_2019: {
      discipline: "mathematics",
      title: "Conformal Prediction Under Covariate Shift",
      url: "https://proceedings.neurips.cc/paper/2019/hash/8fb21ee7a2207526da55a679f0332de2-Abstract.html",
      evidenceLabel: "동료심사 원 연구",
      evidenceLabelEn: "Peer-reviewed primary study",
      reviewedOn: REVIEWED_ON
    },
    arxiv_active_learning_ood_2025: {
      discipline: "materials",
      title: "When Active Learning Fails, Uncalibrated Out of Distribution Uncertainty Quantification Might Be the Problem",
      url: "https://arxiv.org/abs/2511.17760",
      evidenceLabel: "검토 중인 사전논문",
      evidenceLabelEn: "Preprint under community review",
      reviewedOn: REVIEWED_ON
    }
  });

  const records = {
    "UP-181": {
      role: pair("목표 물성에서 만들 수 있는 후보로 가는 역설계의 입구", "Entry point from target properties to buildable candidates"),
      updatedDefinition: pair(
        "역설계의 목표는 계산상 높은 점수를 받는 결정구조를 생성하는 데 그치지 않는다. 지정한 물성 허용오차를 만족하고, 명시된 공정 범위에서 실제 상으로 합성되며, 독립 측정에서도 그 물성이 재현되는 조성–구조–공정 묶음을 찾아야 한다.",
        "Inverse design is not complete when a high-scoring crystal structure is generated. It must identify a composition–structure–process package that meets a property tolerance, forms as the intended phase within a declared process envelope, and reproduces the property under independent measurement."
      ),
      knownBoundary: pair(
        "MatterGen은 조건부 결정 생성을 확장했고 생성 구조 한 종을 합성해 목표 물성을 20% 이내에서 확인했다. 이는 역설계가 실험으로 이어질 수 있음을 보였지만, 단일 시연은 다양한 화학계에서의 합성 성공률이나 공정 이동성을 판정하지 못한다.",
        "MatterGen broadened conditional crystal generation and synthesized one generated structure whose measured property was within 20% of target. This establishes an experimental bridge, but a single demonstration cannot determine synthesis yield or process transportability across chemical families."
      ),
      bottleneck: pair(
        "생성모형의 목적함수에는 결정의 계산 물성은 들어가도 전구체 선택, 반응 중간상, 결함과 미세구조가 만드는 실제 물성 손실은 거의 들어가지 않는다.",
        "Generative objectives can include computed crystal properties while largely omitting precursor choice, reaction intermediates, and the property loss caused by defects and microstructure."
      ),
      minimumAdvance: pair(
        "서로 다른 두 화학계에서 사전에 고정한 물성 허용오차와 공정 범위를 동시에 만족하는 후보를 각각 하나 이상 독립 합성·측정하면, 일반 해답은 아니어도 구조 생성과 제작 가능성 사이의 연결을 한 단계 검증한다.",
        "Independently synthesizing and measuring at least one candidate in each of two distinct chemical families while meeting preregistered property tolerances and process envelopes would validate one bridge between structural generation and buildability, even without a general solution."
      ),
      hypotheses: [
        { code: "H1", claim: pair("계산 안정성과 목표 물성으로 조건화한 생성만으로 실험 성공 후보가 농축된다.", "Conditioning generation on computed stability and target property alone enriches experimentally successful candidates."), prediction: pair("동일 실험 예산에서 무작위·치환 탐색보다 독립 확인된 목표 달성률이 높다.", "Under the same experimental budget, independently confirmed target attainment exceeds random or substitution search."), reject: pair("엄격한 화학계 홀드아웃에서 확인 성공률 또는 단순 후회값이 기준선과 구별되지 않으면 기각한다.", "Reject if confirmed success or simple regret is indistinguishable from baseline under strict chemical-family holdout.") },
        { code: "H2", claim: pair("후보와 합성 경로를 함께 생성해야 실제 성공률이 오른다.", "Candidates and synthesis routes must be generated jointly to improve real success."), prediction: pair("반응 중간상과 전구체 제약을 넣은 정책이 구조 전용 생성기보다 적은 실험으로 목표 상을 만든다.", "A policy incorporating reaction intermediates and precursor constraints reaches the target phase in fewer experiments than a structure-only generator."), reject: pair("경로 정보를 제거해도 성공률과 실험 수가 유지되면 기각한다.", "Reject if removing route information leaves success rate and experiment count unchanged.") },
        { code: "H3", claim: pair("구조가 맞아도 결함·미세구조가 목표 물성을 지배해 역설계가 실패한다.", "Even with the intended structure, defects and microstructure dominate the property and defeat inverse design."), prediction: pair("상동정에는 성공하지만 열처리·입도·결함 상태에 따라 물성이 허용오차 밖으로 체계적으로 이동한다.", "Phase identification succeeds while annealing, grain size, or defect state systematically moves the property outside tolerance."), reject: pair("독립 공정 반복에서 물성이 구조 계산값 주변에 보정오차 내로 모이면 기각한다.", "Reject if independent process repeats cluster around the computed structural value within calibration error.") }
      ],
      decisiveTest: pair(
        "구조 전용 생성과 경로 공동설계를 같은 12개 목표 조건에 짝지어 적용한다. 후보·공정·판정 기준을 잠근 뒤 다른 연구자가 합성하고, 상분율과 목표 물성을 맹검 측정해 ‘확인된 목표 후보/총 실험’과 단순 후회값을 비교한다.",
        "Pair structure-only generation and joint candidate–route design on the same 12 target conditions. Freeze candidates, processes, and decision rules; have a separate team synthesize them and blindly measure phase fraction and target property, comparing confirmed targets per experiment and simple regret."
      ),
      unresolved: pair("12개 목표의 파일럿은 가능성을 판정할 뿐 원소공간 전체의 일반 역설계를 증명하지 않는다.", "A 12-target pilot tests feasibility but cannot establish general inverse design across elemental space."),
      sourceIds: ["nature_mattergen_2025", "nature_alab_2023", "nature_alab_correction_2026"]
    },
    "UP-182": {
      role: pair("유한한 실험 예산을 정보가 큰 후보에 배분하는 탐색 엔진", "Search engine allocating finite experimental budget to informative candidates"),
      updatedDefinition: pair(
        "이 문제는 전체 조성·구조 공간을 보지 않고도 고성능 재료에 가까워질 수 있는지 묻는다. 따라서 계산 속도가 아니라, 고정된 계산·실험 예산에서 찾은 최고 실측 물성과 전역 최적값에 대한 남은 후회값을 함께 평가해야 한다.",
        "This asks whether high-performance materials can be approached without observing the full composition–structure space. The relevant outcome is not computation speed alone, but the best measured property under a fixed compute–experiment budget and the remaining regret relative to a defensible global reference."
      ),
      knownBoundary: pair(
        "GNoME은 활성학습과 대규모 계산으로 안정 결정 후보 공간을 크게 확장했고, A-Lab은 관측된 중간 반응을 이용하면 일부 경로 탐색공간을 최대 80% 줄일 수 있음을 보고했다. 어느 결과도 목표 물성의 전역 최적점을 놓치지 않았다는 보장은 주지 않는다.",
        "GNoME expanded the stable-crystal candidate space through active learning and large-scale computation, while A-Lab reported that observed reaction intermediates can reduce some route search spaces by up to 80%. Neither result guarantees that a global property optimum was not missed."
      ),
      bottleneck: pair("불확실성이 큰 후보를 고르는 전략은 그 불확실성이 학습 범위 밖에서도 보정돼 있을 때만 정보이득을 준다. 중복 데이터와 과신은 탐색을 좁은 화학계에 가둔다.", "Selecting high-uncertainty candidates yields information only when uncertainty remains calibrated out of distribution. Redundant data and overconfidence can trap search in familiar chemistry."),
      minimumAdvance: pair("엄격한 원소·구조 홀드아웃에서 동일 예산의 무작위, 불확실성 기반, 실패정보 기반 정책을 비교해 한 정책이 확인된 최고 물성과 탐색 다양성을 동시에 개선하면 의미 있는 전진이다.", "A meaningful advance would show, under strict elemental and structural holdouts, that one of random, uncertainty-driven, or failure-aware policies improves both the best confirmed property and search diversity under the same budget."),
      hypotheses: [
        { code: "H1", claim: pair("조건부 생성은 유효한 탐색공간 압축기다.", "Conditional generation is an effective compressor of search space."), prediction: pair("초기 후보 수를 크게 줄여도 최종 최고 실측 물성의 후회값이 증가하지 않는다.", "A large reduction in initial candidates does not increase regret in the best measured property."), reject: pair("엄격 홀드아웃에서 생성기가 알려진 계열 주변만 반복하거나 후회값이 커지면 기각한다.", "Reject if the generator repeats known families or regret grows under strict holdout.") },
        { code: "H2", claim: pair("실패 반응의 중간상을 이용한 정책이 불확실성만 쓰는 정책보다 효율적이다.", "A policy using intermediates from failed reactions is more efficient than uncertainty-only selection."), prediction: pair("같은 목표 상을 더 적은 합성으로 얻고 동일 실패 경로의 반복을 줄인다.", "It reaches the same target phase with fewer syntheses and fewer repeated failure pathways."), reject: pair("실패 이력을 제거해도 선택 순서와 성공률이 유지되면 기각한다.", "Reject if removing failure history leaves selection order and success unchanged.") },
        { code: "H3", claim: pair("보고된 탐색 효율의 상당 부분은 무작위 분할의 누출과 데이터 중복이다.", "Much reported search efficiency arises from leakage in random splits and data redundancy."), prediction: pair("원소·화학계·구조군을 통째로 분리하면 성능과 불확실성 순위가 급격히 악화된다.", "Holding out entire elements, chemical systems, and structure families sharply degrades performance and uncertainty ranking."), reject: pair("모든 엄격 분할에서도 효율 우위와 보정이 유지되면 기각한다.", "Reject if efficiency and calibration persist across all strict splits.") }
      ],
      decisiveTest: pair("동일 후보 풀과 60회 합성 예산에서 무작위, 보정 불확실성, 실패경로 기반 정책을 사전 등록 비교한다. 최고 확인 물성, 발견 화학계 수, 누적 단순 후회값과 중복 실패율을 회차별로 공개한다.", "Preregister a comparison of random, calibrated-uncertainty, and failure-path policies on one candidate pool with a 60-synthesis budget. Publish the best confirmed property, number of discovered chemical families, cumulative simple regret, and repeated-failure rate by round."),
      unresolved: pair("후보 풀 밖의 진짜 전역 최적값은 알 수 없으므로 후회값의 기준 자체가 계산 모델에 의존한다.", "The true global optimum outside the candidate pool is unknown, so the regret reference remains model-dependent."),
      sourceIds: ["nature_gnome_2023", "nature_alab_2023", "rsc_matfold_2025", "arxiv_active_learning_ood_2025"]
    },
    "UP-183": {
      role: pair("계산 안정성을 실제 합성 확률로 번역하는 관문", "Gate translating computed stability into actual synthesis probability"),
      updatedDefinition: pair("합성 가능성은 물질에 붙은 고정된 참·거짓 표지가 아니다. 전구체, 분위기, 온도–시간 경로, 혼합과 재분쇄, 장비 범위를 명시했을 때 목표 상이 재현될 조건부 확률로 정의해야 한다.", "Synthesizability is not a fixed true–false label attached to a material. It should be defined as the conditional probability of reproducibly obtaining the target phase given precursors, atmosphere, temperature–time path, mixing and regrinding, and an instrument envelope."),
      knownBoundary: pair("SynthNN은 조성 데이터로 합성 가능 후보의 정밀도를 형성에너지 기준보다 높였지만 알려진 물질의 존재 표지를 학습한다. 수정된 A-Lab 결과는 57개 목표 중 36개를 확인했고 4개는 XRD만으로 불확정했으며, 0 K 안정성과 성공 사이에 뚜렷한 상관을 찾지 못했다.", "SynthNN improved precision over formation-energy screening using composition data, but learns labels based on known-material existence. The corrected A-Lab result confirmed 36 of 57 targets, left four inconclusive by XRD alone, and found no clear correlation between 0 K stability and success."),
      bottleneck: pair("열역학적 안정성, 반응 경로의 운동학, 그리고 상동정 오차가 하나의 성공 표지에 섞여 있어 실패 원인을 구분하기 어렵다.", "Thermodynamic stability, reaction-path kinetics, and phase-identification error are mixed into one success label, obscuring why an attempt failed."),
      minimumAdvance: pair("공정 범위를 고정한 전향 시험에서 합성 확률이 보정되고, 실패를 운동학·휘발·비정질화·계산오차·판정불확정으로 재현성 있게 분류하면 합성 가능성 예측의 정의가 한 단계 닫힌다.", "A prospective test that calibrates synthesis probability under a fixed process envelope and reproducibly classifies failures into kinetics, volatility, amorphization, computational error, or inconclusive adjudication would materially sharpen the definition of synthesizability."),
      hypotheses: [
        { code: "H1", claim: pair("충분히 낮은 hull 거리와 반응 구동력이 합성 성공을 주로 결정한다.", "Low hull distance and reaction driving force primarily determine synthesis success."), prediction: pair("공정을 고정해도 두 변수로 목표 상 성공 확률이 보정된다.", "With process fixed, the two variables yield calibrated target-phase probabilities."), reject: pair("같은 열역학 구간에서 경로에 따라 성공률이 크게 갈리면 기각한다.", "Reject if routes in the same thermodynamic range have sharply different success rates.") },
        { code: "H2", claim: pair("전구체가 만드는 중간상과 속도 장벽이 합성 여부를 지배한다.", "Precursor-driven intermediates and kinetic barriers dominate synthesizability."), prediction: pair("목표와 온도가 같아도 중간상 네트워크를 바꾸면 성공률이 방향성 있게 변한다.", "At fixed target and temperature, changing the intermediate network shifts success in a predicted direction."), reject: pair("경로 개입이 결과를 바꾸지 않고 안정성만으로 설명되면 기각한다.", "Reject if route interventions do not change outcomes and stability alone explains them.") },
        { code: "H3", claim: pair("상당한 성공·실패 차이는 자동 상동정의 오분류다.", "A substantial share of apparent success–failure differences is automated phase-label error."), prediction: pair("맹검 수동 Rietveld와 직교 분석을 추가하면 자동 성공 표지 일부가 불확정 또는 실패로 이동한다.", "Adding blinded manual Rietveld refinement and orthogonal analysis moves some automated successes to inconclusive or failed."), reject: pair("독립 판정과 자동 표지가 사전 허용 불일치율 안에서 일치하면 기각한다.", "Reject if independent adjudication and automated labels agree within the preregistered discrepancy tolerance.") }
      ],
      decisiveTest: pair("세 화학계에서 목표 18개를 고르고 각 목표에 열역학 점수가 비슷하지만 중간상 경로가 다른 세 전구체 조합을 배정한다. 자동 XRD 판정과 맹검 수동 Rietveld·직교 분석을 분리해 H1–H3의 설명력을 비교한다.", "Choose 18 targets across three chemical families and assign three precursor sets per target with similar thermodynamic scores but different intermediate pathways. Separate automated XRD calls from blinded manual Rietveld and orthogonal analysis, then compare the explanatory power of H1–H3."),
      unresolved: pair("한 공정 플랫폼의 조건부 확률은 박막, 고압, 용액 또는 비평형 합성으로 자동 이동하지 않는다.", "Conditional probabilities from one process platform do not automatically transport to thin-film, high-pressure, solution, or nonequilibrium synthesis."),
      sourceIds: ["npj_synthnn_2023", "nature_alab_2023", "nature_alab_correction_2026", "prx_autonomous_synthesis_2024"]
    },
    "UP-184": {
      role: pair("새 화학계에서 모형이 언제 침묵해야 하는지 정하는 신뢰성 층", "Reliability layer deciding when a model must abstain on new chemistry"),
      updatedDefinition: pair("학습 범위 밖 신뢰성은 평균 오차가 낮다는 뜻이 아니다. 어떤 원소·구조·공정 이동에서 예측 구간이 실제 오차를 약속한 비율로 덮는지, 덮지 못할 때 모형이 사전에 거부할 수 있는지를 묻는다.", "Out-of-distribution reliability is not low average error. It asks under which elemental, structural, and process shifts prediction intervals retain promised coverage, and whether the model can abstain before failure when they do not."),
      knownBoundary: pair("MatFold는 무작위 분할이 성능을 낙관하며 원소·공간군·화학계 홀드아웃의 난도가 모형과 과제마다 다름을 보였다. 2025년 사전논문은 OOD 불확실성 보정 실패가 활성학습을 무작위 선택보다 낫게 만들지 못할 수 있다고 보고했지만 아직 동료심사 전이다.", "MatFold showed that random splits are optimistic and that elemental, space-group, and chemical-system holdouts stress models differently by task and architecture. A 2025 preprint reports that failed OOD uncertainty calibration can prevent active learning from outperforming random selection, but it is not yet peer reviewed."),
      bottleneck: pair("화학계 이동은 단순 공변량 이동이 아니라 구조–물성 관계 자체가 바뀌는 개념 이동일 수 있어, 보정 집합의 교환가능성 가정이 깨진다.", "A chemical-family shift may change the structure–property relation itself rather than merely the covariate distribution, breaking the exchangeability assumptions behind calibration."),
      minimumAdvance: pair("원소, 화학계, 구조군 홀드아웃을 분리해 각각의 경험적 커버리지와 거부율을 공개하고, 보장할 수 없는 이동 유형을 사전에 식별하면 신뢰성 경계를 실제로 좁힌다.", "Separating elemental, chemical-system, and structure-family holdouts, publishing empirical coverage and abstention for each, and prospectively identifying shift types that cannot be covered would narrow the reliability boundary."),
      hypotheses: [
        { code: "H1", claim: pair("화학적으로 구성한 분할과 가중 conformal 보정으로 OOD 구간을 유지할 수 있다.", "Chemically structured splits plus weighted conformal calibration can retain OOD intervals."), prediction: pair("밀도비가 추정 가능한 이동에서 목표 커버리지가 허용오차 안에 유지된다.", "Coverage remains within tolerance when the shift density ratio is estimable."), reject: pair("가중 후에도 화학계별 커버리지가 체계적으로 붕괴하면 기각한다.", "Reject if family-wise coverage still collapses after weighting.") },
        { code: "H2", claim: pair("보정된 불확실성 순위는 새 화학계에서 가장 정보가 큰 실험을 고른다.", "Calibrated uncertainty ranking selects the most informative experiments in new chemistry."), prediction: pair("무작위보다 적은 실험으로 OOD 오차와 보정오차를 함께 줄인다.", "It reduces both OOD error and calibration error with fewer experiments than random selection."), reject: pair("사전 등록 반복에서 무작위와 차이가 없거나 보정오차가 커지면 기각한다.", "Reject if preregistered repeats match random selection or worsen calibration error.") },
        { code: "H3", claim: pair("일부 화학계 이동에는 유효한 확률 보장이 불가능하고 거부만 정직한 답이다.", "For some chemical shifts, valid probabilistic guarantees are unavailable and abstention is the only honest response."), prediction: pair("표현공간 지지집합이 겹치지 않는 구간에서 모든 보정법이 실패하지만 거리 기반 거부는 실패를 사전에 농축한다.", "Where representation supports do not overlap, all calibration methods fail while distance-based abstention prospectively concentrates failures."), reject: pair("지지집합 비중첩에서도 안정적 커버리지를 달성하면 기각한다.", "Reject if stable coverage is achieved despite non-overlapping support.") }
      ],
      decisiveTest: pair("같은 데이터에서 무작위, 원소 제외, 화학계 제외, 구조군 제외 분할을 고정하고 네 불확실성 방법의 커버리지·구간폭·거부 선택도를 비교한다. 판정집합은 분석 전에 봉인하고 활성학습은 한 번만 실행한다.", "Freeze random, leave-one-element, leave-one-chemical-system, and leave-one-structure-family splits on the same data, then compare coverage, interval width, and abstention selectivity for four uncertainty methods. Seal the adjudication set before analysis and run active learning only once."),
      unresolved: pair("유한 벤치마크의 커버리지는 아직 관측되지 않은 합성 공정과 물성 종류에 대한 보장이 아니다.", "Coverage on a finite benchmark is not a guarantee for unobserved synthesis processes or property classes."),
      sourceIds: ["rsc_matfold_2025", "neurips_covariate_shift_2019", "arxiv_active_learning_ood_2025"]
    },
    "UP-185": {
      role: pair("실패를 검열된 공백이 아니라 학습 가능한 반응 결과로 바꾸는 데이터 기반", "Data foundation turning censored gaps into learnable reaction outcomes"),
      updatedDefinition: pair("실패 데이터베이스는 ‘안 됨’ 표지를 모으는 일이 아니다. 시료 계보, 전구체 로트, 혼합, 분위기, 온도–시간 이력, 중간상, 원자료와 판정 불확실성을 포함해 무엇을 시도했고 무엇이 관측됐는지 완전하게 기록해야 한다.", "A failure database is not a collection of ‘did not work’ labels. It must completely record what was attempted and observed, including sample lineage, precursor lot, mixing, atmosphere, temperature–time history, intermediates, raw data, and adjudication uncertainty."),
      knownBoundary: pair("A-Lab은 353개 조리법의 성공과 실패를 폐루프에 사용했고 실패를 느린 반응, 휘발, 비정질화와 계산오차로 분류했다. 그러나 문헌 추출 데이터는 성공 사례 중심이며, 실패 공개 여부가 연구자의 선택과 장비 한계에 의존해 무작위 결측이 아니다.", "A-Lab used outcomes from 353 recipes in its loop and classified failures into slow kinetics, volatility, amorphization, and computational error. Literature-extracted data remain success-heavy, while failure publication depends on researcher choices and instrument limits and is therefore not missing at random."),
      bottleneck: pair("실패의 부재와 실험하지 않음, 검출하지 못함, 목표 상이 없음을 구분하지 않으면 모형은 출판 관행과 장비 한계를 합성 법칙으로 학습한다.", "Unless absence of success is separated from not attempted, not detected, and target phase absent, a model learns publication practice and instrument limits as if they were synthesis laws."),
      minimumAdvance: pair("한 기관의 연속 캠페인에서 모든 시도와 원자료를 누락 없이 기록하고, 독립자가 같은 온톨로지로 실패 원인을 재분류해 높은 일치도를 얻으면 표준화의 실현 가능성을 입증한다.", "A complete prospective campaign log with no omitted attempts, independently reclassified under the same ontology with high agreement, would demonstrate that standardization is feasible."),
      hypotheses: [
        { code: "H1", claim: pair("결과·공정·원자료 온톨로지를 통일하면 합성 예측이 개선된다.", "A unified outcome–process–raw-data ontology improves synthesis prediction."), prediction: pair("성공 표지만 쓴 모형보다 보정 오차와 반복 실패율이 낮다.", "It lowers calibration error and repeated-failure rate relative to success-label-only models."), reject: pair("완전 기록을 추가해도 외부 화학계 예측과 실험 선택이 개선되지 않으면 기각한다.", "Reject if complete records do not improve external-family prediction or experiment selection.") },
        { code: "H2", claim: pair("미보고 실패는 무작위 결측이 아니어서 단순 결측대치가 편향을 키운다.", "Unreported failures are not missing at random, so naive imputation increases bias."), prediction: pair("전향 완전기록과 출판 모사 표본의 실패 분포가 장비·연구자 선택 변수에 따라 다르다.", "Failure distributions differ between prospective complete logs and publication-mimicking samples as a function of instrument and researcher-selection variables."), reject: pair("선택 변수를 조건화한 뒤 두 분포가 같으면 기각한다.", "Reject if the two distributions agree after conditioning on selection variables.") },
        { code: "H3", claim: pair("실패는 공정 계보와 판정 불확실성이 있을 때만 이전 가능한 정보가 된다.", "Failures become transferable information only with process lineage and adjudication uncertainty."), prediction: pair("이 정보를 제거하면 다른 장비·기관에서 실패 유형 예측이 붕괴한다.", "Removing this information collapses failure-type prediction across instruments or sites."), reject: pair("최소 성공·실패 표지만으로도 기관 간 성능이 유지되면 기각한다.", "Reject if minimal success–failure labels retain cross-site performance.") }
      ],
      decisiveTest: pair("동일 캠페인의 완전 원장과 그중 성공 중심으로 가상 출판한 원장을 만든다. 두 데이터로 동일 모형을 학습해 다음 30개 시도의 실패 유형, 성공 확률 보정과 중복 실패 회피율을 전향 비교한다.", "Create a complete ledger for one campaign and a publication-mimicking success-heavy subset. Train the same model on each, then prospectively compare failure-type prediction, success-probability calibration, and repeated-failure avoidance over the next 30 attempts."),
      unresolved: pair("기관이 다른 장비와 명명법을 쓰면 같은 온톨로지라도 관측 과정이 달라지므로 표준 스키마만으로 이동성이 보장되지 않는다.", "Different instruments and naming practices change the observation process across sites, so a standard schema alone cannot guarantee transportability."),
      sourceIds: ["nature_alab_2023", "nature_alab_correction_2026", "prx_autonomous_synthesis_2024", "neurips_covariate_shift_2019"]
    }
  };

  const connections = [
    {
      id: "CONN-MAT-001", problemIds: ["UP-181", "UP-183"], type: pair("구성–실현 가능성", "Construction–realizability"), strength: "direct",
      sharedBottleneck: pair("계산 구조를 만들 수 있는 공정으로 번역하는 함수가 정의되지 않았다.", "The map from a computed structure to a realizable process is not defined."),
      mapping: pair("UP-181의 생성 후보가 UP-183의 ‘공정이 주어진 합성 확률’에 입력되고, 그 확률이 역설계 목적함수의 제약이 된다.", "A generated candidate from UP-181 becomes input to UP-183's synthesis probability conditional on process, which then constrains the inverse-design objective."),
      failureBoundary: pair("결정구조는 같아도 결함·미세구조가 물성을 바꾸면 구조 수준 연결만으로는 부족하다.", "The structural link is insufficient when defects and microstructure change the property despite the same crystal structure."),
      minimumTest: pair("동일 후보에 대해 구조 전용과 경로 공동설계의 맹검 합성 성공률을 비교한다.", "Blindly compare synthesis success for structure-only versus joint structure–route design on the same candidates."),
      sourceIds: ["nature_mattergen_2025", "nature_alab_2023"]
    },
    {
      id: "CONN-MAT-002", problemIds: ["UP-182", "UP-185"], type: pair("검열된 피드백을 쓰는 순차 탐색", "Sequential search with censored feedback"), strength: "direct",
      sharedBottleneck: pair("실패가 누락되면 탐색 정책이 이미 실패한 경로의 비용을 알 수 없다.", "When failures are missing, the search policy cannot learn the cost of already failed routes."),
      mapping: pair("UP-185의 완전 시도 원장이 UP-182의 획득함수에서 중복 실패 페널티와 정보이득을 계산하는 상태가 된다.", "The complete attempt ledger from UP-185 becomes state for computing repeated-failure penalties and information gain in UP-182's acquisition function."),
      failureBoundary: pair("기관마다 실패 판정이 다르면 원장의 피드백을 그대로 합칠 수 없다.", "Ledger feedback cannot be pooled directly when sites adjudicate failure differently."),
      minimumTest: pair("완전 원장 정책과 성공 사례만 본 정책을 같은 60회 예산에서 비교한다.", "Compare a complete-ledger policy with a success-only policy under the same 60-run budget."),
      sourceIds: ["nature_alab_2023", "rsc_matfold_2025"]
    },
    {
      id: "CONN-MAT-003", problemIds: ["UP-184", "UP-625"], type: pair("분포 이동 뒤의 유한표본 보장", "Finite-sample guarantees after distribution shift"), strength: "method-transfer",
      sharedBottleneck: pair("보정 자료와 새 화학계가 교환가능하지 않으면 명목 신뢰수준이 실제 커버리지를 보장하지 않는다.", "Nominal confidence does not guarantee empirical coverage when calibration data and new chemistry are not exchangeable."),
      mapping: pair("UP-625의 가중 conformal 조건을 원소·화학계 홀드아웃에 적용하되, 조건부 분포가 유지되는 공변량 이동과 관계 자체가 바뀌는 개념 이동을 분리한다.", "Apply weighted conformal conditions from UP-625 to elemental and chemical-family holdouts while separating covariate shift, where the conditional relation persists, from concept shift, where it changes."),
      failureBoundary: pair("밀도비를 추정할 지지집합 중첩이 없거나 구조–물성 관계가 바뀌면 가중만으로 보장할 수 없다.", "Weighting cannot guarantee coverage without support overlap or when the structure–property relation changes."),
      minimumTest: pair("이동 유형을 숨긴 판정집합에서 커버리지와 거부 선택도를 동시에 측정한다.", "Measure both coverage and abstention selectivity on a sealed adjudication set with hidden shift types."),
      sourceIds: ["neurips_covariate_shift_2019", "rsc_matfold_2025"]
    },
    {
      id: "CONN-MAT-004", problemIds: ["UP-185", "UP-629"], type: pair("무작위가 아닌 결측과 식별", "Missing-not-at-random identification"), strength: "method-transfer",
      sharedBottleneck: pair("실패 공개 여부가 결과와 연구자의 선택에 함께 의존해 관측 데이터만으로 전체 실패 분포를 식별하기 어렵다.", "Failure reporting depends jointly on outcomes and researcher selection, making the full failure distribution difficult to identify from observed records alone."),
      mapping: pair("UP-629의 선택모형·민감도 분석을 이용해 미보고 실패율에 대한 가정별 합성 성공 확률 구간을 제시한다.", "Use selection models and sensitivity analysis from UP-629 to report synthesis-success intervals under explicit assumptions about unreported failures."),
      failureBoundary: pair("선택 과정에 대한 보조자료나 전향 완전기록이 전혀 없으면 점 식별은 불가능할 수 있다.", "Point identification may be impossible without auxiliary selection data or prospective complete logging."),
      minimumTest: pair("완전 원장에서 결과 의존 검열을 인위적으로 만든 뒤 민감도 구간의 포함률을 검증한다.", "Create outcome-dependent censoring from a complete ledger and test the coverage of sensitivity intervals."),
      sourceIds: ["neurips_covariate_shift_2019"]
    },
    {
      id: "CONN-MAT-005", problemIds: ["UP-183", "UP-185"], type: pair("잠재 결과와 관측 과정의 분리", "Separating latent outcome from observation process"), strength: "direct",
      sharedBottleneck: pair("합성 실패와 검출 실패가 같은 음성 표지로 기록된다.", "Synthesis failure and detection failure are recorded under the same negative label."),
      mapping: pair("UP-185의 판정불확정·원자료 필드가 UP-183에서 실제 상 형성과 계측 판정을 별도 확률변수로 모델링하게 한다.", "Adjudication-uncertainty and raw-data fields from UP-185 allow UP-183 to model actual phase formation and measurement calls as separate random variables."),
      failureBoundary: pair("직교 계측도 같은 구조 모형과 데이터베이스에 의존하면 관측 오류가 독립적이지 않다.", "Observation errors are not independent if orthogonal measurements rely on the same structural model and database."),
      minimumTest: pair("자동 XRD, 맹검 수동 정련과 직교 분석 사이의 혼동행렬을 공개한다.", "Publish the confusion matrix among automated XRD, blinded manual refinement, and orthogonal analysis."),
      sourceIds: ["nature_alab_correction_2026", "prx_autonomous_synthesis_2024"]
    }
  ];

  const cycle = {
    id: "RC-2026-01",
    title: "실패를 학습하는 폐루프 재료 발견",
    titleEn: "Failure-aware closed-loop materials discovery",
    status: "active",
    startedOn: REVIEWED_ON,
    reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records),
    selectionReason: "후보 생성, 탐색, 합성 가능성, 학습 범위 밖 신뢰성과 실패 기록은 동일한 실험 폐루프의 다섯 병목이다. 생성모형·자율실험실·엄격한 OOD 검증과 2026년 공식 정정이 함께 존재해, 문헌 요약을 넘어 경쟁 가설을 실제 판정하는 전향 시험을 설계할 수 있다.",
    selectionReasonEn: "Candidate generation, search, synthesizability, out-of-distribution reliability, and failure logging are five bottlenecks in one experimental loop. Generative models, autonomous laboratories, strict OOD validation, and a 2026 formal correction now coexist, enabling a prospective test that adjudicates competing hypotheses rather than merely summarizing literature.",
    verifiedFindings: [
      {
        text: "MatterGen은 조건부 생성 구조 한 종을 실제 합성해 측정 물성이 목표의 20% 이내임을 보였지만, 다수 후보나 독립 기관에서의 성공률은 아직 판정하지 않았다.",
        textEn: "MatterGen synthesized one conditionally generated structure whose measured property was within 20% of target, but did not adjudicate success rates across many candidates or independent sites.",
        sourceIds: ["nature_mattergen_2025"]
      },
      {
        text: "수정된 A-Lab 논문은 57개 목표 중 36개 성공, 4개 XRD 불확정을 보고한다. 공식 정정은 ‘새로운 재료’가 과학 전체가 아니라 예측 플랫폼에 새로웠다는 뜻으로 오해될 수 있었음을 인정했다.",
        textEn: "The corrected A-Lab paper reports 36 successes among 57 targets and four cases inconclusive by XRD. Its formal correction acknowledged that ‘new’ meant new to the prediction platform, not necessarily new to science.",
        sourceIds: ["nature_alab_2023", "nature_alab_correction_2026"]
      },
      {
        text: "A-Lab의 353개 조리법 중 목표를 만든 비율은 30%였고, 실패 원인은 느린 반응, 휘발, 비정질화와 계산오차로 나뉘었다. 실패는 단일 음성 표지가 아니다.",
        textEn: "Thirty percent of A-Lab's 353 recipes produced their targets, and failures separated into slow kinetics, volatility, amorphization, and computational error. Failure is not a single negative label.",
        sourceIds: ["nature_alab_2023"]
      },
      {
        text: "MatFold는 무작위 분할이 OOD 성능을 과대평가할 수 있고, 가장 어려운 이동 유형은 모형과 물성 과제마다 다르다는 것을 보였다.",
        textEn: "MatFold showed that random splits can overestimate OOD performance and that the hardest shift type depends on model architecture and property task.",
        sourceIds: ["rsc_matfold_2025"]
      }
    ],
    sharedProgram: {
      name: pair("이중 원장 맹검 합성 파일럿", "Dual-ledger blinded synthesis pilot"),
      thesis: pair("생성 후보와 합성 경로를 공동 설계하고 모든 실패를 완전 기록하며, 개발팀과 분리된 상·물성 판정을 사용하면 구조 전용 생성과 성공 사례 중심 학습보다 적은 실험으로 재현 가능한 목표 재료를 얻는다.", "Jointly designing candidates and routes, recording every failure, and separating phase/property adjudication from development will produce reproducible target materials in fewer experiments than structure-only generation and success-heavy learning."),
      design: pair("세 화학계에서 18개 목표를 선정하고 목표마다 경로가 다른 세 전구체 조합을 둔다. 구조 전용, 보정 불확실성, 실패경로 기반 정책에 총 60회 합성 예산을 배분한다. 모든 시도는 완전 원장과 성공 중심 가상 출판 원장에 동시에 기록한다.", "Select 18 targets across three chemical families with three route-distinct precursor sets per target. Allocate a 60-synthesis budget among structure-only, calibrated-uncertainty, and failure-path policies. Record every attempt in both a complete ledger and a publication-mimicking success-heavy ledger."),
      adjudication: pair("후보·공정·기각 규칙을 잠근 뒤 개발팀이 보지 못한 시료 ID로 자동 XRD, 맹검 수동 Rietveld와 직교 분석을 수행한다. 실측 물성은 별도 연구자가 반복 측정한다.", "Freeze candidates, processes, and rejection rules, then use sample IDs hidden from developers for automated XRD, blinded manual Rietveld refinement, and orthogonal analysis. A separate researcher repeats the property measurement."),
      primaryMetrics: pair("독립 확인 목표 수/총 실험, 누적 단순 후회값, 화학계별 예측구간 커버리지, 반복 실패율, 자동–독립 판정 불일치율", "Independently confirmed targets per experiment, cumulative simple regret, family-wise interval coverage, repeated-failure rate, and automated–independent adjudication disagreement"),
      successRule: pair("실패경로 정책이 사전 고정 기준선보다 확인 목표/실험을 30% 이상 높이고, 각 화학계의 90% 예측구간 경험적 커버리지가 85% 아래로 떨어지지 않으며, 두 번째 기관에서 방향이 재현될 때 다음 규모로 간다.", "Scale only if the failure-path policy improves confirmed targets per experiment by at least 30% over the frozen baseline, empirical coverage of nominal 90% intervals stays at or above 85% in every family, and the direction reproduces at a second site."),
      stopRule: pair("독립 판정 불일치가 10%를 넘거나, OOD 커버리지가 85% 아래이거나, 완전 원장이 무작위 정책보다 반복 실패를 줄이지 못하면 규모 확대를 중단하고 계측·온톨로지·보정 모형을 먼저 수정한다.", "Stop scale-up if independent-adjudication disagreement exceeds 10%, OOD coverage falls below 85%, or the complete ledger fails to reduce repeated failures relative to random selection; repair measurement, ontology, or calibration first."),
      status: pair("제안·미실행", "Proposed, not yet executed")
    },
    log: [
      pair("원 논문과 2026년 공식 정정을 대조해 A-Lab의 현재 성공 수를 36/57, XRD 불확정을 4건으로 고정했다.", "Reconciled the primary article with its 2026 formal correction, fixing the current A-Lab result at 36/57 successes and four XRD-inconclusive cases."),
      pair("다섯 문제의 공통 병목을 단일 ‘후보–경로–관측–실패’ 상태공간으로 재정의했다.", "Reframed the five bottlenecks in one candidate–route–observation–failure state space."),
      pair("분포 이동 보장(UP-625)과 무작위가 아닌 결측 식별(UP-629)을 재료 발견에 이전할 수 있는 두 방법 연결로 등록했다.", "Registered two method transfers into materials discovery: distribution-shift guarantees from UP-625 and missing-not-at-random identification from UP-629."),
      pair("아직 실험을 수행하지 않았으므로 어느 경쟁 가설도 지지·기각된 것으로 표시하지 않았다.", "No competing hypothesis is marked supported or rejected because the prospective experiment has not been run.")
    ],
    nextCycle: pair("공개 A-Lab 보충자료에서 353개 조리법의 결과·중간상·판정 필드를 추출해 완전 원장 스키마 초안을 만들고, 18개 목표 파일럿의 화학계와 기준선을 확정한다.", "Extract outcome, intermediate-phase, and adjudication fields for the 353 A-Lab recipes from the public supplement, draft the complete-ledger schema, and freeze chemical families and baselines for the 18-target pilot.")
  };

  for (const problem of problems) {
    const record = records[problem.id];
    if (!record) continue;
    problem.cycleResearch = { cycleId: cycle.id, ...record, reviewedOn: REVIEWED_ON };
    problem.sourceIds = [...new Set([...(problem.sourceIds || []), ...record.sourceIds])];
    problem.researchConnections = connections.filter(connection => connection.problemIds.includes(problem.id)).map(connection => connection.id);
  }

  window.RESEARCH_CYCLES = [cycle];
  window.RESEARCH_CONNECTIONS = connections;
  window.RESEARCH_CYCLE_META = {
    reviewedOn: REVIEWED_ON,
    cycles: 1,
    curatedProblems: Object.keys(records).length,
    connections: connections.length,
    factSources: Object.keys(sources).filter(id => [
      "nature_mattergen_2025", "nature_gnome_2023", "nature_alab_2023", "nature_alab_correction_2026",
      "prx_autonomous_synthesis_2024", "npj_synthnn_2023", "rsc_matfold_2025",
      "neurips_covariate_shift_2019", "arxiv_active_learning_ood_2025"
    ].includes(id)).length
  };
})();
