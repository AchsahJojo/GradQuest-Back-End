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

// Inline tags whose boundaries carry no visual whitespace on a rendered page
// (e.g. `<span>word</span><span>.</span>` renders as "word." with no gap).
// Stripping these to "" (rather than the catch-all " ") avoids inserting a
// space that was never actually on the page — the bug that made real quotes
// like "...recommendation. No GRE..." fail to match because span-wrapped
// punctuation (a Word-doc-HTML-export pattern some university catalogs use)
// turned into "...recommendation . No GRE...". Block-level tags (the
// catch-all below) keep inserting a space, since that *is* real whitespread
// on the page (e.g. adjacent `<td>` cells, paragraph/list boundaries).
const INLINE_TAGS =
  /<\/?(?:a|abbr|b|cite|code|em|font|i|kbd|mark|q|s|small|span|strike|strong|sub|sup|time|tt|u|var)\b[^>]*>/gi;

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(INLINE_TAGS, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => decodeCodePoint(match, parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, dec: string) => decodeCodePoint(match, parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    // A block-tag boundary can still leave a space directly before
    // punctuation (e.g. "...recommendation </li><li>. No GRE..." -> "...
    // recommendation . No GRE..."). That space was never really on the
    // page, so drop it rather than require every quote to include it.
    .replace(/ +([.,;])/g, "$1")
    .trim();
}
