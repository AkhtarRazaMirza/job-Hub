/**
 * Job Hub — Phase 10 / Step 10.6
 * Learning tRPC Router & API Security Test Suite
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected with UNAUTHORIZED.
 * 2. Authenticated requests without a candidate profile throw NOT_FOUND.
 * 3. Identity spoofing protection: foreign userId / candidateProfileId throws FORBIDDEN.
 * 4. Authorized operations: getRecommendations, getRecommendation, dismiss, apply, refresh.
 * 5. Cross-tenant isolation: Candidate 2 cannot access or mutate Candidate 1's recommendations.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  applications,
} from "@job-hub/db";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { buildEvidenceMetric } from "../packages/applications/src/learning/analyzer";
import { learningRepository } from "../packages/applications/src/server";

function isTRPCErrorWithCode(err: unknown, code: string): boolean {
  const e = err as any;
  if (!e || (e.name !== "TRPCError" && !(e instanceof TRPCError))) {
    return false;
  }
  return e.code === code;
}

function createMockContext(userId?: string) {
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
          },
        }
      : null,
    user: userId
      ? {
          id: userId,
          email: `${userId}@example.com`,
        }
      : null,
  } as any;
}

test("Phase 10 / Step 10.6 — Learning tRPC Router & Security Suite", async (t) => {
  const ts = Date.now();
  const testUser1Id = `usr_p10_api_1_${ts}`;
  const testUser2Id = `usr_p10_api_2_${ts}`;
  const testUserNoProf = `usr_p10_api_noprof_${ts}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let job1Id: string;
  let job2Id: string;
  let rec1Id: string;

  const unauthedCaller = appRouter.createCaller(createMockContext(undefined));
  const noProfCaller = appRouter.createCaller(createMockContext(testUserNoProf));
  const caller1 = appRouter.createCaller(createMockContext(testUser1Id));
  const caller2 = appRouter.createCaller(createMockContext(testUser2Id));

  await t.test("Setup: Create database users, profiles, jobs, applications and recommendations", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: testUser1Id,
        name: "Learning API User 1",
        email: `${testUser1Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUser2Id,
        name: "Learning API User 2",
        email: `${testUser2Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserNoProf,
        name: "Learning API User No Prof",
        email: `${testUserNoProf}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Candidate Profiles
    const [cp1] = await db
      .insert(candidateProfiles)
      .values({ userId: testUser1Id, headline: "AI Platform Engineer" })
      .returning();
    candidate1Id = cp1.id;

    const [cp2] = await db
      .insert(candidateProfiles)
      .values({ userId: testUser2Id, headline: "Frontend Specialist" })
      .returning();
    candidate2Id = cp2.id;

    // 3. Jobs
    const [j1, j2] = await db
      .insert(jobs)
      .values([
        {
          source: "remoteok",
          sourceJobId: `ro_api_${ts}_1`,
          title: "AI Engineer",
          company: "Nexus AI",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/1",
          skills: ["Python", "PyTorch"],
        },
        {
          source: "remoteok",
          sourceJobId: `ro_api_${ts}_2`,
          title: "AI Engineer",
          company: "Vertex Tech",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/2",
          skills: ["Python", "TypeScript"],
        },
      ])
      .returning();
    job1Id = j1.id;
    job2Id = j2.id;

    // 4. Applications for Candidate 1 (2 apps, 2 interviews -> strong pattern)
    await db.insert(applications).values([
      {
        candidateProfileId: candidate1Id,
        jobId: job1Id,
        company: "Nexus AI",
        role: "AI Engineer",
        source: "remoteok",
        matchScore: "95.00",
        status: "INTERVIEW_SCHEDULED",
        submittedAt: new Date(),
      },
      {
        candidateProfileId: candidate1Id,
        jobId: job2Id,
        company: "Vertex Tech",
        role: "AI Engineer",
        source: "remoteok",
        matchScore: "92.00",
        status: "OFFER",
        submittedAt: new Date(),
      },
    ]);

    // 5. Seed a saved recommendation for Candidate 1
    const evidenceMetric = buildEvidenceMetric({ applications: 20, interviews: 6, offers: 2 });
    const [savedRec] = await learningRepository.saveRecommendationsIdempotent(candidate1Id, [
      {
        type: "ROLE_FOCUS",
        targetKey: "role:AI Engineer",
        title: "Focus on AI Engineer Roles",
        summary: "AI Engineer positions are converting to interviews at 30.0%.",
        explanation: "Observed outcome analysis indicates stronger results.",
        confidence: "HIGH",
        evidence: {
          dimension: "role",
          primaryValue: "AI Engineer",
          primaryMetric: evidenceMetric,
          sampleSize: 20,
          minSampleSizeThreshold: 4,
          isStatisticallyMeaningful: true,
          explanation: "Explanation text.",
        },
      },
    ]);
    rec1Id = savedRec.id;
  });

  await t.test("1. Unauthenticated access: all endpoints throw UNAUTHORIZED", async () => {
    await assert.rejects(
      async () => unauthedCaller.learning.getRecommendations(),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      async () => unauthedCaller.learning.getRecommendation({ id: rec1Id }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      async () => unauthedCaller.learning.dismiss({ id: rec1Id }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      async () => unauthedCaller.learning.acknowledge({ id: rec1Id }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      async () => unauthedCaller.learning.refresh(),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
  });

  await t.test("2. Missing candidate profile: throws NOT_FOUND", async () => {
    await assert.rejects(
      async () => noProfCaller.learning.getRecommendations(),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );
  });

  await t.test("3. Identity spoofing protection: foreign userId / profileId throws FORBIDDEN", async () => {
    await assert.rejects(
      async () => caller1.learning.getRecommendations({ userId: testUser2Id }),
      (err: any) => err.code === "FORBIDDEN"
    );
    await assert.rejects(
      async () => caller1.learning.getRecommendations({ candidateProfileId: candidate2Id }),
      (err: any) => err.code === "FORBIDDEN"
    );
    await assert.rejects(
      async () => caller1.learning.dismiss({ id: rec1Id, userId: testUser2Id }),
      (err: any) => err.code === "FORBIDDEN"
    );
  });

  await t.test("4. Authorized queries: getRecommendations & getRecommendation", async () => {
    const recs = await caller1.learning.getRecommendations();
    assert.ok(recs.length >= 1);
    assert.equal(recs[0].candidateProfileId, candidate1Id);
    assert.equal(recs[0].status, "ACTIVE");

    const recDetail = await caller1.learning.getRecommendation({ id: rec1Id });
    assert.equal(recDetail.id, rec1Id);
    assert.equal(recDetail.type, "ROLE_FOCUS");
    assert.equal(recDetail.confidence, "HIGH");
  });

  await t.test("5. Lifecycle mutations: dismiss & apply", async () => {
    // Dismiss
    const dismissed = await caller1.learning.dismiss({ id: rec1Id });
    assert.equal(dismissed.id, rec1Id);
    assert.equal(dismissed.status, "DISMISSED");

    // Active list no longer contains dismissed recommendation
    const activeRecs = await caller1.learning.getRecommendations({ status: "ACTIVE" });
    const foundActive = activeRecs.find((r) => r.id === rec1Id);
    assert.equal(foundActive, undefined);

    // Apply (change status to APPLIED)
    const applied = await caller1.learning.acknowledge({ id: rec1Id });
    assert.equal(applied.id, rec1Id);
    assert.equal(applied.status, "APPLIED");
  });

  await t.test("6. Multi-Tenant Isolation: Caller 2 cannot access or mutate Caller 1's recommendation", async () => {
    // Caller 2 querying Caller 1's recommendation throws NOT_FOUND
    await assert.rejects(
      async () => caller2.learning.getRecommendation({ id: rec1Id }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );

    // Caller 2 dismissing Caller 1's recommendation throws NOT_FOUND
    await assert.rejects(
      async () => caller2.learning.dismiss({ id: rec1Id }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(users).where(eq(users.id, testUser1Id));
    await db.delete(users).where(eq(users.id, testUser2Id));
    await db.delete(users).where(eq(users.id, testUserNoProf));
    await db.delete(jobs).where(eq(jobs.id, job1Id));
    await db.delete(jobs).where(eq(jobs.id, job2Id));
  });
});
