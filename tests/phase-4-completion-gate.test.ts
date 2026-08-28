/**
 * Job Hub — Phase 4 / Step 4.7
 * Phase 4 Completion Gate: End-to-End Domain, Hard Constraints, Scoring, AI, Workflow, API & Security Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 02_how_to_build.md §4, §8 & §9
 * - 03_tech_stack.md
 * - 04_ai_agent_skills.md §9, §10, §23
 */

import test from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import {
  DEFAULT_SCORING_WEIGHTS,
  scoringWeightsSchema,
  categoryScoresSchema,
  matchDecisionSchema,
  jobMatchSchema,
  evaluateHardConstraints,
  calculateMatchScores,
  determineMatchDecision,
  MatchingEngine,
  buildCandidateMatchData,
  buildJobMatchData,
  type CandidateMatchData,
  type JobMatchData,
} from "@job-hub/matching";
import { jobMatchRepository } from "@job-hub/matching/server";
import { jobRepository } from "@job-hub/jobs/server";
import { candidateProfileRepository } from "@job-hub/candidate/server";
import { inngest } from "@job-hub/inngest/client";
import { createMatchCandidateJobFunction } from "../inngest/src/functions/matching";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { db, users, candidateProfiles, jobs, jobMatches } from "@job-hub/db";
import { eq } from "drizzle-orm";
import { MockAiProvider } from "@job-hub/ai";

function createMockContext(userId: string | null = "gate_user_1") {
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

test("Step 4.7 — Phase 4 Completion Gate Test Suite", async (t) => {
  const user1Id = `usr_gate4_1_${Date.now()}`;
  const user2Id = `usr_gate4_2_${Date.now()}`;
  let candidate1ProfileId: string;
  let candidate2ProfileId: string;
  let canonicalJobId: string;
  let gateMatchId: string;

  // Intercept Inngest event dispatch for end-to-end trace
  const originalInngestSend = inngest.send;
  const dispatchedEvents: Array<{ name: string; data: any }> = [];
  (inngest as any).send = async (eventOrEvents: any) => {
    const evs = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    dispatchedEvents.push(...evs);
    return { ids: ["gate_ev_1"] };
  };

  t.after(async () => {
    (inngest as any).send = originalInngestSend;

    // Database teardown
    if (candidate1ProfileId) {
      await db.delete(jobMatches).where(eq(jobMatches.candidateProfileId, candidate1ProfileId));
    }
    if (canonicalJobId) {
      await db.delete(jobs).where(eq(jobs.id, canonicalJobId));
    }
    if (candidate1ProfileId) {
      await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate1ProfileId));
    }
    if (candidate2ProfileId) {
      await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate2ProfileId));
    }
    await db.delete(users).where(eq(users.id, user1Id));
    await db.delete(users).where(eq(users.id, user2Id));
  });

  // Setup: Create PostgreSQL entities
  await t.test("Setup: Initialize database entities for completion gate", async () => {
    // User 1
    await db.insert(users).values({
      id: user1Id,
      name: "Gate User 1",
      email: `${user1Id}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const p1 = await candidateProfileRepository.create({
      userId: user1Id,
      headline: "Senior Fullstack Engineer",
      profileData: {
        technicalSkills: [{ name: "TypeScript" }, { name: "React" }, { name: "PostgreSQL" }, { name: "Node.js" }],
        technologies: ["Docker", "Next.js"],
        experienceLevel: "SENIOR",
        yearsOfExperience: 7,
        locationPreferences: {
          remotePreference: "WORLDWIDE_REMOTE",
        },
      },
    });
    candidate1ProfileId = p1.id;

    // User 2
    await db.insert(users).values({
      id: user2Id,
      name: "Gate User 2",
      email: `${user2Id}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const p2 = await candidateProfileRepository.create({
      userId: user2Id,
      headline: "Junior QA Tester",
      profileData: {
        technicalSkills: [{ name: "Manual Testing" }],
        experienceLevel: "ENTRY",
      },
    });
    candidate2ProfileId = p2.id;

    // Canonical Job
    const j = await jobRepository.create({
      title: "Senior Fullstack TypeScript Engineer",
      company: "Apex Technologies",
      remoteType: "WORLDWIDE_REMOTE",
      skills: ["TypeScript", "React", "PostgreSQL", "Node.js"],
      requirements: ["5+ years TypeScript & React", "Strong database knowledge"],
      experience: "5+ years",
      status: "ACTIVE",
      source: "manual",
    });
    canonicalJobId = j.id;
  });

  // =========================================================================
  // Gate 1: Domain & Schema Gate (Step 4.1)
  // =========================================================================
  await t.test("Gate 1: Domain & Schema Gate — validates scoring weights, score ranges, and decision enums", () => {
    // 1. Scoring weights sum to 1.0
    assert.doesNotThrow(() => scoringWeightsSchema.parse(DEFAULT_SCORING_WEIGHTS));
    assert.throws(
      () =>
        scoringWeightsSchema.parse({
          ...DEFAULT_SCORING_WEIGHTS,
          skills: 0.5, // Sum becomes 1.20
        }),
      /Scoring weights must sum to 1.0/
    );

    // 2. Decision enum strictness
    assert.equal(matchDecisionSchema.parse("SKIP"), "SKIP");
    assert.equal(matchDecisionSchema.parse("REVIEW"), "REVIEW");
    assert.equal(matchDecisionSchema.parse("STRONG_MATCH"), "STRONG_MATCH");
    assert.equal(matchDecisionSchema.parse("EXCELLENT_MATCH"), "EXCELLENT_MATCH");
    assert.throws(() => matchDecisionSchema.parse("MAYBE"));

    // 3. Category scores bounds (0.00 to 1.00)
    assert.doesNotThrow(() =>
      categoryScoresSchema.parse({
        skillsScore: 1.0,
        experienceScore: 0.8,
        remoteLocationScore: 1.0,
        projectsScore: 0.7,
        educationScore: 0.8,
        salaryScore: 0.5,
        freshnessScore: 1.0,
      })
    );
    assert.throws(() =>
      categoryScoresSchema.parse({
        skillsScore: 1.5, // Exceeds 1.0
        experienceScore: 0.8,
        remoteLocationScore: 1.0,
        projectsScore: 0.7,
        educationScore: 0.8,
        salaryScore: 0.5,
        freshnessScore: 1.0,
      })
    );
  });

  // =========================================================================
  // Gate 2: Hard Constraints Evaluator Gate (Step 4.2)
  // =========================================================================
  await t.test("Gate 2: Hard Constraints Gate — deterministic exclusion on location, status, and experience", () => {
    const baseCandidate: CandidateMatchData = {
      candidateProfileId: "cand_1",
      skills: ["TypeScript"],
      remotePreference: "WORLDWIDE_REMOTE",
      preferredLocations: [],
      experienceLevel: "SENIOR",
      projects: [],
      education: [],
    };

    const baseJob: JobMatchData = {
      id: "job_1",
      title: "Senior Engineer",
      company: "Acme",
      remoteType: "WORLDWIDE_REMOTE",
      allowedCountries: [],
      skills: ["TypeScript"],
      requirements: [],
      status: "ACTIVE",
      postedAt: new Date().toISOString(),
    };

    // Valid match passes
    const passResult = evaluateHardConstraints(baseCandidate, baseJob);
    assert.equal(passResult.passed, true);
    assert.equal(passResult.failures.length, 0);

    // Inactive job rejected
    const inactiveResult = evaluateHardConstraints(baseCandidate, { ...baseJob, status: "CLOSED" });
    assert.equal(inactiveResult.passed, false);
    assert.ok(inactiveResult.failures.some((f) => f.includes("status")));

    // Onsite job vs remote candidate rejected
    const onsiteResult = evaluateHardConstraints(baseCandidate, { ...baseJob, remoteType: "ONSITE" });
    assert.equal(onsiteResult.passed, false);
    assert.ok(onsiteResult.failures.some((f) => f.includes("Onsite")));

    // Stale job (>90 days) rejected
    const staleDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const staleResult = evaluateHardConstraints(baseCandidate, { ...baseJob, postedAt: staleDate });
    assert.equal(staleResult.passed, false);
    assert.ok(staleResult.failures.some((f) => f.includes("Stale")));
  });

  // =========================================================================
  // Gate 3: Seven-Factor Scoring & Decision Boundary Gate (Step 4.3)
  // =========================================================================
  await t.test("Gate 3: Scoring Gate — exact dimension weights and decision boundary transitions", () => {
    // Exact threshold boundary tests:
    // < 6.00       → SKIP
    // 6.00–7.99    → REVIEW (including 6.00)
    // 8.00–8.99    → STRONG_MATCH (including 8.00)
    // 9.00–10.00   → EXCELLENT_MATCH (including 9.00 and 10.00)

    assert.equal(determineMatchDecision(5.99), "SKIP");
    assert.equal(determineMatchDecision(6.0), "REVIEW");
    assert.equal(determineMatchDecision(7.99), "REVIEW");
    assert.equal(determineMatchDecision(8.0), "STRONG_MATCH");
    assert.equal(determineMatchDecision(8.99), "STRONG_MATCH");
    assert.equal(determineMatchDecision(9.0), "EXCELLENT_MATCH");
    assert.equal(determineMatchDecision(10.0), "EXCELLENT_MATCH");

    // Default weight verification
    assert.equal(DEFAULT_SCORING_WEIGHTS.skills, 0.3);
    assert.equal(DEFAULT_SCORING_WEIGHTS.experience, 0.2);
    assert.equal(DEFAULT_SCORING_WEIGHTS.remoteLocation, 0.2);
    assert.equal(DEFAULT_SCORING_WEIGHTS.projects, 0.1);
    assert.equal(DEFAULT_SCORING_WEIGHTS.education, 0.1);
    assert.equal(DEFAULT_SCORING_WEIGHTS.salary, 0.05);
    assert.equal(DEFAULT_SCORING_WEIGHTS.freshness, 0.05);

    const sum = Object.values(DEFAULT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(Math.round(sum * 100) / 100, 1.0);
  });

  // =========================================================================
  // Gate 4: AI Semantic Explainer & Truthfulness Gate (Step 4.4)
  // =========================================================================
  await t.test("Gate 4: AI Semantic Explainer Gate — structured output without hallucination and token bypass on disqualification", async () => {
    const mockAi = new MockAiProvider(
      JSON.stringify({
        strengths: ["Strong TypeScript skill alignment", "Years of experience exceeds requirements"],
        gaps: [],
        risks: ["Fast-paced delivery expectations"],
        explanation: "The candidate has demonstrated production experience matching all core technologies.",
        confidence: 0.92,
      })
    );

    const engine = new MatchingEngine({ aiProvider: mockAi });

    const candidate: CandidateMatchData = {
      candidateProfileId: "cand_ai_1",
      skills: ["TypeScript", "React", "PostgreSQL"],
      remotePreference: "WORLDWIDE_REMOTE",
      preferredLocations: [],
      experienceLevel: "SENIOR",
      yearsOfExperience: 6,
      projects: [],
      education: [],
    };

    const passingJob: JobMatchData = {
      id: "job_ai_pass",
      title: "Senior Fullstack Engineer",
      company: "Scale Systems",
      remoteType: "WORLDWIDE_REMOTE",
      allowedCountries: [],
      skills: ["TypeScript", "React", "PostgreSQL"],
      requirements: ["5+ years"],
      status: "ACTIVE",
      postedAt: new Date().toISOString(),
    };

    const passResult = await engine.evaluate({ candidate, job: passingJob });
    assert.equal(passResult.hardConstraints.passed, true);
    assert.ok(passResult.overallScore >= 8.0);
    assert.equal(passResult.confidence, 0.92);
    assert.ok(passResult.strengths.length > 0);
    assert.equal(mockAi.calls.length, 1);

    // Hard constraint failure bypasses AI
    const failingJob: JobMatchData = {
      ...passingJob,
      id: "job_ai_fail",
      status: "CLOSED",
    };

    mockAi.calls.length = 0;
    const failResult = await engine.evaluate({ candidate, job: failingJob });
    assert.equal(failResult.hardConstraints.passed, false);
    assert.equal(failResult.overallScore, 0.0);
    assert.equal(failResult.decision, "SKIP");
    assert.equal(mockAi.calls.length, 0, "AI call must be bypassed on hard constraint failure");
  });

  // =========================================================================
  // Gate 5: Inngest Durable Workflow & Idempotency Gate (Step 4.5)
  // =========================================================================
  await t.test("Gate 5: Durable Inngest Workflow Gate — step memoization, idempotency, and job.matched emission", async () => {
    const mockAi = new MockAiProvider(
      JSON.stringify({
        strengths: ["Full TypeScript stack coverage"],
        gaps: [],
        risks: [],
        explanation: "Candidate matches all primary qualifications.",
        confidence: 0.9,
      })
    );

    const emittedWorkflowEvents: any[] = [];
    const simulatedStep = {
      run: async (_name: string, fn: () => Promise<any>) => fn(),
      sendEvent: async (_name: string, event: any) => {
        emittedWorkflowEvents.push(event);
      },
    };

    const workflowFunc = createMatchCandidateJobFunction({
      aiProvider: mockAi,
      jobMatchRepository,
      jobRepository,
      candidateProfileRepository,
    });

    // 1. First execution creates match
    const exec1 = await (workflowFunc as any).fn({
      event: {
        name: "job.match.requested",
        data: {
          candidateProfileId: candidate1ProfileId,
          jobId: canonicalJobId,
        },
      },
      step: simulatedStep,
    });

    assert.equal(exec1.success, true);
    assert.ok(exec1.overallScore >= 7.0);
    gateMatchId = exec1.matchId;

    // Verify persisted record
    const matchInDb = await jobMatchRepository.findById(gateMatchId);
    assert.ok(matchInDb !== null);
    assert.equal(matchInDb!.candidateProfileId, candidate1ProfileId);
    assert.equal(matchInDb!.jobId, canonicalJobId);

    // Verify completion event was emitted
    assert.equal(emittedWorkflowEvents.length, 1);
    assert.equal(emittedWorkflowEvents[0].name, "job.matched");
    assert.equal(emittedWorkflowEvents[0].data.matchId, gateMatchId);

    // 2. Second execution with same candidate + job updates row rather than duplicating
    const exec2 = await (workflowFunc as any).fn({
      event: {
        name: "job.match.requested",
        data: {
          candidateProfileId: candidate1ProfileId,
          jobId: canonicalJobId,
        },
      },
      step: simulatedStep,
    });

    assert.equal(exec2.success, true);
    assert.equal(exec2.matchId, gateMatchId, "Idempotency: matchId must remain identical");

    // Total rows in DB for this candidate/job pair must be exactly 1
    const allMatches = await jobMatchRepository.listByCandidate(candidate1ProfileId);
    const countForThisJob = allMatches.filter((m) => m.jobId === canonicalJobId).length;
    assert.equal(countForThisJob, 1, "Exactly one match row must exist in PostgreSQL");
  });

  // =========================================================================
  // Gate 6: tRPC API & Cross-User Security Gate (Step 4.6)
  // =========================================================================
  await t.test("Gate 6: tRPC API & Cross-User Security Gate — session check, cross-user isolation, and truthful queued response", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const caller2 = appRouter.createCaller(createMockContext(user2Id));

    // 1. Unauthenticated rejected
    await assert.rejects(
      async () => unauthCaller.matching.list({}),
      (err: unknown) => err instanceof TRPCError && err.code === "UNAUTHORIZED"
    );

    // 2. Truthful QUEUED response
    dispatchedEvents.length = 0;
    const reqRes = await caller1.matching.request({ jobId: canonicalJobId });
    assert.equal(reqRes.status, "QUEUED");
    assert.equal(dispatchedEvents.length, 1);
    assert.equal(dispatchedEvents[0]?.name, "job.match.requested");

    // 3. User 1 can get and list their own match
    const getRes = await caller1.matching.get({ id: gateMatchId });
    assert.equal(getRes.id, gateMatchId);
    assert.equal(getRes.candidateProfileId, candidate1ProfileId);

    const listRes = await caller1.matching.list({});
    assert.ok(listRes.total >= 1);
    assert.ok(listRes.items.some((i) => i.id === gateMatchId));

    // 4. Cross-User Isolation: User 2 cannot access User 1's match
    await assert.rejects(
      async () => caller2.matching.get({ id: gateMatchId }),
      (err: unknown) => err instanceof TRPCError && err.code === "FORBIDDEN"
    );

    // 5. Cross-User Isolation: User 2 cannot trigger matching for User 1's profile
    await assert.rejects(
      async () =>
        caller2.matching.request({
          jobId: canonicalJobId,
          candidateProfileId: candidate1ProfileId,
        }),
      (err: unknown) => err instanceof TRPCError && err.code === "FORBIDDEN"
    );

    // 6. Security: Client userId injection is rejected
    await assert.rejects(
      async () =>
        caller1.matching.request({
          jobId: canonicalJobId,
          userId: user2Id,
        }),
      (err: unknown) => err instanceof TRPCError && err.code === "FORBIDDEN"
    );
  });

  // =========================================================================
  // Gate 7: End-to-End Lifecycle Gate
  // =========================================================================
  await t.test("Gate 7: End-to-End Lifecycle Gate — candidate + job profile mapper integration and entity consistency", async () => {
    const candidateProfile = await candidateProfileRepository.findById(candidate1ProfileId);
    assert.ok(candidateProfile !== null);

    const canonicalJob = await jobRepository.findById(canonicalJobId);
    assert.ok(canonicalJob !== null);

    const candidateData = buildCandidateMatchData(candidateProfile!, null, []);
    const jobData = buildJobMatchData(canonicalJob!);

    assert.equal(candidateData.candidateProfileId, candidate1ProfileId);
    assert.equal(candidateData.experienceLevel, "SENIOR");
    assert.ok(candidateData.skills.includes("TypeScript"));

    assert.equal(jobData.id, canonicalJobId);
    assert.equal(jobData.status, "ACTIVE");
    assert.equal(jobData.remoteType, "WORLDWIDE_REMOTE");

    // Complete evaluation entity validated against full Zod schema
    const match = await jobMatchRepository.findById(gateMatchId);
    assert.ok(match !== null);
    assert.doesNotThrow(() => jobMatchSchema.parse(match));
  });
});
