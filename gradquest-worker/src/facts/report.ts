import type { FactKind } from "./schema";
import { pageHash, quoteFound, type CheckedFact, type CheckedResearch } from "./verify";

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

export type ChangeReport = {
  schoolId: number;
  missingQuotes: CheckedFact[];
  changedPages: string[];
  unreachable: string[];
};

function relevantUrls(checked: CheckedResearch): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };
  for (const page of checked.pages) add(page.url);
  for (const fact of checked.facts) add(fact.sourceUrl);
  return urls;
}

/**
 * Compares a verified snapshot with a fresh fetch.
 * A verified quote missing from a fetched page is listed in `missingQuotes`.
 * A fetched page whose hash differs is listed in `changedPages`.
 * A snapshot URL with no fetched text is listed in `unreachable`.
 * An unchanged page adds nothing to those lists.
 */
export async function compareSnapshot(
  checked: CheckedResearch,
  pages: Map<string, string>,
): Promise<ChangeReport> {
  const changedPages: string[] = [];
  const unreachable: string[] = [];
  for (const url of relevantUrls(checked)) {
    const text = pages.get(url);
    if (text === undefined) {
      unreachable.push(url);
      continue;
    }
    const hash = await pageHash(text);
    if (hash !== checked.pageHashes[url]) changedPages.push(url);
  }

  const missingQuotes = checked.facts.filter((fact) => {
    if (!fact.verified) return false;
    const text = pages.get(fact.sourceUrl);
    if (text === undefined) return false;
    return !quoteFound(text, fact.quote, fact.kind);
  });

  return {
    schoolId: checked.schoolId,
    missingQuotes,
    changedPages,
    unreachable,
  };
}

export function changesMarkdown(report: ChangeReport): string {
  const lines: string[] = [];
  lines.push(`# School ${report.schoolId} changes`);
  lines.push("");
  lines.push("## Missing quotes");
  if (report.missingQuotes.length === 0) {
    lines.push("None.");
  } else {
    for (const fact of report.missingQuotes) {
      lines.push(`- [${fact.kind}] ${fact.name} (${fact.id}) — ${fact.sourceUrl}`);
      lines.push(`  quote: "${fact.quote}"`);
    }
  }
  lines.push("");
  lines.push("## Changed pages");
  if (report.changedPages.length === 0) {
    lines.push("None.");
  } else {
    for (const url of report.changedPages) lines.push(`- ${url}`);
  }
  lines.push("");
  lines.push("## Unreachable");
  if (report.unreachable.length === 0) {
    lines.push("None.");
  } else {
    for (const url of report.unreachable) lines.push(`- ${url}`);
  }
  lines.push("");
  lines.push("Nothing here is applied automatically. If a quote is missing or a page changed, rerun research for this school.");
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
