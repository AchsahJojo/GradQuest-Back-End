-- Reminder email scheduling: split deadline vs notify_at, outbound mail flags.
-- Safe to re-run.
--
-- IMPORTANT: Apply this script on Supabase before relying on reminder email columns.
-- Hibernate ddl-auto=update can fail on existing DBs when it tries to add
-- deadline_is_placeholder as NOT NULL without backfilling nulls first.
-- Prefer this migration over ddl-auto for shared/prod databases.
--
-- From backend root (uses .env DB_*):
--   NODE_PATH=~/.cache/gradquest-db/node_modules node db/apply.cjs
-- Or run this file alone against Postgres / Supabase.

-- Add columns nullable first so existing rows do not block the alter.
ALTER TABLE public.reminders
    ADD COLUMN IF NOT EXISTS deadline_date date,
    ADD COLUMN IF NOT EXISTS notify_at date,
    ADD COLUMN IF NOT EXISTS deadline_is_placeholder boolean,
    ADD COLUMN IF NOT EXISTS confirm_email_sent_at timestamp,
    ADD COLUMN IF NOT EXISTS notify_email_sent_at timestamp,
    ADD COLUMN IF NOT EXISTS email_cancelled_at timestamp;

-- Backfill before tightening NOT NULL.
UPDATE public.reminders
SET deadline_date = reminder_date
WHERE deadline_date IS NULL;

UPDATE public.reminders
SET deadline_is_placeholder = false
WHERE deadline_is_placeholder IS NULL;

UPDATE public.reminders
SET notify_at = deadline_date - INTERVAL '14 days'
WHERE notify_at IS NULL
  AND deadline_date IS NOT NULL
  AND deadline_is_placeholder = false;

ALTER TABLE public.reminders
    ALTER COLUMN deadline_is_placeholder SET DEFAULT false;

ALTER TABLE public.reminders
    ALTER COLUMN deadline_is_placeholder SET NOT NULL;

CREATE INDEX IF NOT EXISTS reminders_notify_due_idx
    ON public.reminders (notify_at)
    WHERE notify_email_sent_at IS NULL
      AND email_cancelled_at IS NULL
      AND deadline_is_placeholder = false;
