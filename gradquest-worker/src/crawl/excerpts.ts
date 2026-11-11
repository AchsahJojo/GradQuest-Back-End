import { stripHtml } from "./loginWall";

export type Excerpt = { id: string; text: string };

export const PAGE_EXCERPT_LIMIT = 20;

export function excerptsFromHtml(html: string, limit = PAGE_EXCERPT_LIMIT): Excerpt[] {
  const text = stripHtml(html);
  return excerptsFromText(text, "P", limit);
}

export function excerptsFromMarkdown(markdown: string, limit = PAGE_EXCERPT_LIMIT): Excerpt[] {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const lines: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    if (/^\s*\[[^\]]+\]:\s*\S+/.test(rawLine)) continue;
    const withoutImages = rawLine.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
    const linkTexts = [...withoutImages.matchAll(/\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g)].map(
      (match) => match[1],
    );
    const line = withoutImages
      .replace(/\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
      .replace(/^\s*(?:[-*_]\s*){3,}$/, "")
      .replace(/[*_`|]+/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    if (linkTexts.length > 0 && isNavOnly(line, linkTexts)) continue;
    lines.push(line);
  }
  return excerptsFromText(lines.join(" "), "P", limit);
}

function isNavOnly(line: string, linkTexts: string[]): boolean {
  const linked = linkTexts.join(" ").replace(/[*_`]+/g, " ").replace(/\s+/g, " ").trim();
  const rest = line.replace(/[^a-z0-9]/gi, "").length - linked.replace(/[^a-z0-9]/gi, "").length;
  const words = linked.split(" ").filter(Boolean).length;
  return rest <= 2 && words / linkTexts.length <= 4;
}

export function excerptsFromText(text: string, prefix: "P" | "R", limit = 6): Excerpt[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 40) return [];
  const candidates = chunkOnBoundaries(clean, 400)
    .filter((chunk) => chunk.length >= 40)
    .map((chunk) => ({ text: chunk, score: contentScore(chunk) }));
  // Prefer substantive program copy over catalog chrome (Skip to Content, menus, etc.).
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map((item, index) => ({
    id: `${prefix}${index + 1}`,
    text: item.text,
  }));
}

function chunkOnBoundaries(text: string, size: number): string[] {
  const pieces: string[] = [];
  for (const sentence of text.split(/(?<=[.!?]["”')]?)\s+(?=[A-Z0-9"“(])/)) {
    if (sentence.length <= size) {
      pieces.push(sentence);
      continue;
    }
    let line = "";
    for (const word of sentence.split(" ")) {
      if (line && line.length + word.length + 1 > size) {
        pieces.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) pieces.push(line);
  }
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 1 > size) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function contentScore(slice: string): number {
  const lower = slice.toLowerCase();
  let score = 0;
  for (const term of [
    "program",
    "degree",
    "units",
    "course",
    "thesis",
    "admission",
    "graduate",
    "curriculum",
    "requirement",
    "master",
  ]) {
    if (lower.includes(term)) score += 2;
  }
  for (const noise of [
    "skip to content",
    "toggle menu",
    "az index",
    "submit search",
    "catalog home",
    "cookie",
  ]) {
    if (lower.includes(noise)) score -= 3;
  }
  return score;
}
