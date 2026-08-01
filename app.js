(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const meta = window.CATALOG_META;
  const sources = window.CATALOG_SOURCES;
  const PAGE_SIZE = 30;
  const disciplineOrder = Object.keys(meta.disciplines);
  let visibleCount = PAGE_SIZE;

  const state = {
    query: "",
    discipline: "all",
    approach: "all",
    nature: "all",
    feasibility: "all"
  };

  const $ = id => document.getElementById(id);
  const els = {
    total: $("total-count"),
    disciplines: $("discipline-count"),
    subfields: $("subfield-count"),
    sources: $("source-count"),
    map: $("discipline-map"),
    lensSummary: $("lens-summary"),
    resultCount: $("result-count"),
    search: $("search-input"),
    discipline: $("discipline-filter"),
    approach: $("approach-filter"),
    nature: $("nature-filter"),
    feasibility: $("feasibility-filter"),
    reset: $("reset-filters"),
    active: $("active-filters"),
    grid: $("problem-grid"),
    loadMore: $("load-more"),
    empty: $("empty-state"),
    sourceGroups: $("source-groups"),
    dialog: $("problem-dialog"),
    dialogIndex: $("dialog-index"),
    dialogContent: $("dialog-content"),
    dialogClose: $("dialog-close")
  };

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value).toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
  }

  function addOptions(select, collection) {
    Object.entries(collection).forEach(([value, item]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = item.label;
      select.append(option);
    });
  }

  function readURLState() {
    const params = new URLSearchParams(location.search);
    const allowed = {
      discipline: meta.disciplines,
      approach: meta.approaches,
      nature: meta.natures,
      feasibility: meta.feasibility
    };
    state.query = params.get("q") || "";
    Object.entries(allowed).forEach(([key, collection]) => {
      const value = params.get(key);
      if (value && collection[value]) state[key] = value;
    });
  }

  function syncControls() {
    els.search.value = state.query;
    els.discipline.value = state.discipline;
    els.approach.value = state.approach;
    els.nature.value = state.nature;
    els.feasibility.value = state.feasibility;
  }

  function writeURLState() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    ["discipline", "approach", "nature", "feasibility"].forEach(key => {
      if (state[key] !== "all") params.set(key, state[key]);
    });
    const queryString = params.toString();
    history.replaceState(null, "", `${location.pathname}${queryString ? `?${queryString}` : ""}${location.hash}`);
  }

  function matches(problem, options = {}) {
    const ignoreDiscipline = options.ignoreDiscipline === true;
    if (!ignoreDiscipline && state.discipline !== "all" && problem.discipline !== state.discipline) return false;
    if (state.approach !== "all" && problem.approach !== state.approach) return false;
    if (state.nature !== "all" && problem.nature !== state.nature) return false;
    if (state.feasibility !== "all" && problem.feasibility !== state.feasibility) return false;
    if (state.query) {
      const haystack = normalize([
        problem.question,
        problem.subfield,
        meta.disciplines[problem.discipline].label,
        meta.approaches[problem.approach].label,
        meta.natures[problem.nature].label,
        meta.feasibility[problem.feasibility].label
      ].join(" "));
      if (!haystack.includes(normalize(state.query))) return false;
    }
    return true;
  }

  function filteredProblems() {
    return problems.filter(problem => matches(problem));
  }

  function renderStats() {
    els.total.textContent = problems.length.toLocaleString("ko-KR");
    els.disciplines.textContent = Object.keys(meta.disciplines).length;
    els.subfields.textContent = new Set(problems.map(item => `${item.discipline}:${item.subfield}`)).size;
    els.sources.textContent = Object.keys(sources).length;
  }

  function renderMap() {
    const mapPool = problems.filter(problem => matches(problem, { ignoreDiscipline: true }));
    const values = disciplineOrder.map(id => ({
      id,
      count: mapPool.filter(problem => problem.discipline === id).length
    }));
    const max = Math.max(1, ...values.map(item => item.count));

    els.map.innerHTML = values.map(({ id, count }) => {
      const discipline = meta.disciplines[id];
      const width = Math.max(0, (count / max) * 100);
      const selected = state.discipline === id;
      return `
        <button class="map-row" type="button" data-discipline="${id}" aria-pressed="${selected}" style="--bar-color:${discipline.color};--bar-width:${width}%">
          <span class="map-row-label">${escapeHTML(discipline.label)}</span>
          <span class="map-track"><span class="map-bar"></span></span>
          <span class="map-value">${count}</span>
        </button>`;
    }).join("");

    const lensParts = [];
    if (state.approach !== "all") lensParts.push(meta.approaches[state.approach].label);
    if (state.nature !== "all") lensParts.push(meta.natures[state.nature].label);
    if (state.feasibility !== "all") lensParts.push(meta.feasibility[state.feasibility].label);
    if (state.query) lensParts.push(`“${state.query}” 검색`);
    els.lensSummary.textContent = lensParts.length
      ? `${lensParts.join(" · ")} 조건에서 분야별 분포`
      : "현재 전체 카탈로그의 분야별 수록 범위";

    els.map.querySelectorAll(".map-row").forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.discipline;
        state.discipline = state.discipline === value ? "all" : value;
        visibleCount = PAGE_SIZE;
        syncControls();
        update();
        document.querySelector("#catalog").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function cardHTML(problem) {
    const discipline = meta.disciplines[problem.discipline];
    const boundaryClass = problem.nature === "boundary" ? " boundary" : "";
    return `
      <button class="problem-card" type="button" data-id="${problem.id}" style="--discipline-soft:${discipline.soft}">
        <span class="card-top">
          <span class="card-number">${problem.id}</span>
          <span class="discipline-pill">${escapeHTML(discipline.label)} · ${escapeHTML(problem.subfield)}</span>
        </span>
        <h3>${escapeHTML(problem.question)}</h3>
        <span class="card-meta">
          <span class="meta-pill">${escapeHTML(meta.approaches[problem.approach].label)}</span>
          <span class="meta-pill">${escapeHTML(meta.natures[problem.nature].label)}</span>
          <span class="meta-pill${boundaryClass}">${escapeHTML(meta.feasibility[problem.feasibility].label)}</span>
        </span>
      </button>`;
  }

  function renderGrid() {
    const result = filteredProblems();
    const visible = result.slice(0, visibleCount);
    els.resultCount.textContent = `${result.length.toLocaleString("ko-KR")}개 항목`;
    els.grid.innerHTML = visible.map(cardHTML).join("");
    els.empty.hidden = result.length !== 0;
    els.loadMore.hidden = visible.length >= result.length;
    if (!els.loadMore.hidden) {
      els.loadMore.textContent = `더 보기 · ${result.length - visible.length}개 남음`;
    }
    els.grid.querySelectorAll(".problem-card").forEach(card => {
      card.addEventListener("click", () => openDialog(card.dataset.id));
    });
  }

  function renderActiveFilters() {
    const chips = [];
    if (state.query) chips.push({ key: "query", label: `검색: ${state.query}` });
    if (state.discipline !== "all") chips.push({ key: "discipline", label: meta.disciplines[state.discipline].label });
    if (state.approach !== "all") chips.push({ key: "approach", label: meta.approaches[state.approach].label });
    if (state.nature !== "all") chips.push({ key: "nature", label: meta.natures[state.nature].label });
    if (state.feasibility !== "all") chips.push({ key: "feasibility", label: meta.feasibility[state.feasibility].label });
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
    const linkedSources = problem.sourceIds.map(sourceId => sources[sourceId]).filter(Boolean);
    els.dialogIndex.textContent = `${problem.id} · ${discipline.label} / ${problem.subfield}`;
    els.dialogContent.innerHTML = `
      <div class="dialog-body">
        <div class="dialog-tags">
          <span class="meta-pill">${escapeHTML(meta.approaches[problem.approach].label)}</span>
          <span class="meta-pill">${escapeHTML(meta.natures[problem.nature].label)}</span>
          <span class="meta-pill${problem.nature === "boundary" ? " boundary" : ""}">${escapeHTML(meta.feasibility[problem.feasibility].label)}</span>
        </div>
        <h2 id="dialog-title">${escapeHTML(problem.question)}</h2>
        <section class="dialog-section">
          <h3>왜 아직 열려 있는가</h3>
          <p>${escapeHTML(problem.whyOpen)}</p>
        </section>
        <section class="dialog-section">
          <h3>무엇을 해결로 볼 것인가</h3>
          <p>${escapeHTML(problem.solvedWhen)}</p>
        </section>
        <section class="dialog-section">
          <h3>분류 해석</h3>
          <p>${escapeHTML(meta.approaches[problem.approach].description)} ${escapeHTML(meta.natures[problem.nature].description)} ${escapeHTML(meta.feasibility[problem.feasibility].description)}</p>
        </section>
        <section class="dialog-section">
          <h3>관련 로드맵·기관</h3>
          <div class="dialog-sources">
            ${linkedSources.map(source => `<a href="${source.url}" target="_blank" rel="noreferrer">${escapeHTML(source.title)} ↗</a>`).join("")}
          </div>
        </section>
      </div>`;
    if (typeof els.dialog.showModal === "function") {
      els.dialog.showModal();
    } else {
      els.dialog.setAttribute("open", "");
      els.dialog.classList.add("dialog-fallback");
      document.body.classList.add("dialog-open");
    }
  }

  function closeDialog() {
    if (typeof els.dialog.close === "function" && els.dialog.open && !els.dialog.classList.contains("dialog-fallback")) {
      els.dialog.close();
    } else {
      els.dialog.removeAttribute("open");
      els.dialog.classList.remove("dialog-fallback");
      document.body.classList.remove("dialog-open");
    }
  }

  function renderSources() {
    els.sourceGroups.innerHTML = disciplineOrder.map(id => {
      const discipline = meta.disciplines[id];
      const entries = Object.values(sources).filter(source => source.discipline === id);
      return `
        <section class="source-group">
          <h3>${escapeHTML(discipline.label)}</h3>
          <div class="source-list">
            ${entries.map(source => `<a href="${source.url}" target="_blank" rel="noreferrer">${escapeHTML(source.title)}</a>`).join("")}
          </div>
        </section>`;
    }).join("");
  }

  function update() {
    writeURLState();
    renderMap();
    renderActiveFilters();
    renderGrid();
  }

  function resetFilters() {
    state.query = "";
    state.discipline = "all";
    state.approach = "all";
    state.nature = "all";
    state.feasibility = "all";
    visibleCount = PAGE_SIZE;
    syncControls();
    update();
  }

  addOptions(els.discipline, meta.disciplines);
  addOptions(els.approach, meta.approaches);
  addOptions(els.nature, meta.natures);
  addOptions(els.feasibility, meta.feasibility);
  readURLState();
  syncControls();
  renderStats();
  renderSources();
  update();

  let searchTimer;
  els.search.addEventListener("input", event => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = event.target.value.trim();
      visibleCount = PAGE_SIZE;
      update();
    }, 120);
  });
  ["discipline", "approach", "nature", "feasibility"].forEach(key => {
    els[key].addEventListener("change", event => {
      state[key] = event.target.value;
      visibleCount = PAGE_SIZE;
      update();
    });
  });
  els.reset.addEventListener("click", resetFilters);
  els.loadMore.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    renderGrid();
  });
  els.dialogClose.addEventListener("click", closeDialog);
  els.dialog.addEventListener("click", event => {
    if (event.target === els.dialog) closeDialog();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && els.dialog.hasAttribute("open")) closeDialog();
  });
})();
