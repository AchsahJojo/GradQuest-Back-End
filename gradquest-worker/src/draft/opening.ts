import type { Excerpt } from "../crawl/excerpts";
import type { JudgedPair } from "../facts/judge";
import { MIN_STRONG_PAIRS, UNVERIFIED_FACULTY_SUBTITLE, isThinFaculty } from "../facts/match";
import { isResumeHeaderNoise, scrubContactTokens } from "../resume/noise";
import { guardNames, type AllowedNames, type NameRoster } from "./nameGuard";

export const DRAFT_LABEL = "Draft outline — edit before you use it";

export type DraftMode = "opening" | "motivation";

export type DraftInput = {
  mode: DraftMode;
  schoolName: string;
  programName: string;
  sopRequired: boolean | null;
  pageStatus: string;
  resumeChunks: Excerpt[];
  pageExcerpts: Excerpt[];
  pastedPrompt?: string;
  openingFact?: Excerpt;
  pairs: JudgedPair[];
  weak: boolean;
  roster?: NameRoster;
};

export type DraftResult = {
  paragraph: string;
  label: string;
  citations: string[];
  pageStatus: string;
};

const BANNED_UNLESS_SOURCED = ["Cal State Apply", "Slate", "Technolutions"];

const SECTION_HEADERS = [
  "Opening",
  "Preparation & Experience",
  "Goals & Program Fit",
  "Conclusion",
] as const;

export function weakOverlapParagraph(input: { schoolName: string; programName: string }): string {
  const school = input.schoolName.trim() || "this school";
  const program = input.programName.trim() || "this program";
  return [
    `We found little connection between your résumé and the faculty or courses in ${program} at ${school}.`,
    "Those parts are left for you to write.",
  ].join(" ");
}

/** Scaffold-only outline: headers + prompts + evidence lists. No generated prose. */
export function scaffoldOutline(input: DraftInput): DraftResult {
  const school = input.schoolName.trim() || "this school";
  const program = input.programName.trim() || "this program";
  const blocks: string[] = [];

  if (input.weak) {
    blocks.push(weakOverlapParagraph({ schoolName: school, programName: program }));
  } else if (input.sopRequired === false || input.mode === "motivation") {
    blocks.push(`Optional motivation outline for ${program} at ${school}.`);
  }

  const labeledPairs = input.weak
    ? []
    : input.pairs.map((pair, index) => ({
        pair: {
          ...pair,
          resume: resolveResumeCitation(pair.resume, input.resumeChunks, index + 1),
        },
        pId: `P${index + 1}`,
        thin: isThinFaculty(pair.fact) || pair.fact.detail.trim() === "",
      }));

  const openingResume =
    input.openingFact ??
    pickOpeningFact(input.resumeChunks, 0) ??
    (input.resumeChunks[0] ? { id: input.resumeChunks[0].id, text: input.resumeChunks[0].text } : undefined);

  for (const header of SECTION_HEADERS) {
    const prompts: string[] = [];
    const evidence: string[] = [];

    if (header === "Opening") {
      prompts.push("Name the moment that made you want graduate study in this field. [STUDENT: add detail]");
      if (openingResume) {
        prompts.push(`Connect that opening to this résumé fact [${openingResume.id}].`);
        evidence.push(evidenceLine(openingResume.id, openingResume.text));
      } else {
        prompts.push("Connect that opening to a concrete résumé experience. [STUDENT: add detail]");
      }
      if (input.pastedPrompt?.trim()) {
        prompts.push("Answer any extra ask from the prompt you pasted. [STUDENT: add detail]");
      }
    }

    if (header === "Preparation & Experience") {
      if (input.weak) {
        prompts.push("Describe one project, job, or course that prepared you. [STUDENT: add detail]");
        prompts.push("Explain what you learned that you want to carry forward. [STUDENT: add detail]");
        addResumeEvidence(evidence, input.resumeChunks.slice(0, 2));
      } else {
        const course = labeledPairs.find((item) => item.pair.fact.kind === "course");
        const resume = course?.pair.resume ?? openingResume;
        if (resume) {
          prompts.push(`Explain how this experience prepared you for graduate study [${resume.id}].`);
          evidence.push(evidenceLine(resume.id, resume.text));
        } else {
          prompts.push("Explain how a past experience prepared you for graduate study. [STUDENT: add detail]");
        }
        if (course && !input.weak) {
          prompts.push(
            `Say why you want to take ${course.pair.fact.name}, tied to your résumé [${course.pId}] [${course.pair.resume.id}].`,
          );
          evidence.push(evidenceLine(course.pId, `${course.pair.fact.name}. ${course.pair.fact.detail}`));
          evidence.push(evidenceLine(course.pair.resume.id, course.pair.resume.text));
        } else {
          prompts.push("Name a course you want to take and why it fits your background. [STUDENT: add detail]");
        }
      }
    }

    if (header === "Goals & Program Fit") {
      prompts.push("State a research or career goal for this program. [STUDENT: add detail]");
      if (input.weak) {
        prompts.push("Name a faculty member or research area only if you can verify it yourself. [STUDENT: add detail]");
        addResumeEvidence(evidence, input.resumeChunks.slice(0, 2));
      } else {
        const faculty = labeledPairs.find((item) => item.pair.fact.kind === "faculty" && !item.thin);
        const thinFaculty = labeledPairs.find((item) => item.pair.fact.kind === "faculty" && item.thin);
        if (faculty) {
          prompts.push(
            `Explain how your background connects to ${faculty.pair.fact.name}'s work described below [${faculty.pId}] [${faculty.pair.resume.id}].`,
          );
          evidence.push(evidenceLine(faculty.pId, `${faculty.pair.fact.name}. ${faculty.pair.fact.detail}`));
          evidence.push(evidenceLine(faculty.pair.resume.id, faculty.pair.resume.text));
        } else if (thinFaculty) {
          prompts.push(
            `${thinFaculty.pair.fact.name} is listed for this program, but research interests are not verified. Do not invent interests. Add only what you can verify yourself. [STUDENT: add detail]`,
          );
          evidence.push(evidenceLine(thinFaculty.pId, `${thinFaculty.pair.fact.name}. ${UNVERIFIED_FACULTY_SUBTITLE}`));
        } else {
          prompts.push("Connect your goal to a verified faculty interest or course from the evidence list. [STUDENT: add detail]");
        }
        for (const item of labeledPairs) {
          if (item.pair.fact.kind === "faculty" && item.thin) continue;
          if (faculty && item.pId === faculty.pId) continue;
          if (item.pair.fact.kind === "course") {
            evidence.push(evidenceLine(item.pId, `${item.pair.fact.name}. ${item.pair.fact.detail}`));
            evidence.push(evidenceLine(item.pair.resume.id, item.pair.resume.text));
          }
        }
      }
    }

    if (header === "Conclusion") {
      prompts.push("Close by naming what you want to accomplish in the first year. [STUDENT: add detail]");
      if (!input.weak && labeledPairs[0]) {
        const first = labeledPairs[0];
        if (!first.thin) {
          prompts.push(
            `End by tying one résumé fact to one program fact [${first.pair.resume.id}] [${first.pId}].`,
          );
          evidence.push(evidenceLine(first.pair.resume.id, first.pair.resume.text));
          evidence.push(evidenceLine(first.pId, `${first.pair.fact.name}. ${first.pair.fact.detail}`));
        } else {
          prompts.push("End with a specific goal you can support from your résumé. [STUDENT: add detail]");
        }
      } else {
        prompts.push("End with a specific goal you can support from your résumé. [STUDENT: add detail]");
        addResumeEvidence(evidence, input.resumeChunks.slice(0, 1));
      }
    }

    blocks.push(formatSection(header, prompts.slice(0, 2), uniqueEvidence(evidence)));
  }

  const paragraph = blocks.join("\n\n").trim();
  return {
    paragraph,
    label: DRAFT_LABEL,
    citations: citationsIn(paragraph),
    pageStatus: input.pageStatus,
  };
}

export function stripUnfilledProgramCitations(text: string): string {
  return text
    .replace(/[ \t]*\[P#\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}

export function draftParagraph(input: DraftInput): DraftResult {
  return scaffoldOutline(input);
}

function formatSection(header: string, prompts: string[], evidence: string[]): string {
  const lines = [header, ...prompts.map((prompt) => `- ${prompt}`)];
  if (evidence.length > 0) {
    lines.push("Evidence");
    lines.push(...evidence.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

function evidenceLine(id: string, text: string): string {
  return `[${id}] ${clip(text.replace(/\s+/g, " ").trim())}`;
}

function addResumeEvidence(evidence: string[], chunks: Excerpt[]): void {
  const facts = resumeFacts(chunks).slice(0, 2);
  const source = facts.length > 0 ? facts : chunks.slice(0, 2);
  for (const chunk of source) {
    evidence.push(evidenceLine(chunk.id, chunk.text));
  }
}

function uniqueEvidence(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function resolveResumeCitation(
  resume: Excerpt,
  chunks: Excerpt[],
  fallbackIndex: number,
): Excerpt {
  const text = resume.text.split("\n").map((line) => line.trim()).find(Boolean) ?? resume.text.trim();
  if (resume.id.trim()) return { id: resume.id.trim(), text };
  const sentence = resumeFacts(chunks).find(
    (item) => item.text === text || text.includes(item.text) || item.text.includes(text),
  );
  if (sentence) return { id: sentence.id, text: sentence.text };
  const chunk = chunks.find((item) => item.text.includes(text) || text.includes(item.text));
  if (chunk) return { id: chunk.id, text };
  return { id: `R${fallbackIndex}`, text };
}

export const MIN_SENTENCES = 5;
export const MAX_SENTENCE_WORDS = 45;
export const MIN_WORDS = 100;
export const MAX_WORDS = 900;
const DRAFT_CHAR_CAP = 12000;

export type DraftStats = { words: number; sentences: number; longest: number };

const MARKER = /\[(?:R\d+|P\d+|STUDENT: add detail)\]/g;
const DOTTED = /^(?:[A-Za-z]\.){2,}$/;
const TITLE = /^(?:Dr|Mr|Ms|Mrs|Prof|St|vs)\.$/;

export function splitSentences(text: string): string[] {
  const tokens = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const sentences: string[] = [];
  let current: string[] = [];
  let inMarker = false;
  let pendingEnd = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    current.push(token);
    if (token.startsWith("[")) inMarker = true;
    if (inMarker && !token.includes("]")) continue;
    const closedMarker = inMarker;
    inMarker = false;
    const next = tokens[i + 1];
    if (!next) continue;
    const ends =
      (/[.!?]["”')\]]?$/.test(token) && !TITLE.test(token)) || (pendingEnd && closedMarker);
    if (!ends) continue;
    if (next.startsWith("[") && !token.endsWith("].")) {
      pendingEnd = true;
      continue;
    }
    if (DOTTED.test(token) && !/^[A-Z["“]/.test(next)) continue;
    pendingEnd = false;
    sentences.push(current.join(" "));
    current = [];
  }
  if (current.length > 0) sentences.push(current.join(" "));
  return sentences;
}

export function draftStats(text: string): DraftStats {
  const sentences = splitSentences(text);
  const counts = sentences.map((sentence) => wordCount(sentence));
  return {
    words: counts.reduce((sum, n) => sum + n, 0),
    sentences: sentences.length,
    longest: counts.length > 0 ? Math.max(...counts) : 0,
  };
}

export function draftShapeProblem(stats: DraftStats): string | null {
  if (stats.sentences < MIN_SENTENCES) {
    return `it had ${stats.sentences} sentences; write 6 to 9`;
  }
  if (stats.longest > MAX_SENTENCE_WORDS) {
    return `its longest sentence had ${stats.longest} words; keep every sentence under 35 words`;
  }
  if (stats.words < MIN_WORDS || stats.words > MAX_WORDS) {
    return `it had ${stats.words} words; stay between ${MIN_WORDS} and ${MAX_WORDS}`;
  }
  return null;
}

const INTERNAL_VARIANT =
  /\bblended\b|\b4\s*\+\s*1\b|\bB\.?S\.?\s*\+\s*M\.?S\.?\b|\bBS\s+[A-Za-z ]+\+\s*MS\b|\bconcurrent (?:bachelor|degree)|\bcurrent [A-Z][A-Za-z ]* undergraduates?\b/i;

const CLICHES = [
  "endless possibilities",
  "ever since i was",
  "from a young age",
  "passionate about",
  "in today's world",
  "in today’s world",
  "fast-paced world",
  "ever-evolving",
];

const OBLIGATION = /\bI must\b|\bI am aware that\b|\bI'm aware that\b|\bTo be eligible\b|\bI am required to\b/i;

const STOCK_FLEXIBILITY =
  /\bone or more (?:areas|fields|concentrations|specializations)\b|\bconcentrate in (?:one|two|multiple|several|more than one)\b|\bmaximum flexibility\b/i;

export function forOutsideApplicants(excerpts: Excerpt[]): Excerpt[] {
  return excerpts
    .map((item) => ({
      id: item.id,
      text: splitSentences(item.text)
        .filter((sentence) => !INTERNAL_VARIANT.test(sentence) && !STOCK_FLEXIBILITY.test(sentence))
        .join(" "),
    }))
    .filter((item) => item.text.length >= 40);
}

export function resumeFacts(chunks: Excerpt[]): Excerpt[] {
  return chunks.flatMap((chunk) => {
    const pieces = chunk.text.includes("\n")
      ? chunk.text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [scrubContactTokens(chunk.text)];
    return pieces
      .filter((piece) => !isResumeHeaderNoise(piece))
      .flatMap((piece) => splitSentences(piece))
      .map((sentence) => scrubContactTokens(sentence).trim())
      .filter((sentence) => sentence.split(/\s+/).length >= 4)
      .filter((sentence) => !isResumeHeaderNoise(sentence))
      .map((sentence) => ({ id: chunk.id, text: sentence }));
  });
}

export function pickOpeningFact(chunks: Excerpt[], turn: number): Excerpt | undefined {
  const facts = resumeFacts(chunks);
  if (facts.length === 0) return undefined;
  return facts[((turn % facts.length) + facts.length) % facts.length];
}

const STOPWORDS = new Set([
  "about", "after", "also", "built", "from", "have", "into", "over", "that", "their", "them",
  "then", "they", "this", "were", "what", "when", "with", "worked", "work", "years", "year",
]);

function factKeywords(fact: string): string[] {
  const words = fact.toLowerCase().match(/[a-z0-9+#]+/g) ?? [];
  return [...new Set(words.filter((word) => word.length >= 4 && !STOPWORDS.has(word)))];
}

export function openerProblem(text: string, fact: Excerpt | undefined): string | null {
  if (!fact) return null;
  const keywords = factKeywords(fact.text);
  if (keywords.length === 0) return null;
  const first = (splitSentences(text)[0] ?? "").toLowerCase();
  const hits = keywords.filter((word) => first.includes(word.slice(0, Math.min(word.length, 6)))).length;
  if (hits >= Math.min(2, keywords.length)) return null;
  return `its first sentence did not open with the required fact ("${fact.text}")`;
}

const UNSOURCED_CLAIMS: Array<[string, RegExp]> = [
  ["reputation", /\breput\w*/i],
  ["ranking", /\brank(?:ed|ing|ings)?\b/i],
  ["prestigious", /\bprestig\w*/i],
  ["world-class", /\bworld[- ]class\b/i],
  ["rigorous", /\brigou?r\w*/i],
  ["renowned", /\brenown\w*/i],
  ["strong curriculum", /\bstrong curricul\w*/i],
  ["great fit", /\bgreat fit\b/i],
  ["perfect fit", /\bperfect fit\b/i],
  ["excellent program", /\bexcellent program\b/i],
  ["necessary resources", /\bnecessary resources\b/i],
  ["research opportunities", /\bresearch opportunit\w*/i],
  ["make meaningful", /\bmake meaningful\b/i],
  ["meaningful advancements", /\bmeaningful advancements?\b/i],
];

const SUMMARY_CLOSING =
  /\b(?:is|be|as) (?:a|an|the) (?:great|good|ideal|perfect|excellent|strong) fit\b|\bI am (?:excited|eager|thrilled) to (?:join|be part|become part)\b|\bI look forward to contributing\b|\bI am eager to contribute\b/i;
const REQUIREMENT_AS_BENEFIT_PHRASE =
  /\bprogram'?s (?:course )?requirements?\b|\bthe requirements? (?:for|to|of)\b|\brequired courses?\b|\bcourse requirements?\b/i;
const BENEFIT_VERB =
  /\bwill (?:allow|help|enable|let|provide|give|prepare)\b|\balign(?:s|ed)? (?:well )?with my (?:goals?|interests|aspirations)\b/i;
const REQUIREMENT_SUBJECT = /\brequire\w*|\bunits?\b|\bdeadlines?\b/i;
const COURSE_CODE = /\b[A-Z]{2,4} ?\d{3,4}\b/;
const STUDENT_INTEREST = /\bI (?:want|hope|plan|would like|am (?:interested|drawn|eager|keen))\b/;

function closingProblem(last: string): string | null {
  if (/^Overall\b/i.test(last)) {
    return "its last sentence started with \"Overall\"; end by tying one resume fact to one program fact, or with a specific goal marked [STUDENT: add detail]";
  }
  if (SUMMARY_CLOSING.test(last) && !/\[(?:R|P)\d+\]/.test(last)) {
    return "its last sentence was only a summary judgment; end by tying one resume fact to one program fact, or with a specific goal marked [STUDENT: add detail]";
  }
  return null;
}

function requirementFramingProblem(sentence: string): string | null {
  const phrase = REQUIREMENT_AS_BENEFIT_PHRASE.exec(sentence);
  if (phrase) {
    return `it framed a requirement as a benefit ("${phrase[0]}"); mention a course only to say the student wants to take it and why`;
  }
  const benefit = BENEFIT_VERB.exec(sentence);
  if (!benefit) return null;
  const studentWantsCourse = STUDENT_INTEREST.test(sentence) && /\[R\d+\]/.test(sentence);
  if (
    REQUIREMENT_SUBJECT.test(sentence) ||
    (COURSE_CODE.test(sentence) && (/^align/i.test(benefit[0]) || !studentWantsCourse))
  ) {
    return "it said a requirement or course code will help, allow, or align with the student; say the student wants to take the course and why, tied to a resume fact";
  }
  return null;
}

const MARKER_TEXT = "[STUDENT: add detail]";
const MARKER_AT_END = /\[STUDENT: add detail\](?:\s*\[(?:R|P)\d+\])*\s*[.!?]?["”')]?$/;
const DANGLING_BEFORE_MARKER =
  /(?:[,;:—–-]|\b(?:but|and|or|so|including|such as|like|of|to|for|with|on|in|at|about|that|which|because|is|are|was|be|my|our|the|a|an|as|than|into|from))$/i;

function markerProblem(sentence: string): string | null {
  if (!sentence.includes(MARKER_TEXT)) return null;
  if (!MARKER_AT_END.test(sentence)) {
    return "it put [STUDENT: add detail] inside a sentence; the marker must finish a complete sentence";
  }
  const before = sentence
    .slice(0, sentence.lastIndexOf(MARKER_TEXT))
    .replace(/\s*\[(?:R|P)\d+\]/g, "")
    .trim();
  const words = before.split(/\s+/).filter(Boolean).length;
  if (words < 6 || DANGLING_BEFORE_MARKER.test(before)) {
    const tail = before.split(/\s+/).slice(-2).join(" ");
    return `it left "${tail} [STUDENT: add detail]" as a blank to fill; each marker must follow a complete claim that still reads correctly if the marker is deleted`;
  }
  return null;
}

export function contentProblems(text: string, sources = ""): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  const cliche = CLICHES.find((phrase) => lower.includes(phrase));
  if (cliche) problems.push(`it used the cliché "${cliche}"; open with a concrete resume fact or a specific moment`);
  const obligation = OBLIGATION.exec(text);
  if (obligation) {
    problems.push(`it recited a program rule as the student's obligation ("${obligation[0]}"); use program facts only to show fit`);
  }
  if (INTERNAL_VARIANT.test(text)) {
    problems.push("it mentioned a blended or combined-degree option meant for the school's own undergraduates");
  }
  const sentences = splitSentences(text);
  for (const [word, pattern] of UNSOURCED_CLAIMS) {
    if (pattern.test(text) && !pattern.test(sources)) {
      const where = sentences.find((sentence) => pattern.test(sentence));
      problems.push(
        `it claimed "${word}" about the program, which no excerpt says; drop claims the page does not support${quoted(where)}`,
      );
    }
  }
  const first = sentences[0] ?? "";
  if (!/\[(?:R\d+|STUDENT: add detail)\]/.test(first)) {
    problems.push("its first sentence was not a concrete resume fact [R#] or a specific moment marked [STUDENT: add detail]");
  }
  for (const sentence of sentences) {
    const problem = markerProblem(sentence) ?? requirementFramingProblem(sentence);
    if (problem) problems.push(`${problem}${quoted(sentence)}`);
  }
  const closing = closingProblem(sentences[sentences.length - 1] ?? "");
  if (closing) problems.push(closing);
  return problems;
}

function quoted(sentence: string | undefined): string {
  return sentence ? ` (sentence: "${sentence}")` : "";
}

export function draftContentProblem(text: string, sources = ""): string | null {
  return contentProblems(text, sources)[0] ?? null;
}

export function draftProblems(text: string, input: DraftInput): string[] {
  const shape = draftShapeProblem(draftStats(text));
  const opener = openerProblem(text, input.openingFact);
  return [
    ...(shape ? [shape] : []),
    ...contentProblems(text, draftSources(input)),
    ...(opener ? [opener] : []),
  ];
}

export function draftProblem(text: string, input: DraftInput): string | null {
  return draftProblems(text, input)[0] ?? null;
}

export function draftSources(input: DraftInput): string {
  return [
    ...input.resumeChunks.map((item) => item.text),
    ...input.pageExcerpts.map((item) => item.text),
    input.pastedPrompt ?? "",
  ].join(" ");
}

function citationsAtEnd(sentence: string): string {
  const cites = sentence.match(/\[(?:R\d+|P\d+)\]/g);
  if (!cites) return sentence;
  const body = sentence.replace(/\s*\[(?:R\d+|P\d+)\]/g, "").trim();
  const unique = [...new Set(cites)].join(" ");
  const end = /([.!?]["”')]?)$/.exec(body);
  if (!end) return `${body} ${unique}`;
  return `${body.slice(0, -end[1].length).trimEnd()} ${unique}${end[1]}`;
}

function wordCount(sentence: string): number {
  return sentence.replace(MARKER, " ").split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
}

export function acceptModelDraft(text: string, input: DraftInput): string | null {
  const raw = text.trim();
  if (!raw || raw.length > DRAFT_CHAR_CAP) return null;
  const flat = raw.replace(/\s+/g, " ").trim();
  if (draftProblem(flat, input)) return null;
  const polished = polishBlocks(raw, knownCitationIds(input));
  if (!polished) return null;
  const source = draftSources(input);
  for (const banned of BANNED_UNLESS_SOURCED) {
    if (polished.includes(banned) && !source.includes(banned)) return null;
  }
  return polished;
}

// The style checker can reject a real model paragraph. Keep that paragraph when it
// is still a cited draft. The paste-together outline is only for an empty or uncited reply.
export function cohesiveDraft(text: string | null, input: DraftInput): string | null {
  if (!text) return null;
  const raw = text.trim();
  if (!raw || raw.length > DRAFT_CHAR_CAP) return null;
  const flat = raw.replace(/\s+/g, " ").trim();
  const stats = draftStats(flat);
  if (stats.words < 80 || stats.sentences < 3) return null;
  const polished = polishBlocks(raw, knownCitationIds(input));
  if (!polished || !/\[(?:R\d+|P\d+)\]/.test(polished)) return null;
  const source = draftSources(input);
  for (const banned of BANNED_UNLESS_SOURCED) {
    if (polished.includes(banned) && !source.includes(banned)) return null;
  }
  return polished;
}

function knownCitationIds(input: DraftInput): Set<string> {
  const known = new Set([...input.resumeChunks, ...input.pageExcerpts].map((item) => item.id));
  for (let index = 1; index <= input.pairs.length; index += 1) known.add(`P${index}`);
  return known;
}

function polishBlocks(raw: string, known: Set<string>): string | null {
  const blocks = raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const polished: string[] = [];
  for (const block of blocks) {
    const sentences = splitSentences(block).map(citationsAtEnd);
    const fixed: string[] = [];
    for (const sentence of sentences) {
      for (const match of sentence.matchAll(/\[(R\d+|P\d+)\]/g)) {
        if (!known.has(match[1])) return null;
      }
      if (/\[(?:R\d+|P\d+|STUDENT: add detail)\]/.test(sentence)) {
        fixed.push(sentence);
      } else {
        fixed.push(`${sentence.replace(/\s*$/, "")} [STUDENT: add detail]`);
      }
    }
    if (fixed.length > 0) polished.push(fixed.join(" "));
  }
  return polished.length > 0 ? polished.join("\n\n") : null;
}

export const TARGET_MIN_WORDS = 400;

export function retryNoteFor(
  stats: DraftStats,
  problem: string | string[] | null,
  previous: string,
  weak = false,
): string | null {
  const problems = (Array.isArray(problem) ? problem : problem ? [problem] : []).slice(0, 6);
  if (problems.length > 0) {
    return [
      `Your previous draft was rejected because ${problems.join("; and ")}.`,
      "Fix only the sentences named above. Keep the other paragraphs, and keep the full statement between 400 and 800 words.",
      `Previous draft:\n${previous}`,
    ].join("\n");
  }
  if (stats.words >= TARGET_MIN_WORDS) return null;
  const expansion = weak
    ? "Do not name faculty or courses. Write a [STUDENT: add detail] program-fit paragraph. Do not turn the statement into a list of resume bullets."
    : "Add paragraphs that use the kept pairs and connect each one to its résumé text [R#] [P#]. Do not turn the statement into a list of resume bullets.";
  return [
    `Your previous draft had only ${stats.words} words in ${stats.sentences} sentences. It needs at least ${TARGET_MIN_WORDS} words; aim for about 600, in 4 to 6 paragraphs.`,
    expansion,
    `Previous draft:\n${previous}`,
  ].join("\n");
}

function namesAllowed(input: DraftInput): AllowedNames {
  if (input.weak) return { faculty: [], courses: [] };
  return {
    faculty: input.pairs.filter((pair) => pair.fact.kind === "faculty").map((pair) => pair.fact.name),
    courses: input.pairs.filter((pair) => pair.fact.kind === "course").map((pair) => pair.fact.name),
  };
}

function sourceText(text: string, allowed: AllowedNames, roster: NameRoster): string {
  return guardNames(text, allowed, roster).text;
}

export function draftSystemMessage(weak: boolean): string {
  const length =
    "You write a full statement of purpose: about 600 words in 4 to 6 paragraphs separated by a blank line.";
  if (weak) {
    return `${length} Do not name faculty or courses. Write a [STUDENT: add detail] program-fit paragraph. Never invent an application prompt.`;
  }
  return `${length} At least two paragraphs use the kept pairs and connect each one to its résumé text. Do not name a faculty member or course that is not one of those pairs. Never invent an application prompt.`;
}

export function draftPrompt(input: DraftInput): string {
  const allowed = namesAllowed(input);
  const roster = input.roster ?? { faculty: [], courses: [] };
  const resume = input.resumeChunks.map((item) => `[${item.id}] ${sourceText(item.text, allowed, roster)}`).join("\n");
  const pages = input.pageExcerpts.map((item) => `[${item.id}] ${sourceText(item.text, allowed, roster)}`).join("\n");
  const keptPairs =
    !input.weak && input.pairs.length >= MIN_STRONG_PAIRS
      ? [
          "Program fit uses only these kept pairs.",
          ...input.pairs.map(
            (pair, index) =>
              `[P${index + 1}] ${pair.fact.name}. ${pair.fact.detail} Résumé: ${pair.resume.text}`,
          ),
        ].join("\n")
      : "";
  return [
    "Write a full statement of purpose the student will edit. It is a draft, not an application to submit.",
    "Length: about 600 words, never under 400 or over 800. Use 4 to 6 paragraphs separated by a blank line. A single short paragraph is not acceptable.",
    "Each sentence is 15 to 35 words. None may exceed 35 words.",
    [
      "Structure:",
      input.openingFact
        ? "1. Open the first paragraph with the required opening fact given below [R#]. Never open with 'I am applying'."
        : input.weak
          ? "1. Open the first paragraph with a resume fact [R#]. Do not automatically open with the first resume line. Never open with 'I am applying'."
          : "1. Open the first paragraph with the resume fact that best matches a course or research area on the page [R#]. Do not automatically open with the first resume line. Never open with 'I am applying'.",
      input.weak
        ? "2. Do not name faculty or courses. Write a [STUDENT: add detail] program-fit paragraph."
        : "2. At least two later paragraphs must be about the program. Use only the kept pairs below, and connect each pair to its résumé text [R#] [P#].",
      "3. Do not spend the statement restating the resume.",
      input.weak
        ? "4. Do not name faculty or courses. Write a [STUDENT: add detail] program-fit paragraph."
        : "4. Do not name a faculty member or course that is not one of the kept pairs.",
    ].join("\n"),
    keptPairs,
    "Use each resume fact in at most two sentences, and never restate it the same way twice.",
    "Do not write a stock sentence about the program's 'flexibility to concentrate in one or more areas' unless that is the single best fit for this student.",
    input.weak
      ? ""
      : "A named course, thesis option, or research area is almost always a better program fact than general flexibility.",
    "[STUDENT: add detail] always finishes a complete sentence that already makes a real claim. Never use it to fill a blank inside a sentence, and never put it after 'but', 'including', 'such as', 'of', or a comma. The sentence must still read correctly if the marker is deleted.",
    "Good (from an unrelated field, do not copy): 'I want my history thesis to trace how archival letters from cannery workers reshaped local labor records [STUDENT: add detail].' Bad: 'My thesis would draw on the archive, but [STUDENT: add detail].'",
    "Every evaluative claim about the program (reputation, ranking, rigor, 'emphasis on', 'known for', 'will allow me') must come from a [P#] excerpt that actually says it. If no excerpt says it, leave the claim out.",
    "Never call the program reputable, ranked, prestigious, world-class, rigorous, or renowned unless an excerpt uses that word.",
    "Do not praise the program in general terms such as 'strong curriculum', 'great fit', 'perfect fit', 'excellent program', 'necessary resources', 'research opportunities', or 'meaningful advancements'.",
    input.weak
      ? ""
      : "Never write that a requirement, unit count, deadline, or required course will help, allow, or prepare the student, or that it aligns with their goals. Mention a course only to say the student wants to take it and why, tied to a resume fact.",
    input.weak
      ? ""
      : "For courses, use this shape: 'I want to take <course name> because <resume fact> [R#] [P#].' Do not write 'required courses', 'the requirement to', or 'the program's requirement', and do not make a course code the subject of 'will help', 'will allow', or 'aligns with my goals'.",
    "The last sentence must tie one resume fact to one program fact [R#] [P#], or be an honest sentence about a specific goal ending with [STUDENT: add detail]. Never start it with 'Overall', and never end on a summary judgment such as 'is a great fit' or 'I look forward to contributing'.",
    "Avoid clichés such as 'endless possibilities', 'passionate about', 'ever since I was young', 'from a young age', and 'in today's world'.",
    "Vary how sentences begin; do not start every sentence with 'I'.",
    "Do not chain facts together with commas and 'and I'. End the sentence and start a new one instead.",
    "",
    "Never restate admission requirements, unit counts, or application documents as the student's obligations or goals. Never write 'I must', 'I am aware that', or 'To be eligible'.",
    "Ignore blended, BS+MS, 4+1, or other options meant only for the school's own undergraduates. The student is applying from outside.",
    "Only cite [R#] or [P#] on a sentence that actually states a fact from that excerpt.",
    input.weak
      ? "Use only the resume excerpts below."
      : "Use only the resume excerpts and public-page excerpts below.",
    "Cite a resume fact as [R#] and a page fact as [P#] at the end of the sentence it supports, just before the period.",
    "If a detail is missing, write [STUDENT: add detail] instead of inventing it.",
    "Do not invent an application prompt. Do not mention Cal State Apply or Slate unless those words are in the sources.",
    "Every sentence must include [R#], [P#], or [STUDENT: add detail].",
    `Mode: ${input.mode}. Program: ${input.programName}. School: ${input.schoolName}.`,
    input.openingFact
      ? `Open with this fact and no other: ${sourceText(input.openingFact.text, allowed, roster)} [${input.openingFact.id}]`
      : "",
    input.pastedPrompt?.trim()
      ? `Prompt the student pasted:\n${sourceText(input.pastedPrompt.trim(), allowed, roster)}`
      : "No prompt was pasted.",
    resume ? `Resume excerpts:\n${resume}` : "No resume excerpts.",
    input.weak ? "" : pages ? `Public page excerpts:\n${pages}` : "No public page excerpts.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177).trim()}...` : clean;
}

function citationsIn(paragraph: string): string[] {
  return [...paragraph.matchAll(/\[(R\d+|P\d+)\]/g)].map((match) => match[1]);
}
