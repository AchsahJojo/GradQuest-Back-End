import type { Excerpt } from "../crawl/excerpts";

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
};

export type DraftResult = {
  paragraph: string;
  label: string;
  citations: string[];
  pageStatus: string;
};

const BANNED_UNLESS_SOURCED = ["Cal State Apply", "Slate", "Technolutions"];

export function draftParagraph(input: DraftInput): DraftResult {
  const school = input.schoolName || "this school";
  const program = input.programName || "this program";
  const parts: string[] = [];

  if (input.sopRequired === false || input.mode === "motivation") {
    parts.push(`No statement is required for ${program} at ${school}, so this is an optional motivation draft.`);
  } else {
    parts.push(`I am applying to ${program} at ${school}.`);
  }

  const resume = input.resumeChunks[0];
  if (resume) {
    parts.push(`From my resume: ${clip(resume.text)} [${resume.id}].`);
  } else {
    parts.push("[STUDENT: add detail] about a project, course, or job that belongs in this paragraph.");
  }

  const page = input.pageExcerpts[0];
  if (page) {
    parts.push(`The public program page says: ${clip(page.text)} [${page.id}].`);
  } else if (input.pageStatus === "login_wall" || input.pageStatus === "robots_blocked") {
    parts.push("[STUDENT: add detail] from the program page. GradQuest stopped because that page is not public.");
  } else if (input.pageStatus === "not_allowlisted") {
    parts.push("[STUDENT: add detail] about why this program is a fit. Its page was not fetched.");
  } else {
    parts.push("[STUDENT: add detail] tying your background to this program.");
  }

  const pasted = input.pastedPrompt?.trim();
  if (pasted) {
    parts.push("This responds to the prompt you pasted. [STUDENT: add detail] wherever that prompt asks for something your resume does not show.");
  } else if (input.mode === "opening" && input.sopRequired !== false) {
    parts.push("[STUDENT: add detail] if the application asks a question that was not on the public page.");
  }

  const paragraph = parts.join(" ").replace(/\s+/g, " ").trim();
  return {
    paragraph,
    label: DRAFT_LABEL,
    citations: citationsIn(paragraph),
    pageStatus: input.pageStatus,
  };
}

export function acceptModelDraft(text: string, input: DraftInput): string | null {
  const paragraph = text.replace(/\s+/g, " ").trim();
  if (!paragraph || paragraph.length > 1200 || paragraph.includes("\n")) return null;
  const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length === 0) return null;
  const known = new Set([...input.resumeChunks, ...input.pageExcerpts].map((item) => item.id));
  for (const sentence of sentences) {
    if (!/\[(?:R\d+|P\d+|STUDENT: add detail)\]/.test(sentence)) return null;
    for (const match of sentence.matchAll(/\[(R\d+|P\d+)\]/g)) {
      if (!known.has(match[1])) return null;
    }
  }
  const source = [
    ...input.resumeChunks.map((item) => item.text),
    ...input.pageExcerpts.map((item) => item.text),
    input.pastedPrompt ?? "",
  ].join(" ");
  for (const banned of BANNED_UNLESS_SOURCED) {
    if (paragraph.includes(banned) && !source.includes(banned)) return null;
  }
  return paragraph;
}

export function draftPrompt(input: DraftInput): string {
  const resume = input.resumeChunks.map((item) => `[${item.id}] ${item.text}`).join("\n");
  const pages = input.pageExcerpts.map((item) => `[${item.id}] ${item.text}`).join("\n");
  return [
    "Write one paragraph the student will edit. It is a draft outline, not an application to submit.",
    "Use only the resume excerpts and public-page excerpts below.",
    "Cite a resume fact as [R#] and a page fact as [P#].",
    "If a detail is missing, write [STUDENT: add detail] instead of inventing it.",
    "Do not invent an application prompt. Do not mention Cal State Apply or Slate unless those words are in the sources.",
    "Every sentence must include [R#], [P#], or [STUDENT: add detail].",
    `Mode: ${input.mode}. Program: ${input.programName}. School: ${input.schoolName}.`,
    input.pastedPrompt?.trim() ? `Prompt the student pasted:\n${input.pastedPrompt.trim()}` : "No prompt was pasted.",
    resume ? `Resume excerpts:\n${resume}` : "No resume excerpts.",
    pages ? `Public page excerpts:\n${pages}` : "No public page excerpts.",
  ].join("\n\n");
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177).trim()}...` : clean;
}

function citationsIn(paragraph: string): string[] {
  return [...paragraph.matchAll(/\[(R\d+|P\d+)\]/g)].map((match) => match[1]);
}
