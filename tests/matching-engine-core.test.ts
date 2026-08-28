/**
 * Job Hub — Phase 4 / Stage B (Steps 4.2, 4.3, 4.4)
 * Matching Engine Core Test Suite
 *
 * Tests:
 * 1. Step 4.2: Hard Constraint Evaluator
 * 2. Step 4.3: Deterministic Seven-Factor Weighted Scoring Engine
 * 3. Step 4.4: AI Semantic Evaluation & Match Explainer
 * 4. Composition & Full Matching Engine Orchestrator
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockAiProvider, AiProviderError } from "@job-hub/ai";
import {
  evaluateHardConstraints,
  calculateMatchScores,
  deriveMatchDecision,
  calculateSkillsScore,
  calculateExperienceScore,
  calculateRemoteLocationScore,
  calculateProjectsScore,
  calculateEducationScore,
  calculateSalaryScore,
  calculateFreshnessScore,
  MatchExplainer,
  matchExplainerOutputSchema,
  MatchingEngine,
  DEFAULT_SCORING_WEIGHTS,
  JobMatchValidationError,
  type CandidateMatchData,
  type JobMatchData,
  type ScoringWeights,
} from "@job-hub/matching";

test("Phase 4 / Stage B: Matching Engine Core (Steps 4.2 + 4.3 + 4.4)", async (t) => {
  const referenceDate = new Date("2026-08-28T12:00:00Z");

  // =========================================================================
  // 1. STEP 4.2: HARD CONSTRAINT EVALUATOR TESTS
  // =========================================================================

  await t.test("Step 4.2: Hard Constraints — Passing valid matching candidate & job", () => {
    const candidate: CandidateMatchData = {
      remotePreference: "WORLDWIDE_REMOTE",
      preferredLocations: ["US", "CA"],
      experienceLevel: "SENIOR",
      yearsOfExperience: 6,
      skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
      salaryMin: 120000,
    };

    const job: JobMatchData = {
      title: "Senior Full Stack Engineer",
      company: "Acme Cloud",
      status: "ACTIVE",
      remoteType: "WORLDWIDE_REMOTE",
      allowedCountries: [],
      postedAt: new Date("2026-08-20T12:00:00Z"),
      experience: "5+ years",
      skills: ["TypeScript", "React", "Node.js"],
      salaryMax: 150000,
    };

    const result = evaluateHardConstraints(candidate, job, referenceDate);
    assert.equal(result.passed, true);
    assert.equal(result.failures.length, 0);
  });

  await t.test("Step 4.2: Hard Constraints — Closed/inactive job rejection", () => {
    const candidate: CandidateMatchData = { remotePreference: "WORLDWIDE_REMOTE" };
    const job: JobMatchData = {
      title: "Software Engineer",
      company: "Legacy Corp",
      status: "CLOSED",
      remoteType: "WORLDWIDE_REMOTE",
    };

    const result = evaluateHardConstraints(candidate, job, referenceDate);
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.includes("JOB_STATUS_INACTIVE")));
  });

  await t.test("Step 4.2: Hard Constraints — Stale job (>90 days) rejection", () => {
    const candidate: CandidateMatchData = { remotePreference: "WORLDWIDE_REMOTE" };
    const job: JobMatchData = {
      title: "DevOps Engineer",
      company: "CloudCo",
      status: "ACTIVE",
      remoteType: "WORLDWIDE_REMOTE",
      postedAt: new Date("2026-04-01T12:00:00Z"), // ~149 days prior to August 28
    };

    const result = evaluateHardConstraints(candidate, job, referenceDate);
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.includes("JOB_STALE")));
  });

  await t.test("Step 4.2: Hard Constraints — Worldwide remote candidate vs US-only restricted job", () => {
    const candidate: CandidateMatchData = {
      remotePreference: "WORLDWIDE_REMOTE",
      preferredLocations: [], // pure worldwide, no US presence
    };
    const job: JobMatchData = {
      title: "Backend Engineer",
      company: "US Only Inc",
      status: "ACTIVE",
      remoteType: "COUNTRY_REMOTE",
      allowedCountries: ["US"],
    };

    const result = evaluateHardConstraints(candidate, job, referenceDate);
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.includes("COUNTRY_INELIGIBLE")));
  });

  await t.test("Step 4.2: Hard Constraints — Remote candidate vs Onsite job", () => {
    const candidate: CandidateMatchData = { remotePreference: "WORLDWIDE_REMOTE" };
    const job: JobMatchData = {
      title: "Hardware Systems Engineer",
      company: "Fab Corp",
      status: "ACTIVE",
      remoteType: "ONSITE",
      location: "San Francisco, CA",
    };

    const result = evaluateHardConstraints(candidate, job, referenceDate);
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.includes("REMOTE_POLICY_MISMATCH")));
  });

  await t.test("Step 4.2: Hard Constraints — Entry-level candidate vs Staff/Lead requirement", () => {
    const candidate: CandidateMatchData = {
      experienceLevel: "ENTRY",
      yearsOfExperience: 1,
    };
    const job: JobMatchData = {
      title: "Principal Infrastructure Architect",
      company: "ScaleTech",
      status: "ACTIVE",
      remoteType: "WORLDWIDE_REMOTE",
      experience: "8+ years",
    };

    const result = evaluateHardConstraints(candidate, job, referenceDate);
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => f.includes("EXPERIENCE_FLOOR_UNMET")));
  });

  await t.test("Step 4.2: Hard Constraints — Multiple concurrent failures recorded", () => {
    const candidate: CandidateMatchData = {
      remotePreference: "WORLDWIDE_REMOTE",
      experienceLevel: "ENTRY",
      yearsOfExperience: 0.5,
    };
    const job: JobMatchData = {
      title: "Staff Engineer",
      company: "Old Closed Corp",
      status: "CLOSED",
      remoteType: "ONSITE",
      postedAt: new Date("2025-01-01T00:00:00Z"), // very stale
      experience: "10+ years",
    };

    const result = evaluateHardConstraints(candidate, job, referenceDate);
    assert.equal(result.passed, false);
    // Should record multiple distinct reasons: inactive, stale, remote mismatch, experience floor
    assert.ok(result.failures.length >= 3);
  });

  await t.test("Step 4.2: Hard Constraints — Deterministic reproducibility", () => {
    const candidate: CandidateMatchData = {
      remotePreference: "WORLDWIDE_REMOTE",
      skills: ["Go"],
    };
    const job: JobMatchData = {
      title: "Go Developer",
      company: "Tech",
      status: "ACTIVE",
      remoteType: "WORLDWIDE_REMOTE",
    };

    const res1 = evaluateHardConstraints(candidate, job, referenceDate);
    const res2 = evaluateHardConstraints(candidate, job, referenceDate);
    assert.deepEqual(res1, res2);
  });

  // =========================================================================
  // 2. STEP 4.3: DETERMINISTIC SEVEN-FACTOR WEIGHTED SCORING ENGINE TESTS
  // =========================================================================

  await t.test("Step 4.3: Scoring Engine — Default weights sum to exactly 1.00", () => {
    const w = DEFAULT_SCORING_WEIGHTS;
    const sum =
      w.skills +
      w.experience +
      w.remoteLocation +
      w.projects +
      w.education +
      w.salary +
      w.freshness;
    assert.equal(Math.round(sum * 100) / 100, 1.0);
    assert.equal(w.skills, 0.30);
    assert.equal(w.experience, 0.20);
    assert.equal(w.remoteLocation, 0.20);
    assert.equal(w.projects, 0.10);
    assert.equal(w.education, 0.10);
    assert.equal(w.salary, 0.05);
    assert.equal(w.freshness, 0.05);
  });

  await t.test("Step 4.3: Scoring Engine — Individual factor calculator behaviors", () => {
    const candidate: CandidateMatchData = {
      skills: ["typescript", "react", "next.js", "postgresql"],
      experienceLevel: "SENIOR",
      yearsOfExperience: 6,
      remotePreference: "WORLDWIDE_REMOTE",
      projects: [{ name: "Job Hub", technologies: ["typescript", "react", "postgresql"] }],
      education: [{ degree: "Bachelor of Science", fieldOfStudy: "Computer Science" }],
      salaryMin: 100000,
    };

    const job: JobMatchData = {
      title: "Senior Fullstack Engineer",
      company: "Tech Corp",
      skills: ["typescript", "react", "postgresql"],
      experience: "5+ years",
      remoteType: "WORLDWIDE_REMOTE",
      requirements: ["Bachelor in Computer Science or equivalent"],
      salaryMin: 120000,
      salaryMax: 160000,
      postedAt: new Date(referenceDate.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days old
    };

    // Factor 1: Skills coverage (100% matched)
    const skillsScore = calculateSkillsScore(candidate, job);
    assert.equal(skillsScore, 1.0);

    // Factor 2: Experience (6 yrs >= 5 yrs)
    const expScore = calculateExperienceScore(candidate, job);
    assert.equal(expScore, 1.0);

    // Factor 3: Remote (worldwide matches worldwide)
    const remoteScore = calculateRemoteLocationScore(candidate, job);
    assert.equal(remoteScore, 1.0);

    // Factor 4: Projects (3 tech matches)
    const projScore = calculateProjectsScore(candidate, job);
    assert.equal(projScore, 1.0);

    // Factor 5: Education (Bachelor satisfies requirement)
    const eduScore = calculateEducationScore(candidate, job);
    assert.equal(eduScore, 1.0);

    // Factor 6: Salary (job min 120k >= candidate min 100k)
    const salScore = calculateSalaryScore(candidate, job);
    assert.equal(salScore, 1.0);

    // Factor 7: Freshness (2 days old <= 7 days)
    const freshScore = calculateFreshnessScore(job, referenceDate);
    assert.equal(freshScore, 1.0);
  });

  await t.test("Step 4.3: Scoring Engine — Perfect match produces 10.00 score and EXCELLENT_MATCH", () => {
    const candidate: CandidateMatchData = {
      skills: ["typescript", "react", "node"],
      experienceLevel: "SENIOR",
      yearsOfExperience: 5,
      remotePreference: "WORLDWIDE_REMOTE",
      projects: [{ name: "P1", technologies: ["typescript", "react", "node"] }],
      education: [{ degree: "Bachelor of Science" }],
      salaryMin: 100000,
    };
    const job: JobMatchData = {
      title: "Senior Engineer",
      company: "Prime",
      status: "ACTIVE",
      skills: ["typescript", "react", "node"],
      experience: "5+ years",
      remoteType: "WORLDWIDE_REMOTE",
      requirements: ["Bachelor degree"],
      salaryMin: 110000,
      postedAt: referenceDate,
    };

    const hardConstraints = { passed: true, failures: [] };
    const result = calculateMatchScores(candidate, job, hardConstraints, undefined, referenceDate);

    assert.equal(result.overallScore, 10.0);
    assert.equal(result.decision, "EXCELLENT_MATCH");
  });

  await t.test("Step 4.3: Scoring Engine — Decision threshold transitions", () => {
    assert.equal(deriveMatchDecision(5.99), "SKIP");
    assert.equal(deriveMatchDecision(6.00), "REVIEW");
    assert.equal(deriveMatchDecision(7.99), "REVIEW");
    assert.equal(deriveMatchDecision(8.00), "STRONG_MATCH");
    assert.equal(deriveMatchDecision(8.99), "STRONG_MATCH");
    assert.equal(deriveMatchDecision(9.00), "EXCELLENT_MATCH");
    assert.equal(deriveMatchDecision(10.00), "EXCELLENT_MATCH");
  });

  await t.test("Step 4.3: Scoring Engine — Hard constraint failure overrides score to 0.00 and SKIP", () => {
    const candidate: CandidateMatchData = {
      skills: ["typescript", "react"],
      experienceLevel: "SENIOR",
    };
    const job: JobMatchData = {
      title: "Senior Engineer",
      company: "Disqualified Inc",
      skills: ["typescript", "react"],
      remoteType: "ONSITE",
    };

    const failedConstraints = {
      passed: false,
      failures: ["REMOTE_POLICY_MISMATCH: Candidate requires remote."],
    };

    const result = calculateMatchScores(candidate, job, failedConstraints, undefined, referenceDate);
    assert.equal(result.overallScore, 0.0);
    assert.equal(result.decision, "SKIP");
  });

  await t.test("Step 4.3: Scoring Engine — Custom valid weights applied accurately", () => {
    const customWeights: ScoringWeights = {
      skills: 0.50,
      experience: 0.20,
      remoteLocation: 0.10,
      projects: 0.05,
      education: 0.05,
      salary: 0.05,
      freshness: 0.05,
    };

    const candidate: CandidateMatchData = { skills: ["python"] };
    const job: JobMatchData = { title: "Python Dev", company: "PyCorp", skills: ["python"] };

    const result = calculateMatchScores(
      candidate,
      job,
      { passed: true, failures: [] },
      customWeights,
      referenceDate
    );

    assert.equal(result.weightsUsed.skills, 0.50);
    assert.ok(result.overallScore >= 0 && result.overallScore <= 10);
  });

  await t.test("Step 4.3: Scoring Engine — Rejects invalid weights not summing to 1.00", () => {
    const invalidWeights = {
      skills: 0.80,
      experience: 0.50, // sum > 1.0
      remoteLocation: 0.10,
      projects: 0.10,
      education: 0.10,
      salary: 0.0,
      freshness: 0.0,
    };

    assert.throws(() => {
      calculateMatchScores(
        { skills: [] },
        { title: "Test", company: "Test" },
        { passed: true, failures: [] },
        invalidWeights as unknown as ScoringWeights,
        referenceDate
      );
    });
  });

  // =========================================================================
  // 3. STEP 4.4: AI SEMANTIC EVALUATION / MATCH EXPLAINER TESTS
  // =========================================================================

  await t.test("Step 4.4: Match Explainer — Valid structured AI output parsed and validated", async () => {
    const mockAi = new MockAiProvider(async () => ({
      strengths: [
        "Candidate possesses 6 years of production TypeScript and React experience.",
        "Demonstrated fullstack capabilities with PostgreSQL and cloud deployments.",
      ],
      gaps: ["No direct Go experience listed in verified profile."],
      risks: ["Target role requires occasional PST overlap."],
      explanation:
        "Strong overall alignment across core tech stack and seniority. Minor technology gap in Go does not outweigh senior frontend architecture background.",
      confidence: 0.94,
    }));

    const explainer = new MatchExplainer(mockAi);
    const result = await explainer.explain({
      candidate: { skills: ["TypeScript", "React"], experienceLevel: "SENIOR" },
      job: { title: "Senior Engineer", company: "CloudCorp" },
      hardConstraints: { passed: true, failures: [] },
      overallScore: 8.75,
      decision: "STRONG_MATCH",
      categoryScores: {
        skillsScore: 0.9,
        experienceScore: 0.9,
        remoteLocationScore: 1.0,
        projectsScore: 0.8,
        educationScore: 0.8,
        salaryScore: 0.8,
        freshnessScore: 0.9,
      },
      weights: DEFAULT_SCORING_WEIGHTS,
    });

    assert.equal(result.strengths.length, 2);
    assert.equal(result.gaps.length, 1);
    assert.equal(result.confidence, 0.94);
    assert.ok(result.explanation.includes("Strong overall alignment"));
  });

  await t.test("Step 4.4: Match Explainer — Malformed AI output missing strengths is rejected", async () => {
    const mockAi = new MockAiProvider(async () => ({
      // missing strengths array
      gaps: ["Missing Go"],
      risks: [],
      explanation: "Good candidate but incomplete data.",
      confidence: 0.8,
    }));

    const explainer = new MatchExplainer(mockAi);
    await assert.rejects(
      async () =>
        explainer.explain({
          candidate: { skills: [] },
          job: { title: "Engineer", company: "Co" },
          hardConstraints: { passed: true, failures: [] },
          overallScore: 7.0,
          decision: "REVIEW",
          categoryScores: {
            skillsScore: 0.7,
            experienceScore: 0.7,
            remoteLocationScore: 0.7,
            projectsScore: 0.7,
            educationScore: 0.7,
            salaryScore: 0.7,
            freshnessScore: 0.7,
          },
          weights: DEFAULT_SCORING_WEIGHTS,
        }),
      (err: unknown) => err instanceof JobMatchValidationError
    );
  });

  await t.test("Step 4.4: Match Explainer — Provider errors wrapped into clean JobMatchValidationError", async () => {
    const mockAi = new MockAiProvider(async () => {
      throw new AiProviderError("Rate limit exceeded", "RATE_LIMIT");
    });

    const explainer = new MatchExplainer(mockAi);
    await assert.rejects(
      async () =>
        explainer.explain({
          candidate: { skills: [] },
          job: { title: "Engineer", company: "Co" },
          hardConstraints: { passed: true, failures: [] },
          overallScore: 8.0,
          decision: "STRONG_MATCH",
          categoryScores: {
            skillsScore: 0.8,
            experienceScore: 0.8,
            remoteLocationScore: 0.8,
            projectsScore: 0.8,
            educationScore: 0.8,
            salaryScore: 0.8,
            freshnessScore: 0.8,
          },
          weights: DEFAULT_SCORING_WEIGHTS,
        }),
      (err: unknown) =>
        err instanceof JobMatchValidationError &&
        err.message.includes("Rate limit exceeded")
    );
  });

  // =========================================================================
  // 4. FULL MATCHING ENGINE COMPOSITION & ORCHESTRATION TESTS
  // =========================================================================

  await t.test("Matching Engine — Full pipeline with MockAiProvider produces complete MatchEvaluationResult", async () => {
    const mockAi = new MockAiProvider(async () => ({
      strengths: ["Direct Next.js production experience matches core requirement."],
      gaps: ["No GraphQL production history verified."],
      risks: ["Salary expectation close to budget ceiling."],
      explanation: "Excellent candidate fit for fullstack frontend-heavy roadmap.",
      confidence: 0.95,
    }));

    const engine = new MatchingEngine({
      aiProvider: mockAi,
      referenceDate,
    });

    const result = await engine.evaluate({
      candidate: {
        candidateProfileId: "cand_test_1",
        skills: ["TypeScript", "Next.js", "TailwindCSS"],
        experienceLevel: "SENIOR",
        yearsOfExperience: 6,
        remotePreference: "WORLDWIDE_REMOTE",
        projects: [{ name: "Job Hub", technologies: ["TypeScript", "Next.js"] }],
        education: [{ degree: "BSc" }],
        salaryMin: 120000,
      },
      job: {
        id: "job_test_1",
        title: "Senior Full Stack Engineer",
        company: "NextGen Labs",
        status: "ACTIVE",
        remoteType: "WORLDWIDE_REMOTE",
        skills: ["TypeScript", "Next.js"],
        experience: "5+ years",
        salaryMin: 130000,
        salaryMax: 160000,
        postedAt: referenceDate,
      },
    });

    assert.equal(result.hardConstraints.passed, true);
    assert.ok(result.overallScore >= 8.5);
    assert.equal(result.decision, "EXCELLENT_MATCH");
    assert.equal(result.strengths.length, 1);
    assert.equal(result.gaps.length, 1);
    assert.equal(result.confidence, 0.95);
    assert.ok(result.explanation.includes("Excellent candidate fit"));
  });

  await t.test("Matching Engine — Disqualified match immediately bypasses AI and produces SKIP decision", async () => {
    // Note: MockAiProvider will throw if called, proving AI was NOT called
    const mockAi = new MockAiProvider(async () => {
      throw new Error("AI should not be called when hard constraints fail!");
    });

    const engine = new MatchingEngine({
      aiProvider: mockAi,
      referenceDate,
    });

    const result = await engine.evaluate({
      candidate: {
        remotePreference: "WORLDWIDE_REMOTE",
        skills: ["TypeScript"],
      },
      job: {
        title: "Onsite Hardware Tech",
        company: "Hardware Inc",
        status: "ACTIVE",
        remoteType: "ONSITE", // causes immediate failure
      },
    });

    assert.equal(result.hardConstraints.passed, false);
    assert.equal(result.overallScore, 0.0);
    assert.equal(result.decision, "SKIP");
    assert.ok(result.explanation.includes("REMOTE_POLICY_MISMATCH"));
  });
});
