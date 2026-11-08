export type FactKind = "overview" | "requirement" | "course" | "faculty" | "deadline";
export type PageKind = "overview" | "admissions" | "curriculum" | "faculty" | "deadlines";

export type ProgramFact = {
  id: string;
  kind: FactKind;
  name: string;
  detail: string;
  sourceUrl: string;
  quote: string;
};

export type ProgramResearch = {
  schoolId: number;
  schoolName: string;
  programName: string;
  pages: { kind: PageKind; url: string }[];
  facts: ProgramFact[];
};

const FACT_KINDS = new Set<string>(["overview", "requirement", "course", "faculty", "deadline"]);
const PAGE_KINDS = new Set<string>(["overview", "admissions", "curriculum", "faculty", "deadlines"]);
const MAX_QUOTE = 300;

export function parseProgramResearch(json: unknown): { research: ProgramResearch | null; errors: string[] } {
  const errors: string[] = [];
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { research: null, errors: ["expected an object"] };
  }
  const raw = json as Record<string, unknown>;

  if (typeof raw.schoolId !== "number" || !Number.isFinite(raw.schoolId)) {
    errors.push("schoolId must be a number");
  }
  if (typeof raw.schoolName !== "string" || !raw.schoolName.trim()) {
    errors.push("schoolName is required");
  }
  if (typeof raw.programName !== "string" || !raw.programName.trim()) {
    errors.push("programName is required");
  }

  const pages = parsePages(raw.pages, errors);
  const facts = parseFacts(raw.facts, errors);

  if (errors.length > 0) return { research: null, errors };
  return {
    research: {
      schoolId: raw.schoolId as number,
      schoolName: (raw.schoolName as string).trim(),
      programName: (raw.programName as string).trim(),
      pages,
      facts,
    },
    errors,
  };
}

function parsePages(value: unknown, errors: string[]): { kind: PageKind; url: string }[] {
  if (!Array.isArray(value)) {
    errors.push("pages must be an array");
    return [];
  }
  const pages: { kind: PageKind; url: string }[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`pages[${i}] must be an object`);
      continue;
    }
    const page = item as Record<string, unknown>;
    const before = errors.length;
    if (typeof page.kind !== "string" || !PAGE_KINDS.has(page.kind)) {
      errors.push(`pages[${i}].kind is unknown`);
    }
    if (typeof page.url !== "string" || !page.url.trim()) {
      errors.push(`pages[${i}] is missing url`);
    } else if (!isHttpsUrl(page.url)) {
      errors.push(`pages[${i}].url must be https`);
    }
    if (errors.length === before) {
      pages.push({ kind: page.kind as PageKind, url: page.url as string });
    }
  }
  return pages;
}

function parseFacts(value: unknown, errors: string[]): ProgramFact[] {
  if (!Array.isArray(value)) {
    errors.push("facts must be an array");
    return [];
  }
  const facts: ProgramFact[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`facts[${i}] must be an object`);
      continue;
    }
    const fact = item as Record<string, unknown>;
    const before = errors.length;

    if (typeof fact.id !== "string" || !fact.id.trim()) {
      errors.push(`facts[${i}] is missing id`);
    } else if (seenIds.has(fact.id)) {
      errors.push(`duplicate fact id: ${fact.id}`);
    } else {
      seenIds.add(fact.id);
    }

    if (typeof fact.kind !== "string" || !FACT_KINDS.has(fact.kind)) {
      errors.push(`facts[${i}].kind is unknown`);
    }
    if (typeof fact.name !== "string" || !fact.name.trim()) {
      errors.push(`facts[${i}] is missing name`);
    }
    if (typeof fact.detail !== "string") {
      errors.push(`facts[${i}].detail must be a string`);
    }
    if (typeof fact.sourceUrl !== "string" || !fact.sourceUrl.trim()) {
      errors.push(`facts[${i}] is missing sourceUrl`);
    } else if (!isHttpsUrl(fact.sourceUrl)) {
      errors.push(`facts[${i}].sourceUrl must be https`);
    }

    if (typeof fact.quote !== "string" || !fact.quote.trim()) {
      errors.push(`facts[${i}].quote is empty`);
    } else if (fact.quote.length > MAX_QUOTE) {
      errors.push(`facts[${i}].quote exceeds 300 characters`);
    }

    if (errors.length === before) {
      facts.push({
        id: fact.id as string,
        kind: fact.kind as FactKind,
        name: fact.name as string,
        detail: fact.detail as string,
        sourceUrl: fact.sourceUrl as string,
        quote: fact.quote as string,
      });
    }
  }
  return facts;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
