import type { JudgedPair } from "../facts/judge";
import { MIN_STRONG_PAIRS, isThinFaculty } from "../facts/match";
import type { FactKind } from "../facts/schema";

const FACT_KINDS = new Set<string>(["overview", "requirement", "course", "faculty", "deadline"]);

function weakDraft(): { pairs: JudgedPair[]; weak: boolean } {
  return { pairs: [], weak: true };
}

type StoredPair = {
  pairId: string;
  resumeText: string;
  resumeId: string;
  factKind: FactKind;
  factName: string;
  factDetail: string;
  sourceUrl: string;
  reason: string;
  researchVerified: boolean;
};

export function keptPairsForDraft(
  reportJson: string | null | undefined,
  pairIds: readonly string[] | undefined,
): { pairs: JudgedPair[]; weak: boolean } {
  if (!reportJson || !Array.isArray(pairIds)) return weakDraft();
  let parsed: unknown;
  try {
    parsed = JSON.parse(reportJson);
  } catch {
    return weakDraft();
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { pairs?: unknown }).pairs)) {
    return weakDraft();
  }

  const byId = new Map<string, StoredPair>();
  for (const row of (parsed as { pairs: unknown[] }).pairs) {
    const view = storedPair(row);
    if (!view || byId.has(view.pairId)) continue;
    byId.set(view.pairId, view);
  }

  const pairs: JudgedPair[] = [];
  const seen = new Set<string>();
  for (const pairId of pairIds) {
    if (typeof pairId !== "string" || seen.has(pairId)) continue;
    const view = byId.get(pairId);
    if (!view) continue;
    seen.add(pairId);
    pairs.push({
      pairId: view.pairId,
      resume: { id: view.resumeId, text: view.resumeText },
      fact: {
        id: view.pairId,
        kind: view.factKind,
        name: view.factName,
        detail: view.factDetail,
        sourceUrl: view.sourceUrl,
        quote: "",
      },
      score: 0,
      reason: view.reason,
    });
  }

  const strong = pairs.filter((pair) => {
    if (pair.fact.kind === "course") return true;
    if (pair.fact.kind !== "faculty") return false;
    const stored = byId.get(pair.pairId);
    if (stored) return stored.researchVerified;
    return !isThinFaculty(pair.fact);
  });
  if (strong.length < MIN_STRONG_PAIRS) return weakDraft();
  return { pairs, weak: false };
}

function storedPair(value: unknown): StoredPair | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.pairId !== "string" || typeof row.resumeText !== "string") return null;
  if (typeof row.factKind !== "string" || !FACT_KINDS.has(row.factKind)) return null;
  if (typeof row.factName !== "string" || typeof row.factDetail !== "string") return null;
  if (typeof row.sourceUrl !== "string" || typeof row.reason !== "string") return null;
  const researchVerified =
    typeof row.researchVerified === "boolean"
      ? row.researchVerified
      : row.factKind !== "faculty" || !isThinFaculty({
          id: row.pairId,
          kind: "faculty",
          name: row.factName,
          detail: row.factDetail,
          sourceUrl: row.sourceUrl,
          quote: "",
        });
  const resumeQuoteIds = Array.isArray(row.resumeQuoteIds)
    ? row.resumeQuoteIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
    : [];
  const resumeId = resumeQuoteIds[0] ?? "";
  const resumeText =
    typeof row.resumeText === "string"
      ? row.resumeText
      : Array.isArray(row.resumeQuotes)
        ? row.resumeQuotes.filter((q): q is string => typeof q === "string").join("\n")
        : "";
  return {
    pairId: row.pairId,
    resumeText,
    resumeId,
    factKind: row.factKind as FactKind,
    factName: row.factName,
    factDetail: row.factDetail,
    sourceUrl: row.sourceUrl,
    reason: row.reason,
    researchVerified,
  };
}
