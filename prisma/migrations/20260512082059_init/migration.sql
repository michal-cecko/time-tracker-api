-- CreateEnum
CREATE TYPE "Status" AS ENUM ('BACKLOG', 'ESTIMATE', 'APPROVED', 'RETURN', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING', 'HOLD', 'DONE', 'INVOICED');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('NONE', 'HOURLY_RATE', 'TASK_PRICE');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('TIME_TRACKED', 'STATUS_CHANGED', 'TASK_CREATED', 'TASK_UPDATED', 'COMMENT', 'MANUAL_ENTRY_ADDED', 'OVER_ESTIMATE');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('TIME', 'STATUS', 'COMMENT', 'TASK');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('dark', 'bright');

-- CreateEnum
CREATE TYPE "Density" AS ENUM ('compact', 'regular', 'comfy');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarSeed" TEXT NOT NULL DEFAULT 'L',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "userId" TEXT NOT NULL,
    "theme" "Theme" NOT NULL DEFAULT 'dark',
    "accentHex" TEXT NOT NULL DEFAULT '#FF7A45',
    "density" "Density" NOT NULL DEFAULT 'regular',
    "fontScale" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "idleDetectionMin" INTEGER NOT NULL DEFAULT 5,
    "autoStopAtMidnight" BOOLEAN NOT NULL DEFAULT false,
    "pomodoroEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pomodoroWorkMin" INTEGER NOT NULL DEFAULT 25,
    "pomodoroBreakMin" INTEGER NOT NULL DEFAULT 5,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "calendarIntegration" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "staysLoggedIn" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "title" TEXT NOT NULL,
    "description" JSONB,
    "status" "Status" NOT NULL DEFAULT 'BACKLOG',
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "estimateSeconds" INTEGER,
    "billingMode" "BillingMode" NOT NULL DEFAULT 'NONE',
    "hourlyRateCents" INTEGER,
    "taskPriceCents" INTEGER,
    "dueDate" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "kind" "ActivityKind" NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncQueueItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_refreshTokenHash_idx" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Project_userId_archived_idx" ON "Project"("userId", "archived");

-- CreateIndex
CREATE INDEX "Task_projectId_parentTaskId_position_idx" ON "Task"("projectId", "parentTaskId", "position");

-- CreateIndex
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId", "status");

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_startedAt_idx" ON "TimeEntry"("taskId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "TimeEntry_userId_startedAt_idx" ON "TimeEntry"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_taskId_createdAt_idx" ON "ActivityLog"("taskId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SyncQueueItem_userId_appliedAt_idx" ON "SyncQueueItem"("userId", "appliedAt");

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncQueueItem" ADD CONSTRAINT "SyncQueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
