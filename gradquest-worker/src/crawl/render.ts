import puppeteer from "@cloudflare/puppeteer";
import { isAllowlisted } from "../allowlist";

/** Browser Rendering for pages whose first HTML response has no readable text. */
export async function renderAllowlistedPage(browserBinding: Env["BROWSER"], url: string): Promise<string> {
  if (!isAllowlisted(url)) {
    throw new Error("Refusing to render a URL outside the allowlist");
  }
  const browser = await puppeteer.launch(browserBinding);
  try {
    const page = await browser.newPage();
    await page.setUserAgent("GradQuestSOP/1.0 (public program pages only)");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const requested = new URL(url);
    const final = new URL(page.url());
    if (final.origin !== requested.origin || final.pathname !== requested.pathname) {
      return "<title>Sign in</title><input type=\"password\">";
    }
    const html = await page.content();
    return html.slice(0, 1_500_000);
  } finally {
    await browser.close();
  }
}
