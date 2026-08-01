(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const meta = window.CATALOG_META;
  const sources = window.CATALOG_SOURCES;
  const prizes = window.CATALOG_PRIZES || {};
  const PAGE_SIZE = 36;
  const disciplineOrder = Object.keys(meta.disciplines);
  let visibleCount = PAGE_SIZE;

  const UI = {
    ko: {
      pageTitle: "Unsolved Problems — 미해결 문제 지도",
      pageDescription: "13개 학문 분야의 미해결 문제를 한국어와 영어로 탐색하는 공개 연구 지도",
      skipCatalog: "카탈로그로 건너뛰기", brandHome: "Unsolved Problems 홈", mainNav: "주요 메뉴", languageSelect: "언어 선택",
      navMap: "지도", navTaxonomy: "분류법", navCatalog: "난제", navSources: "출처",
      heroTitle: "인류가 아직 모르는 것을<br><em>분류하고 탐색하다.</em>",
      heroLede: "수학에서 사회 복잡계까지. 난제를 학문명만으로 나열하지 않고, 무엇이 부족한지—이론, 실험, 측정, 확장, 혹은 법칙이 정한 경계인지—여러 축으로 함께 봅니다.",
      heroPosterAlt: "13개 학문 분야와 744개 연구 질문을 표현한 Unsolved Problems 연구 지도",
      exploreProblems: "난제 탐색", viewTaxonomy: "분류 기준 보기",
      orbitMath: "수학", orbitLife: "생명", orbitEarth: "지구", orbitTech: "기술", orbitSociety: "사회",
      catalogSummary: "카탈로그 요약", statItems: "수록 항목", statDisciplines: "대분야", statSubfields: "세부분야", statPriorities: "핵심·우선과제", statPrizeItems: "상금 연계 항목", statSources: "주요 출처",
      mapTitle: "미해결 문제의 지형", mapDescription: "막대는 근거를 확인해 수록한 질문의 범위이며 분야의 중요도 순위가 아닙니다. 선택하면 아래 카탈로그가 같은 조건으로 좁혀집니다.",
      barColorBy: "막대 색상 기준", barColorGroup: "막대 색상 분류 기준", nature: "문제 성격", approach: "해결 방식", feasibility: "가능성", importance: "중요도",
      barLegend: "막대 색상 범례",
      taxonomyTitle: "난제를 보는 여섯 개의 축", taxonomyDescription: "각 축은 서로 독립적입니다. 한 문제를 학문 분야, 중요도, 해결 방식, 문제 성격, 가능성 경계와 횡단 주제로 함께 볼 수 있습니다.",
      axisDiscipline: "학문 분야", axisDisciplineText: "자연과학·수학·공학·의학·인지·사회과학의 13개 대분야와 각 세부분야",
      axisApproach: "필요한 해결 방식", axisApproachText: "이론 중심, 실험 중심, 이론+실험, 공학·시스템으로 구분합니다.",
      axisNature: "문제 성격", axisNatureText: "근본 원리, 예측·모델, 관측·계측, 확장·재현, 설계·시스템, 불가능 경계로 나눕니다.",
      axisFeasibility: "가능성의 경계", axisFeasibilityText: "열린 문제, 현재 기술로 불가능, 현실적 한계, 이론적 불가능을 분리합니다.",
      axisTheme: "횡단 주제", axisThemeText: "에너지, 우주, 양자, 기후, AI, 지속가능성, 건강, 안전·보안으로 학문 간 연결을 찾습니다.",
      axisImportance: "선정 중요도", axisImportanceText: "핵심 난제, 로드맵 우선과제, 주요 프런티어와 불가능 경계를 근거 수준에 따라 구분합니다.",
      importantDistinction: "중요한 구분",
      boundaryNote: "<strong>난제</strong>는 답을 아직 모르는 질문입니다. <strong>이론적 불가능</strong>은 현재 확립된 법칙·정리 또는 소실된 정보가 금지한 경계입니다. 둘을 함께 보여주되 같은 의미로 취급하지 않습니다.",
      catalogTitle: "난제 카탈로그", search: "검색", searchPlaceholder: "암흑물질, 생명 기원, 초전도체…", discipline: "학문 분야", allImportance: "모든 중요도", prize: "상금", allPrizes: "모든 상금 상태",
      allDisciplines: "모든 분야", allApproaches: "모든 방식", allNatures: "모든 성격", allFeasibility: "모든 가능성",
      theme: "횡단 주제", allThemes: "모든 주제", reset: "초기화", activeFilters: "적용된 필터",
      prizeScopeTitle: "상금 표기 기준", prizeScopeText: "증명 상금과 성능 목표형 연구경진을 구분합니다. ‘진행 중’은 상금·경진이 유효하다는 뜻이며 신규 참가 가능성을 보장하지 않습니다.", viewActivePrizes: "현재 상금만 보기",
      emptyTitle: "조건에 맞는 항목이 없습니다.", emptyText: "검색어를 줄이거나 필터를 초기화해 보세요.",
      sourcesTitle: "범위와 출처", sourcesDescription: "분야별 숫자를 맞추지 않고, 연구기관 로드맵·학술 프로그램·대표 난제 목록·공식 상금 주관기관에서 중요 질문을 근거 중심으로 선별한 살아 있는 분류입니다.",
      noQuotaTitle: "수량 목표 없음", noQuotaText: "분야별·세부분야별 개수를 맞추지 않습니다. 권위 있는 목록과 로드맵을 기준으로 중요 질문이 확인될 때만 포함합니다.",
      criterionOne: "학술기관의 명명된 대표 난제", criterionTwo: "최신 연구 로드맵에서 반복되는 우선과제", criterionThree: "여러 연구축 또는 사회에 큰 파급력이 있는 지속적 프런티어", criterionFour: "공식 상금·연구경진이 명시한 검증 가능한 목표",
      methodNote: "중요도는 명명된 난제, 로드맵의 명시적 우선순위와 예상 파급력을 바탕으로 한 편집적 판단입니다. 상금은 문제의 중요도나 해결 가능성을 보증하지 않으며, 총상금은 한 문제의 단독 지급액과 다를 수 있습니다. 검토일은 2026년 8월 1일입니다.",
      footerTagline: "모르는 것의 목록이 아니라, 알아내기 위한 지도.", sourceContribution: "소스 및 기여", classificationPrinciples: "분류 원칙", allProblems: "전체 난제", closeDetails: "상세 보기 닫기",
      whyOpen: "왜 아직 열려 있는가", solvedWhen: "무엇을 해결로 볼 것인가", classification: "분류 해석", prizeInformation: "상금·도전 정보", prizeConditions: "지급·참가 조건", officialRules: "공식 규정", relatedSources: "관련 로드맵·상금 주관기관",
      mapGroup: "분야별 난제 수", mapDistribution: "분포", searchPrefix: "검색", items: "항목", remaining: "개 남음", loadMore: "더 보기",
      fullCatalog: "전체 카탈로그", selectToFilter: "색 구간을 선택하면 바로 필터링됩니다.", selectedConditions: "조건에서", problemWord: "난제",
      problemDescription: "문제입니다."
    },
    en: {
      pageTitle: "Unsolved Problems — Open Research Atlas",
      pageDescription: "A bilingual atlas of unsolved problems across 13 academic disciplines.",
      skipCatalog: "Skip to catalog", brandHome: "Unsolved Problems home", mainNav: "Main navigation", languageSelect: "Choose language",
      navMap: "Map", navTaxonomy: "Taxonomy", navCatalog: "Problems", navSources: "Sources",
      heroTitle: "Map and explore<br><em>what humanity does not yet know.</em>",
      heroLede: "From mathematics to complex social systems. Explore not only disciplines, but what each problem lacks—new theory, experiments, measurement, scale, systems engineering, or a boundary set by established laws.",
      heroPosterAlt: "Unsolved Problems research atlas representing 744 research questions across 13 disciplines",
      exploreProblems: "Explore problems", viewTaxonomy: "View taxonomy",
      orbitMath: "Math", orbitLife: "Life", orbitEarth: "Earth", orbitTech: "Tech", orbitSociety: "Society",
      catalogSummary: "Catalog summary", statItems: "cataloged items", statDisciplines: "disciplines", statSubfields: "subfields", statPriorities: "core & priorities", statPrizeItems: "prize-linked items", statSources: "major sources",
      mapTitle: "The landscape of open problems", mapDescription: "Each bar shows evidence-backed catalog coverage, not a ranking of disciplines. Select a field or color segment to filter the catalog below.",
      barColorBy: "Color bars by", barColorGroup: "Bar color classification", nature: "Problem nature", approach: "Required approach", feasibility: "Feasibility", importance: "Importance",
      barLegend: "Bar color legend",
      taxonomyTitle: "Six axes for reading an open problem", taxonomyDescription: "The axes are independent. A problem can be viewed simultaneously by discipline, importance, required approach, problem nature, feasibility boundary, and cross-cutting theme.",
      axisDiscipline: "Academic discipline", axisDisciplineText: "Thirteen disciplines spanning natural science, mathematics, engineering, medicine, cognition, and social science.",
      axisApproach: "Required approach", axisApproachText: "Theory-led, experiment-led, theory plus experiment, or engineering and systems.",
      axisNature: "Problem nature", axisNatureText: "Fundamental principle, prediction and modeling, observation and measurement, scale and reproducibility, design and systems, or an impossibility boundary.",
      axisFeasibility: "Feasibility boundary", axisFeasibilityText: "Open to solution, beyond current technology, practical limit, or theoretically impossible.",
      axisTheme: "Cross-cutting theme", axisThemeText: "Connect disciplines through energy, space, quantum, climate, AI, sustainability, health, and safety or security.",
      axisImportance: "Selection importance", axisImportanceText: "Separate core open problems, roadmap priorities, major frontiers, and impossibility boundaries by evidence level.",
      importantDistinction: "An important distinction",
      boundaryNote: "An <strong>open problem</strong> is a question whose answer is not yet known. A <strong>theoretical impossibility</strong> is forbidden by established laws, theorems, or irretrievably missing information. This atlas shows both but does not treat them as equivalent.",
      catalogTitle: "Problem catalog", search: "Search", searchPlaceholder: "dark matter, origin of life, superconductors…", discipline: "Discipline", allImportance: "All importance levels", prize: "Prize", allPrizes: "All prize statuses",
      allDisciplines: "All disciplines", allApproaches: "All approaches", allNatures: "All problem types", allFeasibility: "All feasibility levels",
      theme: "Cross-cutting theme", allThemes: "All themes", reset: "Reset", activeFilters: "Active filters",
      prizeScopeTitle: "Prize-labeling scope", prizeScopeText: "Proof prizes are distinguished from performance-based research competitions. ‘Active’ means the prize or competition is current; it does not guarantee that new teams can still enter.", viewActivePrizes: "View active prizes",
      emptyTitle: "No items match these conditions.", emptyText: "Shorten the search or reset the filters.",
      sourcesTitle: "Scope and sources", sourcesDescription: "Discipline totals are never equalized. Important questions are selected from institutional roadmaps, research programs, established problem lists, and official prize organizers using an evidence-led review.",
      noQuotaTitle: "No count quotas", noQuotaText: "Counts are not matched across disciplines or subfields. An item is included only when authoritative lists and roadmaps support its importance.",
      criterionOne: "Named major problems from scholarly institutions", criterionTwo: "Priorities recurring in current research roadmaps", criterionThree: "Durable frontiers with broad scientific or societal leverage", criterionFour: "Verifiable goals defined by official prizes and research competitions",
      methodNote: "Importance is an editorial judgment based on named-problem status, explicit roadmap priority, and expected leverage. A prize does not guarantee importance or solvability, and a total purse may differ from the amount paid for one problem. Reviewed 1 August 2026.",
      footerTagline: "Not just a list of unknowns—a map for finding out.", sourceContribution: "Source and contribute", classificationPrinciples: "Classification principles", allProblems: "All problems", closeDetails: "Close details",
      whyOpen: "Why it remains open", solvedWhen: "What would count as a solution", classification: "How it is classified", prizeInformation: "Prize and challenge information", prizeConditions: "Award and entry conditions", officialRules: "Official rules", relatedSources: "Related roadmaps and prize organizers",
      mapGroup: "Problem counts by discipline", mapDistribution: "distribution", searchPrefix: "Search", items: "items", remaining: "remaining", loadMore: "Load more",
      fullCatalog: "Full catalog", selectToFilter: "Select a color segment to filter immediately.", selectedConditions: "under", problemWord: "problems",
      problemDescription: "problem."
    }
  };

  const paramsAtStart = new URLSearchParams(location.search);
  const storedLanguage = (() => { try { return localStorage.getItem("catalogLanguage"); } catch { return null; } })();
  const state = {
    query: "",
    discipline: "all",
    importance: "all",
    prize: "all",
    approach: "all",
    nature: "all",
    feasibility: "all",
    theme: "all",
    mapLens: "nature",
    lang: paramsAtStart.get("lang") === "en" || (paramsAtStart.get("lang") !== "ko" && storedLanguage === "en") ? "en" : "ko"
  };

  const $ = id => document.getElementById(id);
  const els = {
    total: $("total-count"), disciplines: $("discipline-count"), subfields: $("subfield-count"), priorities: $("priority-count"), prizeCount: $("prize-count"), sources: $("source-count"),
    map: $("discipline-map"), mapLens: $("map-lens"), mapLegend: $("map-legend"), lensSummary: $("lens-summary"),
    resultCount: $("result-count"), search: $("search-input"), discipline: $("discipline-filter"), importance: $("importance-filter"), prize: $("prize-filter"), approach: $("approach-filter"),
    nature: $("nature-filter"), feasibility: $("feasibility-filter"), theme: $("theme-filter"), reset: $("reset-filters"),
    active: $("active-filters"), grid: $("problem-grid"), loadMore: $("load-more"), empty: $("empty-state"),
    sourceGroups: $("source-groups"), dialog: $("problem-dialog"), dialogIndex: $("dialog-index"), dialogContent: $("dialog-content"),
    dialogClose: $("dialog-close"), hoverTooltip: $("hover-tooltip"), languageSwitch: $("language-switch")
  };

  const t = key => UI[state.lang][key];
  const label = item => state.lang === "en" ? (item.labelEn || item.label) : item.label;
  const description = item => state.lang === "en" ? (item.descriptionEn || item.description) : item.description;
  const question = item => state.lang === "en" ? (item.questionEn || item.question) : item.question;
  const subfield = item => state.lang === "en" ? (item.subfieldEn || item.subfield) : item.subfield;
  const whyOpen = item => state.lang === "en" ? (item.whyOpenEn || item.whyOpen) : item.whyOpen;
  const solvedWhen = item => state.lang === "en" ? (item.solvedWhenEn || item.solvedWhen) : item.solvedWhen;
  const localized = (item, key) => state.lang === "en" ? (item[`${key}En`] || item[key]) : item[key];
  const locale = () => state.lang === "en" ? "en-US" : "ko-KR";
  const number = value => Number(value).toLocaleString(locale());

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value).toLocaleLowerCase(state.lang === "en" ? "en-US" : "ko-KR").replace(/\s+/g, " ").trim();
  }

  function itemCount(value) {
    return state.lang === "en" ? `${number(value)} ${value === 1 ? "item" : "items"}` : `${number(value)}개 항목`;
  }

  function problemCount(value) {
    return state.lang === "en" ? `${number(value)} ${value === 1 ? "problem" : "problems"}` : `${number(value)}개 난제`;
  }

  function applyStaticTranslations() {
    document.documentElement.lang = state.lang;
    document.title = t("pageTitle");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("pageDescription"));
    document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach(node => { node.innerHTML = t(node.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(node => { node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder)); });
    document.querySelectorAll("[data-i18n-aria]").forEach(node => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
    document.querySelectorAll("[data-i18n-alt]").forEach(node => { node.setAttribute("alt", t(node.dataset.i18nAlt)); });
    els.languageSwitch.querySelectorAll("button[data-lang]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === state.lang));
    });
  }

  function renderSelect(select, allText, collection) {
    const current = state[select.dataset.stateKey] || select.value || "all";
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = allText;
    select.append(all);
    Object.entries(collection).forEach(([value, item]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label(item);
      select.append(option);
    });
    select.value = current;
  }

  function renderFilterOptions() {
    els.discipline.dataset.stateKey = "discipline";
    els.importance.dataset.stateKey = "importance";
    els.prize.dataset.stateKey = "prize";
    els.approach.dataset.stateKey = "approach";
    els.nature.dataset.stateKey = "nature";
    els.feasibility.dataset.stateKey = "feasibility";
    els.theme.dataset.stateKey = "theme";
    renderSelect(els.discipline, t("allDisciplines"), meta.disciplines);
    renderSelect(els.importance, t("allImportance"), meta.importance);
    renderSelect(els.prize, t("allPrizes"), meta.prizeStatuses);
    renderSelect(els.approach, t("allApproaches"), meta.approaches);
    renderSelect(els.nature, t("allNatures"), meta.natures);
    renderSelect(els.feasibility, t("allFeasibility"), meta.feasibility);
    renderSelect(els.theme, t("allThemes"), meta.themes);
  }

  function readURLState() {
    const params = new URLSearchParams(location.search);
    const allowed = {
      discipline: meta.disciplines,
      importance: meta.importance,
      prize: meta.prizeStatuses,
      approach: meta.approaches,
      nature: meta.natures,
      feasibility: meta.feasibility,
      theme: meta.themes
    };
    state.query = params.get("q") || "";
    const lens = params.get("lens");
    if (["nature", "approach", "feasibility", "importance"].includes(lens)) state.mapLens = lens;
    Object.entries(allowed).forEach(([key, collection]) => {
      const value = params.get(key);
      if (value && collection[value]) state[key] = value;
    });
  }

  function syncControls() {
    els.search.value = state.query;
    ["discipline", "importance", "prize", "approach", "nature", "feasibility", "theme"].forEach(key => { els[key].value = state[key]; });
    els.mapLens.querySelectorAll("button[data-lens]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.lens === state.mapLens));
    });
  }

  function writeURLState() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    ["discipline", "importance", "prize", "approach", "nature", "feasibility", "theme"].forEach(key => {
      if (state[key] !== "all") params.set(key, state[key]);
    });
    if (state.mapLens !== "nature") params.set("lens", state.mapLens);
    if (state.lang !== "ko") params.set("lang", state.lang);
    const queryString = params.toString();
    history.replaceState(null, "", `${location.pathname}${queryString ? `?${queryString}` : ""}${location.hash}`);
  }

  function matches(problem, options = {}) {
    if (!options.ignoreDiscipline && state.discipline !== "all" && problem.discipline !== state.discipline) return false;
    if (options.ignoreAxis !== "importance" && state.importance !== "all" && problem.importance !== state.importance) return false;
    if (state.prize !== "all" && !(problem.prizeIds || []).some(prizeId => prizes[prizeId]?.status === state.prize)) return false;
    if (options.ignoreAxis !== "approach" && state.approach !== "all" && problem.approach !== state.approach) return false;
    if (options.ignoreAxis !== "nature" && state.nature !== "all" && problem.nature !== state.nature) return false;
    if (options.ignoreAxis !== "feasibility" && state.feasibility !== "all" && problem.feasibility !== state.feasibility) return false;
    if (state.theme !== "all" && !(problem.themes || []).includes(state.theme)) return false;
    if (state.query) {
      const haystack = normalize([
        problem.question, problem.questionEn, problem.subfield, problem.subfieldEn,
        meta.disciplines[problem.discipline].label, meta.disciplines[problem.discipline].labelEn,
        meta.importance[problem.importance].label, meta.importance[problem.importance].labelEn,
        meta.approaches[problem.approach].label, meta.approaches[problem.approach].labelEn,
        meta.natures[problem.nature].label, meta.natures[problem.nature].labelEn,
        meta.feasibility[problem.feasibility].label, meta.feasibility[problem.feasibility].labelEn,
        ...(problem.prizeIds || []).flatMap(prizeId => {
          const prize = prizes[prizeId];
          return prize ? [prize.title, prize.titleEn, prize.organization, prize.organizationEn, prize.amount, prize.amountEn] : [];
        }),
        ...(problem.themes || []).flatMap(key => [meta.themes[key]?.label, meta.themes[key]?.labelEn])
      ].filter(Boolean).join(" "));
      if (!haystack.includes(normalize(state.query))) return false;
    }
    return true;
  }

  const filteredProblems = () => problems
    .filter(problem => matches(problem))
    .sort((a, b) => meta.importance[b.importance].rank - meta.importance[a.importance].rank || a.id.localeCompare(b.id));

  function renderStats() {
    els.total.textContent = number(problems.length);
    els.disciplines.textContent = number(Object.keys(meta.disciplines).length);
    els.subfields.textContent = number(new Set(problems.map(item => `${item.discipline}:${item.subfield}`)).size);
    els.priorities.textContent = number(problems.filter(item => ["core", "roadmap"].includes(item.importance)).length);
    els.prizeCount.textContent = number(problems.filter(item => (item.prizeIds || []).length > 0).length);
    els.sources.textContent = number(Object.keys(sources).length);
  }

  function renderMap() {
    const axisCollections = { nature: meta.natures, approach: meta.approaches, feasibility: meta.feasibility, importance: meta.importance };
    const axisLabels = { nature: t("nature"), approach: t("approach"), feasibility: t("feasibility"), importance: t("importance") };
    const collection = axisCollections[state.mapLens];
    const mapPool = problems.filter(problem => matches(problem, { ignoreDiscipline: true, ignoreAxis: state.mapLens }));
    const values = disciplineOrder.map(id => {
      const disciplineProblems = mapPool.filter(problem => problem.discipline === id);
      return {
        id,
        count: disciplineProblems.length,
        segments: Object.keys(collection).map(key => ({ key, count: disciplineProblems.filter(problem => problem[state.mapLens] === key).length }))
      };
    });
    const max = Math.max(1, ...values.map(item => item.count));

    els.mapLegend.setAttribute("aria-label", t("barLegend"));
    els.mapLegend.innerHTML = Object.entries(collection).map(([key, item]) => `
      <button class="legend-item" type="button" data-axis="${state.mapLens}" data-key="${key}"
        aria-pressed="${state[state.mapLens] === key}"
        data-hover-title="${escapeHTML(label(item))}"
        data-hover-text="${escapeHTML(description(item))}">
        <span class="legend-swatch" style="--segment-color:${item.color}"></span>
        <span>${escapeHTML(label(item))}</span>
      </button>`).join("");

    els.map.setAttribute("aria-label", t("mapGroup"));
    els.map.innerHTML = values.map(({ id, count, segments }) => {
      const discipline = meta.disciplines[id];
      const disciplineLabel = label(discipline);
      const selected = state.discipline === id;
      const segmentHTML = segments.filter(segment => segment.count > 0).map(segment => {
        const item = collection[segment.key];
        const width = (segment.count / max) * 100;
        const isActive = state[state.mapLens] === "all" || state[state.mapLens] === segment.key;
        return `<button class="map-segment" type="button" data-axis="${state.mapLens}" data-key="${segment.key}"
          aria-pressed="${state[state.mapLens] === segment.key}"
          aria-label="${escapeHTML(`${disciplineLabel} · ${label(item)} · ${problemCount(segment.count)}`)}"
          data-hover-title="${escapeHTML(`${disciplineLabel} · ${label(item)}`)}"
          data-hover-text="${escapeHTML(`${problemCount(segment.count)}. ${description(item)}`)}"
          style="--segment-color:${item.color};--segment-width:${width}%;--segment-opacity:${isActive ? 1 : .28}">
          <span>${segment.count >= 6 ? number(segment.count) : ""}</span>
        </button>`;
      }).join("");
      return `
        <div class="map-row">
          <button class="map-discipline" type="button" data-discipline="${id}" aria-pressed="${selected}">
            <span class="discipline-dot" style="--discipline-color:${discipline.color}"></span>
            <span>${escapeHTML(disciplineLabel)}</span>
          </button>
          <div class="map-track" role="group" aria-label="${escapeHTML(`${disciplineLabel} · ${axisLabels[state.mapLens]} ${t("mapDistribution")}`)}">${segmentHTML}</div>
          <span class="map-value">${number(count)}</span>
        </div>`;
    }).join("");

    const lensParts = [];
    if (state.approach !== "all") lensParts.push(label(meta.approaches[state.approach]));
    if (state.nature !== "all") lensParts.push(label(meta.natures[state.nature]));
    if (state.feasibility !== "all") lensParts.push(label(meta.feasibility[state.feasibility]));
    if (state.importance !== "all") lensParts.push(label(meta.importance[state.importance]));
    if (state.prize !== "all") lensParts.push(label(meta.prizeStatuses[state.prize]));
    if (state.theme !== "all") lensParts.push(label(meta.themes[state.theme]));
    if (state.query) lensParts.push(`${t("searchPrefix")}: “${state.query}”`);
    els.lensSummary.textContent = lensParts.length
      ? `${lensParts.join(" · ")} ${t("selectedConditions")} ${axisLabels[state.mapLens]} ${t("mapDistribution")}`
      : `${t("fullCatalog")} · ${axisLabels[state.mapLens]} ${t("mapDistribution")} — ${t("selectToFilter")}`;

    els.map.querySelectorAll(".map-discipline").forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.discipline;
        state.discipline = state.discipline === value ? "all" : value;
        visibleCount = PAGE_SIZE;
        syncControls();
        update();
        document.querySelector("#catalog").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    [...els.map.querySelectorAll(".map-segment"), ...els.mapLegend.querySelectorAll(".legend-item")].forEach(button => {
      button.addEventListener("click", () => {
        const axis = button.dataset.axis;
        const value = button.dataset.key;
        state[axis] = state[axis] === value ? "all" : value;
        visibleCount = PAGE_SIZE;
        syncControls();
        update();
      });
    });
    bindHoverTooltips(els.map);
    bindHoverTooltips(els.mapLegend);
  }

  function cardHTML(problem) {
    const discipline = meta.disciplines[problem.discipline];
    const importance = meta.importance[problem.importance];
    const boundaryClass = problem.nature === "boundary" ? " boundary" : "";
    const themes = (problem.themes || []).slice(0, 2).map(key => meta.themes[key]).filter(Boolean);
    const linkedPrizes = (problem.prizeIds || []).map(prizeId => prizes[prizeId]).filter(Boolean);
    const featuredPrize = linkedPrizes[0];
    const natureLabel = label(meta.natures[problem.nature]);
    return `
      <button class="problem-card" type="button" data-id="${problem.id}"
        data-hover-title="${escapeHTML(question(problem))}"
        data-hover-text="${escapeHTML(`${featuredPrize ? `${localized(featuredPrize, "amount")} · ` : ""}${label(importance)} · ${subfield(problem)} · ${natureLabel}. ${whyOpen(problem)}`)}"
        style="--discipline-soft:${discipline.soft}">
        <span class="card-top">
          <span class="card-number">${problem.id}</span>
          <span class="discipline-pill">${escapeHTML(label(discipline))} · ${escapeHTML(subfield(problem))}</span>
        </span>
        <h3>${escapeHTML(question(problem))}</h3>
        <span class="card-meta">
          ${featuredPrize ? `<span class="meta-pill prize-badge" style="--prize-color:${meta.prizeStatuses[featuredPrize.status].color}">◆ ${escapeHTML(localized(featuredPrize, "amountShort"))}</span>` : ""}
          <span class="meta-pill importance" style="--importance-color:${importance.color}">${escapeHTML(label(importance))}</span>
          <span class="meta-pill">${escapeHTML(label(meta.approaches[problem.approach]))}</span>
          <span class="meta-pill">${escapeHTML(natureLabel)}</span>
          <span class="meta-pill${boundaryClass}">${escapeHTML(label(meta.feasibility[problem.feasibility]))}</span>
          ${themes.map(item => `<span class="meta-pill theme">#${escapeHTML(label(item))}</span>`).join("")}
        </span>
      </button>`;
  }

  function renderGrid() {
    const result = filteredProblems();
    const visible = result.slice(0, visibleCount);
    els.resultCount.textContent = itemCount(result.length);
    els.grid.innerHTML = visible.map(cardHTML).join("");
    els.empty.hidden = result.length !== 0;
    els.loadMore.hidden = visible.length >= result.length;
    if (!els.loadMore.hidden) {
      const left = result.length - visible.length;
      els.loadMore.textContent = state.lang === "en" ? `${t("loadMore")} · ${number(left)} ${t("remaining")}` : `${t("loadMore")} · ${number(left)}${t("remaining")}`;
    }
    els.grid.querySelectorAll(".problem-card").forEach(card => card.addEventListener("click", () => openDialog(card.dataset.id)));
    bindHoverTooltips(els.grid);
  }

  let tooltipTarget = null;
  function positionTooltip(target) {
    const tooltip = els.hoverTooltip;
    const rect = target.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const margin = 12;
    let left = rect.left + (rect.width - tipRect.width) / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
    let top = rect.top - tipRect.height - margin;
    if (top < margin) top = rect.bottom + margin;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function showTooltip(target) {
    tooltipTarget = target;
    els.hoverTooltip.innerHTML = `<strong>${escapeHTML(target.dataset.hoverTitle)}</strong><span>${escapeHTML(target.dataset.hoverText)}</span>`;
    els.hoverTooltip.hidden = false;
    target.setAttribute("aria-describedby", "hover-tooltip");
    requestAnimationFrame(() => positionTooltip(target));
  }

  function hideTooltip(target) {
    if (tooltipTarget !== target) return;
    target.removeAttribute("aria-describedby");
    els.hoverTooltip.hidden = true;
    tooltipTarget = null;
  }

  function bindHoverTooltips(scope) {
    scope.querySelectorAll("[data-hover-title]").forEach(target => {
      target.addEventListener("mouseenter", () => showTooltip(target));
      target.addEventListener("mouseleave", () => hideTooltip(target));
      target.addEventListener("focus", () => showTooltip(target));
      target.addEventListener("blur", () => hideTooltip(target));
    });
  }

  function renderActiveFilters() {
    const chips = [];
    if (state.query) chips.push({ key: "query", label: `${t("searchPrefix")}: ${state.query}` });
    if (state.discipline !== "all") chips.push({ key: "discipline", label: label(meta.disciplines[state.discipline]) });
    if (state.importance !== "all") chips.push({ key: "importance", label: label(meta.importance[state.importance]) });
    if (state.prize !== "all") chips.push({ key: "prize", label: label(meta.prizeStatuses[state.prize]) });
    if (state.approach !== "all") chips.push({ key: "approach", label: label(meta.approaches[state.approach]) });
    if (state.nature !== "all") chips.push({ key: "nature", label: label(meta.natures[state.nature]) });
    if (state.feasibility !== "all") chips.push({ key: "feasibility", label: label(meta.feasibility[state.feasibility]) });
    if (state.theme !== "all") chips.push({ key: "theme", label: `#${label(meta.themes[state.theme])}` });
    els.active.innerHTML = chips.map(chip => `<button class="filter-chip" type="button" data-filter="${chip.key}">${escapeHTML(chip.label)}</button>`).join("");
    els.active.querySelectorAll(".filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const key = chip.dataset.filter;
        if (key === "query") state.query = "";
        else state[key] = "all";
        visibleCount = PAGE_SIZE;
        syncControls();
        update();
      });
    });
  }

  function openDialog(id) {
    const problem = problems.find(item => item.id === id);
    if (!problem) return;
    const discipline = meta.disciplines[problem.discipline];
    const importance = meta.importance[problem.importance];
    const linkedSources = problem.sourceIds.map(sourceId => sources[sourceId]).filter(Boolean);
    const linkedPrizes = (problem.prizeIds || []).map(prizeId => prizes[prizeId]).filter(Boolean);
    const themeTags = (problem.themes || []).map(key => meta.themes[key]).filter(Boolean);
    els.dialogIndex.textContent = `${problem.id} · ${label(discipline)} / ${subfield(problem)}`;
    els.dialogContent.innerHTML = `
      <div class="dialog-body">
        <div class="dialog-tags">
          ${linkedPrizes.map(prize => `<span class="meta-pill prize-badge" style="--prize-color:${meta.prizeStatuses[prize.status].color}">◆ ${escapeHTML(localized(prize, "amountShort"))}</span>`).join("")}
          <span class="meta-pill importance" style="--importance-color:${importance.color}">${escapeHTML(label(importance))}</span>
          <span class="meta-pill">${escapeHTML(label(meta.approaches[problem.approach]))}</span>
          <span class="meta-pill">${escapeHTML(label(meta.natures[problem.nature]))}</span>
          <span class="meta-pill${problem.nature === "boundary" ? " boundary" : ""}">${escapeHTML(label(meta.feasibility[problem.feasibility]))}</span>
          ${themeTags.map(item => `<span class="meta-pill theme">#${escapeHTML(label(item))}</span>`).join("")}
        </div>
        <h2 id="dialog-title">${escapeHTML(question(problem))}</h2>
        <section class="dialog-section"><h3>${escapeHTML(t("whyOpen"))}</h3><p>${escapeHTML(whyOpen(problem))}</p></section>
        <section class="dialog-section"><h3>${escapeHTML(t("solvedWhen"))}</h3><p>${escapeHTML(solvedWhen(problem))}</p></section>
        <section class="dialog-section"><h3>${escapeHTML(t("classification"))}</h3><p>${escapeHTML(description(importance))} ${escapeHTML(description(meta.approaches[problem.approach]))} ${escapeHTML(description(meta.natures[problem.nature]))} ${escapeHTML(description(meta.feasibility[problem.feasibility]))}</p></section>
        ${linkedPrizes.length ? `<section class="dialog-section"><h3>${escapeHTML(t("prizeInformation"))}</h3><div class="prize-list">
          ${linkedPrizes.map(prize => `<article class="prize-entry" style="--prize-color:${meta.prizeStatuses[prize.status].color}">
            <div class="prize-entry-top"><strong>${escapeHTML(localized(prize, "title"))}</strong><span>${escapeHTML(localized(prize, "amount"))}</span></div>
            <p class="prize-organization">${escapeHTML(localized(prize, "organization"))} · ${escapeHTML(label(meta.prizeTypes[prize.type]))} · ${escapeHTML(label(meta.prizeStatuses[prize.status]))}</p>
            <p>${escapeHTML(localized(prize, "summary"))}</p>
            <p><b>${escapeHTML(t("prizeConditions"))}:</b> ${escapeHTML(localized(prize, "conditions"))}</p>
            <a href="${prize.rulesUrl}" target="_blank" rel="noreferrer">${escapeHTML(t("officialRules"))} ↗</a>
          </article>`).join("")}
        </div></section>` : ""}
        <section class="dialog-section"><h3>${escapeHTML(t("relatedSources"))}</h3><div class="dialog-sources">
          ${linkedSources.map(source => `<a href="${source.url}" target="_blank" rel="noreferrer">${escapeHTML(source.title)} ↗</a>`).join("")}
        </div></section>
      </div>`;
    if (typeof els.dialog.showModal === "function") els.dialog.showModal();
    else {
      els.dialog.setAttribute("open", "");
      els.dialog.classList.add("dialog-fallback");
      document.body.classList.add("dialog-open");
    }
  }

  function closeDialog() {
    if (typeof els.dialog.close === "function" && els.dialog.open && !els.dialog.classList.contains("dialog-fallback")) els.dialog.close();
    else {
      els.dialog.removeAttribute("open");
      els.dialog.classList.remove("dialog-fallback");
      document.body.classList.remove("dialog-open");
    }
  }

  function renderSources() {
    els.sourceGroups.innerHTML = disciplineOrder.map(id => {
      const discipline = meta.disciplines[id];
      const entries = Object.values(sources).filter(source => source.discipline === id);
      return `<section class="source-group"><h3>${escapeHTML(label(discipline))}</h3><div class="source-list">
        ${entries.map(source => `<a href="${source.url}" target="_blank" rel="noreferrer">${escapeHTML(source.title)}</a>`).join("")}
      </div></section>`;
    }).join("");
  }

  function update() {
    writeURLState();
    renderMap();
    renderActiveFilters();
    renderGrid();
  }

  function renderLanguage() {
    applyStaticTranslations();
    renderFilterOptions();
    syncControls();
    renderStats();
    renderSources();
    update();
  }

  function resetFilters() {
    state.query = "";
    state.discipline = "all";
    state.importance = "all";
    state.prize = "all";
    state.approach = "all";
    state.nature = "all";
    state.feasibility = "all";
    state.theme = "all";
    visibleCount = PAGE_SIZE;
    syncControls();
    update();
  }

  readURLState();
  renderLanguage();

  let searchTimer;
  els.search.addEventListener("input", event => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = event.target.value.trim();
      visibleCount = PAGE_SIZE;
      update();
    }, 120);
  });
  ["discipline", "importance", "prize", "approach", "nature", "feasibility", "theme"].forEach(key => {
    els[key].addEventListener("change", event => {
      state[key] = event.target.value;
      visibleCount = PAGE_SIZE;
      update();
    });
  });
  els.reset.addEventListener("click", resetFilters);
  els.mapLens.addEventListener("click", event => {
    const button = event.target.closest("button[data-lens]");
    if (!button) return;
    state.mapLens = button.dataset.lens;
    syncControls();
    update();
  });
  els.loadMore.addEventListener("click", () => { visibleCount += PAGE_SIZE; renderGrid(); });
  els.languageSwitch.addEventListener("click", event => {
    const button = event.target.closest("button[data-lang]");
    if (!button || button.dataset.lang === state.lang) return;
    if (tooltipTarget) hideTooltip(tooltipTarget);
    closeDialog();
    state.lang = button.dataset.lang;
    try { localStorage.setItem("catalogLanguage", state.lang); } catch { /* preference remains URL-only */ }
    visibleCount = PAGE_SIZE;
    renderLanguage();
  });
  els.dialogClose.addEventListener("click", closeDialog);
  els.dialog.addEventListener("click", event => { if (event.target === els.dialog) closeDialog(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && els.dialog.hasAttribute("open")) closeDialog(); });
  window.addEventListener("scroll", () => { if (tooltipTarget) hideTooltip(tooltipTarget); }, { passive: true, capture: true });
})();
