import type { Excerpt } from "../crawl/excerpts";
import type { FactKind, ProgramFact } from "./schema";

export type Pair = {
  pairId: string;
  resume: Excerpt;
  fact: ProgramFact;
  score: number;
};

export type OverlapReport = {
  pairs: Pair[];
  unmatchedKinds: FactKind[];
  weak: boolean;
};

export const MATCH_MIN_SCORE = 0.62;
export const MATCH_TOP_K = 8;
export const MIN_STRONG_PAIRS = 2;
export const MAX_RESUME_FACTS = 6;

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBED_BATCH = 100;
const PAIRS_PER_RESUME_FACT = 2;
const MATCHABLE_KINDS = new Set<FactKind>(["faculty", "course"]);

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

export function reportOverlap(pairs: Pair[], facts: ProgramFact[]): OverlapReport {
  const used = new Set(pairs.map((pair) => pair.fact.kind));
  const unmatchedKinds: FactKind[] = [];
  if (!used.has("faculty")) unmatchedKinds.push("faculty");
  if (!used.has("course")) unmatchedKinds.push("course");
  return {
    pairs,
    unmatchedKinds,
    weak: pairs.length < MIN_STRONG_PAIRS,
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
