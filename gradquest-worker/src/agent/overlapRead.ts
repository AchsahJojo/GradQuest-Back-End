import { resumeFacts } from "../draft/opening";
import type { FactKind } from "../facts/schema";
import { judgePairs } from "../facts/judge";
import {
  MATCH_MIN_SCORE,
  MATCH_TOP_K,
  MATCH_VISIBLE_K,
  consolidateCards,
  embedTexts,
  reportOverlap,
  splitVisibleCards,
  topPairs,
} from "../facts/match";
import { D1FactStore, type Snapshot } from "../facts/store";
import type { AgentSql } from "./programRead";

export type OverlapPairView = {
  pairId: string;
  resumeText: string;
  resumeQuotes: string[];
  resumeQuoteIds: string[];
  factKind: FactKind;
  factName: string;
  factDetail: string;
  subtitle: string;
  researchVerified: boolean;
  sourceUrl: string;
  reason: string;
  score: number;
};

export type OverlapReportBody = {
  pairs: OverlapPairView[];
  visibleCount: number;
  weak: boolean;
  unmatchedKinds: FactKind[];
  verifiedAsOf: string | null;
};

export type OverlapResult =
  | { status: 200; body: OverlapReportBody }
  | { status: 400; body: { error: "Upload a resume first" } }
  | { status: 503; body: { error: typeof MATCHING_UNAVAILABLE } };

export const MATCHING_UNAVAILABLE = "Matching is temporarily unavailable, try again later";

const NO_SNAPSHOT: OverlapReportBody = {
  pairs: [],
  visibleCount: MATCH_VISIBLE_K,
  weak: true,
  unmatchedKinds: ["faculty", "course"],
  verifiedAsOf: null,
};

export async function resolveOverlap(input: {
  schoolId: string;
  sql: AgentSql;
  db: D1Database | undefined;
  ai: Env["AI"];
}): Promise<OverlapResult> {
  const resumeRows = input.sql<{ id: string; text: string }>`
    SELECT id, text FROM resume_chunks
  `;
  if (resumeRows.length === 0) {
    return { status: 400, body: { error: "Upload a resume first" } };
  }

  const snapshot = await loadSnapshot(input);
  if (!snapshot) return { status: 200, body: NO_SNAPSHOT };

  const sentences = resumeFacts(resumeRows.map((row) => ({ id: row.id, text: row.text })));
  const facts = snapshot.facts.filter((fact) => fact.kind === "faculty" || fact.kind === "course");
  let judged;
  try {
    const resumeVecs = await embedTexts(
      input.ai,
      sentences.map((sentence) => sentence.text),
    );
    const factVecs = await embedTexts(
      input.ai,
      facts.map((fact) => `${fact.name}. ${fact.detail}`),
    );
    const ranked = topPairs(resumeVecs, factVecs, sentences, facts, {
      k: MATCH_TOP_K,
      minScore: MATCH_MIN_SCORE,
    });
    judged = await judgePairs(input.ai, ranked);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    console.error(JSON.stringify({ event: "sop_overlap_error", message }));
    const failure = JSON.stringify({ error: MATCHING_UNAVAILABLE });
    input.sql`
      INSERT OR REPLACE INTO overlap_reads (school_id, report_json) VALUES (${input.schoolId}, ${failure})
    `;
    return { status: 503, body: { error: MATCHING_UNAVAILABLE } };
  }
  const cards = consolidateCards(judged);
  const { visible, rest } = splitVisibleCards(cards, MATCH_VISIBLE_K);
  const ordered = [...visible, ...rest];
  const report = reportOverlap(judged, facts, cards);
  const body: OverlapReportBody = {
    pairs: ordered.map((card) => ({
      pairId: card.pairId,
      resumeText: card.resumeQuotes.map((quote) => quote.text).join("\n"),
      resumeQuotes: card.resumeQuotes.map((quote) => quote.text),
      resumeQuoteIds: card.resumeQuotes.map((quote) => quote.id),
      factKind: card.fact.kind,
      factName: card.fact.name,
      factDetail: card.thinFaculty ? "" : card.fact.detail,
      subtitle: card.subtitle,
      researchVerified: card.researchVerified,
      sourceUrl: card.fact.sourceUrl,
      reason: card.reason,
      score: card.score,
    })),
    visibleCount: MATCH_VISIBLE_K,
    weak: report.weak,
    unmatchedKinds: report.unmatchedKinds,
    verifiedAsOf: snapshot.verifiedAt,
  };
  const reportJson = JSON.stringify(body);
  input.sql`
    INSERT OR REPLACE INTO overlap_reads (school_id, report_json) VALUES (${input.schoolId}, ${reportJson})
  `;
  return { status: 200, body };
}

async function loadSnapshot(input: {
  schoolId: string;
  sql: AgentSql;
  db: D1Database | undefined;
}): Promise<Snapshot | null> {
  const cached = input.sql<{ snapshot_json: string }>`
    SELECT snapshot_json FROM snapshot_reads WHERE school_id = ${input.schoolId}
  `;
  const stored = parseSnapshot(cached[0]?.snapshot_json);
  if (!input.db) return stored;

  const latest = await new D1FactStore(input.db).latest(input.schoolId);
  if (!latest) return stored;

  if (stored && snapshotMatchesLatest(stored, latest)) return stored;

  const snapshotJson = JSON.stringify(latest);
  input.sql`
    INSERT OR REPLACE INTO snapshot_reads (school_id, snapshot_json) VALUES (${input.schoolId}, ${snapshotJson})
  `;
  if (stored) {
    input.sql`
      DELETE FROM overlap_reads WHERE school_id = ${input.schoolId}
    `;
  }
  return latest;
}

function snapshotMatchesLatest(cached: Snapshot, latest: Snapshot): boolean {
  return cached.snapshotId === latest.snapshotId || cached.verifiedAt === latest.verifiedAt;
}

export function storedMatchingError(reportJson: string | null | undefined): string | null {
  if (!reportJson) return null;
  try {
    const parsed = JSON.parse(reportJson) as { error?: unknown };
    if (parsed && parsed.error === MATCHING_UNAVAILABLE) return MATCHING_UNAVAILABLE;
  } catch {
    return null;
  }
  return null;
}

function parseSnapshot(json: string | undefined): Snapshot | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Snapshot;
    if (!parsed || typeof parsed.verifiedAt !== "string" || !Array.isArray(parsed.facts)) return null;
    return parsed;
  } catch {
    return null;
  }
}
