import { excerptsFromText, type Excerpt } from "../crawl/excerpts";

const MAX_TEXT = 50_000;

export async function resumeToChunks(input: {
  filename?: string;
  mediaType?: string;
  text?: string;
  bytes?: Uint8Array;
}): Promise<Excerpt[]> {
  const text = await resumeText(input);
  return excerptsFromText(text.slice(0, MAX_TEXT), "R", 8);
}

async function resumeText(input: {
  filename?: string;
  mediaType?: string;
  text?: string;
  bytes?: Uint8Array;
}): Promise<string> {
  if (input.text && input.text.trim()) return input.text;
  const bytes = input.bytes;
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("Upload a PDF or plain-text resume.");
  }
  const name = (input.filename ?? "").toLowerCase();
  const type = (input.mediaType ?? "").toLowerCase();
  const pdf = type.includes("pdf") || name.endsWith(".pdf") || isPdf(bytes);
  if (type.includes("text") || name.endsWith(".txt") || (!pdf && looksLikeText(bytes))) {
    return new TextDecoder().decode(bytes);
  }
  if (!pdf) throw new Error("Upload a PDF or plain-text resume.");
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdfDoc = await getDocumentProxy(bytes);
    const extracted = await extractText(pdfDoc, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text ?? "");
    if (!text.trim()) throw new Error("empty");
    return text;
  } catch {
    throw new Error("Could not read text from this PDF. Paste the resume text instead.");
  }
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, 200);
  return !sample.some((byte) => byte === 0);
}
