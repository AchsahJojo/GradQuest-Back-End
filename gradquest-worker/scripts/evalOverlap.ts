import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { precisionRecall, readTokenUsage, trackAiUsage, type TokenUsage } from "../src/facts/evalMetrics";
import { cosine, embedTexts } from "../src/facts/match";

const PORT = 8797;
const SCHOOLS = [3, 6, 22] as const;
const RESUMES = ["cs", "adjacent", "mismatch"] as const;
const THRESHOLDS = [0.55, 0.6, 0.65, 0.7];
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const evalDir = join(root, "research", "eval");
const configPath = join(evalDir, "wrangler.eval.jsonc");
const persistTo = join(root, ".wrangler", "state");
const reportPath = join(evalDir, "last-run.md");
const secretFile = join(root, ".dev.vars");

type ResumeName = (typeof RESUMES)[number];

type LabelPair = {
  id: string;
  resume: ResumeName;
  schoolId: number;
  factId: string;
  resumeText: string;
  factName: string;
  related: boolean;
  factDetail: string;
};

type RunRow = {
  resume: ResumeName;
  schoolId: number;
  confirmed: number;
  weak: boolean;
  namesRemoved: number;
  citationShare: string;
  unmapped: number;
  maps: boolean;
  paragraph: string;
};

const emptyUsage = (): TokenUsage => ({ promptTokens: 0, completionTokens: 0 });

function readProxySecret(file: string): string {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?SOP_PROXY_SECRET=(.*)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value) throw new Error(`Missing SOP_PROXY_SECRET in ${file}`);
    return value;
  }
  throw new Error(`Missing SOP_PROXY_SECRET in ${file}`);
}

function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

function loadLabels(): LabelPair[] {
  const labels = JSON.parse(readFileSync(join(evalDir, "labels.json"), "utf8")) as {
    labeledBy?: string;
    pairs?: LabelPair[];
  };
  if (labels.labeledBy !== "agent-provisional") {
    throw new Error("labels.json labeledBy must be agent-provisional");
  }
  const pairs = labels.pairs ?? [];
  if (pairs.length !== 20) throw new Error(`labels.json has ${pairs.length} pairs, expected 20`);
  const resumes = Object.fromEntries(
    RESUMES.map((name) => [name, readFileSync(join(evalDir, `resume-${name}.txt`), "utf8")]),
  ) as Record<ResumeName, string>;
  const schools = new Map<number, { schoolName: string; programName: string; facts: { id: string; name: string; detail: string }[] }>(
    SCHOOLS.map((schoolId) => {
      const checked = JSON.parse(
        readFileSync(join(root, "research", `school-${schoolId}.checked.json`), "utf8"),
      ) as {
        schoolName: string;
        programName: string;
        facts: { id: string; name: string; detail: string }[];
      };
      return [schoolId, checked] as const;
    }),
  );
  let related = 0;
  let unrelated = 0;
  for (const pair of pairs) {
    if (!RESUMES.includes(pair.resume)) throw new Error(`Unknown resume ${pair.resume} on ${pair.id}`);
    if (!resumes[pair.resume].includes(pair.resumeText)) {
      throw new Error(`resumeText for ${pair.id} is not in resume-${pair.resume}.txt`);
    }
    const school = schools.get(pair.schoolId);
    if (!school) throw new Error(`Unexpected school ${pair.schoolId} on ${pair.id}`);
    const fact = school.facts.find((item) => item.id === pair.factId && item.name === pair.factName);
    if (!fact) throw new Error(`fact ${pair.factId} (${pair.factName}) is not in school ${pair.schoolId}`);
    pair.factDetail = fact.detail;
    if (pair.resume === "mismatch" && pair.related) {
      throw new Error(`mismatch pair ${pair.id} must have related false`);
    }
    if (pair.related) related += 1;
    else unrelated += 1;
  }
  if (related < 8 || unrelated < 8) {
    throw new Error(`Need at least 8 related and 8 unrelated pairs, got ${related} and ${unrelated}`);
  }
  return pairs;
}

function schoolMeta(schoolId: number): { schoolName: string; programName: string } {
  const checked = JSON.parse(
    readFileSync(join(root, "research", `school-${schoolId}.checked.json`), "utf8"),
  ) as { schoolName: string; programName: string };
  return { schoolName: checked.schoolName, programName: checked.programName };
}

async function localFactCounts(secret: string): Promise<Map<string, number>> {
  const command = [
    "d1",
    "execute",
    "gradquest-sop",
    "--local",
    "--persist-to",
    persistTo,
    "--json",
    "--config",
    configPath,
    "--command",
    "SELECT s.school_id AS school_id, COUNT(f.fact_id) AS n FROM program_snapshots s JOIN program_facts f ON f.snapshot_id = s.snapshot_id WHERE s.school_id IN ('3','6','22') GROUP BY s.school_id",
  ];
  const { stdout, stderr, code } = await runCapture(join(root, "node_modules", ".bin", "wrangler"), command, secret);
  if (code !== 0) {
    throw new Error(`local D1 check failed: ${redact(`${stderr}\n${stdout}`, secret).slice(-2000)}`);
  }
  const jsonStart = stdout.indexOf("[");
  if (jsonStart < 0) throw new Error("local D1 check did not return JSON");
  const parsed = JSON.parse(stdout.slice(jsonStart)) as { results?: { school_id?: unknown; n?: unknown }[] }[];
  const counts = new Map<string, number>();
  for (const entry of parsed) {
    for (const row of entry.results ?? []) counts.set(String(row.school_id), Number(row.n));
  }
  const missing = SCHOOLS.filter((schoolId) => (counts.get(String(schoolId)) ?? 0) === 0);
  if (missing.length > 0) {
    throw new Error(
      `Local D1 has no facts for school ${missing.join(", ")}. Refusing to apply SQL.`,
    );
  }
  return counts;
}

function runCapture(
  bin: string,
  args: string[],
  secret: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(bin, args, {
      cwd: root,
      env: { ...process.env, SOP_PROXY_SECRET: secret },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolveRun({ stdout, stderr, code: code ?? 1 });
    });
  });
}

async function scoreLabels(pairs: LabelPair[], secret: string): Promise<{ scored: { score: number; related: boolean }[]; usage: TokenUsage }> {
  process.env.SOP_PROXY_SECRET = secret;
  const previousLog = process.env.WRANGLER_LOG;
  process.env.WRANGLER_LOG = "error";
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ AI: Env["AI"] }>>> | undefined;
  try {
    proxy = await getPlatformProxy<{ AI: Env["AI"] }>({
      configPath,
      persist: false,
      envFiles: [],
    });
    const tracked = trackAiUsage(proxy.env.AI);
    const resumeVecs = await embedTexts(
      tracked.ai,
      pairs.map((pair) => pair.resumeText),
    );
    const factVecs = await embedTexts(
      tracked.ai,
      pairs.map((pair) => `${pair.factName}. ${pair.factDetail}`),
    );
    return {
      scored: pairs.map((pair, index) => ({
        score: cosine(resumeVecs[index], factVecs[index]),
        related: pair.related,
      })),
      usage: tracked.snapshot(),
    };
  } finally {
    if (previousLog === undefined) delete process.env.WRANGLER_LOG;
    else process.env.WRANGLER_LOG = previousLog;
    await proxy?.dispose();
  }
}

function startDev(secret: string): { child: ReturnType<typeof spawn>; logs: () => string } {
  let logs = "";
  const child = spawn(
    join(root, "node_modules", ".bin", "wrangler"),
    [
      "dev",
      "--config",
      configPath,
      "--port",
      String(PORT),
      "--ip",
      "127.0.0.1",
      "--persist-to",
      persistTo,
    ],
    {
      cwd: root,
      detached: true,
      env: { ...process.env, SOP_PROXY_SECRET: secret },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const append = (chunk: Buffer) => {
    logs = `${logs}${chunk.toString()}`.slice(-12000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return { child, logs: () => logs };
}

async function waitForDev(child: ReturnType<typeof spawn>, logs: () => string, secret: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev exited ${child.exitCode}: ${redact(logs(), secret).slice(-2000)}`);
    }
    const text = logs();
    if (/not authenticated|Failed to fetch auth|You must be logged in|Authentication error/i.test(text)) {
      throw new Error(`wrangler auth failed: ${redact(text, secret).slice(-2000)}`);
    }
    if (text.includes(`http://127.0.0.1:${PORT}`)) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(2000) });
        const body = await response.text();
        if (response.status === 404 && body.includes("Not found")) return;
      } catch {
        // listener not open yet
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`wrangler dev did not listen on port ${PORT}: ${redact(logs(), secret).slice(-2000)}`);
}

async function stopDev(child: ReturnType<typeof spawn> | undefined): Promise<void> {
  if (!child?.pid) return;
  await new Promise<void>((resolveStop) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      resolveStop();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  });
}

async function postJson(pathname: string, body: unknown, secret: string): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${PORT}/internal/${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-GradQuest-Proxy-Secret": secret,
    },
    body: JSON.stringify({ ...(body as object), userId: "eval" }),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${pathname} failed ${response.status}: ${redact(text, secret).slice(0, 500)}`);
  }
  return JSON.parse(text) as unknown;
}

function addUsage(total: TokenUsage, usage: unknown): void {
  const read = readTokenUsage({ usage });
  total.promptTokens += read.promptTokens;
  total.completionTokens += read.completionTokens;
}

function citationShare(
  paragraph: string,
  kept: number,
  weak: boolean,
): { share: string; unmapped: number; maps: boolean } {
  const numbers = [...paragraph.matchAll(/\[P(\d+)\]/g)].map((match) => Number(match[1]));
  if (numbers.length === 0) return { share: "n/a", unmapped: 0, maps: weak };
  const mapped = numbers.filter((number) => number >= 1 && number <= kept).length;
  const unmapped = numbers.length - mapped;
  return {
    share: `${(mapped / numbers.length).toFixed(3)} (${mapped}/${numbers.length})`,
    unmapped,
    maps: unmapped === 0,
  };
}

function formatMetric(value: number | null): string {
  return value === null ? "null" : value.toFixed(3);
}

function render(input: {
  scored: { score: number; related: boolean }[];
  rows: RunRow[];
  usage: TokenUsage;
}): string {
  const lines = ["labels: agent-provisional"];
  for (const threshold of THRESHOLDS) {
    const metrics = precisionRecall(input.scored, threshold);
    lines.push(
      `threshold ${threshold.toFixed(2)} precision ${formatMetric(metrics.precision)} recall ${formatMetric(metrics.recall)}`,
    );
  }
  for (const resume of RESUMES) {
    for (const schoolId of SCHOOLS) {
      const row = input.rows.find((item) => item.resume === resume && item.schoolId === schoolId);
      if (!row) continue;
      lines.push(
        `resume ${resume} school ${schoolId} confirmed ${row.confirmed} weak ${row.weak} namesRemoved ${row.namesRemoved} pCitationShare ${row.citationShare}`,
      );
    }
  }
  lines.push(`promptTokens ${input.usage.promptTokens}`);
  lines.push(`completionTokens ${input.usage.completionTokens}`);
  for (const schoolId of SCHOOLS) {
    const row = input.rows.find((item) => item.resume === "cs" && item.schoolId === schoolId);
    lines.push(`cs draft school ${schoolId}`);
    lines.push(row?.paragraph ?? "");
  }
  const by = (resume: ResumeName, schoolId: number) =>
    input.rows.find((item) => item.resume === resume && item.schoolId === schoolId);
  const mismatchWeak = SCHOOLS.every((schoolId) => by("mismatch", schoolId)?.weak === true);
  const csPairs = (by("cs", 22)?.confirmed ?? 0) >= 2 && (by("cs", 3)?.confirmed ?? 0) >= 2;
  const namesClear = input.rows.every((row) => row.namesRemoved === 0);
  const citationsMap = input.rows.every((row) => row.maps);
  const pass = mismatchWeak && csPairs && namesClear && citationsMap;
  lines.push(`G1 mismatch weak at schools 3, 6, and 22: ${mismatchWeak ? "pass" : "fail"}`);
  lines.push(`G1 cs confirmed pairs at schools 22 and 3: ${csPairs ? "pass" : "fail"}`);
  lines.push(`G1 names removed is 0: ${namesClear ? "pass" : "fail"}`);
  lines.push(`G1 every [P#] maps: ${citationsMap ? "pass" : "fail"}`);
  lines.push(`G1: ${pass ? "pass" : "fail"}`);
  return `${lines.join("\n")}\n`;
}

async function runMatrix(secret: string, usage: TokenUsage): Promise<RunRow[]> {
  const rows: RunRow[] = [];
  for (const resume of RESUMES) {
    const text = readFileSync(join(evalDir, `resume-${resume}.txt`), "utf8").trim();
    await postJson(
      "resume",
      { filename: `resume-${resume}.txt`, mediaType: "text/plain", text },
      secret,
    );
    for (const schoolId of SCHOOLS) {
      const meta = schoolMeta(schoolId);
      const overlap = (await postJson("overlap", { schoolId, ...meta }, secret)) as {
        pairs?: { pairId?: string }[];
        weak?: boolean;
        usage?: unknown;
      };
      if (typeof overlap.weak !== "boolean" || overlap.usage == null) {
        throw new Error(`overlap JSON for ${resume} school ${schoolId} is missing weak or usage`);
      }
      addUsage(usage, overlap.usage);
      const pairs = Array.isArray(overlap.pairs) ? overlap.pairs : [];
      const pairIds = pairs.map((pair) => pair.pairId).filter((id): id is string => typeof id === "string");
      const draft = (await postJson("draft", { schoolId, ...meta, pairIds }, secret)) as {
        paragraph?: string;
        namesRemoved?: unknown;
        usage?: unknown;
      };
      if (!Array.isArray(draft.namesRemoved) || draft.usage == null || typeof draft.paragraph !== "string") {
        throw new Error(`draft JSON for ${resume} school ${schoolId} is missing paragraph, namesRemoved, or usage`);
      }
      addUsage(usage, draft.usage);
      const paragraph = draft.paragraph;
      const namesRemoved = draft.namesRemoved.length;
      const weak = overlap.weak === true;
      const share = citationShare(paragraph, pairIds.length, weak);
      rows.push({
        resume,
        schoolId,
        confirmed: pairIds.length,
        weak,
        namesRemoved,
        citationShare: share.share,
        unmapped: share.unmapped,
        maps: share.maps,
        paragraph,
      });
    }
  }
  return rows;
}

async function main(): Promise<void> {
  let secret = "";
  let dev: ReturnType<typeof spawn> | undefined;
  try {
    const pairs = loadLabels();
    secret = readProxySecret(secretFile);
    await localFactCounts(secret);
    const started = startDev(secret);
    dev = started.child;
    await waitForDev(started.child, started.logs, secret);
    const scored = await scoreLabels(pairs, secret);
    const usage = { ...scored.usage };
    const rows = await runMatrix(secret, usage);
    const report = render({ scored: scored.scored, rows, usage });
    writeFileSync(reportPath, report);
    process.stdout.write(report);
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "eval failed", secret);
    const report = `labels: agent-provisional\neval error: ${message}\n`;
    writeFileSync(reportPath, report);
    process.stderr.write(`${report}`);
    process.exitCode = 1;
  } finally {
    await stopDev(dev);
  }
}

await main();
