import { describe, expect, it, vi } from "vitest";
import type { Excerpt } from "../src/crawl/excerpts";
import type { ProgramFact, ProgramResearch } from "../src/facts/schema";
import { parseProgramResearch } from "../src/facts/schema";
import { judgePairs, judgePrompt, parseJudgement } from "../src/facts/judge";
import { precisionRecall, readTokenUsage } from "../src/facts/evalMetrics";
import { MATCH_MIN_SCORE, cosine, embedTexts, reportOverlap, topPairs, type Pair } from "../src/facts/match";
import { D1FactStore } from "../src/facts/store";
import {
  carryForwardFacts,
  checkFacts,
  pageHash,
  quoteFound,
  type CheckedFact,
  type CheckedResearch,
} from "../src/facts/verify";
import { reportMarkdown, snapshotSql } from "../src/facts/report";
import { stripHtml } from "../src/crawl/loginWall";

const PAGE = "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/";

function sampleResearch() {
  return {
    schoolId: 3,
    schoolName: "Cal Poly San Luis Obispo",
    programName: "Computer Science, M.S.",
    pages: [
      { kind: "overview", url: PAGE },
      { kind: "admissions", url: "https://catalog.calpoly.edu/graduateeducation/" },
      { kind: "curriculum", url: PAGE },
      { kind: "faculty", url: "https://cs.calpoly.edu/faculty" },
      { kind: "deadlines", url: "https://www.calpoly.edu/admissions/deadlines" },
    ],
    facts: [
      {
        id: "f1",
        kind: "overview",
        name: "Program overview",
        detail: "The M.S. in Computer Science prepares students for research and professional practice.",
        sourceUrl: PAGE,
        quote: "The M.S. in Computer Science prepares students for research and professional practice in computing.",
      },
      {
        id: "f2",
        kind: "requirement",
        name: "45 units",
        detail: "Students complete 45 quarter units of graduate coursework.",
        sourceUrl: PAGE,
        quote: "Students complete 45 quarter units of graduate coursework in computer science.",
      },
      {
        id: "f3",
        kind: "course",
        name: "CSC 530 - Computer Architecture",
        detail: "Advanced topics in computer architecture, including pipelining and memory hierarchy.",
        sourceUrl: PAGE,
        quote: "CSC 530 Computer Architecture (4) Advanced topics in computer architecture, including pipelining and memory hierarchy.",
      },
      {
        id: "f4",
        kind: "faculty",
        name: "Jane Smith",
        detail: "Research in distributed systems and fault tolerance.",
        sourceUrl: "https://cs.calpoly.edu/people/jane-smith",
        quote: "Jane Smith, Professor. Research interests: distributed systems, fault tolerance.",
      },
      {
        id: "f5",
        kind: "deadline",
        name: "Fall application deadline",
        detail: "Applications for fall admission are due April 1.",
        sourceUrl: "https://www.calpoly.edu/admissions/deadlines",
        quote: "Applications for fall admission to the M.S. in Computer Science are due April 1.",
      },
    ],
  };
}

function cloneSample(): Record<string, unknown> {
  return structuredClone(sampleResearch());
}

describe("parseProgramResearch", () => {
  it("accepts a sample with one fact of each kind", () => {
    const { research, errors } = parseProgramResearch(sampleResearch());
    expect(errors).toEqual([]);
    expect(research).not.toBeNull();
    expect(research?.facts.map((fact) => fact.kind)).toEqual([
      "overview",
      "requirement",
      "course",
      "faculty",
      "deadline",
    ]);
  });

  it("rejects a missing sourceUrl", () => {
    const json = cloneSample();
    const facts = json.facts as Record<string, unknown>[];
    delete facts[0].sourceUrl;
    const { research, errors } = parseProgramResearch(json);
    expect(research).toBeNull();
    expect(errors.some((error) => /sourceUrl/i.test(error))).toBe(true);
  });

  it("rejects a non-https URL", () => {
    const json = cloneSample();
    const facts = json.facts as Record<string, unknown>[];
    facts[0].sourceUrl = PAGE.replace("https://", "http://");
    const { research, errors } = parseProgramResearch(json);
    expect(research).toBeNull();
    expect(errors.some((error) => /https/i.test(error))).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const json = cloneSample();
    const facts = json.facts as Record<string, unknown>[];
    facts[0].kind = "research";
    const { research, errors } = parseProgramResearch(json);
    expect(research).toBeNull();
    expect(errors.some((error) => /kind/i.test(error))).toBe(true);
  });

  it("rejects an empty quote", () => {
    const json = cloneSample();
    const facts = json.facts as Record<string, unknown>[];
    facts[0].quote = "";
    const { research, errors } = parseProgramResearch(json);
    expect(research).toBeNull();
    expect(errors.some((error) => /quote/i.test(error))).toBe(true);
  });

  it("rejects a quote over 300 characters", () => {
    const json = cloneSample();
    const facts = json.facts as Record<string, unknown>[];
    facts[0].quote = "a".repeat(301);
    const { research, errors } = parseProgramResearch(json);
    expect(research).toBeNull();
    expect(errors.some((error) => /quote/i.test(error) && /300/i.test(error))).toBe(true);
  });

  it("rejects a duplicate fact id", () => {
    const json = cloneSample();
    const facts = json.facts as Record<string, unknown>[];
    facts[1].id = facts[0].id;
    const { research, errors } = parseProgramResearch(json);
    expect(research).toBeNull();
    expect(errors.some((error) => /duplicate/i.test(error))).toBe(true);
  });
});

describe("quoteFound", () => {
  const page =
    'The program requires 30 units and a thesis. Students complete "systems" work-including theory.';

  it("returns true for an exact match", () => {
    expect(quoteFound(page, "The program requires 30 units and a thesis.")).toBe(true);
  });

  it("returns true for extra spaces or newlines", () => {
    expect(
      quoteFound("The program requires  30   units\nand a thesis. Extra.", "The program requires 30 units and a thesis."),
    ).toBe(true);
  });

  it("returns true for curly versus straight quotes and dashes", () => {
    const curlyPage = "Students complete “systems” work—including theory on the public page.";
    const straightQuote = 'Students complete "systems" work-including theory';
    expect(quoteFound(curlyPage, straightQuote)).toBe(true);
    expect(quoteFound(page, "Students complete “systems” work—including theory")).toBe(true);
  });

  it("returns false when one word is changed", () => {
    expect(quoteFound(page, "The program requires 45 units and a thesis.")).toBe(false);
  });

  it("returns false for quotes under 20 characters", () => {
    expect(quoteFound("short quote is here on the page for matching", "short quote")).toBe(false);
  });

  it("matches hyphen, non-breaking hyphen, and minus with ASCII dash", () => {
    const page = "Advanced topics in computer-architecture including pipelining.";
    expect(quoteFound(page, "Advanced topics in computer\u2010architecture including")).toBe(true);
    expect(quoteFound(page, "Advanced topics in computer\u2011architecture including")).toBe(true);
    expect(quoteFound(page, "Advanced topics in computer\u2212architecture including")).toBe(true);
  });

  it("matches modifier apostrophes, low double quotes, and ellipsis", () => {
    expect(
      quoteFound(
        "Students complete the program's \"systems\" work... including theory.",
        "Students complete the program\u02BCs \"systems\" work\u2026 including theory.",
      ),
    ).toBe(true);
    expect(
      quoteFound("Students complete \u201Esystems\u201C work including theory here.", 'Students complete "systems" work including theory'),
    ).toBe(true);
  });

  it("matches NFKC accents and strips zero-width space and soft hyphen", () => {
    expect(quoteFound("The café requires thirty units and a thesis.", "The cafe\u0301 requires thirty units")).toBe(true);
    expect(quoteFound("The program requires\u200B 30 units and a thesis.", "The program requires 30 units and a thesis.")).toBe(true);
    expect(quoteFound("The program requires 30 units and a thesis.", "The program require\u00ADs 30 units and a thesis.")).toBe(true);
  });

  it("allows a short faculty full-name quote when it matches on word boundaries", () => {
    const listing =
      "Christine Alvarado Nadia Polikarpova Geoffrey M. Voelker and other faculty.";
    expect(quoteFound(listing, "Christine Alvarado", "faculty")).toBe(true);
    expect(quoteFound(listing, "Geoffrey M. Voelker", "faculty")).toBe(true);
    expect(quoteFound("Anderson, Paul Professor of AI", "Anderson, Paul", "faculty")).toBe(true);
  });

  it("rejects a short faculty name that is only a substring of a longer word", () => {
    expect(quoteFound("Kaneko is listed nearby", "Kane", "faculty")).toBe(false);
    expect(quoteFound("Daniel M. Kaneko is listed", "Daniel M. Kane", "faculty")).toBe(false);
  });

  it("still rejects short non-faculty quotes even when they look like a name", () => {
    expect(quoteFound("Christine Alvarado teaches systems", "Christine Alvarado")).toBe(false);
    expect(quoteFound("Christine Alvarado teaches systems", "Christine Alvarado", "course")).toBe(false);
  });

  it("still requires the normal 20-character minimum for longer faculty research blurbs", () => {
    expect(
      quoteFound(
        "She works at the intersection of programming languages and AI.",
        "intersection of programming languages and AI.",
        "faculty",
      ),
    ).toBe(true);
    expect(quoteFound("She works on AI research here.", "works on AI", "faculty")).toBe(false);
  });
});

describe("pageHash", () => {
  it("gives the same value when only whitespace differs", async () => {
    const a = await pageHash("The program requires 30 units and a thesis.");
    const b = await pageHash("The   program requires 30 units\nand a thesis.  ");
    expect(a).toBe(b);
  });

  it("gives a different value when one word changes", async () => {
    const a = await pageHash("The program requires 30 units and a thesis.");
    const b = await pageHash("The program requires 45 units and a thesis.");
    expect(a).not.toBe(b);
  });

  it("returns a hex-encoded SHA-256 digest", async () => {
    const hash = await pageHash("hello world");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

function pagesFor(research: ProgramResearch, overrides: Record<string, string> = {}): Map<string, string> {
  const pages = new Map<string, string>();
  for (const fact of research.facts) {
    pages.set(fact.sourceUrl, fact.quote);
  }
  for (const [url, text] of Object.entries(overrides)) {
    pages.set(url, text);
  }
  return pages;
}

describe("checkFacts", () => {
  it("sets quoteFound per fact", async () => {
    const research = sampleResearch() as ProgramResearch;
    const pages = pagesFor(research);
    // Break the quote match for one fact.
    pages.set(research.facts[1].sourceUrl, "nothing relevant on this page at all");
    pages.set(research.facts[0].sourceUrl, research.facts[0].quote);
    const checked = await checkFacts(research, pages, new Date("2026-02-03T00:00:00Z"));
    expect(checked.facts[0].quoteFound).toBe(true);
  });

  it("always sets verified: false", async () => {
    const research = sampleResearch() as ProgramResearch;
    const pages = pagesFor(research);
    const checked = await checkFacts(research, pages, new Date("2026-02-03T00:00:00Z"));
    expect(checked.facts.every((fact) => fact.verified === false)).toBe(true);
  });

  it("sets snapshotId to {schoolId}-{YYYYMMDD}", async () => {
    const research = sampleResearch() as ProgramResearch;
    const pages = pagesFor(research);
    const checked = await checkFacts(research, pages, new Date("2026-02-03T12:34:56Z"));
    expect(checked.snapshotId).toBe("3-20260203");
  });

  it("fills pageHashes for each fetched URL", async () => {
    const research = sampleResearch() as ProgramResearch;
    const pages = pagesFor(research);
    const checked = await checkFacts(research, pages, new Date("2026-02-03T00:00:00Z"));
    for (const url of pages.keys()) {
      expect(checked.pageHashes[url]).toBe(await pageHash(pages.get(url)!));
    }
  });

  it("sets verifiedAt to the run's timestamp", async () => {
    const research = sampleResearch() as ProgramResearch;
    const pages = pagesFor(research);
    const now = new Date("2026-02-03T12:34:56Z");
    const checked = await checkFacts(research, pages, now);
    expect(checked.verifiedAt).toBe(now.toISOString());
  });

  it("only hashes pages belonging to this school, not other entries in a shared cache", async () => {
    const research = sampleResearch() as ProgramResearch;
    const pages = pagesFor(research);
    // Simulate verifyFacts.ts's run-wide page cache: it may contain pages for
    // other schools that have nothing to do with this research's pages/facts.
    const otherSchoolUrl = "https://unrelated-school.example.edu/program/overview";
    pages.set(otherSchoolUrl, "This page belongs to a completely different school.");

    const checked = await checkFacts(research, pages, new Date("2026-02-03T00:00:00Z"));

    expect(checked.pageHashes[otherSchoolUrl]).toBeUndefined();
    const relevantUrls = new Set([...research.pages.map((p) => p.url), ...research.facts.map((f) => f.sourceUrl)]);
    const expectedUrls = new Set([...pages.keys()].filter((url) => url !== otherSchoolUrl && relevantUrls.has(url)));
    expect(new Set(Object.keys(checked.pageHashes))).toEqual(expectedUrls);
  });
});

describe("carryForwardFacts", () => {
  function freshFact(overrides: Partial<CheckedFact> = {}): CheckedFact {
    return {
      id: "f1",
      kind: "overview",
      name: "Program overview",
      detail: "detail",
      sourceUrl: "https://example.edu/overview",
      quote: "quote text that is long enough to count as a real quote",
      quoteFound: true,
      verified: false,
      fetchedAt: "2026-02-03T00:00:00.000Z",
      quoteCheck: "auto",
      ...overrides,
    };
  }

  it("returns fresh facts unchanged when there is no previous run", () => {
    const fresh = [freshFact()];
    expect(carryForwardFacts(fresh, undefined)).toEqual(fresh);
  });

  it("carries forward verified and quoteCheck for facts matched by id", () => {
    const fresh = [freshFact({ verified: false, quoteCheck: "auto" })];
    const previous = [freshFact({ verified: true, quoteCheck: "manual" })];
    const merged = carryForwardFacts(fresh, previous);
    expect(merged[0].verified).toBe(true);
    expect(merged[0].quoteCheck).toBe("manual");
  });

  it("carries forward fetchedAt when quoteFound is unchanged", () => {
    const fresh = [freshFact({ quoteFound: true, fetchedAt: "2026-03-01T00:00:00.000Z" })];
    const previous = [freshFact({ quoteFound: true, fetchedAt: "2026-01-01T00:00:00.000Z", verified: true })];
    const merged = carryForwardFacts(fresh, previous);
    expect(merged[0].fetchedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("uses the new fetchedAt when quoteFound changed", () => {
    const fresh = [freshFact({ quoteFound: false, fetchedAt: "2026-03-01T00:00:00.000Z" })];
    const previous = [freshFact({ quoteFound: true, fetchedAt: "2026-01-01T00:00:00.000Z", verified: true })];
    const merged = carryForwardFacts(fresh, previous);
    expect(merged[0].fetchedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("leaves a new fact (no matching id in the previous run) at its defaults", () => {
    const fresh = [freshFact({ id: "new-fact", verified: false, quoteCheck: "auto" })];
    const previous = [freshFact({ id: "other-fact", verified: true, quoteCheck: "manual" })];
    const merged = carryForwardFacts(fresh, previous);
    expect(merged[0].verified).toBe(false);
    expect(merged[0].quoteCheck).toBe("auto");
  });
});

describe("stripHtml (used by verifyFacts.ts to build page text for quote matching)", () => {
  it("decodes smart quotes and dash entities so they match normalizeForMatch", () => {
    expect(stripHtml("<p>Students&rsquo; work</p>")).toContain("Students' work");
    expect(stripHtml("<p>&ldquo;Systems&rdquo; track</p>")).toContain('"Systems" track');
    expect(stripHtml("<p>30&ndash;45 units</p>")).toContain("30-45 units");
    expect(stripHtml("<p>Fall term&mdash;Winter term</p>")).toContain("Fall term--Winter term");
  });

  it("decodes numeric entities including &#8217; and &#39; so a plain-apostrophe quote still matches", () => {
    // &#8217; decodes to the actual Unicode right single quote (’); normalizeForMatch
    // (already covered above) is what maps that down to a plain ASCII apostrophe for
    // matching purposes, so we assert the end-to-end quoteFound behavior here.
    expect(quoteFound(stripHtml("<p>Achsah&#8217;s program is well regarded nationally.</p>"), "Achsah's program is well regarded nationally.")).toBe(
      true,
    );
    expect(quoteFound(stripHtml("<p>Achsah&#39;s program is well regarded nationally.</p>"), "Achsah's program is well regarded nationally.")).toBe(
      true,
    );
  });

  it("does not throw on out-of-range numeric entities and leaves them as-is, while valid entities nearby still decode", () => {
    expect(() => stripHtml("<p>a&#99999999;b</p>")).not.toThrow();
    expect(() => stripHtml("<p>a&#x110000;b</p>")).not.toThrow();
    expect(stripHtml("<p>a&#99999999;b</p>")).toContain("&#99999999;");
    expect(stripHtml("<p>a&#x110000;b</p>")).toContain("&#x110000;");
    // Regression: in-range entities elsewhere in the same string still decode normally.
    expect(stripHtml("<p>Achsah&#8217;s a&#99999999;b program</p>")).toContain("Achsah\u2019s a&#99999999;b program");
  });

  it("does not insert a space at an inline-tag boundary (matches real browser rendering, no source whitespace)", () => {
    // `<a>` (like `<span>`, `<strong>`, etc.) is an inline element: with zero
    // whitespace in the source between `</a>` and "Next", a real browser
    // renders this as "catalogNext" with no gap. Inserting an artificial
    // space here is exactly the bug that made span-wrapped punctuation fail
    // to match real quotes (see the "recommendation. No GRE" test below) —
    // so inline tags must not insert a space either, for the same reason.
    expect(stripHtml("<p>Read the <a href='x'>catalog</a>Next section</p>")).toContain("catalogNext");
  });

  it("still inserts a space at a block-tag boundary so adjacent block content doesn't glue together", () => {
    expect(stripHtml("<td>CSC 5590</td><td>Thesis Preparation</td>")).toBe("CSC 5590 Thesis Preparation");
  });

  it("removes a spurious space before punctuation left by an inline tag boundary (Word-doc-export HTML pattern)", () => {
    // A real pattern seen on some university catalog pages: punctuation sits
    // alone in its own span, e.g. `<span>...recommendation</span><span>.</span>
    // <span> No GRE...</span>`. The old behavior inserted a space at every tag
    // boundary, turning this into "...recommendation . No GRE..." which never
    // matches the real quote "...recommendation. No GRE...".
    const html =
      "<span>Students apply via Cal State Apply and must submit a transcript, resume, personal statement, " +
      "and three letters of recommendation</span><span>.</span><span> No GRE scores required.</span>";
    expect(stripHtml(html)).toContain(
      "Students apply via Cal State Apply and must submit a transcript, resume, personal statement, and three letters of recommendation. No GRE scores required.",
    );
  });
});

function sampleChecked(): CheckedResearch {
  const research = sampleResearch() as ProgramResearch;
  const fetchedAt = "2026-02-03T00:00:00.000Z";
  return {
    schoolId: research.schoolId,
    schoolName: research.schoolName,
    programName: research.programName,
    pages: research.pages,
    snapshotId: "3-20260203",
    verifiedAt: fetchedAt,
    pageHashes: {
      [research.facts[0].sourceUrl]: "hash-a",
      [research.facts[3].sourceUrl]: "hash-b",
      [research.facts[4].sourceUrl]: "hash-c",
    },
    facts: research.facts.map((fact, index) => ({
      ...fact,
      quoteFound: index !== 1,
      verified: index !== 1,
      fetchedAt,
    })),
  };
}

describe("reportMarkdown", () => {
  it("lists failed quotes first, then counts per kind", () => {
    const checked = sampleChecked();
    const markdown = reportMarkdown(checked);
    const failedIndex = markdown.indexOf("Failed quotes");
    const countsIndex = markdown.indexOf("Counts by kind");
    expect(failedIndex).toBeGreaterThanOrEqual(0);
    expect(countsIndex).toBeGreaterThan(failedIndex);
    expect(markdown).toContain(checked.facts[1].name);
  });
});

describe("snapshotSql", () => {
  it("emits one INSERT INTO program_snapshots and one INSERT INTO program_facts per verified+found fact", () => {
    const checked = sampleChecked();
    const output = snapshotSql(checked);
    const snapshotInserts = output.match(/INSERT INTO program_snapshots/g) ?? [];
    const factInserts = output.match(/INSERT INTO program_facts/g) ?? [];
    expect(snapshotInserts.length).toBe(1);
    expect(factInserts.length).toBe(checked.facts.filter((f) => f.quoteFound && f.verified).length);
    expect(factInserts.length).toBe(4);
  });

  it("matches Task 3's program_snapshots schema exactly (snapshot_id, school_id, verified_at)", () => {
    const checked = sampleChecked();
    const output = snapshotSql(checked);
    expect(output).toContain(
      `INSERT INTO program_snapshots (snapshot_id, school_id, verified_at) VALUES ('${checked.snapshotId}', '${checked.schoolId}', '${checked.verifiedAt}');`,
    );
    // No columns outside the Task 3 schema (school_name/program_name don't belong here).
    expect(output).not.toContain("school_name");
    expect(output).not.toContain("program_name");
  });

  it("matches Task 3's program_facts schema exactly, including each fact's own fetched_at", () => {
    const checked = sampleChecked();
    checked.facts[0].fetchedAt = "2026-05-01T00:00:00.000Z";
    const output = snapshotSql(checked);
    expect(output).toContain(
      `INSERT INTO program_facts (snapshot_id, fact_id, kind, name, detail, source_url, quote, fetched_at) VALUES ('${checked.snapshotId}', '${checked.facts[0].id}', '${checked.facts[0].kind}', '${checked.facts[0].name}', '${checked.facts[0].detail}', '${checked.facts[0].sourceUrl}', '${checked.facts[0].quote}', '2026-05-01T00:00:00.000Z');`,
    );
  });

  it("uses each fact's own fetchedAt, not a single run-level value, for fetched_at", () => {
    const checked = sampleChecked();
    checked.facts[0].fetchedAt = "2026-01-01T00:00:00.000Z";
    checked.facts[3].fetchedAt = "2026-06-01T00:00:00.000Z";
    const output = snapshotSql(checked);
    expect(output).toContain("'2026-01-01T00:00:00.000Z'");
    expect(output).toContain("'2026-06-01T00:00:00.000Z'");
  });

  it("escapes ' as ''", () => {
    const checked = sampleChecked();
    checked.facts[0].name = "Achsah's program";
    const output = snapshotSql(checked);
    expect(output).toContain("Achsah''s program");
  });

  it("emits nothing for unverified facts, and no program_snapshots row when none are verified", () => {
    const checked = sampleChecked();
    checked.facts = checked.facts.map((fact) => ({ ...fact, verified: false }));
    const output = snapshotSql(checked);
    expect(output).not.toContain("INSERT INTO program_facts");
    expect(output).not.toContain("INSERT INTO program_snapshots");
  });

  it("returns an empty-of-inserts string when zero facts qualify, so an older snapshot isn't shadowed", () => {
    const checked = sampleChecked();
    checked.facts = checked.facts.map((fact) => ({ ...fact, verified: false }));
    const output = snapshotSql(checked);
    expect(output).not.toMatch(/INSERT INTO/);
  });

  it("treats quoteCheck: \"manual\" as found", () => {
    const checked = sampleChecked();
    checked.facts[1] = { ...checked.facts[1], quoteFound: false, verified: true, quoteCheck: "manual" };
    const output = snapshotSql(checked);
    expect(output).toContain(checked.facts[1].id);
  });
});

type SnapshotRow = {
  snapshot_id: string;
  school_id: string;
  verified_at: string;
};

type FactRow = {
  snapshot_id: string;
  fact_id: string;
  kind: string;
  name: string;
  detail: string;
  source_url: string;
  quote: string;
  fetched_at: string;
};

/**
 * In-memory stand-in for D1. Mirrors the pageCache fake-cache style in sop.test.ts:
 * seed rows, then let the real store class issue prepare/bind/first/all against them.
 * ORDER BY / LIMIT / WHERE are honored only when the SQL actually asks for them, so a
 * store that forgets "newest snapshot for this school" fails these tests for real.
 */
class FakeD1 {
  constructor(
    readonly snapshots: SnapshotRow[] = [],
    readonly facts: FactRow[] = [],
  ) {}

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private bound: unknown[] = [];

  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.bound = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.rows()[0] as T) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    return { results: this.rows() as T[], success: true, meta: {} };
  }

  private rows(): Record<string, unknown>[] {
    const sql = this.sql.replace(/\s+/g, " ").toLowerCase();
    if (sql.includes("from program_snapshots")) {
      let rows = [...this.db.snapshots];
      if (/\bwhere\b/.test(sql) && sql.includes("school_id")) {
        rows = rows.filter((row) => row.school_id === String(this.bound[0]));
      }
      const order = sql.match(/order by verified_at (asc|desc)/);
      if (order) {
        const dir = order[1];
        rows.sort((a, b) =>
          dir === "desc" ? b.verified_at.localeCompare(a.verified_at) : a.verified_at.localeCompare(b.verified_at),
        );
      }
      const limit = sql.match(/limit (\d+)/);
      if (limit) rows = rows.slice(0, Number(limit[1]));
      return rows;
    }
    if (sql.includes("from program_facts")) {
      let rows = [...this.db.facts];
      if (/\bwhere\b/.test(sql) && sql.includes("snapshot_id")) {
        rows = rows.filter((row) => row.snapshot_id === String(this.bound[0]));
      }
      return rows;
    }
    throw new Error(`FakeD1 cannot run: ${this.sql}`);
  }
}

const NEW_OVERVIEW: ProgramFact = {
  id: "shared",
  kind: "overview",
  name: "Program overview",
  detail: "The M.S. in Computer Science prepares students for research and professional practice.",
  sourceUrl: "https://catalog.calpoly.edu/cs-ms",
  quote: "The M.S. in Computer Science prepares students for research and professional practice in computing.",
};

const NEW_UNITS: ProgramFact = {
  id: "new-only",
  kind: "requirement",
  name: "45 units",
  detail: "Students complete 45 quarter units of graduate coursework.",
  sourceUrl: "https://catalog.calpoly.edu/cs-ms",
  quote: "Students complete 45 quarter units of graduate coursework in computer science.",
};

const OLD_ONLY: ProgramFact = {
  id: "old-only",
  kind: "requirement",
  name: "Thesis required",
  detail: "Students must complete a thesis.",
  sourceUrl: "https://catalog.calpoly.edu/cs-ms",
  quote: "Students must complete a thesis as part of the M.S. in Computer Science.",
};

function rowFor(snapshotId: string, fact: ProgramFact, fetchedAt: string): FactRow {
  return {
    snapshot_id: snapshotId,
    fact_id: fact.id,
    kind: fact.kind,
    name: fact.name,
    detail: fact.detail,
    source_url: fact.sourceUrl,
    quote: fact.quote,
    fetched_at: fetchedAt,
  };
}

function storeWithTwoSnapshots(): D1FactStore {
  // Older snapshot is inserted first so a missing ORDER BY verified_at DESC returns it.
  // School 6's snapshot is newer than school 3's latest, so a missing WHERE school_id
  // would return the wrong school.
  const db = new FakeD1(
    [
      { snapshot_id: "3-20260101", school_id: "3", verified_at: "2026-01-01T00:00:00.000Z" },
      { snapshot_id: "3-20260203", school_id: "3", verified_at: "2026-02-03T00:00:00.000Z" },
      { snapshot_id: "6-20260301", school_id: "6", verified_at: "2026-03-01T00:00:00.000Z" },
    ],
    [
      rowFor("3-20260101", OLD_ONLY, "2026-01-01T00:00:00.000Z"),
      rowFor(
        "3-20260101",
        { ...NEW_OVERVIEW, detail: "Older overview detail.", quote: "Older overview quote that is long enough." },
        "2026-01-01T00:00:00.000Z",
      ),
      rowFor("3-20260203", NEW_OVERVIEW, "2026-02-03T00:00:00.000Z"),
      rowFor("3-20260203", NEW_UNITS, "2026-02-03T00:00:00.000Z"),
      rowFor(
        "6-20260301",
        {
          id: "school-6",
          kind: "overview",
          name: "Other school",
          detail: "A different program.",
          sourceUrl: "https://cse.ucsd.edu/graduate",
          quote: "A different program at another school that should not leak.",
        },
        "2026-03-01T00:00:00.000Z",
      ),
    ],
  );
  return new D1FactStore(db as unknown as D1Database);
}

describe("D1FactStore", () => {
  it('latest("3") returns only the facts of the newest snapshot for school 3', async () => {
    const snapshot = await storeWithTwoSnapshots().latest("3");
    expect(snapshot).toEqual({
      snapshotId: "3-20260203",
      schoolId: "3",
      verifiedAt: "2026-02-03T00:00:00.000Z",
      facts: [NEW_OVERVIEW, NEW_UNITS],
    });
  });

  it("does not return a fact that exists only in an older snapshot", async () => {
    const snapshot = await storeWithTwoSnapshots().latest("3");
    expect(snapshot?.facts.map((fact) => fact.id)).not.toContain("old-only");
    expect(snapshot?.facts).not.toContainEqual(OLD_ONLY);
  });

  it('latest("99") returns null', async () => {
    expect(await storeWithTwoSnapshots().latest("99")).toBeNull();
  });
});

function matchFact(id: string, kind: ProgramFact["kind"]): ProgramFact {
  return {
    id,
    kind,
    name: id,
    detail: `${id} detail`,
    sourceUrl: `https://example.edu/${id}`,
    quote: `${id} quote from the catalog`,
  };
}

function matchExcerpt(id: string, text: string): Excerpt {
  return { id, text };
}

describe("cosine", () => {
  it("returns 1 for identical non-zero vectors", () => {
    expect(cosine([2, 0, 0], [2, 0, 0])).toBe(1);
    expect(cosine([1, 0], [4, 0])).toBe(1);
  });

  it("returns 0 for orthogonal vectors and for a zero or empty vector", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 0])).toBe(0);
    expect(cosine([], [1, 0])).toBe(0);
  });
});

describe("topPairs", () => {
  it("returns at most k pairs", () => {
    const resume = [
      matchExcerpt("a", "Built a storage service in college"),
      matchExcerpt("b", "Taught an operating systems lab"),
      matchExcerpt("c", "Published a short systems note"),
    ];
    const facts = [matchFact("f0", "faculty"), matchFact("f1", "faculty"), matchFact("f2", "faculty")];
    const pairs = topPairs(
      [
        [1, 0],
        [1, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [1, 0],
        [1, 0],
      ],
      resume,
      facts,
      { k: 2, minScore: 0.5 },
    );
    expect(pairs.map((pair) => pair.pairId)).toEqual(["0:f0", "0:f1"]);
  });

  it("keeps at most six distinct résumé facts, chosen by score", () => {
    const resume = [0, 1, 2, 3, 4, 5, 6].map((index) =>
      matchExcerpt(`r${index}`, `Resume fact number ${index} is here`),
    );
    const pairs = topPairs(
      [
        [3, 4],
        [3, 4],
        [3, 4],
        [3, 4],
        [3, 4],
        [3, 4],
        [1, 0],
      ],
      [[1, 0]],
      resume,
      [matchFact("fac", "faculty")],
      { k: 10, minScore: 0.5 },
    );
    expect(pairs.map((pair) => pair.pairId)).toEqual(["6:fac", "0:fac", "1:fac", "2:fac", "3:fac", "4:fac"]);
  });

  it("pairs one résumé fact with at most two program facts", () => {
    const resume = [matchExcerpt("r", "Built a storage service in college")];
    const facts = [0, 1, 2, 3].map((index) => matchFact(`f${index}`, "faculty"));
    const pairs = topPairs([[1, 0]], facts.map(() => [1, 0]), resume, facts, { k: 10, minScore: 0.5 });
    expect(pairs.map((pair) => pair.pairId)).toEqual(["0:f0", "0:f1"]);
  });

  it("treats the same id and text as one résumé fact and keeps the higher-scoring index", () => {
    const same = "Built a distributed storage service";
    const resume = [
      matchExcerpt("r", same),
      matchExcerpt("r", same),
      matchExcerpt("s", "Taught an operating systems lab"),
    ];
    const facts = [matchFact("fa", "faculty"), matchFact("fb", "faculty")];
    const pairs = topPairs(
      [
        [1, 1],
        [4, 0],
        [0, 4],
      ],
      [
        [1, 0],
        [0, 1],
      ],
      resume,
      facts,
      { k: 10, minScore: 0.5 },
    );
    expect(pairs.map((pair) => pair.pairId)).toEqual(["1:fa", "2:fb", "0:fb"]);
    expect(pairs.filter((pair) => pair.resume.id === "r")).toHaveLength(2);
  });

  it("drops pairs below minScore", () => {
    const resume = [matchExcerpt("r", "Built a storage service in college")];
    const facts = [matchFact("keep", "faculty"), matchFact("drop", "course")];
    const pairs = topPairs([[1, 0]], [[1, 0], [1, 2]], resume, facts, { k: 8, minScore: MATCH_MIN_SCORE });
    expect(pairs.map((pair) => pair.pairId)).toEqual(["0:keep"]);
    expect(pairs[0].score).toBe(1);
  });

  it("uses only faculty and course facts", () => {
    const resume = [matchExcerpt("r", "Built a storage service in college")];
    const facts = [
      matchFact("over", "overview"),
      matchFact("req", "requirement"),
      matchFact("due", "deadline"),
      matchFact("fac", "faculty"),
      matchFact("crs", "course"),
    ];
    const pairs = topPairs(
      [[1, 0]],
      facts.map(() => [1, 0]),
      resume,
      facts,
      { k: 8, minScore: 0.5 },
    );
    expect(pairs.map((pair) => pair.fact.kind)).toEqual(["faculty", "course"]);
  });

  it("breaks equal scores by earlier résumé index, then earlier fact index", () => {
    const resume = [
      matchExcerpt("a", "Built a storage service in college"),
      matchExcerpt("b", "Taught an operating systems lab"),
    ];
    const facts = [matchFact("f0", "faculty"), matchFact("f1", "course")];
    const pairs = topPairs(
      [
        [1, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [1, 0],
      ],
      resume,
      facts,
      { k: 3, minScore: 0.5 },
    );
    expect(pairs.map((pair) => pair.pairId)).toEqual(["0:f0", "0:f1", "1:f0"]);
  });

  it("throws when a vector list length does not match its texts", () => {
    const resume = [matchExcerpt("r", "Built a storage service in college")];
    const facts = [matchFact("fac", "faculty")];
    expect(() => topPairs([], [[1, 0]], resume, facts, { k: 1, minScore: 0 })).toThrow(Error);
    expect(() => topPairs([[1, 0]], [], resume, facts, { k: 1, minScore: 0 })).toThrow(Error);
  });
});

describe("reportOverlap", () => {
  const faculty = matchFact("fac", "faculty");
  const course = matchFact("crs", "course");
  const overview = matchFact("over", "overview");
  const resume = matchExcerpt("r", "Built a storage service in college");

  function pair(fact: ProgramFact, pairId: string): Pair {
    return { pairId, resume, fact, score: 0.9 };
  }

  it("marks fewer than two pairs as weak and lists missing faculty then course", () => {
    const one = reportOverlap([pair(faculty, "0:fac")], [faculty, course, overview]);
    expect(one.weak).toBe(true);
    expect(one.unmatchedKinds).toEqual(["course"]);
    expect(one.pairs).toHaveLength(1);

    const none = reportOverlap([], []);
    expect(none.weak).toBe(true);
    expect(none.unmatchedKinds).toEqual(["faculty", "course"]);

    const both = reportOverlap([pair(faculty, "0:fac"), pair(course, "1:crs")], [overview]);
    expect(both.weak).toBe(false);
    expect(both.unmatchedKinds).toEqual([]);
  });
});

describe("embedTexts", () => {
  it("returns no vectors for empty input without calling the model", async () => {
    let called = false;
    const ai = {
      async run() {
        called = true;
        return { data: [] };
      },
    } as unknown as Env["AI"];
    expect(await embedTexts(ai, [])).toEqual([]);
    expect(called).toBe(false);
  });

  it("calls bge-base in batches of 100 and reads data", async () => {
    const texts = Array.from({ length: 250 }, (_, index) => `sentence ${index} from the resume`);
    const calls: { model: string; size: number }[] = [];
    const ai = {
      async run(model: string, inputs: { text: string[] }) {
        calls.push({ model, size: inputs.text.length });
        return { data: inputs.text.map((_, index) => [calls.length, index]) };
      },
    } as unknown as Env["AI"];
    const vectors = await embedTexts(ai, texts);
    expect(calls.map((call) => call.model)).toEqual([
      "@cf/baai/bge-base-en-v1.5",
      "@cf/baai/bge-base-en-v1.5",
      "@cf/baai/bge-base-en-v1.5",
    ]);
    expect(calls.map((call) => call.size)).toEqual([100, 100, 50]);
    expect(vectors).toHaveLength(250);
    expect(vectors[0]).toEqual([1, 0]);
    expect(vectors[100]).toEqual([2, 0]);
    expect(vectors[249]).toEqual([3, 49]);
  });

  it("throws when a batch returns a different number of vectors", async () => {
    const ai = {
      async run() {
        return { data: [[1, 0]] };
      },
    } as unknown as Env["AI"];
    await expect(embedTexts(ai, ["one two three four", "five six seven eight"])).rejects.toThrow(Error);
  });
});

function judgePair(pairId: string, resumeText: string, factName: string, detail: string): Pair {
  return {
    pairId,
    resume: { id: pairId, text: resumeText },
    fact: {
      id: pairId,
      kind: "course",
      name: factName,
      detail,
      sourceUrl: "https://example.edu/course",
      quote: "A public catalog quote for this course.",
    },
    score: 0.8,
  };
}

const JUDGE_PAIRS = [
  judgePair("p1", "Implemented pipelined processors", "CSC 530", "Pipelining and memory hierarchy"),
  judgePair("p2", "Organized a volunteer fair", "Jane Smith", "Distributed systems research"),
];

describe("parseJudgement", () => {
  it("keeps a yes pair and drops a no pair", () => {
    const text = JSON.stringify([
      { pairId: "p1", verdict: "yes", reason: "Both discuss pipelining" },
      { pairId: "p2", verdict: "no", reason: "Different topics" },
    ]);
    expect(parseJudgement(text, JUDGE_PAIRS)).toEqual([
      { ...JUDGE_PAIRS[0], reason: "Both discuss pipelining" },
    ]);
  });

  it("drops an unknown pairId", () => {
    const text = JSON.stringify([
      { pairId: "missing", verdict: "yes", reason: "Looks related" },
      { pairId: "p1", verdict: "yes", reason: "Shared method" },
    ]);
    expect(parseJudgement(text, JUDGE_PAIRS).map((pair) => pair.pairId)).toEqual(["p1"]);
  });

  it("drops a yes with an empty reason", () => {
    const text = JSON.stringify([
      { pairId: "p1", verdict: "yes", reason: "   " },
      { pairId: "p2", verdict: "yes", reason: "" },
    ]);
    expect(parseJudgement(text, JUDGE_PAIRS)).toEqual([]);
  });

  it("returns an empty list for malformed JSON", () => {
    expect(parseJudgement("not json", JUDGE_PAIRS)).toEqual([]);
    expect(parseJudgement("{", JUDGE_PAIRS)).toEqual([]);
  });

  it("keeps a trimmed yes and the trimmed reason", () => {
    const text = JSON.stringify([{ pairId: "p1", verdict: " Yes ", reason: "  shared pipeline method  " }]);
    expect(parseJudgement(text, JUDGE_PAIRS)).toEqual([
      { ...JUDGE_PAIRS[0], reason: "shared pipeline method" },
    ]);
  });

  it("keeps the first accepted row when a pairId repeats", () => {
    const text = JSON.stringify([
      { pairId: "p1", verdict: "no", reason: "nope" },
      { pairId: "p1", verdict: "yes", reason: "first kept" },
      { pairId: "p1", verdict: "yes", reason: "second" },
    ]);
    expect(parseJudgement(text, JUDGE_PAIRS)).toEqual([{ ...JUDGE_PAIRS[0], reason: "first kept" }]);
  });
});

describe("judgePrompt", () => {
  it("states the concrete topic-or-method rule and lists each pair", () => {
    const prompt = judgePrompt(JUDGE_PAIRS);
    expect(prompt.toLowerCase()).toContain("concrete");
    expect(prompt.toLowerCase()).toContain("topic");
    expect(prompt.toLowerCase()).toContain("method");
    expect(prompt).toContain("p1");
    expect(prompt).toContain("Implemented pipelined processors");
    expect(prompt).toContain("CSC 530");
    expect(prompt).toContain("Pipelining and memory hierarchy");
    expect(prompt).toContain("p2");
    expect(prompt).toContain("Organized a volunteer fair");
    expect(prompt).toContain("Jane Smith");
    expect(prompt).toContain("Distributed systems research");
    expect(prompt.toLowerCase()).not.toContain("outside knowledge");
    expect(prompt.toLowerCase()).not.toContain("school");
  });
});

describe("judgePairs", () => {
  it("keeps only yes and calls llama once", async () => {
    const calls: { model: string; input: { messages: { role: string; content: string }[]; max_tokens: number } }[] = [];
    const ai = {
      async run(model: string, input: { messages: { role: string; content: string }[]; max_tokens: number }) {
        calls.push({ model, input });
        return {
          response: JSON.stringify([
            { pairId: "p1", verdict: "yes", reason: "Both cover pipelining" },
            { pairId: "p2", verdict: "no", reason: "Unrelated" },
          ]),
        };
      },
    } as unknown as Env["AI"];

    const judged = await judgePairs(ai, JUDGE_PAIRS);

    expect(judged).toEqual([{ ...JUDGE_PAIRS[0], reason: "Both cover pipelining" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(calls[0].input.max_tokens).toBe(800);
    expect(calls[0].input.messages[0].role).toBe("system");
    expect(calls[0].input.messages[0].content.toLowerCase()).toContain("concrete");
    expect(calls[0].input.messages[0].content.toLowerCase()).toContain("json");
    expect(calls[0].input.messages[1]).toEqual({ role: "user", content: judgePrompt(JUDGE_PAIRS) });
  });

  it("falls back when the model throws and logs sop_judge_fallback", async () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(message);
    });
    const ai = {
      async run() {
        throw new Error("model down");
      },
    } as unknown as Env["AI"];
    try {
      await expect(judgePairs(ai, JUDGE_PAIRS)).resolves.toEqual(
        JUDGE_PAIRS.map((pair) => ({ ...pair, reason: "" })),
      );
      expect(logs).toContain(JSON.stringify({ event: "sop_judge_fallback" }));
    } finally {
      spy.mockRestore();
    }
  });

  it("returns an empty list for an all-no array without logging fallback", async () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(message);
    });
    const ai = {
      async run() {
        return JSON.stringify([
          { pairId: "p1", verdict: "no", reason: "Different" },
          { pairId: "p2", verdict: "no", reason: "Different" },
        ]);
      },
    } as unknown as Env["AI"];
    try {
      await expect(judgePairs(ai, JUDGE_PAIRS)).resolves.toEqual([]);
      expect(logs.some((line) => String(line).includes("sop_judge_fallback"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("does not call the model for empty input", async () => {
    let called = false;
    const ai = {
      async run() {
        called = true;
        return "[]";
      },
    } as unknown as Env["AI"];
    await expect(judgePairs(ai, [])).resolves.toEqual([]);
    expect(called).toBe(false);
  });

  it("falls back when the model text is empty", async () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(message);
    });
    const ai = {
      async run() {
        return { response: "   " };
      },
    } as unknown as Env["AI"];
    try {
      await expect(judgePairs(ai, JUDGE_PAIRS)).resolves.toEqual(
        JUDGE_PAIRS.map((pair) => ({ ...pair, reason: "" })),
      );
      expect(logs).toContain(JSON.stringify({ event: "sop_judge_fallback" }));
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back when the model text is not a JSON array", async () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(message);
    });
    const ai = {
      async run() {
        return { text: JSON.stringify({ pairId: "p1", verdict: "yes", reason: "Shared method" }) };
      },
    } as unknown as Env["AI"];
    try {
      await expect(judgePairs(ai, JUDGE_PAIRS)).resolves.toEqual(
        JUDGE_PAIRS.map((pair) => ({ ...pair, reason: "" })),
      );
      expect(logs).toContain(JSON.stringify({ event: "sop_judge_fallback" }));
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back when the model text is not valid JSON", async () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(message);
    });
    const ai = {
      async run() {
        return { result: "not json" };
      },
    } as unknown as Env["AI"];
    try {
      await expect(judgePairs(ai, JUDGE_PAIRS)).resolves.toEqual(
        JUDGE_PAIRS.map((pair) => ({ ...pair, reason: "" })),
      );
      expect(logs).toContain(JSON.stringify({ event: "sop_judge_fallback" }));
    } finally {
      spy.mockRestore();
    }
  });
});

describe("precisionRecall", () => {
  it("computes precision and recall for mixed labels at a threshold", () => {
    const pairs = [
      { score: 0.8, related: true },
      { score: 0.6, related: true },
      { score: 0.75, related: false },
      { score: 0.4, related: false },
    ];
    expect(precisionRecall(pairs, 0.7)).toEqual({ precision: 0.5, recall: 0.5 });
  });

  it("returns null when a denominator is zero", () => {
    expect(precisionRecall([{ score: 0.2, related: true }], 0.9)).toEqual({ precision: null, recall: 0 });
    expect(precisionRecall([{ score: 0.1, related: false }], 0.9)).toEqual({ precision: null, recall: null });
  });
});

describe("readTokenUsage", () => {
  it("reads snake_case and camelCase usage, and zeros when usage is missing", () => {
    expect(readTokenUsage({ usage: { prompt_tokens: 11, completion_tokens: 7 } })).toEqual({
      promptTokens: 11,
      completionTokens: 7,
    });
    expect(readTokenUsage({ usage: { promptTokens: 3, completionTokens: 4 } })).toEqual({
      promptTokens: 3,
      completionTokens: 4,
    });
    expect(readTokenUsage({})).toEqual({ promptTokens: 0, completionTokens: 0 });
    expect(readTokenUsage(null)).toEqual({ promptTokens: 0, completionTokens: 0 });
  });
});
