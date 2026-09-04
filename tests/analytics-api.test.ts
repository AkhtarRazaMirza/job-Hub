/**
 * Job Hub — Phase 9 / Step 9.4 Focused Test Suite
 * Analytics tRPC Router & Protected Procedures
 *
 * Verifies:
 * 1. Unauthenticated Rejection: All endpoints throw UNAUTHORIZED without active session.
 * 2. Missing Profile Rejection: Throws NOT_FOUND if user has no candidate profile.
 * 3. Identity Spoofing Rejection: Throws FORBIDDEN if foreign userId or candidateProfileId supplied.
 * 4. Multi-Tenant Isolation: Caller 1 only receives Candidate 1 metrics; Caller 2 only receives Candidate 2.
 * 5. Full Endpoint Verification: overview, funnel, matchScores, sources, roles, resumeVersions, trends.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  applications,
} from "@job-hub/db";
import { eq } from "drizzle-orm";

function isTRPCErrorWithCode(err: unknown, code: string): boolean {
  const e = err as any;
  if (!e || (e.name !== "TRPCError" && !(e instanceof TRPCError))) {
    return false;
  }
  return e.code === code;
}

function createMockContext(userId: string | null) {
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

test("Phase 9 / Step 9.4 — Analytics tRPC Router & Security Suite", async (t) => {
  const ts = Date.now();
  const testUserId1 = `usr_trpc_an_1_${ts}`;
  const testUserId2 = `usr_trpc_an_2_${ts}`;
  const testUserNoProf = `usr_trpc_no_prof_${ts}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let testJobId1: string;
  let testJobId2: string;

  const unauthCaller = appRouter.createCaller(createMockContext(null));
  const caller1 = appRouter.createCaller(createMockContext(testUserId1));
  const caller2 = appRouter.createCaller(createMockContext(testUserId2));
  const callerNoProf = appRouter.createCaller(createMockContext(testUserNoProf));

  await t.test("Setup: Create database users, profiles, jobs, and applications", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Analytics User 1",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Analytics User 2",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserNoProf,
        name: "No Profile User",
        email: `${testUserNoProf}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Profiles
    const [c1] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId1, headline: "Backend Engineer" })
      .returning();
    candidate1Id = c1.id;

    const [c2] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId2, headline: "Frontend Engineer" })
      .returning();
    candidate2Id = c2.id;

    // 3. Jobs
    const [j1, j2] = await db
      .insert(jobs)
      .values([
        {
          source: "remoteok",
          sourceJobId: `ro_trpc_${ts}_1`,
          title: "Principal Engineer",
          company: "Alpha Core",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/1",
        },
        {
          source: "himalayas",
          sourceJobId: `him_trpc_${ts}_2`,
          title: "Lead Architect",
          company: "Beta Systems",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://himalayas.app/jobs/2",
        },
      ])
      .returning();
    testJobId1 = j1.id;
    testJobId2 = j2.id;

    // 4. Candidate 1 Applications
    await db.insert(applications).values([
      {
        candidateProfileId: candidate1Id,
        jobId: testJobId1,
        company: "Alpha Core",
        role: "Principal Engineer",
        source: "remoteok",
        matchScore: "91.00",
        status: "OFFER",
        submittedAt: new Date(),
      },
      {
        candidateProfileId: candidate1Id,
        jobId: testJobId2,
        company: "Beta Systems",
        role: "Lead Architect",
        source: "himalayas",
        matchScore: "82.50",
        status: "INTERVIEW_SCHEDULED",
        submittedAt: new Date(),
      },
    ]);

    // 5. Candidate 2 Applications
    await db.insert(applications).values({
      candidateProfileId: candidate2Id,
      jobId: testJobId1,
      company: "Alpha Core",
      role: "Frontend Lead",
      source: "remoteok",
      matchScore: "70.00",
      status: "REJECTED",
      submittedAt: new Date(),
    });
  });

  await t.test("1. Unauthenticated access: all endpoints throw UNAUTHORIZED", async () => {
    await assert.rejects(async () => unauthCaller.analytics.overview(), (err: unknown) =>
      isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(async () => unauthCaller.analytics.funnel(), (err: unknown) =>
      isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(async () => unauthCaller.analytics.matchScores(), (err: unknown) =>
      isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(async () => unauthCaller.analytics.sources(), (err: unknown) =>
      isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(async () => unauthCaller.analytics.roles(), (err: unknown) =>
      isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(async () => unauthCaller.analytics.resumeVersions(), (err: unknown) =>
      isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(async () => unauthCaller.analytics.trends(), (err: unknown) =>
      isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
  });

  await t.test("2. Missing candidate profile: throws NOT_FOUND", async () => {
    await assert.rejects(async () => callerNoProf.analytics.overview(), (err: unknown) =>
      isTRPCErrorWithCode(err, "NOT_FOUND")
    );
  });

  await t.test("3. Identity spoofing protection: foreign userId / profileId throws FORBIDDEN", async () => {
    await assert.rejects(
      async () => caller1.analytics.overview({ userId: testUserId2 }),
      (err: unknown) => isTRPCErrorWithCode(err, "FORBIDDEN")
    );

    await assert.rejects(
      async () => caller1.analytics.overview({ candidateProfileId: candidate2Id }),
      (err: unknown) => isTRPCErrorWithCode(err, "FORBIDDEN")
    );
  });

  await t.test("4. Authorized queries: returns candidate 1 metrics with truthful rates", async () => {
    const overview = await caller1.analytics.overview();
    assert.equal(overview.totalApplications, 2);
    assert.equal(overview.appliedCount, 2);
    assert.equal(overview.offerCount, 1);
    assert.equal(overview.interviewScheduledCount, 1);
    assert.equal(overview.interviewRate.percentage, 100.0); // 2/2 reached interview
    assert.equal(overview.offerRate.percentage, 50.0); // 1/2 reached offer
    assert.equal(overview.averageMatchScore.average, 86.8); // (91.00 + 82.50) / 2

    const funnel = await caller1.analytics.funnel();
    assert.equal(funnel.totalApplications, 2);
    assert.equal(funnel.stages.length, 6);

    const matchScores = await caller1.analytics.matchScores();
    assert.equal(matchScores.length, 5); // All 5 score bands
    const band85to100 = matchScores.find((b) => b.band === "85-100");
    assert.ok(band85to100);
    assert.equal(band85to100.totalApplications, 1); // 91.00

    const sources = await caller1.analytics.sources();
    assert.equal(sources.length, 2);

    const roles = await caller1.analytics.roles();
    assert.equal(roles.length, 2);

    const resumeVersions = await caller1.analytics.resumeVersions();
    assert.ok(Array.isArray(resumeVersions));

    const trends = await caller1.analytics.trends({ granularity: "day" });
    assert.ok(Array.isArray(trends.dataPoints));
  });

  await t.test("5. Multi-Tenant Isolation: Caller 2 observes only Candidate 2 data", async () => {
    const overview2 = await caller2.analytics.overview();
    assert.equal(overview2.totalApplications, 1);
    assert.equal(overview2.rejectedCount, 1);
    assert.equal(overview2.offerCount, 0);
    assert.equal(overview2.averageMatchScore.average, 70.0);
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));
    await db.delete(users).where(eq(users.id, testUserNoProf));
    await db.delete(jobs).where(eq(jobs.id, testJobId1));
    await db.delete(jobs).where(eq(jobs.id, testJobId2));
  });
});
