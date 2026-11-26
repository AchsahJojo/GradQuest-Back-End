/** Drop résumé contact/header lines so overlap quotes stay on real experience. */

const EMAIL =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;
const PROFILE_URL =
  /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com)\/\S+/i;
const CONTACT_LABEL =
  /^(?:e-?mail|phone|tel(?:ephone)?|mobile|linkedin|github|website|portfolio|address|location)\s*:/i;
const INTERESTS_LABEL = /^interests?\s*:/i;
const ACCOMPLISHMENT_VERB =
  /\b(?:built|build|building|developed|develop|designed|design|implemented|implement|created|create|wrote|write|writing|trained|train|studied|study|completed|complete|led|lead|leading|founded|found|deployed|deploy|diagnosed|diagnose|conducted|conduct|supported|support|taught|teach|teaching|tested|test|authored|author|collaborated|collaborate|measured|measure|prototyped|prototype|analyzed|analyze|improved|improve|managed|manage|worked|work|researched|research|presented|present|interned|intern|reduced|reduce|corrected|correct|founded|attracting|increasing)\b/i;

export function scrubContactTokens(text: string): string {
  return text
    .replace(
      /\b(?:e-?mail|phone|tel(?:ephone)?|mobile|linkedin|github|website|portfolio)\s*:\s*\S+/gi,
      " ",
    )
    .replace(EMAIL, " ")
    .replace(PROFILE_URL, " ")
    .replace(PHONE, " ")
    .replace(/\bInterests?\s*:/gi, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isResumeHeaderNoise(sentence: string): boolean {
  const text = sentence.replace(/\s+/g, " ").trim();
  if (!text) return true;

  if (CONTACT_LABEL.test(text)) return true;
  if (INTERESTS_LABEL.test(text) && !ACCOMPLISHMENT_VERB.test(text)) return true;
  if (EMAIL.test(text)) return true;

  const scrubbed = scrubContactTokens(text);
  if (!scrubbed || scrubbed.split(/\s+/).filter(Boolean).length < 4) return true;

  if (!ACCOMPLISHMENT_VERB.test(scrubbed)) {
    if (PROFILE_URL.test(text) || PHONE.test(text)) return true;
    if (looksLikeNameOrCandidateHeader(scrubbed)) return true;
  }

  return false;
}

function looksLikeNameOrCandidateHeader(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8) return false;
  if (/\bcandidate\b/i.test(text)) return true;
  // Title-case name / city line with no digits or project punctuation.
  const titleish = words.every((word) => /^[A-Z][A-Za-z.'-]*$/.test(word) || /,$/.test(word));
  return titleish;
}

/** Remove contact/header lines before chunking so they do not glue onto experience sentences. */
export function stripResumeHeaderLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isResumeHeaderNoise(line))
    .join("\n");
}
