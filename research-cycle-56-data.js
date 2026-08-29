/* RC-2026-56: later capacity signals appeared, but pair resolution and target lineage stopped confirmation. */
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
    aurora_platform_2025: {
      discipline: "materials",
      title: "Toward an Autonomous Robotic Battery Materials Research Platform Powered by Automated Workflow and Ontologized FAIR Data Management",
      url: "https://doi.org/10.1002/batt.202500155",
      evidenceLabel: "Empa의 자동 coin-cell 조립·25°C cycling·BDF 시계열·FAIR metadata를 설명하고 장기 LFP/흑연 36개를 1000 cycle까지 비교한 Batteries & Supercaps 원 논문",
      evidenceLabelEn: "Batteries & Supercaps primary paper describing Empa's automated coin-cell assembly, 25°C cycling, BDF time series, FAIR metadata, and 36 long-term LFP/graphite cells compared to 1,000 cycles",
      publishedOn: "2025-07-07",
      resultPeriod: "2025-07-07 online; 본문은 장기 LFP/흑연 36개와 1000-cycle 결과를 보고하며 2025-07-01 공개 dataset DOI를 연결",
      resultPeriodEn: "Online 2025-07-07; the paper reports a 36-cell long-term LFP/graphite cohort through 1,000 cycles and links the dataset DOI released 2025-07-01",
      reviewedOn: REVIEWED_ON
    },
    aurora_dataset_2025: {
      discipline: "materials",
      title: "Dataset for publication: Toward an Autonomous Robotic Battery Materials Research Platform",
      url: "https://doi.org/10.5281/zenodo.15481956",
      evidenceLabel: "199개 cell의 ontologized metadata와 BDF CSV·Parquet를 CC BY 4.0으로 공개한 Zenodo 공식 record; RC56은 metadata JSON만 열고 cycling entry는 열지 않음",
      evidenceLabelEn: "Official Zenodo record releasing ontologized metadata and BDF CSV/Parquet for 199 cells under CC BY 4.0; RC56 opened metadata JSON only and no cycling entry",
      publishedOn: "2025-07-01",
      resultPeriod: "2025-07-01 공개; RC56 원격 directory·metadata 감사일 2026-08-29",
      resultPeriodEn: "Released 2025-07-01; RC56 remote directory and metadata audit on 2026-08-29",
      reviewedOn: REVIEWED_ON
    }
  });

  const sourceIds = ["rwth_ur18650e_dataset_2021", "rwth_one_shot_2021", "rwth_changepoint_2026", "tao_pattern_decoupling_2025", "aurora_platform_2025", "aurora_dataset_2025"];
  const hypotheses = [
    hypothesis("H56-0", "등록한 좌표와 독립 cohort 중 하나라도 판정 gate를 충족하지 못하면 transport 주장을 열지 않는다.", "Do not open a transport claim if either the registered coordinate or the independent cohort misses an adjudication gate.", "모든 후보의 gate와 target lineage를 outcome access 전에 공동 판정한다.", "Jointly adjudicate every candidate gate and target lineage before outcome access.", "두 독립 구현과 metadata-only source audit를 결합한다.", "Combine two independent implementations with a metadata-only source audit.", "좌표 하나와 exact cohort가 모두 자격을 얻을 때만 기각한다.", "Reject only when one coordinate and an exact cohort both qualify."),
    hypothesis("H56-1", "R1–R3의 capacity level·최근 slope·곡률 중 하나가 start batch 밖에서도 remaining-life 순서를 안정적으로 보존한다.", "One R1–R3 capacity level, recent slope, or curvature coordinate stably preserves remaining-life order outside a start batch.", "Coverage≥44/48, 12개 batch prediction, non-tied pair≥60, blocked C≥0.65, 모든 beta 방향 일치를 동시에 요구한다.", "Jointly require coverage of at least 44/48, predictions in all twelve batches, at least sixty non-tied pairs, blocked C at least 0.65, and one beta direction.", "열린 RWTH 48개를 네-cell start batch 단위 leave-one-batch-out으로 판정한다.", "Adjudicate the opened 48-cell RWTH cohort by leave-one-four-cell-start-batch-out validation.", "최강 후보 R3 capacity level은 C=0.723이지만 47 pair뿐이라 자격을 얻지 못했다.", "The strongest candidate, R3 capacity level, reached C=0.723 but had only 47 pairs and did not qualify."),
    hypothesis("H56-2", "Aurora 공식 archive가 논문의 36-cell 장기 LFP cohort를 outcome 없이 일대일 식별한다.", "The official Aurora archive identifies the paper's 36-cell long-term LFP cohort one-to-one without outcomes.", "Metadata만으로 36개 이상 cell ID·전극 chemistry·protocol·data entry를 고정할 수 있어야 한다.", "Metadata alone must fix at least 36 cell IDs, electrode chemistry, protocol, and data entries.", "2.5 GB ZIP의 central directory와 199개 metadata JSON만 HTTP range로 감사한다.", "Audit only the central directory and 199 metadata JSON files in the 2.5 GB ZIP by HTTP range.", "논문은 36개를 말하지만 LiFePO4를 명시한 metadata가 32개여서 네 cell의 lineage가 풀리지 않았다.", "The paper reports 36 cells, but only 32 metadata files explicitly identify LiFePO4, leaving four cells unresolved.")
  ];

  const causalChain = [
    { code: "O", title: pair("관측 시점", "Observation time"), claim: pair("BOL 뒤 R1·R2·R3에서 capacity level·local slope·곡률을 실제 cycle 간격으로 계산한다.", "Compute capacity level, local slope, and curvature at R1, R2, and R3 using actual cycle intervals after BOL."), failure: pair("늦은 시점은 mechanism 분리를 보이지만 예측 lead time을 줄인다.", "A later observation can reveal mechanism separation while shortening forecast lead time.") },
    { code: "B", title: pair("Batch 밖 순서", "Out-of-batch order"), claim: pair("네 cell start batch 전체를 빼고 fit해 batch 안 non-tied EOL pair만 센다.", "Remove a complete four-cell start batch for fitting and count only non-tied EOL pairs inside that batch."), failure: pair("Sparse RPT가 EOL을 같은 round에 묶으면 좋은 score도 판정할 pair를 잃는다.", "When sparse RPTs tie EOL to the same round, even a promising score loses adjudicable pairs.") },
    { code: "L", title: pair("Target lineage", "Target lineage"), claim: pair("논문 cohort와 archive record를 cell ID까지 outcome 전에 연결한다.", "Link the paper cohort to archive records down to cell ID before outcomes."), failure: pair("Aggregate count와 metadata count가 다르면 누락 cell을 추정해 넣을 수 없다.", "If aggregate and metadata counts differ, missing cells cannot be inferred into the cohort.") },
    { code: "T", title: pair("독립 transport", "Independent transport"), claim: pair("통과한 한 좌표만 새 chemistry·format·lab에서 ordinal rank로 판정한다.", "Adjudicate only one qualified coordinate as an ordinal rank in a new chemistry, format, and laboratory."), failure: pair("Development gate나 lineage gate가 닫히면 cycling outcome을 열지 않는다.", "Do not open cycling outcomes when either the development or lineage gate is closed.") }
  ];

  const workPackages = [
    { code: "W1", title: pair("Cohort lineage 해소", "Resolve cohort lineage"), objective: pair("논문의 36개와 archive의 explicit LFP 32개가 왜 다른지 outcome 없이 확정한다.", "Determine without outcomes why the paper's 36 cells differ from the archive's 32 explicit LFP records."), method: pair("Author·curator manifest, RO-Crate inventory, cell-ID inclusion table 중 공식 자료를 요청하고 checksum과 version을 고정한다.", "Obtain an official author or curator manifest, RO-Crate inventory, or cell-ID inclusion table and freeze its checksum and version."), deliverable: pair("36개 cell의 one-to-one paper–metadata–BDF manifest", "One-to-one paper–metadata–BDF manifest for 36 cells"), gate: pair("모든 ID가 중복 없이 한 metadata와 한 BDF entry에 대응한다.", "Every ID maps without duplication to one metadata and one BDF entry.") },
    { code: "W2", title: pair("Endpoint pair 예산", "Endpoint pair budget"), objective: pair("미래 실험이 tie 때문에 다시 멈추지 않게 측정 간격을 outcome 전에 정한다.", "Choose measurement spacing before outcomes so a future experiment does not stop again on ties."), method: pair("RWTH의 interval pattern만 사용해 160·80·50-cycle 및 knee-triggered RPT에서 expected non-tied pair 수를 simulation한다.", "Use only RWTH interval patterns to simulate expected non-tied pair counts under 160-, 80-, 50-cycle, and knee-triggered RPT schedules."), deliverable: pair("Cell 수·event 수·RPT 간격별 pair-power 곡선", "Pair-power curves by cell count, event count, and RPT spacing"), gate: pair("보수적 scenario에서 blocked pair≥100을 보장하는 최소 설계를 선택한다.", "Select the smallest design guaranteeing at least 100 blocked pairs in a conservative scenario.") },
    { code: "W3", title: pair("한 좌표 재봉인", "Reseal one coordinate"), objective: pair("RWTH signal을 다시 고르지 않고 새 source에 적용할 단일 좌표를 정한다.", "Fix one coordinate for a new source without selecting again on RWTH signals."), method: pair("새 endpoint design이 확보된 뒤 R3 normalized capacity level을 첫 후보로 사전등록하고 chemistry-transfer는 ordinal claim으로 제한한다.", "After securing a new endpoint design, preregister R3 normalized capacity level as the first candidate and restrict chemistry transfer to an ordinal claim."), deliverable: pair("Cell ID·cycle mapping·sign·missingness·gate를 포함한 target precommit", "Target precommit containing cell IDs, cycle mapping, sign, missingness, and gates"), gate: pair("Precommit commit 뒤에만 target BDF를 연다.", "Open target BDF data only after the precommit commit.") },
    { code: "W4", title: pair("직교 센서 분기", "Orthogonal-sensor branch"), objective: pair("Capacity-only pair budget이 불가능할 때 latent mechanism을 직접 본다.", "Observe latent mechanisms directly if a capacity-only pair budget is infeasible."), method: pair("Expansion·pressure·acoustic·multistep excitation 중 repeat variance가 between-cell variance의 절반 미만인 한 관측량을 고른다.", "Choose one expansion, pressure, acoustic, or multistep-excitation observable whose repeat variance is below half the between-cell variance."), deliverable: pair("독립 반복성과 sampling 규격이 있는 acquisition protocol", "Acquisition protocol with independent repeatability and sampling specifications"), gate: pair("관측량 repeatability가 먼저 통과하기 전에는 RUL model을 fit하지 않는다.", "Do not fit an RUL model before observable repeatability passes.") }
  ];

  const uncertaintyBudget = [
    { code: "U1", category: pair("Endpoint", "Endpoint"), source: pair("Sparse capacity rounds가 만드는 tied EOL", "Tied EOL from sparse capacity rounds"), control: pair("≤50-cycle 또는 adaptive RPT와 interval endpoint", "At-most-50-cycle or adaptive RPT with interval endpoints"), threshold: pair("확증 target pair<100이면 rank 주장 보류", "Withhold rank claim below 100 confirmatory target pairs") },
    { code: "U2", category: pair("Lineage", "Lineage"), source: pair("논문 36개·archive explicit LFP 32개", "Thirty-six paper cells versus 32 archive-explicit LFP cells"), control: pair("공식 ID manifest와 checksum", "Official ID manifest and checksum"), threshold: pair("한 ID라도 불명확하면 outcome access 중단", "Stop outcome access if any ID is ambiguous") },
    { code: "U3", category: pair("Selection", "Selection"), source: pair("RWTH outcome이 이미 열린 상태", "RWTH outcomes already opened"), control: pair("후보 생성으로만 표시하고 새 source 전에 한 좌표 봉인", "Label as candidate generation only and seal one coordinate before a new source"), threshold: pair("RWTH 재선택·gate 완화 금지", "No RWTH reselection or gate relaxation") },
    { code: "U4", category: pair("Transfer", "Transfer"), source: pair("NMC cylinder에서 LFP coin-cell로 이동", "Moving from NMC cylinders to LFP coin cells"), control: pair("Dimensionless ordinal feature와 target calibration 분리", "Separate a dimensionless ordinal feature from target calibration"), threshold: pair("Independent calibration 전 absolute RUL 금지", "No absolute RUL before independent calibration") }
  ];

  const decisionTree = [
    { condition: pair("공식 36-cell manifest 확보 실패", "Official 36-cell manifest unavailable"), action: pair("Aurora를 확인 cohort에서 제외하고 outcome을 닫아 둔다.", "Exclude Aurora as a confirmation cohort and keep outcomes closed."), meaning: pair("Data volume보다 lineage가 먼저다.", "Lineage precedes data volume.") },
    { condition: pair("Pair-power 설계가 100 pair 미달", "Pair-power design remains below 100 pairs"), action: pair("Capacity-only 확인을 멈추고 직교 센서를 설계한다.", "Stop capacity-only confirmation and design an orthogonal sensor."), meaning: pair("모형이 아니라 관측·endpoint 해상도가 병목이다.", "Observation and endpoint resolution, not model size, are the bottleneck.") },
    { condition: pair("Lineage·pair budget 통과", "Lineage and pair budget pass"), action: pair("한 좌표·한 sign·한 endpoint를 commit한 뒤 target을 연다.", "Commit one coordinate, one sign, and one endpoint before opening targets."), meaning: pair("Outcome-blind transport 시험이 가능해진다.", "An outcome-blind transport test becomes possible.") },
    { condition: pair("Ordinal rank 통과·calibration 미검증", "Ordinal rank passes, calibration unverified"), action: pair("상대 등급만 보고하고 cycle RUL은 출력하지 않는다.", "Report relative grading only and do not output cycle RUL."), meaning: pair("Frailty ordering과 lifetime scale은 다른 주장이다.", "Frailty ordering and lifetime scale are different claims.") }
  ];

  const records = {
    "UP-219": {
      role: pair("배터리 RUL에서 늦은 capacity 신호와 독립 endpoint 해상도를 함께 판정한다.", "Jointly adjudicates later capacity signal and independent endpoint resolution for battery RUL."), focusedPage: true,
      centralQuestion: pair("수명 곡선이 갈라지기 시작한 뒤의 capacity level은 개별 cell의 남은 순서를 예고하는가, 아니면 sparse check가 만든 tie 때문에 그 주장 자체를 판정할 수 없는가?", "Does capacity level after trajectories begin to separate anticipate individual remaining-life order, or do ties from sparse checks make the claim inadjudicable?"),
      resolutionCriterion: pair("새 cohort에서 사전 봉인한 한 좌표가 coverage≥90%, event≥24, pair≥100, C≥0.65, bootstrap lower bound>0.50를 독립 구현으로 통과해야 한다.", "In a new cohort, one preregistered coordinate must independently pass coverage at least 90%, at least 24 events, at least 100 pairs, C at least 0.65, and a bootstrap lower bound above 0.50."),
      technicalAxes: [pair("실제 cycle 간격으로 계산한 normalized capacity level과 local log slope", "Normalized capacity level and local log slope computed from actual cycle intervals"), pair("Start-batch blocked concordance와 non-tied pair budget", "Start-batch-blocked concordance and non-tied pair budget"), pair("Ordinal frailty transport와 absolute cycle calibration의 분리", "Separation of ordinal frailty transport from absolute cycle calibration")],
      updatedDefinition: pair("RUL 문제는 낮은 평균 오차의 곡선을 그리는 일이 아니라, 같은 조건의 두 cell 중 누가 먼저 own-BOL 80%에 도달할지를 충분한 독립 pair로 맞히는 일이다. RC56에서 later capacity는 더 강한 순서 신호를 보였지만 검증 가능한 pair 수가 부족했다.", "RUL is not merely drawing a low-average-error curve; it requires ordering which of two same-condition cells reaches 80% of its own BOL first across enough independent pairs. Later capacity showed a stronger ordering signal in RC56, but too few adjudicable pairs remained."),
      knownBoundary: pair("RWTH R3 capacity level은 12개 leave-batch-out fit에서 같은 방향과 C=0.723을 보였다. 그러나 47 pair는 사전 60-pair 기준에 못 미쳐 후보 생성 결과일 뿐이다.", "RWTH R3 capacity level kept one direction across twelve leave-batch-out fits and reached C=0.723. Its 47 pairs missed the preregistered 60-pair gate, so it remains candidate-generation evidence."),
      bottleneck: pair("관측을 늦추면 signal은 커지지만 lead time이 짧아지고, endpoint check가 성기면 많은 cell이 같은 EOL round에 묶인다. 신호와 판정 해상도를 동시에 설계해야 한다.", "Later observation strengthens signal but shortens lead time, while sparse endpoint checks tie many cells to one EOL round. Signal and adjudication resolution must be designed together."),
      minimumAdvance: pair("Outcome 전에 정한 RPT schedule이 blocked pair≥100을 만들고, 새 batch에서 R3 level의 방향과 C≥0.65가 재현되면 ordinal RUL의 의미 있는 진전이다.", "A meaningful advance is a prospectively scheduled RPT design yielding at least 100 blocked pairs and a new-batch reproduction of the R3-level direction with C at least 0.65."),
      decisiveTest: pair("Exact cohort manifest와 pair-power 설계를 먼저 봉인하고, target calibration 없이 R3 normalized capacity level 하나만 독립 cohort에 적용한다.", "First seal an exact cohort manifest and pair-power design, then apply only R3 normalized capacity level to an independent cohort without target calibration."),
      workPackages, uncertaintyBudget, decisionTree,
      unresolved: pair("R3 signal의 chemistry·format transport, four-cell Aurora lineage 차이, adaptive RPT가 cell aging을 교란하지 않는지가 남아 있다.", "Chemistry and format transport of the R3 signal, the four-cell Aurora lineage difference, and whether adaptive RPT perturbs aging remain unresolved."), hypotheses, sourceIds
    },
    "UP-233": {
      role: pair("Battery digital twin이 population curve를 individual state로 오인하지 않게 동기화 관측량의 식별 가능성을 시험한다.", "Tests whether a battery digital twin's synchronization observable identifies individual state rather than merely a population curve."), focusedPage: true,
      centralQuestion: pair("Twin을 R1·R2·R3 중 언제 동기화해야 cell별 latent degradation state가 보이며, 그 state가 새 chemistry에서도 같은 순서 의미를 유지하는가?", "At which of R1, R2, or R3 does twin synchronization reveal cell-specific latent degradation state, and does that state preserve its ordering meaning in a new chemistry?"),
      resolutionCriterion: pair("동기화 좌표가 새 batch에서 rank gate를 통과하고 별도 target calibration이 lifetime scale을 통과하기 전에는 bounded twin도 individual cycle RUL을 출력하지 않는다.", "A bounded twin must not output individual cycle RUL until its synchronization coordinate passes a new-batch rank gate and separate target calibration passes the lifetime scale."),
      technicalAxes: [pair("동기화 시점과 forecast horizon의 trade-off", "Trade-off between synchronization time and forecast horizon"), pair("Latent state rank와 lifetime scale의 분리", "Separation of latent-state rank and lifetime scale"), pair("Paper–archive–cell provenance를 포함한 twin input lineage", "Twin-input lineage spanning paper, archive, and cell provenance")],
      updatedDefinition: pair("Battery twin의 핵심 난제는 모든 cell에 같은 degradation trajectory를 맞추는 것이 아니라, 제한된 진단으로 각 cell의 숨은 상태를 식별하고 그 상태가 새 batch에서도 같은 의미를 갖는지 확인하는 일이다.", "The central battery-twin problem is not fitting one degradation trajectory to every cell; it is identifying each cell's hidden state from bounded diagnostics and verifying that the state keeps the same meaning in a new batch."),
      knownBoundary: pair("R2 recent slope와 R3 level은 early response보다 강했지만 sparse endpoint와 opened-source selection 때문에 검증된 twin state가 아니다. Aurora의 cell lineage도 아직 exact input set을 만들지 못한다.", "R2 recent slope and R3 level were stronger than the early response, but sparse endpoints and opened-source selection prevent treating them as validated twin states. Aurora lineage also does not yet define an exact input set."),
      bottleneck: pair("Twin state의 정보량, 관측 시점, 독립 provenance가 하나의 chain으로 닫혀야 한다. 어느 하나가 불명확하면 높은 fit도 cell-specific state의 근거가 아니다.", "State information, observation time, and independent provenance must close one chain. If any link is ambiguous, a high fit is not evidence of cell-specific state."),
      minimumAdvance: pair("새 source의 exact ID manifest를 봉인하고 한 dimensionless state가 calibration 없이도 held-batch order를 재현하면 bounded ordinal twin을 시작할 수 있다.", "A bounded ordinal twin can begin when an exact new-source ID manifest is sealed and one dimensionless state reproduces held-batch order without calibration."),
      decisiveTest: pair("R3 state를 target label과 분리해 계산하고, rank가 통과한 뒤에만 별도 calibration subset으로 cycle scale을 붙인다.", "Compute the R3 state independently of target labels and attach a cycle scale from a separate calibration subset only after rank passes."),
      workPackages, uncertaintyBudget, decisionTree,
      unresolved: pair("한 state가 NMC cylinder와 LFP coin cell 사이에서 같은 물리 의미를 갖는지, 그리고 synchronization이 충분히 이른지가 미검증이다.", "Whether one state has the same physical meaning across NMC cylinders and LFP coin cells, and whether synchronization is early enough, remain unverified."), hypotheses, sourceIds
    },
    "UP-234": {
      role: pair("가속수명 모형의 condition effect와 cell frailty를 endpoint resolution 안에서 분리한다.", "Separates condition effects from cell frailty in accelerated-life models within endpoint resolution."), focusedPage: true,
      centralQuestion: pair("같은 stress에서 남은 수명 차이를 random effect로 식별할 만큼 endpoint pair가 있는가, 아니면 interval quantization을 frailty 분산으로 잘못 fit하고 있는가?", "Are there enough endpoint pairs to identify remaining-life variation as a random effect under fixed stress, or is interval quantization being fitted as frailty variance?"),
      resolutionCriterion: pair("Start·production batch를 block한 뒤에도 충분한 non-tied pair와 stable frailty sign이 남고, 새 lot에서 rank가 재현돼야 random effect를 cell susceptibility로 해석한다.", "Interpret a random effect as cell susceptibility only when enough non-tied pairs and a stable frailty sign remain after blocking start or production batch and rank reproduces in a new lot."),
      technicalAxes: [pair("Interval-censored 80% crossing과 pair identifiability", "Interval-censored 80% crossing and pair identifiability"), pair("Condition-level stress law와 within-condition random effect", "Condition-level stress law and within-condition random effect"), pair("Measurement schedule이 frailty variance에 주는 영향", "Effect of measurement schedule on frailty variance")],
      updatedDefinition: pair("가속수명 난제는 stress에 따른 평균 수명만 외삽하는 데서 끝나지 않는다. 같은 stress 안의 개체차가 실제 susceptibility인지, 검사 간격이 만든 time bin인지 분리해야 한다.", "Accelerated-life inference does not end with extrapolating mean lifetime under stress. It must separate genuine within-stress susceptibility from time bins created by inspection spacing."),
      knownBoundary: pair("Later capacity feature는 batch 밖 ordering signal을 보였지만 47 pair뿐이었다. 이 결과는 random effect 후보를 만들지만 분산 성분이나 개체 수명 예측을 식별하지 않는다.", "Later capacity features showed out-of-batch ordering signal but only across 47 pairs. This generates a random-effect candidate but does not identify a variance component or individual lifetime prediction."),
      bottleneck: pair("검사 간격이 넓을수록 event time tie가 늘고 frailty likelihood의 정보가 사라진다. Cell 수만 늘리는 것보다 event sampling schedule과 batch blocking이 먼저다.", "Wider inspection spacing increases event-time ties and erases information in the frailty likelihood. Event-sampling schedule and batch blocking precede simply adding cells."),
      minimumAdvance: pair("사전 pair-power 계산으로 inspection schedule을 정하고 새 lot 전체를 holdout해 같은 frailty 방향과 C≥0.65를 보이면 condition law 밖 개체차에 근거가 생긴다.", "Evidence for susceptibility beyond the condition law begins when a prospectively pair-powered inspection schedule and a whole-new-lot holdout reproduce one frailty direction with C at least 0.65."),
      decisiveTest: pair("Condition coefficient는 population arm에 고정하고 R3 좌표는 within-condition arm에만 넣은 interval-censored hierarchical survival을 새 lot에 판정한다.", "Adjudicate an interval-censored hierarchical survival model in a new lot, fixing condition coefficients in the population arm and placing the R3 coordinate only in the within-condition arm."),
      workPackages, uncertaintyBudget, decisionTree,
      unresolved: pair("필요한 RPT 간격, lot 간 frailty 분산의 안정성, chemistry가 바뀔 때 random-effect scale이 유지되는지가 남아 있다.", "Required RPT spacing, stability of frailty variance across lots, and preservation of random-effect scale across chemistry remain unresolved."), hypotheses, sourceIds
    }
  };

  const connection = {
    id: "CONN-EVIDENCE-029", type: pair("관측 시점–endpoint 해상도–lineage의 공동 식별", "Joint identification of observation time, endpoint resolution, and lineage"), strength: "strong", problemIds: Object.keys(records),
    sharedBottleneck: pair("Later landmark가 cell 간 차이를 키워도 sparse endpoint가 pair를 지우거나 target lineage가 끊기면 individual state를 독립적으로 확인할 수 없다.", "Even when a later landmark amplifies cell differences, individual state cannot be independently confirmed if sparse endpoints erase pairs or target lineage breaks."),
    mapping: pair("RUL feature는 twin synchronization state와 accelerated-life random effect에 대응하고, blocked non-tied EOL pair는 세 문제 모두의 판정 정보량에 대응한다.", "The RUL feature maps to the twin synchronization state and accelerated-life random effect, while blocked non-tied EOL pairs map to adjudication information in all three problems."),
    transferableMethod: pair("Dimensionless state 하나를 outcome 전에 봉인하고 condition arm과 frailty arm을 분리하며 exact paper–archive–cell manifest 뒤에만 target outcome을 연다.", "Seal one dimensionless state before outcomes, separate condition and frailty arms, and open target outcomes only after an exact paper–archive–cell manifest."),
    minimumTest: pair("Exact cohort, coverage≥90%, event≥24, pair≥100, C≥0.65, bootstrap lower bound>0.50와 독립 구현을 공동 판정한다.", "Jointly adjudicate an exact cohort, coverage at least 90%, at least 24 events, at least 100 pairs, C at least 0.65, a bootstrap lower bound above 0.50, and an independent implementation."),
    failureBoundary: pair("Opened-source feature 재선택, pair gate 완화, missing cell 추정, smoothed EOL을 exact label로 대체하면 연결을 확인 근거로 쓰지 않는다.", "Do not use the connection as confirmation after opened-source feature reselection, pair-gate relaxation, inference of missing cells, or substitution of smoothed EOL as an exact label."),
    evidence: pair("R3 level C=0.723·stable sign이지만 47<60 pair였고, Aurora는 paper 36 대 archive explicit LFP 32로 lineage가 끊겨 zero outcome access에서 멈췄다.", "R3 level reached C=0.723 with a stable sign but only 47<60 pairs; Aurora stopped at zero outcome access because lineage broke at 36 paper cells versus 32 archive-explicit LFP records."),
    validationStatus: pair("공통 병목은 관측됐다. Transport coordinate와 independent target은 아직 확인되지 않았다.", "The shared bottleneck is observed. A transport coordinate and independent target remain unconfirmed."), reviewedOn: REVIEWED_ON, sourceIds
  };
  connections.push(connection);

  const cycle = {
    id: "RC-2026-56", status: "active", startedOn: REVIEWED_ON, reviewedOn: REVIEWED_ON,
    title: "강해진 수명 신호도 pair와 lineage가 없으면 열지 않는다", titleEn: "A stronger lifetime signal stays closed without pairs and lineage",
    selectionReason: "RC55가 first-160-cycle scalar를 기각했으므로 같은 RWTH outcome은 method development로만 사용해 later landmark의 정보 증가를 시험했다. 동시에 1000-cycle 장기 LFP cohort와 공개 BDF를 제공하는 Aurora를 metadata-only로 감사해, 통과한 좌표가 생길 때 바로 독립 판정할 수 있는지 확인했다.",
    selectionReasonEn: "Because RC55 rejected the first-160-cycle scalar, the same RWTH outcomes were used only for method development to test information gain at later landmarks. In parallel, Aurora's 1,000-cycle LFP cohort and public BDF archive were audited metadata-only to determine whether an earned coordinate could be independently adjudicated.",
    summary: pair("R2 recent slope는 C=0.702, R3 capacity level은 C=0.723과 12-fold 동일 sign을 보였지만 non-tied blocked pair가 47개라 등록한 60개에 못 미쳤다. Python과 Node는 candidate 없음에 합의했다. Aurora ZIP은 metadata·CSV·Parquet가 각각 199개였으나 LiFePO4를 명시한 metadata는 32개로 논문의 36개와 달랐다. 두 gate가 모두 닫혀 BDF outcome은 하나도 열지 않았다.", "R2 recent slope reached C=0.702 and R3 capacity level C=0.723 with a common sign across twelve folds, but only 47 non-tied blocked pairs remained versus the registered sixty. Python and Node agreed that no candidate qualified. Aurora's ZIP contained 199 metadata, CSV, and Parquet entries each, yet only 32 metadata files explicitly identified LiFePO4 versus 36 cells in the paper. Both gates stayed closed, so no BDF outcome was opened."),
    problemIds: Object.keys(records), connectionIds: [connection.id],
    verifiedFindings: [
      { text: "RWTH R1 capacity level과 slope의 blocked C는 각각 0.571, 0.592였다.", textEn: "Blocked C for RWTH R1 capacity level and slope was 0.571 and 0.592, respectively.", sourceIds: ["rwth_ur18650e_dataset_2021"] },
      { text: "R2 recent slope C=0.702, R3 level C=0.723이었고 두 후보의 beta sign은 12개 fold에서 같았다.", textEn: "R2 recent slope reached C=0.702 and R3 level C=0.723, with a common beta sign across twelve folds for both candidates.", sourceIds: ["rwth_ur18650e_dataset_2021"] },
      { text: "R2·R3의 non-tied within-batch pair는 47개로 사전 60-pair gate를 통과하지 못했다.", textEn: "R2 and R3 had 47 non-tied within-batch pairs and missed the preregistered sixty-pair gate.", sourceIds: ["rwth_ur18650e_dataset_2021"] },
      { text: "두 구현의 concordance·gate·sign은 모두 같고 full-cohort beta 최대 차이는 1.1661e-8이었다.", textEn: "Both implementations matched every concordance, gate, and sign, with a maximum full-cohort beta difference of 1.1661e-8.", sourceIds: ["rwth_ur18650e_dataset_2021"] },
      { text: "Aurora 공식 ZIP은 797 entry와 cell별 metadata·BDF CSV·BDF Parquet 199개씩을 포함한다.", textEn: "The official Aurora ZIP contains 797 entries and 199 cell-level metadata, BDF CSV, and BDF Parquet files each.", sourceIds: ["aurora_dataset_2025"] },
      { text: "논문은 장기 LFP/흑연 36개를 설명하지만 archive에서 LiFePO4 formula를 명시한 metadata는 32개였다.", textEn: "The paper describes 36 long-term LFP/graphite cells, but only 32 archive metadata files explicitly state a LiFePO4 formula.", sourceIds: ["aurora_platform_2025", "aurora_dataset_2025"] },
      { text: "Aurora cycling entry·cell capacity·EOL은 0개를 열었다.", textEn: "Zero Aurora cycling entries, cell capacities, or EOL values were opened.", sourceIds: ["aurora_dataset_2025"] }
    ],
    resultMatrix: {
      title: pair("후보–source 이중 개방 gate", "Dual candidate–source opening gate"), note: pair("RWTH 결과는 RC55에서 이미 열렸으므로 method development다. Aurora는 metadata JSON까지만 열었다.", "RWTH outcomes were already opened in RC55 and therefore serve only method development. Aurora was opened only through metadata JSON."),
      columns: [pair("항목", "Item"), pair("판정량", "Adjudicand"), pair("결과", "Result"), pair("판정", "Verdict")],
      rows: [
        { label: pair("R1", "R1"), values: [pair("Capacity level / slope", "Capacity level / slope"), "C 0.571 / 0.592 · 49 pairs", pair("rank 실패", "rank failed")] },
        { label: pair("R2", "R2"), values: [pair("Level / slope / curvature", "Level / slope / curvature"), "C 0.681 / 0.702 / 0.447 · 47 pairs", pair("pair 실패", "pairs failed")] },
        { label: pair("R3", "R3"), values: [pair("Level / slope / curvature", "Level / slope / curvature"), "C 0.723 / 0.638 / 0.532 · 47 pairs", pair("pair 실패", "pairs failed")] },
        { label: pair("X", "X"), values: [pair("Python–Node", "Python–Node"), "max |Δ beta| 1.1661e-8", "pass"] },
        { label: pair("A", "A"), values: [pair("Aurora archive", "Aurora archive"), "199 metadata · 199 CSV · 199 Parquet", pair("directory 확인", "directory verified")] },
        { label: pair("L", "L"), values: [pair("LFP lineage", "LFP lineage"), "paper 36 · explicit metadata 32", pair("불일치", "unresolved")] },
        { label: pair("O", "O"), values: [pair("Aurora outcomes", "Aurora outcomes"), "0 entries opened", pair("닫힘", "closed")] }
      ]
    },
    sharedProgram: {
      name: pair("신호·pair·lineage의 세 관문", "Three gates for signal, pairs, and lineage"),
      thesis: pair("강한 association, 충분한 endpoint information, exact target provenance가 함께 있어야 individual health coordinate를 독립 확인할 수 있다.", "Independent confirmation of an individual health coordinate requires a strong association, sufficient endpoint information, and exact target provenance together."),
      design: pair("Opened cohort에서는 후보만 만들고, prospective pair-power와 one-to-one manifest를 봉인한 새 cohort에서만 판정한다.", "Generate candidates only in an opened cohort and adjudicate only in a new cohort with a sealed prospective pair-power design and one-to-one manifest."),
      adjudication: pair("Lineage→pair budget→feature coverage→ordinal rank→absolute calibration 순으로 gate를 연다.", "Open gates in the order lineage, pair budget, feature coverage, ordinal rank, and absolute calibration."),
      primaryMetrics: pair("Manifest coverage, non-tied blocked pairs, Harrell C, bootstrap lower bound, calibration error", "Manifest coverage, non-tied blocked pairs, Harrell C, bootstrap lower bound, and calibration error"),
      successRule: pair("Exact cohort와 pair≥100을 확보한 뒤 coverage≥90%, event≥24, C≥0.65, lower bound>0.50를 두 구현이 재현한다.", "After securing an exact cohort and at least 100 pairs, two implementations reproduce coverage at least 90%, at least 24 events, C at least 0.65, and a lower bound above 0.50."),
      stopRule: pair("Lineage 또는 pair budget이 실패하면 outcome을 열지 않고 model complexity를 늘리지 않는다.", "If lineage or the pair budget fails, keep outcomes closed and do not increase model complexity."),
      status: pair("Later capacity 후보 보존 · pair gate 실패 · Aurora lineage 미해결 · outcome 비개봉", "Later-capacity candidates preserved; pair gate failed; Aurora lineage unresolved; outcomes unopened")
    },
    artifacts: [
      artifact("Aurora metadata-only 감사", "Aurora metadata-only audit", "2.5 GB ZIP central directory와 199개 metadata만 range-read하고 outcome 0개 경계를 기록", "Range-reads only the 2.5 GB ZIP central directory and 199 metadata files and records the zero-outcome boundary", "research/reproducibility/rc56-aurora-source-audit.json", "JSON"),
      artifact("RWTH method-development 계약", "RWTH method-development contract", "Outcome-open 성격, 여덟 후보, blocked split, gate와 target-opening rule을 계산 전에 고정", "Fixes outcome-open status, eight candidates, blocked splits, gates, and target-opening rule before computation", "research/reproducibility/rc56-rwth-landmark-development-contract.json", "JSON"),
      artifact("Python landmark 시험", "Python landmark test", "R1–R3 capacity level·slope·curvature의 leave-batch-out Weibull AFT를 계산", "Computes leave-batch-out Weibull AFT for R1–R3 capacity level, slope, and curvature", "scripts/run_rc56_rwth_landmark_development.py", "Python"),
      artifact("Python 결과", "Python result", "여덟 후보의 fold prediction·sign·pair·concordance·gate를 보존", "Preserves fold predictions, signs, pairs, concordance, and gates for eight candidates", "research/reproducibility/rc56-rwth-landmark-development-python.json", "JSON"),
      artifact("독립 Node replay", "Independent Node replay", "MAT 재사용 없이 sealed capacity table에서 optimizer와 metrics를 별도 구현", "Independently implements the optimizer and metrics from the sealed capacity table without reusing MAT extraction", "scripts/independent-rc56-rwth-landmark-development.mjs", "JavaScript"),
      artifact("독립 종합판정", "Independent adjudication", "두 구현 합의, explicit LFP 32개, zero outcome access와 negative stop을 공동 확인", "Jointly verifies two-implementation agreement, 32 explicit LFP records, zero outcome access, and the negative stop", "research/reproducibility/rc56-landmark-source-independent-audit.json", "JSON"),
      artifact("구조 연결 근거", "Structural connection evidence", "RUL·digital twin·accelerated life의 observation time·pair·lineage mapping을 기록", "Records observation-time, pair, and lineage mappings across RUL, digital twins, and accelerated life", "research/reproducibility/rc56-landmark-source-connection-evidence.json", "JSON"),
      artifact("RC56 연구 기록", "RC56 research record", "살아남은 signal, 실패 gate, 불확실성, 다음 정확한 출발점을 보존", "Preserves surviving signals, failed gates, uncertainty, and the exact next starting point", "research/reproducibility/rc56-landmark-source-cycle-result.json", "JSON")
    ],
    log: [
      pair("Cyber-trust branch를 보류하고 RC55의 non-cyber battery 종료점에서 시작했다.", "Kept the cyber-trust branch deferred and started from RC55's non-cyber battery endpoint."),
      pair("Aurora의 원 논문·공식 Zenodo record·2.5 GB archive directory를 조사했다.", "Reviewed Aurora's primary paper, official Zenodo record, and 2.5 GB archive directory."),
      pair("Cycling data를 열기 전에 199개 metadata만 range-read해 exact LFP cohort를 찾았다.", "Range-read only 199 metadata files to identify an exact LFP cohort before opening cycling data."),
      pair("RWTH outcome-open method-development 계약에 여덟 capacity 후보와 60-pair gate를 고정했다.", "Fixed eight capacity candidates and a sixty-pair gate in the outcome-open RWTH method-development contract."),
      pair("R2·R3에서 C≥0.65 후보가 나왔지만 47 pair뿐이라 threshold를 낮추지 않았다.", "R2 and R3 produced candidates with C at least 0.65, but only 47 pairs remained and the threshold was not lowered."),
      pair("Python과 dependency-free Node가 candidate 없음에 독립적으로 합의했다.", "Python and dependency-free Node independently agreed that no candidate qualified."),
      pair("Paper 36 대 archive explicit LFP 32의 lineage gap을 발견해 target outcome을 닫았다.", "Found a lineage gap between 36 paper cells and 32 archive-explicit LFP records and kept target outcomes closed."),
      pair("다음 cycle을 official cohort manifest와 prospective endpoint pair-power 설계로 제한했다.", "Restricted the next cycle to an official cohort manifest and prospective endpoint pair-power design.")
    ],
    nextCycle: pair("RC57은 Aurora 저자·curator의 공식 36-cell manifest 또는 RO-Crate inclusion table을 outcome 없이 확보하고, 미래 same-condition 실험에서 blocked pair≥100을 만드는 50-cycle 또는 knee-triggered RPT schedule을 사전 simulation한다. 두 조건이 모두 충족될 때만 R3 normalized capacity level 하나를 새 target에 봉인한다. Lineage를 풀지 못하면 Aurora를 제외하고, pair budget을 만들지 못하면 capacity-only branch를 중단해 expansion·pressure·acoustic·multistep excitation 중 반복성이 검증된 한 센서로 이동한다.", "RC57 will obtain an official 36-cell Aurora manifest or RO-Crate inclusion table without outcomes and prospectively simulate a 50-cycle or knee-triggered RPT schedule yielding at least 100 blocked pairs in a future same-condition experiment. Only after both conditions pass will one R3 normalized capacity-level coordinate be sealed for a new target. If lineage cannot be resolved, Aurora will be excluded; if the pair budget cannot be achieved, the capacity-only branch will stop and move to one repeatability-qualified expansion, pressure, acoustic, or multistep-excitation sensor."),
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
