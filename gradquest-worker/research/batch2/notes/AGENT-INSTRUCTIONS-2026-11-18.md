# GradQuest batch-2: fix weak résumé matching (VERIFIED data, Nov 18, 2026)

**Status: Achsah reviewed and verified every fact in this zip on Nov 18, 2026.**
All 342 enrich facts and 71 usersave facts have `verified: true` and `verifiedBy: "user 2026-11-18"`.
Treat them as verified. Do not re-flag or downgrade them.

## Why matching is weak
Remote D1 already has faculty and course rows for all ten batch-2 schools. But `src/agent/overlapRead.ts`
embeds `${fact.name}. ${fact.detail}` only for faculty and course facts, and many of those details were bare
names or bare course titles. With so little text, fewer than 2 pairs get past the 0.60 cutoff and the judge, so
the report comes back weak. There's a second problem: each user's Durable Object caches a school's snapshot
forever (step 3), so newly loaded facts never reach existing users.

## What's in this zip
- `research/school-{1,2,4,5,8,9,13,14,23}-enrich.json` (342 verified facts): faculty research text for 89 people and course descriptions for 251 courses.
  - An `id` that matches an existing fact **replaces** that fact's `detail`, `sourceUrl` and `quote`.
    `supersedesDetail` and `supersedesSourceUrl` are the old values, kept for review only. Drop them when merging.
  - Ids `e1`, `e2`, ... are new facts.
  - `alsoMatchesExistingIds` lists duplicate rows for the same person or course. Remove those duplicates.
- `research/school-23-usersave.json` (58) and `research/school-1-usersave.json` (13): verified facts from Achsah's own browser saves,
  with `quoteCheck:"manual"` and `evidence:"user browser save 2026-11-18"`.
- `research/school-23.json`: UNLV f7, f10, f16 and f22 are now **rejected** (`verified:false`, with `rejectedReason`).
- `notes/verification-decisions-2026-11-18.md`: all of Achsah's Nov 18 decisions.
- `checks/*-enrich*.quote-check.json`, `checks/*-usersave*.quote-check.json`: every quote passed (413 of 413).
- Raw pages are in `sources/enrich-2026-11-18/` (with `fetch-log.jsonl`) and `sources/catalog-user-saved/`.

## UNLV decisions (Nov 18)
- Department GPA minimum is the catalog's 3.00. Verify f66 and reject f22.
- Probation: "by the end of two subsequent semesters." Verify f82 and reject f10.
- 700-level requirements are set by track: thesis and Integrated BS-MS need 12 (f75), project needs 15 (f77), and exam needs 18 (f78).
  Reject f7 and f16. **This closes the UNLV 700-level hold.**

## Holds that still stay unverified (from Nov 13)
Fullerton MSE (school 7) deadline and cost facts, SDSU CompE f32, CPP f28, CSULA f4, and the 2023–24
curriculum facts that the 2026–27 catalog supersedes. Remove UNLV from the hold list.

## Steps
1. **Branch.** Start from up-to-date `main` in `gradquest-worker` on a new branch, for example `cursor/batch2-enrich-verified`.
2. **Copy the files.** Put the research, checks, notes and sources from this zip under `research/batch2/` (keeping the folder layout).
3. **Fix the stale snapshot cache** (code change, with a test).
   - In `src/agent/overlapRead.ts` and `src/agent/programRead.ts`, `loadSnapshot()` returns `snapshot_reads.snapshot_json`
     whenever a cached copy exists, and `SopAgent.ts` reuses `overlap_reads`.
   - Change it so the cached snapshot is used only when its snapshot id or `verifiedAt` matches `D1FactStore.latest(schoolId)`.
     Otherwise refresh the cached snapshot and delete that school's `overlap_reads` row.
   - Add a vitest case covering this: an old cached snapshot with a newer one in D1 should return the new snapshot and clear the overlap row.
4. **Merge into `research/batch2/school-{id}.checked.json`.**
   - For each school, apply the enrich replacements and additions, then the usersave additions, then the UNLV rejections.
   - Carry `verified: true`, `verifiedBy`, and `quoteCheck:"manual"` (usersave) through unchanged.
     Set `quoteFound: true` for enrich facts based on the quote-check files.
   - Remove the duplicate ids listed in `alsoMatchesExistingIds`.
   - Leave the held facts above unverified, with their `holdReason`.
   - Extend `build_checked.py` / `post_verify_overlay.py` if needed so these sit on top as an overlay.
5. **Run `verifyFacts.ts`** (carry-forward). It must not reset the Nov 18 `verified` flags. If a live re-fetch fails or hits a bot check,
   keep the saved-page result and **don't** bypass the bot check.
6. **Regenerate the SQL with `factsToSql.ts`.** Give the new snapshots a newer id or date (for example `{id}-20261118`) so they're the latest.
   Report per-school totals by kind compared with the current 959, and how many faculty facts still lack research text
   (expect about 13 where the source has none).
7. **Run the tests**, including the existing Java/TS allowlist equality test and the new cache test.
8. **Local D1 dry run.** Apply the SQL to local D1, run the worker locally, and repeat Achsah's live test:
   - Rich CS résumé on ASU (before: OK, 2 course pairs) and on SDSU CS (before: weak, 1 course pair, no faculty).
   - Thin résumé on both (before: weak).
   - Use a fresh test user as well as the existing one, to prove the cache fix works.
   - Report the pair counts before and after, which facts matched, and whether each result was weak.
9. **Stop and report to Achsah.** Include the branch, the per-school counts, the test results, and the before/after table.
   **Do not apply to remote D1, commit, push, open a PR, or deploy until she explicitly says go.**
10. **After she says go:**
    - Commit and open a PR, and post the link.
    - Apply the SQL to remote D1: `npx wrangler d1 execute gradquest-sop --remote --file research/program_facts.sql`, or the batch file.
    - Deploy the worker with `npx wrangler deploy`, then restart Spring.
    - Smoke-test on production with ASU, SDSU CS and UNLV, and confirm the remote counts with a SELECT per school.
11. **If SDSU CS is still weak** with the rich résumé after all this, report the top-k scores near 0.60 and how the judge voted on each pair.
    Don't change `MATCH_MIN_SCORE` (0.60) or the 2-pair weak rule without asking.

## Rules
- Never print, log or commit `SOP_PROXY_SECRET` or `SOP_WORKER_SECRET`.
- The worker reads only D1 snapshots. It never fetches program pages live.
- Live public pages only. No Internet Archive, and no bypassing bot checks.

## Still missing (not in this zip)
- ASU course descriptions. The ASU catalog only loads with JavaScript.
- UNLV and East Bay course descriptions. Their catalog search pages are behind a bot check;
  Achsah can save individual `preview_course` pages later.
- Research text for about 13 faculty whose public pages list none.
