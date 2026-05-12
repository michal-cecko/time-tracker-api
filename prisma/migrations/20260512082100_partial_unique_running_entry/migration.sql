-- Enforces "at most one running TimeEntry per user".
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_one_running_per_user"
  ON "TimeEntry" ("userId")
  WHERE "endedAt" IS NULL;
