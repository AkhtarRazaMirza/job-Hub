/**
 * Job Hub — Phase 6 / Step 6.4
 * Application Tracking tRPC API & Security Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 12 & 13, §5 Phase 6
 * - 02_how_to_build.md §10, §14, §17
 * - 04_ai_agent_skills.md §17 & §18
 *
 * Tests:
 * 1. Unauthenticated access: all application procedures throw 401 UNAUTHORIZED
 * 2. Profile check: user without candidate profile throws 404 NOT_FOUND
 * 3. Authenticated create: candidate creates application with initial status PREPARED
 * 4. Duplicate prevention: second create for same job throws 409 CONFLICT
 * 5. Nonexistent job: create with invalid job ID throws 404 NOT_FOUND
 * 6. Read by ID: returns application joined with job, match score, and events
 * 7. List applications: returns candidate's applications with pagination and filters
 * 8. Status transition: valid transition PREPARED -> APPLIED sets submittedAt timestamp
 * 9. Status transition: progressive lifecycle APPLIED -> UNDER_REVIEW -> INTERVIEW_SCHEDULED
 * 10. Status transition: invalid transition rejected with 400 BAD_REQUEST
 * 11. Terminal state enforcement: terminal state WITHDRAWN cannot transition further
 * 12. Notes update: candidate updates notes successfully
 * 13. Follow-up update: candidate updates follow-up schedule and next action
 * 14. Withdraw procedure: candidate withdraws application with reason
 * 15. Cross-user isolation: User 2 cannot read, list, transition, or delete User 1's applications
 * 16. Spoofing protection: Injected client userId or candidateProfileId is rejected with 403 FORBIDDEN
 * 17. Application stats: returns truthful aggregated counts across statuses
 * 18. Response sanitization: returns sanitized entity without leaking sensitive database fields
 * 19. Teardown: clean up test entities
 */

import test from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { APPLICATION_STATUS } from "@job-hub/applications";
import { db, users, candidateProfiles, jobs, jobMatches, applications, applicationEvents } from "@job-hub/db";
import { eq } from "drizzle-orm";

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

function createMockContext(userId: string | null = "usr_test_app_api_1") {
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

test("Step 6.4 — Application Tracking tRPC API & Security Suite", async (t) => {
  const testUserId1 = `usr_test_app_api_1_${Date.now()}`;
  const testUserId2 = `usr_test_app_api_2_${Date.now()}`;
  const testUserIdNoProfile = `usr_test_app_no_prof_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let testJobId1: string;
  let testJobId2: string;
  let testMatchId1: string;
  let createdAppId: string;

  const unauthCaller = appRouter.createCaller(createMockContext(null));
  const caller1 = appRouter.createCaller(createMockContext(testUserId1));
  const caller2 = appRouter.createCaller(createMockContext(testUserId2));
  const callerNoProfile = appRouter.createCaller(createMockContext(testUserIdNoProfile));

  // Setup: Create test users, candidate profiles, and jobs
  await t.test("Setup: Create test users, candidate profiles, and jobs", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "API Test User 1",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "API Test User 2",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserIdNoProfile,
        name: "No Profile User",
        email: `${testUserIdNoProfile}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Candidate Profiles
    const [cand1] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId1,
        headline: "Principal Systems Architect",
      })
      .returning();
    candidate1Id = cand1.id;

    const [cand2] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId2,
        headline: "Junior Developer",
      })
      .returning();
    candidate2Id = cand2.id;

    // 3. Canonical Jobs
    const [job1] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `ro_api_${Date.now()}_1`,
        title: "Lead Platform Engineer",
        company: "Nebula Core",
        location: "Worldwide",
        remoteType: "WORLDWIDE_REMOTE",
        salaryMin: 170000,
        salaryMax: 210000,
        currency: "USD",
        canonicalUrl: "https://nebulacore.example.com/jobs/lead-platform",
        applicationUrl: "https://nebulacore.example.com/jobs/lead-platform",
        status: "ACTIVE",
      })
      .returning();
    testJobId1 = job1.id;

    const [job2] = await db
      .insert(jobs)
      .values({
        source: "himalayas",
        sourceJobId: `him_api_${Date.now()}_2`,
        title: "Senior SRE",
        company: "Vortex Data",
        location: "US/EU",
        remoteType: "REGION_REMOTE",
        salaryMin: 150000,
        salaryMax: 190000,
        currency: "USD",
        canonicalUrl: "https://vortexdata.example.com/careers/sre",
        applicationUrl: "https://vortexdata.example.com/careers/sre",
        status: "ACTIVE",
      })
      .returning();
    testJobId2 = job2.id;

    // 4. Job Match
    const [m1] = await db
      .insert(jobMatches)
      .values({
        candidateProfileId: candidate1Id,
        jobId: testJobId1,
        overallScore: "9.40",
        decision: "EXCELLENT_MATCH",
        hardConstraintsPassed: true,
        categoryScores: { skills: 0.96, experience: 0.92 },
        explanation: "Superb platform engineering profile alignment.",
        confidence: "0.96",
        weightsUsed: { skills: 0.3, experience: 0.2 },
      })
      .returning();
    testMatchId1 = m1.id;
  });

  // 1. Unauthenticated access
  await t.test("1. Unauthenticated access: all application procedures throw 401 UNAUTHORIZED", async () => {
    await assert.rejects(
      () => unauthCaller.applications.create({ jobId: testJobId1 }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.applications.getById({ id: "some_id" }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.applications.list({}),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () =>
        unauthCaller.applications.transitionStatus({
          id: "some_id",
          toStatus: APPLICATION_STATUS.APPLIED,
        }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.applications.withdraw({ id: "some_id" }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.applications.stats(),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
  });

  // 2. Profile check
  await t.test("2. Profile check: user without candidate profile throws 404 NOT_FOUND", async () => {
    await assert.rejects(
      () => callerNoProfile.applications.create({ jobId: testJobId1 }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND", "Candidate profile not found")
    );
  });

  // 3. Authenticated create
  await t.test("3. Authenticated create: candidate creates application with status PREPARED", async () => {
    const app = await caller1.applications.create({
      jobId: testJobId1,
      matchId: testMatchId1,
      notes: "Initial tracking setup",
      nextAction: "Customize CV for platform lead position",
    });

    assert.ok(app.id);
    assert.equal(app.candidateProfileId, candidate1Id);
    assert.equal(app.jobId, testJobId1);
    assert.equal(app.company, "Nebula Core");
    assert.equal(app.role, "Lead Platform Engineer");
    assert.equal(app.matchScore, "9.40");
    assert.equal(app.status, APPLICATION_STATUS.PREPARED);
    assert.equal(app.submittedAt, null);
    assert.equal(app.notes, "Initial tracking setup");
    assert.equal(app.nextAction, "Customize CV for platform lead position");

    createdAppId = app.id;
  });

  // 4. Duplicate prevention
  await t.test("4. Duplicate prevention: second create for same job throws 409 CONFLICT", async () => {
    await assert.rejects(
      () =>
        caller1.applications.create({
          jobId: testJobId1,
        }),
      (err) => isTRPCErrorWithCode(err, "CONFLICT", "already been created")
    );
  });

  // 5. Nonexistent job
  await t.test("5. Nonexistent job: create with invalid job ID throws 404 NOT_FOUND", async () => {
    await assert.rejects(
      () =>
        caller1.applications.create({
          jobId: "nonexistent_job_123",
        }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );
  });

  // 6. Read by ID
  await t.test("6. Read by ID: returns application joined with job, match score, and events", async () => {
    const detail = await caller1.applications.getById({ id: createdAppId });
    assert.equal(detail.id, createdAppId);
    assert.equal(detail.job.company, "Nebula Core");
    assert.equal(detail.match?.overallScore, "9.40");
    assert.ok(detail.events.length >= 1);
    assert.equal(detail.events[0].eventType, "CREATED");
  });

  // 7. List applications
  await t.test("7. List applications: returns candidate's applications with pagination", async () => {
    const list = await caller1.applications.list({ limit: 10, offset: 0 });
    assert.equal(list.total, 1);
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].id, createdAppId);
  });

  // 8. Status transition: PREPARED -> APPLIED sets submittedAt
  await t.test("8. Status transition: valid transition PREPARED -> APPLIED sets submittedAt timestamp", async () => {
    const updated = await caller1.applications.transitionStatus({
      id: createdAppId,
      toStatus: APPLICATION_STATUS.APPLIED,
      notes: "Submitted via company portal",
      confirmationReference: "REF-992384",
      nextAction: "Wait for recruiter confirmation",
    });

    assert.equal(updated.status, APPLICATION_STATUS.APPLIED);
    assert.ok(updated.submittedAt);
    assert.equal(updated.confirmationReference, "REF-992384");
  });

  // 9. Progressive lifecycle: APPLIED -> UNDER_REVIEW -> INTERVIEW_SCHEDULED
  await t.test("9. Status transition: progressive lifecycle APPLIED -> UNDER_REVIEW -> INTERVIEW_SCHEDULED", async () => {
    const underReview = await caller1.applications.transitionStatus({
      id: createdAppId,
      toStatus: APPLICATION_STATUS.UNDER_REVIEW,
      notes: "Application viewed by hiring manager",
    });
    assert.equal(underReview.status, APPLICATION_STATUS.UNDER_REVIEW);

    const interviewSched = await caller1.applications.transitionStatus({
      id: createdAppId,
      toStatus: APPLICATION_STATUS.INTERVIEW_SCHEDULED,
      nextAction: "Technical architectural interview",
      followUpDate: new Date("2026-09-20T16:00:00Z").toISOString(),
    });
    assert.equal(interviewSched.status, APPLICATION_STATUS.INTERVIEW_SCHEDULED);
    assert.equal(interviewSched.nextAction, "Technical architectural interview");
  });

  // 10. Invalid transition rejected with 400 BAD_REQUEST
  await t.test("10. Status transition: invalid transition rejected with 400 BAD_REQUEST", async () => {
    // Cannot jump backwards from INTERVIEW_SCHEDULED to PREPARED
    await assert.rejects(
      () =>
        caller1.applications.transitionStatus({
          id: createdAppId,
          toStatus: APPLICATION_STATUS.PREPARED,
        }),
      (err) => isTRPCErrorWithCode(err, "BAD_REQUEST", "Invalid application status transition")
    );
  });

  // 11. Notes update
  await t.test("11. Notes update: candidate updates notes successfully", async () => {
    const updated = await caller1.applications.updateNotes({
      id: createdAppId,
      notes: "Spoke with recruiter; positive initial feedback",
    });
    assert.equal(updated.notes, "Spoke with recruiter; positive initial feedback");
  });

  // 12. Follow-up update
  await t.test("12. Follow-up update: candidate updates follow-up schedule and next action", async () => {
    const updated = await caller1.applications.updateFollowUp({
      id: createdAppId,
      nextAction: "System design preparation",
      followUpDate: new Date("2026-09-22T10:00:00Z").toISOString(),
    });
    assert.equal(updated.nextAction, "System design preparation");
    assert.ok(updated.followUpDate);
  });

  // 13. Withdraw procedure
  await t.test("13. Withdraw procedure: candidate withdraws application with reason", async () => {
    const withdrawn = await caller1.applications.withdraw({
      id: createdAppId,
      reason: "Accepted another counter-offer",
    });
    assert.equal(withdrawn.status, APPLICATION_STATUS.WITHDRAWN);

    // Terminal state cannot transition anywhere!
    await assert.rejects(
      () =>
        caller1.applications.transitionStatus({
          id: createdAppId,
          toStatus: APPLICATION_STATUS.APPLIED,
        }),
      (err) => isTRPCErrorWithCode(err, "BAD_REQUEST", "terminal")
    );
  });

  // 14. Cross-user isolation
  await t.test("14. Cross-user isolation: User 2 cannot read, transition, or delete User 1's applications", async () => {
    // User 2 sees 0 applications
    const cand2List = await caller2.applications.list({});
    assert.equal(cand2List.total, 0);
    assert.equal(cand2List.items.length, 0);

    // User 2 cannot read User 1's application by ID
    await assert.rejects(
      () => caller2.applications.getById({ id: createdAppId }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );

    // User 2 cannot transition User 1's application
    await assert.rejects(
      () =>
        caller2.applications.transitionStatus({
          id: createdAppId,
          toStatus: APPLICATION_STATUS.APPLIED,
        }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );

    // User 2 cannot update User 1's notes
    await assert.rejects(
      () =>
        caller2.applications.updateNotes({
          id: createdAppId,
          notes: "Malicious update attempt",
        }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );

    // User 2 cannot delete User 1's application
    await assert.rejects(
      () => caller2.applications.delete({ id: createdAppId }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );
  });

  // 15. Spoofing protection
  await t.test("15. Spoofing protection: Injected client userId or candidateProfileId is rejected with 403 FORBIDDEN", async () => {
    // Spoofed userId
    await assert.rejects(
      () =>
        (caller1.applications.create as any)({
          jobId: testJobId2,
          userId: testUserId2,
        }),
      (err) => isTRPCErrorWithCode(err, "FORBIDDEN")
    );

    // Spoofed candidateProfileId
    await assert.rejects(
      () =>
        (caller1.applications.create as any)({
          jobId: testJobId2,
          candidateProfileId: candidate2Id,
        }),
      (err) => isTRPCErrorWithCode(err, "FORBIDDEN")
    );
  });

  // 16. Application stats
  await t.test("16. Application stats: returns truthful aggregated counts across statuses", async () => {
    const stats = await caller1.applications.stats();
    assert.equal(stats.total, 1);
    assert.equal(stats.withdrawn, 1);
    assert.equal(stats.offer, 0);

    const cand2Stats = await caller2.applications.stats();
    assert.equal(cand2Stats.total, 0);
  });

  // 17. Response sanitization
  await t.test("17. Response sanitization: returns sanitized entity without leaking sensitive database fields", async () => {
    const app = await caller1.applications.getById({ id: createdAppId });
    assert.equal((app as any).password, undefined);
    assert.equal((app as any).token, undefined);
    assert.equal((app as any).secret, undefined);
  });

  // 18. Teardown
  await t.test("18. Teardown: clean up test entities", async () => {
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));
    await db.delete(users).where(eq(users.id, testUserIdNoProfile));
    await db.delete(jobs).where(eq(jobs.id, testJobId1));
    await db.delete(jobs).where(eq(jobs.id, testJobId2));
  });
});
