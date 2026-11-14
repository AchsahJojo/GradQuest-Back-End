import type { AgentSql } from "./programRead";

export type ResumeDeleteState = {
  resumeReady: boolean;
  chunkCount: number;
  pageStatus: string;
};

export type ResumeDeleteResult = { deleted: true } | { deleted: false; failed: string[] };

type Statement = {
  bind: (...args: unknown[]) => { run: () => Promise<unknown> };
};

type D1Like = {
  prepare: (query: string) => Statement;
};

type ListedObjects = {
  objects: { key: string }[];
  truncated?: boolean;
  cursor?: string;
};

type R2Like = {
  list: (options: { prefix: string; cursor?: string }) => Promise<ListedObjects>;
  delete: (keys: string[]) => Promise<unknown>;
};

type VectorizeLike = {
  deleteByIds: (ids: string[]) => Promise<unknown>;
};

export async function deleteStoredResume(input: {
  userId: string;
  readChunkIds: () => string[];
  sql: AgentSql;
  getState: () => ResumeDeleteState;
  setState: (next: ResumeDeleteState) => void;
  db: D1Like | undefined;
  resumes: R2Like | undefined;
  vectorize: VectorizeLike | undefined;
}): Promise<ResumeDeleteResult> {
  const failed: string[] = [];

  let chunkIds: string[] = [];
  let readFailed = false;
  try {
    chunkIds = input.readChunkIds();
  } catch {
    readFailed = true;
  }

  try {
    if (readFailed) throw new Error("chunk ids were not collected");
    if (!input.vectorize) throw new Error("vectorize is not bound");
    if (chunkIds.length > 0) {
      await input.vectorize.deleteByIds(chunkIds.map((id) => `${input.userId}:${id}`));
    }
  } catch {
    failed.push("vectorize");
  }

  try {
    input.sql`DELETE FROM resume_chunks`;
    input.sql`DELETE FROM overlap_reads`;
    input.sql`DELETE FROM draft_turns`;
    const current = input.getState();
    input.setState({ ...current, resumeReady: false, chunkCount: 0 });
  } catch {
    failed.push("durable_object");
  }

  try {
    if (!input.db) throw new Error("d1 is not bound");
    await input.db.prepare("DELETE FROM resume_chunks WHERE user_id = ?").bind(input.userId).run();
  } catch {
    failed.push("d1");
  }

  try {
    if (!input.resumes) throw new Error("r2 is not bound");
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const listed = await input.resumes.list({ prefix: `resumes/${input.userId}/`, cursor });
      for (const object of listed.objects) keys.push(object.key);
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    if (keys.length > 0) await input.resumes.delete(keys);
  } catch {
    failed.push("r2");
  }

  if (failed.length > 0) return { deleted: false, failed };
  return { deleted: true };
}
