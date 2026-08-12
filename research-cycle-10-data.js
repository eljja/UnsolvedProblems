/* RC-2026-10: reproducibility floors and public-data sufficiency. */
(function () {
  "use strict";
  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    saxs_round_robin_2022: {
      discipline: "materials", title: "A round-robin approach provides a detailed assessment of biomolecular small-angle scattering data reproducibility and yields consensus curves for benchmarking", url: "https://doi.org/10.1107/S2059798322009184",
      evidenceLabel: "동료심사 16장비 국제 반복성 연구", evidenceLabelEn: "Peer-reviewed 16-instrument international reproducibility study", publishedOn: "2022-10-20",
      resultPeriod: "2022년 10월 출판 · SAXS 171개와 SANS 76개 프로파일", resultPeriodEn: "Published October 2022; 171 SAXS and 76 SANS profiles", reviewedOn: REVIEWED_ON
    },
    saxs_round_robin_supplement_2022: {
      discipline: "materials", title: "Supporting information: biomolecular small-angle scattering round robin", url: "https://journals.iucr.org/d/issues/2022/11/00/cb5140/cb5140sup1.pdf",
      evidenceLabel: "측정방식별 Rg 범위·표준편차 보충표", evidenceLabelEn: "Supplementary mode-specific Rg ranges and standard deviations", publishedOn: "2022-10-20",
      resultPeriod: "보충표 S3·S5·S7 · 12 SAXS와 4 SANS 장비", resultPeriodEn: "Supplementary Tables S3, S5, and S7; 12 SAXS and four SANS instruments", reviewedOn: REVIEWED_ON
    },
    santin_two_phase_2017: {
      discipline: "medicine", title: "A two-phase sampling survey for nonresponse and its paradata to correct nonresponse bias in a health surveillance survey", url: "https://doi.org/10.1016/j.respe.2016.10.059",
      evidenceLabel: "동료심사 확률 무응답 2단계 조사", evidenceLabelEn: "Peer-reviewed probability-sampled two-phase nonresponse survey", publishedOn: "2017-02-01",
      resultPeriod: "근로자 10,000명 · 무응답자 500명 확률하위표본", resultPeriodEn: "10,000 workers; probability subsample of 500 nonrespondents", reviewedOn: REVIEWED_ON
    },
    sante_two_phase_summary_2017: {
      discipline: "medicine", title: "Official summary: two-phase sampling survey for nonresponse", url: "https://www.santepubliquefrance.fr/docs/a-two-phase-sampling-survey-for-nonresponse-and-its-paradata-to-correct-nonresponse-bias-in-a-health-surveillance-survey",
      evidenceLabel: "Santé publique France 공식 연구요약", evidenceLabelEn: "Official Santé publique France research summary", publishedOn: "2017-02-01",
      resultPeriod: "초기 응답률 23.6% · 보완조사 응답률 62.6%", resultPeriodEn: "Initial response 23.6%; complementary-survey response 62.6%", reviewedOn: REVIEWED_ON
    },
    opxrd_dataset_2025: {
      discipline: "materials", title: "opXRD: Open Experimental Powder X-Ray Diffraction Database", url: "https://doi.org/10.5281/zenodo.15298026",
      evidenceLabel: "CC BY 4.0 실험 pXRD 공개자료", evidenceLabelEn: "CC BY 4.0 public experimental pXRD dataset", publishedOn: "2025-04-28",
      resultPeriod: "1.401 GB 공개 아카이브 · MD5 고정", resultPeriodEn: "1.401 GB public archive with fixed MD5", reviewedOn: REVIEWED_ON
    },
    opxrd_paper_2025: {
      discipline: "materials", title: "opXRD: Open Experimental Powder X-Ray Diffraction Database", url: "https://doi.org/10.1002/aidi.202500044",
      evidenceLabel: "동료심사 실험 회절 데이터베이스 논문", evidenceLabelEn: "Peer-reviewed experimental diffraction database paper", publishedOn: "2025-06-20",
      resultPeriod: "92,552개 실험 패턴 · 최소 부분표지 2,179개", resultPeriodEn: "92,552 experimental patterns; 2,179 at least partially labeled", reviewedOn: REVIEWED_ON
    },
    stanford_spin_glass_data_2026: {
      discipline: "materials", title: "Data for A Mosaic Layered Halide-Perovskite Spin Glass", url: "https://doi.org/10.25740/xb532rx3275",
      evidenceLabel: "Stanford 공개 파생 산란자료", evidenceLabelEn: "Stanford public derived scattering dataset", publishedOn: "2026-06-23",
      resultPeriod: "2026년 6월 공개 · Fig2C G(r) 단일 파일", resultPeriodEn: "Released June 2026; one derived Fig2C G(r) file", reviewedOn: REVIEWED_ON
    },
    acs_spin_glass_2026: {
      discipline: "materials", title: "A Mosaic Layered Halide-Perovskite Spin Glass: Mechanochemical Alloying of a Ferromagnet and a Paramagnet", url: "https://doi.org/10.1021/acscentsci.6c00194",
      evidenceLabel: "동료심사 반복 총산란 획득 연구", evidenceLabelEn: "Peer-reviewed repeated total-scattering acquisition study", publishedOn: "2026-06-24",
      resultPeriod: "시료 위치 3곳×10회 스캔 · 공개자료 범위 별도 감사", resultPeriodEn: "Three sample positions by ten scans; public-data scope separately audited", reviewedOn: REVIEWED_ON
    }
  });

  const scatteringSources = ["saxs_round_robin_2022", "saxs_round_robin_supplement_2022", "nist_vo2_dataset_2020", "opxrd_dataset_2025"];
  const ledgerSources = ["opxrd_dataset_2025", "opxrd_paper_2025", "stanford_spin_glass_data_2026", "acs_spin_glass_2026", "fair_data_2016"];
  const twoPhaseSources = ["santin_two_phase_2017", "sante_two_phase_summary_2017", "imbens_manski_2004", "jds_shadow_mnar_2024"];
  const records = {
    "UP-182": {
      role: pair("능동 재료탐색의 분해능이 실제 다기관 계측 반복성보다 작은지 판정하는 문제", "Problem adjudicating whether active materials-search resolution is smaller than real multi-instrument reproducibility"),
      updatedDefinition: pair("탐색정책이 계산상 경계를 좁혀도 서로 다른 장비·시료 준비·분석법이 같은 조건에서 그보다 큰 변동을 만들면 새 상을 구별한 것이 아니다. 국제 SAXS/SANS 라운드로빈의 다섯 단백질을 이용해 측정방식별 Rg 표준편차를 두 독립 측정의 약 95% 재현한계로 바꾸고, RC09의 경계정제보다 먼저 통과해야 할 물리 분해능 관문을 만들었다.", "A search policy has not distinguished a new phase if different instruments, specimen preparations, and reductions vary more than the computationally narrowed boundary under the same condition. Using five proteins from the international SAXS/SANS round robin, we converted mode-specific Rg standard deviations into approximate 95% limits for the difference between two independent measurements, creating a physical-resolution gate that must precede RC09 boundary refinement."),
      knownBoundary: pair("SAXS 171개와 SANS 76개, 합계 247개 프로파일이 12개 SAXS·4개 SANS 장비에서 수집됐다. 보충표의 범위와 표준편차로 계산한 상대 재현한계 중앙값은 SAXS 4.497%, SANS 7.886%였고 최대값은 각각 14.337%, 17.555%였다. 이는 원곡선 재분석이 아니라 공개 집계의 정규·등분산 진단값이다.", "The campaign collected 171 SAXS and 76 SANS profiles, 247 total, on 12 SAXS and four SANS instruments. Approximate relative reproducibility-limit medians calculated from reported ranges and standard deviations were 4.497% for SAXS and 7.886% for SANS, with maxima 14.337% and 17.555%. These are normal-homoscedastic diagnostics from public aggregates, not reanalysis of individual curves."),
      bottleneck: pair("SEC-SAXS는 10개 단백질–Rg 추정량 비교 중 9개에서 배치측정보다 표준편차가 작았지만 urate oxidase의 Guinier Rg에서는 0.53 Å에서 0.66 Å로 커졌다. 시료 이질성 제거는 강한 기본전략이지만 보편법칙이 아니며, 물리 반복성 바닥은 시료·모드·판정량별로 봉인해야 한다.", "SEC-SAXS had lower standard deviation than batch measurement in nine of ten protein-estimator comparisons, but urate-oxidase Guinier Rg increased from 0.53 to 0.66 A. Removing sample heterogeneity is a strong default, not a universal law; the physical reproducibility floor must be sealed separately for each specimen, mode, and adjudicand."),
      minimumAdvance: pair("새 후보점과 기준점을 같은 날·다른 날, 같은 장비·다른 장비, 같은 제조분취·독립 제조분취로 반복해 분산성분을 분리한다. 예측된 효과가 해당 조건의 1.96√2σ 관문을 넘고, 독립 반복에서도 경계 방향이 유지될 때만 정보이득으로 계산한다.", "Repeat each candidate and control across same versus different days, instruments, and aliquots versus independent preparations to separate variance components. Count a predicted effect as information gain only when it exceeds the condition-specific 1.96-sqrt(2)-sigma gate and preserves boundary direction in independent repeats."),
      decisiveTest: pair("NIST Nb-VO₂의 49개 독립판정 경계점과 조성·온도가 가까운 49개 비경계점을 짝짓고, 제조 2회×계측 조건 2개×반복 3회의 봉인 XRD를 얻는다. 12+4가 물리 반복을 포함한 최소 경계정확도 0.5와 최대공백 관문을 함께 잃으면 능동정책 이전을 중단한다.", "Pair the 49 independently adjudicated NIST Nb-VO2 boundary points with 49 nearby non-boundary controls and acquire sealed XRD with two preparations, two measurement conditions, and three repeats. Stop transfer of 12+4 if it loses either minimum boundary accuracy 0.5 or the maximum-gap gate after physical repeats are included."),
      unresolved: pair("SAXS/SANS 단백질 Rg의 수치를 조성–온도 pXRD에 그대로 옮길 수 없다. 공개 보충표에는 개별 곡선이 없어 장비·제조·환원 알고리즘 분산을 분해할 수 없고, 현재 결과는 반복실험 설계의 관문 형식만 이전한다.", "Protein Rg values from SAXS/SANS cannot be numerically transferred to composition-temperature pXRD. The public tables lack individual curves needed to separate instrument, preparation, and reduction-algorithm variance, so this result transfers only the gate structure for a repeat experiment."),
      hypotheses: [
        { code: "H1", claim: pair("SEC 측정은 모든 시료와 Rg 추정법에서 배치측정보다 재현성이 높다.", "SEC measurement is more reproducible than batch measurement for every specimen and Rg estimator."), prediction: pair("10개 비교 모두 SEC 표준편차가 배치보다 작다.", "SEC standard deviation is lower than batch in all ten comparisons."), reject: pair("9/10만 성립했고 urate oxidase Guinier에서 0.66>0.53 Å여서 보편명제를 기각했다.", "Only 9/10 held; urate-oxidase Guinier gave 0.66 > 0.53 A, rejecting the universal claim.") },
        { code: "H2", claim: pair("SEC를 기본으로 쓰되 시료별 예외를 봉인하면 물리잡음 예산을 줄일 수 있다.", "Using SEC by default while sealing specimen-specific exceptions can reduce the physical-noise budget."), prediction: pair("최소 8/10에서 표준편차가 줄고 예외가 특정 시료–판정량으로 국한된다.", "Standard deviation falls in at least 8/10 comparisons and exceptions are localized to named specimen-adjudicand pairs."), reject: pair("9/10 감소와 단일 예외가 확인돼 집계자료 범위에서 살아남았다.", "Nine reductions and one localized exception sustain the claim within the aggregate-data scope.") },
        { code: "H3", claim: pair("SAXS 반복한계 수치를 NIST pXRD 경계의 효과크기 관문으로 그대로 사용한다.", "SAXS reproducibility-limit values can be used directly as effect-size gates for NIST pXRD boundaries."), prediction: pair("같은 시료·기법·좌표 반복으로 두 자료의 분산척도 이동성이 입증된다.", "Transferability of variance scales is demonstrated with repeats matching specimen, technique, and coordinate."), reject: pair("기법과 시료가 다르고 NIST 좌표 반복이 없어 수치 이전을 기각했다.", "Technique and specimens differ and NIST lacks coordinate repeats, so numerical transfer was rejected.") }
      ], sourceIds: scatteringSources
    },
    "UP-185": {
      role: pair("대규모 공개 계측자료가 동일 시료 반복을 실제로 식별할 수 있는지 감사하는 문제", "Problem auditing whether a large public measurement collection can actually identify same-specimen repeats"),
      updatedDefinition: pair("실패·음성 결과를 학습하려면 값뿐 아니라 어떤 시료를 어떤 조건에서 몇 번째로 측정했는지가 남아야 한다. opXRD는 92,552개 실험 패턴을 모았지만 공개 인터페이스에 표준 동일시료 반복키가 문서화되지 않았고 처리기는 원 파일명을 제거한다. 2026년 총산란 연구는 시료당 30스캔을 보고했지만 연결 저장소에는 평균화된 G(r) 한 파일만 공개했다.", "Learning from failed and negative results requires not only values but identity of the specimen, condition, and repeat. opXRD collects 92,552 experimental patterns, yet its public interface documents no canonical same-specimen repeat key and its processor removes source filenames. A 2026 total-scattering study reports 30 scans per capillary, while the linked repository exposes only one derived G(r) file."),
      knownBoundary: pair("opXRD 최신 공개 아카이브는 1,400,997,733바이트, MD5 e8e980…이며 2,179개가 최소 부분표지됐다. Stanford 기록의 IIIF 목록은 303,510바이트 Fig2C_xpdf_data.txt 한 개로, 두 시료의 r와 G(r) 열만 담는다. 패턴 수와 반복 획득 보고만으로 원 반복을 재구성할 수 없다.", "The current opXRD archive is 1,400,997,733 bytes with MD5 e8e980..., and 2,179 patterns are at least partially labeled. The Stanford IIIF record lists one 303,510-byte Fig2C_xpdf_data.txt containing r and G(r) columns for two samples. Pattern count and a reported repeat protocol do not reconstruct individual repeats."),
      bottleneck: pair("파일명을 제거하면 개인정보·기관별 혼란을 줄일 수 있지만 시료 계보까지 사라지면 반복성, 누락, 선택편향을 판정할 수 없다. 원장에는 공개용 가명 시료ID, 제조배치, 계측세션, 반복번호, 환원버전과 제외사유가 함께 있어야 한다.", "Removing filenames can reduce disclosure and institution-specific clutter, but losing specimen lineage prevents adjudication of repeatability, missingness, and selection. A ledger needs pseudonymous specimen ID, preparation batch, measurement session, repeat number, reduction version, and exclusion reason together."),
      minimumAdvance: pair("기존 패턴은 내용 해시와 기여기관만으로 반복을 추측하지 말고 ‘반복 미확인’으로 둔다. 앞으로 수집되는 자료에는 원신호 해시와 가명 시료·분취·세션 계보를 분리 저장하고, 공개 전 삭제된 필드와 그로 인해 불가능해진 판정을 데이터카드에 명시한다.", "Do not infer repeats in existing patterns from content hashes and contributor alone; mark them unverified. For future data, store raw-signal hashes separately from pseudonymous specimen, aliquot, and session lineage, and state in the data card which fields were removed and which adjudications that prevents."),
      decisiveTest: pair("같은 시료의 3반복, 독립 제조 3반복, 다른 시료 3개를 섞은 봉인자료에서 계보키만으로 세 집단을 완전 복원하고, 값 기반 군집은 판정에 사용하지 않는다. 키 제거 후 반복성 분산 추정이 달라지면 해당 필드를 필수 원장으로 승격한다.", "In a sealed set mixing three repeats of one specimen, three independent preparations, and three distinct specimens, recover all groups using lineage keys alone and never use value clustering for adjudication. If deleting the keys changes repeatability variance estimates, promote those fields to the required ledger."),
      unresolved: pair("opXRD 1.4GB 원 아카이브 전체의 모든 내부 객체를 이 사이클에서 재검사하지 않았으므로 반복키가 절대 없다고 단정하지 않는다. 판정은 공식 논문·공개 처리코드·문서화된 인터페이스에서 표준키를 찾지 못했다는 범위다.", "This cycle did not reinspect every object in the 1.4 GB opXRD archive, so it does not claim that no replicate key exists anywhere. The adjudication is limited to not locating a canonical key in the paper, public processor, or documented interface."),
      hypotheses: [
        { code: "H1", claim: pair("대형 공개 회절 컬렉션은 패턴 수만으로 물리 반복성 추정에 충분하다.", "A large public diffraction collection is sufficient for physical repeatability estimation by pattern count alone."), prediction: pair("동일 시료·조건·반복을 표준키로 그룹화할 수 있다.", "Same specimen, condition, and repeat can be grouped by a canonical key."), reject: pair("opXRD 공개 문서·처리코드에서 그 키를 찾지 못해 현재 인터페이스에 대해서 기각했다.", "No such key was located in opXRD public documentation or processing code, rejecting the claim for the current interface.") },
        { code: "H2", claim: pair("논문이 반복 획득을 보고하면 연결 공개자료도 개별 반복을 보존한다.", "If an article reports repeated acquisition, its linked public data preserve the individual repeats."), prediction: pair("3위치×10스캔의 원 또는 개별 환원파일이 공개 목록에 있다.", "Raw or individually reduced files for three positions by ten scans appear in the public record."), reject: pair("공개 목록은 파생 G(r) 한 파일뿐이어서 기각했다.", "The public record lists one derived G(r) file, rejecting the claim.") },
        { code: "H3", claim: pair("가명 계보키를 값과 분리하면 공개성과 반복성 판정을 함께 보존할 수 있다.", "Separating pseudonymous lineage keys from values can preserve both public access and repeatability adjudication."), prediction: pair("봉인 혼합자료에서 키만으로 반복·독립제조·다른시료를 복원하고 민감정보는 공개하지 않는다.", "Keys alone recover repeats, independent preparations, and distinct specimens in a sealed mixture without releasing sensitive identity."), reject: pair("아직 전향적 봉인자료가 없어 미판정이며 다음 원장 시험으로 유지한다.", "No prospective sealed dataset exists yet, so the claim remains unadjudicated for the next ledger test.") }
      ], sourceIds: ledgerSources
    },
    "UP-195": {
      role: pair("비파괴 구조측정이 계산 분해능뿐 아니라 장비·준비·환원 변화에도 같은 결론을 내는지 판정하는 문제", "Problem adjudicating whether nondestructive structure measurement survives instrument, preparation, and reduction changes, not just nominal resolution"),
      updatedDefinition: pair("매몰 계면을 더 선명하게 보았다는 주장은 같은 시료를 다른 장비와 분석 파이프라인으로 측정해도 구조 파라미터 차이가 반복성 바닥을 넘어야 성립한다. SAXS/SANS 라운드로빈은 동일 배치에서조차 Rg 분산이 측정모드·단백질·용매·추정법에 따라 달라졌음을 보여 주며, 단일 장비 오차막대가 전체 재현성을 대표하지 못함을 정량화한다.", "A claim of sharper imaging of a buried interface is credible only if structural-parameter differences exceed the reproducibility floor when the same specimen is measured on other instruments and reduction pipelines. The SAXS/SANS round robin shows that even a shared batch has Rg dispersion that changes with mode, protein, solvent, and estimator, quantifying why a single-instrument error bar does not represent full reproducibility."),
      knownBoundary: pair("SEC-SAXS의 표준편차 감소는 9/10이었지만 합친 SAXS 집합이 배치와 SEC 중 더 작은 표준편차 이하인 경우는 7/10뿐이었다. RNase A Guinier와 xylose isomerase 두 추정량에서는 합의 집합이 최선 단일모드보다 나빴다. 더 많이 합치는 것과 더 정확히 판정하는 것은 동일하지 않다.", "SEC-SAXS reduced standard deviation in 9/10 comparisons, but the combined SAXS set was no worse than the better of batch and SEC in only 7/10. For RNase A Guinier and both xylose-isomerase estimators, the combined set was worse than the best single mode. Pooling more measurements is not equivalent to adjudicating more accurately."),
      bottleneck: pair("공개 표는 최종 Rg의 범위와 표준편차만 제공해 장비, 시료준비, 배경빼기, 절대스케일, 모형선택의 분산을 분리하지 못한다. 계면 구조의 참 변화와 분석 파이프라인 이동을 구분하려면 동일 원프레임을 독립 파이프라인에 교차시키고 독립 시료 반복도 별도로 둬야 한다.", "The public tables provide only final Rg ranges and standard deviations, so instrument, preparation, background subtraction, absolute scaling, and model-selection variance cannot be separated. Distinguishing real interface change from pipeline shift requires crossing the same raw frames through independent reductions while retaining separate specimen repeats."),
      minimumAdvance: pair("하나의 기준시료에 대해 원프레임 반복, 재장착 반복, 독립 제조, 다기관 측정을 중첩 설계하고 구조 파라미터의 분산성분과 95% 재현한계를 공개한다. 제안한 새 구조변화가 그 관문을 넘지 못하면 분해능 향상이 아니라 미판정으로 기록한다.", "Use a nested reference-specimen design with repeated raw frames, remounts, independent preparations, and multiple facilities, and publish variance components plus the 95% reproducibility limit for structural parameters. If a proposed structural change does not cross that gate, record it as unadjudicated rather than improved resolution."),
      decisiveTest: pair("기준시료와 경계에 가까운 계면시료를 두 기관에 맹검 배분하고 각 기관이 자체 환원과 공통 환원을 모두 수행한다. 기관×환원 상호작용을 제외한 뒤에도 사전 지정 구조량의 차이가 재현한계를 넘고 방향이 같아야 새 계면구조를 인정한다.", "Blindly distribute a reference and near-boundary interface specimen to two facilities, each performing both its local reduction and a common reduction. Recognize a new interface structure only if the preregistered structural quantity exceeds the reproducibility limit with the same direction after accounting for facility-by-reduction interaction."),
      unresolved: pair("단백질 용액의 SAXS Rg는 고체 매몰계면의 3차원 조성·변형장과 다른 관측량이다. 여기서 확인한 것은 수치가 아니라 다기관 봉인, 측정모드 예외, 합의집합 비우월의 검증 구조다.", "Protein-solution SAXS Rg is not the same observable as three-dimensional composition and strain at a buried solid interface. What transfers is not the number but the validation structure: multi-facility sealing, mode-specific exceptions, and refusal to assume pooled consensus is superior."),
      hypotheses: [
        { code: "H1", claim: pair("여러 장비 결과를 합치면 항상 가장 재현성 높은 구조량을 얻는다.", "Combining results from multiple instruments always yields the most reproducible structural quantity."), prediction: pair("합친 표준편차가 10/10에서 최선 단일모드 이하이다.", "Combined standard deviation is no larger than the best single mode in all 10/10 comparisons."), reject: pair("7/10만 성립해 보편명제를 기각했다.", "Only 7/10 comparisons met the condition, rejecting the universal claim.") },
        { code: "H2", claim: pair("시료 이질성 제거와 모드별 봉인이 다기관 분산의 주요 부분을 줄인다.", "Removing specimen heterogeneity and sealing each mode reduces a major component of multi-facility dispersion."), prediction: pair("SEC가 대다수 판정량에서 배치보다 작되 명시적 예외가 남는다.", "SEC is lower than batch for most adjudicands while explicit exceptions remain."), reject: pair("9/10 감소와 urate oxidase 예외로 조건부 명제가 살아남았다.", "Nine reductions plus the urate-oxidase exception sustain the conditional claim.") },
        { code: "H3", claim: pair("공통 원프레임×독립 환원 교차설계가 장비와 분석 오차를 분리한다.", "Crossing common raw frames with independent reductions separates instrument and analysis error."), prediction: pair("동일 프레임 환원차와 독립시료 측정차의 분산성분이 식별된다.", "Variance components for same-frame reduction differences and independent-specimen measurement differences are identifiable."), reject: pair("현재 집계표에는 원프레임과 중첩 식별자가 없어 미판정이다.", "The current aggregate tables lack raw frames and nested identifiers, leaving the claim unadjudicated.") }
      ], sourceIds: ["saxs_round_robin_2022", "saxs_round_robin_supplement_2022", "acs_spin_glass_2026", "stanford_spin_glass_data_2026"]
    },
    "UP-629": {
      role: pair("정확한 2단계 확률설계가 있어도 불완전 재응답 때문에 MNAR가 남는지 판정하는 문제", "Problem adjudicating whether MNAR remains after a correct two-phase probability design because re-response is incomplete"),
      updatedDefinition: pair("프랑스 Coset-MSA는 10,000명 확률표본에서 초기 응답률 23.6%를 얻고 무응답자 500명을 무작위 추출해 집중 보완조사를 했다. 보완 응답률은 62.6%였으며 9,358명에는 행정변수가 있었다. 이는 RC09 PLOS 자료에 없던 2단계 설계 골격을 갖추지만, 2단계 응답이 100%가 아니므로 목표 건강결과의 MNAR는 자동으로 사라지지 않는다.", "French Coset-MSA drew a probability sample of 10,000, obtained 23.6% initial response, and randomly selected 500 nonrespondents for intensive complementary follow-up. Complementary response was 62.6%, with administrative variables available for 9,358. This supplies the two-phase design skeleton missing from the RC09 PLOS data, but incomplete second-stage response does not automatically remove MNAR for the target health outcome."),
      knownBoundary: pair("공개 논문은 최초 프레임, 층화변수, 무응답 하위표본 수, 응답률과 전원 행정 비교틀을 보고한다. 그러나 참가자별 초대·확률·응답·동일 건강결과 표를 공개자료에서 찾지 못해 약 2,360명 초기응답과 313명 보완응답 이상의 결과별 2×2표를 재현할 수 없었다.", "The publication reports the initial frame, stratifiers, nonrespondent subsample size, response rates, and an administrative comparison frame. Participant-level invitation, probability, response, and same-health-outcome tables were not located publicly, so outcome-specific 2x2 tables cannot be reproduced beyond approximately 2,360 initial and 313 complementary respondents."),
      bottleneck: pair("확률로 초대했다는 사실은 초대 후 37.4% 비응답의 결과분포를 알려주지 않는다. 행정변수는 비응답 편향을 독립 감사할 수 있지만 조사 건강결과와 동일하지 않으면 그 결과의 Γ를 점식별하지 못한다.", "Probability invitation does not reveal the outcome distribution among the 37.4% who still did not respond. Administrative variables can independently audit nonresponse bias, but they do not point-identify Gamma for a survey health outcome unless they measure that same outcome."),
      minimumAdvance: pair("공개·통제접근 여부와 관계없이 분석 산출물에는 최초응답, 2단계 초대, 2단계 응답과 독립 행정결과를 목표 층별 네 셀로 집계하고 초대확률을 함께 내보낸다. 동일결과가 없으면 행정변수별 편향 감사와 목표결과 민감도 Γ를 분리한다.", "Whether access is public or controlled, analysis outputs should tabulate initial response, second-stage invitation, second-stage response, and independent administrative outcome into four cells per target stratum with invitation probabilities. If the same outcome is unavailable, separate administrative-variable bias audits from target-outcome Gamma sensitivity."),
      decisiveTest: pair("Coset와 동형인 접근가능 자료에서 완전 풀링·층별·부분풀링 Γ를 계산하고 한 행정결과를 개발에서 제외해 홀드아웃 포함률을 판정한다. 층별 영지지 또는 명목 95% 미달이 나오면 유한 전체 Γ를 사용하지 않는다.", "In an accessible dataset isomorphic to Coset, compute complete-pooling, stratified, and partial-pooling Gamma and reserve one administrative outcome from development for held-out coverage. Do not use finite pooled Gamma if any stratum has zero support or coverage falls below nominal 95%."),
      unresolved: pair("논문 집계만으로는 결과별 영지지가 실제로 반복됐는지 판정할 수 없다. 이번 사이클은 설계가 충분하다는 사실과 공개 집계가 목표 Γ 판정에 부족하다는 사실을 동시에 보존하며, 비공개 자료에 대해 부재를 주장하지 않는다.", "Published aggregates cannot adjudicate whether outcome-specific zero support actually recurs. This cycle preserves both that the design skeleton is sufficient and that public aggregates are insufficient for target-Gamma adjudication; it makes no absence claim about controlled data."),
      hypotheses: [
        { code: "H1", claim: pair("무응답자 확률하위표본만 있으면 초기 비응답 편향이 제거된다.", "A probability subsample of nonrespondents alone removes initial nonresponse bias."), prediction: pair("보완조사 응답률이 100%이거나 잔여 비응답의 동일결과가 독립원에 있다.", "Complementary response is 100%, or the same outcome is independently available for remaining nonrespondents."), reject: pair("응답률 62.6%이고 동일 조사결과 공개표가 없어 보편명제를 기각했다.", "Response was 62.6% and no public same-survey-outcome table was located, rejecting the universal claim.") },
        { code: "H2", claim: pair("전원 행정자료는 2단계 보정의 외부 포함률을 판정할 수 있다.", "Administrative data on the analysis frame can adjudicate external coverage of two-phase adjustment."), prediction: pair("보정에 쓰지 않은 행정결과의 참 집계와 조사 추정구간을 비교할 수 있다.", "A held-out administrative outcome total can be compared with the survey-adjusted interval."), reject: pair("논문은 행정변수로 상대오차를 비교해 설계 수준에서 지지하지만 공개 미시자료 재현은 남았다.", "The paper's administrative relative-error comparison supports the design-level claim, while public microdata reproduction remains pending.") },
        { code: "H3", claim: pair("공개 집계만으로 목표 건강결과의 2단계 Γ를 보정할 수 있다.", "Published aggregates alone calibrate second-stage Gamma for the target health outcome."), prediction: pair("목표 층별 초대·응답·동일결과 네 셀과 초대확률이 공개된다.", "Invitation, response, same-outcome four-cell tables and invitation probabilities are public for each target stratum."), reject: pair("필요 표를 찾지 못해 현재 공개 범위에서 기각했다.", "The required tables were not located, rejecting the claim within the public scope.") }
      ], sourceIds: twoPhaseSources
    }
  };

  const sealConnection = {
    id: "CONN-SEAL-001", problemIds: ["UP-182", "UP-185", "UP-195", "UP-629"], strength: "strong", status: "tested-aggregate",
    type: pair("판정 분해능을 제한하는 독립 반복성 봉인", "Independent reproducibility seal limiting adjudication resolution"),
    sharedBottleneck: pair("예측·측정·복구 결과의 명목 오차가 작아도 다른 장비·준비·응답경로에서 같은 대상이 더 크게 흔들리면 그보다 작은 효과와 경계를 식별할 수 없다.", "Even with small nominal prediction, measurement, or rescue error, effects and boundaries smaller than the variation of the same target across instruments, preparations, or response paths are not identifiable."),
    mapping: pair("재료 후보점↔계면시료↔조사 대상자, XRD/SAS 반복↔독립 계측↔2단계 재접촉, 상경계 효과↔구조량 차이↔건강결과 차이, 재현한계↔부분식별폭이 대응한다.", "Materials candidate maps to interface specimen and survey subject; XRD/SAS repeat to independent measurement and second-stage recontact; phase-boundary effect to structural-quantity and health-outcome difference; reproducibility limit to partial-identification width."),
    transferableMethod: pair("개발자료와 독립 반복자료를 분리하고 조건별 1.96√2σ 또는 정확 부분식별폭을 최소 판정효과로 고정한다. 반복키나 동일결과가 없으면 수치를 추정하지 않고 미판정으로 둔다.", "Separate development from independent repeats and freeze condition-specific 1.96-sqrt(2)-sigma or exact partial-identification width as the minimum adjudicable effect. Without repeat keys or the same outcome, do not estimate the number and leave the claim unadjudicated."),
    evidence: pair("SAXS 재현한계가 모드·시료별로 달랐고 SEC 보편명제와 합의집합 보편우월성이 각각 1/10, 3/10 반례로 기각됐다. Coset는 올바른 확률하위표본 뒤에도 37.4% 재비응답이 남았다.", "SAXS reproducibility limits varied by mode and specimen; universal SEC improvement and universal pooled-consensus superiority were rejected by 1/10 and 3/10 counterexamples. Coset retained 37.4% re-nonresponse after correct probability subsampling."),
    validationStatus: pair("공개 집계 재계산·독립 코드 검증 완료 · 원곡선·참가자수준 외부검증 대기", "Public aggregates recomputed and independently code-verified; awaiting raw-curve and participant-level external validation"),
    failureBoundary: pair("같은 대상의 독립 반복분산이 효과보다 충분히 작고 조건 이동 뒤에도 동질하면 봉인이 비활성일 수 있다. 시간변화가 실제 신호인 계에서는 반복을 교환가능 표본으로 취급하면 안 된다.", "The seal may be inactive when independent-repeat variance is well below the effect and remains homogeneous after transport. Repeats are not exchangeable when temporal evolution is itself the signal."),
    minimumTest: pair("각 분야에서 하나의 기준대상과 하나의 경계대상을 독립 장비·준비·응답경로에 교차 배치한다. 개발에 쓰지 않은 반복에서 효과가 사전 재현한계를 넘고 방향이 일치할 때만 연결을 유지한다.", "Cross one reference and one boundary target over independent instruments, preparations, or response paths in each field. Retain the connection only when the effect crosses the preregistered reproducibility limit with the same direction in repeats excluded from development."),
    sourceIds: ["saxs_round_robin_supplement_2022", "santin_two_phase_2017", "opxrd_dataset_2025", "stanford_spin_glass_data_2026"]
  };
  if (!connections.some(({ id }) => id === sealConnection.id)) connections.push(sealConnection);

  const cycle = {
    id: "RC-2026-10", title: "해결의 분해능은 반복성 바닥보다 클 수 있는가", titleEn: "Can resolution of a solution exceed its reproducibility floor?", status: "active", startedOn: REVIEWED_ON, reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records), connectionIds: ["CONN-SEAL-001", "CONN-STRAT-001", "CONN-FLOOR-001"],
    selectionReason: "RC09가 남긴 두 공백을 실제 외부자료로 추적했다. 국제 16장비 산란 라운드로빈은 물리 반복성 바닥을 수치화했고, 프랑스 2단계 조사는 올바른 확률 재접촉 뒤에도 남는 비응답을 보여 줬다. opXRD와 2026 Stanford 기록은 대규모 공개나 반복 획득 보고만으로 개별 반복 계보가 보존되지 않음을 판정하는 최신 대조군으로 사용했다.",
    selectionReasonEn: "This cycle followed the two gaps left by RC09 into external data. An international 16-instrument scattering round robin quantified physical reproducibility floors, while a French two-phase survey showed residual nonresponse after correct probability recontact. opXRD and a 2026 Stanford record served as current controls demonstrating that large public collections or reported repeat acquisition do not by themselves preserve individual-repeat lineage.",
    verifiedFindings: [
      { text: "국제 라운드로빈의 SAXS 171개와 SANS 76개, 합계 247개 프로파일 분모를 재구성했다.", textEn: "Reconciled 171 SAXS and 76 SANS profiles, 247 total, in the international round robin.", sourceIds: ["saxs_round_robin_2022", "saxs_round_robin_supplement_2022"] },
      { text: "SEC-SAXS 표준편차는 10개 비교 중 9개에서 감소했지만 urate oxidase Guinier에서 0.53→0.66 Å로 증가해 보편명제를 기각했다.", textEn: "SEC-SAXS standard deviation fell in 9/10 comparisons but rose from 0.53 to 0.66 A for urate-oxidase Guinier, rejecting the universal claim.", sourceIds: ["saxs_round_robin_supplement_2022"] },
      { text: "합친 SAXS 집합이 최선 단일모드 이하인 경우는 7/10뿐이었다. 상대 재현한계 중앙값은 SAXS 4.497%, SANS 7.886%였다.", textEn: "The combined SAXS set was no worse than the best single mode in only 7/10 comparisons. Median relative reproducibility limits were 4.497% for SAXS and 7.886% for SANS.", sourceIds: ["saxs_round_robin_supplement_2022"] },
      { text: "Coset-MSA는 10,000명→초기응답 23.6%→무응답자 500명 무작위추출→보완응답 62.6%와 9,358명 행정자료를 보고했다.", textEn: "Coset-MSA reported 10,000 sampled, 23.6% initial response, 500 randomly sampled nonrespondents, 62.6% complementary response, and administrative data for 9,358.", sourceIds: ["santin_two_phase_2017", "sante_two_phase_summary_2017"] },
      { text: "Coset의 2단계 설계 골격은 적합하지만 공개 집계에는 목표결과별 초대·응답 네 셀이 없어 Γ를 보정할 수 없었다.", textEn: "Coset has the correct two-phase design skeleton, but public aggregates lack target-outcome invitation-response cells needed to calibrate Gamma.", sourceIds: ["santin_two_phase_2017", "imbens_manski_2004"] },
      { text: "opXRD 공개 인터페이스에서 표준 동일시료 반복키를 찾지 못했고, 30스캔을 보고한 2026 연구의 공개 기록에는 파생 G(r) 한 파일만 있었다.", textEn: "No canonical same-specimen repeat key was located in the opXRD public interface, and the public record for a 2026 study reporting 30 scans exposed only one derived G(r) file.", sourceIds: ["opxrd_dataset_2025", "opxrd_paper_2025", "stanford_spin_glass_data_2026", "acs_spin_glass_2026"] }
    ],
    resultMatrix: {
      title: pair("반복성 봉인·공개자료 충분성 판정", "Reproducibility seal and public-data sufficiency adjudication"),
      note: pair("1.96√2σ는 공개 표준편차를 사용한 정규·등분산 진단값이며 원자료 신뢰구간이 아니다. 기법이 다른 pXRD에는 수치를 이전하지 않는다.", "The 1.96-sqrt(2)-sigma quantity is a normal-homoscedastic diagnostic from published standard deviations, not a raw-data confidence interval. Values are not transferred to pXRD."),
      columns: [pair("시험", "Test"), pair("분모", "Denominator"), pair("결과", "Result"), pair("반례·제약", "Counterexample or restriction"), pair("판정", "Decision")],
      rows: [
        { label: pair("산란 라운드로빈", "Scattering round robin"), values: ["12 SAXS + 4 SANS", "247 profiles", "5 proteins", pair("집계표", "Aggregate tables")] },
        { label: pair("SEC 감소", "SEC reduction"), values: ["10 comparisons", "9 wins", "0.53→0.66 Å", pair("조건부 채택", "Conditional adoption")] },
        { label: pair("합의집합", "Combined consensus"), values: ["10 comparisons", "7 best/tied", "3 failures", pair("보편우월 기각", "Universal superiority rejected")] },
        { label: pair("SAXS 재현한계", "SAXS reproducibility limit"), values: ["30 mode cells", "median 4.497%", "max 14.337%", pair("모드별 봉인", "Seal by mode")] },
        { label: pair("SANS 재현한계", "SANS reproducibility limit"), values: ["20 solvent cells", "median 7.886%", "max 17.555%", pair("수치 이전 금지", "No numeric transfer")] },
        { label: pair("Coset 2단계", "Coset two phase"), values: ["10,000→500", "62.6% re-response", "9,358 admin", pair("Γ 미식별", "Gamma unidentified")] },
        { label: pair("opXRD 계보", "opXRD lineage"), values: ["92,552 patterns", "2,179 labeled", pair("표준 반복키 미확인", "No canonical repeat key located"), pair("반복 추론 거부", "Repeat inference refused")] },
        { label: pair("2026 총산란", "2026 total scattering"), values: ["3×10 scans", "1 public file", "derived G(r)", pair("분산분해 불가", "Variance decomposition unavailable")] }
      ]
    },
    sharedProgram: {
      name: pair("분해능–반복성 봉인 프로그램", "Resolution-reproducibility sealing program"),
      thesis: pair("해결 후보의 효과가 독립 장비·시료·응답경로에서 같은 대상이 흔들리는 폭보다 작으면 더 정교한 모형이나 탐색으로도 판정할 수 없다.", "If a candidate solution effect is smaller than the variation of the same target across independent instruments, specimens, or response paths, finer models or searches cannot adjudicate it."),
      design: pair("SAXS/SANS 표 S5·S7을 값 그대로 고정하고 모드별 상대σ와 1.96√2σ를 계산했다. Coset·opXRD·Stanford 자료는 필요한 반복·초대 계보필드가 공개되는지 별도 감사했다.", "Froze Tables S5 and S7 as published and calculated mode-specific relative sigma and 1.96-sqrt(2)-sigma. Separately audited whether Coset, opXRD, and Stanford data expose the required repeat or invitation lineage fields."),
      adjudication: pair("원곡선이나 참가자자료를 범위·표준편차와 응답률에서 재구성하지 않았다. 계산코드는 전사값과 분모, 예외, 수치이전 거부를 독립 검사한다.", "Did not reconstruct individual curves or participant data from ranges, standard deviations, or response rates. Independent code verifies transcribed values, denominators, exceptions, and refusal of numerical transfer."),
      primaryMetrics: pair("SEC/배치 σ비, 최선 단일모드 대비 합의집합, 상대 95% 재현한계, 2단계 응답잔여, 반복·초대 계보 완전성", "SEC-to-batch sigma ratio, combined versus best single mode, relative 95% reproducibility limit, residual second-stage nonresponse, and repeat/invitation lineage completeness"),
      successRule: pair("효과가 개발에 쓰지 않은 반복의 조건별 재현한계를 넘고 방향이 같으며, 선택·반복 계보가 완전할 때만 다음 해결고리로 진행한다.", "Proceed to the next solution link only when the effect crosses the condition-specific reproducibility limit in repeats excluded from development, preserves direction, and has complete selection and repeat lineage."),
      stopRule: pair("집계범위에서 개별자료를 합성하지 않고, 다른 기법의 σ를 수치 이전하지 않으며, 반복키 없는 유사패턴을 반복으로 간주하지 않는다.", "Do not synthesize individual data from aggregates, numerically transfer sigma across techniques, or treat similar patterns without lineage keys as repeats."),
      status: pair("집계 반복성 봉인·설계 충분성 감사 완료 · 원곡선 분산성분·pXRD 좌표반복 대기", "Aggregate reproducibility seal and design-sufficiency audit complete; awaiting raw-curve variance components and coordinate-level pXRD repeats")
    },
    artifacts: [
      { title: pair("산란 라운드로빈 전사표", "Scattering round-robin transcription"), description: pair("공식 보충표 S5·S7의 Rg 범위·표준편차와 247개 분모를 기계가독 형식으로 고정", "Freezes Rg ranges, standard deviations, and the 247-profile denominator from official Tables S5 and S7"), url: "research/reproducibility/scattering-round-robin-source.json", kind: "JSON" },
      { title: pair("반복성 봉인 규격", "Reproducibility-seal specification"), description: pair("중간값 대리·상대σ·두 독립측정 95% 관문과 반증조건을 사전 고정", "Preregisters midpoint proxy, relative sigma, two-measurement 95% gate, and falsification conditions"), url: "research/reproducibility/scattering-spec.json", kind: "JSON" },
      { title: pair("산란 반복성 결과", "Scattering reproducibility result"), description: pair("SEC 예외, 합의집합 실패와 시료·모드·용매별 재현한계를 계산", "Calculates SEC exceptions, pooled-consensus failures, and specimen-, mode-, and solvent-specific limits"), url: "research/reproducibility/scattering-result.json", kind: "JSON" },
      { title: pair("2단계 설계 충분성 감사", "Two-phase design sufficiency audit"), description: pair("10,000→500 설계, 잔여 비응답, 행정 비교틀과 공개 Γ 미식별을 구분", "Separates the 10,000-to-500 design, residual nonresponse, administrative audit frame, and public Gamma non-identification"), url: "research/external-audit/two-phase-design-2017/audit-result.json", kind: "JSON" },
      { title: pair("반복자료 공개성 감사", "Repeat-data availability audit"), description: pair("opXRD 반복키와 2026 총산란 개별스캔 공개 여부를 공식 저장소·코드 수준에서 판정", "Adjudicates opXRD repeat keys and 2026 total-scattering individual-scan availability from official repositories and code"), url: "research/external-audit/repeat-data-availability-2026/audit-result.json", kind: "JSON" },
      { title: pair("반복성 계산 실행기", "Reproducibility calculation runner"), description: pair("전사표에서 모든 σ비·재현한계·가설 판정을 재계산하는 의존성 없는 코드", "Dependency-free code recomputing every sigma ratio, reproducibility limit, and hypothesis decision"), url: "scripts/run-scattering-reproducibility.mjs", kind: "JavaScript" },
      { title: pair("RC10 독립 검증기", "RC10 independent verifier"), description: pair("분모·공식 예외·수식·공개자료 거부조건을 별도 구현으로 검사", "Separately verifies denominators, official exceptions, formulas, and public-data refusal conditions"), url: "scripts/verify-reproducibility-cycle.mjs", kind: "JavaScript" }
    ],
    log: [
      pair("RC09의 반복 pXRD와 동형 2단계 자료 요청을 원 논문·공식 저장소부터 조사했다.", "Investigated RC09's requests for replicate pXRD and an isomorphic two-phase dataset from primary papers and official repositories."),
      pair("opXRD는 대규모이지만 표준 반복키를 확인하지 못해 패턴 유사성으로 반복을 만들어내지 않았다.", "opXRD is large, but no canonical repeat key was confirmed, so no repeats were invented from pattern similarity."),
      pair("2026 연구의 30스캔 보고와 단일 파생 공개파일을 구분해 원반복성 추정을 거부했다.", "Distinguished the 2026 study's reported 30 scans from its single derived public file and refused raw-repeatability inference."),
      pair("국제 산란 보충표의 집계만 사용하고 개별 곡선을 범위와 σ에서 복원하지 않았다.", "Used only international scattering supplement aggregates and did not reconstruct individual curves from ranges and sigma."),
      pair("SEC 보편우월과 합의집합 보편우월을 각각 실제 반례로 기각하고 조건부 전략만 유지했다.", "Rejected universal SEC and pooled-consensus superiority with real counterexamples, retaining only conditional strategies."),
      pair("Coset를 올바른 2단계 설계의 양성대조로 인정하되 불완전 재응답과 공개 미시자료 공백을 분리했다.", "Accepted Coset as a positive control for correct two-phase design while separating incomplete re-response from the public microdata gap.")
    ],
    nextCycle: pair("SAS 라운드로빈 개별 프로파일 또는 동일 시료 다기관 원곡선이 공개된 자료를 찾아 장비·시료준비·환원 분산성분을 분리한다. 동시에 접근 가능한 2단계 무응답 자료에서 목표결과별 네 셀을 재현한다. 둘 중 먼저 원자료 관문을 통과한 쪽에서 개발과 독립판정을 봉인하고, NIST 49경계점×49대조점의 2제조×2계측×3반복 최소실험에 필요한 검정력과 중단규칙을 계산한다.", "Locate individual profiles from the SAS round robin or another same-specimen multi-facility raw-curve dataset to separate instrument, preparation, and reduction variance. In parallel, reproduce target-outcome four-cell tables in an accessible two-phase nonresponse dataset. Seal development and independent adjudication in whichever first passes the raw-data gate, then calculate power and stopping rules for a minimal NIST experiment with 49 boundary and 49 control points, two preparations, two measurement conditions, and three repeats."),
    sourceIds: ["saxs_round_robin_2022", "saxs_round_robin_supplement_2022", "santin_two_phase_2017", "sante_two_phase_summary_2017", "opxrd_dataset_2025", "opxrd_paper_2025", "stanford_spin_glass_data_2026", "acs_spin_glass_2026", "nist_vo2_dataset_2020", "imbens_manski_2004"]
  };

  for (const problem of problems) {
    const record = records[problem.id];
    if (!record) continue;
    const historicalRecord = { cycleId: cycle.id, ...record, reviewedOn: REVIEWED_ON };
    problem.researchHistory = [...(problem.researchHistory || []), historicalRecord];
    problem.cycleResearch = historicalRecord;
    problem.sourceIds = [...new Set([...(problem.sourceIds || []), ...record.sourceIds])];
  }
  for (const problem of problems) problem.researchConnections = connections.filter(connection => connection.problemIds.includes(problem.id)).map(connection => connection.id);
  cycles.push(cycle);
  window.RESEARCH_CYCLES = cycles;
  window.RESEARCH_CONNECTIONS = connections;
  window.RESEARCH_CYCLE_META = {
    ...(window.RESEARCH_CYCLE_META || {}), reviewedOn: REVIEWED_ON, cycles: cycles.length,
    curatedProblems: problems.filter(problem => problem.researchHistory?.length).length,
    researchRecords: problems.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0),
    connections: connections.length,
    factSources: (window.RESEARCH_CYCLE_META?.factSources || 0) + 8
  };
})();
