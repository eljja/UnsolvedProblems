(function () {
  "use strict";

  const problems = window.PROBLEMS || [];
  const meta = window.CATALOG_META || {};
  const sources = window.CATALOG_SOURCES || {};
  const prizes = window.CATALOG_PRIZES || {};
  const SITE_BASE = "https://eljja.github.io/UnsolvedProblems/";
  const params = new URLSearchParams(location.search);
  let lang = params.get("lang") === "en" ? "en" : "ko";
  const problem = problems.find(item => item.id === params.get("id"));

  const UI = {
    ko: {
      pageSuffix: "해결 시도 설계",
      pageDescription: "문제별 연구 가설, 반증 시험, 중단 조건과 단계별 검증 로드맵",
      skip: "연구 설계로 건너뛰기",
      home: "Unsolved Problems 홈",
      language: "언어 선택",
      back: "← 지도로 돌아가기",
      kicker: "RESEARCH ATTEMPT · HYPOTHESIS, TEST, DECISION",
      decisionQuestion: "이번 연구가 답해야 할 질문",
      resolution: "해결 판정",
      toc: "이 페이지에서",
      tocStart: "출발점", tocProposals: "연구 제안", tocRoadmap: "실행 로드맵", tocRequirements: "질문과 역량", tocPrior: "연구 흐름", tocEvidence: "근거",
      startingTitle: "무엇이 남아 있는가", currentState: "현재까지 확인된 것", gap: "지금 닫아야 할 간극", axis: "판정을 좌우하는 기술 축",
      proposalsTitle: "세 가지 검증 경로",
      proposalNote: "검토된 연구 방향을 재조합해 만든 검증 가능한 제안입니다. 문헌상 최초라는 주장이 아니며, 첫 시험에서 살아남아야 다음 단계로 갑니다.",
      recommended: "우선 검증할 경로", alternative: "대안 경로",
      hypothesis: "제안", departure: "기존 연구와 다른 점", design: "검증 설계", firstTest: "가장 먼저 할 결정적 시험", success: "계속할 신호", stopRule: "중단·기각 조건", dependencies: "필요 조건", risk: "핵심 위험",
      roadmapTitle: "아이디어를 결론까지 운반하는 관문", objective: "할 일", output: "남겨야 할 결과물", gate: "통과 조건",
      requirementsTitle: "시작 전에 준비할 것", questionsTitle: "먼저 답할 설계 질문", capabilitiesTitle: "필요한 역량과 기반", pitfallsTitle: "피해야 할 함정", safetyTitle: "안전·윤리 경계",
      priorTitle: "어디에서 이어받는가", priorIntro: "제안은 아래의 축적된 프로그램과 현재 연구 방향을 출발점으로 삼습니다.", established: "축적된 연구 프로그램", currentDirections: "현재 연구 방향", remainingLimit: "남아 있는 한계",
      evidenceTitle: "근거와 판정 자료", sourceChecked: "출처 확인", officialSource: "자료 열기", prizeTitle: "연결된 상금·도전", amount: "상금액", rules: "공식 규정",
      previous: "이전 문제", next: "다음 문제", sameDiscipline: "같은 분야",
      footer: "가설은 빨리 만들고, 판정 기준은 먼저 고정하고, 결론은 독립적으로 검증합니다.",
      notFound: "문제를 찾을 수 없습니다.", notFoundText: "주소의 문제 ID를 확인하거나 전체 난제 지도로 돌아가세요.", viewAtlas: "전체 지도 보기",
      reviewed: "연구 설계 검토", proposals: "검증 경로 3개", gates: "연구 관문 5개", boundary: "경계 탐색"
    },
    en: {
      pageSuffix: "Research attempt design",
      pageDescription: "Problem-specific research hypotheses, falsification tests, stop rules, and a gated validation roadmap",
      skip: "Skip to research design",
      home: "Unsolved Problems home",
      language: "Choose language",
      back: "← Back to atlas",
      kicker: "RESEARCH ATTEMPT · HYPOTHESIS, TEST, DECISION",
      decisionQuestion: "The question this research must answer",
      resolution: "Resolution criterion",
      toc: "On this page",
      tocStart: "Starting point", tocProposals: "Proposals", tocRoadmap: "Roadmap", tocRequirements: "Questions & capacity", tocPrior: "Research landscape", tocEvidence: "Evidence",
      startingTitle: "What remains unresolved", currentState: "What is established", gap: "The gap to close now", axis: "Technical axes that decide the result",
      proposalsTitle: "Three testable paths",
      proposalNote: "These are testable proposals synthesized from the reviewed research directions. They are not claims of literature-first novelty, and each must survive its first test before advancing.",
      recommended: "Recommended first path", alternative: "Alternative path",
      hypothesis: "Proposal", departure: "How it departs from current work", design: "Validation design", firstTest: "First decisive test", success: "Signal to continue", stopRule: "Stop or rejection rule", dependencies: "Dependencies", risk: "Principal risk",
      roadmapTitle: "Gates that carry an idea to a conclusion", objective: "Objective", output: "Required output", gate: "Gate",
      requirementsTitle: "What must be ready before starting", questionsTitle: "Design questions to answer first", capabilitiesTitle: "Required capabilities", pitfallsTitle: "Pitfalls to avoid", safetyTitle: "Safety and ethics boundary",
      priorTitle: "Where this proposal begins", priorIntro: "The proposals build from the established programs and current directions below.", established: "Established research programs", currentDirections: "Current research directions", remainingLimit: "Remaining limitation",
      evidenceTitle: "Evidence and adjudication sources", sourceChecked: "Source checked", officialSource: "Open source", prizeTitle: "Linked prize or challenge", amount: "Prize amount", rules: "Official rules",
      previous: "Previous problem", next: "Next problem", sameDiscipline: "Same discipline",
      footer: "Generate hypotheses quickly, fix decision rules first, and verify conclusions independently.",
      notFound: "Problem not found.", notFoundText: "Check the problem ID in the address or return to the full atlas.", viewAtlas: "View full atlas",
      reviewed: "Research design reviewed", proposals: "3 testable paths", gates: "5 research gates", boundary: "Boundary analysis"
    }
  };

  const $ = id => document.getElementById(id);
  const t = key => UI[lang][key];
  const localized = (item, key) => lang === "en" ? (item?.[`${key}En`] || item?.[key] || "") : (item?.[key] || "");
  const textPair = item => lang === "en" ? (item?.textEn || item?.text || "") : (item?.text || "");
  const label = item => localized(item, "label");
  const question = item => localized(item, "question");
  const subfield = item => localized(item, "subfield");

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function setMeta(selector, value) {
    document.querySelector(selector)?.setAttribute("content", value);
  }

  function indexedProblemURL(item, locale) {
    return `${SITE_BASE}solve.html?id=${encodeURIComponent(item.id)}&lang=${locale}`;
  }

  function setCanonical(url) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.append(link);
    }
    link.setAttribute("href", url);
  }

  function updateDiscoveryMetadata(item) {
    if (!item) {
      setMeta('meta[name="robots"]', "noindex,follow");
      document.querySelector('link[rel="canonical"]')?.remove();
      return;
    }
    const title = `${question(item)} — ${t("pageSuffix")}`;
    const description = `${localized(item, "generalExplanation")} ${localized(item, "resolutionCriterion")}`.slice(0, 300);
    const canonical = indexedProblemURL(item, lang);
    setCanonical(canonical);
    setMeta('meta[name="robots"]', "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1");
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonical);
    setMeta('meta[property="og:locale"]', lang === "en" ? "en_US" : "ko_KR");
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url: canonical,
      inLanguage: lang,
      dateModified: item.solutionLab.reviewedOn,
      isAccessibleForFree: true,
      isPartOf: {
        "@type": "CollectionPage",
        name: "Unsolved Problems — Open Research Atlas",
        url: SITE_BASE
      },
      about: {
        "@type": "Thing",
        identifier: item.id,
        name: question(item),
        additionalType: label(meta.disciplines[item.discipline])
      },
      mainEntity: {
        "@type": "Question",
        name: question(item),
        text: localized(item, "generalExplanation"),
        answerCount: 0
      },
      keywords: [label(meta.disciplines[item.discipline]), subfield(item), ...(item.themes || []).map(key => label(meta.themes[key]))],
      citation: item.sourceIds.map(id => sources[id]?.url).filter(Boolean)
    };
    $("research-structured-data").textContent = JSON.stringify(structuredData).replaceAll("<", "\\u003c");
  }

  function atlasFallback() {
    return `index.html${lang === "en" ? "?lang=en" : ""}#catalog`;
  }

  function safeReturnTarget() {
    const raw = params.get("return");
    if (!raw) return "";
    try {
      const url = new URL(raw, location.href);
      const sameHost = location.protocol === "file:" || url.origin === location.origin;
      const isAtlas = !/\/solve\.html$/i.test(url.pathname);
      return sameHost && isAtlas ? `${url.pathname}${url.search}${url.hash}` : "";
    } catch {
      return "";
    }
  }

  function backToAtlas() {
    const target = safeReturnTarget();
    if (target) {
      location.assign(target);
      return;
    }
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer && referrer.origin === location.origin && !/\/solve\.html$/i.test(referrer.pathname)) {
        history.back();
        return;
      }
    } catch { /* fall through */ }
    location.assign(atlasFallback());
  }

  function problemURL(item) {
    const next = new URL("solve.html", location.href);
    next.searchParams.set("id", item.id);
    next.searchParams.set("lang", lang);
    const returnTarget = safeReturnTarget();
    if (returnTarget) next.searchParams.set("return", returnTarget);
    return next.href;
  }

  function updateStaticCopy() {
    document.documentElement.lang = lang;
    setText("skip-link", t("skip"));
    $("brand-home").setAttribute("aria-label", t("home"));
    $("brand-home").href = atlasFallback();
    $("solution-language-switch").setAttribute("aria-label", t("language"));
    setText("back-to-atlas", t("back"));
    setText("lab-kicker", t("kicker"));
    setText("decision-card-title", t("decisionQuestion"));
    setText("decision-rule-label", t("resolution"));
    setText("toc-title", t("toc"));
    setText("toc-start", t("tocStart")); setText("toc-proposals", t("tocProposals")); setText("toc-roadmap", t("tocRoadmap"));
    setText("toc-requirements", t("tocRequirements")); setText("toc-prior", t("tocPrior")); setText("toc-evidence", t("tocEvidence"));
    setText("starting-title", t("startingTitle")); setText("current-state-title", t("currentState")); setText("gap-title", t("gap"));
    setText("proposals-title", t("proposalsTitle")); setText("proposal-note", t("proposalNote"));
    setText("roadmap-title", t("roadmapTitle")); setText("requirements-title", t("requirementsTitle"));
    setText("questions-title", t("questionsTitle")); setText("capabilities-title", t("capabilitiesTitle"));
    setText("pitfalls-title", t("pitfallsTitle")); setText("safety-title", t("safetyTitle"));
    setText("prior-title", t("priorTitle")); setText("prior-intro", t("priorIntro")); setText("evidence-title", t("evidenceTitle"));
    setText("footer-note", t("footer"));
    setText("error-title", t("notFound")); setText("error-text", t("notFoundText")); setText("error-link", t("viewAtlas"));
    $("error-link").href = atlasFallback();
    $("solution-language-switch").querySelectorAll("button[data-lang]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.lang === lang)));
  }

  function metadataHTML(problem) {
    const lab = problem.solutionLab;
    const nature = meta.natures[problem.nature];
    return [
      `<span>${escapeHTML(label(meta.approaches[problem.approach]))}</span>`,
      `<span>${escapeHTML(label(nature))}</span>`,
      `<span>${escapeHTML(problem.nature === "boundary" ? t("boundary") : t("proposals"))}</span>`,
      `<span>${escapeHTML(t("gates"))}</span>`,
      `<span>${escapeHTML(t("reviewed"))} · ${escapeHTML(lab.reviewedOn)}</span>`
    ].join("");
  }

  function proposalHTML(track, index, featured) {
    const rows = [
      ["hypothesis", track.thesis],
      ["departure", track.departure],
      ["design", track.design],
      ["firstTest", track.firstTest],
      ["success", track.success],
      ["stopRule", track.stopRule]
    ];
    return `<article class="proposal-card${featured ? " featured" : ""}">
      <div class="proposal-card-head">
        <span class="proposal-index">${featured ? "A" : String.fromCharCode(65 + index)}</span>
        <span class="proposal-rank">${escapeHTML(featured ? t("recommended") : `${t("alternative")} ${index}`)}</span>
      </div>
      <h3>${escapeHTML(textPair(track.title))}</h3>
      <div class="proposal-body">
        ${rows.map(([key, value]) => `<div class="proposal-field ${key === "stopRule" ? "stop-field" : ""}"><h4>${escapeHTML(t(key))}</h4><p>${escapeHTML(textPair(value))}</p></div>`).join("")}
      </div>
      <div class="proposal-foot">
        <div><span>${escapeHTML(t("dependencies"))}</span><p>${escapeHTML(textPair(track.dependencies))}</p></div>
        <div><span>${escapeHTML(t("risk"))}</span><p>${escapeHTML(textPair(track.risk))}</p></div>
      </div>
    </article>`;
  }

  function roadmapHTML(items) {
    return items.map(item => `<article class="roadmap-step">
      <div class="roadmap-number">${escapeHTML(item.number)}</div>
      <div class="roadmap-copy">
        <h3>${escapeHTML(textPair(item.title))}</h3>
        <div class="roadmap-detail"><span>${escapeHTML(t("objective"))}</span><p>${escapeHTML(textPair(item.objective))}</p></div>
        <div class="roadmap-detail"><span>${escapeHTML(t("output"))}</span><p>${escapeHTML(textPair(item.output))}</p></div>
        <div class="roadmap-gate"><span>${escapeHTML(t("gate"))}</span><p>${escapeHTML(textPair(item.gate))}</p></div>
      </div>
    </article>`).join("");
  }

  function attemptsColumn(title, items) {
    return `<section class="prior-column"><h3>${escapeHTML(title)}</h3><div class="prior-list">${items.map((item, index) => {
      const source = sources[item.sourceId];
      return `<article class="prior-item">
        <span class="prior-number">${String(index + 1).padStart(2, "0")}</span>
        <div><h4>${escapeHTML(localized(item, "title"))}</h4><p>${escapeHTML(localized(item, "description"))}</p><p class="prior-limit"><b>${escapeHTML(t("remainingLimit"))}</b> ${escapeHTML(localized(item, "technicalDetail"))}</p>${source ? `<a href="${escapeHTML(source.url)}" target="_blank" rel="noreferrer">${escapeHTML(localized(source, "evidenceLabel"))} ↗</a>` : ""}</div>
      </article>`;
    }).join("")}</div></section>`;
  }

  function prizesHTML(problem) {
    const linked = (problem.prizeIds || []).map(id => prizes[id]).filter(Boolean);
    if (!linked.length) return "";
    return `<section class="lab-prizes"><h3>${escapeHTML(t("prizeTitle"))}</h3>${linked.map(prize => `<article>
      <div><strong>${escapeHTML(localized(prize, "title"))}</strong><p>${escapeHTML(localized(prize, "organization"))}</p></div>
      <div class="lab-prize-amount"><span>${escapeHTML(t("amount"))}</span><strong>${escapeHTML(localized(prize, "amount"))}</strong></div>
      <p>${escapeHTML(localized(prize, "summary"))}</p>
      <a href="${escapeHTML(prize.rulesUrl)}" target="_blank" rel="noreferrer">${escapeHTML(t("rules"))} ↗</a>
    </article>`).join("")}</section>`;
  }

  function paginationHTML(problem) {
    const peers = problems.filter(item => item.discipline === problem.discipline);
    const index = peers.findIndex(item => item.id === problem.id);
    const previous = index > 0 ? peers[index - 1] : null;
    const next = index < peers.length - 1 ? peers[index + 1] : null;
    const card = (item, direction) => item ? `<a class="pagination-card ${direction}" href="${escapeHTML(problemURL(item))}">
      <span>${escapeHTML(direction === "previous" ? t("previous") : t("next"))} · ${escapeHTML(t("sameDiscipline"))}</span>
      <strong>${escapeHTML(question(item))}</strong>
      <small>${escapeHTML(item.id)} · ${escapeHTML(subfield(item))}</small>
    </a>` : `<span></span>`;
    return `${card(previous, "previous")}${card(next, "next")}`;
  }

  function render() {
    updateStaticCopy();
    if (!problem || !problem.solutionLab) {
      updateDiscoveryMetadata(null);
      $("solution-error").hidden = false;
      $("solution-content").hidden = true;
      document.title = `${t("notFound")} — Unsolved Problems`;
      return;
    }

    const lab = problem.solutionLab;
    const discipline = meta.disciplines[problem.discipline];
    const importance = meta.importance[problem.importance];
    $("solution-error").hidden = true;
    $("solution-content").hidden = false;
    document.title = `${question(problem)} — ${t("pageSuffix")}`;
    updateDiscoveryMetadata(problem);

    $("lab-breadcrumb").innerHTML = `<span>${escapeHTML(label(discipline))}</span><i>→</i><span>${escapeHTML(subfield(problem))}</span><i>→</i><strong>${escapeHTML(problem.id)}</strong>`;
    setText("solution-title", question(problem));
    setText("solution-deck", localized(problem, "generalExplanation"));
    setText("solution-id", problem.id);
    setText("central-question", localized(lab, "centralQuestion"));
    setText("decision-rule", localized(problem, "resolutionCriterion"));
    $("solution-tags").innerHTML = metadataHTML(problem);
    setText("current-state", localized(problem, "currentKnowledge"));
    setText("gap-text", localized(lab, "diagnosis"));
    $("technical-axes").innerHTML = `<h3>${escapeHTML(t("axis"))}</h3><ol>${problem.technicalTopics.map((item, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHTML(textPair(item))}</p></li>`).join("")}</ol>`;

    $("recommended-proposal").innerHTML = proposalHTML(lab.tracks[0], 0, true);
    $("alternative-proposals").innerHTML = lab.tracks.slice(1).map((track, index) => proposalHTML(track, index + 1, false)).join("");
    $("roadmap-list").innerHTML = roadmapHTML(lab.roadmap);
    $("research-questions").innerHTML = lab.researchQuestions.map(item => `<li>${escapeHTML(textPair(item))}</li>`).join("");
    $("capabilities").innerHTML = lab.capabilities.map(item => `<li>${escapeHTML(textPair(item))}</li>`).join("");
    $("pitfalls").innerHTML = lab.pitfalls.map(item => `<li>${escapeHTML(textPair(item))}</li>`).join("");
    setText("safety-note", localized(lab, "safetyNote"));
    $("prior-columns").innerHTML = attemptsColumn(t("established"), problem.importantAttempts || []) + attemptsColumn(t("currentDirections"), problem.recentAttempts || []);
    $("prize-panel").innerHTML = prizesHTML(problem);
    $("evidence-list").innerHTML = problem.sourceIds.map(id => sources[id]).filter(Boolean).map(source => `<a href="${escapeHTML(source.url)}" target="_blank" rel="noreferrer">
      <span>${escapeHTML(localized(source, "evidenceLabel"))} · ${escapeHTML(t("sourceChecked"))} ${escapeHTML(source.reviewedOn)}</span>
      <strong>${escapeHTML(source.title)}</strong>
      <i>${escapeHTML(t("officialSource"))} ↗</i>
    </a>`).join("");
    $("problem-pagination").innerHTML = paginationHTML(problem);

    document.documentElement.style.setProperty("--discipline-accent", discipline.color);
    document.documentElement.style.setProperty("--importance-accent", importance.color);
  }

  $("back-to-atlas").addEventListener("click", backToAtlas);
  $("solution-language-switch").addEventListener("click", event => {
    const button = event.target.closest("button[data-lang]");
    if (!button || button.dataset.lang === lang) return;
    lang = button.dataset.lang;
    const nextParams = new URLSearchParams(location.search);
    if (lang === "en") nextParams.set("lang", "en"); else nextParams.delete("lang");
    history.replaceState(null, "", `${location.pathname}?${nextParams.toString()}${location.hash}`);
    try { localStorage.setItem("catalogLanguage", lang); } catch { /* storage may be unavailable */ }
    render();
  });

  render();
})();
