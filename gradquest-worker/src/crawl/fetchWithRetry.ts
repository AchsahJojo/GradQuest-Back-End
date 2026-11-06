export type RetryOptions = {
  tries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  deadline?: number;
  clock?: () => number;
};

export type RetryResult = { response: Response; attempts: number };

export class FetchRetryError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly outOfTime = false,
  ) {
    super(message);
  }
}

const BACKOFF_MS = [500, 1500];
const MAX_RETRY_AFTER_MS = 3000;
export const MIN_ATTEMPT_MS = 1000;

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<RetryResult> {
  const tries = options.tries ?? 3;
  const timeoutMs = options.timeoutMs ?? 6000;
  const sleep = options.sleep ?? defaultSleep;
  const clock = options.clock ?? Date.now;
  const remaining = () => (options.deadline ?? Infinity) - clock();
  let lastError = "fetch failed";
  let attempts = 0;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    if (remaining() < MIN_ATTEMPT_MS) {
      throw new FetchRetryError("time budget spent", attempts, true);
    }
    attempts = attempt;
    let waitMs = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
    let response: Response | null = null;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(Math.min(timeoutMs, remaining())),
      });
      if (!isRetryableStatus(response.status) || attempt === tries) {
        return { response, attempts: attempt };
      }
      const retryAfter = retryAfterMs(response.headers.get("Retry-After"));
      if (retryAfter !== null) waitMs = Math.min(retryAfter, MAX_RETRY_AFTER_MS);
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "fetch failed";
      if (attempt === tries) break;
    }
    if (remaining() - waitMs < MIN_ATTEMPT_MS) {
      if (response) return { response, attempts: attempt };
      throw new FetchRetryError(lastError, attempt, true);
    }
    response?.body?.cancel().catch(() => {});
    await sleep(waitMs);
  }
  throw new FetchRetryError(lastError, attempts);
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
