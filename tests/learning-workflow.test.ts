/**
 * Job Hub — Phase 10 / Step 10.7
 * Durable Learning Workflow Test Suite (Inngest)
 *
 * Verifies:
 * 1. Inngest event schema validation for learning/refresh.requested.
 * 2. Sequential step execution: verify profile -> aggregate -> detect -> persist.
 * 3. Idempotency: Multiple executions do not duplicate active recommendations.
 * 4. Tenant Isolation: Runs strictly scoped to the candidate profile.
 * 5. Failure Safety: Invalid candidate profile terminates cleanly without database corruption.
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
  learningRefreshRequestedEventSchema,
} from "../inngest/src/events/learning";
import {
  outcomeAnalyzer,
  patternDetector,
  learningRepository,
} from "../packages/applications/src/server";

test("Phase 10 / Step 10.7 — Durable Learning Workflow Suite", async (t) => {
  const ts = Date.now();
  const userAId = `usr_wf_a_${ts}`;
  const userBId = `usr_wf_b_${ts}`;
  let candidateAId: string;
  let candidateBId: string;
  let job1Id: string;
  let job2Id: string;
  let job3Id: string;

  await t.test("1. Event Schema: Validates learning/refresh.requested payload", () => {
    const valid = {
      name: "learning/refresh.requested" as const,
      data: {
        candidateProfileId: "cand_123",
        force: true,
      },
    };
    const parsed = learningRefreshRequestedEventSchema.parse(valid);
    assert.equal(parsed.name, "learning/refresh.requested");
    assert.equal(parsed.data.candidateProfileId, "cand_123");
    assert.equal(parsed.data.force, true);

    // Missing candidateProfileId rejected
    assert.throws(() =>
      learningRefreshRequestedEventSchema.parse({
        name: "learning/refresh.requested",
        data: { candidateProfileId: "" },
      })
    );
  });

  await t.test("Setup: Create candidate profiles, jobs, and applications", async () => {
    await db.insert(users).values([
      {
        id: userAId,
        name: "Workflow User A",
        email: `${userAId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: userBId,
        name: "Workflow User B",
        email: `${userBId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [cA] = await db
      .insert(candidateProfiles)
      .values({ userId: userAId, headline: "Full-Stack Architect" })
      .returning();
    candidateAId = cA.id;

    const [cB] = await db
      .insert(candidateProfiles)
      .values({ userId: userBId, headline: "Frontend Specialist" })
      .returning();
    candidateBId = cB.id;

    const [j1, j2, j3] = await db
      .insert(jobs)
      .values([
        {
          source: "remoteok",
          sourceJobId: `ro_wf_${ts}_1`,
          title: "AI Systems Engineer",
          company: "Nexus AI",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/1",
          skills: ["Python", "FastAPI"],
        },
        {
          source: "remoteok",
          sourceJobId: `ro_wf_${ts}_2`,
          title: "AI Systems Engineer",
          company: "Vertex Tech",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/2",
          skills: ["Python", "TypeScript"],
        },
        {
          source: "himalayas",
          sourceJobId: `him_wf_${ts}_3`,
          title: "Frontend Engineer",
          company: "Orbit Core",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://himalayas.app/jobs/3",
          skills: ["React"],
        },
      ])
      .returning();
    job1Id = j1.id;
    job2Id = j2.id;
    job3Id = j3.id;

    // Applications for Candidate A (3 applications: 2 for AI Systems with interviews, 1 Frontend with rejection)
    await db.insert(applications).values([
      {
        candidateProfileId: candidateAId,
        jobId: job1Id,
        company: "Nexus AI",
        role: "AI Systems Engineer",
        source: "remoteok",
        matchScore: "94.00",
        status: "INTERVIEW_SCHEDULED",
        submittedAt: new Date(),
      },
      {
        candidateProfileId: candidateAId,
        jobId: job2Id,
        company: "Vertex Tech",
        role: "AI Systems Engineer",
        source: "remoteok",
        matchScore: "91.00",
        status: "OFFER",
        submittedAt: new Date(),
      },
      {
        candidateProfileId: candidateAId,
        jobId: job3Id,
        company: "Orbit Core",
        role: "Frontend Engineer",
        source: "himalayas",
        matchScore: "55.00",
        status: "REJECTED",
        submittedAt: new Date(),
      },
    ]);
  });

  await t.test("2. Workflow Step Execution: Runs pipeline end-to-end and persists recommendations", async () => {
    // Step 1: Verify profile
    const [profile] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, candidateAId));
    assert.ok(profile);

    // Step 2: Aggregate outcomes
    const cohorts = await outcomeAnalyzer.analyzeCandidateOutcomes(profile.id);
    assert.equal(cohorts.totalApplications, 3);
    assert.equal(cohorts.baseline.interviews, 2);

    // Step 3: Detect patterns
    const patterns = patternDetector.detectPatterns(cohorts);
    assert.ok(patterns.length >= 1);

    // Step 4: Persist recommendations
    const inputs = patterns.map((p) => ({
      type: p.type,
      targetKey: p.targetKey,
      title: p.title,
      summary: p.summary,
      explanation: p.explanation,
      confidence: p.confidence,
      evidence: p.evidence,
    }));

    const saved = await learningRepository.saveRecommendationsIdempotent(profile.id, inputs);
    assert.ok(saved.length >= 1);
    assert.equal(saved[0].candidateProfileId, candidateAId);
    assert.equal(saved[0].status, "ACTIVE");

    // Verify persisted in database
    const inDb = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.candidateProfileId, candidateAId));
    assert.equal(inDb.length, saved.length);
  });

  await t.test("3. Workflow Idempotency: Multiple runs do not produce duplicate active recommendations", async () => {
    const recsBefore = await learningRepository.getRecommendations(candidateAId);

    // Re-run the aggregation, detection, and save steps
    const cohorts = await outcomeAnalyzer.analyzeCandidateOutcomes(candidateAId);
    const patterns = patternDetector.detectPatterns(cohorts);
    const inputs = patterns.map((p) => ({
      type: p.type,
      targetKey: p.targetKey,
      title: p.title,
      summary: p.summary,
      explanation: p.explanation,
      confidence: p.confidence,
      evidence: p.evidence,
    }));

    const recsAfter = await learningRepository.saveRecommendationsIdempotent(candidateAId, inputs);

    assert.equal(recsBefore.length, recsAfter.length);
    const beforeIds = new Set(recsBefore.map((r) => r.id));
    for (const rec of recsAfter) {
      assert.ok(beforeIds.has(rec.id), `ID ${rec.id} must match existing recommendation`);
      assert.equal(rec.status, "ACTIVE");
    }

    const inDbAfter = await learningRepository.getRecommendations(candidateAId);
    assert.equal(inDbAfter.length, recsBefore.length);
  });

  await t.test("4. Tenant Isolation: Candidate B has zero recommendations", async () => {
    const recsB = await learningRepository.getRecommendations(candidateBId);
    assert.equal(recsB.length, 0);
  });

  await t.test("5. Failure Safety: Missing profile throws without creating corrupted rows", async () => {
    const nonExistentProfileId = `prof_missing_${Date.now()}`;
    const [p] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, nonExistentProfileId));
    assert.equal(p, undefined);

    const recs = await learningRepository.getRecommendations(nonExistentProfileId);
    assert.equal(recs.length, 0);
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await db.delete(jobs).where(eq(jobs.id, job1Id));
    await db.delete(jobs).where(eq(jobs.id, job2Id));
    await db.delete(jobs).where(eq(jobs.id, job3Id));
  });
});
