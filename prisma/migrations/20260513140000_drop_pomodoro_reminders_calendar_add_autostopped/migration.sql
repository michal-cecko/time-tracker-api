-- Drop Pomodoro / Reminders / Calendar-integration toggles that were never wired.
ALTER TABLE "Settings"
  DROP COLUMN IF EXISTS "pomodoroEnabled",
  DROP COLUMN IF EXISTS "pomodoroWorkMin",
  DROP COLUMN IF EXISTS "pomodoroBreakMin",
  DROP COLUMN IF EXISTS "remindersEnabled",
  DROP COLUMN IF EXISTS "calendarIntegration";

-- Existing rows: nudge idle reminder default up to 60 min and turn auto-stop on.
ALTER TABLE "Settings" ALTER COLUMN "idleDetectionMin" SET DEFAULT 60;
ALTER TABLE "Settings" ALTER COLUMN "autoStopAtMidnight" SET DEFAULT true;

-- Flag for entries the midnight cron had to force-close.
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "autoStopped" boolean NOT NULL DEFAULT false;
