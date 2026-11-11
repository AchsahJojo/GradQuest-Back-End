import type { FactKind, ProgramFact, ProgramResearch } from "./schema";

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B\u00AD]/g, "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2010\u2011\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

// A bare person's name ("Lastname, Firstname" or "Firstname [M.] Lastname")
// is below the normal 20-character minimum far more often than any other
// fact shape, and a department-wide faculty listing frequently has nothing
// else adjacent to quote (see Cal Poly for a counterexample where a title
// *is* adjacent — that case just gets a longer combined quote instead of
// going through this path). A full name is still safe to auto-match on its
// own, shorter, because it isn't one or two generic words that could appear
// by coincidence elsewhere on the page — it's a specific two-part name — as
// long as the match respects word boundaries (so "Kane" can't match inside
// "Kaneko", etc.).
const FULL_NAME_SHAPE =
  /^\p{Lu}[\p{L}'’.-]+,\s+\p{Lu}[\p{L}'’.-]+$|^\p{Lu}[\p{L}'’.-]+(?:\s+\p{Lu}\.)?\s+\p{Lu}[\p{L}'’.-]+$/u;
const MIN_NAME_LENGTH = 8;

function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

function wordBoundaryIncludes(haystack: string, needle: string): boolean {
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    const before = idx > 0 ? haystack[idx - 1] : "";
    const after = idx + needle.length < haystack.length ? haystack[idx + needle.length] : "";
    if (!isLetter(before) && !isLetter(after)) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

export function quoteFound(pageText: string, quote: string, kind?: FactKind): boolean {
  const needle = normalizeForMatch(quote);
  if (kind === "faculty" && needle.length >= MIN_NAME_LENGTH && FULL_NAME_SHAPE.test(quote.trim())) {
    return wordBoundaryIncludes(normalizeForMatch(pageText), needle);
  }
  if (needle.length < 20) return false;
  return normalizeForMatch(pageText).includes(needle);
}

export type CheckedFact = ProgramFact & {
  quoteFound: boolean;
  verified: boolean;
  fetchedAt: string;
  quoteCheck?: "auto" | "manual";
};

export type CheckedResearch = Omit<ProgramResearch, "facts"> & {
  snapshotId: string;
  /** When this check run happened (`checkFacts`'s `now`). Maps to `program_snapshots.verified_at`. */
  verifiedAt: string;
  pageHashes: Record<string, string>;
  facts: CheckedFact[];
};

export async function pageHash(pageText: string): Promise<string> {
  const normalized = normalizeForMatch(pageText);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkFacts(
  research: ProgramResearch,
  pages: Map<string, string>,
  now: Date,
): Promise<CheckedResearch> {
  const fetchedAt = now.toISOString();
  const snapshotId = `${research.schoolId}-${formatYYYYMMDD(now)}`;

  // Only hash pages that actually belong to this school's research — `pages`
  // may be a cache shared across many schools in the same run (verifyFacts.ts
  // fetches each distinct URL once across the whole run), so we must not leak
  // other schools' page hashes into this school's CheckedResearch.
  const relevantUrls = new Set<string>();
  for (const page of research.pages) relevantUrls.add(page.url);
  for (const fact of research.facts) relevantUrls.add(fact.sourceUrl);

  const pageHashes: Record<string, string> = {};
  for (const url of relevantUrls) {
    const text = pages.get(url);
    if (text !== undefined) {
      pageHashes[url] = await pageHash(text);
    }
  }

  const facts: CheckedFact[] = research.facts.map((fact) => ({
    ...fact,
    quoteFound: quoteFound(pages.get(fact.sourceUrl) ?? "", fact.quote, fact.kind),
    verified: false,
    fetchedAt,
    quoteCheck: "auto",
  }));

  return {
    schoolId: research.schoolId,
    schoolName: research.schoolName,
    programName: research.programName,
    pages: research.pages,
    snapshotId,
    verifiedAt: fetchedAt,
    pageHashes,
    facts,
  };
}

/**
 * Carries forward Achsah's manual edits (`verified`, `quoteCheck`) from a
 * previous `.checked.json` run into a freshly computed set of `CheckedFact`s,
 * matched by fact `id`. Facts that didn't exist in the previous run start at
 * `checkFacts`'s defaults (`verified: false`, `quoteCheck: "auto"`).
 *
 * A fact's `fetchedAt` is also carried forward from the previous run, but
 * only when its `quoteFound` status is unchanged — if the quote now matches
 * differently than before, the fact gets the new run's `fetchedAt` instead,
 * since that reflects when the page producing that judgment was fetched.
 */
export function carryForwardFacts(freshFacts: CheckedFact[], previousFacts: CheckedFact[] | undefined): CheckedFact[] {
  if (!previousFacts || previousFacts.length === 0) return freshFacts;
  const previousById = new Map(previousFacts.map((fact) => [fact.id, fact]));
  return freshFacts.map((fact) => {
    const previous = previousById.get(fact.id);
    if (!previous) return fact;
    const quoteFoundUnchanged = previous.quoteFound === fact.quoteFound;
    return {
      ...fact,
      verified: previous.verified,
      quoteCheck: previous.quoteCheck ?? fact.quoteCheck,
      fetchedAt: quoteFoundUnchanged ? previous.fetchedAt : fact.fetchedAt,
    };
  });
}

function formatYYYYMMDD(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
