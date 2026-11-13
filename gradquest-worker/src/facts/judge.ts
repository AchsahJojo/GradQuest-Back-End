import type { Pair } from "./match";

export type JudgedPair = Pair & { reason: string };

const JUDGE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const JUDGE_SYSTEM =
  "A pair is yes only when both sides share a concrete topic or method. Reply with only a JSON array of {pairId, verdict, reason}. Each verdict is exactly yes or no.";

export function judgePrompt(pairs: Pair[]): string {
  const lines = [
    "A pair is yes only when both sides share a concrete topic or method.",
    "Reply with only a JSON array of {pairId, verdict, reason}.",
    "Each verdict is exactly yes or no.",
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
    parsed = JSON.parse(unwrapVerdict(text));
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
  const result = await ai.run(JUDGE_MODEL, {
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: judgePrompt(pairs) },
    ],
    max_tokens: 800,
    temperature: 0,
  });
  const text = textFromModel(result);
  const unwrapped = text ? unwrapVerdict(text) : "";
  let parsed: unknown;
  try {
    parsed = unwrapped ? JSON.parse(unwrapped) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!Array.isArray(parsed)) {
    console.log(JSON.stringify({ event: "sop_judge_unusable", response: result }));
    return [];
  }
  return parseJudgement(unwrapped, pairs);
}

function unwrapVerdict(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?[ \t]*\r?\n?([\s\S]*?)```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

function textFromModel(result: unknown): string | null {
  if (typeof result === "string") return result.trim() ? result : null;
  if (!result || typeof result !== "object") return null;
  const record = result as {
    response?: unknown;
    result?: { response?: unknown } | string;
    output_text?: unknown;
    text?: unknown;
    choices?: { message?: { content?: unknown } }[];
  };
  const choice = record.choices?.[0]?.message?.content;
  const candidates = [
    record.response,
    choice,
    record.output_text,
    record.text,
    typeof record.result === "string" ? record.result : record.result?.response,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (Array.isArray(candidate)) return JSON.stringify(candidate);
  }
  return null;
}
