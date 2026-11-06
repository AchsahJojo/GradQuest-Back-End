import { isAllowlisted } from "../allowlist";

export type MarkdownPage = {
  markdown: string;
  status: number;
  title: string;
  finalUrl: string;
  redirectUrls: string[];
};

export type MarkdownReader = (url: string, timeoutMs?: number) => Promise<MarkdownPage>;

const USER_AGENT = "GradQuestSOP/1.0 (public program pages only)";
const TIMEOUT_MS = 15_000;

export function browserMarkdown(browser: Env["BROWSER"]): MarkdownReader {
  return async (url, timeoutMs = TIMEOUT_MS) => {
    if (!isAllowlisted(url)) {
      throw new Error("Refusing to read a URL outside the allowlist");
    }
    const response = await withTimeout(
      browser.quickAction("markdown", { url, userAgent: USER_AGENT }),
      Math.min(timeoutMs, TIMEOUT_MS),
    );
    const body = (await response.json().catch(() => null)) as
      | BrowserRunMarkdownSuccessResponse
      | BrowserRunErrorResponse
      | null;
    if (!response.ok || !body || !body.success) {
      const code = body && !body.success ? body.errors?.[0]?.code : undefined;
      throw new Error(`Browser Run markdown failed: HTTP ${response.status}${code ? ` code ${code}` : ""}`);
    }
    return {
      markdown: body.result ?? "",
      status: body.meta?.status ?? 200,
      title: body.meta?.title ?? "",
      finalUrl: body.meta?.finalUrl || url,
      redirectUrls: (body.meta?.redirectChain ?? []).map((hop) => hop.url),
    };
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Browser Run markdown timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer ?? null));
}
