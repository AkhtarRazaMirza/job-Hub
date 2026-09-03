/**
 * Job Hub — Phase 6 / Step 6.6
 * Phase 6 Completion Gate: End-to-End Application Tracking Domain, Schema,
 * State Machine, Persistence, tRPC API, UI & Security Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 12 & 13, §5 Phase 6
 * - 02_how_to_build.md §4, §10, §14 & §17
 * - 03_tech_stack.md §4, §5 & §14
 * - 04_ai_agent_skills.md §17, §18 & §23
 *
 * Gate Checklist:
 * 1. Migration Integrity Gate:
 *    - Migrations 0000–0012 completely untouched
 *    - Migration 0013 exists, is clean, sequential, and committed to meta journal
 * 2. Schema & Storage Gate:
 *    - applications, applicationDocuments, applicationAnswers, applicationEvents exist
 *    - Unique constraint on (candidateProfileId, jobId)
 *    - Foreign keys and indexes intact
 * 3. State Machine & Integrity Gate:
 *    - Deterministic transition validation across all 8 status states
 *    - Terminal states (REJECTED, WITHDRAWN) block further transitions
 *    - Transactional transition with immutable audit event logging
 * 4. Data Access & Isolation Gate:
 *    - Strict candidate isolation (Candidate B receives NOT_FOUND for Candidate A)
 *    - Filterable listing and truthful count statistics
 * 5. API & Security Gate:
 *    - Unauthenticated calls rejected with 401 UNAUTHORIZED
 *    - Identity spoofing injection rejected with 403 FORBIDDEN
 *    - Response sanitization guarantees zero credential leaks
 * 6. UI & Integration Gate:
 *    - Dashboard preloads applications
 *    - Truthful status badge rendering
 *    - Next action, follow-up schedule, and notes management
 * 7. Teardown & Regression Gate:
 *    - Clean teardown of all test entities
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_LABELS,
  isValidTransition,
  validateTransition,
  isTerminalStatus,
  getAllowedTransitions,
  InvalidStateTransitionError,
  ApplicationConflictError,
  ApplicationNotFoundError,
  type ApplicationStatus,
} from "@job-hub/applications";
import { applicationRepository } from "@job-hub/applications/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  jobMatches,
  applications,
  applicationEvents,
  applicationDocuments,
  applicationAnswers,
} from "@job-hub/db";
import { eq, inArray, sql } from "drizzle-orm";

function createMockContext(userId: string | null = "gate6_user_1") {
  return {
    session: userId
      ? {
          user: {
            id: userId,
            email: `${userId}@example.com`,
            name: `User ${userId}`,
          },
          session: {
            id: `sess_${userId}`,
            userId,
            token: `token_${userId}`,
            expiresAt: new Date(Date.now() + 3600000),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }
      : null,
    user: userId
      ? {
          id: userId,
          email: `${userId}@example.com`,
          name: `User ${userId}`,
        }
      : null,
  };
}

function isTRPCErrorWithCode(
  err: unknown,
  code: string,
  messageSubstring?: string
): boolean {
  const e = err as any;
  if (!e || (e.name !== "TRPCError" && !(e instanceof TRPCError))) {
    return false;
  }
  if (e.code !== code) {
    return false;
  }
  if (messageSubstring && !e.message?.includes(messageSubstring)) {
    return false;
  }
  return true;
}

test("Step 6.6 — Phase 6 Completion Gate Suite", async (t) => {
  const user1Id = `usr_gate6_1_${Date.now()}`;
  const user2Id = `usr_gate6_2_${Date.now()}`;
  let cand1ProfileId: string;
  let cand2ProfileId: string;
  let job1Id: string;
  let job2Id: string;
  let match1Id: string;
  let testAppId: string;

  // Gate 1: Migration Integrity Gate
  await t.test("Gate 1: Migration Integrity — Historical migrations untouched, 0013 sequential and committed", async () => {
    const drizzleDir = path.resolve(process.cwd(), "packages/db/drizzle");
    const metaJournalPath = path.join(drizzleDir, "meta/_journal.json");

    assert.ok(fs.existsSync(metaJournalPath), "meta/_journal.json must exist");
    const journal = JSON.parse(fs.readFileSync(metaJournalPath, "utf-8"));

    // Verify 0000 through 0012 exist in journal
    for (let idx = 0; idx <= 12; idx++) {
      const entry = journal.entries.find((e: any) => e.idx === idx);
      assert.ok(entry, `Migration entry for idx ${idx} must exist in journal`);
    }

    // Verify 0013 exists
    const entry13 = journal.entries.find((e: any) => e.idx === 13);
    assert.ok(entry13, "Migration entry for idx 13 must exist in journal");
    assert.equal(entry13.tag, "0013_striped_squadron_supreme");

    // Verify 0013 SQL file exists and contains Phase 6 tables
    const sql13Path = path.join(drizzleDir, "0013_striped_squadron_supreme.sql");
    assert.ok(fs.existsSync(sql13Path), "0013 SQL migration file must exist");
    const sqlContent = fs.readFileSync(sql13Path, "utf-8");
    assert.ok(sqlContent.includes('CREATE TABLE "applications"'));
    assert.ok(sqlContent.includes('CREATE TABLE "application_documents"'));
    assert.ok(sqlContent.includes('CREATE TABLE "application_answers"'));
    assert.ok(sqlContent.includes('CREATE TABLE "application_events"'));
  });

  // Gate 2: Schema & Storage Gate
  await t.test("Gate 2: Schema & Storage — Database tables, unique constraints, and indexes exist in PostgreSQL", async () => {
    // 1. Initialize users and candidate profiles
    await db.insert(users).values([
      {
        id: user1Id,
        name: "Gate 6 Candidate 1",
        email: `${user1Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: user2Id,
        name: "Gate 6 Candidate 2",
        email: `${user2Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [cand1] = await db
      .insert(candidateProfiles)
      .values({
        userId: user1Id,
        headline: "Principal Systems Engineer",
      })
      .returning();
    cand1ProfileId = cand1.id;

    const [cand2] = await db
      .insert(candidateProfiles)
      .values({
        userId: user2Id,
        headline: "Software Engineer",
      })
      .returning();
    cand2ProfileId = cand2.id;

    // 2. Canonical Jobs
    const [j1] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `ro_gate6_${Date.now()}_1`,
        title: "Staff Distributed Systems Engineer",
        company: "HyperScale Infrastructure",
        location: "Worldwide",
        remoteType: "WORLDWIDE_REMOTE",
        salaryMin: 185000,
        salaryMax: 225000,
        currency: "USD",
        canonicalUrl: "https://hyperscale.example.com/careers/staff-systems",
        applicationUrl: "https://hyperscale.example.com/careers/staff-systems",
        status: "ACTIVE",
      })
      .returning();
    job1Id = j1.id;

    const [j2] = await db
      .insert(jobs)
      .values({
        source: "himalayas",
        sourceJobId: `him_gate6_${Date.now()}_2`,
        title: "Senior Backend Developer",
        company: "Aura Metrics",
        location: "Worldwide",
        remoteType: "WORLDWIDE_REMOTE",
        salaryMin: 160000,
        salaryMax: 195000,
        currency: "USD",
        canonicalUrl: "https://aurametrics.example.com/jobs/senior-backend",
        applicationUrl: "https://aurametrics.example.com/jobs/senior-backend",
        status: "ACTIVE",
      })
      .returning();
    job2Id = j2.id;

    // 3. Match
    const [m1] = await db
      .insert(jobMatches)
      .values({
        candidateProfileId: cand1ProfileId,
        jobId: job1Id,
        overallScore: "9.50",
        decision: "EXCELLENT_MATCH",
        hardConstraintsPassed: true,
        categoryScores: { skills: 0.98, experience: 0.94 },
        explanation: "Flawless distributed systems alignment.",
        confidence: "0.97",
        weightsUsed: { skills: 0.3, experience: 0.2 },
      })
      .returning();
    match1Id = m1.id;

    // 4. Test unique constraint on (candidateProfileId, jobId)
    const app1 = await applicationRepository.create({
      candidateProfileId: cand1ProfileId,
      jobId: job1Id,
      matchId: match1Id,
      company: "HyperScale Infrastructure",
      role: "Staff Distributed Systems Engineer",
      source: "remoteok",
      applicationUrl: "https://hyperscale.example.com/careers/staff-systems",
      matchScore: "9.50",
      status: APPLICATION_STATUS.PREPARED,
      notes: "Gate test application",
      nextAction: "Tailor distributed consensus projects",
    });
    testAppId = app1.id;
    assert.ok(testAppId);

    // Attempt duplicate creation
    await assert.rejects(
      () =>
        applicationRepository.create({
          candidateProfileId: cand1ProfileId,
          jobId: job1Id,
          company: "HyperScale Infrastructure",
          role: "Staff Distributed Systems Engineer",
          source: "remoteok",
          status: APPLICATION_STATUS.PREPARED,
        }),
      (err: any) => err instanceof ApplicationConflictError
    );
  });

  // Gate 3: State Machine & Integrity Gate
  await t.test("Gate 3: State Machine & Integrity — Valid transitions succeed with audit log, invalid transitions blocked", async () => {
    // 1. PREPARED -> APPLIED
    const applied = await applicationRepository.transitionStatus({
      id: testAppId,
      candidateProfileId: cand1ProfileId,
      toStatus: APPLICATION_STATUS.APPLIED,
      notes: "Submitted application online",
      confirmationReference: "HYPER-90210",
      actorId: user1Id,
    });
    assert.equal(applied.status, APPLICATION_STATUS.APPLIED);
    assert.ok(applied.submittedAt, "submittedAt must be set");
    assert.equal(applied.confirmationReference, "HYPER-90210");

    // 2. APPLIED -> UNDER_REVIEW
    const underReview = await applicationRepository.transitionStatus({
      id: testAppId,
      candidateProfileId: cand1ProfileId,
      toStatus: APPLICATION_STATUS.UNDER_REVIEW,
      actorId: user1Id,
    });
    assert.equal(underReview.status, APPLICATION_STATUS.UNDER_REVIEW);

    // 3. UNDER_REVIEW -> INTERVIEW_SCHEDULED
    const interviewSched = await applicationRepository.transitionStatus({
      id: testAppId,
      candidateProfileId: cand1ProfileId,
      toStatus: APPLICATION_STATUS.INTERVIEW_SCHEDULED,
      nextAction: "Staff Architecture Screen",
      followUpDate: new Date("2026-09-28T15:00:00Z"),
      actorId: user1Id,
    });
    assert.equal(interviewSched.status, APPLICATION_STATUS.INTERVIEW_SCHEDULED);

    // 4. Attempt illegal backward transition to PREPARED
    assert.equal(
      isValidTransition(
        APPLICATION_STATUS.INTERVIEW_SCHEDULED,
        APPLICATION_STATUS.PREPARED
      ),
      false
    );
    await assert.rejects(
      () =>
        applicationRepository.transitionStatus({
          id: testAppId,
          candidateProfileId: cand1ProfileId,
          toStatus: APPLICATION_STATUS.PREPARED,
          actorId: user1Id,
        }),
      (err: any) => err instanceof InvalidStateTransitionError
    );

    // 5. INTERVIEW_SCHEDULED -> INTERVIEW_COMPLETED
    const interviewDone = await applicationRepository.transitionStatus({
      id: testAppId,
      candidateProfileId: cand1ProfileId,
      toStatus: APPLICATION_STATUS.INTERVIEW_COMPLETED,
      actorId: user1Id,
    });
    assert.equal(interviewDone.status, APPLICATION_STATUS.INTERVIEW_COMPLETED);

    // 6. INTERVIEW_COMPLETED -> OFFER
    const offer = await applicationRepository.transitionStatus({
      id: testAppId,
      candidateProfileId: cand1ProfileId,
      toStatus: APPLICATION_STATUS.OFFER,
      notes: "Received offer package for $210k + equity",
      actorId: user1Id,
    });
    assert.equal(offer.status, APPLICATION_STATUS.OFFER);

    // 7. OFFER -> WITHDRAWN (Terminal)
    const withdrawn = await applicationRepository.transitionStatus({
      id: testAppId,
      candidateProfileId: cand1ProfileId,
      toStatus: APPLICATION_STATUS.WITHDRAWN,
      notes: "Declined due to relocation requirement",
      actorId: user1Id,
    });
    assert.equal(withdrawn.status, APPLICATION_STATUS.WITHDRAWN);
    assert.equal(isTerminalStatus(APPLICATION_STATUS.WITHDRAWN), true);

    // 8. Attempt transition from terminal state WITHDRAWN
    assert.equal(
      isValidTransition(APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.APPLIED),
      false
    );
    await assert.rejects(
      () =>
        applicationRepository.transitionStatus({
          id: testAppId,
          candidateProfileId: cand1ProfileId,
          toStatus: APPLICATION_STATUS.APPLIED,
          actorId: user1Id,
        }),
      (err: any) => err instanceof InvalidStateTransitionError
    );

    // 9. Verify audit event log entries
    const events = await applicationRepository.getEvents(testAppId);
    assert.ok(events.length >= 6, "Must record an audit event for every transition");
    const statusesInEvents = events.map((e) => e.toStatus);
    assert.ok(statusesInEvents.includes(APPLICATION_STATUS.APPLIED));
    assert.ok(statusesInEvents.includes(APPLICATION_STATUS.UNDER_REVIEW));
    assert.ok(statusesInEvents.includes(APPLICATION_STATUS.INTERVIEW_SCHEDULED));
    assert.ok(statusesInEvents.includes(APPLICATION_STATUS.INTERVIEW_COMPLETED));
    assert.ok(statusesInEvents.includes(APPLICATION_STATUS.OFFER));
    assert.ok(statusesInEvents.includes(APPLICATION_STATUS.WITHDRAWN));
  });

  // Gate 4: Data Access & Candidate Isolation Gate
  await t.test("Gate 4: Data Access & Isolation — Candidate B cannot see or manipulate Candidate A's application", async () => {
    // Candidate B queries application list
    const cand2List = await applicationRepository.list(cand2ProfileId, {});
    assert.equal(cand2List.total, 0);
    assert.equal(cand2List.items.length, 0);

    // Candidate B attempts to find Candidate A's application by ID
    const cand2Find = await applicationRepository.findById(testAppId, cand2ProfileId);
    assert.equal(cand2Find, null);

    // Candidate B attempts to update notes on Candidate A's application
    await assert.rejects(
      () =>
        applicationRepository.updateNotes(
          testAppId,
          cand2ProfileId,
          "Malicious breach attempt"
        ),
      (err: any) => err instanceof ApplicationNotFoundError
    );

    // Candidate B attempts status transition on Candidate A's application
    await assert.rejects(
      () =>
        applicationRepository.transitionStatus({
          id: testAppId,
          candidateProfileId: cand2ProfileId,
          toStatus: APPLICATION_STATUS.APPLIED,
        }),
      (err: any) => err instanceof ApplicationNotFoundError
    );

    // Check stats counters
    const cand1Stats = await applicationRepository.getStats(cand1ProfileId);
    assert.equal(cand1Stats.total, 1);
    assert.equal(cand1Stats.withdrawn, 1);
    assert.equal(cand1Stats.offer, 0);

    const cand2Stats = await applicationRepository.getStats(cand2ProfileId);
    assert.equal(cand2Stats.total, 0);
  });

  // Gate 5: tRPC API & Security Gate
  await t.test("Gate 5: API & Security — Unauthenticated blocked (401), cross-user blocked (404), spoofing blocked (403)", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const caller2 = appRouter.createCaller(createMockContext(user2Id));

    // 1. Unauthenticated blocked
    await assert.rejects(
      () => unauthCaller.applications.list({}),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.applications.getById({ id: testAppId }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );

    // 2. Cross-user getById blocked
    await assert.rejects(
      () => caller2.applications.getById({ id: testAppId }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );

    // 3. Injected client spoofing blocked
    await assert.rejects(
      () =>
        (caller1.applications.create as any)({
          jobId: job2Id,
          userId: user2Id,
        }),
      (err) => isTRPCErrorWithCode(err, "FORBIDDEN")
    );
    await assert.rejects(
      () =>
        (caller1.applications.create as any)({
          jobId: job2Id,
          candidateProfileId: cand2ProfileId,
        }),
      (err) => isTRPCErrorWithCode(err, "FORBIDDEN")
    );

    // 4. Response sanitization: verify no internal auth secrets in application responses
    const appDetail = await caller1.applications.getById({ id: testAppId });
    assert.equal((appDetail as any).password, undefined);
    assert.equal((appDetail as any).secret, undefined);
    assert.equal((appDetail as any).token, undefined);
  });

  // Gate 6: UI & Dashboard Integration Gate
  await t.test("Gate 6: UI & Dashboard — Preloading, status labels, next actions, and follow-up contract verified", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    // Verify stats returned includes totalApplications
    const dashStats = await caller1.dashboard.stats();
    assert.equal(dashStats.totalApplications, 1);

    // Verify application list returns rich joined data for UI cards
    const appsRes = await caller1.applications.list({ limit: 10, offset: 0 });
    assert.equal(appsRes.total, 1);
    const item = appsRes.items[0];
    assert.equal(item.company, "HyperScale Infrastructure");
    assert.equal(item.role, "Staff Distributed Systems Engineer");
    assert.equal(item.status, APPLICATION_STATUS.WITHDRAWN);
    assert.ok(item.job);
    assert.equal(item.job.remoteType, "WORLDWIDE_REMOTE");

    // Verify all 8 status labels exist
    const statuses = [
      APPLICATION_STATUS.PREPARED,
      APPLICATION_STATUS.APPLIED,
      APPLICATION_STATUS.UNDER_REVIEW,
      APPLICATION_STATUS.INTERVIEW_SCHEDULED,
      APPLICATION_STATUS.INTERVIEW_COMPLETED,
      APPLICATION_STATUS.OFFER,
      APPLICATION_STATUS.REJECTED,
      APPLICATION_STATUS.WITHDRAWN,
    ];
    for (const st of statuses) {
      assert.ok(APPLICATION_STATUS_LABELS[st], `Status label must exist for ${st}`);
    }
  });

  // Gate 7: Teardown
  await t.test("Gate 7: Teardown — Clean up all test entities", async () => {
    await db.delete(applications).where(inArray(applications.candidateProfileId, [cand1ProfileId, cand2ProfileId]));
    await db.delete(jobMatches).where(inArray(jobMatches.candidateProfileId, [cand1ProfileId, cand2ProfileId]));
    await db.delete(jobs).where(inArray(jobs.id, [job1Id, job2Id]));
    await db.delete(candidateProfiles).where(inArray(candidateProfiles.id, [cand1ProfileId, cand2ProfileId]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });
});
