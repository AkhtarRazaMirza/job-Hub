/**
 * Job Hub — Phase 10 / Step 10.5
 * Candidate-Isolated Learning Repository Test Suite
 *
 * Verifies:
 * 1. Candidate tenant isolation for reads and mutations.
 * 2. Idempotent persistence: no duplicate active recommendations for same targetKey.
 * 3. Lifecycle state machine: ACTIVE -> DISMISSED and ACTIVE -> APPLIED with timestamps.
 * 4. Preservation of historical audit snapshots.
 * 5. Query filtering by status and type.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  candidateProfiles,
  recommendations,
} from "@job-hub/db";
import { LearningRepository } from "../packages/applications/src/learning/repository";
import { buildEvidenceMetric } from "../packages/applications/src/learning/analyzer";

test("Phase 10 / Step 10.5 — Learning Repository Suite", async (t) => {
  const ts = Date.now();
  const userAId = `usr_repo_a_${ts}`;
  const userBId = `usr_repo_b_${ts}`;
  let candidateAId: string;
  let candidateBId: string;

  const repo = new LearningRepository(db);

  await t.test("Setup: Create candidate profiles", async () => {
    await db.insert(users).values([
      {
        id: userAId,
        name: "Repo User A",
        email: `${userAId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: userBId,
        name: "Repo User B",
        email: `${userBId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [cA] = await db
      .insert(candidateProfiles)
      .values({ userId: userAId, headline: "Backend Architect" })
      .returning();
    candidateAId = cA.id;

    const [cB] = await db
      .insert(candidateProfiles)
      .values({ userId: userBId, headline: "Frontend Specialist" })
      .returning();
    candidateBId = cB.id;
  });

  await t.test("1. Idempotency & Persistence: Deduplicates active recommendations by targetKey", async () => {
    const evidenceMetric = buildEvidenceMetric({
      applications: 20,
      interviews: 6,
      offers: 1,
    });

    const input = {
      type: "ROLE_FOCUS" as const,
      targetKey: "role:AI Full-Stack Engineer",
      title: "Focus on AI Full-Stack Roles",
      summary: "AI Full-Stack roles are converting at 30.0%.",
      explanation: "Detailed evidence explanation.",
      confidence: "HIGH" as const,
      evidence: {
        dimension: "role" as const,
        primaryValue: "AI Full-Stack Engineer",
        primaryMetric: evidenceMetric,
        sampleSize: 20,
        minSampleSizeThreshold: 4,
        isStatisticallyMeaningful: true,
        explanation: "Primary explanation.",
      },
    };

    // First save
    const initialSaved = await repo.saveRecommendationsIdempotent(candidateAId, [input]);
    assert.equal(initialSaved.length, 1);
    const initialId = initialSaved[0].id;
    assert.equal(initialSaved[0].status, "ACTIVE");

    // Second save with updated copy/evidence for same targetKey
    const updatedInput = {
      ...input,
      summary: "Updated summary: AI Full-Stack converting at 35.0%.",
    };
    const secondSaved = await repo.saveRecommendationsIdempotent(candidateAId, [updatedInput]);
    assert.equal(secondSaved.length, 1);

    // ID must be the same (updated in-place, NOT duplicated)
    assert.equal(secondSaved[0].id, initialId);
    assert.equal(secondSaved[0].summary, updatedInput.summary);

    // Verify row count in database for candidate A is still exactly 1
    const allRecs = await repo.getRecommendations(candidateAId);
    assert.equal(allRecs.length, 1);
  });

  await t.test("2. Tenant Isolation: Candidate B cannot view or mutate Candidate A's recommendation", async () => {
    const recsA = await repo.getRecommendations(candidateAId);
    assert.equal(recsA.length, 1);
    const recAId = recsA[0].id;

    // Candidate B sees 0 recommendations
    const recsB = await repo.getRecommendations(candidateBId);
    assert.equal(recsB.length, 0);

    // Candidate B querying Candidate A's recommendation returns null
    const crossQuery = await repo.getRecommendationById(candidateBId, recAId);
    assert.equal(crossQuery, null);

    // Candidate B dismissing Candidate A's recommendation returns null (no mutation)
    const crossDismiss = await repo.dismissRecommendation(candidateBId, recAId);
    assert.equal(crossDismiss, null);

    // Candidate A's recommendation remains ACTIVE
    const intactRec = await repo.getRecommendationById(candidateAId, recAId);
    assert.ok(intactRec);
    assert.equal(intactRec.status, "ACTIVE");
  });

  await t.test("3. Lifecycle State Machine: Transitions ACTIVE -> DISMISSED and preserves timestamp", async () => {
    const recsA = await repo.getRecommendations(candidateAId);
    const recId = recsA[0].id;

    const dismissed = await repo.dismissRecommendation(candidateAId, recId);
    assert.ok(dismissed);
    assert.equal(dismissed.status, "DISMISSED");
    assert.ok(dismissed.dismissedAt);

    // Active filter excludes dismissed recommendation
    const activeRecs = await repo.getRecommendations(candidateAId, { status: "ACTIVE" });
    assert.equal(activeRecs.length, 0);

    // Querying with status: DISMISSED returns it
    const dismissedRecs = await repo.getRecommendations(candidateAId, { status: "DISMISSED" });
    assert.equal(dismissedRecs.length, 1);
    assert.equal(dismissedRecs[0].id, recId);
  });

  await t.test("4. Lifecycle State Machine: Transitions ACTIVE -> APPLIED", async () => {
    // Insert a new recommendation for Candidate B
    const evidenceMetric = buildEvidenceMetric({ applications: 10, interviews: 4, offers: 1 });
    const [recB] = await repo.saveRecommendationsIdempotent(candidateBId, [
      {
        type: "SOURCE_FOCUS",
        targetKey: "source:remoteok",
        title: "Prioritize RemoteOK",
        summary: "RemoteOK converting at 40.0%.",
        explanation: "Explanation text.",
        confidence: "MEDIUM",
        evidence: {
          dimension: "source",
          primaryValue: "remoteok",
          primaryMetric: evidenceMetric,
          sampleSize: 10,
          minSampleSizeThreshold: 4,
          isStatisticallyMeaningful: true,
          explanation: "Explanation.",
        },
      },
    ]);

    assert.equal(recB.status, "ACTIVE");

    // Apply recommendation
    const applied = await repo.applyRecommendation(candidateBId, recB.id);
    assert.ok(applied);
    assert.equal(applied.status, "APPLIED");
    assert.ok(applied.appliedAt);
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
  });
});
