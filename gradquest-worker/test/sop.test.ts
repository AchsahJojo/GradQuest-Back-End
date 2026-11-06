import { describe, expect, it, vi } from "vitest";
import { isAllowlisted } from "../src/allowlist";
import { secretsMatch } from "../src/auth/secret";
import { excerptsFromMarkdown, excerptsFromText } from "../src/crawl/excerpts";
import { fetchWithRetry } from "../src/crawl/fetchWithRetry";
import { isLoginWall } from "../src/crawl/loginWall";
import type { MarkdownPage } from "../src/crawl/markdown";
import { expiresAtFor, type CachedPage, type PageCache } from "../src/crawl/pageCache";
import { readPublicPage } from "../src/crawl/readPublicPage";
import { isPathAllowed } from "../src/crawl/robots";
import {
  acceptModelDraft,
  cohesiveDraft,
  draftContentProblem,
  draftParagraph,
  draftPrompt,
  draftProblems,
  draftShapeProblem,
  draftSources,
  draftStats,
  forOutsideApplicants,
  openerProblem,
  pickOpeningFact,
  resumeFacts,
  retryNoteFor,
  splitSentences,
} from "../src/draft/opening";

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

  it("asks for a full statement that uses courses from the page", () => {
    const prompt = draftPrompt({ ...input, mode: "opening" });
    expect(prompt).toContain("about 600 words, never under 400 or over 800");
    expect(prompt).toContain("4 to 6 paragraphs");
    expect(prompt).toContain("name a course, track, or requirement");
    expect(prompt).toContain("do not invent one");
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
    expect(note).toContain("name courses, tracks, or requirements");
    expect(note).toContain("[STUDENT: add detail]");
    expect(note).toContain(`Previous draft:\n${NATURAL_DRAFT}`);
  });

  it("reports the rejection reason on retry and skips a retry for drafts on target", () => {
    expect(retryNoteFor({ words: 97, sentences: 8, longest: 16 }, "it had 97 words; stay between 150 and 250", "x")).toContain(
      "rejected because it had 97 words",
    );
    expect(retryNoteFor({ words: 520, sentences: 24, longest: 28 }, null, "x")).toBeNull();
  });
});

describe("secret", () => {
  it("matches the proxy secret without accepting a blank value", async () => {
    expect(await secretsMatch("same-secret", "same-secret")).toBe(true);
    expect(await secretsMatch("nope", "same-secret")).toBe(false);
    expect(await secretsMatch("same-secret", "")).toBe(false);
  });
});
