/* RC-2026-09: external public-data adjudication of rescue and boundary acquisition. */
(function () {
  "use strict";
  const problems = window.PROBLEMS || [];
  const sources = window.CATALOG_SOURCES || {};
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const REVIEWED_ON = "2026-08-12";
  const pair = (text, textEn) => ({ text, textEn });

  Object.assign(sources, {
    plos_followup_2019: {
      discipline: "medicine",
      title: "Randomized controlled comparison of cross-sectional survey approaches to optimize follow-up completeness in clinical studies",
      url: "https://doi.org/10.1371/journal.pone.0213822",
      evidenceLabel: "동료심사 무작위 추적연락·외부검증 연구",
      evidenceLabelEn: "Peer-reviewed randomized follow-up and external-validation study",
      publishedOn: "2019-03-21",
      resultPeriod: "PLOS ONE 2019년 3월 논문 · 혈관환자 728명",
      resultPeriodEn: "PLOS ONE paper published March 2019; 728 vascular patients",
      reviewedOn: REVIEWED_ON
    },
    figshare_followup_2019: {
      discipline: "medicine",
      title: "Public data for randomized follow-up completeness study",
      url: "https://plos.figshare.com/articles/dataset/7858442",
      evidenceLabel: "CC BY 4.0 환자수준 공개자료",
      evidenceLabelEn: "CC BY 4.0 public patient-level dataset",
      publishedOn: "2019-03-18",
      resultPeriod: "2019년 3월 18일 공개 · XLSX 파일 ID 14631221",
      resultPeriodEn: "Released 18 March 2019; XLSX file ID 14631221",
      reviewedOn: REVIEWED_ON
    },
    nist_vo2_dataset_2020: {
      discipline: "materials",
      title: "Dataset: Open combinatorial diffraction labels with quantified uncertainty",
      url: "https://doi.org/10.18434/mds2-2301",
      evidenceLabel: "NIST 공식 공개 XRD·전문가 표지 자료",
      evidenceLabelEn: "Official NIST open XRD and expert-label dataset",
      publishedOn: "2020-10-23",
      resultPeriod: "2020년 10월 공개 · Nb-VO₂ 조성–온도 격자",
      resultPeriodEn: "Released October 2020; Nb-VO2 composition-temperature grid",
      reviewedOn: REVIEWED_ON
    },
    nist_vo2_paper_2021: {
      discipline: "materials",
      title: "An Open Combinatorial Diffraction Dataset Including Consensus Human and Machine Learning Labels with Quantified Uncertainty",
      url: "https://doi.org/10.1007/s40192-021-00213-8",
      evidenceLabel: "동료심사 상경계 전문가 불일치 연구",
      evidenceLabelEn: "Peer-reviewed study of expert disagreement at phase boundaries",
      publishedOn: "2021-06-09",
      resultPeriod: "2021년 6월 출판 · 352개 XRD 중 사람표지 192점 분석",
      resultPeriodEn: "Published June 2021; 192 human-labeled points from 352 XRD patterns",
      reviewedOn: REVIEWED_ON
    }
  });

  const followupSources = ["plos_followup_2019", "figshare_followup_2019", "pubmed_double_sampling_2001", "imbens_manski_2004", "clopper_pearson_1934"];
  const nistSources = ["nist_vo2_dataset_2020", "nist_vo2_paper_2021", "pmlr_multi_change_2025", "pmlr_active_change_2019"];
  const records = {
    "UP-182": {
      role: pair("실제 2차원 상경계에서 탐색–정밀화 정책을 독립 전문가 판정으로 검증하는 문제", "Problem validating exploration-refinement policies on a real two-dimensional phase grid with independent expert adjudication"),
      updatedDefinition: pair("조성·온도를 모두 바꾸는 재료지도에서는 경계 위치뿐 아니라 XRD를 어떤 상으로 읽는지도 불확실하다. NIST Nb-VO₂ 격자의 5명 표지를 개발용 HL1–HL2와 판정용 HL3–HL5로 분리하고, 192점 중 16점만 질의해 나머지 상을 예측하는 정책을 비교했다. 이 시험은 실제 XRD 판정 불일치를 포함하지만 좌표당 물리 측정은 한 번이다.", "A composition-temperature materials map is uncertain not only in boundary location but also in how each XRD pattern is assigned to a phase. We split five labels on the NIST Nb-VO2 grid into development labels HL1-HL2 and adjudication labels HL3-HL5, then compared policies that queried only 16 of 192 points and predicted the rest. The test contains real disagreement in XRD interpretation, but only one physical spectrum was measured per coordinate."),
      knownBoundary: pair("8온도×24조성의 192점 격자에서 73점은 5명이 만장일치하지 않았고 독립 판정 경계점은 49개였다. 400회에서 12+4의 평균 전체정확도·경계정확도·macro recall은 0.8204·0.5613·0.7411, 최소값은 0.8125·0.5510·0.7185였다. 최대 미질의 거리는 0.3202였다.", "On the 8-temperature by 24-composition grid, 73 of 192 points lacked five-label unanimity and independent adjudication marked 49 boundary points. Across 400 runs, 12+4 achieved mean overall accuracy 0.8204, boundary accuracy 0.5613, and macro recall 0.7411; minima were 0.8125, 0.5510, and 0.7185. Its maximum unqueried distance was 0.3202."),
      bottleneck: pair("전역 공간충전16은 최대 공백 0.25로 가장 안전하지만 평균 경계정확도는 0.5090이었다. 경계집중8+8은 평균 경계정확도 0.5295로 늘었으나 최대 공백이 0.4889까지 커졌고 12+4에 Pareto 지배당했다. 실제 병목은 경계 표지 불확실성과 전역 공백을 같은 판정에서 제한하는 것이다.", "Space-fill-16 had the safest maximum gap, 0.25, but mean boundary accuracy 0.5090. Frontier-focused 8+8 increased mean boundary accuracy to 0.5295 while expanding the gap to 0.4889 and was Pareto-dominated by 12+4. The bottleneck is jointly constraining boundary-label uncertainty and global coverage in one adjudication."),
      minimumAdvance: pair("동일 조성–온도 좌표에서 독립 XRD를 최소 3회 반복해 전문가 불일치와 장비·시료 변동을 분해한다. 개발 표지는 첫 측정과 일부 판정자에, 최종 경계는 남은 반복측정과 판정자에 고정해 12+4의 물리 경계 Hausdorff 오차를 측정한다.", "Acquire at least three independent XRD repeats at the same composition-temperature coordinates to separate expert disagreement from instrument and specimen variation. Fix the first measurement and some labelers for development and reserve the remaining repeats and labelers for final boundary adjudication, measuring the physical-boundary Hausdorff error of 12+4."),
      decisiveTest: pair("73개 불일치점과 그 인접 동의점을 층화해 반복측정한다. 표지 불일치가 스펙트럼 반복변동보다 크면 판정자 모형을, 반복변동이 더 크면 계측·제작 오차모형을 우선한다. 두 오차를 합친 봉인셋에서 최소 경계정확도 0.5를 잃으면 12+4 이전을 중단한다.", "Stratify repeats across the 73 disagreement points and adjacent agreement controls. Prioritize an adjudicator model if label disagreement exceeds spectral repeat variation, and a measurement-fabrication model if the reverse holds. Stop transfer of 12+4 if minimum boundary accuracy falls below 0.5 on a sealed set combining both errors."),
      unresolved: pair("독립 판정 HL3–HL5도 절대적 참값은 아니며 같은 원 XRD를 공유한다. 1차원 piecewise-constant bandit의 고정신뢰 보장은 이 2차원 3상 격자에 직접 적용되지 않아 Track-and-Stop을 구현했다고 주장하지 않았다.", "HL3-HL5 adjudication is not absolute truth and shares the same original XRD. Fixed-confidence guarantees for a one-dimensional piecewise-constant bandit do not transfer directly to this two-dimensional three-phase grid, so no claim of implementing Track-and-Stop is made."),
      hypotheses: [
        { code: "H1", claim: pair("12+4는 실제 전문가 판정잡음 아래에서도 균등16보다 경계와 전체정확도를 높이며 공백 관문을 지킨다.", "Under real expert-label noise, 12+4 improves boundary and overall accuracy over space-fill-16 while retaining the gap gate."), prediction: pair("400회 최소 정확도·경계정확도·macro recall이 0.7·0.5·0.5 이상이고 최대공백은 균등의 1.5배 이하다.", "Across 400 runs, minimum accuracy, boundary accuracy, and macro recall remain at least 0.7, 0.5, and 0.5, while maximum gap stays within 1.5 times space filling."), reject: pair("최소값 0.8125·0.5510·0.7185와 공백비 1.281로 이번 표지획득 범위에서는 살아남았다.", "Minima 0.8125, 0.5510, and 0.7185 with gap ratio 1.281 sustain the claim within this annotation-acquisition scope.") },
        { code: "H2", claim: pair("경계집중8+8이 실제 2차원 격자에서도 가장 정보효율적이다.", "Frontier-focused 8+8 is the most information-efficient policy on the real two-dimensional grid."), prediction: pair("정확도·경계정확도·macro recall에서 12+4 이상이고 최대공백도 나쁘지 않다.", "It matches or exceeds 12+4 in accuracy, boundary accuracy, and macro recall without a worse maximum gap."), reject: pair("12+4가 네 Pareto 지표 모두에서 8+8을 지배해 기각됐다.", "12+4 dominated 8+8 on all four Pareto metrics, rejecting the claim.") },
        { code: "H3", claim: pair("전문가 표지 불일치를 실제 장비 반복잡음으로 대체해도 정책 순위가 유지된다.", "Policy ranking is preserved when expert-label disagreement is replaced by real instrumental repeat noise."), prediction: pair("독립 반복 XRD 봉인셋에서도 12+4가 최소관문을 통과하고 8+8을 지배한다.", "On sealed replicate XRD, 12+4 passes minimum gates and dominates 8+8."), reject: pair("현재 좌표당 반복스펙트럼이 없어 판정하지 않았다. 반복자료 확보 전에는 물리 실험정책으로 이전하지 않는다.", "No coordinate-level replicate spectra exist here, so the claim is unadjudicated and transfer to physical experiment policy is withheld.") }
      ],
      sourceIds: nistSources
    },
    "UP-185": {
      role: pair("공개 추적자료가 실패·무응답 복구의 선택오즈를 실제로 제한할 수 있는지 감사하는 문제", "Problem auditing whether public follow-up data can actually constrain selection odds in failed or missing-record rescue"),
      updatedDefinition: pair("공개 파일이 크고 무작위화됐다는 사실만으로 2단계 MNAR를 보정할 수는 없다. 필요한 것은 최초 무응답자 프레임, 복구 초대지표와 확률, 초대 후 응답, 응답실패자에게도 있는 동일 결과다. PLOS 파일은 연락전략과 검증집단, 사망상태는 제공했지만 최초 무응답 프레임과 독립 건강상태는 제공하지 않았다.", "A large randomized public file does not automatically calibrate second-stage MNAR. The required fields are the initial nonrespondent frame, rescue invitation and probability, post-invitation response, and the same outcome measured among response failures. The PLOS file provides contact strategies, a validation cohort, and mortality, but not the initial nonrespondent frame or independent health status."),
      knownBoundary: pair("728개 고유 ID와 집단 183·187·358명, 건강상태 639건, 사망상태 필드 728건을 재현했다. 알려진 사망/생존 723명에서 건강상태 가용성은 사망 71/151, 생존 566/572였고 생존 대 사망 응답오즈비는 106.291, 동시 95% Γ 상한은 499.530이었다.", "We reproduced 728 unique IDs, groups of 183, 187, and 358, 639 health-status values, and 728 populated death-status fields. Among 723 recognized death or survival codes, health status was available for 71/151 deaths and 566/572 survivors; the survivor-to-death response odds ratio was 106.291 with simultaneous 95% Gamma upper bound 499.530."),
      bottleneck: pair("전체 Γ는 유한하지만 설계집단별 지지집합은 달랐다. 검증집단 사망자 77명은 건강상태가 0건이어서 Γ 상한이 무한대였다. 전체 자료를 합치면 설계에 의해 생긴 구조적 무응답을 평균화해 숨기므로 실패유형별 원장과 층별 분모가 필요하다.", "The pooled Gamma was finite, but support differed by design group. None of 77 deaths in the validation cohort had health status, making the Gamma upper bound infinite. Pooling averages away design-induced structural missingness, so the ledger must preserve failure types and stratum-specific denominators."),
      minimumAdvance: pair("실패실험 원장에서도 제작캠페인·장비·복구경로별로 성공·실패 독립판정과 복구응답 2×2표를 먼저 만든다. 한 셀이라도 0이면 전체 Γ를 사용하지 말고 그 층을 별도 무지지 영역으로 남긴다.", "In failed-experiment ledgers, first build outcome-by-rescue-response 2x2 tables separately by fabrication campaign, instrument, and rescue route using independent adjudication. If any cell is zero, do not use a pooled Gamma; retain that stratum as a separate unsupported region."),
      decisiveTest: pair("같은 총 표본에서 전체 Γ와 설계층별 Γ 구간을 모두 계산한다. 독립 판정값 포함률과 폭을 층별로 확인하고, 풀링 구간만 좁거나 영지지 층을 포함하지 못하면 풀링 분석을 폐기한다.", "Compute both pooled and design-stratified Gamma intervals on the same total sample. Check independent-truth coverage and width by stratum, and discard pooling if only the pooled interval is narrow or it misses a zero-support stratum."),
      unresolved: pair("사망상태는 건강상태와 같은 결과가 아니고 코드 3인 5명도 남았다. 따라서 499.530은 건강상태 자체의 진실을 복구하는 Γ가 아니라 사망 여부에 따른 건강상태 가용성의 선택강도를 보여 주는 외부 대조값이다.", "Mortality is not the same outcome as health status, and five records carry death-status code 3. Thus 499.530 is not a Gamma that recovers missing health truth; it is an external control measuring how health-status availability varies by mortality."),
      hypotheses: [
        { code: "H1", claim: pair("PLOS 공개자료는 확률하위표본 2단계 복구 Γ를 직접 보정한다.", "The PLOS public data directly calibrate Gamma for a probability-subsampled second-stage rescue."), prediction: pair("최초 무응답프레임·초대확률·응답실패자 동일결과가 모두 있다.", "The initial nonrespondent frame, invitation probability, and same outcome among response failures are all present."), reject: pair("세 요소가 없어 기각했다. 환자수준 파일을 저장소에 재배포하지 않고 집계 감사만 남겼다.", "All three are absent, rejecting the claim. The repository retains aggregate audit results without republishing patient-level data.") },
        { code: "H2", claim: pair("독립 사망상태는 결과의존 건강상태 가용성을 검출할 수 있다.", "Independent mortality can detect outcome-dependent availability of health status."), prediction: pair("사망과 생존의 건강상태 응답오즈가 1에서 분리된다.", "Health-status response odds differ between deaths and survivors."), reject: pair("오즈비 106.291로 분리됐지만 이는 검출이지 건강상태 진실의 식별은 아니다.", "The odds ratio 106.291 supports detection, but not identification of missing health truth.") },
        { code: "H3", claim: pair("전체 표본의 유한 Γ 상한은 모든 설계집단에 안전하게 적용된다.", "A finite pooled Gamma upper bound safely applies to every design group."), prediction: pair("각 집단의 성공·실패 결과별 응답률 하한이 양수여서 층별 Γ도 유한하다.", "Outcome-specific response-rate lower bounds are positive in every group, yielding finite stratum-specific Gamma."), reject: pair("검증집단 사망자 0/77로 상한이 무한대여서 기각됐다.", "Zero of 77 deaths in the validation cohort had health status, giving an infinite upper bound and rejecting the claim.") }
      ],
      sourceIds: [...followupSources, "fair_data_2016"]
    },
    "UP-629": {
      role: pair("전체 선택오즈가 하위집단의 영지지를 숨기는지 판정하는 부분식별 문제", "Partial-identification problem adjudicating whether pooled selection odds hide subgroup zero support"),
      updatedDefinition: pair("부분식별 민감도 Γ는 선택강도를 제한하지만 모든 층에 관측이 있어야 유한한 외부 상한을 만들 수 있다. PLOS 자료에서는 전체 생존/사망 응답표가 유한 Γ를 줬지만 검증집단 사망자의 건강상태가 전무했다. 모집단 평균의 유한 경계가 각 설계층의 식별을 보장하지 않는 실제 반례다.", "A partial-identification sensitivity Gamma constrains selection strength, but finite external bounds require observations in every relevant stratum. The pooled survivor-death table in PLOS yielded a finite Gamma, while the validation cohort had no health status among deaths. This is a real-data counterexample to inferring stratum identification from a finite population-level bound."),
      knownBoundary: pair("전체 2×2표의 점 오즈비 106.291과 동시 95% 상한 499.530은 계산 가능했다. 그러나 집단1은 사망·생존 모두 응답률 1, 집단2는 생존 응답률 1, 집단3은 사망 응답률 0이어서 각 층의 오즈 표현은 퇴화하거나 무한했다.", "The pooled 2x2 table gave point odds ratio 106.291 and simultaneous 95% upper bound 499.530. Yet group 1 had response rate one for deaths and survivors, group 2 had survivor response one, and group 3 had death response zero, so stratum-specific odds were degenerate or infinite."),
      bottleneck: pair("Γ를 자료에서 추정하는 순간 어떤 층을 합칠지라는 모형선택이 들어간다. 설계집단을 합치면 표본폭은 줄지만 조건부 지지집합의 공백을 지운다. 외부보정은 반드시 목표 추론의 조건변수와 같은 층화에서 수행해야 한다.", "Estimating Gamma from data introduces a model-selection decision about which strata to pool. Pooling design groups narrows sampling width but erases holes in conditional support. External calibration must use the same conditioning variables as the target inference."),
      minimumAdvance: pair("Γ 보정표에 각 층의 네 셀 수, 정확 주변구간과 유한·무한 상태를 공개한다. 계층모형을 쓰더라도 영지지 층의 정보는 다른 층에서 빌려온 것임을 표시하고, 완전 풀링·부분 풀링·무풀링 결과를 병렬 보고한다.", "Publish all four cell counts, exact marginal intervals, and finite/infinite status for every Gamma-calibration stratum. If a hierarchical model is used, mark information in zero-support strata as borrowed and report complete pooling, partial pooling, and no pooling in parallel."),
      decisiveTest: pair("설계집단 하나를 홀드아웃하고 나머지에서 계층 Γ를 맞춘 뒤 홀드아웃의 독립 결과 포함률을 측정한다. 영지지 집단에서 명목 포함률을 못 지키면 계층 축약을 기각하고 무한 경계를 유지한다.", "Hold out one design group, fit hierarchical Gamma on the others, and measure independent-outcome coverage in the held-out group. If nominal coverage fails in a zero-support group, reject shrinkage and retain an unbounded interval."),
      unresolved: pair("현재 감사는 하나의 공개파일과 이항 가용성에 한정된다. 연속 결과, 시간가변 재접촉과 많은 희소층에서는 다중성·계층교환가능성·선택된 층화의 불확실성까지 포함해야 한다.", "The audit covers one public file and binary availability. Continuous outcomes, time-varying recontact, and many sparse strata require multiplicity control, hierarchical exchangeability checks, and uncertainty from selecting the stratification itself."),
      hypotheses: [
        { code: "H1", claim: pair("전체 자료에서 유한한 Γ를 얻으면 모든 하위집단도 유한하게 부분식별된다.", "A finite pooled Gamma implies finite partial identification in every subgroup."), prediction: pair("모든 설계집단의 결과별 응답확률 구간이 0과 1에서 떨어진다.", "Outcome-specific response-probability intervals in every design group stay away from zero and one."), reject: pair("집단3 사망 응답 0/77과 집단1 완전응답으로 기각됐다.", "Group 3 death response 0/77 and complete response in group 1 reject the claim.") },
        { code: "H2", claim: pair("설계변수를 조건화하면 풀링이 숨긴 식별경계를 드러낸다.", "Conditioning on design variables reveals identification boundaries hidden by pooling."), prediction: pair("전체 Γ는 유한하지만 적어도 한 층에서 정확 상한이 무한으로 바뀐다.", "Pooled Gamma is finite while at least one exact stratum upper bound becomes infinite."), reject: pair("전체 499.530 대 집단별 무한으로 확인됐다.", "Observed pooled 499.530 versus unbounded strata sustains the claim.") },
        { code: "H3", claim: pair("다른 결과인 사망상태로 건강상태 MNAR Γ를 직접 대체할 수 있다.", "Mortality can directly replace the MNAR Gamma for the different health-status outcome."), prediction: pair("사망별 가용성 오즈가 건강상태 진실별 응답오즈와 동일하다는 외부 검증이 있다.", "External validation equates mortality-specific availability odds with response odds by true health status."), reject: pair("독립 건강상태가 무응답자에게 없어 대응을 검증할 수 없으므로 이전을 거부했다.", "No independent health status exists among nonresponders, so the mapping is unverifiable and transfer is refused.") }
      ],
      sourceIds: followupSources
    },
    "UP-430": {
      role: pair("무작위 연락전략과 독립 결과가 하위집단 치료효과 결측을 어디까지 교정하는지 구분하는 문제", "Problem separating what randomized contact strategies and independent outcomes can correct in subgroup treatment-effect missingness"),
      updatedDefinition: pair("연락방법을 무작위화하면 어느 방법이 더 적은 통화로 추적을 완성하는지는 비교할 수 있지만, 치료군별 결과누락이 무작위가 되는 것은 아니다. PLOS 자료는 직접전화 183명, 사전편지 187명과 외부검증 358명을 분리해 연락효율을 판정했으나 독립 건강상태가 없어 개인·하위집단 건강효과의 MNAR를 해소하지 못한다.", "Randomizing contact method identifies which strategy completes follow-up with fewer calls, but it does not randomize outcome missingness within treatment groups. PLOS separates 183 direct-call, 187 prenotification, and 358 external-validation patients for contact-efficiency adjudication, yet lacks independent health status and therefore cannot resolve MNAR in personalized or subgroup health effects."),
      knownBoundary: pair("평균 정확통화 수는 세 집단에서 1.6066·1.0695·1.7598로 재현됐다. 사망상태는 거의 완전해 건강상태 가용성의 강한 사망의존성을 드러냈지만, 검증집단 사망자 건강상태가 0/77이어서 해당 층의 건강효과는 관측자료만으로 제한되지 않는다.", "Mean correct calls reproduced as 1.6066, 1.0695, and 1.7598 across the three groups. Near-complete mortality exposed strong mortality dependence in health-status availability, but zero of 77 deaths in the validation cohort had health status, leaving health effects in that stratum unconstrained by observed data alone."),
      bottleneck: pair("연락전략 RCT의 처리변수는 연락방법이고 관심 치료효과의 처리변수와 다르다. 사망등록은 생존결과를 독립 판정하지만 주관적 건강결과를 대신하지 않는다. 무작위화와 독립결과의 효력이 미치는 인과경로를 구분해야 한다.", "The treatment in the contact-strategy RCT is contact method, not the clinical treatment of interest. Mortality registration independently adjudicates survival but cannot substitute for subjective health. The causal pathways covered by randomization and independent outcomes must be kept distinct."),
      minimumAdvance: pair("공개 임상시험 하나에서 원 치료배정, 추적 연락배정, 건강결과 응답과 독립 행정결과를 모두 연결한다. 치료군×하위집단×연락전략별 지지표를 먼저 공개하고 영지지 층에서는 개인화효과 부호를 주장하지 않는다.", "In one public clinical trial, link original treatment assignment, follow-up contact assignment, health-response status, and an independent administrative outcome. Publish support tables by treatment, subgroup, and contact strategy before analysis, and make no personalized-effect sign claim in zero-support strata."),
      decisiveTest: pair("연락효율 모형은 무작위 연락집단에서 개발하고 별도 검증집단에서 재현한다. 치료효과 경계는 독립 행정결과를 판정에만 사용하며, 전체 평균효과가 안정적이어도 어느 임상 하위집단의 부호가 Γ 범위에서 바뀌면 개인화 결론을 중단한다.", "Develop the contact-efficiency model in randomized contact groups and reproduce it in the separate validation cohort. Use independent administrative outcomes only for adjudicating treatment-effect bounds; stop personalization if any clinical subgroup changes sign over supported Gamma values even when the average effect is stable."),
      unresolved: pair("이 공개자료에는 원 임상 치료배정이 없고 건강상태 코딩 의미도 원문 코드북에 의존한다. 사망과 건강상태의 관계를 치료효과 이질성으로 해석할 수 없으며, 실제 적용에는 윤리승인된 자료연결이 필요하다.", "The public file contains no original clinical treatment assignment, and interpretation of health-status codes depends on the source codebook. The mortality-health association is not treatment-effect heterogeneity, and real application requires ethically approved data linkage."),
      hypotheses: [
        { code: "H1", claim: pair("연락전략 무작위화는 건강결과 결측도 무작위화한다.", "Randomizing contact strategy also randomizes health-outcome missingness."), prediction: pair("사망·생존과 설계집단을 조건화한 뒤 건강상태 가용성이 결과에 의존하지 않는다.", "Health-status availability is outcome-independent after conditioning on mortality and design group."), reject: pair("사망별 응답오즈비 106.291과 집단3의 0/77로 기각됐다.", "Mortality-specific response odds 106.291 and group 3's 0/77 reject the claim.") },
        { code: "H2", claim: pair("무작위 연락집단과 외부검증집단의 분리는 연락비용 모형의 이전성을 판정한다.", "Separating randomized contact groups and an external validation cohort adjudicates transfer of a contact-cost model."), prediction: pair("개발집단에서 선택한 직접전화 규칙이 검증집단에서도 낮은 추적손실과 비슷한 통화부담을 재현한다.", "A direct-call rule selected in development reproduces low loss and similar call burden in validation."), reject: pair("원 논문과 공개분모는 이 설계를 지지하지만 이번 사이클은 원 성능모형을 재적합하지 않아 가설을 유지 중으로 둔다.", "The paper and public denominators support the design, but this cycle did not refit the original performance model, so the hypothesis remains active rather than verified here.") },
        { code: "H3", claim: pair("사망등록으로 모든 환자의 주관적 건강효과를 독립 판정할 수 있다.", "Mortality registration independently adjudicates subjective health effects for every patient."), prediction: pair("사망상태가 건강상태와 동일 목표량이거나 검증된 측정모형으로 일대일 대응한다.", "Mortality is the same estimand as health status or maps one-to-one through a validated measurement model."), reject: pair("결과가 다르고 무응답자 건강상태가 없어 기각했다.", "The outcomes differ and nonresponder health status is absent, rejecting the claim.") }
      ],
      sourceIds: [...followupSources, "jds_shadow_mnar_2024"]
    }
  };

  const stratificationConnection = {
    id: "CONN-STRAT-001",
    problemIds: ["UP-185", "UP-629", "UP-430"],
    type: pair("전체 선택오즈가 설계층의 영지지를 숨기는 구조", "Pooled selection odds hiding zero support in design strata"),
    strength: "public-data-counterexample",
    sharedBottleneck: pair("전체 모집단에서 결과별 응답자가 모두 있어도 설계·기관·하위집단 하나에는 특정 결과의 응답자가 전혀 없을 수 있다. 전체 Γ를 조건부 추론에 적용하면 관측되지 않은 층의 정보를 다른 층에서 빌려온 사실이 사라진다.", "Even when every outcome has responders in the pooled population, one design, site, or subgroup may have no responders for a particular outcome. Applying pooled Gamma to conditional inference hides that information in an unobserved stratum was borrowed from elsewhere."),
    mapping: pair("연락전략·검증집단↔실험캠페인·장비·임상기관, 사망/생존↔실험 성공/실패 또는 임상결과, 건강상태 가용성↔복구응답, 0/77 셀↔조건부 무지지가 대응한다.", "Contact strategy and validation cohort map to experimental campaign, instrument, or clinical site; mortality to experiment success/failure or clinical outcome; health-status availability to rescue response; and the 0/77 cell to conditional zero support."),
    transferableMethod: pair("전체 Γ 전에 목표 조건변수별 2×2 지지표와 정확 주변구간을 계산한다. 영지지 층은 무한 경계로 유지하고, 계층 축약은 해당 층을 홀드아웃한 외부 포함률을 통과할 때만 사용한다.", "Before pooled Gamma, compute 2x2 support tables and exact marginal intervals for every target conditioning variable. Retain unbounded intervals in zero-support strata and use hierarchical shrinkage only after passing external coverage with that stratum held out."),
    evidence: pair("전체 자료는 응답오즈비 106.291과 동시 95% Γ 상한 499.530을 줬지만, 검증집단 사망자 건강상태는 0/77이어서 층별 상한은 무한이었다.", "The pooled data yielded response odds ratio 106.291 and simultaneous 95% Gamma upper bound 499.530, while health status was available for 0/77 deaths in the validation cohort, making the stratum upper bound infinite."),
    validationStatus: pair("CC BY 공개 환자수준 파일 집계 재현 · 다른 자료셋 외부재현 대기", "Aggregates reproduced from a CC BY public patient-level file; awaiting external replication in another dataset"),
    failureBoundary: pair("모든 설계층에서 결과별 응답률이 0과 1에서 충분히 떨어지고 Γ의 동질성이 외부 검증되면 전체 Γ가 효율적일 수 있다. 층이 자료에 따라 선택되면 별도 선택후 추론이 필요하다.", "Pooled Gamma may be efficient if outcome-specific response rates stay away from zero and one in every design stratum and homogeneity of Gamma is externally validated. Data-selected strata require separate post-selection inference."),
    minimumTest: pair("두 번째 공개자료에서 전체·층별 네 셀과 Γ를 재계산한다. 전체만 유한한 패턴이 반복되고 계층축약이 영지지 홀드아웃 포함률을 못 지키면 공통 연구프로그램으로 승격한다.", "Recompute pooled and stratum-specific four-cell tables and Gamma in a second public dataset. Promote the connection to a shared program if pooled-only finiteness recurs and hierarchical shrinkage misses coverage in a held-out zero-support stratum."),
    sourceIds: ["figshare_followup_2019", "plos_followup_2019", "imbens_manski_2004", "jds_shadow_mnar_2024"]
  };
  if (!connections.some(({ id }) => id === stratificationConnection.id)) connections.push(stratificationConnection);

  const cycle = {
    id: "RC-2026-09",
    title: "공개자료는 가설을 어디까지 판정할 수 있는가",
    titleEn: "How far can public data adjudicate the hypothesis?",
    status: "active",
    startedOn: REVIEWED_ON,
    reviewedOn: REVIEWED_ON,
    problemIds: Object.keys(records),
    connectionIds: ["CONN-STRAT-001", "CONN-FLOOR-001", "CONN-SECOND-001", "CONN-IDENT-001"],
    selectionReason: "RC-2026-08의 합성 결론을 실제 공개자료로 옮겼다. PLOS 환자수준 파일은 2단계 Γ 외부보정에 필요한 분모가 있는지 변수 수준에서 감사했고, NIST Nb-VO₂는 개발 판정자와 독립 판정자를 분리한 실제 2차원 상표지 획득시험으로 사용했다. 자료가 허용하지 않는 물리 반복성·건강상태 진실·1차원 고정신뢰 보장은 명시적으로 거부했다.",
    selectionReasonEn: "This cycle moved RC-2026-08's synthetic conclusions to real public data. The PLOS patient-level file was audited field by field for denominators required by external second-stage Gamma calibration, while NIST Nb-VO2 supported a real two-dimensional phase-label acquisition test with development and adjudication labelers separated. Physical repeatability, missing health truth, and one-dimensional fixed-confidence guarantees unsupported by the data were explicitly refused.",
    verifiedFindings: [
      { text: "PLOS 공개파일에서 728개 고유 ID와 집단 183·187·358명, 건강상태 639건을 재현했다. 최초 무응답프레임·2단계 초대지표·초대확률은 없었다.", textEn: "The PLOS file reproduced 728 unique IDs, groups of 183, 187, and 358, and 639 health-status values. It lacked the initial nonrespondent frame, second-stage invitation indicator, and invitation probability.", sourceIds: ["figshare_followup_2019", "plos_followup_2019"] },
      { text: "알려진 사망/생존 723명에서 건강상태 가용성은 사망 71/151, 생존 566/572였고 생존 대 사망 응답오즈비 106.291, 동시 95% Γ 상한 499.530이었다.", textEn: "Among 723 recognized death or survival codes, health status was available for 71/151 deaths and 566/572 survivors, giving survivor-to-death response odds 106.291 and simultaneous 95% Gamma upper bound 499.530.", sourceIds: ["figshare_followup_2019", "clopper_pearson_1934"] },
      { text: "검증집단 사망자 건강상태는 0/77이어서 층별 Γ 상한이 무한이었다. 전체의 유한 상한은 설계층 무지지를 숨겼다.", textEn: "Health status was available for 0/77 deaths in the validation cohort, making the stratum Gamma upper bound infinite. The finite pooled bound hid design-stratum zero support.", sourceIds: ["figshare_followup_2019", "imbens_manski_2004"] },
      { text: "NIST 공개자료의 8×24=192점 사람표지 격자를 재현했다. 73점은 비만장일치였고 HL3–HL5 독립 판정 경계점은 49개였다.", textEn: "The NIST public data reproduced an 8 by 24 grid of 192 human-labeled points. Seventy-three were non-unanimous and independent HL3-HL5 adjudication identified 49 boundary points.", sourceIds: ["nist_vo2_dataset_2020", "nist_vo2_paper_2021"] },
      { text: "400회 독립표지 판정에서 12+4는 최소 전체정확도 0.8125, 경계정확도 0.5510, macro recall 0.7185로 모든 관문을 통과하고 8+8을 Pareto 지배했다.", textEn: "Across 400 independent-label adjudications, 12+4 passed every gate with minimum accuracy 0.8125, boundary accuracy 0.5510, and macro recall 0.7185, and Pareto-dominated 8+8.", sourceIds: ["nist_vo2_dataset_2020", "pmlr_active_change_2019"] },
      { text: "좌표당 물리 XRD 반복은 없고 1차원 Track-and-Stop의 가정도 성립하지 않아 장비잡음과 고정신뢰 보장으로의 이전을 거부했다.", textEn: "No physical XRD repeats exist per coordinate and one-dimensional Track-and-Stop assumptions do not hold, so transfer to instrumental-noise or fixed-confidence guarantees was refused.", sourceIds: ["nist_vo2_dataset_2020", "pmlr_multi_change_2025"] }
    ],
    resultMatrix: {
      title: pair("외부자료 적합성·독립판정 결과", "External-data fitness and independent adjudication"),
      note: pair("PLOS Γ는 사망에 따른 건강상태 가용성 선택강도이며 건강상태 진실의 Γ가 아니다. NIST 시험은 전문가 표지획득이지 반복 물리측정 시험이 아니다.", "PLOS Gamma measures mortality-specific selection in health-status availability, not Gamma by true health status. The NIST test concerns expert-label acquisition, not repeated physical measurement."),
      columns: [pair("시험", "Test"), pair("분모", "Denominator"), pair("주 결과", "Primary result"), pair("제약", "Restriction"), pair("판정", "Decision")],
      rows: [
        { label: pair("PLOS 파일감사", "PLOS file audit"), values: ["728 IDs", "183/187/358", pair("건강상태 639", "639 health values"), pair("2단계 프레임 없음", "No two-phase frame")] },
        { label: pair("전체 선택오즈", "Pooled selection odds"), values: ["151 dead/572 alive", "OR 106.291", "Γ95≤499.530", pair("결과 대리", "Outcome proxy")] },
        { label: pair("검증집단 지지", "Validation support"), values: ["77 deaths", "health 0/77", pair("Γ 상한 무한", "Gamma upper unbounded"), pair("풀링 기각", "Reject pooling")] },
        { label: pair("NIST 표지감사", "NIST label audit"), values: ["192 points", pair("불일치 73", "73 disagreement"), pair("경계 49", "49 boundary"), pair("독립분할 가능", "Independent split")] },
        { label: pair("균등16", "Space-fill-16"), values: ["400 runs", "accuracy 0.7745", "gap 0.2500", pair("전역 비지배", "Globally non-dominated")] },
        { label: pair("혼합12+4", "Hybrid-12+4"), values: ["400 runs", "accuracy 0.8204", "boundary 0.5613", pair("모든 최소관문 통과", "All minimum gates pass")] },
        { label: pair("경계집중8+8", "Frontier-8+8"), values: ["400 runs", "accuracy 0.7843", "gap 0.4889", pair("12+4에 지배", "Dominated by 12+4")] }
      ]
    },
    sharedProgram: {
      name: pair("외부자료 적합성–독립판정 프로그램", "External-data fitness and independent-adjudication program"),
      thesis: pair("공개자료는 존재 여부가 아니라 목표 인과사슬의 각 분모와 독립 판정량을 실제로 담는지 먼저 감사해야 한다. 누락된 층은 가정으로 메우지 않고 무한·미판정 상태로 남긴다.", "Public data must be audited for every denominator and independent adjudicand in the target causal chain, not merely for existence. Missing strata remain unbounded or unadjudicated rather than being silently filled by assumptions."),
      design: pair("PLOS XLSX의 28개 필드를 집계해 설계·응답·독립결과 분모를 감사하고 사망별 건강가용성 구간을 계산했다. NIST 표지 5개를 개발 2개와 판정 3개로 나눠 세 16질의 정책을 400회 비교했다.", "Aggregated 28 fields from the PLOS XLSX to audit design, response, and independent-outcome denominators and calculate mortality-specific health-availability intervals. Split five NIST labels into two development and three adjudication labels and compared three 16-query policies over 400 runs."),
      adjudication: pair("환자수준 PLOS 파일은 재배포하지 않고 체크섬·출처와 집계만 보존했다. NIST 원 표지는 값만 정규화했으며 정책이 보지 못한 HL3–HL5로 전체·경계·macro recall을 판정했다.", "Did not republish the patient-level PLOS file, retaining only source checksum and aggregates. Canonically extracted NIST values and adjudicated overall, boundary, and macro recall only with HL3-HL5 unseen by the policies."),
      primaryMetrics: pair("필드별 분모, 결과별 응답오즈와 정확 동시상한, 층별 영지지, 전체·경계 정확도, macro recall, 최대 미질의 거리", "Field denominators, outcome-specific response odds and exact simultaneous upper bounds, stratum zero support, overall and boundary accuracy, macro recall, and maximum unqueried distance"),
      successRule: pair("외부 Γ는 같은 결과·같은 조건층에서 네 셀이 관측되고 홀드아웃 포함률을 지켜야 한다. 획득정책은 독립 판정에서 최소 정확도 관문과 전역공백 관문을 모두 통과해야 한다.", "External Gamma requires all four cells for the same outcome and conditioning strata plus held-out coverage. An acquisition policy must pass minimum independent-adjudication accuracy and global-gap gates together."),
      stopRule: pair("다른 결과의 Γ를 목표 결과에 이전하지 않는다. 전체 유한 Γ로 영지지 층을 덮지 않으며, 전문가 불일치를 물리 반복잡음으로 부르지 않는다.", "Do not transfer Gamma across different outcomes, cover a zero-support stratum with finite pooled Gamma, or call expert disagreement physical repeat noise."),
      status: pair("두 공개자료 외부감사·독립표지 판정 완료 · 동일결과 독립자료·반복 XRD 대기", "Two public-data audits and independent-label adjudication complete; same-outcome independent data and replicate XRD pending")
    },
    artifacts: [
      { title: pair("PLOS 공개자료 출처 규격", "PLOS public-data source manifest"), description: pair("원 환자파일을 재배포하지 않고 DOI·파일 ID·체크섬·라이선스와 재현 조건을 기록", "Records DOI, file ID, checksum, license, and reproduction requirements without republishing patient data"), url: "research/external-audit/plos-followup-2019/source-manifest.json", kind: "JSON" },
      { title: pair("PLOS 변수·Γ 감사 결과", "PLOS field and Gamma audit result"), description: pair("728명 분모, 필드 가용성, 집단별 연락부담, 사망별 건강가용성 오즈와 층별 무지지 판정", "Aggregated denominators, field coverage, contact burden, mortality-specific health-availability odds, and stratum zero-support adjudication"), url: "research/external-audit/plos-followup-2019/audit-result.json", kind: "JSON" },
      { title: pair("NIST 공개자료 출처 규격", "NIST public-data source manifest"), description: pair("공식 DOI·원 파일 체크섬·공개조건과 값 전용 정규화 파일의 계보", "Official DOI, source checksum, open terms, and provenance of the values-only canonical extraction"), url: "research/external-audit/nist-vo2-2020/source-manifest.json", kind: "JSON" },
      { title: pair("NIST 표지 격자 감사", "NIST label-grid audit"), description: pair("192점 완전격자, 5명 표지 불일치, 독립 판정 경계와 물리 반복성 부재를 판정", "Adjudicates the 192-point complete grid, five-label disagreement, independent boundaries, and absence of physical repeats"), url: "research/external-audit/nist-vo2-2020/audit-result.json", kind: "JSON" },
      { title: pair("NIST 정규화 사람표지", "Canonical NIST human labels"), description: pair("공식 Human Labels.xlsx의 192개 좌표·5명 표지를 값만 보존한 기계가독 자료", "Machine-readable values-only extraction of 192 coordinates and five labels from official Human Labels.xlsx"), url: "research/external-audit/nist-vo2-2020/human-labels.json", kind: "JSON" },
      { title: pair("실제격자 획득시험 규격", "Real-grid acquisition specification"), description: pair("개발·판정 표지분리, 16질의 예산, 세 정책, 다중 정확도·공백 관문과 적용범위를 고정", "Freezes label split, 16-query budget, three policies, accuracy and gap gates, and scope restrictions"), url: "research/active-boundary/nist-label-acquisition-spec.json", kind: "JSON" },
      { title: pair("실제격자 획득시험 결과", "Real-grid acquisition result"), description: pair("400회 독립 판정의 전체·경계 정확도, macro recall, 최대공백과 Pareto 지배관계", "Overall and boundary accuracy, macro recall, maximum gap, and Pareto dominance over 400 independent adjudications"), url: "research/active-boundary/nist-label-acquisition-result.json", kind: "JSON" },
      { title: pair("NIST 획득시험 실행기", "NIST acquisition runner"), description: pair("공통 개발표지 오라클에서 공간충전·8+8·12+4를 재계산하는 의존성 없는 코드", "Dependency-free runner recomputing space filling, 8+8, and 12+4 under a common development-label oracle"), url: "scripts/run-nist-label-acquisition.mjs", kind: "JavaScript" },
      { title: pair("외부감사 독립 검증", "Independent external-audit verification"), description: pair("공개분모·Γ 거부·NIST 격자·독립표지 분리와 Pareto 판정을 별도 검사", "Separately checks public denominators, Gamma refusal, NIST grid, independent label split, and Pareto adjudication"), url: "scripts/verify-external-audits.mjs", kind: "JavaScript" }
    ],
    log: [
      pair("RC-2026-08이 요구한 실제 공개자료 외부보정과 2차원 경계 이전을 직접 조사했다.", "Directly pursued the real public-data calibration and two-dimensional boundary transfer specified by RC-2026-08."),
      pair("PLOS 원 환자파일은 공개 CC BY지만 저장소에는 재배포하지 않고 집계·체크섬·재현 스크립트만 보존했다.", "Although the PLOS patient file is public CC BY, retained only aggregates, checksum, and reproduction code rather than republishing it."),
      pair("전체 Γ가 유한해도 검증집단의 0/77 셀 때문에 조건부 Γ가 무한인 실패를 숨기지 않았다.", "Preserved the failure where pooled Gamma is finite but conditional Gamma is unbounded because of a 0/77 validation cell."),
      pair("NIST 표지를 개발 HL1–HL2와 판정 HL3–HL5로 분리해 같은 표지로 정책을 만들고 평가하지 않았다.", "Separated NIST development labels HL1-HL2 from adjudication labels HL3-HL5 to prevent training and judging on the same labels."),
      pair("12+4의 실제 표지 양성 결과와 좌표당 물리 반복이 없다는 이전 거부를 함께 기록했다.", "Recorded both the positive real-label result for 12+4 and refusal to transfer without coordinate-level physical repeats."),
      pair("2025년 고정신뢰 다중 변화점 방법은 1차원 piecewise-constant 조건이 달라 직접 구현으로 오인하지 않았다.", "Did not misrepresent the 2025 fixed-confidence multiple-change-point method as directly implemented under incompatible one-dimensional piecewise-constant assumptions.")
    ],
    nextCycle: pair("PLOS와 독립된 두 번째 공개 추적자료에서 전체·층별 응답표와 영지지를 재현하고, 같은 목표결과가 행정자료에도 있는 자료를 우선한다. NIST 쪽은 73개 불일치점과 인접 동의점의 원 XRD에 반복스펙트럼 또는 다기관 재측정 자료가 있는지 감사하고, 없으면 공개 반복측정 재료 데이터로 좌표당 물리잡음 봉인을 새로 구성한다.", "Replicate pooled and stratum response tables and zero support in a second public follow-up dataset independent of PLOS, prioritizing one where the same target outcome exists in administrative data. For NIST, audit whether replicate spectra or cross-laboratory remeasurements exist for the 73 disagreement points and adjacent agreement controls; if not, construct a coordinate-level physical-noise seal from another open repeated-measurement materials dataset."),
    sourceIds: [...followupSources, ...nistSources, "jds_shadow_mnar_2024"]
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
    factSources: (window.RESEARCH_CYCLE_META?.factSources || 0) + 4
  };
})();
