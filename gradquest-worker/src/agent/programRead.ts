import { isAllowlisted } from "../allowlist";
import type { Excerpt } from "../crawl/excerpts";
import type { MarkdownReader } from "../crawl/markdown";
import { D1PageCache } from "../crawl/pageCache";
import { readPublicPage } from "../crawl/readPublicPage";
import type { FactKind } from "../facts/schema";
import { D1FactStore, type Snapshot } from "../facts/store";

export type AgentSql = <T = Record<string, string | number | boolean | null>>(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => T[];

export type ProgramReadBody = {
  schoolId?: number | string;
  url?: string;
};

export type ProgramReadResponse = {
  pageStatus: string;
  message?: string;
  excerpts?: Excerpt[];
  source: "snapshot" | "live";
  verifiedAsOf: string | null;
  factCounts: Record<FactKind, number>;
};

export type ProgramReadOutcome = {
  response: ProgramReadResponse;
};

function emptyFactCounts(): Record<FactKind, number> {
  return {
    overview: 0,
    requirement: 0,
    course: 0,
    faculty: 0,
    deadline: 0,
  };
}

function countFacts(snapshot: Snapshot): Record<FactKind, number> {
  const counts = emptyFactCounts();
  for (const fact of snapshot.facts) counts[fact.kind] += 1;
  return counts;
}

export async function resolveProgramRead(input: {
  body: ProgramReadBody;
  db: D1Database | undefined;
  sql: AgentSql;
  markdown?: MarkdownReader;
  setPageStatus: (pageStatus: string) => void;
  persistPage?: (schoolId: string, text: string) => Promise<void>;
}): Promise<ProgramReadOutcome> {
  const schoolId = String(input.body.schoolId ?? "");
  const url = input.body.url ?? "";

  if (input.db) {
    const snapshot = await new D1FactStore(input.db).latest(schoolId);
    if (snapshot) {
      input
        .sql`INSERT OR REPLACE INTO snapshot_reads (school_id, snapshot_json) VALUES (${schoolId}, ${JSON.stringify(snapshot)})`;
      input.setPageStatus("ok");
      return {
        response: {
          pageStatus: "ok",
          source: "snapshot",
          verifiedAsOf: snapshot.verifiedAt,
          factCounts: countFacts(snapshot),
        },
      };
    }
  }

  if (!isAllowlisted(url)) {
    return {
      response: {
        pageStatus: "not_allowlisted",
        message: "That URL is not an allowlisted public program page.",
        excerpts: [],
        source: "live",
        verifiedAsOf: null,
        factCounts: emptyFactCounts(),
      },
    };
  }

  const page = await readPublicPage(url, {
    markdown: input.markdown,
    cache: input.db ? new D1PageCache(input.db) : undefined,
  });
  input
    .sql`INSERT OR REPLACE INTO page_reads (school_id, status, excerpts_json) VALUES (${schoolId}, ${page.pageStatus}, ${JSON.stringify(page.excerpts)})`;
  if (page.pageStatus === "ok" && page.text) {
    await input.persistPage?.(schoolId, page.text);
  }
  input.setPageStatus(page.pageStatus);
  console.log(
    JSON.stringify({
      event: "sop_page",
      pageStatus: page.pageStatus,
      schoolId: schoolId || null,
      source: page.source ?? null,
      attempts: page.attempts,
      fallbackUsed: page.fallbackUsed,
    }),
  );
  return {
    response: {
      pageStatus: page.pageStatus,
      message: page.message,
      source: "live",
      verifiedAsOf: null,
      factCounts: emptyFactCounts(),
    },
  };
}
