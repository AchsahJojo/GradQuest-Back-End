import type { FactKind } from "./schema";
import type { CheckedFact, CheckedResearch } from "./verify";

const FACT_KINDS: FactKind[] = ["overview", "requirement", "course", "faculty", "deadline"];

function isFound(fact: CheckedFact): boolean {
  return fact.quoteFound || fact.quoteCheck === "manual";
}

export function reportMarkdown(checked: CheckedResearch): string {
  const lines: string[] = [];
  lines.push(`# ${checked.schoolName} — ${checked.programName}`);
  lines.push(`Snapshot: ${checked.snapshotId}`);
  lines.push("");

  const failed = checked.facts.filter((fact) => !isFound(fact) && checked.pageHashes[fact.sourceUrl] !== undefined);
  const notCheckable = checked.facts.filter((fact) => !isFound(fact) && checked.pageHashes[fact.sourceUrl] === undefined);

  lines.push("## Failed quotes");
  if (failed.length === 0) {
    lines.push("None.");
  } else {
    for (const fact of failed) {
      lines.push(`- [${fact.kind}] ${fact.name} (${fact.id}) — ${fact.sourceUrl}`);
      lines.push(`  quote: "${fact.quote}"`);
    }
  }
  lines.push("");

  if (notCheckable.length > 0) {
    lines.push("## Not checkable");
    lines.push("These pages could not be fetched (JavaScript-rendered, blocked, or unreachable).");
    lines.push("Set \"quoteCheck\": \"manual\" and \"verified\": true in the .checked.json to keep a fact.");
    for (const fact of notCheckable) {
      lines.push(`- [${fact.kind}] ${fact.name} (${fact.id}) — ${fact.sourceUrl}`);
    }
    lines.push("");
  }

  lines.push("## Counts by kind");
  for (const kind of FACT_KINDS) {
    const factsOfKind = checked.facts.filter((fact) => fact.kind === kind);
    if (factsOfKind.length === 0) continue;
    const foundCount = factsOfKind.filter((fact) => isFound(fact)).length;
    lines.push(`- ${kind}: ${foundCount}/${factsOfKind.length} quotes found`);
  }

  return lines.join("\n");
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Emits SQL matching Task 3's D1 schema:
 *
 *   program_snapshots(snapshot_id TEXT PRIMARY KEY, school_id TEXT NOT NULL, verified_at TEXT NOT NULL)
 *   program_facts(snapshot_id TEXT NOT NULL, fact_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
 *                 detail TEXT NOT NULL, source_url TEXT NOT NULL, quote TEXT NOT NULL, fetched_at TEXT NOT NULL,
 *                 PRIMARY KEY (snapshot_id, fact_id))
 *
 * Only facts with `(quoteFound || quoteCheck === "manual") && verified` are emitted. If none qualify,
 * the snapshot itself is also skipped (an empty/placeholder snapshot would otherwise shadow an older,
 * still-useful snapshot when a later task reads "the newest snapshot").
 */
export function snapshotSql(checked: CheckedResearch): string {
  const verifiedFacts = checked.facts.filter((fact) => isFound(fact) && fact.verified);
  if (verifiedFacts.length === 0) {
    return `-- snapshotSql: no verified facts for school ${checked.schoolId} (snapshot ${checked.snapshotId}); skipping program_snapshots insert`;
  }

  const statements: string[] = [
    `INSERT INTO program_snapshots (snapshot_id, school_id, verified_at) VALUES (${sqlString(
      checked.snapshotId,
    )}, ${sqlString(String(checked.schoolId))}, ${sqlString(checked.verifiedAt)});`,
  ];

  for (const fact of verifiedFacts) {
    statements.push(
      `INSERT INTO program_facts (snapshot_id, fact_id, kind, name, detail, source_url, quote, fetched_at) VALUES (${sqlString(
        checked.snapshotId,
      )}, ${sqlString(fact.id)}, ${sqlString(fact.kind)}, ${sqlString(fact.name)}, ${sqlString(fact.detail)}, ${sqlString(
        fact.sourceUrl,
      )}, ${sqlString(fact.quote)}, ${sqlString(fact.fetchedAt)});`,
    );
  }

  return statements.join("\n");
}
