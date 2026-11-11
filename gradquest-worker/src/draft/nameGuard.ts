export type AllowedNames = { faculty: string[]; courses: string[] };

const COURSE = /\b[A-Z]{2,4} ?\d{2,3}[A-Z]?\b/g;
const NAME_WORD = String.raw`\p{Lu}[\p{L}'’-]*`;
const TITLE_NAME = new RegExp(
  String.raw`(?<![\p{L}])(?:Dr\.|Professor)\s+${NAME_WORD}(?:(?:\s+\p{Lu}\.)?\s+${NAME_WORD}){0,3}`,
  "gu",
);
const TWO_WORD = new RegExp(
  String.raw`(?<![\p{L}])${NAME_WORD}\s+${NAME_WORD}(?![\p{L}])`,
  "gu",
);
const NEAR = /\b(?:professor|lab|research)\b/i;
const ABBREV = /^(?:Dr|Mr|Ms|Mrs|Prof|St|vs)\.$/;
const INITIALS = /^(?:[A-Za-z]\.)+$/;

type Span = { start: number; end: number; kind: "faculty" | "course" };

export function guardNames(draft: string, allowed: AllowedNames): { text: string; removed: string[] } {
  const spans = detections(draft);
  let cursor = 0;
  let text = "";
  const removed: string[] = [];
  for (const span of spans) {
    const surface = draft.slice(span.start, span.end);
    if (isAllowed(surface, span.kind, allowed)) continue;
    text += draft.slice(cursor, span.start);
    text += "[STUDENT: add detail]";
    removed.push(surface);
    cursor = span.end;
  }
  text += draft.slice(cursor);
  return { text, removed };
}

function detections(draft: string): Span[] {
  const spans: Span[] = [];
  for (const match of draft.matchAll(TITLE_NAME)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, kind: "faculty" });
  }
  for (const match of draft.matchAll(COURSE)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, kind: "course" });
  }
  const sentences = sentenceRanges(draft);
  for (const match of draft.matchAll(TWO_WORD)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (spans.some((span) => start < span.end && end > span.start)) continue;
    const sentence = sentences.find((range) => start >= range.start && start < range.end);
    const sentenceText = sentence ? draft.slice(sentence.start, sentence.end) : draft;
    if (!NEAR.test(sentenceText)) continue;
    spans.push({ start, end, kind: "faculty" });
  }
  spans.sort((left, right) => left.start - right.start || right.end - left.end);
  const chosen: Span[] = [];
  for (const span of spans) {
    const last = chosen[chosen.length - 1];
    if (last && span.start < last.end) continue;
    chosen.push(span);
  }
  return chosen;
}

function isAllowed(surface: string, kind: Span["kind"], allowed: AllowedNames): boolean {
  if (kind === "course") {
    const key = surface.replace(/ /g, "");
    return allowed.courses.some((course) => course.replace(/ /g, "").includes(key));
  }
  const key = facultyKey(surface);
  return allowed.faculty.some((name) => facultyKey(name) === key);
}

function facultyKey(name: string): string {
  return name
    .replace(/^(?:Dr\.|Professor)\s+/, "")
    .replace(/(?:['’]s)+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "\n") {
      if (index > start) ranges.push({ start, end: index });
      while (index + 1 < text.length && text[index + 1] === "\n") index += 1;
      start = index + 1;
      continue;
    }
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const word = tokenBefore(text, index);
    if (ABBREV.test(word)) continue;
    const next = nextNonSpace(text, index + 1);
    if (INITIALS.test(word) && next && /[a-z]/i.test(next)) continue;
    ranges.push({ start, end: index + 1 });
    let nextIndex = index + 1;
    while (nextIndex < text.length && /[ \t]/.test(text[nextIndex])) nextIndex += 1;
    start = nextIndex;
    index = nextIndex - 1;
  }
  if (start < text.length) ranges.push({ start, end: text.length });
  return ranges;
}

function tokenBefore(text: string, punctIndex: number): string {
  let begin = punctIndex;
  while (begin > 0 && !/\s/.test(text[begin - 1])) begin -= 1;
  return text.slice(begin, punctIndex + 1);
}

function nextNonSpace(text: string, index: number): string {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  return text[cursor] ?? "";
}
