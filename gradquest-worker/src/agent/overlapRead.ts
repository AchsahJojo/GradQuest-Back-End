import { resumeFacts } from "../draft/opening";
import type { FactKind } from "../facts/schema";
import { judgePairs } from "../facts/judge";
import {
  MATCH_MIN_SCORE,
  MATCH_TOP_K,
  embedTexts,
  reportOverlap,
  topPairs,
} from "../facts/match";
import { D1FactStore, type Snapshot } from "../facts/store";
import type { AgentSql } from "./programRead";

export type OverlapPairView = {
  pairId: string;
  resumeText: string;
  factKind: FactKind;
  factName: string;
  factDetail: string;
  sourceUrl: string;
  reason: string;
};

export type OverlapReportBody = {
  pairs: OverlapPairView[];
  weak: boolean;
  unmatchedKinds: FactKind[];
  verifiedAsOf: string | null;
};

export type OverlapResult =
  | { status: 200; body: OverlapReportBody }
  | { status: 400; body: { error: "Upload a resume first" } };

const NO_SNAPSHOT: OverlapReportBody = {
  pairs: [],
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
  const judged = await judgePairs(input.ai, ranked);
  const report = reportOverlap(judged, facts);
  const body: OverlapReportBody = {
    pairs: judged.map((pair) => ({
      pairId: pair.pairId,
      resumeText: pair.resume.text,
      factKind: pair.fact.kind,
      factName: pair.fact.name,
      factDetail: pair.fact.detail,
      sourceUrl: pair.fact.sourceUrl,
      reason: pair.reason,
    })),
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
  if (stored) return stored;
  if (!input.db) return null;
  const latest = await new D1FactStore(input.db).latest(input.schoolId);
  if (!latest) return null;
  const snapshotJson = JSON.stringify(latest);
  input.sql`
    INSERT OR REPLACE INTO snapshot_reads (school_id, snapshot_json) VALUES (${input.schoolId}, ${snapshotJson})
  `;
  return latest;
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
