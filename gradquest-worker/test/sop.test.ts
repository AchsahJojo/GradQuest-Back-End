import { describe, expect, it } from "vitest";
import { isAllowlisted } from "../src/allowlist";
import { secretsMatch } from "../src/auth/secret";
import { isLoginWall } from "../src/crawl/loginWall";
import { readPublicPage } from "../src/crawl/readPublicPage";
import { isPathAllowed } from "../src/crawl/robots";
import { acceptModelDraft, draftParagraph } from "../src/draft/opening";

const CSUF = "https://catalog.fullerton.edu/preview_program.php?catoid=70&poid=32661";
const SLO = "https://catalog.calpoly.edu/engineering/computer-science-software/computer-science-ms/";
const UCSD = "https://cse.ucsd.edu/graduate/degree-programs/ms-program";

describe("allowlist", () => {
  it("accepts only the three public program pages", () => {
    expect(isAllowlisted(CSUF)).toBe(true);
    expect(isAllowlisted(`${SLO}`)).toBe(true);
    expect(isAllowlisted(UCSD)).toBe(true);
    expect(isAllowlisted("https://www.calstate.edu/apply")).toBe(false);
    expect(isAllowlisted("https://example.edu/login")).toBe(false);
    expect(isAllowlisted("http://catalog.fullerton.edu/preview_program.php?catoid=70&poid=32661")).toBe(false);
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
    const page = await readPublicPage(UCSD, fetchImpl);
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
    const page = await readPublicPage(SLO, fetchImpl);
    expect(page.pageStatus).toBe("ok");
    expect(page.excerpts[0]?.id).toBe("P1");
    expect(page.text).toContain("30 semester units");
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
    expect(
      acceptModelDraft("I taught a data structures lab [R1]. The public page lists 40 units [P1].", input),
    ).toContain("[P1]");
  });
});

describe("secret", () => {
  it("matches the proxy secret without accepting a blank value", async () => {
    expect(await secretsMatch("same-secret", "same-secret")).toBe(true);
    expect(await secretsMatch("nope", "same-secret")).toBe(false);
    expect(await secretsMatch("same-secret", "")).toBe(false);
  });
});
