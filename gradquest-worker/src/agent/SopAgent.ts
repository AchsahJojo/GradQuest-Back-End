import { Agent } from "agents";
import { isAllowlisted } from "../allowlist";
import { excerptsFromText, type Excerpt } from "../crawl/excerpts";
import { browserMarkdown } from "../crawl/markdown";
import { resolveOverlap, storedMatchingError } from "./overlapRead";
import { deleteStoredResume } from "./resumeDelete";
import { resolveProgramRead } from "./programRead";
import { keptPairsForDraft } from "../draft/keptPairs";
import { guardNames, rosterFromSnapshot } from "../draft/nameGuard";
import {
  forOutsideApplicants,
  pickOpeningFact,
  scaffoldOutline,
  stripUnfilledProgramCitations,
  type DraftInput,
  type DraftMode,
} from "../draft/opening";
import { resumeToChunks } from "../resume/text";
import { trackAiUsage } from "../facts/evalMetrics";

export type SopState = {
  resumeReady: boolean;
  chunkCount: number;
  pageStatus: string;
};

type ProgramBody = {
  userId?: string;
  schoolId?: number | string;
  schoolName?: string;
  programName?: string;
  url?: string;
  mode?: string;
  pastedPrompt?: string;
  sopRequired?: boolean | null;
  filename?: string;
  mediaType?: string;
  text?: string;
  bytesBase64?: string;
  pairIds?: string[];
};

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export class SopAgent extends Agent<Env, SopState> {
  initialState: SopState = {
    resumeReady: false,
    chunkCount: 0,
    pageStatus: "none",
  };

  onStart() {
    this
      .sql`CREATE TABLE IF NOT EXISTS resume_chunks (id TEXT PRIMARY KEY, text TEXT NOT NULL)`;
    this
      .sql`CREATE TABLE IF NOT EXISTS page_reads (school_id TEXT PRIMARY KEY, status TEXT NOT NULL, excerpts_json TEXT NOT NULL)`;
    this
      .sql`CREATE TABLE IF NOT EXISTS draft_turns (school_id TEXT PRIMARY KEY, turn INTEGER NOT NULL)`;
    this
      .sql`CREATE TABLE IF NOT EXISTS snapshot_reads (school_id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL)`;
    this
      .sql`CREATE TABLE IF NOT EXISTS overlap_reads (school_id TEXT PRIMARY KEY, report_json TEXT NOT NULL)`;
  }

  private nextDraftTurn(schoolId: string): number {
    const rows = this.sql<{ turn: number }>`
      SELECT turn FROM draft_turns WHERE school_id = ${schoolId}
    `;
    const turn = rows[0]?.turn ?? 0;
    this
      .sql`INSERT OR REPLACE INTO draft_turns (school_id, turn) VALUES (${schoolId}, ${turn + 1})`;
    return turn;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let body: ProgramBody;
    try {
      body = (await request.json()) as ProgramBody;
    } catch {
      return Response.json({ error: "Expected JSON" }, { status: 400 });
    }
    if (url.pathname.endsWith("/resume/delete")) return this.deleteResume(body);
    if (url.pathname.endsWith("/resume")) return this.storeResume(body);
    if (url.pathname.endsWith("/programs")) return this.readProgram(body);
    if (url.pathname.endsWith("/overlap")) return this.overlap(body);
    if (url.pathname.endsWith("/draft")) return this.writeDraft(body);
    return new Response("Not found", { status: 404 });
  }

  private async deleteResume(body: ProgramBody): Promise<Response> {
    const userId = String(body.userId ?? "").trim();
    if (!userId) {
      return Response.json({ deleted: false, failed: ["user"] }, { status: 400 });
    }
    const result = await deleteStoredResume({
      userId,
      readChunkIds: () =>
        this.sql<{ id: string }>`SELECT id FROM resume_chunks`.map((row) => row.id),
      sql: (strings, ...values) => this.sql(strings, ...values),
      getState: () => this.state,
      setState: (next) => {
        this.setState(next);
      },
      db: this.env.DB,
      resumes: this.env.RESUMES,
      vectorize: this.env.VECTORIZE,
    });
    return Response.json(result);
  }

  private async storeResume(body: ProgramBody): Promise<Response> {
    let bytes: Uint8Array | undefined;
    if (body.bytesBase64) {
      bytes = decodeBase64(body.bytesBase64);
      if (bytes.byteLength > MAX_RESUME_BYTES) {
        return Response.json(
          { error: "Resume must be 5 MB or smaller" },
          { status: 400 },
        );
      }
    }
    let chunks: Excerpt[];
    try {
      chunks = await resumeToChunks({
        filename: body.filename,
        mediaType: body.mediaType,
        text: body.text,
        bytes,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read the resume";
      return Response.json({ error: message }, { status: 400 });
    }
    if (chunks.length === 0) {
      return Response.json(
        { error: "No readable resume text" },
        { status: 400 },
      );
    }

    this.sql`DELETE FROM resume_chunks`;
    for (const chunk of chunks) {
      this
        .sql`INSERT INTO resume_chunks (id, text) VALUES (${chunk.id}, ${chunk.text})`;
    }
    await this.persistResume(body, chunks, bytes);
    this.setState({
      ...this.state,
      resumeReady: true,
      chunkCount: chunks.length,
    });
    console.log(
      JSON.stringify({
        event: "sop_resume",
        chunks: chunks.length,
        schoolId: body.schoolId ?? null,
      }),
    );
    return Response.json({ stored: true, chunks: chunks.length });
  }

  private async readProgram(body: ProgramBody): Promise<Response> {
    const outcome = await resolveProgramRead({
      body,
      db: this.env.DB,
      sql: (strings, ...values) => this.sql(strings, ...values),
      markdown: this.env.BROWSER ? browserMarkdown(this.env.BROWSER) : undefined,
      setPageStatus: (pageStatus) => {
        this.setState({ ...this.state, pageStatus });
      },
      persistPage: (schoolId, text) => this.persistPage(schoolId, text),
    });
    return Response.json(outcome.response);
  }

  private async overlap(body: ProgramBody): Promise<Response> {
    const tracked = trackAiUsage(this.env.AI);
    const result = await resolveOverlap({
      schoolId: String(body.schoolId ?? ""),
      sql: (strings, ...values) => this.sql(strings, ...values),
      db: this.env.DB,
      ai: tracked.ai,
    });
    return Response.json({ ...result.body, usage: tracked.snapshot() }, { status: result.status });
  }

  private async writeDraft(body: ProgramBody): Promise<Response> {
    const mode: DraftMode =
      body.mode === "motivation" ? "motivation" : "opening";
    const schoolId = String(body.schoolId ?? "");
    const pageRows = this.sql<{ status: string; excerpts_json: string }>`
      SELECT status, excerpts_json FROM page_reads WHERE school_id = ${schoolId}
    `;
    const resumeRows = this.sql<{
      id: string;
      text: string;
    }>`SELECT id, text FROM resume_chunks`;
    const page = pageRows[0];
    const resumeChunks = resumeRows.map((row) => ({ id: row.id, text: row.text }));
    const overlapRows = this.sql<{ report_json: string }>`
      SELECT report_json FROM overlap_reads WHERE school_id = ${schoolId}
    `;
    const matchingError = storedMatchingError(overlapRows[0]?.report_json);
    if (matchingError) {
      return Response.json({ error: matchingError }, { status: 503 });
    }
    const snapshotRows = this.sql<{ snapshot_json: string }>`
      SELECT snapshot_json FROM snapshot_reads WHERE school_id = ${schoolId}
    `;
    const roster = rosterFromSnapshot(snapshotRows[0]?.snapshot_json);
    const selected = keptPairsForDraft(overlapRows[0]?.report_json, body.pairIds);
    const input: DraftInput = {
      mode,
      schoolName: body.schoolName ?? "",
      programName: body.programName ?? "",
      sopRequired: body.sopRequired ?? null,
      pageStatus:
        page?.status ??
        (body.url && isAllowlisted(body.url) ? "error" : "not_allowlisted"),
      resumeChunks,
      pageExcerpts: forOutsideApplicants(parseExcerpts(page?.excerpts_json)),
      pastedPrompt: body.pastedPrompt,
      openingFact: pickOpeningFact(resumeChunks, this.nextDraftTurn(schoolId)),
      pairs: selected.pairs,
      weak: selected.weak,
      roster,
    };
    const tracked = trackAiUsage(this.env.AI);
    const grounded = scaffoldOutline(input);
    if (input.weak) {
      console.log(JSON.stringify({ event: "sop_weak_overlap", schoolId }));
    }
    const allowed = input.weak
      ? { faculty: [], courses: [] }
      : {
          faculty: selected.pairs
            .filter((pair) => pair.fact.kind === "faculty")
            .map((pair) => pair.fact.name),
          courses: selected.pairs
            .filter((pair) => pair.fact.kind === "course")
            .map((pair) => pair.fact.name),
        };
    const guarded = guardNames(grounded.paragraph, allowed, roster);
    if (guarded.removed.length > 0) {
      console.log(JSON.stringify({ event: "sop_names_removed", removed: guarded.removed }));
    }
    const paragraph = stripUnfilledProgramCitations(guarded.text);
    return Response.json({
      paragraph,
      label: grounded.label,
      citations: [...paragraph.matchAll(/\[(R\d+|P\d+)\]/g)].map(
        (match) => match[1],
      ),
      pageStatus: input.pageStatus,
      namesRemoved: guarded.removed,
      usage: tracked.snapshot(),
    });
  }

  private async persistResume(
    body: ProgramBody,
    chunks: Excerpt[],
    bytes?: Uint8Array,
  ): Promise<void> {
    const userId = String(body.userId ?? "user");
    const schoolId = String(body.schoolId ?? "school");
    if (bytes && this.env.RESUMES) {
      try {
        const safeName = (body.filename ?? "resume")
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .slice(0, 80);
        await this.env.RESUMES.put(
          `resumes/${userId}/${schoolId}/${safeName}`,
          bytes,
          {
            httpMetadata: {
              contentType: body.mediaType || "application/octet-stream",
            },
          },
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "sop_r2_error",
            message: error instanceof Error ? error.message : "failed",
          }),
        );
      }
    }
    await this.indexChunks(userId, chunks);
    await this.writeD1Resume(userId, chunks);
  }

  private async persistPage(schoolId: string, text: string): Promise<void> {
    if (!this.env.RESUMES || !schoolId) return;
    try {
      await this.env.RESUMES.put(
        `pages/${schoolId}.txt`,
        text.slice(0, 100_000),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "sop_page_store_error",
          message: error instanceof Error ? error.message : "failed",
        }),
      );
    }
  }

  private async indexChunks(userId: string, chunks: Excerpt[]): Promise<void> {
    if (!this.env.AI || !this.env.VECTORIZE || chunks.length === 0) return;
    try {
      const embedded = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: chunks.map((chunk) => chunk.text),
      });
      const data =
        "data" in embedded && Array.isArray(embedded.data) ? embedded.data : [];
      await this.env.VECTORIZE.upsert(
        chunks.map((chunk, index) => ({
          id: `${userId}:${chunk.id}`,
          values: data[index] ?? [],
          metadata: { userId, label: chunk.id },
        })),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "sop_vectorize_error",
          message: error instanceof Error ? error.message : "failed",
        }),
      );
    }
  }

  private async writeD1Resume(
    userId: string,
    chunks: Excerpt[],
  ): Promise<void> {
    if (!this.env.DB) return;
    try {
      await this.env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS resume_chunks (user_id TEXT NOT NULL, chunk_id TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY (user_id, chunk_id))",
      ).run();
      await this.env.DB.prepare("DELETE FROM resume_chunks WHERE user_id = ?")
        .bind(userId)
        .run();
      for (const chunk of chunks) {
        await this.env.DB.prepare(
          "INSERT INTO resume_chunks (user_id, chunk_id, text) VALUES (?, ?, ?)",
        )
          .bind(userId, chunk.id, chunk.text)
          .run();
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "sop_d1_error",
          message: error instanceof Error ? error.message : "failed",
        }),
      );
    }
  }
}

function parseExcerpts(json: string | undefined): Excerpt[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Excerpt[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.id && item?.text)
      : [];
  } catch {
    return excerptsFromText("", "P");
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

