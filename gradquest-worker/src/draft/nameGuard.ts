export type AllowedNames = { faculty: string[]; courses: string[] };

export type NameRoster = { faculty: string[]; courses: string[] };

const COURSE = String.raw`\b[A-Z]{2,4} ?\d{2,3}[A-Z]?\b`;
const EMPTY_ROSTER: NameRoster = { faculty: [], courses: [] };

type Span = { start: number; end: number };

export function guardNames(
  draft: string,
  allowed: AllowedNames,
  roster: NameRoster = EMPTY_ROSTER,
): { text: string; removed: string[] } {
  const protectedSpans = phraseSpans(draft, [...roster.courses, ...allowed.courses]);
  const allowedFaculty = new Set(allowed.faculty.map(facultyKey));
  const spans: Span[] = [];
  for (const name of roster.faculty) {
    const phrase = facultyKey(name);
    if (!phrase || allowedFaculty.has(phrase)) continue;
    for (const span of facultySpans(draft, phrase)) {
      if (overlaps(span, protectedSpans)) continue;
      spans.push(span);
    }
  }
  for (const match of draft.matchAll(new RegExp(COURSE, "g"))) {
    if (match.index === undefined) continue;
    const span = { start: match.index, end: match.index + match[0].length };
    if (isAllowedCourse(match[0], allowed) || overlaps(span, protectedSpans)) continue;
    spans.push(span);
  }
  spans.sort((left, right) => left.start - right.start || right.end - left.end);
  const chosen: Span[] = [];
  for (const span of spans) {
    const last = chosen[chosen.length - 1];
    if (last && span.start < last.end) continue;
    chosen.push(span);
  }

  let cursor = 0;
  let text = "";
  const removed: string[] = [];
  for (const span of chosen) {
    text += draft.slice(cursor, span.start);
    text += "[STUDENT: add detail]";
    removed.push(draft.slice(span.start, span.end));
    cursor = span.end;
  }
  text += draft.slice(cursor);
  return { text, removed };
}

export function rosterFromSnapshot(json: string | undefined): NameRoster {
  if (!json) return { faculty: [], courses: [] };
  try {
    const parsed = JSON.parse(json) as { facts?: unknown };
    if (!Array.isArray(parsed.facts)) return { faculty: [], courses: [] };
    const faculty: string[] = [];
    const courses: string[] = [];
    for (const fact of parsed.facts) {
      if (!fact || typeof fact !== "object") continue;
      const row = fact as { kind?: unknown; name?: unknown };
      if (typeof row.name !== "string" || !row.name.trim()) continue;
      if (row.kind === "faculty") faculty.push(row.name.trim());
      else if (row.kind === "course") courses.push(row.name.trim());
    }
    return { faculty, courses };
  } catch {
    return { faculty: [], courses: [] };
  }
}

function phraseSpans(draft: string, phrases: string[]): Span[] {
  const spans: Span[] = [];
  for (const phrase of phrases) {
    const body = phraseBody(phrase);
    if (!body) continue;
    const pattern = new RegExp(String.raw`(?<![\p{L}\p{N}])${body}(?![\p{L}\p{N}])`, "gu");
    for (const match of draft.matchAll(pattern)) {
      if (match.index === undefined) continue;
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return spans;
}

function facultySpans(draft: string, name: string): Span[] {
  const body = phraseBody(name);
  if (!body) return [];
  const pattern = new RegExp(
    String.raw`(?<![\p{L}])(?:(?:Dr\.|Professor)\s+)?${body}(?:['’]s)?(?![\p{L}])`,
    "gu",
  );
  const spans: Span[] = [];
  for (const match of draft.matchAll(pattern)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function phraseBody(phrase: string): string {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.map(escapeRegExp).join(String.raw`\s+`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function overlaps(span: Span, ranges: Span[]): boolean {
  return ranges.some((range) => span.start < range.end && span.end > range.start);
}

function isAllowedCourse(surface: string, allowed: AllowedNames): boolean {
  const key = surface.replace(/ /g, "");
  return allowed.courses.some((course) => course.replace(/ /g, "").includes(key));
}

function facultyKey(name: string): string {
  return name
    .replace(/^(?:Dr\.|Professor)\s+/, "")
    .replace(/(?:['’]s)+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}
