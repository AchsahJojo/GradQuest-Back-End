import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowlisted } from "../src/allowlist";
import { resolveOverlap } from "../src/agent/overlapRead";
import { resolveProgramRead, type AgentSql } from "../src/agent/programRead";
import type { PageRead } from "../src/crawl/readPublicPage";
import * as publicPages from "../src/crawl/readPublicPage";
import type { Snapshot } from "../src/facts/store";
import { deleteStoredResume } from "../src/agent/resumeDelete";
import { secretsMatch } from "../src/auth/secret";
import { excerptsFromMarkdown, excerptsFromText } from "../src/crawl/excerpts";
import { fetchWithRetry } from "../src/crawl/fetchWithRetry";
import { isLoginWall } from "../src/crawl/loginWall";
import type { MarkdownPage } from "../src/crawl/markdown";
import { expiresAtFor, type CachedPage, type PageCache } from "../src/crawl/pageCache";
import { readPublicPage } from "../src/crawl/readPublicPage";
import { isPathAllowed } from "../src/crawl/robots";
import { keptPairsForDraft } from "../src/draft/keptPairs";
import { guardNames, rosterFromSnapshot } from "../src/draft/nameGuard";
import {
  acceptModelDraft,
  cohesiveDraft,
  draftContentProblem,
  draftParagraph,
  draftPrompt,
  draftProblems,
  stripUnfilledProgramCitations,
  weakOverlapParagraph,
  draftShapeProblem,
  draftSystemMessage,
  draftSources,
  draftStats,
  forOutsideApplicants,
  openerProblem,
  pickOpeningFact,
  resumeFacts,
  retryNoteFor,
  splitSentences,
} from "../src/draft/opening";
import type { JudgedPair } from "../src/facts/judge";

const CSUF = "https://www.fullerton.edu/ecs/academics/graduate-admissions.html";
const SLO = "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/";
const UCSD = "https://cse.ucsd.edu/graduate/degree-programs/ms-program";

describe("allowlist", () => {
  it("accepts only the three public program pages", () => {
    expect(isAllowlisted(CSUF)).toBe(true);
    expect(isAllowlisted(`${SLO}`)).toBe(true);
    expect(isAllowlisted(UCSD)).toBe(true);
    expect(isAllowlisted("https://www.calstate.edu/apply")).toBe(false);
    expect(isAllowlisted("https://example.edu/login")).toBe(false);
    expect(isAllowlisted("http://www.fullerton.edu/ecs/academics/graduate-admissions.html")).toBe(false);
    expect(isAllowlisted("https://catalog.fullerton.edu/preview_program.php?catoid=70&poid=32661")).toBe(false);
  });
});

describe("robots", () => {
  it("stops when the path is disallowed", () => {
    const robots = "User-agent: *\nDisallow: /private\n";
    expect(isPathAllowed(robots, "/private/prompt")).toBe(false);
    expect(isPathAllowed(robots, "/engineering/computer-science-ms/")).toBe(true);
  });

  it("lets GradQuestSOP through when only that agent is allowed", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: GradQuestSOP\nAllow: /\n";
    expect(isPathAllowed(robots, "/graduate/degree-programs/ms-program")).toBe(true);
  });
});

describe("login wall", () => {
  it("stops on Cal State Apply and password gates", () => {
    expect(isLoginWall("https://www.calstate.edu/apply/login", 200, "<p>Apply</p>")).toBe(true);
    expect(isLoginWall("https://portal.example.edu/login", 200, "<title>Sign in</title>")).toBe(true);
    expect(
      isLoginWall(
        SLO,
        200,
        "<html><body><h1>Computer Science M.S.</h1><p>The program requires 30 units and a thesis. Students complete coursework in systems, theory, and software.</p></body></html>",
      ),
    ).toBe(false);
  });
});

describe("public page reader", () => {
  it("does not keep text from a login redirect", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n");
      return new Response("<title>Sign in</title><input type='password'>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;
    const page = await readPublicPage(UCSD, { fetchImpl });
    expect(page.pageStatus).toBe("login_wall");
    expect(page.excerpts).toEqual([]);
    expect(page.text).toBe("");
  });

  it("keeps excerpts from an allowlisted public page", async () => {
    const html =
      "<html><body><h1>M.S. Computer Science</h1><p>Students complete 30 semester units including a thesis. The public catalog lists core coursework in systems and theory for this degree.</p></body></html>";
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.endsWith("/robots.txt")) return new Response("");
      return new Response(html, { status: 200 });
    }) as typeof fetch;
    const page = await readPublicPage(SLO, { fetchImpl });
    expect(page.pageStatus).toBe("ok");
    expect(page.source).toBe("fetch");
    expect(page.excerpts[0]?.id).toBe("P1");
    expect(page.text).toContain("30 semester units");
  });
});

const PROGRAM_HTML =
  "<html><body><h1>M.S. Computer Science</h1><p>Students complete 30 semester units including a thesis. The public catalog lists core coursework in systems and theory for this degree.</p></body></html>";
const noSleep = async () => {};

function scripted(page: Array<Response | Error>, robots: Response | Error = new Response("")) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const href = String(input);
    calls.push(href);
    if (href.endsWith("/robots.txt")) {
      if (robots instanceof Error) throw robots;
      return robots.clone();
    }
    const next = page.length > 1 ? page.shift()! : page[0];
    if (next instanceof Error) throw next;
    return next.clone();
  }) as typeof fetch;
  return { fetchImpl, calls, pageCalls: () => calls.filter((c) => !c.endsWith("/robots.txt")).length };
}

function memoryCache(entry?: CachedPage) {
  const store = new Map<string, CachedPage>();
  if (entry) store.set(SLO, entry);
  const cache: PageCache = {
    async get(url) {
      return store.get(url) ?? null;
    },
    async put(url, page) {
      store.set(url, { ...page, expiresAt: expiresAtFor(page.fetchedAt) });
    },
  };
  return { cache, store };
}

const NOW = new Date("2026-11-03T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const cachedEntry = (days: number): CachedPage => ({
  excerpts: Array.from({ length: 12 }, (_, index) => ({
    id: `P${index + 1}`,
    text: "Cached program copy: the M.S. requires 30 units and a thesis.",
  })),
  source: "fetch",
  fetchedAt: daysAgo(days),
  expiresAt: expiresAtFor(daysAgo(days)),
});

describe("fetchWithRetry", () => {
  it("succeeds on the second attempt after a 503", async () => {
    const { fetchImpl, pageCalls } = scripted([new Response("busy", { status: 503 }), new Response(PROGRAM_HTML)]);
    const result = await fetchWithRetry(fetchImpl, SLO, {}, { sleep: noSleep });
    expect(result.response.status).toBe(200);
    expect(result.attempts).toBe(2);
    expect(pageCalls()).toBe(2);
  });

  it("does not retry a 404", async () => {
    const { fetchImpl, pageCalls } = scripted([new Response("gone", { status: 404 })]);
    const result = await fetchWithRetry(fetchImpl, SLO, {}, { sleep: noSleep });
    expect(result.response.status).toBe(404);
    expect(result.attempts).toBe(1);
    expect(pageCalls()).toBe(1);
  });

  it("honors Retry-After up to 3 seconds", async () => {
    const waits: number[] = [];
    const { fetchImpl } = scripted([
      new Response("", { status: 429, headers: { "Retry-After": "2" } }),
      new Response("", { status: 429, headers: { "Retry-After": "60" } }),
      new Response(PROGRAM_HTML),
    ]);
    await fetchWithRetry(fetchImpl, SLO, {}, { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([2000, 3000]);
  });

  it("throws with the attempt count after repeated network errors", async () => {
    const { fetchImpl } = scripted([new TypeError("network down")]);
    await expect(fetchWithRetry(fetchImpl, SLO, {}, { sleep: noSleep })).rejects.toMatchObject({ attempts: 3 });
  });
});

describe("page read flow", () => {
  const markdownPage = (overrides: Partial<MarkdownPage> = {}): MarkdownPage => ({
    markdown:
      "# Computer Science M.S.\n\n- [Home](/)\n- [Catalog Home](/catalog)\n\nThe [program](/cs) requires 30 units and a thesis. Graduate coursework covers systems, theory, and software for this degree.",
    status: 200,
    title: "Computer Science M.S.",
    finalUrl: SLO,
    redirectUrls: [],
    ...overrides,
  });

  it("stops when robots.txt is unreachable and never calls markdown", async () => {
    const { fetchImpl, pageCalls } = scripted([new Response(PROGRAM_HTML)], new Response("", { status: 503 }));
    const markdown = vi.fn(async () => markdownPage());
    const page = await readPublicPage(SLO, { fetchImpl, markdown, sleep: noSleep });
    expect(page.pageStatus).toBe("error");
    expect(page.message).toContain("robots.txt");
    expect(markdown).not.toHaveBeenCalled();
    expect(pageCalls()).toBe(0);
  });

  it("treats a 404 robots.txt as no rules", async () => {
    const { fetchImpl } = scripted([new Response(PROGRAM_HTML)], new Response("", { status: 404 }));
    const page = await readPublicPage(SLO, { fetchImpl, sleep: noSleep });
    expect(page.pageStatus).toBe("ok");
  });

  it("falls back to markdown after fetch network failures", async () => {
    const { fetchImpl } = scripted([new TypeError("network down")]);
    const markdown = vi.fn(async () => markdownPage());
    const page = await readPublicPage(SLO, { fetchImpl, markdown, sleep: noSleep });
    expect(page.pageStatus).toBe("ok");
    expect(page.source).toBe("markdown");
    expect(page.fallbackUsed).toBe(true);
    expect(page.attempts).toBe(3);
    expect(page.text).toContain("30 units");
    expect(page.text).not.toContain("](");
  });

  it("never calls markdown when fetch hits a login wall", async () => {
    const { fetchImpl } = scripted([new Response("<title>Sign in</title><input type='password'>")]);
    const markdown = vi.fn(async () => markdownPage());
    const page = await readPublicPage(SLO, { fetchImpl, markdown, sleep: noSleep });
    expect(page.pageStatus).toBe("login_wall");
    expect(markdown).not.toHaveBeenCalled();
  });

  it("turns a markdown redirect off the program page into login_wall", async () => {
    const { fetchImpl } = scripted([new Response("busy", { status: 503 })]);
    const markdown = vi.fn(async () => markdownPage({ finalUrl: "https://catalog.calpoly.edu/portal/" }));
    const page = await readPublicPage(SLO, { fetchImpl, markdown, sleep: noSleep });
    expect(page.pageStatus).toBe("login_wall");
    expect(page.excerpts).toEqual([]);
  });

  it("does not keep or cache a robot-check page and never calls markdown", async () => {
    const { fetchImpl } = scripted([
      new Response(
        "<html><body>JavaScript is disabled. In order to continue, we need to verify that you're not a robot. This requires JavaScript. Enable JavaScript and then reload the page.</body></html>",
      ),
    ]);
    const markdown = vi.fn(async () => markdownPage());
    const { cache, store } = memoryCache();
    const page = await readPublicPage(SLO, { fetchImpl, markdown, cache, sleep: noSleep });
    expect(page.pageStatus).toBe("error");
    expect(page.message).toContain("robot check");
    expect(page.excerpts).toEqual([]);
    expect(markdown).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it("refetches a fresh cache that only has the old short excerpt list", async () => {
    const { fetchImpl, pageCalls } = scripted([new Response(PROGRAM_HTML)]);
    const short = cachedEntry(1);
    short.excerpts = short.excerpts.slice(0, 6);
    const { cache } = memoryCache(short);
    const page = await readPublicPage(SLO, { fetchImpl, cache, now: () => NOW, sleep: noSleep });
    expect(page.source).toBe("fetch");
    expect(pageCalls()).toBe(1);
  });

  it("serves a fresh cache hit without fetching", async () => {
    const { fetchImpl, calls } = scripted([new Response(PROGRAM_HTML)]);
    const { cache } = memoryCache(cachedEntry(2));
    const page = await readPublicPage(SLO, { fetchImpl, cache, now: () => NOW });
    expect(page.source).toBe("cache");
    expect(page.text).toContain("Cached program copy");
    expect(calls).toEqual([]);
  });

  it("refetches and re-caches an expired entry", async () => {
    const { fetchImpl, pageCalls } = scripted([new Response(PROGRAM_HTML)]);
    const { cache, store } = memoryCache(cachedEntry(8));
    const page = await readPublicPage(SLO, { fetchImpl, cache, now: () => NOW, sleep: noSleep });
    expect(page.source).toBe("fetch");
    expect(pageCalls()).toBe(1);
    expect(store.get(SLO)?.fetchedAt).toBe(NOW.toISOString());
  });

  it("returns a 10-day-old copy when the refresh fails", async () => {
    const { fetchImpl } = scripted([new TypeError("network down")]);
    const markdown = vi.fn(async () => {
      throw new Error("Browser Run markdown failed: HTTP 503");
    });
    const { cache } = memoryCache(cachedEntry(10));
    const page = await readPublicPage(SLO, { fetchImpl, markdown, cache, now: () => NOW, sleep: noSleep });
    expect(page.pageStatus).toBe("ok");
    expect(page.source).toBe("stale");
    expect(page.message).toBe("The program page didn't respond, so this uses the copy read on Oct 24, 2026.");
  });

  it("does not serve a 40-day-old copy", async () => {
    const { fetchImpl } = scripted([new TypeError("network down")]);
    const { cache } = memoryCache(cachedEntry(40));
    const page = await readPublicPage(SLO, { fetchImpl, cache, now: () => NOW, sleep: noSleep });
    expect(page.pageStatus).toBe("error");
    expect(page.message).toBe("The program page didn't respond after several tries. Try again in a few minutes.");
  });
});

describe("read time budget", () => {
  function fakeClock() {
    let t = NOW.getTime();
    return {
      now: () => new Date(t),
      sleep: async (ms: number) => void (t += ms),
      advance: (ms: number) => void (t += ms),
      elapsed: () => t - NOW.getTime(),
    };
  }

  function slowFetch(clock: ReturnType<typeof fakeClock>, robotsFailures: number) {
    let robotsCalls = 0;
    return (async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.endsWith("/robots.txt") && ++robotsCalls > robotsFailures) return new Response("");
      clock.advance(6000);
      throw new Error("The operation timed out");
    }) as typeof fetch;
  }

  const markdownOk = async (): Promise<MarkdownPage> => ({
    markdown: "The program requires 30 units and a thesis. Graduate coursework covers systems and theory.",
    status: 200,
    title: "Computer Science M.S.",
    finalUrl: SLO,
    redirectUrls: [],
  });

  it("skips markdown when slow robots and page retries spend the budget", async () => {
    const clock = fakeClock();
    const markdown = vi.fn(markdownOk);
    const page = await readPublicPage(SLO, {
      fetchImpl: slowFetch(clock, 2),
      markdown,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(markdown).not.toHaveBeenCalled();
    expect(page.pageStatus).toBe("error");
    expect(page.message).toBe("The program page didn't respond after several tries. Try again in a few minutes.");
    expect(clock.elapsed()).toBeLessThanOrEqual(35_000);
  });

  it("serves the stale copy when the budget runs out", async () => {
    const clock = fakeClock();
    const { cache } = memoryCache(cachedEntry(10));
    const page = await readPublicPage(SLO, {
      fetchImpl: slowFetch(clock, 2),
      markdown: vi.fn(markdownOk),
      cache,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(page.source).toBe("stale");
    expect(page.pageStatus).toBe("ok");
  });

  it("stops retrying once the remaining budget is too small", async () => {
    const clock = fakeClock();
    const markdown = vi.fn(markdownOk);
    const page = await readPublicPage(SLO, {
      fetchImpl: slowFetch(clock, 0),
      markdown,
      now: clock.now,
      sleep: clock.sleep,
      budgetMs: 10_000,
    });
    expect(page.attempts).toBe(2);
    expect(markdown).not.toHaveBeenCalled();
    expect(page.message).toContain("didn't respond");
  });

  it("gives markdown only the time that is left", async () => {
    const clock = fakeClock();
    const { fetchImpl } = scripted([new TypeError("network down")]);
    const markdown = vi.fn(markdownOk);
    const page = await readPublicPage(SLO, { fetchImpl, markdown, now: clock.now, sleep: clock.sleep });
    expect(page.source).toBe("markdown");
    expect(markdown).toHaveBeenCalledWith(SLO, 33_000);
  });
});

describe("excerpt boundaries", () => {
  it("starts and ends excerpts on sentence boundaries instead of mid-word", () => {
    const sentences = Array.from(
      { length: 30 },
      (_, i) => `Graduate students in the program complete course ${i + 1} on systems, theory, or software design.`,
    );
    const excerpts = excerptsFromText(sentences.join(" "), "P", 10);
    expect(excerpts.length).toBeGreaterThan(1);
    for (const excerpt of excerpts) {
      expect(excerpt.text).toMatch(/^Graduate /);
      expect(excerpt.text).toMatch(/design\.$/);
      expect(excerpt.text.length).toBeLessThanOrEqual(400);
    }
  });

  it("splits an overlong sentence on word boundaries", () => {
    const words = Array.from({ length: 200 }, (_, i) => `program${i}`).join(" ");
    const excerpts = excerptsFromText(words, "P", 10);
    const all = excerpts.flatMap((excerpt) => excerpt.text.split(" "));
    expect(all.every((word) => /^program\d+$/.test(word))).toBe(true);
  });
});

describe("markdown excerpts", () => {
  it("removes link syntax and nav-only lines", () => {
    const excerpts = excerptsFromMarkdown(
      [
        "---",
        "title: Computer Science M.S.",
        "---",
        "- [Skip to Content](#main)",
        "- [AZ Index](/azindex/)",
        "- [Catalog Home](/)",
        "## Program Requirements",
        "![Seal](/seal.png)",
        "The **M.S. degree** requires 45 units, including [CSC 590 Thesis](/csc590) and graduate coursework in systems and theory.",
      ].join("\n"),
    );
    const text = excerpts.map((item) => item.text).join(" ");
    expect(text).toContain("CSC 590 Thesis");
    expect(text).toContain("Program Requirements");
    expect(text).not.toMatch(/\]\(|##|\*\*/);
    expect(text).not.toContain("AZ Index");
    expect(text).not.toContain("Skip to Content");
    expect(text).not.toContain("title:");
  });
});

describe("draft", () => {
  it("cites the resume and leaves a gap instead of inventing a prompt", () => {
    const draft = draftParagraph({
      mode: "opening",
      schoolName: "Cal Poly San Luis Obispo",
      programName: "Computer Science, M.S.",
      sopRequired: true,
      pageStatus: "login_wall",
      resumeChunks: [{ id: "R1", text: "Built a compiler project in Java." }],
      pageExcerpts: [],
      pairs: [],
      weak: false,
    });
    expect(draft.paragraph).toContain("[R1]");
    expect(draft.paragraph).toContain("[STUDENT: add detail]");
    expect(draft.paragraph).not.toContain("Cal State Apply");
    expect(draft.label).toContain("Draft outline");
    expect(draft.paragraph.includes("\n")).toBe(false);
  });

  it("rejects a model paragraph that invents a portal prompt", () => {
    const input = {
      mode: "opening" as const,
      schoolName: "UC San Diego",
      programName: "Computer Science and Engineering, M.S.",
      sopRequired: true,
      pageStatus: "ok",
      resumeChunks: [{ id: "R1", text: "Taught a data structures lab." }],
      pageExcerpts: [{ id: "P1", text: "The M.S. requires 40 units." }],
      pairs: [],
      weak: false,
    };
    expect(
      acceptModelDraft("Please answer the Cal State Apply essay in 500 words. [R1]", input),
    ).toBeNull();
    expect(acceptModelDraft(NATURAL_DRAFT, input)).toContain("[P1]");
    const long = Array.from({ length: 6 }, () =>
      "I taught a data structures lab that prepared me for graduate study and showed me how much I enjoy explaining hard ideas [R1]. The public page lists 40 units, which gives me room to explore systems and theory in depth [P1].",
    ).join(" ");
    expect(long.length).toBeGreaterThan(1200);
    expect(acceptModelDraft(long, input)).toContain("[R1]");
  });
});

const NATURAL_DRAFT = [
  "Teaching a data structures lab showed me how much I enjoy turning a hard idea into something a classmate can use [R1].",
  "Each week I rewrote my examples until the slowest step made sense to everyone in the room [R1].",
  "That habit of explaining systems clearly is what draws me to graduate study in computer science [STUDENT: add detail].",
  "The UC San Diego M.S. program requires 40 units, which leaves room for both depth and breadth [P1].",
  "I want to spend those units on systems courses that build on what I practiced in the lab [STUDENT: add detail].",
  "I also hope to keep teaching as a tutor or assistant while I study [STUDENT: add detail].",
  "With that background, I am ready to contribute to the program from my first quarter [R1].",
].join(" ");

describe("draft shape", () => {
  const input = {
    mode: "opening" as const,
    schoolName: "UC San Diego",
    programName: "Computer Science and Engineering, M.S.",
    sopRequired: true,
    pageStatus: "ok",
    resumeChunks: [{ id: "R1", text: "Taught a data structures lab." }],
    pageExcerpts: [{ id: "P1", text: "The M.S. requires 40 units." }],
    pairs: [],
    weak: false,
  };

  it("splits sentences without breaking on M.S. and keeps trailing citations", () => {
    const sentences = splitSentences(
      "I am applying to the M.S. program at UCSD. It requires 40 units. [P1] I taught a lab [R1]. Done [STUDENT: add detail].",
    );
    expect(sentences).toEqual([
      "I am applying to the M.S. program at UCSD.",
      "It requires 40 units. [P1]",
      "I taught a lab [R1].",
      "Done [STUDENT: add detail].",
    ]);
  });

  it("accepts natural prose with 6 to 9 normal sentences", () => {
    const stats = draftStats(NATURAL_DRAFT);
    expect(stats.sentences).toBe(7);
    expect(stats.longest).toBeLessThanOrEqual(30);
    expect(draftShapeProblem(stats)).toBeNull();
    expect(acceptModelDraft(NATURAL_DRAFT, input)).not.toBeNull();
  });

  it("rejects a run-on draft whose longest sentence passes 45 words", () => {
    const runOn =
      "I have reviewed the prerequisites, which include 40 units [P1], and I have taught a data structures lab [R1], and I am aware of the program's flexible design and its many areas of study, and I will submit my application with a resume and letters, and I am confident that my skills make me a strong candidate [STUDENT: add detail]. " +
      NATURAL_DRAFT.split(". ").slice(0, 5).join(". ");
    const stats = draftStats(runOn);
    expect(stats.longest).toBeGreaterThan(45);
    expect(draftShapeProblem(stats)).toContain("longest sentence");
    expect(acceptModelDraft(runOn, input)).toBeNull();
  });

  it("rejects a draft with fewer than 5 sentences", () => {
    const short = NATURAL_DRAFT.split(/(?<=\]\.)\s+/).slice(0, 3).join(" ");
    expect(draftStats(short).sentences).toBe(3);
    expect(draftShapeProblem(draftStats(short))).toContain("sentences");
    expect(acceptModelDraft(short, input)).toBeNull();
  });

  it("rejects clichés, recited requirements, internal-only options, and vague openers", () => {
    const swapFirst = (first: string) => [first, ...splitSentences(NATURAL_DRAFT).slice(1)].join(" ");
    const swapThird = (third: string) => {
      const sentences = splitSentences(NATURAL_DRAFT);
      sentences[3] = third;
      return sentences.join(" ");
    };
    const cases: Array<[string, string]> = [
      [swapFirst("Computer science offers endless possibilities, and my lab teaching showed me that [R1]."), "cliché"],
      [swapThird("To be eligible for the M.S., I must have completed 40 units of coursework [P1]."), "obligation"],
      [swapThird("I am aware that the program requires 40 units beyond the bachelor's degree [P1]."), "obligation"],
      [swapThird("The blended BS + MS program would let me move straight into graduate courses [P1]."), "blended"],
      [swapFirst("Computer science has shaped how I think about solving hard problems every day [P1]."), "first sentence"],
    ];
    for (const [draft, expected] of cases) {
      expect(draftContentProblem(draft)).toContain(expected);
      expect(acceptModelDraft(draft, input)).toBeNull();
    }
    expect(draftContentProblem(NATURAL_DRAFT)).toBeNull();
  });

  it("rejects [STUDENT: add detail] used as a blank instead of ending a complete claim", () => {
    const withSentence = (sentence: string) => {
      const sentences = splitSentences(NATURAL_DRAFT);
      sentences[4] = sentence;
      return sentences.join(" ");
    };
    const dangling = [
      "My goal is to work on a project that combines compilers and sensor data pipelines, but [STUDENT: add detail].",
      "The coursework will let me pursue my goals in graduate school, including [STUDENT: add detail].",
      "I want to study topics in systems and data engineering such as [STUDENT: add detail].",
      "My goal of [STUDENT: add detail] fits the systems courses offered in the program [P1].",
      "I am drawn to [STUDENT: add detail].",
    ];
    for (const sentence of dangling) {
      const draft = withSentence(sentence);
      expect(draftContentProblem(draft)).toMatch(/\[STUDENT: add detail\]/);
      expect(acceptModelDraft(draft, input)).toBeNull();
    }
    const complete = withSentence(
      "I want my thesis to focus on security for sensor data pipelines like the ones I built [STUDENT: add detail].",
    );
    expect(draftContentProblem(complete)).toBeNull();
    expect(acceptModelDraft(complete, input)).not.toBeNull();
  });

  it("rejects reputation or ranking claims that no excerpt makes", () => {
    const sentences = splitSentences(NATURAL_DRAFT);
    sentences[3] = "The program's strong reputation in systems research and its 40 units make it an ideal fit for me [P1].";
    const draft = sentences.join(" ");
    expect(draftContentProblem(draft, draftSources(input))).toContain('"reputation"');
    expect(acceptModelDraft(draft, input)).toBeNull();
    const rigorous = NATURAL_DRAFT.replace(
      "which leaves room for both depth and breadth",
      "and its rigorous coursework leaves room for both depth and breadth",
    );
    expect(acceptModelDraft(rigorous, input)).toBeNull();
  });

  it("allows an evaluative word when an excerpt actually uses it", () => {
    const sourced = {
      ...input,
      pageExcerpts: [{ id: "P1", text: "The M.S. requires 40 units of rigorous graduate coursework." }],
    };
    const draft = NATURAL_DRAFT.replace(
      "which leaves room for both depth and breadth",
      "and its rigorous coursework leaves room for both depth and breadth",
    );
    expect(draftContentProblem(draft, draftSources(sourced))).toBeNull();
    expect(acceptModelDraft(draft, sourced)).toContain("rigorous coursework");
  });

  const swapSentence = (index: number, sentence: string) => {
    const sentences = splitSentences(NATURAL_DRAFT);
    sentences[index < 0 ? sentences.length + index : index] = sentence;
    return sentences.join(" ");
  };

  it("rejects vague praise the excerpts never make", () => {
    const praise = [
      "I believe the program is a great fit for my background in teaching and systems work [P1].",
      "The program offers a strong curriculum that matches what I practiced in the lab [P1].",
      "I want to use the research opportunities here to keep building on my lab teaching [P1].",
      "I am confident the program will give me the necessary resources to grow as a teacher [P1].",
      "I hope to make meaningful contributions by teaching systems courses as a graduate student [P1].",
    ];
    for (const sentence of praise) {
      const draft = swapSentence(4, sentence);
      expect(draftContentProblem(draft, draftSources(input))).toContain("which no excerpt says");
      expect(acceptModelDraft(draft, input)).toBeNull();
    }
    const sourced = {
      ...input,
      pageExcerpts: [{ id: "P1", text: "The M.S. requires 40 units and offers research opportunities with faculty." }],
    };
    const draft = swapSentence(4, "I want to use the research opportunities here to keep building on my lab teaching [P1].");
    expect(draftContentProblem(draft, draftSources(sourced))).toBeNull();
  });

  it("rejects generic closings that start with Overall or only judge fit", () => {
    const overall = swapSentence(-1, "Overall, my teaching and systems work prepare me to start graduate study with confidence [R1].");
    expect(draftContentProblem(overall)).toContain('started with "Overall"');
    expect(acceptModelDraft(overall, input)).toBeNull();
    const judgment = swapSentence(-1, "I look forward to contributing to the academic community in San Diego as a graduate student [STUDENT: add detail].");
    expect(draftContentProblem(judgment)).toContain("summary judgment");
    expect(acceptModelDraft(judgment, input)).toBeNull();
    const tied = swapSentence(-1, "I look forward to contributing by bringing my lab teaching into the 40-unit systems coursework [R1] [P1].");
    expect(draftContentProblem(tied)).toBeNull();
  });

  it("rejects requirements, unit counts, or course codes framed as benefits", () => {
    const framed = [
      "The program's requirement for a thesis will push me to finish an original systems project [P1].",
      "The requirement to complete 40 units appeals to me because I like structured coursework [P1].",
      "The 40 units will allow me to explore both theory and systems in real depth [P1].",
      "Courses like CSE 221 Operating Systems align with my goals in systems teaching [P1].",
      "CSE 221 will help me turn my lab examples into deeper systems knowledge [R1] [P1].",
    ];
    for (const sentence of framed) {
      const draft = swapSentence(4, sentence);
      expect(draftContentProblem(draft)).toMatch(/requirement|course code/);
      expect(acceptModelDraft(draft, input)).toBeNull();
    }
  });

  it("keeps a pair citation when the page excerpts are empty", () => {
    const input = {
      ...PAIR_DRAFT_INPUT,
      pageExcerpts: [],
      pairs: [judgedPair("faculty", "Ada Lovelace", "Studies formal methods.", "Taught a data structures lab.")],
      weak: false,
    };
    expect(draftProblems(NATURAL_DRAFT, input)).toEqual([]);
    expect(acceptModelDraft(NATURAL_DRAFT, input)).toContain("[P1]");
    expect(cohesiveDraft(NATURAL_DRAFT, input)).toContain("[P1]");
    const unknownPair = NATURAL_DRAFT.replace("[P1]", "[P9]");
    expect(acceptModelDraft(unknownPair, input)).toBeNull();
    expect(cohesiveDraft(unknownPair, input)).toBeNull();
    const unknownResume = NATURAL_DRAFT.replace("[R1]", "[R9]");
    expect(acceptModelDraft(unknownResume, input)).toBeNull();
    expect(cohesiveDraft(unknownResume, input)).toBeNull();
  });

  it("keeps a cited model paragraph the style check rejected", () => {
    const framed = swapSentence(
      4,
      "The program's requirement for a thesis will push me to finish an original systems project [P1].",
    );
    expect(acceptModelDraft(framed, input)).toBeNull();
    expect(cohesiveDraft(framed, input)).toContain("requirement for a thesis");
    expect(cohesiveDraft("I am applying and I like computers.", input)).toBeNull();
    expect(cohesiveDraft(swapSentence(4, "I want the systems lab because of a paper I never wrote [R9]."), input)).toBeNull();
    expect(
      cohesiveDraft("Please answer the Cal State Apply essay in 500 words about my teaching [R1] [P1]. " + NATURAL_DRAFT, input),
    ).toBeNull();
  });

  it("allows a course code when the student says they want it and why, tied to a resume fact", () => {
    const wants = swapSentence(
      4,
      "I am interested in CSE 221 Operating Systems because it will help me explain scheduling bugs I saw while teaching the lab [R1] [P1].",
    );
    expect(draftContentProblem(wants)).toBeNull();
    const aligns = swapSentence(4, "I want to take CSE 221 because it aligns with my goals from teaching the lab [R1] [P1].");
    expect(draftContentProblem(aligns)).toContain("course code");
  });

  it("lists every problem with its sentence in the retry note and asks for targeted fixes", () => {
    const draft = swapSentence(
      -1,
      "Overall, the program's requirement for a thesis is a great fit for my teaching background [P1].",
    );
    const problems = draftProblems(draft, input);
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.some((p) => p.includes('"great fit"'))).toBe(true);
    expect(problems.some((p) => p.includes("program's requirement"))).toBe(true);
    expect(problems.some((p) => p.includes('"Overall"'))).toBe(true);
    const note = retryNoteFor(draftStats(draft), problems, draft) ?? "";
    expect(note).toContain('(sentence: "Overall, the program\'s requirement');
    expect(note).toContain("Fix only the sentences named above");
    expect(note).toContain(`Previous draft:\n${draft}`);
  });

  it("accepts a specific draft that ties resume facts to courses without praise or requirement framing", () => {
    const specific = [
      "Teaching a data structures lab showed me how much I enjoy turning a hard idea into something a classmate can use [R1].",
      "Each week I rewrote my examples until the slowest step made sense to everyone in the room [R1].",
      "That habit of explaining systems clearly is what draws me to graduate study in computer science [STUDENT: add detail].",
      "I want to take the operating systems courses listed for the M.S. so my lab examples can rest on deeper systems knowledge [R1] [P1].",
      "I want my first-year project to measure how students debug pointer errors in a teaching lab setting [STUDENT: add detail].",
      "I also hope to keep teaching as a tutor or assistant while I study [STUDENT: add detail].",
      "My lab teaching gives me a concrete starting point for the 40 units of systems and theory coursework I plan to take [R1] [P1].",
    ].join(" ");
    expect(draftContentProblem(specific, draftSources(input))).toBeNull();
    expect(acceptModelDraft(specific, input)).not.toBeNull();
  });

  it("moves resume and page citations to the end of their sentence", () => {
    const midCited = NATURAL_DRAFT.replace(
      "The UC San Diego M.S. program requires 40 units, which leaves room for both depth and breadth [P1].",
      "The 40 units [P1] in the UC San Diego M.S. leave room for both depth and breadth.",
    );
    const accepted = acceptModelDraft(midCited, input) ?? "";
    expect(accepted).toContain("The 40 units in the UC San Diego M.S. leave room for both depth and breadth [P1].");
  });

  it("drops blended and BS+MS sentences from page excerpts for outside applicants", () => {
    const filtered = forOutsideApplicants([
      {
        id: "P2",
        text: "The blended BS Computer Science + MS Computer Science program is open to current Cal Poly undergraduates. The MS offers a thesis option with faculty in systems and security.",
      },
      { id: "P3", text: "Blended students may double-count up to 12 units." },
    ]);
    expect(filtered).toEqual([
      { id: "P2", text: "The MS offers a thesis option with faculty in systems and security." },
    ]);
  });

  it("asks for a full statement with the usual length and shape", () => {
    const prompt = draftPrompt({ ...input, mode: "opening" });
    expect(prompt).toContain("about 600 words, never under 400 or over 800");
    expect(prompt).toContain("4 to 6 paragraphs");
    expect(prompt).not.toContain("name a course, track, or requirement");
    expect(prompt).not.toContain("name the courses, tracks, and research areas");
    expect(prompt).toContain("Each sentence is 15 to 35 words");
    expect(prompt).toContain("never restate it the same way twice");
    expect(prompt).toContain("Never write 'I must', 'I am aware that', or 'To be eligible'");
    expect(prompt).toContain("Ignore blended, BS+MS, 4+1");
  });

  it("asks for a varied opener, no stock flexibility sentence, end-only markers, and sourced claims", () => {
    const prompt = draftPrompt({ ...input, mode: "opening" });
    expect(prompt).toContain("resume fact that best matches a course or research area");
    expect(prompt).toContain("Do not automatically open with the first resume line");
    expect(prompt).toContain("'flexibility to concentrate in one or more areas' unless that is the single best fit");
    expect(prompt).toContain("[STUDENT: add detail] always finishes a complete sentence");
    expect(prompt).toContain("never put it after 'but', 'including', 'such as'");
    expect(prompt).toContain("must come from a [P#] excerpt that actually says it");
    expect(prompt).toContain("reputable, ranked, prestigious, world-class, rigorous, or renowned");
  });

  const THREE_FACT_RESUME = [
    {
      id: "R1",
      text: "Built a compiler for a subset of Java in a senior project course. Worked as a teaching assistant for data structures for two semesters. Interned at a robotics startup writing Python tooling for sensor data pipelines.",
    },
  ];

  it("rotates the required opening fact across every resume fact", () => {
    const picks = [0, 1, 2, 3].map((turn) => pickOpeningFact(THREE_FACT_RESUME, turn)?.text);
    expect(picks).toEqual([
      "Built a compiler for a subset of Java in a senior project course.",
      "Worked as a teaching assistant for data structures for two semesters.",
      "Interned at a robotics startup writing Python tooling for sensor data pipelines.",
      "Built a compiler for a subset of Java in a senior project course.",
    ]);
    expect(new Set(picks).size).toBe(3);
  });

  it("always uses the only fact of a one-fact resume", () => {
    const single = [{ id: "R1", text: "Taught a data structures lab for two semesters." }];
    for (const turn of [0, 1, 2, 7]) {
      expect(pickOpeningFact(single, turn)).toEqual({ id: "R1", text: "Taught a data structures lab for two semesters." });
    }
    expect(pickOpeningFact([], 0)).toBeUndefined();
  });

  it("rejects a draft that opens on a different fact than the required one", () => {
    const facts = resumeFacts(THREE_FACT_RESUME);
    const teaching = { ...input, resumeChunks: THREE_FACT_RESUME, openingFact: facts[1] };
    expect(openerProblem(NATURAL_DRAFT, teaching.openingFact)).toBeNull();
    expect(acceptModelDraft(NATURAL_DRAFT, teaching)).not.toBeNull();
    const compiler = { ...teaching, openingFact: facts[0] };
    expect(openerProblem(NATURAL_DRAFT, compiler.openingFact)).toContain("required fact");
    expect(acceptModelDraft(NATURAL_DRAFT, compiler)).toBeNull();
  });

  it("names the required opening fact in the prompt", () => {
    const facts = resumeFacts(THREE_FACT_RESUME);
    const prompt = draftPrompt({ ...input, resumeChunks: THREE_FACT_RESUME, openingFact: facts[2] });
    expect(prompt).toContain(
      "Open with this fact and no other: Interned at a robotics startup writing Python tooling for sensor data pipelines. [R1]",
    );
    expect(prompt).toContain("Open the first paragraph with the required opening fact given below");
  });

  it("uses an unrelated-field example sentence instead of the old sensor-pipeline one", () => {
    const prompt = draftPrompt({ ...input, mode: "opening" });
    expect(prompt).not.toContain("I want my thesis to focus on security for sensor data pipelines");
    expect(prompt).toContain("archival letters from cannery workers");
  });

  it("drops the stock flexibility sentence from page excerpts and keeps its neighbor", () => {
    const filtered = forOutsideApplicants([
      {
        id: "P3",
        text: "The program is designed for maximum flexibility to allow students to concentrate in one or more areas of study. Students complete a thesis supervised by a faculty advisor in their research area.",
      },
      { id: "P4", text: "Students may concentrate in one or more areas, such as security or graphics." },
    ]);
    expect(filtered).toEqual([
      { id: "P3", text: "Students complete a thesis supervised by a faculty advisor in their research area." },
    ]);
  });

  it("asks a short but valid draft for the missing sentences by word count", () => {
    const note = retryNoteFor({ words: 119, sentences: 7, longest: 26 }, null, NATURAL_DRAFT) ?? "";
    expect(note).toContain("only 119 words in 7 sentences");
    expect(note).toContain("at least 400 words");
    expect(note).toContain("kept pairs");
    expect(note).not.toContain("name courses, tracks, or requirements");
    expect(note).not.toContain("page excerpts");
    expect(note).toContain(`Previous draft:\n${NATURAL_DRAFT}`);
  });

  it("reports the rejection reason on retry and skips a retry for drafts on target", () => {
    expect(retryNoteFor({ words: 97, sentences: 8, longest: 16 }, "it had 97 words; stay between 150 and 250", "x")).toContain(
      "rejected because it had 97 words",
    );
    expect(retryNoteFor({ words: 520, sentences: 24, longest: 28 }, null, "x")).toBeNull();
  });
});

const STORED_OVERLAP = {
  pairs: [
    {
      pairId: "fac",
      resumeText: "I studied formal methods.",
      factKind: "faculty",
      factName: "Ada Lovelace",
      factDetail: "Studies formal methods.",
      sourceUrl: "https://catalog.calpoly.edu/faculty/ada",
      reason: "Both discuss formal methods.",
    },
    {
      pairId: "crs",
      resumeText: "Built a compiler.",
      factKind: "course",
      factName: "Compilers",
      factDetail: "A graduate compilers course.",
      sourceUrl: "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/",
      reason: "Both discuss compilers.",
    },
    {
      pairId: "extra",
      resumeText: "Taught systems.",
      factKind: "faculty",
      factName: "Jane Smith",
      factDetail: "Studies operating systems.",
      sourceUrl: "https://example.edu/jane",
      reason: "Both discuss systems.",
    },
  ],
  weak: false,
  unmatchedKinds: [],
  verifiedAsOf: "2026-03-01T00:00:00Z",
};

function judgedPair(
  kind: "faculty" | "course",
  name: string,
  detail: string,
  resumeText = "Taught a data structures lab.",
): JudgedPair {
  return {
    pairId: name,
    resume: { id: "R1", text: resumeText },
    fact: {
      id: name,
      kind,
      name,
      detail,
      sourceUrl: "https://example.edu/fact",
      quote: "",
    },
    score: 0,
    reason: "shared topic",
  };
}

const PAIR_DRAFT_INPUT = {
  mode: "opening" as const,
  schoolName: "UC San Diego",
  programName: "Computer Science and Engineering, M.S.",
  sopRequired: true,
  pageStatus: "ok",
  resumeChunks: [{ id: "R1", text: "Taught a data structures lab." }],
  pageExcerpts: [{ id: "P1", text: "The M.S. requires 40 units." }],
};

describe("kept pairs and name guard", () => {
  it("keeps a catalog course when the detected code sits inside the course name", () => {
    const guarded = guardNames("I want to take CSC 530 next year.", {
      faculty: [],
      courses: ["CSC 530 - Computer Architecture"],
    });
    expect(guarded.text).toContain("CSC 530");
    expect(guarded.removed).toEqual([]);
  });

  it("keeps a confirmed professor when the sentence uses a possessive", () => {
    const guarded = guardNames(
      "Professor Ada Lovelace's research is the reason I applied.",
      { faculty: ["Ada Lovelace"], courses: [] },
      { faculty: ["Ada Lovelace"], courses: [] },
    );
    expect(guarded.text).toContain("Professor Ada Lovelace's research");
    expect(guarded.removed).toEqual([]);
  });

  it("keeps an allowed professor and course", () => {
    const guarded = guardNames(
      "I want to study with Dr. Ada Lovelace and take CSC530.",
      { faculty: ["Professor Ada Lovelace"], courses: ["CSC 530"] },
      { faculty: ["Ada Lovelace"], courses: ["CSC 530 - Computer Architecture"] },
    );
    expect(guarded.text).toContain("Dr. Ada Lovelace");
    expect(guarded.text).toContain("CSC530");
    expect(guarded.removed).toEqual([]);
  });

  it("replaces Professor Jane Smith when she is verified and not kept", () => {
    const guarded = guardNames(
      "I hope to work with Professor Jane Smith on systems.",
      { faculty: ["Ada Lovelace"], courses: [] },
      { faculty: ["Jane Smith", "Ada Lovelace"], courses: [] },
    );
    expect(guarded.text).not.toContain("Jane Smith");
    expect(guarded.text).toContain("[STUDENT: add detail]");
    expect(guarded.removed).toContain("Professor Jane Smith");
  });

  it("removes a verified faculty name in a sentence about research", () => {
    const guarded = guardNames(
      "The research group includes Jane Smith this year.",
      { faculty: ["Ada Lovelace"], courses: [] },
      { faculty: ["Jane Smith"], courses: [] },
    );
    expect(guarded.text).not.toContain("Jane Smith");
    expect(guarded.removed).toContain("Jane Smith");
  });

  it("replaces CSC 999 when that course is not allowed", () => {
    const guarded = guardNames("I want to take CSC 999 next year.", {
      faculty: [],
      courses: ["CSC 530"],
    });
    expect(guarded.text).not.toContain("CSC 999");
    expect(guarded.text).toContain("[STUDENT: add detail]");
    expect(guarded.removed).toContain("CSC 999");
  });

  it("leaves résumé employer names alone", () => {
    const guarded = guardNames("I interned at Northrop Grumman. The research group meets on Tuesday.", {
      faculty: [],
      courses: [],
    });
    expect(guarded.text).toContain("Northrop Grumman");
    expect(guarded.removed).toEqual([]);
  });

  it("keeps course titles and the program name when the sentence mentions a lab or research", () => {
    const draft = [
      "I want to take CSC 5887 - Advanced Deep Learning because I classified lab images.",
      "I want to take CSE 252A - Computer Vision I because I classified lab images.",
      "I also want to take CSE 251A - AI: Learning Algorithms because I classified lab images.",
      "The Computer Science program will let me explore my research interests.",
    ].join(" ");
    const guarded = guardNames(draft, {
      faculty: ["Daniel Frishberg"],
      courses: [
        "CSC 5887 - Advanced Deep Learning",
        "CSE 252A - Computer Vision I",
        "CSE 251A - AI: Learning Algorithms",
      ],
    });
    expect(guarded.removed).toEqual([]);
    expect(guarded.text).toContain("CSC 5887 - Advanced Deep Learning");
    expect(guarded.text).toContain("CSE 252A - Computer Vision I");
    expect(guarded.text).toContain("CSE 251A - AI: Learning Algorithms");
    expect(guarded.text).toContain("The Computer Science program");
  });

  it("leaves a professor who is not a verified faculty name", () => {
    const guarded = guardNames("I hope to work with Professor Jane Smith on systems.", {
      faculty: ["Ada Lovelace"],
      courses: [],
    });
    expect(guarded.text).toContain("Professor Jane Smith");
    expect(guarded.removed).toEqual([]);
  });

  it("removes a verified faculty name that was not kept, including inside a course title only once outside it", () => {
    const guarded = guardNames(
      "I want to take CSE 291 - Jane Smith Seminar. I also hope to work with Professor Jane Smith.",
      { faculty: [], courses: [] },
      { faculty: ["Jane Smith"], courses: ["CSE 291 - Jane Smith Seminar"] },
    );
    expect(guarded.text).toContain("CSE 291 - Jane Smith Seminar");
    expect(guarded.text).not.toContain("Professor Jane Smith");
    expect(guarded.removed).toEqual(["Professor Jane Smith"]);
  });

  it("reads verified faculty and course names from a snapshot", () => {
    expect(
      rosterFromSnapshot(
        JSON.stringify({
          facts: [
            { kind: "faculty", name: "Mihir Bellare" },
            { kind: "course", name: "CSE 252A - Computer Vision I" },
            { kind: "overview", name: "Program overview" },
          ],
        }),
      ),
    ).toEqual({
      faculty: ["Mihir Bellare"],
      courses: ["CSE 252A - Computer Vision I"],
    });
    expect(rosterFromSnapshot(undefined)).toEqual({ faculty: [], courses: [] });
    expect(rosterFromSnapshot("{")).toEqual({ faculty: [], courses: [] });
  });

  it("labels each kept pair and omits unpaired faculty and courses", () => {
    const prompt = draftPrompt({
      ...PAIR_DRAFT_INPUT,
      pairs: [
        judgedPair("faculty", "Ada Lovelace", "Studies formal methods.", "I studied formal methods."),
        judgedPair("course", "Compilers", "A graduate compilers course.", "Built a compiler."),
      ],
      weak: false,
      roster: {
        faculty: ["Jane Smith"],
        courses: ["CSC 5887 - Advanced Deep Learning"],
      },
      pageExcerpts: [
        {
          id: "P9",
          text: "Professor Jane Smith teaches CSC 999. The catalog lists CSC 5887 - Advanced Deep Learning.",
        },
      ],
    });
    expect(prompt).toContain("[P1] Ada Lovelace");
    expect(prompt).toContain("Studies formal methods.");
    expect(prompt).toContain("I studied formal methods.");
    expect(prompt).toContain("[P2] Compilers");
    expect(prompt).toContain("A graduate compilers course.");
    expect(prompt).toContain("Built a compiler.");
    expect(prompt).not.toContain("Jane Smith");
    expect(prompt).not.toContain("CSC 999");
    expect(prompt).toContain("CSC 5887 - Advanced Deep Learning");
    expect(prompt).not.toContain("name a course, track, or requirement");
    expect(prompt).not.toContain("name the courses, tracks, and research areas");
    expect(prompt).toContain("UC San Diego");
    expect(prompt).toContain("Computer Science and Engineering, M.S.");
  });

  it("returns a short little-overlap message and does not cite program facts when weak", () => {
    const text = weakOverlapParagraph({
      schoolName: "California State University, Fullerton",
      programName: "Computer Science, M.S.",
    });
    expect(text).toContain("little connection");
    expect(text).toContain("Computer Science, M.S.");
    expect(text).toContain("[STUDENT: add detail]");
    expect(text).not.toMatch(/\[P#\]/);
    expect(text).not.toMatch(/\[P\d+\]/);
    expect(text.split(/\s+/).length).toBeLessThan(80);
    const guarded = guardNames(
      text,
      { faculty: [], courses: [] },
      {
        faculty: ["Mihir Bellare", "Daniel Frishberg"],
        courses: ["CSC 5887 - Advanced Deep Learning", "CSE 252A - Computer Vision I"],
      },
    );
    expect(guarded.removed).toEqual([]);
    expect(stripUnfilledProgramCitations(guarded.text)).toBe(text);
  });

  it("strips a literal [P#] and keeps numbered citations", () => {
    const text = stripUnfilledProgramCitations(
      "The program aligns with my goals [P#]. I want to take the course [P1] [R2].",
    );
    expect(text).toBe("The program aligns with my goals. I want to take the course [P1] [R2].");
  });

  it("forbids naming faculty or courses and asks for a program-fit paragraph when weak", () => {
    const prompt = draftPrompt({
      ...PAIR_DRAFT_INPUT,
      pairs: [],
      weak: true,
      pageExcerpts: [{ id: "P1", text: "Professor Jane Smith teaches CSC 999." }],
    });
    expect(prompt).toContain("Do not name faculty or courses. Write a [STUDENT: add detail] program-fit paragraph.");
    expect(prompt).toContain("UC San Diego");
    expect(prompt).toContain("Computer Science and Engineering, M.S.");
    expect(prompt).not.toContain("Public page excerpts");
    expect(prompt).not.toContain("Professor Jane Smith teaches CSC 999.");
    expect(prompt).not.toContain("page excerpts");
    expect(prompt).not.toContain("name a course, track, or requirement");
    expect(prompt).not.toContain("name the courses, tracks, and research areas");
    expect(prompt).not.toContain(
      "A named course, thesis option, or research area is almost always a better program fact than general flexibility.",
    );
    expect(prompt).not.toContain("Jane Smith");
    expect(prompt).not.toContain("CSC 999");
  });

  it("does not tell a weak draft to name courses in the system message or the short-draft retry", () => {
    const system = draftSystemMessage(true);
    expect(system).toContain("Do not name faculty or courses. Write a [STUDENT: add detail] program-fit paragraph.");
    expect(system).not.toContain("page excerpts");
    expect(system).not.toContain("name courses");
    expect(system).not.toContain("requirements");
    const note = retryNoteFor({ words: 119, sentences: 7, longest: 26 }, null, "Too short.", true) ?? "";
    expect(note).toContain("Do not name faculty or courses. Write a [STUDENT: add detail] program-fit paragraph.");
    expect(note).not.toContain("page excerpts");
    expect(note).not.toContain("name courses");
    expect(note).not.toContain("requirements");
  });

  it("rebuilds only the kept pairs in pairIds order when at least two remain", () => {
    const selected = keptPairsForDraft(JSON.stringify(STORED_OVERLAP), ["crs", "fac"]);
    expect(selected.weak).toBe(false);
    expect(selected.pairs.map((pair) => pair.pairId)).toEqual(["crs", "fac"]);
    expect(selected.pairs[0]).toMatchObject({
      score: 0,
      reason: "Both discuss compilers.",
      resume: { text: "Built a compiler." },
      fact: {
        kind: "course",
        name: "Compilers",
        detail: "A graduate compilers course.",
        sourceUrl: "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/",
        quote: "",
      },
    });
    expect(selected.pairs[1].fact).toMatchObject({
      kind: "faculty",
      name: "Ada Lovelace",
      quote: "",
    });
    expect(selected.pairs[1].score).toBe(0);
  });

  it("is weak when the overlap row is missing, pairIds are omitted, or fewer than two pairs remain", () => {
    const weak = { pairs: [], weak: true };
    expect(keptPairsForDraft(null, ["fac", "crs"])).toEqual(weak);
    expect(keptPairsForDraft(undefined, ["fac", "crs"])).toEqual(weak);
    expect(keptPairsForDraft(JSON.stringify(STORED_OVERLAP), undefined)).toEqual(weak);
    expect(keptPairsForDraft(JSON.stringify(STORED_OVERLAP), ["fac"])).toEqual(weak);
    expect(keptPairsForDraft(JSON.stringify(STORED_OVERLAP), ["missing", "fac"])).toEqual(weak);
    expect(keptPairsForDraft("{", ["fac", "crs"])).toEqual(weak);
  });
});

const ZERO_FACT_COUNTS = {
  overview: 0,
  requirement: 0,
  course: 0,
  faculty: 0,
  deadline: 0,
};

const LIVE_PAGE: PageRead = {
  pageStatus: "ok",
  message: "Read the public program page.",
  excerpts: [],
  text: "Public program text.",
  source: "fetch",
  attempts: 1,
  fallbackUsed: false,
};

const COURSE: Snapshot["facts"][number] = {
  id: "course-compilers",
  kind: "course",
  name: "Compilers",
  detail: "A graduate compilers course.",
  sourceUrl: "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/",
  quote: "Students may take a compilers course.",
};

function sampleSnapshot(facts: Snapshot["facts"] = [COURSE]): Snapshot {
  return {
    snapshotId: "snap-6",
    schoolId: "6",
    verifiedAt: "2026-03-01T00:00:00Z",
    facts,
  };
}

class MemoryFactsD1 {
  constructor(private readonly snapshot: Snapshot | null) {}

  prepare(sql: string) {
    const snapshot = this.snapshot;
    let bound: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        bound = values;
        return statement;
      },
      async first() {
        if (!snapshot || !sql.includes("program_snapshots")) return null;
        if (String(bound[0]) !== snapshot.schoolId) return null;
        return {
          snapshot_id: snapshot.snapshotId,
          school_id: snapshot.schoolId,
          verified_at: snapshot.verifiedAt,
        };
      },
      async all() {
        return {
          results: (snapshot?.facts ?? []).map((fact) => ({
            fact_id: fact.id,
            kind: fact.kind,
            name: fact.name,
            detail: fact.detail,
            source_url: fact.sourceUrl,
            quote: fact.quote,
          })),
        };
      },
    };
    return statement;
  }
}

class ThrowingFactsD1 {
  prepare() {
    const statement = {
      bind() {
        return statement;
      },
      async first() {
        throw new Error("d1 down");
      },
      async all() {
        throw new Error("d1 down");
      },
    };
    return statement;
  }
}

function recordingSql() {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]) => {
    calls.push({
      text: strings.reduce((query, part, index) => query + part + (index < values.length ? "?" : ""), ""),
      values,
    });
    return [];
  };
  return { calls, sql };
}

describe("program snapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a snapshot without fetching the public page", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const { calls, sql } = recordingSql();
    const states: string[] = [];
    const snapshot = sampleSnapshot([
      COURSE,
      { ...COURSE, id: "course-systems", name: "Systems" },
      { ...COURSE, id: "overview-degree", kind: "overview", name: "Degree" },
    ]);

    const outcome = await resolveProgramRead({
      body: { schoolId: 6, url: "https://example.edu/not-on-the-allowlist" },
      db: new MemoryFactsD1(snapshot) as unknown as D1Database,
      sql,
      setPageStatus: (status) => states.push(status),
    });

    expect(outcome.response).toMatchObject({
      pageStatus: "ok",
      source: "snapshot",
      verifiedAsOf: "2026-03-01T00:00:00Z",
      factCounts: {
        overview: 1,
        requirement: 0,
        course: 2,
        faculty: 0,
        deadline: 0,
      },
    });
    expect(read).not.toHaveBeenCalled();
    expect(states).toEqual(["ok"]);
    expect(calls.some((call) => call.text.includes("page_reads"))).toBe(false);
  });

  it("stores the snapshot object so it parses back to the same snapshot", async () => {
    vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const { calls, sql } = recordingSql();
    const snapshot = sampleSnapshot();

    await resolveProgramRead({
      body: { schoolId: "6", url: SLO },
      db: new MemoryFactsD1(snapshot) as unknown as D1Database,
      sql,
      setPageStatus: () => {},
    });

    const stored = calls.find((call) => call.text.includes("snapshot_reads"));
    expect(stored?.text).toContain("INSERT OR REPLACE");
    expect(stored?.values).toContain("6");
    const json = stored?.values.find((value) => typeof value === "string" && value.startsWith("{"));
    expect(JSON.parse(String(json))).toEqual(snapshot);
  });

  it("treats a snapshot with zero facts as the snapshot path", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const snapshot = sampleSnapshot([]);

    const outcome = await resolveProgramRead({
      body: { schoolId: "6", url: "https://example.edu/not-on-the-allowlist" },
      db: new MemoryFactsD1(snapshot) as unknown as D1Database,
      sql: recordingSql().sql,
      setPageStatus: () => {},
    });

    expect(outcome.response.source).toBe("snapshot");
    expect(outcome.response.pageStatus).toBe("ok");
    expect(outcome.response.verifiedAsOf).toBe("2026-03-01T00:00:00Z");
    expect(outcome.response.factCounts).toEqual(ZERO_FACT_COUNTS);
    expect(read).not.toHaveBeenCalled();
  });

  it("reads the public page when no snapshot is stored", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const { calls, sql } = recordingSql();

    const outcome = await resolveProgramRead({
      body: { schoolId: "6", url: SLO },
      db: undefined,
      sql,
      setPageStatus: () => {},
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0]).toBe(SLO);
    expect(outcome.response).toMatchObject({
      pageStatus: "ok",
      message: "Read the public program page.",
      source: "live",
      verifiedAsOf: null,
      factCounts: ZERO_FACT_COUNTS,
    });
    expect(calls.some((call) => call.text.includes("page_reads"))).toBe(true);
    expect(calls.some((call) => call.text.includes("snapshot_reads"))).toBe(false);
  });

  it("keeps the not-allowlisted live response when D1 has no snapshot", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const { calls, sql } = recordingSql();

    const outcome = await resolveProgramRead({
      body: { schoolId: "6", url: "https://example.edu/login" },
      db: new MemoryFactsD1(null) as unknown as D1Database,
      sql,
      setPageStatus: () => {},
    });

    expect(read).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(outcome.response).toMatchObject({
      pageStatus: "not_allowlisted",
      message: "That URL is not an allowlisted public program page.",
      excerpts: [],
      source: "live",
      verifiedAsOf: null,
      factCounts: ZERO_FACT_COUNTS,
    });
  });

  it("lets a D1 failure propagate instead of falling through to the live page", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);

    await expect(
      resolveProgramRead({
        body: { schoolId: "6", url: SLO },
        db: new ThrowingFactsD1() as unknown as D1Database,
        sql: recordingSql().sql,
        setPageStatus: () => {},
      }),
    ).rejects.toThrow("d1 down");
    expect(read).not.toHaveBeenCalled();
  });
});

const FACULTY: Snapshot["facts"][number] = {
  id: "faculty-ada",
  kind: "faculty",
  name: "Ada Lovelace",
  detail: "Studies formal methods.",
  sourceUrl: "https://catalog.calpoly.edu/faculty/ada",
  quote: "UNIQUE_QUOTE_SHOULD_NOT_EMBED",
};

function overlapRecordingSql(options: {
  snapshotJson?: string | null;
  resumes?: { id: string; text: string }[];
}) {
  const calls: { text: string; values: unknown[] }[] = [];
  const resumes = options.resumes ?? [];
  const sql = (strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]) => {
    const text = strings.reduce((query, part, index) => query + part + (index < values.length ? "?" : ""), "");
    calls.push({ text, values: [...values] });
    if (text.includes("SELECT") && text.includes("snapshot_reads")) {
      return options.snapshotJson ? [{ snapshot_json: options.snapshotJson }] : [];
    }
    if (text.includes("SELECT") && text.includes("resume_chunks")) {
      return resumes;
    }
    return [];
  };
  return { calls, sql: sql as AgentSql };
}

function orthogonalEmbedAi() {
  const runs: { model: string; input: unknown }[] = [];
  const axes = new Map<string, number>();
  const ai = {
    async run(model: string, input: { text?: string[] }) {
      runs.push({ model, input });
      if (model !== "@cf/baai/bge-base-en-v1.5") {
        throw new Error(`judge should not run (${model})`);
      }
      const texts = input.text ?? [];
      return {
        data: texts.map((text) => {
          if (!axes.has(text)) axes.set(text, axes.size);
          const vector = new Array(16).fill(0);
          vector[axes.get(text) as number] = 1;
          return vector;
        }),
      };
    },
  };
  return { runs, ai };
}

describe("overlap report", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a weak report and no pairs for a mismatched résumé", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const snapshot = sampleSnapshot([
      FACULTY,
      COURSE,
      { ...COURSE, id: "overview-degree", kind: "overview", name: "Degree", detail: "Thirty units." },
    ]);
    const { calls, sql } = overlapRecordingSql({
      snapshotJson: JSON.stringify(snapshot),
      resumes: [{ id: "R1", text: "I studied distributed systems in a lab." }],
    });
    const { runs, ai } = orthogonalEmbedAi();

    const result = await resolveOverlap({
      schoolId: "6",
      sql,
      db: new ThrowingFactsD1() as unknown as D1Database,
      ai: ai as unknown as Env["AI"],
    });

    expect(result).toEqual({
      status: 200,
      body: {
        pairs: [],
        weak: true,
        unmatchedKinds: ["faculty", "course"],
        verifiedAsOf: "2026-03-01T00:00:00Z",
      },
    });
    expect(read).not.toHaveBeenCalled();
    expect(runs.map((run) => run.model)).toEqual([
      "@cf/baai/bge-base-en-v1.5",
      "@cf/baai/bge-base-en-v1.5",
    ]);
    const embedded = runs.flatMap((run) => {
      const input = run.input as { text?: string[] };
      return input.text ?? [];
    });
    expect(embedded).toEqual([
      "I studied distributed systems in a lab.",
      "Ada Lovelace. Studies formal methods.",
      "Compilers. A graduate compilers course.",
    ]);
    const stored = calls.find((call) => call.text.includes("overlap_reads") && call.text.includes("INSERT"));
    expect(stored?.text).toContain("INSERT OR REPLACE");
    expect(stored?.values).toContain("6");
    const json = stored?.values.find((value) => typeof value === "string" && value.startsWith("{"));
    expect(JSON.parse(String(json))).toEqual(result.body);
  });

  it("returns a temporary matching error and does not store a weak report when embeddings fail with 4006", async () => {
    const snapshot = sampleSnapshot([FACULTY, COURSE]);
    const { calls, sql } = overlapRecordingSql({
      snapshotJson: JSON.stringify(snapshot),
      resumes: [{ id: "R1", text: "I studied distributed systems in a lab." }],
    });
    const ai = {
      async run() {
        throw new Error(
          "4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.",
        );
      },
    };

    const result = await resolveOverlap({
      schoolId: "6",
      sql,
      db: new ThrowingFactsD1() as unknown as D1Database,
      ai: ai as unknown as Env["AI"],
    });

    expect(result).toEqual({
      status: 503,
      body: { error: "Matching is temporarily unavailable, try again later" },
    });
    expect(result.body).not.toMatchObject({ weak: true });
    const stored = calls.find((call) => call.text.includes("overlap_reads") && call.text.includes("INSERT"));
    const json = stored?.values.find((value) => typeof value === "string" && value.startsWith("{"));
    expect(JSON.parse(String(json))).toEqual({
      error: "Matching is temporarily unavailable, try again later",
    });
  });

  it("returns a temporary matching error when the judge call fails", async () => {
    const snapshot = sampleSnapshot([FACULTY, COURSE]);
    const { calls, sql } = overlapRecordingSql({
      snapshotJson: JSON.stringify(snapshot),
      resumes: [{ id: "R1", text: "I studied formal methods and compilers." }],
    });
    const ai = {
      async run(model: string, input: { text?: string[] }) {
        if (model === "@cf/baai/bge-base-en-v1.5") {
          return { data: (input.text ?? []).map(() => [1, 0]) };
        }
        throw new Error("judge down");
      },
    };

    const result = await resolveOverlap({
      schoolId: "6",
      sql,
      db: new ThrowingFactsD1() as unknown as D1Database,
      ai: ai as unknown as Env["AI"],
    });

    expect(result).toEqual({
      status: 503,
      body: { error: "Matching is temporarily unavailable, try again later" },
    });
    expect(result.body).not.toMatchObject({ weak: true });
    const stored = calls.find((call) => call.text.includes("overlap_reads") && call.text.includes("INSERT"));
    const json = stored?.values.find((value) => typeof value === "string" && value.startsWith("{"));
    expect(JSON.parse(String(json))).toEqual({
      error: "Matching is temporarily unavailable, try again later",
    });
  });

  it("returns a weak report with no pairs when the judge verdict is unusable", async () => {
    const snapshot = sampleSnapshot([FACULTY, COURSE]);
    const { sql } = overlapRecordingSql({
      snapshotJson: JSON.stringify(snapshot),
      resumes: [{ id: "R1", text: "I studied formal methods and compilers." }],
    });
    const ai = {
      async run(model: string, input: { text?: string[] }) {
        if (model === "@cf/baai/bge-base-en-v1.5") {
          return { data: (input.text ?? []).map(() => [1, 0]) };
        }
        return { response: "not a verdict" };
      },
    };

    const result = await resolveOverlap({
      schoolId: "6",
      sql,
      db: new ThrowingFactsD1() as unknown as D1Database,
      ai: ai as unknown as Env["AI"],
    });

    expect(result).toEqual({
      status: 200,
      body: {
        pairs: [],
        weak: true,
        unmatchedKinds: ["faculty", "course"],
        verifiedAsOf: "2026-03-01T00:00:00Z",
      },
    });
  });

  it("asks for a résumé and does not store a report when no résumé rows exist", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const { calls, sql } = overlapRecordingSql({
      snapshotJson: JSON.stringify(sampleSnapshot([FACULTY, COURSE])),
      resumes: [],
    });

    const result = await resolveOverlap({
      schoolId: "6",
      sql,
      db: new ThrowingFactsD1() as unknown as D1Database,
      ai: orthogonalEmbedAi().ai as unknown as Env["AI"],
    });

    expect(result).toEqual({ status: 400, body: { error: "Upload a resume first" } });
    expect(calls.some((call) => call.text.includes("overlap_reads"))).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("returns a weak report without fetching a page when no snapshot exists", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const { calls, sql } = overlapRecordingSql({
      resumes: [{ id: "R1", text: "I studied distributed systems in a lab." }],
    });

    const result = await resolveOverlap({
      schoolId: "6",
      sql,
      db: new MemoryFactsD1(null) as unknown as D1Database,
      ai: orthogonalEmbedAi().ai as unknown as Env["AI"],
    });

    expect(result).toEqual({
      status: 200,
      body: {
        pairs: [],
        weak: true,
        unmatchedKinds: ["faculty", "course"],
        verifiedAsOf: null,
      },
    });
    expect(read).not.toHaveBeenCalled();
    expect(calls.some((call) => call.text.includes("overlap_reads") && call.text.includes("INSERT"))).toBe(false);
  });

  it("caches a D1 snapshot the same way a program read does, then scores it", async () => {
    const read = vi.spyOn(publicPages, "readPublicPage").mockResolvedValue(LIVE_PAGE);
    const snapshot = sampleSnapshot([FACULTY]);
    const { calls, sql } = overlapRecordingSql({
      resumes: [{ id: "R1", text: "I studied distributed systems in a lab." }],
    });

    const result = await resolveOverlap({
      schoolId: "6",
      sql,
      db: new MemoryFactsD1(snapshot) as unknown as D1Database,
      ai: orthogonalEmbedAi().ai as unknown as Env["AI"],
    });

    const stored = calls.find((call) => call.text.includes("snapshot_reads") && call.text.includes("INSERT"));
    expect(stored?.text).toContain("INSERT OR REPLACE");
    expect(stored?.values).toContain("6");
    const json = stored?.values.find((value) => typeof value === "string" && value.startsWith("{"));
    expect(JSON.parse(String(json))).toEqual(snapshot);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ weak: true, pairs: [], verifiedAsOf: "2026-03-01T00:00:00Z" });
    expect(read).not.toHaveBeenCalled();
  });
});

describe("deleteStoredResume", () => {
  function stores(options?: { vectorizeThrows?: boolean; d1Throws?: boolean }) {
    const calls: string[] = [];
    const sqlText: string[] = [];
    const vectorIds: string[][] = [];
    const deletedKeys: string[] = [];
    const listedPrefixes: string[] = [];
    let state = { resumeReady: true, chunkCount: 2, pageStatus: "ok" };
    return {
      calls,
      sqlText,
      vectorIds,
      deletedKeys,
      listedPrefixes,
      state: () => state,
      input: {
        userId: "4",
        readChunkIds: () => {
          calls.push("read");
          return ["c1", "c2"];
        },
        sql: ((strings: TemplateStringsArray) => {
          sqlText.push(strings.join(" "));
          calls.push("sql");
          return [];
        }) as AgentSql,
        getState: () => state,
        setState: (next: typeof state) => {
          state = next;
          calls.push("state");
        },
        db: {
          prepare(query: string) {
            return {
              bind: (...args: unknown[]) => ({
                run: async () => {
                  if (options?.d1Throws) throw new Error("d1 down");
                  calls.push(`d1 ${query} ${args.join(",")}`);
                },
              }),
            };
          },
        },
        resumes: {
          list: async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
            listedPrefixes.push(prefix);
            calls.push("r2-list");
            if (cursor) return { objects: [{ key: "resumes/4/22/notes.txt" }], truncated: false };
            return {
              objects: [{ key: "resumes/4/6/resume.pdf" }],
              truncated: true,
              cursor: "next",
            };
          },
          delete: async (keys: string[]) => {
            deletedKeys.push(...keys);
            calls.push("r2-delete");
          },
        },
        vectorize: {
          deleteByIds: async (ids: string[]) => {
            if (options?.vectorizeThrows) throw new Error("vectorize down");
            vectorIds.push(ids);
            calls.push("vectorize");
          },
        },
      },
    };
  }

  it("clears each store and reports deleted", async () => {
    const harness = stores();
    const result = await deleteStoredResume(harness.input);
    expect(result).toEqual({ deleted: true });
    expect(harness.vectorIds).toEqual([["4:c1", "4:c2"]]);
    expect(harness.calls.indexOf("read")).toBeLessThan(harness.calls.indexOf("vectorize"));
    expect(harness.calls.indexOf("vectorize")).toBeLessThan(harness.calls.indexOf("sql"));
    expect(harness.sqlText.join("\n")).toContain("DELETE FROM resume_chunks");
    expect(harness.sqlText.join("\n")).toContain("DELETE FROM overlap_reads");
    expect(harness.sqlText.join("\n")).toContain("DELETE FROM draft_turns");
    expect(harness.sqlText.join("\n")).not.toContain("snapshot_reads");
    expect(harness.sqlText.join("\n")).not.toContain("page_reads");
    expect(harness.calls.some((call) => call.includes("DELETE FROM resume_chunks WHERE user_id = ?") && call.includes("4"))).toBe(true);
    expect(harness.listedPrefixes).toEqual(["resumes/4/", "resumes/4/"]);
    expect(harness.deletedKeys).toEqual(["resumes/4/6/resume.pdf", "resumes/4/22/notes.txt"]);
    expect(harness.state()).toEqual({ resumeReady: false, chunkCount: 0, pageStatus: "ok" });
  });

  it("names the store that failed and still clears the others", async () => {
    const harness = stores({ vectorizeThrows: true });
    const result = await deleteStoredResume(harness.input);
    expect(result).toEqual({ deleted: false, failed: ["vectorize"] });
    expect(harness.sqlText.join("\n")).toContain("DELETE FROM resume_chunks");
    expect(harness.deletedKeys).toEqual(["resumes/4/6/resume.pdf", "resumes/4/22/notes.txt"]);
    expect(harness.state()).toEqual({ resumeReady: false, chunkCount: 0, pageStatus: "ok" });
  });

  it("names d1 when that delete throws", async () => {
    const harness = stores({ d1Throws: true });
    const result = await deleteStoredResume(harness.input);
    expect(result).toEqual({ deleted: false, failed: ["d1"] });
    expect(harness.vectorIds).toEqual([["4:c1", "4:c2"]]);
    expect(harness.deletedKeys).toHaveLength(2);
  });
});

describe("secret", () => {
  it("matches the proxy secret without accepting a blank value", async () => {
    expect(await secretsMatch("same-secret", "same-secret")).toBe(true);
    expect(await secretsMatch("nope", "same-secret")).toBe(false);
    expect(await secretsMatch("same-secret", "")).toBe(false);
  });
});
