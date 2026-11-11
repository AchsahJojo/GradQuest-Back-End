import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isBotCheck, isLoginWall, stripHtml } from "../src/crawl/loginWall";
import { fetchWithRetry } from "../src/crawl/fetchWithRetry";
import { isPathAllowed } from "../src/crawl/robots";
import { parseProgramResearch, type ProgramResearch } from "../src/facts/schema";
import { carryForwardFacts, checkFacts, type CheckedFact } from "../src/facts/verify";
import { reportMarkdown } from "../src/facts/report";

const USER_AGENT = "GradQuestSOP/1.0 (public program pages only)";
const RESEARCH_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "research");
const SCHOOL_FILE = /^school-\d+\.json$/;

async function getRobotsTxt(origin: string, cache: Map<string, string>): Promise<string> {
  if (cache.has(origin)) return cache.get(origin) as string;
  let text = "";
  try {
    const { response } = await fetchWithRetry(fetch, new URL("/robots.txt", origin).toString(), {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (response.ok) text = await response.text();
  } catch {
    text = "";
  }
  cache.set(origin, text);
  return text;
}

async function fetchPageText(url: string, robotsCache: Map<string, string>): Promise<string | null> {
  const target = new URL(url);
  const robotsTxt = await getRobotsTxt(target.origin, robotsCache);
  const pathAndQuery = `${target.pathname}${target.search}`;
  if (robotsTxt && !isPathAllowed(robotsTxt, pathAndQuery)) {
    console.log(`  skip (robots.txt disallows): ${url}`);
    return null;
  }

  try {
    const { response } = await fetchWithRetry(fetch, url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
    });
    const html = await response.text();
    const finalUrl = response.url || url;
    // Global Constraint: skip login-wall and bot-check pages. Check login-wall
    // first (same order as src/crawl/readPublicPage.ts) since a 401/403 or a
    // redirect into a sign-in page is itself a form of "not ok" we want to
    // label distinctly from a generic HTTP error.
    if (isLoginWall(finalUrl, response.status, html)) {
      console.log(`  skip (login wall): ${url}`);
      return null;
    }
    if (!response.ok) {
      console.log(`  skip (HTTP ${response.status}): ${url}`);
      return null;
    }
    if (isBotCheck(html)) {
      console.log(`  skip (bot check): ${url}`);
      return null;
    }
    const text = stripHtml(html);
    if (!text.trim()) {
      console.log(`  skip (no readable text, possibly JS-rendered): ${url}`);
      return null;
    }
    return text;
  } catch (error) {
    console.log(`  skip (fetch failed: ${error instanceof Error ? error.message : "unknown error"}): ${url}`);
    return null;
  }
}

// Reads a prior `school-{id}.checked.json`, if any, so re-running this script
// doesn't silently wipe Achsah's manual `verified`/`quoteCheck` edits. Returns
// undefined if there is no previous file or it can't be parsed as expected.
function readPreviousFacts(checkedPath: string): CheckedFact[] | undefined {
  let raw: string;
  try {
    raw = readFileSync(checkedPath, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.facts)) {
      return parsed.facts as CheckedFact[];
    }
  } catch {
    // fall through
  }
  return undefined;
}

function collectUrls(research: ProgramResearch): Set<string> {
  const urls = new Set<string>();
  for (const page of research.pages) urls.add(page.url);
  for (const fact of research.facts) urls.add(fact.sourceUrl);
  return urls;
}

async function main(): Promise<void> {
  let files: string[];
  try {
    files = readdirSync(RESEARCH_DIR)
      .filter((name: string) => SCHOOL_FILE.test(name))
      .sort();
  } catch {
    files = [];
  }

  if (files.length === 0) {
    console.log("no files found");
    return;
  }

  const robotsCache = new Map<string, string>();
  const pageCache = new Map<string, string>();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(RESEARCH_DIR, file), "utf8"));
    const { research, errors } = parseProgramResearch(raw);
    if (!research) {
      console.error(`${file}: invalid research JSON: ${errors.join("; ")}`);
      continue;
    }

    console.log(`Checking ${research.schoolName} — ${research.programName} (${file})`);
    for (const url of collectUrls(research)) {
      if (pageCache.has(url)) continue;
      const text = await fetchPageText(url, robotsCache);
      if (text !== null) pageCache.set(url, text);
    }

    const checkedPath = join(RESEARCH_DIR, `school-${research.schoolId}.checked.json`);
    const reportPath = join(RESEARCH_DIR, `school-${research.schoolId}.report.md`);

    const previousFacts = readPreviousFacts(checkedPath);

    const checked = await checkFacts(research, pageCache, new Date());
    checked.facts = carryForwardFacts(checked.facts, previousFacts);
    writeFileSync(checkedPath, `${JSON.stringify(checked, null, 2)}\n`);
    writeFileSync(reportPath, `${reportMarkdown(checked)}\n`);
    console.log(`  wrote ${checkedPath}`);
    console.log(`  wrote ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
