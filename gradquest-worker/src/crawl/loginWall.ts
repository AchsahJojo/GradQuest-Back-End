const BLOCKED_URL =
  /calstate\.edu\/apply|slate\.com|technolutions|\/login(?:\/|$|\?)|\/signin(?:\/|$|\?)|\/sign-in(?:\/|$|\?)/i;

export function isLoginWall(finalUrl: string, status: number, html: string): boolean {
  if (status === 401 || status === 403) return true;
  if (BLOCKED_URL.test(finalUrl)) return true;
  const text = stripHtml(html);
  const title = (/<title>(.*?)<\/title>/i.exec(html)?.[1] ?? "").trim().toLowerCase();
  const password = /type\s*=\s*["']password["']/i.test(html);
  const signInTitle = /^(sign in|log in|login|authenticate)$/.test(title);
  if (signInTitle) return true;
  if (password && text.length < 500) return true;
  return false;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
