/**
 * Job Hub — Phase 10 / Step 10.9 Focused Test Suite
 * Recommendation Feedback Loop & Lifecycle Governance
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning feedback loop")
 * - 04_ai_agent_skills.md §20 ("Learning Skill")
 *
 * Verifies:
 * 1. User Dismissal Flow: Active recommendation transitions to DISMISSED with timestamp.
 * 2. User Acknowledgment Flow: Active recommendation transitions to APPLIED with timestamp.
 * 3. Learning Loop Idempotency: Neither dismissed nor applied recommendations are resurrected as ACTIVE.
 * 4. Absolute Candidate Truth Protection: Candidate profile, skills, and resume are 100% unmutated.
 * 5. Multi-Tenant Isolation & Anti-Spoofing: Cross-user mutation is strictly forbidden.
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
  recommendations,
} from "@job-hub/db";
import {
  learningRepository,
  outcomeAnalyzer,
  patternDetector,
} from "../packages/applications/src/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";

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

test("Phase 10 / Step 10.9 — Recommendation Feedback Loop Suite", async (t) => {
  const ts = Date.now();
  const user1Id = `usr_fdbk_1_${ts}`;
  const user2Id = `usr_fdbk_2_${ts}`;
  let profile1Id: string;
  let profile2Id: string;
  let job1Id: string;
  let rec1Id: string;
  let rec2Id: string;

  await t.test("Setup: Create candidate profiles and baseline recommendations", async () => {
    // 1. Create User 1 and Candidate Profile 1 with specific facts
    await db.insert(users).values([
      {
        id: user1Id,
        name: "Feedback User 1",
        email: `${user1Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: user2Id,
        name: "Feedback User 2",
        email: `${user2Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [p1] = await db
      .insert(candidateProfiles)
      .values({
        userId: user1Id,
        headline: "Principal Distributed Systems Engineer",
        profileData: {
          targetRoles: ["Distributed Systems Engineer", "Backend Architect"],
          skills: ["Go", "Kubernetes", "PostgreSQL"],
        },
      })
      .returning();
    profile1Id = p1.id;

    const [p2] = await db
      .insert(candidateProfiles)
      .values({
        userId: user2Id,
        headline: "Frontend Specialist",
        profileData: {
          targetRoles: ["Frontend Engineer"],
          skills: ["React", "TypeScript"],
        },
      })
      .returning();
    profile2Id = p2.id;

    const [j1] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `ro_fb_${ts}`,
        title: "Distributed Systems Engineer",
        company: "Core Cloud Inc",
        remoteType: "WORLDWIDE_REMOTE",
        applicationUrl: "https://remoteok.com/jobs/fb1",
      })
      .returning();
    job1Id = j1.id;

    // Insert 2 active recommendations for User 1
    const [r1] = await db
      .insert(recommendations)
      .values({
        candidateProfileId: profile1Id,
        type: "ROLE_FOCUS",
        targetKey: "role:distributed systems engineer",
        title: "Focus on Distributed Systems Roles",
        summary: "Higher interview rates observed for Distributed Systems titles.",
        explanation: "Observational data shows high conversion.",
        confidence: "HIGH",
        status: "ACTIVE",
        evidence: {
          dimension: "role",
          primaryValue: "Distributed Systems Engineer",
          primaryMetric: {
            applications: 10,
            interviews: 6,
            offers: 2,
            rejections: 2,
            interviewRate: 0.6,
            offerRate: 0.2,
            responseRate: 0.6,
            averageMatchScore: 92,
            disclosureText: "6 of 10 applications (60.0%)",
          },
          sampleSize: 10,
          minSampleSizeThreshold: 4,
          isStatisticallyMeaningful: true,
          explanation: "Strong conversion relative to baseline",
        },
      })
      .returning();
    rec1Id = r1.id;

    const [r2] = await db
      .insert(recommendations)
      .values({
        candidateProfileId: profile1Id,
        type: "SOURCE_FOCUS",
        targetKey: "source:remoteok",
        title: "Focus on RemoteOK Job Source",
        summary: "Higher response rates observed on RemoteOK postings.",
        explanation: "Observational correlation indicates strong outcomes.",
        confidence: "MEDIUM",
        status: "ACTIVE",
        evidence: {
          dimension: "source",
          primaryValue: "remoteok",
          primaryMetric: {
            applications: 8,
            interviews: 4,
            offers: 1,
            rejections: 3,
            interviewRate: 0.5,
            offerRate: 0.125,
            responseRate: 0.5,
            averageMatchScore: 88,
            disclosureText: "4 of 8 applications (50.0%)",
          },
          sampleSize: 8,
          minSampleSizeThreshold: 4,
          isStatisticallyMeaningful: true,
          explanation: "High response relative to average",
        },
      })
      .returning();
    rec2Id = r2.id;
  });

  await t.test("1. User Dismissal Flow: Transitions ACTIVE to DISMISSED", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    const dismissed = await caller1.learning.dismiss({ id: rec1Id });
    assert.equal(dismissed.id, rec1Id);
    assert.equal(dismissed.status, "DISMISSED");
    assert.ok(dismissed.dismissedAt, "Must record dismissedAt timestamp");

    // Query active items only — dismissed item must not be included
    const activeOnly = await caller1.learning.getRecommendations({ status: "ACTIVE" });
    assert.ok(!activeOnly.some((r) => r.id === rec1Id));

    // Query dismissed items only — dismissed item must be present
    const dismissedOnly = await caller1.learning.getRecommendations({ status: "DISMISSED" });
    assert.ok(dismissedOnly.some((r) => r.id === rec1Id));
  });

  await t.test("2. User Acknowledgment Flow: Transitions ACTIVE to APPLIED", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    const applied = await caller1.learning.acknowledge({ id: rec2Id });
    assert.equal(applied.id, rec2Id);
    assert.equal(applied.status, "APPLIED");
    assert.ok(applied.appliedAt, "Must record appliedAt timestamp");

    // Query active items only — applied item must not be included
    const activeOnly = await caller1.learning.getRecommendations({ status: "ACTIVE" });
    assert.ok(!activeOnly.some((r) => r.id === rec2Id));

    // Query applied items only — applied item must be present
    const appliedOnly = await caller1.learning.getRecommendations({ status: "APPLIED" });
    assert.ok(appliedOnly.some((r) => r.id === rec2Id));
  });

  await t.test("3. Learning Loop Idempotency: Re-saving does not overwrite DISMISSED or APPLIED with ACTIVE", async () => {
    // Attempt to save identical recommendation inputs (e.g. from a subsequent refresh run)
    const inputs = [
      {
        type: "ROLE_FOCUS" as const,
        targetKey: "role:distributed systems engineer",
        title: "Focus on Distributed Systems Roles",
        summary: "Higher interview rates observed for Distributed Systems titles.",
        explanation: "Observational data shows high conversion.",
        confidence: "HIGH" as const,
        evidence: {
          dimension: "role" as const,
          primaryValue: "Distributed Systems Engineer",
          primaryMetric: {
            applications: 10,
            interviews: 6,
            offers: 2,
            rejections: 2,
            interviewRate: 0.6,
            offerRate: 0.2,
            responseRate: 0.6,
            averageMatchScore: 92,
            disclosureText: "6 of 10 applications (60.0%)",
          },
          sampleSize: 10,
          minSampleSizeThreshold: 4,
          isStatisticallyMeaningful: true,
          explanation: "Strong conversion relative to baseline",
        },
      },
      {
        type: "SOURCE_FOCUS" as const,
        targetKey: "source:remoteok",
        title: "Focus on RemoteOK Job Source",
        summary: "Higher response rates observed on RemoteOK postings.",
        explanation: "Observational correlation indicates strong outcomes.",
        confidence: "MEDIUM" as const,
        evidence: {
          dimension: "source" as const,
          primaryValue: "remoteok",
          primaryMetric: {
            applications: 8,
            interviews: 4,
            offers: 1,
            rejections: 3,
            interviewRate: 0.5,
            offerRate: 0.125,
            responseRate: 0.5,
            averageMatchScore: 88,
            disclosureText: "4 of 8 applications (50.0%)",
          },
          sampleSize: 8,
          minSampleSizeThreshold: 4,
          isStatisticallyMeaningful: true,
          explanation: "High response relative to average",
        },
      },
    ];

    const saved = await learningRepository.saveRecommendationsIdempotent(profile1Id, inputs);

    // Both should retain their modified statuses (DISMISSED and APPLIED), NOT reset to ACTIVE
    const r1After = saved.find((r) => r.id === rec1Id);
    assert.ok(r1After);
    assert.equal(r1After.status, "DISMISSED");

    const r2After = saved.find((r) => r.id === rec2Id);
    assert.ok(r2After);
    assert.equal(r2After.status, "APPLIED");
  });

  await t.test("4. Absolute Candidate Truth Protection: Candidate profile facts remain 100% unmutated", async () => {
    const [profileAfter] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, profile1Id));

    assert.equal(profileAfter.headline, "Principal Distributed Systems Engineer");
    const data = profileAfter.profileData as any;
    assert.deepEqual(data.targetRoles, ["Distributed Systems Engineer", "Backend Architect"]);
    assert.deepEqual(data.skills, ["Go", "Kubernetes", "PostgreSQL"]);
  });

  await t.test("5. Multi-Tenant Isolation: User 2 cannot mutate User 1's recommendation", async () => {
    const caller2 = appRouter.createCaller(createMockContext(user2Id));

    // Attempt to dismiss User 1's recommendation
    await assert.rejects(
      async () => {
        await caller2.learning.dismiss({ id: rec1Id });
      },
      (err: any) => err.code === "NOT_FOUND" || err.code === "FORBIDDEN"
    );

    // Attempt to apply User 1's recommendation
    await assert.rejects(
      async () => {
        await caller2.learning.acknowledge({ id: rec2Id });
      },
      (err: any) => err.code === "NOT_FOUND" || err.code === "FORBIDDEN"
    );
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(users).where(eq(users.id, user1Id));
    await db.delete(users).where(eq(users.id, user2Id));
    await db.delete(jobs).where(eq(jobs.id, job1Id));
  });
});
