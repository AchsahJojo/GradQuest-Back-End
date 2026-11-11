export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
};

export function precisionRecall(
  pairs: { score: number; related: boolean }[],
  threshold: number,
): { precision: number | null; recall: number | null } {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  for (const pair of pairs) {
    const predicted = pair.score >= threshold;
    if (predicted && pair.related) truePositives += 1;
    else if (predicted && !pair.related) falsePositives += 1;
    else if (!predicted && pair.related) falseNegatives += 1;
  }
  return {
    precision: truePositives + falsePositives === 0 ? null : truePositives / (truePositives + falsePositives),
    recall: truePositives + falseNegatives === 0 ? null : truePositives / (truePositives + falseNegatives),
  };
}

export function citationShare(
  paragraph: string,
  kept: number,
  weak: boolean,
): { share: string; unmapped: number; maps: boolean } {
  const unfilled = [...paragraph.matchAll(/\[P#\]/g)].length;
  const numbers = [...paragraph.matchAll(/\[P(\d+)\]/g)].map((match) => Number(match[1]));
  const total = numbers.length + unfilled;
  if (total === 0) return { share: "n/a", unmapped: 0, maps: weak };
  const mapped = numbers.filter((number) => number >= 1 && number <= kept).length;
  const unmapped = total - mapped;
  return {
    share: `${(mapped / total).toFixed(3)} (${mapped}/${total})`,
    unmapped,
    maps: unmapped === 0,
  };
}

export function readTokenUsage(result: unknown): TokenUsage {
  if (!result || typeof result !== "object") return { promptTokens: 0, completionTokens: 0 };
  const usage = (result as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return { promptTokens: 0, completionTokens: 0 };
  const record = usage as Record<string, unknown>;
  return {
    promptTokens: finiteNumber(record.prompt_tokens ?? record.promptTokens),
    completionTokens: finiteNumber(record.completion_tokens ?? record.completionTokens),
  };
}

export function trackAiUsage(ai: Env["AI"]): { ai: Env["AI"]; snapshot: () => TokenUsage } {
  const totals: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  const run = ai.run.bind(ai) as (model: string, input: unknown) => Promise<unknown>;
  const wrappedRun = async (model: string, input: unknown) => {
    const result = await run(model, input);
    const usage = readTokenUsage(result);
    totals.promptTokens += usage.promptTokens;
    totals.completionTokens += usage.completionTokens;
    return result;
  };
  const wrapped = new Proxy(ai, {
    get(target, prop, receiver) {
      if (prop === "run") return wrappedRun;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return {
    ai: wrapped as Env["AI"],
    snapshot: () => ({ ...totals }),
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
