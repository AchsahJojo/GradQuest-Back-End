import type { FactKind, ProgramFact } from "./schema";

export type Snapshot = {
  snapshotId: string;
  schoolId: string;
  verifiedAt: string;
  facts: ProgramFact[];
};

export interface FactStore {
  latest(schoolId: string): Promise<Snapshot | null>;
}

type SnapshotRow = {
  snapshot_id: string;
  school_id: string;
  verified_at: string;
};

type FactRow = {
  fact_id: string;
  kind: FactKind;
  name: string;
  detail: string;
  source_url: string;
  quote: string;
};

export class D1FactStore implements FactStore {
  constructor(private readonly db: D1Database) {}

  async latest(schoolId: string): Promise<Snapshot | null> {
    const snapshot = await this.db
      .prepare(
        "SELECT snapshot_id, school_id, verified_at FROM program_snapshots WHERE school_id = ? ORDER BY verified_at DESC LIMIT 1",
      )
      .bind(schoolId)
      .first<SnapshotRow>();
    if (!snapshot) return null;

    const { results } = await this.db
      .prepare("SELECT fact_id, kind, name, detail, source_url, quote FROM program_facts WHERE snapshot_id = ?")
      .bind(snapshot.snapshot_id)
      .all<FactRow>();

    return {
      snapshotId: snapshot.snapshot_id,
      schoolId: snapshot.school_id,
      verifiedAt: snapshot.verified_at,
      facts: (results ?? []).map((row) => ({
        id: row.fact_id,
        kind: row.kind,
        name: row.name,
        detail: row.detail,
        sourceUrl: row.source_url,
        quote: row.quote,
      })),
    };
  }
}
