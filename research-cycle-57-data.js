/* RC-2026-57: block geometry, endpoint cadence, and cohort lineage were adjudicated before target outcomes. */
(function () {
  "use strict";
  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-29";
  const pair = (text, textEn) => ({ text, textEn });
  const hypothesis = (code, claim, claimEn, prediction, predictionEn, test, testEn, reject, rejectEn) => ({ code, claim: pair(claim, claimEn), prediction: pair(prediction, predictionEn), test: pair(test, testEn), reject: pair(reject, rejectEn) });
  const artifact = (ko, en, description, descriptionEn, url, kind) => ({ title: pair(ko, en), description: pair(description, descriptionEn), url, kind });

  Object.assign(sources, {
    ro_crate_1_2_2025: {
      discipline: "computer",
      title: "RO-Crate Metadata Specification 1.2.0",
      url: "https://www.researchobject.org/ro-crate/specification/1.2/introduction.html",
      evidenceLabel: "연구 데이터와 맥락을 JSON-LD로 연결하는 Research Object Crate 공식 권고안; metadata가 payload 일부 또는 전부를 기술할 수 있음을 명시",
      evidenceLabelEn: "Official Research Object Crate recommendation for linking research data and context in JSON-LD; explicitly permits metadata to describe some or all payload files",
      publishedOn: "2025-06-04",
      resultPeriod: "2025-06-04 1.2.0 권고안 공개; RC57은 file inventory와 scientific-cohort membership의 차이를 판정하는 데 사용",
      resultPeriodEn: "Version 1.2.0 recommendation published 2025-06-04; RC57 uses it to distinguish file inventory from scientific-cohort membership",
      reviewedOn: REVIEWED_ON
    },
    condition_based_rpt_2024: {
      discipline: "materials",
      title: "Accelerated lithium-ion battery cycle lifetime testing by condition-based reference performance tests",
      url: "https://doi.org/10.1016/j.meaene.2024.100019",
      evidenceLabel: "고정 200-cycle 간격 대신 1% capacity-loss 단계로 RPT를 호출해 목표 횟수를 확보하고 초기 100일에 44% 더 많은 aging cycle을 수행한 Measurement: Energy 원 논문",
      evidenceLabelEn: "Measurement: Energy primary paper replacing fixed 200-cycle spacing with 1% capacity-loss-triggered RPTs, delivering a target count and 44% more aging cycles in the first 100 days",
      publishedOn: "2024-09-20",
      resultPeriod: "2024-09-20 온라인 공개, 2024-12 제4권; data는 요청 시 제공",
      resultPeriodEn: "Online 2024-09-20, volume issue 2024-12; data available on request",
      reviewedOn: REVIEWED_ON
    },
    battery_aging_assessment_2026: {
      discipline: "materials",
      title: "Battery aging assessment: from critical insights to enhanced diagnosis",
      url: "https://doi.org/10.1039/D5EE06439B",
      evidenceLabel: "고율 신호를 저율 등가량으로 변환하고 mechanism-informed residual을 결합해 미관측 aging condition의 진단과 초기 수명 예측을 시험한 2026 Energy & Environmental Science 원 논문",
      evidenceLabelEn: "2026 Energy & Environmental Science primary paper combining high-rate-to-low-rate transformation and mechanism-informed residual learning for diagnosis and early-life prediction under unseen aging conditions",
      publishedOn: "2026-02-11",
      resultPeriod: "2025-10-28 제출, 2026-01-29 채택, 2026-02-11 최초 공개",
      resultPeriodEn: "Submitted 2025-10-28, accepted 2026-01-29, first published 2026-02-11",
      reviewedOn: REVIEWED_ON
    }
  });

  const sourceIds = ["rwth_ur18650e_dataset_2021", "rwth_one_shot_2021", "rwth_changepoint_2026", "aurora_platform_2025", "aurora_dataset_2025", "ro_crate_1_2_2025", "condition_based_rpt_2024", "battery_aging_assessment_2026"];
  const hypotheses = [
    hypothesis("H57-0", "Aurora 공개 package가 논문 Figure 7의 LFP 36개를 outcome 없이 식별한다.", "The public Aurora package identifies all 36 Figure 7 LFP cells without outcomes.", "RO-Crate 또는 per-cell metadata에 고유 ID 36개를 묶는 study relation이 있어야 한다.", "The RO-Crate or per-cell metadata must contain a study relation binding 36 unique IDs.", "Remote ZIP directory·RO-Crate graph·RC56 metadata hash를 결합해 membership을 찾는다.", "Join the remote ZIP directory, RO-Crate graph, and RC56 metadata hashes to find membership.", "599개 graph entity는 199개 inventory를 완성하지만 chemistry·Figure 7 relation이 0개라 현재 공개본에서는 기각한다.", "The 599 graph entities complete a 199-cell inventory but contain zero chemistry or Figure 7 relations, rejecting the claim for the current public version."),
    hypothesis("H57-1", "기존 네-cell block에서도 endpoint를 촘촘히 재면 100 pair를 만들 수 있다.", "Denser endpoints can create 100 pairs inside the existing four-cell blocks.", "어떤 grid에서는 twelve blocks의 non-tied pair가 100 이상이어야 한다.", "At least one grid must produce 100 non-tied pairs across twelve blocks.", "Schedule simulation 전에 block 조합 상한을 계산한다.", "Calculate the block-combinatorial ceiling before schedule simulation.", "12×C(4,2)=72가 절대 상한이므로 cadence-only 설명을 기각한다.", "The absolute ceiling 12×C(4,2)=72 rejects cadence-only repair."),
    hypothesis("H57-2", "큰 same-condition block은 좁은 수명분산과 불리한 grid 위상에서도 100 pair를 보존한다.", "A larger same-condition block preserves 100 pairs under narrow lifetime spread and unfavorable grid phase.", "Quarter-spread에서 worst-phase P(pair≥100)≥0.95와 5% quantile≥100이어야 한다.", "At quarter spread, worst-phase P(pair≥100) must be at least 0.95 and the 5% quantile at least 100.", "48개 crossing proxy의 exact multinomial distribution을 event count·간격·모든 integer phase에 계산한다.", "Compute the exact multinomial distribution of 48 crossing proxies across event counts, intervals, and every integer phase.", "24 event는 25-cycle, 36 event는 50-cycle에서 처음 보수 gate를 통과했다.", "Twenty-four events first pass at 25 cycles and thirty-six events at 50 cycles."),
    hypothesis("H57-3", "Capacity-loss-triggered RPT가 degradation을 바꾸지 않고 고정 25-cycle burden을 줄인다.", "Capacity-loss-triggered RPTs reduce fixed 25-cycle burden without changing degradation.", "별도 randomized pilot에서 trigger 민감도와 수명·열·throughput 동등성을 함께 통과해야 한다.", "A separate randomized pilot must pass trigger sensitivity and life, thermal, and throughput equivalence.", "확인용 cohort와 분리된 fixed-versus-triggered schedule pilot을 사전등록한다.", "Preregister a fixed-versus-triggered schedule pilot separate from the confirmation cohort.", "관련 원 논문은 feasibility와 속도 이득을 보였지만 이 좌표의 intervention equivalence는 아직 시험하지 않았다.", "The related primary paper shows feasibility and speed benefit but has not tested intervention equivalence for this coordinate.")
  ];

  const causalChain = [
    { code: "M", title: pair("Manifest", "Manifest"), claim: pair("논문의 scientific cohort를 specimen·protocol·metadata·BDF에 outcome 전에 연결한다.", "Link the paper's scientific cohort to specimens, protocols, metadata, and BDF before outcomes."), failure: pair("파일이 모두 있어도 study membership이 없으면 target을 고정할 수 없다.", "Even a complete file inventory cannot freeze a target without study membership.") },
    { code: "B", title: pair("Block geometry", "Block geometry"), claim: pair("교환 가능한 same-condition block 안에서만 pair를 센다.", "Count pairs only inside exchangeable same-condition blocks."), failure: pair("네 cell은 아무리 잘 측정해도 여섯 pair뿐이다.", "Four cells yield only six pairs regardless of measurement quality.") },
    { code: "G", title: pair("Grid", "Grid"), claim: pair("수명분산을 줄이고 grid 위상을 모두 이동해 endpoint tie의 최악값을 계산한다.", "Compress lifetime spread and shift every grid phase to calculate worst-case endpoint ties."), failure: pair("개발자료 median에 우연히 맞은 grid는 새 chemistry에서 붕괴할 수 있다.", "A grid accidentally aligned to the development median can collapse in a new chemistry.") },
    { code: "I", title: pair("Intervention", "Intervention"), claim: pair("Dense RPT가 관측 대상의 열화 자체를 바꾸지 않았음을 별도 pilot로 보인다.", "Use a separate pilot to show that dense RPTs did not change the degradation being observed."), failure: pair("측정이 수명을 바꾸면 더 정확한 endpoint도 원래 과정의 판정이 아니다.", "If measurement changes lifetime, a sharper endpoint no longer adjudicates the original process.") },
    { code: "T", title: pair("Target test", "Target test"), claim: pair("네 관문 뒤에만 봉인한 R3 좌표의 independent rank를 연다.", "Open the independent rank test of the sealed R3 coordinate only after all four gates."), failure: pair("Aurora는 manifest가 없어 이번에도 outcome을 열지 않는다.", "Aurora still lacks a manifest, so its outcomes remain closed.") }
  ];

  const workPackages = [
    { code: "W1", title: pair("Target metadata screen", "Target metadata screen"), objective: pair("Outcome을 보지 않고 36개 이상 same-condition cohort와 one-to-one manifest를 찾는다.", "Find a same-condition cohort of at least 36 cells with a one-to-one manifest without viewing outcomes."), method: pair("Repository metadata·protocol·checksum·cohort table만 허용하고 chemistry·batch·file mapping을 검사한다.", "Permit only repository metadata, protocols, checksums, and cohort tables and inspect chemistry, batch, and file mappings."), deliverable: pair("Source별 pass·exclude 표와 봉인한 cell ID", "Per-source pass/exclude table and sealed cell IDs"), gate: pair("ID 추정 없이 36개 모두가 한 metadata와 한 result file set에 대응한다.", "All 36 map to one metadata and one result file set without inferred IDs.") },
    { code: "W2", title: pair("두 measurement register", "Two measurement registers"), objective: pair("후보 생성과 endpoint 해상도를 데이터 구조부터 분리한다.", "Separate candidate construction from endpoint resolution at the data-structure level."), method: pair("Feature는 BOL·160·320·480만 사용하고 이후 25-cycle check는 endpoint register에만 기록한다.", "Use only BOL, 160, 320, and 480 for the feature and record later 25-cycle checks only in the endpoint register."), deliverable: pair("변경 불가능한 bilingual protocol과 schema", "Immutable bilingual protocol and schema"), gate: pair("Endpoint row를 삭제해도 R3 coordinate bitstream이 변하지 않는다.", "Deleting endpoint rows leaves the R3 coordinate bitstream unchanged.") },
    { code: "W3", title: pair("측정 개입 동등성", "Measurement-intervention equivalence"), objective: pair("25-cycle RPT가 열화속도와 mechanism을 바꾸지 않는지 확인한다.", "Determine whether 25-cycle RPTs change degradation rate or mechanism."), method: pair("별도 cell을 conventional·dense schedule에 무작위 배정하고 life·temperature·throughput·impedance margin을 고정한다.", "Randomize separate cells to conventional and dense schedules with fixed life, temperature, throughput, and impedance margins."), deliverable: pair("동등성 interval과 trigger sensitivity", "Equivalence intervals and trigger sensitivity"), gate: pair("모든 margin 통과 전에는 confirmatory schedule을 승인하지 않는다.", "Do not authorize the confirmatory schedule until every margin passes.") },
    { code: "W4", title: pair("Independent ordinal adjudication", "Independent ordinal adjudication"), objective: pair("새 cohort에서 R3 level이 remaining-life order를 운반하는지 판정한다.", "Adjudicate whether R3 level transports remaining-life order in a new cohort."), method: pair("Manifest와 schedule을 봉인한 뒤 두 구현이 coverage·event·pair·C·bootstrap bound를 독립 계산한다.", "After sealing manifest and schedule, two implementations independently compute coverage, events, pairs, C, and bootstrap bound."), deliverable: pair("수정 불가능한 pass·reject record", "Immutable pass-or-reject record"), gate: pair("Coverage≥90%, event≥24, pair≥100, C≥0.65, lower bound>0.50가 모두 필요하다.", "Require coverage at least 90%, events at least 24, pairs at least 100, C at least 0.65, and lower bound above 0.50.") }
  ];

  const uncertaintyBudget = [
    { code: "U1", category: pair("Lineage", "Lineage"), source: pair("199-file inventory만으로 36-cell study cohort를 식별할 수 없다.", "A 199-file inventory alone cannot identify the 36-cell study cohort."), control: pair("공식 cohort relation 전에는 source 제외", "Exclude the source until an official cohort relation exists"), threshold: pair("한 cell의 specimen–protocol–file edge라도 없으면 outcome을 열지 않는다.", "Keep outcomes closed if any cell lacks a specimen–protocol–file edge.") },
    { code: "U2", category: pair("Sampling", "Sampling"), source: pair("Event attrition과 좁은 수명분산이 endpoint tie를 늘린다.", "Event attrition and narrow lifetime spread increase endpoint ties."), control: pair("24-event·quarter-spread·worst-phase exact gate", "Exact 24-event, quarter-spread, worst-phase gate"), threshold: pair("P(pair≥100)<0.95 또는 5% quantile<100이면 설계를 기각한다.", "Reject the design if P(pair≥100) is below 0.95 or the 5% quantile is below 100.") },
    { code: "U3", category: pair("Measurement", "Measurement"), source: pair("Dense RPT가 rest·heat·throughput을 바꿔 열화 자체를 교란할 수 있다.", "Dense RPTs can alter rest, heat, and throughput and thereby perturb degradation."), control: pair("분리된 randomized equivalence pilot", "Separate randomized equivalence pilot"), threshold: pair("수명·온도·throughput·impedance margin 중 하나라도 실패하면 confirmatory schedule을 승인하지 않는다.", "Do not authorize the confirmatory schedule if any life, temperature, throughput, or impedance margin fails.") },
    { code: "U4", category: pair("Model", "Model"), source: pair("Linear crossing proxy는 숨은 true EOL이 아니라 관측된 두 round 사이의 설계용 보간값이다.", "The linear crossing proxy is a design interpolation between two observed rounds, not hidden true EOL."), control: pair("Schedule 비교에만 사용하고 target label로 금지", "Use only for schedule comparison and prohibit as a target label"), threshold: pair("Proxy가 feature 선택이나 최종 rank 판정에 들어가면 분석을 무효화한다.", "Invalidate the analysis if the proxy enters feature selection or final rank adjudication.") },
    { code: "U5", category: pair("External validity", "External validity"), source: pair("NMC cylinder의 수명분산이 LFP coin cell로 이동하지 않을 수 있다.", "NMC-cylinder lifetime dispersion may not transport to LFP coin cells."), control: pair("분산을 1/4로 압축하고 design evidence로만 제한", "Compress spread to one quarter and retain only a design claim"), threshold: pair("Manifest-qualified 새 chemistry 결과 전에는 절대 수명이나 성능 이동을 주장하지 않는다.", "Make no absolute-life or performance-transport claim before results from a manifest-qualified new chemistry.") },
    { code: "U6", category: pair("Computation", "Computation"), source: pair("Multinomial probability 합산에는 floating-point 오차가 남는다.", "Floating-point error remains in multinomial probability summation."), control: pair("Python·Node 56행 독립 합의와 모든 discrete gate 일치", "Independent Python–Node agreement across 56 rows and every discrete gate"), threshold: pair("확률 차이가 10⁻¹²를 넘거나 선택된 cadence가 다르면 판정을 중단한다.", "Stop adjudication if probability differences exceed 10⁻¹² or selected cadences differ.") }
  ];

  const decisionTree = [
    { condition: pair("36-cell manifest가 없다", "No 36-cell manifest exists"), action: pair("그 source를 제외하고 outcome을 열지 않는다.", "Exclude the source and keep outcomes closed."), meaning: pair("파일 수가 충분해도 확인 cohort는 고정되지 않았다.", "Adequate file count still does not fix a confirmatory cohort.") },
    { condition: pair("36 event를 보장한다", "Thirty-six events are guaranteed"), action: pair("50-cycle endpoint register를 pair-powered branch로 허용한다.", "Allow a 50-cycle endpoint register as the pair-powered branch."), meaning: pair("완전한 event yield가 더 낮은 측정 부담과 100-pair gate를 양립시킨다.", "Complete event yield reconciles lower measurement burden with the 100-pair gate.") },
    { condition: pair("24 event까지만 보장한다", "Only twenty-four events are guaranteed"), action: pair("25-cycle register를 사용하거나 target을 기각한다.", "Use a 25-cycle register or reject the target design."), meaning: pair("Event attrition을 허용하려면 더 촘촘한 endpoint grid가 필요하다.", "Allowing event attrition requires a denser endpoint grid.") },
    { condition: pair("Dense schedule 동등성이 실패한다", "Dense-schedule equivalence fails"), action: pair("Capacity-only confirmatory branch를 중단하고 frozen trigger 또는 orthogonal sensor를 시험한다.", "Stop capacity-only confirmation and test a frozen trigger or orthogonal sensor."), meaning: pair("측정이 수명을 바꾸므로 capacity endpoint가 원래 열화과정을 판정하지 못한다.", "Measurement changes life, so the capacity endpoint cannot adjudicate the original degradation process.") },
    { condition: pair("모든 사전 gate가 통과한다", "Every prospective gate passes"), action: pair("그때만 target outcome을 열고 independent rank를 계산한다.", "Only then open target outcomes and calculate independent rank."), meaning: pair("계보·정보량·개입 독립성이 확보되어 R3 이동 가설을 반증 가능하게 시험할 수 있다.", "Lineage, information, and intervention independence now make the R3 transport hypothesis falsifiable.") }
  ];

  const records = {
    "UP-219": {
      role: pair("수명 예측 score가 아니라 그 score를 판정할 정보량과 측정 개입을 먼저 고정한다.", "Fixes adjudication information and measurement intervention before judging a lifetime score."), focusedPage: true,
      centralQuestion: pair("Cycle 480의 normalized capacity가 남은 수명의 순서를 담는다면, 새 배치에서 그 순서를 충분한 non-tied endpoint로 검증할 수 있는가?", "If normalized capacity at cycle 480 contains remaining-life order, can a new batch test that order with enough non-tied endpoints?"),
      resolutionCriterion: pair("Exact manifest·schedule equivalence 뒤에 24 event와 100 pair 이상을 확보하고 C≥0.65와 lower 95% bound>0.50를 독립 재현해야 한다.", "After exact manifest and schedule equivalence, secure at least 24 events and 100 pairs and independently reproduce C at least 0.65 with a lower 95% bound above 0.50."),
      technicalAxes: [pair("R3 feature register와 endpoint register 분리", "Separation of R3 feature and endpoint registers"), pair("Block 안 pair의 조합 상한", "Combinatorial ceiling of within-block pairs"), pair("수명분산·grid phase에 강건한 inspection 설계", "Inspection design robust to lifetime spread and grid phase")],
      updatedDefinition: pair("비침습 수명 예측은 현재 신호와 먼 미래의 실패시간을 연결해야 한다. 그러나 실패시간을 넓은 간격으로만 확인하거나 비교 가능한 cell이 네 개뿐이면, 좋은 score가 있어도 맞고 틀림을 가를 pair 자체가 부족하다. RC57은 예측모형보다 먼저 이 판정 정보량을 설계한다.", "Non-invasive lifetime prediction must connect a present signal to a distant failure time. Yet wide inspections or only four comparable cells can leave too few pairs to judge even a good score. RC57 therefore designs adjudication information before another predictor."),
      knownBoundary: pair("R3 capacity level은 열린 RWTH 자료에서 C=0.723 후보였지만 확인 결과가 아니다. 기존 12개 four-cell block은 최대 72 pair라 100-pair 목표를 구조적으로 충족하지 못한다.", "R3 capacity level was a C=0.723 candidate on opened RWTH data, not confirmation. The existing twelve four-cell blocks can supply at most 72 pairs and structurally cannot meet a 100-pair target."),
      bottleneck: pair("Cell 수가 아니라 같은 조건에서 함께 비교할 수 있는 block 크기, EOL을 구별하는 grid, 그리고 그 grid가 열화를 바꾸지 않는다는 근거가 동시에 필요하다.", "The need is not merely more cells but a larger comparable same-condition block, a grid that distinguishes EOL, and evidence that the grid does not alter degradation."),
      minimumAdvance: pair("36-cell block과 25-cycle post-R3 endpoint register를 사전 봉인하고, 24 event만 남아도 100 pair를 보존함을 독립 계산한 것은 실제 target test를 설계할 수 있는 진전이다.", "Presealing a 36-cell block and 25-cycle post-R3 endpoint register, with independent proof that 100 pairs survive even at 24 events, is a concrete advance toward a target test."),
      decisiveTest: pair("Manifest-qualified 새 cohort에서 feature는 cycle 480에 닫고 이후 capacity check는 endpoint에만 사용한다. Schedule equivalence가 통과한 뒤에만 rank를 판정한다.", "In a manifest-qualified new cohort, close the feature at cycle 480 and use later capacity checks only for endpoints. Adjudicate rank only after schedule equivalence passes."),
      workPackages, uncertaintyBudget, decisionTree,
      unresolved: pair("25-cycle RPT가 열화를 바꾸는지, 24 event를 실제로 확보할지, R3 level이 새 chemistry에서 같은 방향을 유지할지는 열려 있다.", "Whether 25-cycle RPTs alter degradation, whether 24 events remain usable, and whether R3 level keeps its direction in a new chemistry remain open."), hypotheses, sourceIds
    },
    "UP-233": {
      role: pair("Digital twin의 상태좌표가 specimen history와 검증 endpoint에 끊김 없이 연결되는지 시험한다.", "Tests whether a digital-twin state coordinate remains continuously linked to specimen history and validation endpoints."), focusedPage: true,
      centralQuestion: pair("Digital state가 실제 cell의 열화를 나타낸다는 주장을 file inventory가 아니라 specimen-level provenance와 독립적인 미래 상태로 검증할 수 있는가?", "Can a claim that digital state represents physical degradation be tested through specimen-level provenance and independent future state rather than a file inventory?"),
      resolutionCriterion: pair("Physical cell→assembly→stress→R3 state→endpoint의 one-to-one chain이 완성되고, state ordering이 별도 register의 endpoint에서 재현돼야 한다.", "The one-to-one chain from physical cell through assembly, stress, R3 state, and endpoint must close, and state ordering must reproduce against endpoints from a separate register."),
      technicalAxes: [pair("Research object와 scientific cohort의 의미 차이", "Semantic difference between a research object and a scientific cohort"), pair("Twin synchronization 시점의 고정", "Fixed twin-synchronization time"), pair("관측 개입을 포함한 state-transition 검증", "State-transition validation including observation intervention")],
      updatedDefinition: pair("Digital twin은 파일과 센서를 한곳에 모았다고 완성되지 않는다. 어떤 물리 specimen의 어떤 공정·stress가 어느 상태좌표를 만들었고, 그 좌표가 이후의 독립 관측을 얼마나 좁혔는지가 추적돼야 한다. Aurora RO-Crate는 199개 file tree를 정확히 열거하지만 Figure 7 cohort membership을 표현하지 않아 이 chain을 닫지 못했다.", "A digital twin is not complete merely because files and sensors share a repository. It must trace which process and stress produced a physical specimen's state and how that state narrows later independent observations. Aurora's RO-Crate accurately enumerates a 199-cell file tree but does not express Figure 7 cohort membership, leaving that chain open."),
      knownBoundary: pair("RO-Crate는 payload 일부만 기술해도 되므로 metadata JSON이 graph에 없다는 사실은 표준 위반이 아니다. 문제는 twin validation에 필요한 cohort relation이 없다는 용도 적합성이다.", "RO-Crate may describe only part of a payload, so absent metadata-JSON graph entities are not a standards violation. The issue is fitness for twin validation because the required cohort relation is absent."),
      bottleneck: pair("Inventory identity와 scientific identity를 혼동하면 잘못된 cell history를 정확하게 계산한다. State accuracy보다 cohort semantics가 앞선다.", "Confusing inventory identity with scientific identity can compute the wrong cell history precisely. Cohort semantics precede state accuracy."),
      minimumAdvance: pair("Specimen·protocol·file뿐 아니라 paper figure 또는 declared cohort relation을 manifest의 필수 edge로 승격하면 twin의 검증 대상을 outcome 전에 고정할 수 있다.", "Making the paper figure or declared cohort relation a required manifest edge fixes the twin's validation target before outcomes."),
      decisiveTest: pair("Target manifest에서 무작위 cell ID를 뽑아 physical record부터 R3 bitstream과 endpoint row까지 양방향으로 재구성하고, 누락·중복·다중 mapping이 하나라도 있으면 중단한다.", "Sample target IDs from the manifest and reconstruct both directions from physical record to R3 bitstream and endpoint row; stop on any missing, duplicate, or multiple mapping."),
      workPackages, uncertaintyBudget, decisionTree,
      unresolved: pair("Aurora의 네 cell 차이가 미공개 제외 기준인지, metadata 누락인지, 다른 ID scheme인지 확인되지 않았다.", "It remains unknown whether Aurora's four-cell difference reflects an unpublished exclusion, missing metadata, or another ID scheme."), hypotheses, sourceIds
    },
    "UP-234": {
      role: pair("가속수명에서 inspection schedule과 frailty 정보량을 같은 설계식 안에 넣는다.", "Places inspection schedule and frailty information in the same accelerated-life design."), focusedPage: true,
      centralQuestion: pair("같은 stress의 개체차를 추정할 때 필요한 것은 더 많은 검사인가, 더 큰 replicate block인가, 아니면 둘의 특정 조합인가?", "When estimating within-stress variation, is the need more inspections, a larger replicate block, or a particular combination?"),
      resolutionCriterion: pair("Stress condition을 넘는 pair를 쓰지 않고도 보수적 event yield와 좁은 수명분산에서 100개 이상 order comparison을 사전 보장해야 한다.", "Prospectively guarantee at least 100 order comparisons under conservative event yield and narrow lifetime spread without using cross-stress pairs."),
      technicalAxes: [pair("C(n,2) block ceiling과 interval censoring", "C(n,2) block ceiling and interval censoring"), pair("Lifetime dispersion과 inspection phase의 상호작용", "Interaction of lifetime dispersion and inspection phase"), pair("RPT burden을 가속인자와 분리", "Separating RPT burden from acceleration factors")],
      updatedDefinition: pair("가속수명시험은 stress를 세게 걸어 빨리 실패시키는 것만의 문제가 아니다. 같은 stress 안에서 누가 먼저 실패했는지를 구별할 replicate와 검사 시점이 있어야 condition effect와 cell frailty를 나눌 수 있다. 네 개씩 시작한 기존 block은 그 목적에 필요한 100 pair를 원천적으로 만들 수 없다.", "Accelerated-life testing is not only about inducing failures faster. Separating condition effect from cell frailty requires enough replicates and inspection times to distinguish failure order within the same stress. Existing blocks started four at a time can never create the required 100 pairs."),
      knownBoundary: pair("RWTH crossing proxy의 median은 약 1122 cycle이지만 특정 grid가 이 median 근처를 우연히 가르면 성능이 과대평가된다. RC57은 모든 integer phase와 1/4 분산까지 계산했다.", "The RWTH crossing-proxy median is about 1,122 cycles, but a grid that happens to split near that median can look overly favorable. RC57 evaluates every integer phase and spread down to one quarter."),
      bottleneck: pair("Inspection interval은 단독 설계변수가 아니다. Replicate block, event attrition, 수명분산, grid anchor와 결합해야 pair information을 보장한다.", "Inspection interval is not a standalone design variable. It must be combined with replicate block, event attrition, lifetime spread, and grid anchor to guarantee pair information."),
      minimumAdvance: pair("24 event branch와 36 event branch를 분리해 각각 25·50 cycle을 선택하면 attrition이 생긴 뒤 임계값을 바꾸는 사후 결정을 막을 수 있다.", "Separating 24-event and 36-event branches at 25 and 50 cycles prevents post hoc threshold changes after attrition appears."),
      decisiveTest: pair("실험 시작 전에 block membership·event 최소수·interval branch를 봉인하고, 실제 종료 뒤에는 observed pair count만으로 gate를 연다.", "Seal block membership, minimum event count, and interval branch before the experiment; after completion, open the gate using only the observed pair count."),
      workPackages, uncertaintyBudget, decisionTree,
      unresolved: pair("좁은 automated batch의 실제 수명분산과 dense RPT의 가속·완화 효과는 별도 pilot 없이는 정량화할 수 없다.", "The actual lifetime spread of a uniform automated batch and the accelerating or mitigating effect of dense RPTs cannot be quantified without a separate pilot."), hypotheses, sourceIds
    },
    "UP-572": {
      role: pair("자율실험실이 information gain을 계산할 때 파일 수가 아니라 판정 가능한 pair와 provenance를 보상하도록 만든다.", "Makes an autonomous laboratory reward adjudicable pairs and provenance rather than file count when calculating information gain."), focusedPage: true,
      centralQuestion: pair("로봇이 다음 실험을 고를 때 더 많은 data point가 아니라 경쟁 가설을 실제로 가르는 block·schedule·lineage를 선택할 수 있는가?", "When selecting the next experiment, can a robot choose block, schedule, and lineage that truly separate hypotheses rather than merely producing more data points?"),
      resolutionCriterion: pair("Experiment planner가 예상 pair distribution·측정 개입·manifest completeness를 목적함수와 hard gate로 사용하고, 음성·제외 결과까지 재현 가능하게 남겨야 한다.", "The experiment planner must use expected pair distribution, measurement intervention, and manifest completeness as objective terms and hard gates while preserving negative and excluded results reproducibly."),
      technicalAxes: [pair("Expected information gain과 block combinatorics", "Expected information gain and block combinatorics"), pair("Observation action이 system dynamics에 주는 영향", "Effect of observation actions on system dynamics"), pair("Request–specimen–protocol–file–decision provenance", "Request–specimen–protocol–file–decision provenance")],
      updatedDefinition: pair("자율실험실의 성공은 로봇이 빠르게 많은 실험을 수행하는 데 있지 않다. 다음 실험이 가설을 얼마나 가를지, 측정 자체가 결과를 바꾸는지, 그리고 실패한 run까지 어떤 specimen에서 나왔는지를 함께 판단해야 한다. 이번 Aurora 감사에서는 완전한 199-cell inventory도 논문의 36-cell cohort를 선택하기에는 부족했다.", "An autonomous laboratory succeeds not by running many experiments quickly but by judging how the next experiment separates hypotheses, whether measurement changes the result, and which specimen produced even a failed run. In this Aurora audit, a complete 199-cell inventory was still insufficient to select the paper's 36-cell cohort."),
      knownBoundary: pair("Condition-based RPT는 capacity loss에 따라 검사 횟수를 제어하고 test throughput을 높일 수 있음을 보였다. 그러나 planner가 trigger와 최종 label을 같은 신호로 최적화하면 selection bias와 measurement feedback이 생긴다.", "Condition-based RPTs show that capacity loss can control inspection count and increase test throughput. Yet optimizing triggers and final labels from the same signal can create selection bias and measurement feedback."),
      bottleneck: pair("현재 active-learning 목적함수는 예상 정확도나 개선량을 보상하기 쉽지만, cohort identity·pair ceiling·intervention cost가 0인 실험을 강하게 배제하지 않는다.", "Active-learning objectives readily reward expected accuracy or improvement but may not strongly reject experiments with missing cohort identity, an inadequate pair ceiling, or unpriced intervention cost."),
      minimumAdvance: pair("Planner가 결과를 보기 전에 manifest gate와 C(n,2) ceiling을 계산해 Aurora target과 four-cell design을 자동 제외하면 음성 결과가 다음 설계의 구조적 제약으로 재사용된다.", "If a planner computes manifest gates and the C(n,2) ceiling before results and automatically excludes the Aurora target and four-cell design, negative results become reusable structural constraints."),
      decisiveTest: pair("동일한 candidate experiment pool에서 기존 expected-improvement planner와 lineage·pair·intervention-aware planner를 비교하고, 후자가 더 적은 run으로 사전 정의된 가설 분기를 여는지 blind simulation한다.", "Compare a conventional expected-improvement planner with a lineage-, pair-, and intervention-aware planner on the same candidate experiment pool and blindly simulate whether the latter opens predefined hypothesis branches with fewer runs."),
      workPackages, uncertaintyBudget, decisionTree,
      unresolved: pair("Pair 정보와 intervention cost를 하나의 utility로 환산하는 방법, trigger policy가 exploration을 과도하게 줄이는 조건, 실제 robot queue에서 provenance gate를 강제하는 구현이 남아 있다.", "Open questions include converting pair information and intervention cost into one utility, conditions under which trigger policies suppress exploration, and enforcing provenance gates in a real robot queue."), hypotheses, sourceIds
    }
  };

  const connection = {
    id: "CONN-EVIDENCE-030", type: pair("Block 조합정보–측정 개입–scientific lineage", "Block combinatorics–measurement intervention–scientific lineage"), strength: "strong", problemIds: Object.keys(records),
    sharedBottleneck: pair("관측이 많아도 같은 조건의 구별 가능한 pair가 부족하거나, 관측이 system을 바꾸거나, specimen membership이 끊기면 latent individual state를 검증할 수 없다.", "Latent individual state cannot be validated when comparable within-condition pairs are insufficient, observation changes the system, or specimen membership is broken, regardless of data volume."),
    mapping: pair("Battery score·twin state·frailty random effect·autonomous-lab candidate는 모두 block 안 outcome order에 대응하고, manifest edge는 각 prediction을 실제 specimen에 귀속한다.", "Battery score, twin state, frailty random effect, and autonomous-lab candidate all map to within-block outcome order, while manifest edges attribute each prediction to a physical specimen."),
    transferableMethod: pair("C(n,2) ceiling을 먼저 계산하고 exact worst-phase pair distribution과 intervention-equivalence pilot을 통과한 manifest-qualified experiment만 queue에 넣는다.", "Calculate the C(n,2) ceiling first and queue only manifest-qualified experiments that pass exact worst-phase pair distributions and an intervention-equivalence pilot."),
    minimumTest: pair("36-cell block에서 24-event 보수 branch는 25-cycle, 36-event branch는 50-cycle을 봉인하고 100 pair 이상을 확인한다.", "In a 36-cell block, seal 25 cycles for the conservative 24-event branch or 50 cycles for the 36-event branch and verify at least 100 pairs."),
    failureBoundary: pair("Cross-condition pair pooling, favorable phase 선택, inferred cohort ID, outcome-dependent cadence 변경, dense RPT 비동등성 중 하나라도 있으면 연결을 확인 근거로 쓰지 않는다.", "Do not use the connection as confirmation after cross-condition pooling, favorable-phase selection, inferred cohort IDs, outcome-dependent cadence changes, or dense-RPT non-equivalence."),
    evidence: pair("Four-cell block maximum 72; exact quarter-spread worst-phase gate는 24 event에서 25-cycle P=0.999357·q05=150, 36 event에서 50-cycle P=0.993685·q05=159; Aurora lineage는 36 대 32에서 실패했다.", "Four-cell blocks max out at 72; exact quarter-spread worst-phase gates give 25-cycle P=0.999357 and q05=150 at 24 events, and 50-cycle P=0.993685 and q05=159 at 36 events; Aurora lineage fails at 36 versus 32."),
    validationStatus: pair("Block ceiling·exact design arithmetic·public provenance gap은 확인됐다. Measurement equivalence와 R3 transport는 미검증이다.", "The block ceiling, exact design arithmetic, and public provenance gap are verified. Measurement equivalence and R3 transport remain untested."), reviewedOn: REVIEWED_ON, sourceIds
  };
  connections.push(connection);

  const cycle = {
    id: "RC-2026-57", status: "active", startedOn: REVIEWED_ON, reviewedOn: REVIEWED_ON,
    title: "더 촘촘한 측정보다 먼저 비교 가능한 block을 설계한다", titleEn: "Design a comparable block before measuring more densely",
    selectionReason: "RC56이 남긴 정확한 두 gate—Aurora 36-cell lineage와 pair≥100 endpoint 설계—를 target outcome 없이 판정했다. Aurora가 자율 battery platform이므로 experiment scheduling·negative stop·provenance를 UP-572와 직접 연결했다.",
    selectionReasonEn: "RC57 adjudicated the two exact gates left by RC56—Aurora 36-cell lineage and a pair-at-least-100 endpoint design—without target outcomes. Because Aurora is an autonomous battery platform, experiment scheduling, negative stops, and provenance were directly connected to UP-572.",
    summary: pair("Aurora RO-Crate는 599 graph entity로 199개 cell inventory를 완성했지만 chemistry·Figure 7 cohort relation이 없어 논문의 36개와 explicit LFP metadata 32개를 연결하지 못했다. 기존 RWTH four-cell block은 pair 상한 72로 cadence만으로 100에 도달할 수 없다. Exact worst-phase 계산은 quarter-width lifetime spread에서 24 event면 25-cycle, 36 event면 50-cycle endpoint register가 필요함을 보였다. 두 구현이 56개 design row에 합의했으며 Aurora outcome은 계속 닫았다.", "Aurora's RO-Crate completes a 199-cell inventory with 599 graph entities but lacks chemistry and Figure 7 cohort relations, leaving 36 paper cells unmatched to 32 explicit-LFP metadata records. Existing RWTH four-cell blocks have a 72-pair ceiling and cannot reach 100 through cadence alone. Exact worst-phase calculation shows that quarter-width lifetime spread requires a 25-cycle endpoint register at 24 events or 50 cycles at 36 events. Two implementations agree on all 56 design rows, and Aurora outcomes remain closed."),
    problemIds: Object.keys(records), connectionIds: [connection.id],
    verifiedFindings: [
      { text: "Aurora RO-Crate graph는 599 entity와 199 cell dataset·398 BDF file entity를 포함한다.", textEn: "The Aurora RO-Crate graph contains 599 entities, 199 cell datasets, and 398 BDF file entities.", sourceIds: ["aurora_dataset_2025"] },
      { text: "RO-Crate에는 chemistry·Figure 7·36-cell cohort relation이 없어 논문 cohort를 선택할 수 없다.", textEn: "The RO-Crate has no chemistry, Figure 7, or 36-cell cohort relation and cannot select the paper cohort.", sourceIds: ["aurora_platform_2025", "aurora_dataset_2025"] },
      { text: "RO-Crate가 payload 일부만 기술하는 것은 허용되므로 이번 판정은 표준 위반이 아니라 cohort 선택 용도 부적합이다.", textEn: "Because RO-Crate may describe only part of a payload, this is a cohort-selection fitness failure rather than a standards violation.", sourceIds: ["ro_crate_1_2_2025"] },
      { text: "Twelve four-cell block의 within-block pair 절대 상한은 72다.", textEn: "The absolute within-block pair ceiling for twelve four-cell blocks is 72.", sourceIds: ["rwth_ur18650e_dataset_2021"] },
      { text: "24-event 보수 branch는 25-cycle에서 worst-phase P(pair≥100)=0.999357, lower 5% pair=150을 얻었다.", textEn: "The conservative 24-event branch at 25 cycles yields worst-phase P(pair≥100)=0.999357 and a lower 5% pair count of 150.", sourceIds: ["rwth_ur18650e_dataset_2021"] },
      { text: "36-event branch는 50-cycle에서 worst-phase P(pair≥100)=0.993685, lower 5% pair=159를 얻었다.", textEn: "The 36-event branch at 50 cycles yields worst-phase P(pair≥100)=0.993685 and a lower 5% pair count of 159.", sourceIds: ["rwth_ur18650e_dataset_2021"] },
      { text: "Python과 Node는 56개 exact design row와 모든 discrete gate에 합의했고 최대 probability 차이는 3.33e-16이었다.", textEn: "Python and Node agree on 56 exact design rows and every discrete gate, with a maximum probability difference of 3.33e-16.", sourceIds: ["rwth_ur18650e_dataset_2021"] },
      { text: "Capacity-loss-triggered RPT는 test burden을 줄일 수 있지만 이 설계의 degradation equivalence는 아직 입증하지 않았다.", textEn: "Capacity-loss-triggered RPTs can reduce test burden, but degradation equivalence for this design remains unproven.", sourceIds: ["condition_based_rpt_2024"] },
      { text: "Aurora BDF cycling entry·capacity·EOL은 이번 cycle에도 0개를 열었다.", textEn: "RC57 again opened zero Aurora BDF cycling entries, capacities, or EOL values.", sourceIds: ["aurora_dataset_2025"] }
    ],
    resultMatrix: {
      title: pair("Source·block·schedule 개방 판정", "Source, block, and schedule opening decision"), note: pair("확률은 Monte Carlo가 아니라 empirical multinomial 분포를 모든 integer phase에 정확히 합산한 값이다.", "Probabilities are exact empirical-multinomial sums across every integer phase, not Monte Carlo estimates."),
      columns: [pair("관문", "Gate"), pair("판정량", "Adjudicand"), pair("결과", "Result"), pair("판정", "Verdict")],
      rows: [
        { label: pair("RO", "RO"), values: [pair("RO-Crate inventory", "RO-Crate inventory"), "599 graph · 199 cells · 398 BDF", "pass"] },
        { label: pair("L", "L"), values: [pair("Figure 7 lineage", "Figure 7 lineage"), "paper 36 · explicit LFP 32", pair("실패", "failed")] },
        { label: pair("B4", "B4"), values: [pair("12 × four-cell blocks", "12 × four-cell blocks"), "max 72 pairs", pair("불가능", "impossible")] },
        { label: pair("E24", "E24"), values: [pair("24 events · quarter spread", "24 events · quarter spread"), "25 cycles · P .999357 · q05 150", "pass"] },
        { label: pair("E36", "E36"), values: [pair("36 events · quarter spread", "36 events · quarter spread"), "50 cycles · P .993685 · q05 159", "pass"] },
        { label: pair("X", "X"), values: [pair("Python–Node", "Python–Node"), "56 rows · max |Δp| 3.33e-16", "pass"] },
        { label: pair("O", "O"), values: [pair("Aurora outcomes", "Aurora outcomes"), "0 entries opened", pair("닫힘", "closed")] }
      ]
    },
    sharedProgram: {
      name: pair("Manifest에서 pair-powered endpoint까지", "From manifest to pair-powered endpoint"),
      thesis: pair("Scientific cohort identity, block 조합정보, measurement non-interference를 모두 통과해야 latent individual state를 시험할 수 있다.", "Testing latent individual state requires scientific-cohort identity, block combinatorial information, and measurement non-interference together."),
      design: pair("Feature register를 cycle 480에 닫고 별도 endpoint register를 25-cycle로 운용하되 먼저 schedule equivalence를 판정한다.", "Close the feature register at cycle 480, operate a separate 25-cycle endpoint register, and first adjudicate schedule equivalence."),
      adjudication: pair("Manifest→block ceiling→worst-phase pair power→intervention equivalence→independent rank 순서로만 gate를 연다.", "Open gates only in the order manifest, block ceiling, worst-phase pair power, intervention equivalence, and independent rank."),
      primaryMetrics: pair("Manifest completeness, effective events, non-tied pairs, worst-phase probability, equivalence intervals, Harrell C", "Manifest completeness, effective events, non-tied pairs, worst-phase probability, equivalence intervals, and Harrell C"),
      successRule: pair("24-event branch는 25-cycle·pair≥100을 보존하고 equivalence 통과 뒤 C≥0.65·lower bound>0.50를 두 구현이 재현한다.", "The 24-event branch preserves 25-cycle pair≥100 and, after equivalence passes, two implementations reproduce C≥0.65 and lower bound>0.50."),
      stopRule: pair("Manifest 또는 equivalence가 실패하면 outcome을 열지 않고 capacity-only confirmation을 중단한다.", "If manifest or equivalence fails, keep outcomes closed and stop capacity-only confirmation."),
      status: pair("Pair design 확보 · Aurora 제외 · measurement equivalence 미시험 · target outcome 비개봉", "Pair design established; Aurora excluded; measurement equivalence untested; target outcomes unopened")
    },
    artifacts: [
      artifact("RC57 사전 계약", "RC57 design contract", "Lineage·pair distribution·spread·phase·measurement-intervention gate를 계산 전에 고정", "Fixes lineage, pair-distribution, spread, phase, and measurement-intervention gates before calculation", "research/reproducibility/rc57-lineage-pair-design-contract.json", "JSON"),
      artifact("Aurora RO-Crate 감사", "Aurora RO-Crate audit", "Remote crate graph와 physical inventory를 metadata-only로 결합하고 36-cell lineage 실패를 판정", "Joins the remote crate graph to physical inventory metadata-only and adjudicates the 36-cell lineage failure", "research/reproducibility/rc57-aurora-rocrate-lineage-audit.json", "JSON"),
      artifact("Python exact pair 설계", "Python exact pair design", "Multinomial pair distribution을 spread·interval·모든 phase에 exact 계산", "Exactly computes multinomial pair distributions across spreads, intervals, and every phase", "scripts/run_rc57_endpoint_pair_design.py", "Python"),
      artifact("Python 결과", "Python result", "56개 design row와 두 event branch 선택을 보존", "Preserves 56 design rows and two event-branch selections", "research/reproducibility/rc57-endpoint-pair-design-python.json", "JSON"),
      artifact("독립 Node exact replay", "Independent Node exact replay", "외부 통계 package 없이 crossing·multinomial DP·gate를 별도 구현", "Separately implements crossing, multinomial DP, and gates without an external statistics package", "scripts/independent-rc57-endpoint-pair-design.mjs", "JavaScript"),
      artifact("Node 결과", "Node result", "독립 56-row probability와 discrete decision을 보존", "Preserves independent 56-row probabilities and discrete decisions", "research/reproducibility/rc57-endpoint-pair-design-node.json", "JSON"),
      artifact("독립 종합판정", "Independent adjudication", "두 구현 합의와 Aurora negative target stop을 공동 판정", "Jointly adjudicates implementation agreement and the Aurora negative target stop", "research/reproducibility/rc57-lineage-pair-independent-audit.json", "JSON"),
      artifact("선행연구 경계", "Prior-art boundary", "RPT·RO-Crate·진단 연구와 제안 결합의 overlap·차이를 기록", "Records overlaps and differences between RPT, RO-Crate, diagnostic research, and the proposed combination", "research/reproducibility/rc57-lineage-pair-prior-art.json", "JSON"),
      artifact("구조 연결 근거", "Structural connection evidence", "RUL·twin·accelerated life·autonomous lab의 variable mapping과 break condition을 기록", "Records variable mappings and break conditions across RUL, twins, accelerated life, and autonomous labs", "research/reproducibility/rc57-lineage-pair-connection-evidence.json", "JSON"),
      artifact("RC57 연구 기록", "RC57 research record", "경쟁 가설·실패·불확실성·다음 정확한 출발점을 보존", "Preserves competing hypotheses, failures, uncertainty, and the exact next start", "research/reproducibility/rc57-lineage-pair-cycle-result.json", "JSON")
    ],
    log: [
      pair("RC56의 lineage와 pair-power 종료점에서 시작하고 cyber-trust branch는 계속 보류했다.", "Started from RC56's lineage and pair-power endpoint and kept the cyber-trust branch deferred."),
      pair("Aurora remote ZIP의 ro-crate-metadata.json만 추가로 열고 BDF outcome은 열지 않았다.", "Opened only ro-crate-metadata.json from the remote Aurora ZIP and no BDF outcomes."),
      pair("599 graph entity가 199 cell inventory를 완성하지만 study-cohort relation은 제공하지 않음을 확인했다.", "Confirmed that 599 graph entities complete a 199-cell inventory but provide no study-cohort relation."),
      pair("Four-cell block의 72-pair 절대 상한을 먼저 증명해 cadence-only branch를 중단했다.", "Proved the 72-pair absolute ceiling of four-cell blocks and stopped the cadence-only branch."),
      pair("48개 crossing proxy를 1/4까지 압축하고 모든 integer grid phase의 exact multinomial pair distribution을 계산했다.", "Compressed 48 crossing proxies to one-quarter spread and computed exact multinomial pair distributions for every integer grid phase."),
      pair("24 event는 25-cycle, 36 event는 50-cycle이 가장 느린 통과 간격이었다.", "Twenty-five cycles at 24 events and fifty cycles at 36 events were the largest passing intervals."),
      pair("Python과 Node가 56개 row·quantile·gate에 독립적으로 합의했다.", "Python and Node independently agreed on 56 rows, quantiles, and gates."),
      pair("Aurora를 confirmation target에서 제외하고 schedule-equivalence pilot을 다음 필수 관문으로 남겼다.", "Excluded Aurora as a confirmation target and left a schedule-equivalence pilot as the next required gate.")
    ],
    nextCycle: pair("RC58은 outcome을 열지 않고 공개 battery source의 metadata만 선별해, 36개 이상 same-condition cell과 explicit specimen–protocol–file manifest를 동시에 가진 target을 찾는다. 통과 source가 있으면 ID를 봉인하고 dense-versus-conventional RPT equivalence protocol을 만든다. 없으면 prospective 36-cell acquisition을 사전등록하고 expansion·pressure·acoustic·multistep excitation 가운데 공개 repeatability 자료가 있는 한 observable을 별도 후보로 평가한다.", "RC58 will screen only public battery-source metadata without opening outcomes for a target combining at least 36 same-condition cells with an explicit specimen–protocol–file manifest. If a source passes, seal its IDs and build a dense-versus-conventional RPT equivalence protocol. If none passes, preregister prospective 36-cell acquisition and separately evaluate one expansion, pressure, acoustic, or multistep-excitation observable with public repeatability evidence."),
    sourceIds
  };

  for (const problem of problems) {
    const record = records[problem.id];
    if (!record) continue;
    const historicalRecord = { cycleId: cycle.id, ...record, reviewedOn: REVIEWED_ON };
    problem.researchHistory = [...(problem.researchHistory || []), historicalRecord];
    problem.cycleResearch = historicalRecord;
    if (problem.solutionLab?.deepDive) problem.solutionLab.deepDive.reviewedOn = REVIEWED_ON;
    else if (problem.solutionLab) problem.solutionLab.reviewedOn = REVIEWED_ON;
    problem.sourceIds = [...new Set([...(problem.sourceIds || []), ...record.sourceIds])];
  }
  for (const problem of problems) problem.researchConnections = connections.filter(item => item.problemIds.includes(problem.id)).map(item => item.id);
  cycles.push(cycle);
  window.CATALOG_SOURCES = sources;
  window.RESEARCH_CYCLES = cycles;
  window.RESEARCH_CONNECTIONS = connections;
  window.RESEARCH_CYCLE_META = { ...(window.RESEARCH_CYCLE_META || {}), reviewedOn: REVIEWED_ON, cycles: cycles.length, curatedProblems: problems.filter(problem => problem.researchHistory?.length).length, researchRecords: problems.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0), connections: connections.length };
})();
