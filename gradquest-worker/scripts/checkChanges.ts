import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchWithRetry } from "../src/crawl/fetchWithRetry";
import { isBotCheck, isLoginWall, stripHtml } from "../src/crawl/loginWall";
import { isPathAllowed } from "../src/crawl/robots";
import { changesMarkdown, compareSnapshot } from "../src/facts/report";
import type { CheckedResearch } from "../src/facts/verify";

const USER_AGENT = "GradQuestSOP/1.0 (public program pages only)";
const RESEARCH_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "research");
const CHECKED_FILE = /^school-\d+\.checked\.json$/;

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

function collectUrls(checked: CheckedResearch): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };
  for (const page of checked.pages) add(page.url);
  for (const fact of checked.facts) add(fact.sourceUrl);
  return urls;
}

async function main(): Promise<void> {
  let files: string[];
  try {
    files = readdirSync(RESEARCH_DIR)
      .filter((name: string) => CHECKED_FILE.test(name))
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
    const checked = JSON.parse(readFileSync(join(RESEARCH_DIR, file), "utf8")) as CheckedResearch;
    console.log(`Checking ${checked.schoolName} — ${checked.programName} (${file})`);
    const pages = new Map<string, string>();
    for (const url of collectUrls(checked)) {
      if (!pageCache.has(url)) {
        const text = await fetchPageText(url, robotsCache);
        if (text !== null) pageCache.set(url, text);
      }
      const text = pageCache.get(url);
      if (text !== undefined) pages.set(url, text);
    }

    const report = await compareSnapshot(checked, pages);
    const changesPath = join(RESEARCH_DIR, `school-${checked.schoolId}.changes.md`);
    writeFileSync(changesPath, `${changesMarkdown(report)}\n`);
    console.log(
      `  wrote ${changesPath} (missing ${report.missingQuotes.length}, changed ${report.changedPages.length}, unreachable ${report.unreachable.length})`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
