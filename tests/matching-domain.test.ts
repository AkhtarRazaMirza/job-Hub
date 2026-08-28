/**
 * Job Hub — Phase 4 / Step 4.1
 * Matching Domain Foundation & Database Entity Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  db,
  user as userTable,
  candidateProfiles as candidateProfilesTable,
  jobs as jobsTable,
  jobMatches as jobMatchesTable,
} from "@job-hub/db";
import {
  matchDecisionSchema,
  categoryScoresSchema,
  scoringWeightsSchema,
  jobMatchSchema,
  createJobMatchInputSchema,
  DEFAULT_SCORING_WEIGHTS,
  JobMatchConflictError,
  JobMatchNotFoundError,
  type CreateJobMatchInput,
} from "@job-hub/matching";
import { jobMatchRepository } from "@job-hub/matching/server";

const TEST_TIMESTAMP = Date.now();
const testUserId = `test_match_user_${TEST_TIMESTAMP}`;
const testCandidateProfileId = `test_match_candidate_${TEST_TIMESTAMP}`;
const testJobId = `test_match_job_${TEST_TIMESTAMP}`;
const testMatchId = `test_match_entity_${TEST_TIMESTAMP}`;

async function cleanupTestData() {
  try {
    await db.delete(jobMatchesTable).where(eq(jobMatchesTable.id, testMatchId));
    await db.delete(jobsTable).where(eq(jobsTable.id, testJobId));
    await db.delete(candidateProfilesTable).where(eq(candidateProfilesTable.id, testCandidateProfileId));
    await db.delete(userTable).where(eq(userTable.id, testUserId));
  } catch (err) {
    console.error("Cleanup error in matching test:", err);
  }
}

test("Step 4.1 — Matching Domain Foundation & Database Entity Test Suite", async (t) => {
  t.after(async () => {
    await cleanupTestData();
  });

  // 1. Match Decision Enum Schema Validation
  await t.test("1. Decision Schema: validates exact allowed match decisions and rejects invalid", () => {
    // Valid decisions per 04_ai_agent_skills.md §10
    assert.equal(matchDecisionSchema.parse("SKIP"), "SKIP");
    assert.equal(matchDecisionSchema.parse("REVIEW"), "REVIEW");
    assert.equal(matchDecisionSchema.parse("STRONG_MATCH"), "STRONG_MATCH");
    assert.equal(matchDecisionSchema.parse("EXCELLENT_MATCH"), "EXCELLENT_MATCH");

    // Invalid decisions
    assert.throws(() => matchDecisionSchema.parse("HIRE"));
    assert.throws(() => matchDecisionSchema.parse("REJECT"));
    assert.throws(() => matchDecisionSchema.parse("GOOD_MATCH"));
    assert.throws(() => matchDecisionSchema.parse(""));
  });

  // 2. Category Scores Schema Validation
  await t.test("2. Category Scores Schema: validates 0.00–1.00 bounds and rejects out-of-range values", () => {
    const validScores = {
      skillsScore: 0.85,
      experienceScore: 0.75,
      remoteLocationScore: 1.0,
      projectsScore: 0.9,
      educationScore: 0.8,
      salaryScore: 0.5,
      freshnessScore: 1.0,
    };

    const parsed = categoryScoresSchema.parse(validScores);
    assert.equal(parsed.skillsScore, 0.85);

    // Negative score
    assert.throws(() =>
      categoryScoresSchema.parse({ ...validScores, skillsScore: -0.1 })
    );

    // Score > 1.0
    assert.throws(() =>
      categoryScoresSchema.parse({ ...validScores, salaryScore: 1.5 })
    );

    // Missing field
    const { freshnessScore: _, ...missingField } = validScores;
    assert.throws(() => categoryScoresSchema.parse(missingField));
  });

  // 3. Scoring Weights Schema Validation
  await t.test("3. Scoring Weights Schema: enforces weights must sum to 1.0 (100%)", () => {
    // Default weights from 02_how_to_build.md §9 (30+20+20+10+10+5+5 = 100%)
    const validWeights = scoringWeightsSchema.parse(DEFAULT_SCORING_WEIGHTS);
    assert.equal(validWeights.skills, 0.30);
    assert.equal(validWeights.experience, 0.20);
    assert.equal(validWeights.remoteLocation, 0.20);

    // Weights summing to less than 1.0 (e.g. 0.80)
    assert.throws(() =>
      scoringWeightsSchema.parse({
        skills: 0.20,
        experience: 0.20,
        remoteLocation: 0.20,
        projects: 0.10,
        education: 0.10,
        salary: 0.0,
        freshness: 0.0,
      })
    );

    // Weights summing to more than 1.0 (e.g. 1.20)
    assert.throws(() =>
      scoringWeightsSchema.parse({
        skills: 0.50,
        experience: 0.30,
        remoteLocation: 0.20,
        projects: 0.10,
        education: 0.10,
        salary: 0.0,
        freshness: 0.0,
      })
    );
  });

  // 4. JobMatch Entity Schema Validation
  await t.test("4. JobMatch Schema: enforces 0.00–10.00 score bounds and required audit fields", () => {
    const validMatch = {
      id: "match_123",
      candidateProfileId: "cand_123",
      jobId: "job_123",
      overallScore: 8.5,
      decision: "STRONG_MATCH" as const,
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: {
        skillsScore: 0.9,
        experienceScore: 0.8,
        remoteLocationScore: 1.0,
        projectsScore: 0.85,
        educationScore: 0.7,
        salaryScore: 0.8,
        freshnessScore: 1.0,
      },
      strengths: ["Strong TypeScript experience", "Direct Next.js production background"],
      gaps: ["No Kubernetes production operations"],
      risks: ["Salary at lower bound of expectation"],
      explanation: "High alignment across technical requirements with minor operational gaps.",
      confidence: 0.92,
      weightsUsed: DEFAULT_SCORING_WEIGHTS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parsed = jobMatchSchema.parse(validMatch);
    assert.equal(parsed.overallScore, 8.5);
    assert.equal(parsed.decision, "STRONG_MATCH");

    // Invalid score (< 0)
    assert.throws(() => jobMatchSchema.parse({ ...validMatch, overallScore: -1 }));

    // Invalid score (> 10)
    assert.throws(() => jobMatchSchema.parse({ ...validMatch, overallScore: 10.5 }));

    // Invalid confidence (> 1)
    assert.throws(() => jobMatchSchema.parse({ ...validMatch, confidence: 1.2 }));
  });

  // 5. PostgreSQL Persistence & Repository Integration
  await t.test("5. PostgreSQL Persistence: creates, reads, updates, and deletes JobMatch entities via Drizzle", async () => {
    await cleanupTestData();

    // 5a. Seed Foreign Key Entities (User, CandidateProfile, Job)
    await db.insert(userTable).values({
      id: testUserId,
      name: "Matching Candidate",
      email: `${testUserId}@example.com`,
      emailVerified: true,
    });

    await db.insert(candidateProfilesTable).values({
      id: testCandidateProfileId,
      userId: testUserId,
      headline: "Staff Systems Engineer",
    });

    await db.insert(jobsTable).values({
      id: testJobId,
      source: "remoteok",
      sourceJobId: `rok_${TEST_TIMESTAMP}`,
      title: "Staff Distributed Systems Engineer",
      company: "CloudScale Inc",
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
      applicationUrl: `https://example.com/jobs/${TEST_TIMESTAMP}`,
      status: "ACTIVE",
    });

    // 5b. Create JobMatch via Repository
    const matchInput: CreateJobMatchInput = {
      id: testMatchId,
      candidateProfileId: testCandidateProfileId,
      jobId: testJobId,
      overallScore: 9.25,
      decision: "EXCELLENT_MATCH",
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: {
        skillsScore: 0.95,
        experienceScore: 0.90,
        remoteLocationScore: 1.00,
        projectsScore: 0.90,
        educationScore: 0.80,
        salaryScore: 0.90,
        freshnessScore: 1.00,
      },
      strengths: ["Exemplary distributed systems architecture", "Staff-level experience"],
      gaps: [],
      risks: [],
      explanation: "Candidate matches all primary technical qualifications and worldwide remote requirement.",
      confidence: 0.96,
      weightsUsed: DEFAULT_SCORING_WEIGHTS,
    };

    const created = await jobMatchRepository.create(matchInput);

    assert.equal(created.id, testMatchId);
    assert.equal(created.candidateProfileId, testCandidateProfileId);
    assert.equal(created.jobId, testJobId);
    assert.equal(created.overallScore, 9.25);
    assert.equal(created.decision, "EXCELLENT_MATCH");
    assert.equal(created.hardConstraintsPassed, true);
    assert.equal(created.confidence, 0.96);
    assert.equal(created.strengths.length, 2);

    // 5c. Read via findById
    const fetchedById = await jobMatchRepository.findById(testMatchId);
    assert.ok(fetchedById);
    assert.equal(fetchedById.id, testMatchId);
    assert.equal(fetchedById.overallScore, 9.25);

    // 5d. Read via findByCandidateAndJob
    const fetchedByPair = await jobMatchRepository.findByCandidateAndJob(
      testCandidateProfileId,
      testJobId
    );
    assert.ok(fetchedByPair);
    assert.equal(fetchedByPair.id, testMatchId);

    // 5e. Unique Constraint Enforcement (Same candidate + same job throws Conflict)
    await assert.rejects(
      async () => jobMatchRepository.create(matchInput),
      (err: unknown) => err instanceof JobMatchConflictError
    );

    // 5f. Idempotent Upsert (Updates existing match)
    const upserted = await jobMatchRepository.upsert({
      ...matchInput,
      overallScore: 9.50,
      explanation: "Updated evaluation after project evidence review.",
    });

    assert.equal(upserted.id, testMatchId);
    assert.equal(upserted.overallScore, 9.50);
    assert.equal(upserted.explanation, "Updated evaluation after project evidence review.");

    // 5g. Update specific fields
    const updated = await jobMatchRepository.update(testMatchId, {
      decision: "STRONG_MATCH",
      overallScore: 8.80,
    });
    assert.equal(updated.overallScore, 8.80);
    assert.equal(updated.decision, "STRONG_MATCH");

    // 5h. List by candidate
    const matchesList = await jobMatchRepository.listByCandidate(testCandidateProfileId, {
      decision: "STRONG_MATCH",
      minScore: 8.0,
    });
    assert.equal(matchesList.length, 1);
    assert.equal(matchesList[0]?.id, testMatchId);

    // 5i. Delete JobMatch
    const deleted = await jobMatchRepository.delete(testMatchId);
    assert.equal(deleted, true);

    const afterDelete = await jobMatchRepository.findById(testMatchId);
    assert.equal(afterDelete, null);
  });
});
