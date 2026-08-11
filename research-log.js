(function () {
  "use strict";
  const problems = window.PROBLEMS || [];
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const sources = window.CATALOG_SOURCES || {};
  const params = new URLSearchParams(location.search);
  let lang = params.get("lang") === "en" ? "en" : "ko";
  const cycle = cycles.find(item => item.id === params.get("cycle")) || cycles[0];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const pair = item => lang === "en" ? (item?.textEn || item?.text || "") : (item?.text || "");
  const local = (item, key) => lang === "en" ? (item?.[`${key}En`] || item?.[key] || "") : (item?.[key] || "");
  const text = (id, value) => { if ($(id)) $(id).textContent = value; };
  const UI = {
    ko: { skip: "연구 기록으로 건너뛰기", home: "Unsolved Problems 홈", back: "← 지도로 돌아가기", next: "다음 출발점", toc: "이 기록에서", verified: "확인된 사실", program: "공동 시험", problems: "선정 문제", connections: "구조적 연결", record: "연구 기록", sources: "근거", verifiedTitle: "이번 사이클에서 확인한 사실", problemsTitle: "하나의 폐루프를 이루는 다섯 병목", connectionsTitle: "방법이 이동할 수 있는 정확한 지점", recordTitle: "이번에 바뀐 판단과 남긴 경계", sourcesTitle: "판단에 사용한 원자료", design: "시험 설계", adjudication: "독립 판정", metrics: "주 판정량", success: "계속할 조건", stop: "중단 조건", source: "근거 열기", role: "폐루프에서의 역할", bottleneck: "병목", mapping: "변수 대응", minimumTest: "최소 검증", failure: "연결 한계", footer: "사실은 출처에, 제안은 기각 규칙에, 진전은 독립 판정에 묶습니다.", active: "진행 중", problemsCount: "선정 문제", linksCount: "구조적 연결" },
    en: { skip: "Skip to research record", home: "Unsolved Problems home", back: "← Back to atlas", next: "Next starting point", toc: "In this record", verified: "Verified findings", program: "Joint test", problems: "Selected problems", connections: "Structural links", record: "Research record", sources: "Evidence", verifiedTitle: "Facts verified in this cycle", problemsTitle: "Five bottlenecks forming one closed loop", connectionsTitle: "Exact points where methods can transfer", recordTitle: "Judgments changed and boundaries retained", sourcesTitle: "Primary evidence used for adjudication", design: "Test design", adjudication: "Independent adjudication", metrics: "Primary metrics", success: "Advance rule", stop: "Stop rule", source: "Open evidence", role: "Role in the loop", bottleneck: "Bottleneck", mapping: "Variable mapping", minimumTest: "Minimum test", failure: "Link boundary", footer: "Bind facts to sources, proposals to rejection rules, and progress to independent adjudication.", active: "Active", problemsCount: "selected problems", linksCount: "structural links" }
  };
  const t = key => UI[lang][key];

  function problemURL(problem) { return `solve.html?id=${encodeURIComponent(problem.id)}&lang=${lang}`; }
  function updateStatic() {
    document.documentElement.lang = lang;
    text("skip-link", t("skip")); $("brand-home").setAttribute("aria-label", t("home"));
    text("back-link", t("back")); text("next-label", t("next")); text("toc-title", t("toc"));
    for (const key of ["verified", "program", "problems", "connections", "record", "sources"]) text(`toc-${key}`, t(key));
    text("verified-title", t("verifiedTitle")); text("problems-title", t("problemsTitle")); text("connections-title", t("connectionsTitle")); text("record-title", t("recordTitle")); text("sources-title", t("sourcesTitle")); text("footer-note", t("footer"));
    $("log-language-switch").querySelectorAll("button[data-lang]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.lang === lang)));
  }

  function render() {
    if (!cycle) return;
    updateStatic();
    text("cycle-id", `${cycle.id} · ${cycle.startedOn} · ${t("active")}`);
    text("cycle-title", local(cycle, "title"));
    text("cycle-reason", local(cycle, "selectionReason"));
    text("cycle-meta", "");
    $("cycle-meta").innerHTML = `<span>${cycle.problemIds.length} ${esc(t("problemsCount"))}</span><span>${connections.length} ${esc(t("linksCount"))}</span><span>${esc(cycle.reviewedOn)}</span>`;
    text("next-cycle", pair(cycle.nextCycle));
    text("program-title", pair(cycle.sharedProgram.name)); text("program-thesis", pair(cycle.sharedProgram.thesis));
    $("finding-list").innerHTML = cycle.verifiedFindings.map((finding, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><p>${esc(local(finding, "text"))}</p><div>${finding.sourceIds.map(id => `<a href="${esc(sources[id].url)}" target="_blank" rel="noreferrer">${esc(sources[id].title)} ↗</a>`).join("")}</div></div></article>`).join("");
    const programRows = [["design", cycle.sharedProgram.design], ["adjudication", cycle.sharedProgram.adjudication], ["metrics", cycle.sharedProgram.primaryMetrics], ["success", cycle.sharedProgram.successRule], ["stop", cycle.sharedProgram.stopRule]];
    $("program-grid").innerHTML = programRows.map(([key, value]) => `<article class="${key === "stop" ? "stop" : ""}"><h3>${esc(t(key))}</h3><p>${esc(pair(value))}</p></article>`).join("");
    $("problem-chain").innerHTML = cycle.problemIds.map((id, index) => { const problem = problems.find(item => item.id === id); const record = problem.cycleResearch; return `<a href="${esc(problemURL(problem))}"><span>${String(index + 1).padStart(2, "0")} · ${esc(problem.id)}</span><h3>${esc(local(problem, "question"))}</h3><b>${esc(t("role"))}</b><p>${esc(pair(record.role))}</p><b>${esc(t("bottleneck"))}</b><p>${esc(pair(record.bottleneck))}</p></a>`; }).join("");
    $("connection-map").innerHTML = connections.map(connection => `<article><header><span>${esc(connection.id)}</span><strong>${esc(pair(connection.type))}</strong></header><div class="connection-nodes">${connection.problemIds.map(id => { const problem = problems.find(item => item.id === id); return `<a href="${esc(problemURL(problem))}">${esc(id)} · ${esc(local(problem, "question"))}</a>`; }).join("<i>↔</i>")}</div><dl><div><dt>${esc(t("mapping"))}</dt><dd>${esc(pair(connection.mapping))}</dd></div><div><dt>${esc(t("minimumTest"))}</dt><dd>${esc(pair(connection.minimumTest))}</dd></div><div><dt>${esc(t("failure"))}</dt><dd>${esc(pair(connection.failureBoundary))}</dd></div></dl></article>`).join("");
    $("cycle-record").innerHTML = cycle.log.map(item => `<li>${esc(pair(item))}</li>`).join("");
    const sourceIds = [...new Set([...cycle.verifiedFindings.flatMap(item => item.sourceIds), ...connections.flatMap(item => item.sourceIds), ...cycle.problemIds.flatMap(id => problems.find(item => item.id === id).cycleResearch.sourceIds)])];
    $("log-sources").innerHTML = sourceIds.map(id => `<a href="${esc(sources[id].url)}" target="_blank" rel="noreferrer"><span>${esc(local(sources[id], "evidenceLabel"))} · ${esc(sources[id].reviewedOn)}</span><strong>${esc(sources[id].title)}</strong><i>${esc(t("source"))} ↗</i></a>`).join("");
    const from = params.get("from"); const originProblem = problems.find(item => item.id === from);
    $("back-link").href = originProblem ? problemURL(originProblem) : `index.html${lang === "en" ? "?lang=en" : ""}#catalog`;
    document.title = `${local(cycle, "title")} — Unsolved Problems`;
    const canonical = `https://eljja.github.io/UnsolvedProblems/research-log.html?cycle=${encodeURIComponent(cycle.id)}&lang=${lang}`;
    document.querySelector('link[rel="canonical"]').href = canonical;
    $("cycle-structured-data").textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: local(cycle, "title"), datePublished: cycle.startedOn, dateModified: cycle.reviewedOn, inLanguage: lang, url: canonical, about: cycle.problemIds.map(id => ({ "@type": "Question", identifier: id, name: local(problems.find(item => item.id === id), "question") })) }).replaceAll("<", "\\u003c");
  }

  $("log-language-switch").addEventListener("click", event => { const button = event.target.closest("button[data-lang]"); if (!button || button.dataset.lang === lang) return; lang = button.dataset.lang; const next = new URLSearchParams(location.search); next.set("lang", lang); history.replaceState(null, "", `${location.pathname}?${next}`); render(); });
  render();
})();
