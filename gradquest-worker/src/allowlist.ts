/** Public program pages. Keep this set identical to SopAllowlist.java. */
export const ALLOWED_PROGRAM_URLS = [
  "https://catalog.fullerton.edu/preview_program.php?catoid=70&poid=32661",
  "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/",
  "https://cse.ucsd.edu/graduate/degree-programs/ms-program",
] as const;

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

const ALLOWED = new Set(ALLOWED_PROGRAM_URLS.map(normalizeUrl));

export function isAllowlisted(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED.has(normalizeUrl(parsed.toString()));
  } catch {
    return false;
  }
}
