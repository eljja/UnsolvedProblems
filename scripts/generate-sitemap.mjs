import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseURL = "https://eljja.github.io/UnsolvedProblems/";
const lastModified = process.env.SITEMAP_LASTMOD || new Date().toISOString().slice(0, 10);
const sandbox = { window: {} };

for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-cycle-05-data.js", "research-cycle-06-data.js", "research-cycle-07-data.js", "research-cycle-08-data.js", "research-cycle-09-data.js", "research-cycle-10-data.js", "research-cycle-11-data.js", "research-cycle-12-data.js", "research-cycle-13-data.js", "research-cycle-14-data.js", "research-cycle-15-data.js", "research-cycle-16-data.js", "research-cycle-17-data.js", "research-cycle-18-data.js", "research-cycle-19-data.js", "research-cycle-20-data.js", "research-cycle-21-data.js"]) {
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
