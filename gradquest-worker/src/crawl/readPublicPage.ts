import { isAllowlisted } from "../allowlist";
import { excerptsFromHtml, excerptsFromMarkdown, PAGE_EXCERPT_LIMIT, type Excerpt } from "./excerpts";
import { fetchWithRetry, FetchRetryError, isRetryableStatus } from "./fetchWithRetry";
import { isBotCheck, isLoginWall } from "./loginWall";
import type { MarkdownPage, MarkdownReader } from "./markdown";
import { isFresh, isStaleUsable, type CachedPage, type PageCache } from "./pageCache";
import { isPathAllowed } from "./robots";

export type PageSource = "cache" | "fetch" | "markdown" | "stale";

export type PageRead = {
  pageStatus: "ok" | "robots_blocked" | "login_wall" | "not_allowlisted" | "error";
  message: string;
  excerpts: Excerpt[];
  text: string;
  source?: PageSource;
  fetchedAt?: string;
  attempts: number;
  fallbackUsed: boolean;
};

export type PageDeps = {
  fetchImpl?: typeof fetch;
  markdown?: MarkdownReader;
  cache?: PageCache;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  budgetMs?: number;
};

type LiveRead = { read: PageRead; unreachable: boolean };

export const READ_BUDGET_MS = 35_000;
const MIN_MARKDOWN_MS = 5000;
const USER_AGENT = "GradQuestSOP/1.0 (public program pages only)";
const MAX_BYTES = 1_500_000;
const READ_OK = "Read the public program page.";
const NO_RESPONSE = "The program page didn't respond after several tries. Try again in a few minutes.";
const ROBOTS_UNREACHABLE = "Couldn't read this site's robots.txt, so the page wasn't fetched.";
const BOT_CHECK = "The program page asked for a robot check, so GradQuest didn't read it.";
const LOGIN_WALL =
  "This page is behind a login or left the public program page. Paste the prompt if you have it. GradQuest will not guess it.";

export async function readPublicPage(url: string, deps: PageDeps = {}): Promise<PageRead> {
  if (!isAllowlisted(url)) {
    return stopped("not_allowlisted", "That URL is not an allowlisted public program page.");
  }
  const now = deps.now ?? (() => new Date());
  const deadline = now().getTime() + (deps.budgetMs ?? READ_BUDGET_MS);
  const cached = deps.cache ? await deps.cache.get(url) : null;
  if (cached && isFresh(cached, now()) && cached.excerpts.length >= 12) {
    return fromCache(cached, "cache", READ_OK);
  }

  const { read, unreachable } = await readLive(url, deps, now, deadline);
  if (read.pageStatus === "ok") {
    if (deps.cache && read.source && read.fetchedAt) {
      await deps.cache.put(url, { excerpts: read.excerpts, source: read.source, fetchedAt: read.fetchedAt });
    }
    return read;
  }
  if (unreachable && cached && isStaleUsable(cached, now())) {
    const day = new Date(cached.fetchedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return {
      ...fromCache(cached, "stale", `The program page didn't respond, so this uses the copy read on ${day}.`),
      attempts: read.attempts,
      fallbackUsed: read.fallbackUsed,
    };
  }
  return read;
}

async function readLive(
  url: string,
  deps: PageDeps,
  now: () => Date,
  deadline: number,
): Promise<LiveRead> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const clock = () => now().getTime();
  const retry = { sleep: deps.sleep, deadline, clock };
  const target = new URL(url);

  let robotsTxt = "";
  try {
    const { response } = await fetchWithRetry(
      fetchImpl,
      new URL("/robots.txt", target.origin).toString(),
      { headers: { "User-Agent": USER_AGENT }, redirect: "follow" },
      retry,
    );
    if (response.ok) {
      robotsTxt = await readBounded(response, 200_000);
    } else if (isRetryableStatus(response.status)) {
      return { read: stopped("error", ROBOTS_UNREACHABLE), unreachable: true };
    }
  } catch (error) {
    const outOfTime = error instanceof FetchRetryError && error.outOfTime;
    return { read: stopped("error", outOfTime ? NO_RESPONSE : ROBOTS_UNREACHABLE), unreachable: true };
  }

  const path = `${target.pathname}${target.search}`;
  if (robotsTxt && !isPathAllowed(robotsTxt, path)) {
    return {
      read: stopped("robots_blocked", "robots.txt disallows this page, so it was not fetched."),
      unreachable: false,
    };
  }

  let attempts = 0;
  let fetched: PageRead | null = null;
  let noResponse = false;
  try {
    const result = await fetchWithRetry(
      fetchImpl,
      url,
      { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow" },
      retry,
    );
    attempts = result.attempts;
    const html = await readBounded(result.response, MAX_BYTES);
    fetched = judgeHtml(url, result.response.url || url, result.response.status, html);
    noResponse = fetched.pageStatus !== "login_wall" && isRetryableStatus(result.response.status);
  } catch (error) {
    attempts = error instanceof FetchRetryError ? error.attempts : Math.max(attempts, 1);
    noResponse = true;
  }

  if (fetched && !noResponse) {
    if (fetched.message === BOT_CHECK) {
      return { read: { ...fetched, attempts }, unreachable: true };
    }
    if (fetched.pageStatus === "ok") {
      return { read: withMeta(fetched, "fetch", now, attempts, false), unreachable: false };
    }
    if (!isEmpty(fetched)) {
      return { read: { ...fetched, attempts }, unreachable: false };
    }
  }
  if (!deps.markdown) {
    const read = fetched && !noResponse ? fetched : stopped("error", NO_RESPONSE);
    return { read: { ...read, attempts }, unreachable: true };
  }
  const markdownMs = deadline - clock();
  if (markdownMs < MIN_MARKDOWN_MS) {
    return { read: { ...stopped("error", NO_RESPONSE), attempts }, unreachable: true };
  }

  try {
    const page = await deps.markdown(url, markdownMs);
    const judged = judgeMarkdown(url, page);
    if (judged.pageStatus === "ok") {
      return { read: withMeta(judged, "markdown", now, attempts, true), unreachable: false };
    }
    if (judged.pageStatus === "login_wall") {
      return { read: { ...judged, attempts, fallbackUsed: true }, unreachable: false };
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "sop_markdown_error",
        message: error instanceof Error ? error.message : "failed",
      }),
    );
  }
  return {
    read: { ...stopped("error", NO_RESPONSE), attempts, fallbackUsed: true },
    unreachable: true,
  };
}

function judgeHtml(requested: string, finalUrl: string, status: number, html: string): PageRead {
  if (!isSamePage(requested, finalUrl) || isLoginWall(finalUrl, status, html)) {
    return stopped("login_wall", LOGIN_WALL);
  }
  if (isBotCheck(html)) {
    return stopped("error", BOT_CHECK);
  }
  if (status >= 400) {
    return stopped("error", "The public page returned an error.");
  }
  return withExcerpts(excerptsFromHtml(html, PAGE_EXCERPT_LIMIT));
}

function judgeMarkdown(requested: string, page: MarkdownPage): PageRead {
  const titled = `<title>${page.title}</title>${page.markdown}`;
  const viaLogin = page.redirectUrls.some((hop) => isLoginWall(hop, 200, ""));
  if (!isSamePage(requested, page.finalUrl) || viaLogin || isLoginWall(page.finalUrl, page.status, titled)) {
    return stopped("login_wall", LOGIN_WALL);
  }
  if (isBotCheck(titled)) {
    return stopped("error", BOT_CHECK);
  }
  if (page.status >= 400) {
    return stopped("error", "The public page returned an error.");
  }
  return withExcerpts(excerptsFromMarkdown(page.markdown, PAGE_EXCERPT_LIMIT));
}

function isSamePage(requested: string, finalUrl: string): boolean {
  try {
    const final = new URL(finalUrl);
    const requestedUrl = new URL(requested);
    return final.origin === requestedUrl.origin && final.pathname === requestedUrl.pathname;
  } catch {
    return false;
  }
}

function withExcerpts(excerpts: Excerpt[]): PageRead {
  return {
    pageStatus: excerpts.length > 0 ? "ok" : "error",
    message: excerpts.length > 0 ? READ_OK : "The public page had no readable text.",
    excerpts,
    text: excerpts.map((item) => item.text).join(" "),
    attempts: 0,
    fallbackUsed: false,
  };
}

function isEmpty(read: PageRead): boolean {
  return read.pageStatus === "error" && read.message === "The public page had no readable text.";
}

function withMeta(
  read: PageRead,
  source: PageSource,
  now: () => Date,
  attempts: number,
  fallbackUsed: boolean,
): PageRead {
  return { ...read, source, fetchedAt: now().toISOString(), attempts, fallbackUsed };
}

function fromCache(cached: CachedPage, source: "cache" | "stale", message: string): PageRead {
  return {
    pageStatus: "ok",
    message,
    excerpts: cached.excerpts,
    text: cached.excerpts.map((item) => item.text).join(" "),
    source,
    fetchedAt: cached.fetchedAt,
    attempts: 0,
    fallbackUsed: false,
  };
}

function stopped(pageStatus: PageRead["pageStatus"], message: string): PageRead {
  return { pageStatus, message, excerpts: [], text: "", attempts: 0, fallbackUsed: false };
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const room = maxBytes - total;
    const slice = value.byteLength > room ? value.slice(0, room) : value;
    chunks.push(slice);
    total += slice.byteLength;
    if (slice.byteLength < value.byteLength) {
      await reader.cancel();
      break;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
