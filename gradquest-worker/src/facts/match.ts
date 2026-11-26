import type { Excerpt } from "../crawl/excerpts";
import type { FactKind, ProgramFact } from "./schema";

export type Pair = {
  pairId: string;
  resume: Excerpt;
  fact: ProgramFact;
  score: number;
};

export type MatchCard = {
  pairId: string;
  fact: ProgramFact;
  resumeQuotes: Excerpt[];
  score: number;
  reason: string;
  researchVerified: boolean;
  thinFaculty: boolean;
  subtitle: string;
};

export type OverlapReport = {
  pairs: Pair[];
  unmatchedKinds: FactKind[];
  weak: boolean;
};

export const MATCH_MIN_SCORE = 0.6;
export const MATCH_TOP_K = 24;
export const MATCH_VISIBLE_K = 8;
export const MIN_STRONG_PAIRS = 2;
export const MAX_RESUME_FACTS = 6;
export const MAX_FACULTY_QUOTES = 2;
export const MAX_COURSE_QUOTES = 3;
export const MAX_CHUNK_USES_IN_VISIBLE = 2;
export const UNVERIFIED_FACULTY_SUBTITLE = "Research interests not verified.";

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBED_BATCH = 100;
const PAIRS_PER_RESUME_FACT = 2;
const MATCHABLE_KINDS = new Set<FactKind>(["faculty", "course"]);
const TITLE_ONLY =
  /^(dr\.?|prof\.?|professor|associate professor|assistant professor|lecturer|instructor|faculty)(\s+of\s+[\w\s&,.-]+)?\.?$/i;

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const length = Math.max(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

export function isThinFaculty(fact: ProgramFact): boolean {
  if (fact.kind !== "faculty") return false;
  const detail = fact.detail.replace(/\s+/g, " ").trim();
  if (!detail) return true;
  if (/no research/i.test(detail)) return true;
  if (TITLE_ONLY.test(detail)) return true;
  if (normalizeName(detail) === normalizeName(fact.name)) return true;
  return false;
}

export function facultySubtitle(fact: ProgramFact): string {
  if (fact.kind !== "faculty") return fact.detail.trim();
  if (isThinFaculty(fact)) return UNVERIFIED_FACULTY_SUBTITLE;
  return fact.detail.replace(/\s+/g, " ").trim();
}

export function topPairs(
  resumeVecs: number[][],
  factVecs: number[][],
  resume: Excerpt[],
  facts: ProgramFact[],
  opts: { k: number; minScore: number },
): Pair[] {
  if (resumeVecs.length !== resume.length || factVecs.length !== facts.length) {
    throw new Error("vector length does not match input length");
  }

  const candidates: { resumeIndex: number; factIndex: number; score: number }[] = [];
  for (let resumeIndex = 0; resumeIndex < resume.length; resumeIndex += 1) {
    for (let factIndex = 0; factIndex < facts.length; factIndex += 1) {
      if (!MATCHABLE_KINDS.has(facts[factIndex].kind)) continue;
      const score = cosine(resumeVecs[resumeIndex], factVecs[factIndex]);
      if (!(score >= opts.minScore)) continue;
      candidates.push({ resumeIndex, factIndex, score });
    }
  }

  candidates.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    if (left.resumeIndex !== right.resumeIndex) return left.resumeIndex - right.resumeIndex;
    return left.factIndex - right.factIndex;
  });

  const pairedFacts = new Map<string, Set<number>>();
  const pairs: Pair[] = [];
  for (const candidate of candidates) {
    if (pairs.length >= opts.k) break;
    const excerpt = resume[candidate.resumeIndex];
    const key = resumeFactKey(excerpt);
    let used = pairedFacts.get(key);
    if (!used) {
      if (pairedFacts.size >= MAX_RESUME_FACTS) continue;
      used = new Set();
      pairedFacts.set(key, used);
    }
    if (used.size >= PAIRS_PER_RESUME_FACT || used.has(candidate.factIndex)) continue;
    used.add(candidate.factIndex);
    const fact = facts[candidate.factIndex];
    pairs.push({
      pairId: `${candidate.resumeIndex}:${fact.id}`,
      resume: excerpt,
      fact,
      score: candidate.score,
    });
  }
  return pairs;
}

export function consolidateCards(
  pairs: Array<Pair & { reason?: string }>,
): MatchCard[] {
  const byFact = new Map<string, MatchCard>();
  for (const pair of pairs) {
    if (!MATCHABLE_KINDS.has(pair.fact.kind)) continue;
    const thin = isThinFaculty(pair.fact);
    const existing = byFact.get(pair.fact.id);
    const quote = pair.resume;
    if (!existing) {
      byFact.set(pair.fact.id, {
        pairId: pair.fact.id,
        fact: pair.fact,
        resumeQuotes: [quote],
        score: pair.score,
        reason: pair.reason?.trim() || "",
        researchVerified: !thin,
        thinFaculty: thin,
        subtitle: pair.fact.kind === "faculty" ? facultySubtitle(pair.fact) : "",
      });
      continue;
    }
    if (pair.score > existing.score) existing.score = pair.score;
    if (pair.reason?.trim() && (!existing.reason || pair.score >= existing.score)) {
      existing.reason = pair.reason.trim();
    }
    if (!existing.resumeQuotes.some((item) => resumeFactKey(item) === resumeFactKey(quote))) {
      existing.resumeQuotes.push(quote);
    }
  }

  const cards = [...byFact.values()].map((card) => {
    const maxQuotes = card.fact.kind === "faculty" ? MAX_FACULTY_QUOTES : MAX_COURSE_QUOTES;
    return {
      ...card,
      resumeQuotes: card.resumeQuotes.slice(0, maxQuotes),
    };
  });

  cards.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return left.pairId.localeCompare(right.pairId);
  });
  return cards;
}

/** Prefer higher-score cards; enforce each résumé chunk ≤2 uses in the visible window. */
export function splitVisibleCards(
  cards: MatchCard[],
  visibleK = MATCH_VISIBLE_K,
): { visible: MatchCard[]; rest: MatchCard[] } {
  const visible: MatchCard[] = [];
  const rest: MatchCard[] = [];
  const chunkUses = new Map<string, number>();

  for (const card of cards) {
    if (visible.length >= visibleK) {
      rest.push(card);
      continue;
    }
    const keptQuotes: Excerpt[] = [];
    for (const quote of card.resumeQuotes) {
      const key = resumeFactKey(quote);
      const used = chunkUses.get(key) ?? 0;
      if (used >= MAX_CHUNK_USES_IN_VISIBLE) continue;
      keptQuotes.push(quote);
      chunkUses.set(key, used + 1);
    }
    if (keptQuotes.length === 0 && card.resumeQuotes.length > 0) {
      rest.push(card);
      continue;
    }
    visible.push({ ...card, resumeQuotes: keptQuotes.length > 0 ? keptQuotes : card.resumeQuotes });
  }
  return { visible, rest };
}

export function countsTowardStrongPairs(card: Pick<MatchCard, "fact" | "thinFaculty">): boolean {
  if (card.fact.kind === "course") return true;
  if (card.fact.kind === "faculty") return !card.thinFaculty;
  return false;
}

export function reportOverlap(
  pairs: Pair[],
  facts: ProgramFact[],
  cards?: MatchCard[],
): OverlapReport {
  const used = new Set(pairs.map((pair) => pair.fact.kind));
  const unmatchedKinds: FactKind[] = [];
  if (!used.has("faculty")) unmatchedKinds.push("faculty");
  if (!used.has("course")) unmatchedKinds.push("course");
  const strong =
    cards?.filter(countsTowardStrongPairs).length ??
    pairs.filter((pair) => pair.fact.kind === "course" || !isThinFaculty(pair.fact)).length;
  return {
    pairs,
    unmatchedKinds,
    weak: strong < MIN_STRONG_PAIRS,
  };
}

export async function embedTexts(ai: Env["AI"], texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH) {
    const batch = texts.slice(start, start + EMBED_BATCH);
    const embedded = await ai.run(EMBED_MODEL, { text: batch });
    const data = embedded && typeof embedded === "object" && "data" in embedded ? embedded.data : undefined;
    if (!Array.isArray(data) || data.length !== batch.length || data.some((row) => !Array.isArray(row))) {
      const actual = Array.isArray(data) ? data.length : 0;
      throw new Error(`embedding batch returned ${actual} vectors for ${batch.length} texts`);
    }
    vectors.push(...data);
  }
  return vectors;
}

function resumeFactKey(excerpt: Excerpt): string {
  return JSON.stringify([excerpt.id, excerpt.text]);
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
