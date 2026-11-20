-- Reminder email scheduling: split deadline vs notify_at, outbound mail flags.
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Backfill: existing reminder_date becomes deadline_date; notify_at = deadline − 14 when possible.

ALTER TABLE public.reminders
    ADD COLUMN IF NOT EXISTS deadline_date date,
    ADD COLUMN IF NOT EXISTS notify_at date,
    ADD COLUMN IF NOT EXISTS deadline_is_placeholder boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS confirm_email_sent_at timestamp,
    ADD COLUMN IF NOT EXISTS notify_email_sent_at timestamp,
    ADD COLUMN IF NOT EXISTS email_cancelled_at timestamp;

UPDATE public.reminders
SET deadline_date = reminder_date
WHERE deadline_date IS NULL;

UPDATE public.reminders
SET notify_at = deadline_date - INTERVAL '14 days'
WHERE notify_at IS NULL
  AND deadline_date IS NOT NULL
  AND deadline_is_placeholder = false;

CREATE INDEX IF NOT EXISTS reminders_notify_due_idx
    ON public.reminders (notify_at)
    WHERE notify_email_sent_at IS NULL
      AND email_cancelled_at IS NULL
      AND deadline_is_placeholder = false;
