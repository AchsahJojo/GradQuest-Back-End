import type { Excerpt } from "./excerpts";

export const PAGE_TTL_DAYS = 7;
export const STALE_MAX_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CachedPage = {
  excerpts: Excerpt[];
  source: string;
  fetchedAt: string;
  expiresAt: string;
};

export interface PageCache {
  get(url: string): Promise<CachedPage | null>;
  put(url: string, page: { excerpts: Excerpt[]; source: string; fetchedAt: string }): Promise<void>;
}

export function expiresAtFor(fetchedAt: string): string {
  return new Date(new Date(fetchedAt).getTime() + PAGE_TTL_DAYS * DAY_MS).toISOString();
}

export function isFresh(cached: CachedPage, now: Date): boolean {
  return now.getTime() < new Date(cached.expiresAt).getTime();
}

export function isStaleUsable(cached: CachedPage, now: Date): boolean {
  return now.getTime() - new Date(cached.fetchedAt).getTime() < STALE_MAX_DAYS * DAY_MS;
}

export class D1PageCache implements PageCache {
  constructor(private readonly db: D1Database) {}

  async get(url: string): Promise<CachedPage | null> {
    try {
      const row = await this.db
        .prepare("SELECT excerpts_json, source, fetched_at, expires_at FROM page_cache WHERE url = ?")
        .bind(url)
        .first<{ excerpts_json: string; source: string; fetched_at: string; expires_at: string }>();
      if (!row) return null;
      const excerpts = JSON.parse(row.excerpts_json) as Excerpt[];
      if (!Array.isArray(excerpts) || excerpts.length === 0) return null;
      return {
        excerpts,
        source: row.source,
        fetchedAt: row.fetched_at,
        expiresAt: row.expires_at,
      };
    } catch (error) {
      logCacheError("get", error);
      return null;
    }
  }

  async put(url: string, page: { excerpts: Excerpt[]; source: string; fetchedAt: string }): Promise<void> {
    if (page.excerpts.length === 0) return;
    try {
      await this.db
        .prepare(
          "INSERT OR REPLACE INTO page_cache (url, excerpts_json, source, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(url, JSON.stringify(page.excerpts), page.source, page.fetchedAt, expiresAtFor(page.fetchedAt))
        .run();
    } catch (error) {
      logCacheError("put", error);
    }
  }
}

function logCacheError(op: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event: "sop_cache_error",
      op,
      message: error instanceof Error ? error.message : "failed",
    }),
  );
}
