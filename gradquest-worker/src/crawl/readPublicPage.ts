import { isAllowlisted } from "../allowlist";
import { excerptsFromHtml, type Excerpt } from "./excerpts";
import { isLoginWall } from "./loginWall";
import { isPathAllowed } from "./robots";

export type PageRead = {
  pageStatus: "ok" | "robots_blocked" | "login_wall" | "not_allowlisted" | "error";
  message: string;
  excerpts: Excerpt[];
  text: string;
};

const USER_AGENT = "GradQuestSOP/1.0 (public program pages only)";
const MAX_BYTES = 1_500_000;

export async function readPublicPage(
  url: string,
  fetchImpl: typeof fetch = fetch,
  render?: (url: string) => Promise<string>,
): Promise<PageRead> {
  if (!isAllowlisted(url)) {
    return {
      pageStatus: "not_allowlisted",
      message: "That URL is not an allowlisted public program page.",
      excerpts: [],
      text: "",
    };
  }

  const target = new URL(url);
  let robotsTxt = "";
  try {
    const robots = await fetchImpl(new URL("/robots.txt", target.origin).toString(), {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (robots.ok) robotsTxt = await readBounded(robots, 200_000);
  } catch {
    return stopped("error", "Could not read robots.txt, so the page was not fetched.");
  }

  const path = `${target.pathname}${target.search}`;
  if (robotsTxt && !isPathAllowed(robotsTxt, path)) {
    return stopped("robots_blocked", "robots.txt disallows this page, so it was not fetched.");
  }

  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
    });
    const html = await readBounded(response, MAX_BYTES);
    const first = judge(url, response.url || url, response.status, html);
    if (first.pageStatus !== "error" || !render) return first;

    const rendered = await render(url);
    return judge(url, url, 200, rendered);
  } catch {
    return stopped("error", "The public page could not be fetched.");
  }
}

function judge(requested: string, finalUrl: string, status: number, html: string): PageRead {
  let final: URL;
  let requestedUrl: URL;
  try {
    final = new URL(finalUrl);
    requestedUrl = new URL(requested);
  } catch {
    return stopped("error", "The page URL was not usable.");
  }
  const samePage =
    final.origin === requestedUrl.origin && final.pathname === requestedUrl.pathname;
  if (!samePage || !isAllowlisted(requested) || isLoginWall(finalUrl, status, html)) {
    return stopped(
      "login_wall",
      "This page is behind a login or left the public program page. Paste the prompt if you have it. GradQuest will not guess it.",
    );
  }
  if (status >= 400) {
    return stopped("error", "The public page returned an error.");
  }
  const excerpts = excerptsFromHtml(html);
  return {
    pageStatus: excerpts.length > 0 ? "ok" : "error",
    message: excerpts.length > 0 ? "Read the public program page." : "The public page had no readable text.",
    excerpts,
    text: excerpts.map((item) => item.text).join(" "),
  };
}

function stopped(pageStatus: PageRead["pageStatus"], message: string): PageRead {
  return { pageStatus, message, excerpts: [], text: "" };
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
