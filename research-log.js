(function () {
  "use strict";
  const problems = window.PROBLEMS || [];
  const cycles = window.RESEARCH_CYCLES || [];
  const connections = window.RESEARCH_CONNECTIONS || [];
  const sources = window.CATALOG_SOURCES || {};
  const params = new URLSearchParams(location.search);
  let lang = params.get("lang") === "en" ? "en" : "ko";
  const cycle = cycles.find(item => item.id === params.get("cycle")) || cycles.at(-1);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const pair = item => lang === "en" ? (item?.textEn || item?.text || "") : (item?.text || "");
  const local = (item, key) => lang === "en" ? (item?.[`${key}En`] || item?.[key] || "") : (item?.[key] || "");
  const text = (id, value) => { if ($(id)) $(id).textContent = value; };
  const UI = {
    ko: { skip: "연구 기록으로 건너뛰기", home: "Unsolved Problems 홈", back: "← 지도로 돌아가기", next: "다음 출발점", toc: "이 기록에서", verified: "확인된 사실", program: "공동 시험", results: "결과 행렬", artifacts: "재현 자료", problems: "선정 문제", connections: "구조적 연결", record: "연구 기록", sources: "근거", verifiedTitle: "이번 사이클에서 확인한 사실", artifactsTitle: "이번 사이클에서 고정한 재현 자료", problemsTitle: "이번 사이클에서 함께 다룬 난제", connectionsTitle: "방법이 이동할 수 있는 정확한 지점", recordTitle: "이번에 바뀐 판단과 남긴 경계", sourcesTitle: "판단에 사용한 원자료", design: "시험 설계", adjudication: "독립 판정", metrics: "주 판정량", success: "계속할 조건", stop: "중단 조건", source: "근거 열기", artifactOpen: "자료 열기", published: "발표", evidencePeriod: "근거 기간", reviewed: "검토", role: "이 사이클에서의 역할", bottleneck: "공유 병목", mapping: "변수 대응", transferableMethod: "이전 가능한 방법", validationStatus: "검증 상태", connectionEvidence: "연결 근거", minimumTest: "최소 검증", failure: "연결 한계", footer: "사실은 출처에, 제안은 기각 규칙에, 진전은 독립 판정에 묶습니다.", active: "진행 중", problemsCount: "선정 문제", linksCount: "구조적 연결" },
    en: { skip: "Skip to research record", home: "Unsolved Problems home", back: "← Back to atlas", next: "Next starting point", toc: "In this record", verified: "Verified findings", program: "Joint test", results: "Decision matrix", artifacts: "Reproducible artifacts", problems: "Selected problems", connections: "Structural links", record: "Research record", sources: "Evidence", verifiedTitle: "Facts verified in this cycle", artifactsTitle: "Reproducible artifacts frozen in this cycle", problemsTitle: "Problems investigated together in this cycle", connectionsTitle: "Exact points where methods can transfer", recordTitle: "Judgments changed and boundaries retained", sourcesTitle: "Primary evidence used for adjudication", design: "Test design", adjudication: "Independent adjudication", metrics: "Primary metrics", success: "Advance rule", stop: "Stop rule", source: "Open evidence", artifactOpen: "Open artifact", published: "Published", evidencePeriod: "Evidence period", reviewed: "Reviewed", role: "Role in this cycle", bottleneck: "Shared bottleneck", mapping: "Variable mapping", transferableMethod: "Transferable method", validationStatus: "Validation status", connectionEvidence: "Connection evidence", minimumTest: "Minimum test", failure: "Link boundary", footer: "Bind facts to sources, proposals to rejection rules, and progress to independent adjudication.", active: "Active", problemsCount: "selected problems", linksCount: "structural links" }
  };
  const t = key => UI[lang][key];

  function problemURL(problem) { return `solve.html?id=${encodeURIComponent(problem.id)}&lang=${lang}`; }
  function updateStatic() {
    document.documentElement.lang = lang;
    text("skip-link", t("skip")); $("brand-home").setAttribute("aria-label", t("home"));
    text("back-link", t("back")); text("next-label", t("next")); text("toc-title", t("toc"));
    for (const key of ["verified", "program", "results", "artifacts", "problems", "connections", "record", "sources"]) text(`toc-${key}`, t(key));
    text("verified-title", t("verifiedTitle")); text("artifacts-title", t("artifactsTitle")); text("problems-title", t("problemsTitle")); text("connections-title", t("connectionsTitle")); text("record-title", t("recordTitle")); text("sources-title", t("sourcesTitle")); text("footer-note", t("footer"));
    $("log-language-switch").querySelectorAll("button[data-lang]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.lang === lang)));
  }

  function render() {
    if (!cycle) return;
    const cycleConnections = connections.filter(connection => (cycle.connectionIds || []).includes(connection.id));
    const cycleRecord = problem => (problem.researchHistory || []).find(record => record.cycleId === cycle.id) || problem.cycleResearch;
    updateStatic();
    text("cycle-id", `${cycle.id} · ${cycle.startedOn} · ${t("active")}`);
    text("cycle-title", local(cycle, "title"));
    text("cycle-reason", local(cycle, "selectionReason"));
    text("cycle-meta", "");
    $("cycle-meta").innerHTML = `<span>${cycle.problemIds.length} ${esc(t("problemsCount"))}</span><span>${cycleConnections.length} ${esc(t("linksCount"))}</span><span>${esc(cycle.reviewedOn)}</span>`;
    text("next-cycle", pair(cycle.nextCycle));
    $("cycle-index").setAttribute("aria-label", lang === "en" ? "Research cycles" : "연구 사이클");
    const currentCycleIndex = cycles.findIndex(item => item.id === cycle.id);
    const cycleWindowStart = Math.max(0, Math.min(currentCycleIndex - 4, cycles.length - 9));
    const nearbyCycles = cycles.slice(cycleWindowStart, cycleWindowStart + 9).reverse();
    const latestCycle = cycles.at(-1);
    const cycleNavItems = latestCycle && !nearbyCycles.some(item => item.id === latestCycle.id) ? [latestCycle, ...nearbyCycles] : nearbyCycles;
    $("cycle-index").innerHTML = cycleNavItems.map(item => `<a href="research-log.html?cycle=${encodeURIComponent(item.id)}&lang=${lang}"${item.id === cycle.id ? ' aria-current="page"' : ""}>${esc(item.id)}</a>`).join("");
    text("program-title", pair(cycle.sharedProgram.name)); text("program-thesis", pair(cycle.sharedProgram.thesis));
    $("finding-list").innerHTML = cycle.verifiedFindings.map((finding, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><p>${esc(local(finding, "text"))}</p><div>${finding.sourceIds.map(id => `<a href="${esc(sources[id].url)}" target="_blank" rel="noreferrer">${esc(sources[id].title)} ↗</a>`).join("")}</div></div></article>`).join("");
    const programRows = [["design", cycle.sharedProgram.design], ["adjudication", cycle.sharedProgram.adjudication], ["metrics", cycle.sharedProgram.primaryMetrics], ["success", cycle.sharedProgram.successRule], ["stop", cycle.sharedProgram.stopRule]];
    $("program-grid").innerHTML = programRows.map(([key, value]) => `<article class="${key === "stop" ? "stop" : ""}"><h3>${esc(t(key))}</h3><p>${esc(pair(value))}</p></article>`).join("");
    const hasResults = Boolean(cycle.resultMatrix?.rows?.length);
    $("results").hidden = !hasResults; $("toc-results").hidden = !hasResults;
    if (hasResults) {
      text("results-title", pair(cycle.resultMatrix.title)); text("results-note", pair(cycle.resultMatrix.note));
      const header = `<thead><tr>${cycle.resultMatrix.columns.map(column => `<th scope="col">${esc(pair(column))}</th>`).join("")}</tr></thead>`;
      const body = `<tbody>${cycle.resultMatrix.rows.map(row => `<tr><th scope="row">${esc(pair(row.label))}</th>${row.values.map(value => `<td>${esc(typeof value === "object" ? pair(value) : value)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      $("result-matrix").innerHTML = header + body;
    }
    const hasArtifacts = Boolean(cycle.artifacts?.length);
    $("artifacts").hidden = !hasArtifacts; $("toc-artifacts").hidden = !hasArtifacts;
    $("artifact-grid").innerHTML = hasArtifacts ? cycle.artifacts.map(artifact => `<a href="${esc(artifact.url)}"><span>${esc(artifact.kind)}</span><strong>${esc(pair(artifact.title))}</strong><p>${esc(pair(artifact.description))}</p><i>${esc(t("artifactOpen"))} ↗</i></a>`).join("") : "";
    $("problem-chain").innerHTML = cycle.problemIds.map((id, index) => { const problem = problems.find(item => item.id === id); const record = cycleRecord(problem); return `<a href="${esc(problemURL(problem))}"><span>${String(index + 1).padStart(2, "0")} · ${esc(problem.id)}</span><h3>${esc(local(problem, "question"))}</h3><b>${esc(t("role"))}</b><p>${esc(pair(record.role))}</p><b>${esc(t("bottleneck"))}</b><p>${esc(pair(record.bottleneck))}</p></a>`; }).join("");
    $("connection-map").innerHTML = cycleConnections.map(connection => `<article><header><span>${esc(connection.id)}</span><strong>${esc(pair(connection.type))}</strong></header><div class="connection-nodes">${connection.problemIds.map(id => { const problem = problems.find(item => item.id === id); return `<a href="${esc(problemURL(problem))}">${esc(id)} · ${esc(local(problem, "question"))}</a>`; }).join("<i>↔</i>")}</div><dl><div><dt>${esc(t("bottleneck"))}</dt><dd>${esc(pair(connection.sharedBottleneck))}</dd></div><div><dt>${esc(t("mapping"))}</dt><dd>${esc(pair(connection.mapping))}</dd></div>${connection.transferableMethod ? `<div><dt>${esc(t("transferableMethod"))}</dt><dd>${esc(pair(connection.transferableMethod))}</dd></div>` : ""}${connection.validationStatus ? `<div><dt>${esc(t("validationStatus"))}</dt><dd>${esc(pair(connection.validationStatus))}</dd></div>` : ""}${connection.evidence ? `<div><dt>${esc(t("connectionEvidence"))}</dt><dd>${esc(pair(connection.evidence))}</dd></div>` : ""}<div><dt>${esc(t("minimumTest"))}</dt><dd>${esc(pair(connection.minimumTest))}</dd></div><div><dt>${esc(t("failure"))}</dt><dd>${esc(pair(connection.failureBoundary))}</dd></div></dl></article>`).join("");
    $("cycle-record").innerHTML = cycle.log.map(item => `<li>${esc(pair(item))}</li>`).join("");
    const sourceIds = [...new Set([...cycle.verifiedFindings.flatMap(item => item.sourceIds), ...cycleConnections.flatMap(item => item.sourceIds), ...(cycle.sourceIds || []), ...cycle.problemIds.flatMap(id => cycleRecord(problems.find(item => item.id === id)).sourceIds)])];
    $("log-sources").innerHTML = sourceIds.map(id => { const source = sources[id]; const dates = [source.publishedOn ? `${t("published")} ${source.publishedOn}` : "", local(source, "resultPeriod") ? `${t("evidencePeriod")} ${local(source, "resultPeriod")}` : "", `${t("reviewed")} ${source.reviewedOn}`].filter(Boolean).join(" · "); return `<a href="${esc(source.url)}" target="_blank" rel="noreferrer"><span>${esc(local(source, "evidenceLabel"))} · ${esc(dates)}</span><strong>${esc(source.title)}</strong><i>${esc(t("source"))} ↗</i></a>`; }).join("");
    const from = params.get("from"); const originProblem = problems.find(item => item.id === from);
    $("back-link").href = originProblem ? problemURL(originProblem) : `index.html${lang === "en" ? "?lang=en" : ""}#catalog`;
    document.title = `${local(cycle, "title")} — Unsolved Problems`;
    const canonical = `https://eljja.github.io/UnsolvedProblems/research-log.html?cycle=${encodeURIComponent(cycle.id)}&lang=${lang}`;
    document.querySelector('link[rel="canonical"]').href = canonical;
    $("alternate-ko").href = `https://eljja.github.io/UnsolvedProblems/research-log.html?cycle=${encodeURIComponent(cycle.id)}&lang=ko`;
    $("alternate-en").href = `https://eljja.github.io/UnsolvedProblems/research-log.html?cycle=${encodeURIComponent(cycle.id)}&lang=en`;
    $("alternate-default").href = `https://eljja.github.io/UnsolvedProblems/research-log.html?cycle=${encodeURIComponent(cycle.id)}&lang=ko`;
    document.querySelector('meta[property="og:title"]').content = `${local(cycle, "title")} — Unsolved Problems`;
    document.querySelector('meta[property="og:description"]').content = local(cycle, "selectionReason");
    document.querySelector('meta[property="og:url"]').content = canonical;
    $("cycle-structured-data").textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: local(cycle, "title"), datePublished: cycle.startedOn, dateModified: cycle.reviewedOn, inLanguage: lang, url: canonical, about: cycle.problemIds.map(id => ({ "@type": "Question", identifier: id, name: local(problems.find(item => item.id === id), "question") })) }).replaceAll("<", "\\u003c");
  }

  $("log-language-switch").addEventListener("click", event => { const button = event.target.closest("button[data-lang]"); if (!button || button.dataset.lang === lang) return; lang = button.dataset.lang; const next = new URLSearchParams(location.search); next.set("lang", lang); history.replaceState(null, "", `${location.pathname}?${next}`); render(); });
  render();
})();
