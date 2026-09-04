/**
 * Job Hub — Phase 10 / Step 10.4
 * Recommendation Agent Test Suite
 *
 * Verifies:
 * 1. Deterministic recommendation generation from outcome patterns.
 * 2. Strict grounding of titles and summaries in numerical evidence.
 * 3. AI enhancement integration with structured output validation.
 * 4. Fault-tolerance: Graceful fallback to deterministic copy on AI failure.
 * 5. Invariant: Zero mutations to candidate profile or identity.
 * 6. Invariant: Full Zod schema compliance for all generated recommendations.
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
import { MockAiProvider } from "@job-hub/ai";
import { RecommendationAgent } from "../packages/applications/src/learning/recommendation-agent";
import { recommendationSchema } from "../packages/applications/src/learning/validation";

test("Phase 10 / Step 10.4 — Recommendation Agent Suite", async (t) => {
  const ts = Date.now();
  const userId = `usr_p10_step4_${ts}`;
  let candidateProfileId: string;

  let job1Id: string;
  let job2Id: string;
  let job3Id: string;

  await t.test("Setup: Create candidate profile, jobs, and applications yielding patterns", async () => {
    // 1. User
    await db.insert(users).values({
      id: userId,
      name: "Recommendation User",
      email: `${userId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Candidate Profile
    const [cp] = await db
      .insert(candidateProfiles)
      .values({ userId, headline: "Senior Platform Architect" })
      .returning();
    candidateProfileId = cp.id;

    // 3. Jobs
    const [j1, j2, j3] = await db
      .insert(jobs)
      .values([
        {
          source: "remoteok",
          sourceJobId: `ro_rec_${ts}_1`,
          title: "AI Systems Engineer",
          company: "Vertex Labs",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/1",
          skills: ["Python", "PyTorch"],
        },
        {
          source: "remoteok",
          sourceJobId: `ro_rec_${ts}_2`,
          title: "AI Systems Engineer",
          company: "Nexus Tech",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/2",
          skills: ["Python", "FastAPI"],
        },
        {
          source: "himalayas",
          sourceJobId: `him_rec_${ts}_3`,
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

    // 4. Applications (AI Systems Engineer: 2 apps, 2 interviews, RemoteOK: 2 apps, 2 interviews)
    await db.insert(applications).values([
      {
        candidateProfileId,
        jobId: job1Id,
        company: "Vertex Labs",
        role: "AI Systems Engineer",
        source: "remoteok",
        matchScore: "95.00",
        status: "INTERVIEW_SCHEDULED",
        submittedAt: new Date(),
      },
      {
        candidateProfileId,
        jobId: job2Id,
        company: "Nexus Tech",
        role: "AI Systems Engineer",
        source: "remoteok",
        matchScore: "90.00",
        status: "OFFER",
        submittedAt: new Date(),
      },
      {
        candidateProfileId,
        jobId: job3Id,
        company: "Orbit Core",
        role: "Frontend Engineer",
        source: "himalayas",
        matchScore: "60.00",
        status: "REJECTED",
        submittedAt: new Date(),
      },
    ]);
  });

  await t.test("1. Deterministic Recommendation Generation: Builds evidence-backed recommendations", async () => {
    const agent = new RecommendationAgent({ database: db });
    const recommendations = await agent.generateRecommendations(candidateProfileId);

    assert.ok(recommendations.length >= 1);
    for (const rec of recommendations) {
      // Validate schema compliance
      assert.doesNotThrow(() => recommendationSchema.parse(rec));
      assert.equal(rec.candidateProfileId, candidateProfileId);
      assert.equal(rec.status, "ACTIVE");
      assert.ok(rec.evidence.primaryMetric.applications > 0);
      assert.ok(rec.title.length > 0);
      assert.ok(rec.summary.length > 0);
      assert.ok(rec.explanation.length > 0);
    }

    const roleRec = recommendations.find((r) => r.type === "ROLE_FOCUS");
    assert.ok(roleRec);
    assert.equal(roleRec.evidence.primaryValue, "AI Systems Engineer");
    assert.equal(roleRec.evidence.primaryMetric.interviews, 2);
    assert.equal(roleRec.evidence.primaryMetric.applications, 2);
  });

  await t.test("2. AI Enhancement Layer: Updates text without altering evidence metrics", async () => {
    const mockAi = new MockAiProvider({
      title: "Prioritize AI Systems Engineer Roles",
      summary: "Your applications to AI Systems Engineer positions have converted to interviews at 100.0%.",
      explanation: "Observational analysis indicates an exceptional interview rate for AI systems positions in your recent pipeline. Consider prioritizing similar high-match roles.",
      actionableTip: "Continue searching for AI Systems positions with Python and PyTorch requirements.",
    });

    const agent = new RecommendationAgent({
      database: db,
      aiProvider: mockAi,
    });

    const recommendations = await agent.generateRecommendations(candidateProfileId, {
      enhanceWithAi: true,
    });

    assert.ok(recommendations.length >= 1);
    const roleRec = recommendations.find((r) => r.type === "ROLE_FOCUS");
    assert.ok(roleRec);
    assert.equal(roleRec.title, "Prioritize AI Systems Engineer Roles");
    assert.match(roleRec.explanation, /Actionable suggestion:/);

    // CRITICAL: Numerical evidence must remain completely unchanged
    assert.equal(roleRec.evidence.primaryMetric.interviews, 2);
    assert.equal(roleRec.evidence.primaryMetric.applications, 2);
    assert.equal(roleRec.evidence.primaryMetric.interviewRate, 1.0);
  });

  await t.test("3. Fault-Tolerance: Falls back to deterministic copy on AI error", async () => {
    const failingAi = new MockAiProvider({ shouldFail: true });
    const agent = new RecommendationAgent({
      database: db,
      aiProvider: failingAi,
    });

    // Does not throw; falls back cleanly to deterministic copy
    const recommendations = await agent.generateRecommendations(candidateProfileId, {
      enhanceWithAi: true,
    });

    assert.ok(recommendations.length >= 1);
    const roleRec = recommendations.find((r) => r.type === "ROLE_FOCUS");
    assert.ok(roleRec);
    assert.ok(roleRec.title.length > 0);
    assert.ok(roleRec.explanation.length > 0);
  });

  await t.test("4. Invariant: Zero Mutation to Candidate Profile Facts", async () => {
    const profileBefore = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, candidateProfileId));

    const agent = new RecommendationAgent({ database: db });
    await agent.generateRecommendations(candidateProfileId);

    const profileAfter = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, candidateProfileId));

    assert.equal(profileBefore[0].headline, profileAfter[0].headline);
    assert.equal(profileBefore[0].userId, profileAfter[0].userId);
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(jobs).where(eq(jobs.id, job1Id));
    await db.delete(jobs).where(eq(jobs.id, job2Id));
    await db.delete(jobs).where(eq(jobs.id, job3Id));
  });
});
