# GradQuest API

Spring Boot API for student preferences, a catalog of 25 CS-related master's programs, weighted matching, deadline reminders, and statement drafts.

## Local setup

Java 17. From this directory:

```bash
./gradlew bootRun
```

`bootRun` forces the `dev` profile and, if a gitignored `.env` sits next to `gradlew`, loads it into the process. Dev listens on `http://localhost:8082` and uses PostgreSQL (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). It does not use H2. H2 is only the in-memory database for tests.

GitHub OAuth is optional in dev. Without credentials, GitHub login is disabled. Sign in with dev login instead:

`POST /dev/login?as=tester`

That route exists only on the `dev` profile. The Expo app shows the button when `EXPO_PUBLIC_DEV_LOGIN=true`.

### Three terminals for the whole app

1. **Statement worker**, only if you are exercising Statement drafts. In `gradquest-worker/`, copy `.dev.vars.example` to `.dev.vars` and run `npm run dev`. Point this API at the URL Wrangler prints with `SOP_WORKER_BASE_URL`, and set `SOP_WORKER_SECRET` to the same secret the worker uses. See `gradquest-worker/README.md`. The phone never calls the worker directly.
2. **This API:** `./gradlew bootRun` (port 8082).
3. **Expo app:** GradQuest-Front-End, `npm start`, with dev login enabled.

```bash
./gradlew test
```

## Profiles

- **dev** — `bootRun`. Port 8082, Postgres, `POST /dev/login`.
- **prod** — default when the process is not started with `bootRun`. Postgres. Port is `PORT`, or 8080 if that is unset.
- **test** — H2, used by `./gradlew test` only.

## Catalog and matching

Catalog SQL is in `db/` (`seed_schools.sql`, `seed_program_terms.sql`, plus the `migrate_track_*.sql` scripts). `ddl-auto=update` adds columns; the SQL scripts are how the 25 programs are loaded.

`GET /api/schools/top5` ranks with `MatchScoringService` / `MatchWeights` and returns up to 10 programs:

| Dimension | Weight |
|-----------|--------|
| Budget (domestic full program cost) | 30 |
| GPA vs `min_gpa` | 25 |
| Location (state) | 20 |
| Program type | 15 |
| Modality | 5 |
| Enrollment | 5 |

A missing dimension is dropped and the remaining weights are renormalized. Budget score is 1.0 at or under budget and 0.0 at 50% over. `grePreferred == false` (the default) drops programs that require the GRE. If a desired term and start year are set, only open terms for that term and year are kept, using the international deadline when the student is international. A null deadline stays, with a “deadline not published” reason. Closing soon means within 30 days.

## API

The session cookie identifies the student. Do not pass `userId` or `studentId`. There is no `/api/users` API, and schools cannot be created, updated, or deleted over HTTP.

- `GET /api/me`, `POST /api/logout`
- `POST /dev/login` (dev profile only)
- `GET`, `POST`, `PUT`, `DELETE /api/preferences`
- `GET /api/schools`, `GET /api/schools/{schoolId}`, `GET /api/schools/top5`, `POST /api/schools/search`
- `POST /api/reminders?schoolId=`, `GET /api/reminders`, `DELETE /api/reminders/{reminderId}`, `DELETE /api/reminders/school/{schoolId}`, `PATCH /api/reminders/{reminderId}/complete`
- Statement drafts (session auth; the server picks an allowlisted public URL): `POST /api/sop/programs` with `{ "schoolId" }`, `POST /api/sop/resume` (JSON `{ "schoolId", "text" }` or multipart `schoolId` + `file`), `POST /api/sop/draft` with `{ "schoolId", "mode": "opening" | "motivation", "pastedPrompt" }`

`/api/applications` is not implemented. A few other reminder routes in `ReminderController` (`/upcoming`, get-by-id, update, `/application/{id}`) are placeholders and are not used by the app.
