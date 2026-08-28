/**
 * Job Hub — Phase 4 / Step 4.6
 * Matching API / tRPC Layer Test Suite
 *
 * Tests:
 * 1. Unauthenticated match listing → 401 (UNAUTHORIZED)
 * 2. Unauthenticated match request → 401 (UNAUTHORIZED)
 * 3. Authenticated user can request a match for their own profile
 * 4. Workflow trigger emits job.match.requested event
 * 5. Queued response does NOT falsely claim matching is complete
 * 6. Authenticated user can list their own matches
 * 7. Authenticated user can retrieve their own match (by match id or job id)
 * 8. User 2 cannot access User 1's match (FORBIDDEN)
 * 9. User 2 cannot trigger matching for User 1's candidate profile (FORBIDDEN)
 * 10. Invalid job ID rejected (NOT_FOUND)
 * 11. Invalid input rejected (BAD_REQUEST)
 * 12. Client ownership injection rejected (FORBIDDEN)
 * 13. Direct evaluation endpoint (matching.evaluate)
 * 14. User 2 cannot evaluate for User 1's candidate profile (FORBIDDEN)
 * 15. Correct tRPC response shape and field boundaries
 */

import test from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { candidateProfileRepository } from "@job-hub/candidate/server";
import { jobRepository } from "@job-hub/jobs/server";
import { jobMatchRepository } from "@job-hub/matching/server";
import { inngest } from "@job-hub/inngest/client";
import { db, users, candidateProfiles, jobs, jobMatches } from "@job-hub/db";
import { eq } from "drizzle-orm";

function createMockContext(userId: string | null = "user_api_test_1") {
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
  };
}

test("Step 4.6 — Matching API & tRPC Layer Test Suite", async (t) => {
  const user1Id = `usr_test_match_api_1_${Date.now()}`;
  const user2Id = `usr_test_match_api_2_${Date.now()}`;
  let user1ProfileId: string;
  let user2ProfileId: string;
  let testJobId: string;
  let testMatchId: string;

  // Intercept Inngest event dispatch for test verification
  const originalInngestSend = inngest.send;
  const sentEvents: Array<{ name: string; data: any }> = [];
  (inngest as any).send = async (eventOrEvents: any) => {
    const evs = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    sentEvents.push(...evs);
    return { ids: ["mock_event_id"] };
  };

  // Setup: Create test database entities
  await t.test("Setup: Create test users, candidate profiles, jobs, and matches in PostgreSQL", async () => {
    // Create User 1
    await db.insert(users).values({
      id: user1Id,
      name: "Alice Matcher",
      email: `${user1Id}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create Candidate Profile for User 1
    const p1 = await candidateProfileRepository.create({
      userId: user1Id,
      headline: "Senior Backend Engineer",
      profileData: {
        technicalSkills: [{ name: "Go" }, { name: "PostgreSQL" }, { name: "Kubernetes" }],
        experienceLevel: "SENIOR",
        yearsOfExperience: 6,
        locationPreferences: {
          remotePreference: "WORLDWIDE_REMOTE",
        },
      },
    });
    user1ProfileId = p1.id;

    // Create User 2
    await db.insert(users).values({
      id: user2Id,
      name: "Bob Matcher",
      email: `${user2Id}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create Candidate Profile for User 2
    const p2 = await candidateProfileRepository.create({
      userId: user2Id,
      headline: "Junior Designer",
      profileData: {
        technicalSkills: [{ name: "Figma" }, { name: "CSS" }],
        experienceLevel: "ENTRY",
      },
    });
    user2ProfileId = p2.id;

    // Create Canonical Job
    const j = await jobRepository.create({
      title: "Senior Distributed Systems Engineer",
      company: "Cloud Core Inc",
      remoteType: "WORLDWIDE_REMOTE",
      skills: ["Go", "PostgreSQL", "Kubernetes"],
      requirements: ["5+ years distributed systems"],
      experience: "5+ years",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/apply/dist-sys",
    });
    testJobId = j.id;

    // Create an existing match for User 1
    const m1 = await jobMatchRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: testJobId,
      overallScore: 8.85,
      decision: "STRONG_MATCH",
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: {
        skillsScore: 0.9,
        experienceScore: 0.9,
        remoteLocationScore: 1.0,
        projectsScore: 0.8,
        educationScore: 0.8,
        salaryScore: 0.8,
        freshnessScore: 0.9,
      },
      strengths: ["Production Go experience matches core requirement."],
      gaps: [],
      risks: [],
      explanation: "Excellent match for backend distributed systems role.",
      confidence: 0.95,
    });
    testMatchId = m1.id;
  });

  // 1. Unauthenticated match listing → 401
  await t.test("1. Unauthenticated match listing: rejected with UNAUTHORIZED", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));
    await assert.rejects(
      async () => unauthCaller.matching.list({}),
      (err: unknown) => err instanceof TRPCError && err.code === "UNAUTHORIZED"
    );
  });

  // 2. Unauthenticated match request → 401
  await t.test("2. Unauthenticated match request: rejected with UNAUTHORIZED", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));
    await assert.rejects(
      async () => unauthCaller.matching.request({ jobId: testJobId }),
      (err: unknown) => err instanceof TRPCError && err.code === "UNAUTHORIZED"
    );
  });

  // 3 & 4 & 5. Authenticated user can request match, emits Inngest event, returns QUEUED status
  await t.test("3. Authenticated match request: triggers Inngest workflow and returns truthful QUEUED status", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    sentEvents.length = 0; // reset

    const res = await caller1.matching.request({
      jobId: testJobId,
    });

    assert.equal(res.status, "QUEUED");
    assert.equal(res.candidateProfileId, user1ProfileId);
    assert.equal(res.jobId, testJobId);
    assert.ok(res.message.includes("queued"));

    // Verify Inngest event was emitted
    assert.equal(sentEvents.length, 1);
    assert.equal(sentEvents[0]?.name, "job.match.requested");
    assert.equal(sentEvents[0]?.data.candidateProfileId, user1ProfileId);
    assert.equal(sentEvents[0]?.data.jobId, testJobId);
  });

  // 6. Authenticated user can list their own matches
  await t.test("4. Authenticated match listing: lists matches strictly for authenticated candidate", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const listRes = await caller1.matching.list({});

    assert.ok(listRes.total >= 1);
    const item = listRes.items.find((i) => i.id === testMatchId);
    assert.ok(item !== undefined);
    assert.equal(item!.candidateProfileId, user1ProfileId);
    assert.equal(item!.decision, "STRONG_MATCH");
  });

  // 7. Authenticated user can retrieve their own match (by id and by jobId)
  await t.test("5. Authenticated match get: retrieves match by id and by jobId", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    // 7a. By match ID
    const getById = await caller1.matching.get({ id: testMatchId });
    assert.equal(getById.id, testMatchId);
    assert.equal(getById.candidateProfileId, user1ProfileId);
    assert.equal(getById.overallScore, 8.85);

    // 7b. By job ID
    const getByJobId = await caller1.matching.get({ jobId: testJobId });
    assert.equal(getByJobId.id, testMatchId);
    assert.equal(getByJobId.jobId, testJobId);
  });

  // 8. User 2 cannot access User 1's match (FORBIDDEN)
  await t.test("6. Cross-User Isolation: User 2 is rejected with FORBIDDEN when attempting to access User 1's match", async () => {
    const caller2 = appRouter.createCaller(createMockContext(user2Id));

    await assert.rejects(
      async () => caller2.matching.get({ id: testMatchId }),
      (err: unknown) => err instanceof TRPCError && err.code === "FORBIDDEN"
    );
  });

  // 9. User 2 cannot trigger matching for User 1's profile (FORBIDDEN)
  await t.test("7. Cross-User Isolation: User 2 cannot trigger matching with User 1's candidateProfileId", async () => {
    const caller2 = appRouter.createCaller(createMockContext(user2Id));

    await assert.rejects(
      async () =>
        caller2.matching.request({
          jobId: testJobId,
          candidateProfileId: user1ProfileId, // User 2 attempts to use User 1's profile
        }),
      (err: unknown) => err instanceof TRPCError && err.code === "FORBIDDEN"
    );
  });

  // 10. Invalid job ID rejected (NOT_FOUND)
  await t.test("8. Invalid job ID: rejected with NOT_FOUND", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    await assert.rejects(
      async () =>
        caller1.matching.request({
          jobId: "00000000-0000-0000-0000-000000000000",
        }),
      (err: unknown) => err instanceof TRPCError && err.code === "NOT_FOUND"
    );
  });

  // 11. Invalid input rejected (BAD_REQUEST)
  await t.test("9. Invalid input: rejected with BAD_REQUEST", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    await assert.rejects(
      async () =>
        caller1.matching.request({
          jobId: "", // empty jobId
        }),
      (err: unknown) => err instanceof TRPCError && err.code === "BAD_REQUEST"
    );
  });

  // 12. Client ownership injection rejected (FORBIDDEN)
  await t.test("10. Security: Client userId injection is rejected with FORBIDDEN", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    await assert.rejects(
      async () =>
        caller1.matching.request({
          jobId: testJobId,
          userId: user2Id, // Attempted client ownership override
        }),
      (err: unknown) => err instanceof TRPCError && err.code === "FORBIDDEN"
    );
  });

  // 13. Direct evaluation endpoint (matching.evaluate)
  await t.test("11. Direct evaluation endpoint: computes in-memory match evaluation result cleanly", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    const evalRes = await caller1.matching.evaluate({
      jobId: testJobId,
    });

    assert.ok(evalRes.overallScore >= 7.0);
    assert.ok(evalRes.hardConstraints.passed === true);
    assert.ok(evalRes.decision === "STRONG_MATCH" || evalRes.decision === "EXCELLENT_MATCH");
    assert.ok(typeof evalRes.categoryScores.skillsScore === "number");
  });

  // 14. User 2 cannot evaluate for User 1's profile (FORBIDDEN)
  await t.test("12. Direct evaluation authorization: User 2 cannot evaluate using User 1's candidateProfileId", async () => {
    const caller2 = appRouter.createCaller(createMockContext(user2Id));

    await assert.rejects(
      async () =>
        caller2.matching.evaluate({
          jobId: testJobId,
          candidateProfileId: user1ProfileId,
        }),
      (err: unknown) => err instanceof TRPCError && err.code === "FORBIDDEN"
    );
  });

  // 15. Correct tRPC response shape & field boundaries
  await t.test("13. Response boundaries: returns sanitized public fields without leaking database secrets", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const match = await caller1.matching.get({ id: testMatchId });

    // Verify public shape
    assert.equal(typeof match.id, "string");
    assert.equal(typeof match.candidateProfileId, "string");
    assert.equal(typeof match.jobId, "string");
    assert.equal(typeof match.overallScore, "number");
    assert.equal(typeof match.decision, "string");
    assert.equal(typeof match.hardConstraintsPassed, "boolean");
    assert.ok(Array.isArray(match.hardConstraintFailures));
    assert.equal(typeof match.categoryScores, "object");
    assert.ok(Array.isArray(match.strengths));
    assert.ok(Array.isArray(match.gaps));
    assert.ok(Array.isArray(match.risks));
    assert.equal(typeof match.explanation, "string");
    assert.equal(typeof match.confidence, "number");
    assert.equal(typeof match.weightsUsed, "object");

    // Ensure internal secrets/passwords are NOT present
    assert.equal((match as any).password, undefined);
    assert.equal((match as any).dbPassword, undefined);
    assert.equal((match as any).openAiKey, undefined);
  });

  // Teardown: Clean up test entities
  await t.test("Teardown: Restore inngest.send and clean up test records", async () => {
    (inngest as any).send = originalInngestSend;

    // Delete created matches
    await db.delete(jobMatches).where(eq(jobMatches.candidateProfileId, user1ProfileId));
    // Delete created jobs
    await db.delete(jobs).where(eq(jobs.id, testJobId));
    // Delete created candidate profiles
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, user1ProfileId));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, user2ProfileId));
    // Delete test users
    await db.delete(users).where(eq(users.id, user1Id));
    await db.delete(users).where(eq(users.id, user2Id));
  });
});
