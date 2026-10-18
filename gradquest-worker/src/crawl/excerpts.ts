import { stripHtml } from "./loginWall";

export type Excerpt = { id: string; text: string };

export function excerptsFromHtml(html: string, limit = 6): Excerpt[] {
  const text = stripHtml(html);
  return excerptsFromText(text, "P", limit);
}

export function excerptsFromText(text: string, prefix: "P" | "R", limit = 6): Excerpt[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 40) return [];
  const excerpts: Excerpt[] = [];
  const size = 400;
  for (let i = 0; i < clean.length && excerpts.length < limit; i += size) {
    const slice = clean.slice(i, i + size).trim();
    if (slice.length < 40) continue;
    excerpts.push({ id: `${prefix}${excerpts.length + 1}`, text: slice });
  }
  return excerpts;
}
