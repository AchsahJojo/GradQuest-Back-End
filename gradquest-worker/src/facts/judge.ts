import type { Pair } from "./match";

export type JudgedPair = Pair & { reason: string };

const JUDGE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const JUDGE_SYSTEM =
  "A pair is yes only when both sides share a concrete topic or method. The reply is only a JSON array of {pairId, verdict, reason}.";

export function judgePrompt(pairs: Pair[]): string {
  const lines = [
    "A pair is yes only when both sides share a concrete topic or method.",
    "Reply with only a JSON array of {pairId, verdict, reason}.",
    "",
  ];
  for (const pair of pairs) {
    lines.push(
      `pairId: ${pair.pairId}`,
      `résumé: ${pair.resume.text}`,
      `fact: ${pair.fact.name}`,
      `detail: ${pair.fact.detail}`,
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

export function parseJudgement(text: string, pairs: Pair[]): JudgedPair[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const byId = new Map(pairs.map((pair) => [pair.pairId, pair]));
  const seen = new Set<string>();
  const kept: JudgedPair[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const record = row as { pairId?: unknown; verdict?: unknown; reason?: unknown };
    if (typeof record.pairId !== "string" || seen.has(record.pairId)) continue;
    const pair = byId.get(record.pairId);
    if (!pair) continue;
    if (typeof record.verdict !== "string" || record.verdict.trim().toLowerCase() !== "yes") continue;
    if (typeof record.reason !== "string") continue;
    const reason = record.reason.trim();
    if (!reason) continue;
    seen.add(record.pairId);
    kept.push({ ...pair, reason });
  }
  return kept;
}

export async function judgePairs(ai: Env["AI"], pairs: Pair[]): Promise<JudgedPair[]> {
  if (pairs.length === 0) return [];
  let result: unknown;
  try {
    result = await ai.run(JUDGE_MODEL, {
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: judgePrompt(pairs) },
      ],
      max_tokens: 800,
    });
  } catch {
    return fallback(pairs);
  }
  const text = textFromModel(result);
  if (!text) return fallback(pairs);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fallback(pairs);
  }
  if (!Array.isArray(parsed)) return fallback(pairs);
  return parseJudgement(text, pairs);
}

function fallback(pairs: Pair[]): JudgedPair[] {
  console.log(JSON.stringify({ event: "sop_judge_fallback" }));
  return pairs.map((pair) => ({ ...pair, reason: "" }));
}

function textFromModel(result: unknown): string | null {
  if (typeof result === "string") return result.trim() ? result : null;
  if (!result || typeof result !== "object") return null;
  const record = result as {
    response?: unknown;
    result?: { response?: unknown } | string;
    output_text?: unknown;
    text?: unknown;
  };
  const candidates = [
    record.response,
    record.output_text,
    record.text,
    typeof record.result === "string" ? record.result : record.result?.response,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}
