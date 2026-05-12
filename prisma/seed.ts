// Lapse seed — mirrors data.jsx from the design prototype.
// Run: bun run seed   (after `bunx prisma migrate dev`)
// Login: alex@studio.co / password123

import { PrismaClient, Status, BillingMode } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

type SeedTask = {
  title: string;
  status: Status;
  urgent?: boolean;
  estimateSec?: number;
  ratePerHour?: number; // dollars
  fixedPrice?: number;  // dollars
  spentSec?: number;
  running?: boolean;
  due?: string;
  children?: SeedTask[];
};

type SeedProject = {
  name: string;
  initials: string;
  colorHex: string;
  archived?: boolean;
  archivedAt?: string;
  tasks: SeedTask[];
};

const PROJECTS: SeedProject[] = [
  {
    name: 'Finch — Brand Refresh',
    initials: 'FB',
    colorHex: '#ff7a45',
    tasks: [
      { title: 'Logo lockups — final exports', status: Status.WAITING, estimateSec: 90 * 60, fixedPrice: 180, spentSec: 86 * 60, due: 'Today' },
      { title: 'Brand guidelines PDF', status: Status.IN_PROGRESS, urgent: true, estimateSec: 4 * 3600, ratePerHour: 85, spentSec: 1 * 3600 + 10 * 60, due: 'Tomorrow' },
      { title: 'Color tokens', status: Status.DONE, estimateSec: 2 * 3600, fixedPrice: 240, spentSec: 2 * 3600 + 8 * 60, due: 'Yesterday' },
    ],
  },
  {
    name: 'Orbit Mobile v2',
    initials: 'OM',
    colorHex: '#4a7eff',
    tasks: [
      {
        title: 'Onboarding flow — sign-up screens',
        status: Status.IN_PROGRESS,
        estimateSec: 6 * 3600,
        fixedPrice: 720,
        spentSec: 3 * 3600 + 12 * 60,
        running: true,
        due: 'Today',
        children: [
          { title: 'Email + password fields', status: Status.DONE, estimateSec: 60 * 60, spentSec: 52 * 60 },
          { title: 'OAuth providers (Google, Apple)', status: Status.DONE, estimateSec: 90 * 60, spentSec: 78 * 60 },
          {
            title: 'Verification step',
            status: Status.IN_PROGRESS,
            estimateSec: 2 * 3600,
            spentSec: 32 * 60,
            running: true,
            children: [
              { title: '6-digit code input', status: Status.IN_PROGRESS, estimateSec: 45 * 60, spentSec: 18 * 60, running: true },
              { title: 'Resend cooldown', status: Status.BACKLOG, estimateSec: 30 * 60 },
              {
                title: 'Error states',
                status: Status.BACKLOG,
                estimateSec: 25 * 60,
                children: [
                  { title: 'Invalid code copy', status: Status.BACKLOG, estimateSec: 10 * 60 },
                  { title: 'Expired code copy', status: Status.BACKLOG, estimateSec: 10 * 60 },
                ],
              },
            ],
          },
          { title: 'Avatar / profile setup', status: Status.IN_REVIEW, estimateSec: 90 * 60, spentSec: 64 * 60 },
          { title: 'Permissions prompt copy', status: Status.ESTIMATE, estimateSec: 30 * 60 },
        ],
      },
      { title: 'Push notification settings UI', status: Status.IN_REVIEW, estimateSec: 3 * 3600, ratePerHour: 75, spentSec: 2 * 3600 + 44 * 60, due: 'Today' },
      { title: 'iOS share-extension entitlements', status: Status.HOLD, estimateSec: 60 * 60, spentSec: 14 * 60, due: '—' },
      { title: 'Crash on cold-launch (iOS 17)', status: Status.RETURN, urgent: true, estimateSec: 2 * 3600, ratePerHour: 100, spentSec: 22 * 60, due: 'Today' },
    ],
  },
  {
    name: 'Merryfield Site',
    initials: 'MR',
    colorHex: '#a464d9',
    tasks: [
      { title: 'Homepage hero motion spec', status: Status.ESTIMATE, due: 'Fri' },
    ],
  },
  { name: 'Halcyon — Landing', initials: 'HL', colorHex: '#e5b341', archived: true, archivedAt: '2026-04-14', tasks: [] },
  { name: 'Northwind App v1', initials: 'NW', colorHex: '#6b8e7a', archived: true, archivedAt: '2026-02-02', tasks: [] },
  { name: 'Studio site 2024', initials: 'SS', colorHex: '#c97064', archived: true, archivedAt: '2026-01-19', tasks: [] },
];

// Translate prototype-style relative due strings ("Today", "Tomorrow", "Fri", "Yesterday")
// into actual dates relative to "now" so the UI lights up Today/Also-today buckets.
function parseDue(s: string | undefined): Date | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (lower === 'today') return now;
  if (lower === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }
  if (lower === 'yesterday') { const d = new Date(now); d.setDate(d.getDate() - 1); return d; }
  const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const idx = weekdays.findIndex((w) => lower.startsWith(w));
  if (idx >= 0) {
    const d = new Date(now);
    const diff = (idx - now.getDay() + 7) % 7 || 7; // next occurrence, never today
    d.setDate(d.getDate() + diff);
    return d;
  }
  if (lower === '—' || lower === '-') return null;
  return null;
}

async function insertTasks(userId: string, projectId: string, seeds: SeedTask[], parentTaskId: string | null = null) {
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];

    let billingMode: BillingMode = BillingMode.NONE;
    let hourlyRateCents: number | null = null;
    let taskPriceCents: number | null = null;
    if (s.fixedPrice != null) {
      billingMode = BillingMode.TASK_PRICE;
      taskPriceCents = Math.round(s.fixedPrice * 100);
    } else if (s.ratePerHour != null) {
      billingMode = BillingMode.HOURLY_RATE;
      hourlyRateCents = Math.round(s.ratePerHour * 100);
    }

    const task = await prisma.task.create({
      data: {
        projectId,
        userId,
        parentTaskId,
        title: s.title,
        status: s.status,
        urgent: !!s.urgent,
        estimateSeconds: s.estimateSec ?? null,
        billingMode,
        hourlyRateCents,
        taskPriceCents,
        dueDate: parseDue(s.due),
        position: i,
        completedAt: s.status === Status.DONE || s.status === Status.INVOICED ? new Date() : null,
      },
    });

    if (s.spentSec && s.spentSec > 0) {
      const now = new Date();
      if (s.running) {
        // Running entry — endedAt null, contributes elapsed up to now.
        await prisma.timeEntry.create({
          data: {
            userId,
            taskId: task.id,
            startedAt: new Date(now.getTime() - s.spentSec * 1000),
            endedAt: null,
            durationSeconds: 0,
          },
        });
      } else {
        // Spread time entries across the past 7 days so the weekly chart has
        // bars on every day. Each task drops a chunk on a different day based
        // on its position in the project so the distribution feels natural.
        const dayOffset = (i % 6) + 1; // 1..6 days ago (skip today for non-running)
        const startHour = 9 + (i % 4) * 2; // 9, 11, 13, 15
        const startedAt = new Date(now);
        startedAt.setDate(startedAt.getDate() - dayOffset);
        startedAt.setHours(startHour, 0, 0, 0);
        const endedAt = new Date(startedAt.getTime() + s.spentSec * 1000);
        await prisma.timeEntry.create({
          data: {
            userId,
            taskId: task.id,
            startedAt,
            endedAt,
            durationSeconds: s.spentSec,
          },
        });
      }
    }

    if (s.children?.length) {
      await insertTasks(userId, projectId, s.children, task.id);
    }
  }
}

// The prototype's data.jsx marks an entire ancestor chain as `running: true`
// because UI rolls up state. In the DB, only the leaf is truly running.
// Walk the tree once: if any descendant is running, the ancestor is not.
function normalizeRunning(seeds: SeedTask[]): boolean {
  let anyDescendantRunning = false;
  for (const s of seeds) {
    const descRunning = s.children?.length ? normalizeRunning(s.children) : false;
    if (descRunning && s.running) s.running = false;
    if (s.running || descRunning) anyDescendantRunning = true;
  }
  return anyDescendantRunning;
}

async function main() {
  const email = 'alex@studio.co';
  const password = 'password123';

  await prisma.timeEntry.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.syncQueueItem.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Alex Rivera',
      passwordHash,
      avatarSeed: 'AR',
      settings: { create: {} },
    },
  });
  console.log(`User: ${email} / ${password}`);

  for (const p of PROJECTS) {
    normalizeRunning(p.tasks);
  }
  for (const p of PROJECTS) {
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name: p.name,
        initials: p.initials,
        colorHex: p.colorHex,
        archived: !!p.archived,
        archivedAt: p.archivedAt ? new Date(p.archivedAt) : null,
      },
    });
    if (p.tasks.length) await insertTasks(user.id, project.id, p.tasks);
    console.log(`  ↳ project: ${p.name} (${p.tasks.length} top-level tasks${p.archived ? ', archived' : ''})`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
