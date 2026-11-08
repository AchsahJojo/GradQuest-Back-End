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

const BOT_CHECK =
  /verify (?:that )?you(?:'|’)?re not a robot|checking (?:if the site connection is secure|your browser)|enable javascript and (?:then )?reload|attention required! \| cloudflare|<title>just a moment\.\.\.<\/title>/i;

export function isBotCheck(html: string): boolean {
  return BOT_CHECK.test(html);
}

// Named HTML entities commonly seen on program pages that affect quote matching
// (smart quotes and dashes in particular — a page rendered with `&rsquo;` should
// still match a quote typed with a plain apostrophe once normalizeForMatch runs).
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  ndash: "-",
  mdash: "--",
};

// Unicode code points only go up to 0x10FFFF; `String.fromCodePoint` throws a
// RangeError for anything outside that range (or negative/NaN values), so we
// guard the decode and leave the entity's original text untouched rather than
// crashing on a malformed/out-of-range `&#NNN;`/`&#xNNN;` entity.
function decodeCodePoint(match: string, codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return match;
  }
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return match;
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => decodeCodePoint(match, parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, dec: string) => decodeCodePoint(match, parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}
