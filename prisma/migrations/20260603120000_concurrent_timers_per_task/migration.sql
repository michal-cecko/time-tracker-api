-- Concurrent timers: relax "one running entry per user" to "one running entry
-- per (user, task)". This lets a user track several tasks at once while still
-- preventing a duplicate running timer for the same task. Unassigned timers
-- (taskId IS NULL) collapse to a single slot via COALESCE so a user can't
-- stack multiple unassigned timers either.
DROP INDEX IF EXISTS "TimeEntry_one_running_per_user";

CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_one_running_per_user_task"
  ON "TimeEntry" ("userId", COALESCE("taskId", ''))
  WHERE "endedAt" IS NULL;
