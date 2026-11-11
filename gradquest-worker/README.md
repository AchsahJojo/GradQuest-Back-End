# gradquest-worker

Statement drafts for three public program pages. Spring calls this Worker with `X-GradQuest-Proxy-Secret`. The phone never talks to it directly.

## Test

```bash
npm test
```

That checks the allowlist, `robots.txt`, login-wall stops, and citation rules. It does not call Cloudflare.

## Local worker

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

Set the same secret on Spring as `SOP_WORKER_SECRET`, and `SOP_WORKER_BASE_URL` to the local Wrangler URL. Before the first deploy, create the D1 database, R2 bucket, and Vectorize index named `gradquest-sop-resume` (bge-base, 768 dimensions) and put the D1 id in `wrangler.jsonc`.

## Refreshing program facts

Facts are gathered offline. A student request never runs this. Do a full pass every August or September, before application season. In the middle of the year, run the change check only.

1. Fill in `research/GROK_PROMPT.md` for one school and paste it into Grok. Save the JSON as `research/school-{id}.json`. Open every URL in `pages` and delete any that is wrong, gated, or for a different program.
2. `npm run facts:verify` re-fetches those pages and writes `research/school-{id}.checked.json` plus `research/school-{id}.report.md`. It does not mark facts verified.
3. Read the report. Set `"verified": true` only on facts whose quote you accept. For a page the script cannot fetch, set `"quoteCheck": "manual"` only after you have opened that page yourself.
4. `npm run facts:sql` writes `research/program_facts.sql` from the verified facts.
5. Apply locally, from this directory:

```bash
npx wrangler d1 migrations apply gradquest-sop --local
npx wrangler d1 execute gradquest-sop --local --file research/program_facts.sql
```

6. The remote apply is the same two commands with `--remote`. Run it only after an explicit approval. Merging git does not load the facts.
7. `npm run facts:check` re-fetches the URLs in each `school-*.checked.json` and writes `research/school-{id}.changes.md`. A missing verified quote, a changed page hash, and an unreachable URL are separate lists. An unchanged page leaves those lists empty. The script does not edit facts. When a list is not empty, rerun steps 1–5 for that school.
