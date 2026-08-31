import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseURL = "https://eljja.github.io/UnsolvedProblems/";
const lastModified = process.env.SITEMAP_LASTMOD || new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const sandbox = { window: {} };

const researchCycleFiles = ["research-cycle-data.js", ...Array.from({ length: 71 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...researchCycleFiles]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}

const problems = sandbox.window.PROBLEMS || [];
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const escapeXML = value => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function entry(location, korean, english, fallback = korean) {
  return [
    "  <url>",
    `    <loc>${escapeXML(location)}</loc>`,
    `    <xhtml:link rel="alternate" hreflang="ko" href="${escapeXML(korean)}"/>`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXML(english)}"/>`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXML(fallback)}"/>`,
    `    <lastmod>${lastModified}</lastmod>`,
    "  </url>"
  ].join("\n");
}

const entries = [];
const atlasKo = baseURL;
const atlasEn = `${baseURL}?lang=en`;
entries.push(entry(atlasKo, atlasKo, atlasEn));
entries.push(entry(atlasEn, atlasKo, atlasEn));

for (const problem of problems) {
  const korean = `${baseURL}solve.html?id=${encodeURIComponent(problem.id)}&lang=ko`;
  const english = `${baseURL}solve.html?id=${encodeURIComponent(problem.id)}&lang=en`;
  entries.push(entry(korean, korean, english));
  entries.push(entry(english, korean, english));
}

for (const cycle of cycles) {
  const korean = `${baseURL}research-log.html?cycle=${encodeURIComponent(cycle.id)}&lang=ko`;
  const english = `${baseURL}research-log.html?cycle=${encodeURIComponent(cycle.id)}&lang=en`;
  entries.push(entry(korean, korean, english));
  entries.push(entry(english, korean, english));
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...entries,
  "</urlset>",
  ""
].join("\n");

fs.writeFileSync(path.join(root, "sitemap.xml"), sitemap, "utf8");
console.log(`Generated sitemap.xml with ${entries.length} localized URLs for ${problems.length} problems.`);
