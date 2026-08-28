/**
 * Job Hub — Phase 4 / Step 4.5
 * Durable Matching Workflow Test Suite
 *
 * Tests:
 * 1. Valid candidate + job → successful JobMatch persistence
 * 2. Hard constraint failure → SKIP match persisted correctly
 * 3. Repeated same event → no duplicate job_match
 * 4. Existing match → idempotent update
 * 5. Candidate not found → NonRetriableError
 * 6. Job not found → NonRetriableError
 * 7. AI provider failure → observable error, no silent conversion
 * 8. AI schema validation failure → validation error
 * 9. Database persistence failure behavior
 * 10. Correct persisted seven-factor scores
 * 11. Correct AI strengths/gaps/risks/explanation/confidence
 * 12. Inngest event catalog registration for matching events
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockAiProvider, AiProviderError } from "@job-hub/ai";
import {
  jobMatchRequestedEvent,
  jobMatchedEvent,
  createMatchCandidateJobFunction,
} from "@job-hub/inngest";
import {
  type CandidateProfileRepository,
  type CandidatePreferencesRepository,
  type ProjectsRepository,
  type CandidateProfile,
  type CandidatePreferences,
  type Project,
} from "@job-hub/candidate/server";
import { type JobRepository } from "@job-hub/jobs/server";
import type { Job } from "@job-hub/jobs";
import {
  type JobMatchRepository,
  type JobMatch,
  type CreateJobMatchInput,
  type JobMatchFilter,
} from "@job-hub/matching/server";
import { NonRetriableError } from "inngest";

// =============================================================================
// IN-MEMORY TEST REPOSITORIES (Deterministic & isolated)
// =============================================================================

class MockCandidateProfileRepository implements CandidateProfileRepository {
  profiles = new Map<string, CandidateProfile>();

  async findById(id: string): Promise<CandidateProfile | null> {
    return this.profiles.get(id) ?? null;
  }
  async findByUserId(userId: string): Promise<CandidateProfile | null> {
    for (const p of this.profiles.values()) {
      if (p.userId === userId) return p;
    }
    return null;
  }
  async create(input: any): Promise<CandidateProfile> {
    const p: CandidateProfile = {
      id: input.id ?? `cand_${Date.now()}`,
      userId: input.userId,
      headline: input.headline ?? null,
      portfolioUrl: null,
      linkedinUrl: null,
      profileData: input.profileData ?? null,
      sourceResumeId: null,
      profiledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.profiles.set(p.id, p);
    return p;
  }
  async update(id: string, input: any): Promise<CandidateProfile> {
    const existing = this.profiles.get(id);
    if (!existing) throw new Error("Not found");
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.profiles.set(id, updated);
    return updated;
  }
  async upsertProfileData(id: string, input: any): Promise<CandidateProfile> {
    return this.update(id, input);
  }
}

class MockCandidatePreferencesRepository implements CandidatePreferencesRepository {
  prefs = new Map<string, CandidatePreferences>();

  async findByProfileId(candidateProfileId: string): Promise<CandidatePreferences | null> {
    return this.prefs.get(candidateProfileId) ?? null;
  }
  async upsert(candidateProfileId: string, input: any): Promise<CandidatePreferences> {
    const existing = this.prefs.get(candidateProfileId);
    const updated: CandidatePreferences = {
      id: existing?.id ?? `pref_${Date.now()}`,
      candidateProfileId,
      remotePreference: input.remotePreference ?? "UNKNOWN",
      preferredLocations: input.preferredLocations ?? [],
      salaryMin: input.salaryMin ?? null,
      salaryCurrency: input.salaryCurrency ?? "USD",
      targetRoles: input.targetRoles ?? [],
      experienceLevel: input.experienceLevel ?? "MID",
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    this.prefs.set(candidateProfileId, updated);
    return updated;
  }
}

class MockProjectsRepository implements ProjectsRepository {
  projects: Project[] = [];

  async findByProfileId(candidateProfileId: string): Promise<Project[]> {
    return this.projects.filter((p) => p.candidateProfileId === candidateProfileId);
  }
  async findById(id: string): Promise<Project | null> {
    return this.projects.find((p) => p.id === id) ?? null;
  }
  async create(input: any): Promise<Project> {
    const proj: Project = {
      id: `proj_${Date.now()}_${Math.random()}`,
      candidateProfileId: input.candidateProfileId,
      name: input.name,
      description: input.description ?? null,
      url: input.url ?? null,
      repositoryUrl: input.repositoryUrl ?? null,
      primaryLanguage: input.primaryLanguage ?? null,
      languages: input.languages ?? [],
      technologies: input.technologies ?? [],
      architectureEvidence: null,
      qualityNotes: null,
      source: "GITHUB",
      verificationStatus: "VERIFIED",
      confirmedByUser: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.push(proj);
    return proj;
  }
  async delete(id: string): Promise<boolean> {
    this.projects = this.projects.filter((p) => p.id !== id);
    return true;
  }
}

class MockJobRepository implements JobRepository {
  jobs = new Map<string, Job>();

  async findById(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? null;
  }
  async findBySourceAndSourceJobId(source: string, sourceJobId: string): Promise<Job | null> {
    for (const j of this.jobs.values()) {
      if (j.source === source && j.sourceJobId === sourceJobId) return j;
    }
    return null;
  }
  async create(input: any): Promise<Job> {
    const job: Job = {
      id: input.id ?? `job_${Date.now()}`,
      title: input.title,
      company: input.company,
      description: input.description ?? null,
      location: input.location ?? null,
      remoteType: input.remoteType ?? "UNKNOWN",
      allowedCountries: input.allowedCountries ?? [],
      skills: input.skills ?? [],
      requirements: input.requirements ?? [],
      experience: input.experience ?? null,
      salary: input.salary ?? null,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      currency: input.currency ?? "USD",
      applicationUrl: input.applicationUrl ?? "https://example.com/apply",
      canonicalUrl: input.canonicalUrl ?? "https://example.com/job",
      source: input.source ?? "manual",
      sourceJobId: input.sourceJobId ?? null,
      sourceNormalizedPayload: null,
      status: input.status ?? "ACTIVE",
      isVerified: true,
      postedAt: input.postedAt ?? new Date(),
      lastVerifiedAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(job.id, job);
    return job;
  }
  async update(id: string, input: any): Promise<Job> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error("Not found");
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.jobs.set(id, updated);
    return updated;
  }
  async delete(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }
  async list(): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }
}

class MockJobMatchRepository implements JobMatchRepository {
  matches = new Map<string, JobMatch>(); // key: `${candidateProfileId}:${jobId}`
  shouldFailUpsert = false;

  async findById(id: string): Promise<JobMatch | null> {
    for (const m of this.matches.values()) {
      if (m.id === id) return m;
    }
    return null;
  }

  async findByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<JobMatch | null> {
    return this.matches.get(`${candidateProfileId}:${jobId}`) ?? null;
  }

  async create(input: CreateJobMatchInput): Promise<JobMatch> {
    const key = `${input.candidateProfileId}:${input.jobId}`;
    if (this.matches.has(key)) {
      throw new Error(`Duplicate match for candidate ${input.candidateProfileId} and job ${input.jobId}`);
    }
    return this.upsert(input);
  }

  async upsert(input: CreateJobMatchInput): Promise<JobMatch> {
    if (this.shouldFailUpsert) {
      throw new Error("PostgreSQL connection failure during upsert");
    }
    const key = `${input.candidateProfileId}:${input.jobId}`;
    const existing = this.matches.get(key);
    const match: JobMatch = {
      id: existing?.id ?? input.id ?? `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      candidateProfileId: input.candidateProfileId,
      jobId: input.jobId,
      overallScore: input.overallScore,
      decision: input.decision,
      hardConstraintsPassed: input.hardConstraintsPassed,
      hardConstraintFailures: input.hardConstraintFailures ?? [],
      categoryScores: input.categoryScores,
      strengths: input.strengths ?? [],
      gaps: input.gaps ?? [],
      risks: input.risks ?? [],
      explanation: input.explanation,
      confidence: input.confidence,
      weightsUsed: input.weightsUsed ?? {
        skills: 0.3,
        experience: 0.2,
        remoteLocation: 0.2,
        projects: 0.1,
        education: 0.1,
        salary: 0.05,
        freshness: 0.05,
      },
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    this.matches.set(key, match);
    return match;
  }

  async update(id: string, input: any): Promise<JobMatch> {
    for (const [key, m] of this.matches.entries()) {
      if (m.id === id) {
        const updated = { ...m, ...input, updatedAt: new Date() };
        this.matches.set(key, updated);
        return updated;
      }
    }
    throw new Error("Match not found");
  }

  async delete(id: string): Promise<boolean> {
    for (const [key, m] of this.matches.entries()) {
      if (m.id === id) {
        this.matches.delete(key);
        return true;
      }
    }
    return false;
  }

  async listByCandidate(candidateProfileId: string, filter?: JobMatchFilter): Promise<JobMatch[]> {
    let result = Array.from(this.matches.values()).filter(
      (m) => m.candidateProfileId === candidateProfileId
    );
    if (filter?.decision) {
      result = result.filter((m) => m.decision === filter.decision);
    }
    if (filter?.minScore !== undefined) {
      result = result.filter((m) => m.overallScore >= filter.minScore!);
    }
    return result;
  }
}

// Helper to create an Inngest mock step execution context
function createMockStep() {
  const executedSteps: string[] = [];
  const emittedEvents: Array<{ name: string; data: any }> = [];

  const step = {
    run: async <T>(stepId: string, fn: () => Promise<T>): Promise<T> => {
      executedSteps.push(stepId);
      return await fn();
    },
    sendEvent: async (stepId: string, events: any) => {
      executedSteps.push(stepId);
      const evArray = Array.isArray(events) ? events : [events];
      emittedEvents.push(...evArray);
      return { ids: ["ev_mock_id"] };
    },
  };

  return { step, executedSteps, emittedEvents };
}

// =============================================================================
// TEST SUITE
// =============================================================================

test("Phase 4 / Step 4.5: Durable Matching Workflow Test Suite", async (t) => {
  const referenceDate = new Date("2026-08-28T12:00:00Z");

  // Setup mock repositories
  const candidateProfileRepo = new MockCandidateProfileRepository();
  const candidatePreferencesRepo = new MockCandidatePreferencesRepository();
  const projectsRepo = new MockProjectsRepository();
  const jobRepo = new MockJobRepository();
  const jobMatchRepo = new MockJobMatchRepository();

  // Create test candidate profile
  const testCandidate = await candidateProfileRepo.create({
    id: "cand_alice_101",
    userId: "usr_alice",
    headline: "Senior Full Stack Engineer",
    profileData: {
      technicalSkills: [{ name: "TypeScript" }, { name: "React" }, { name: "Node.js" }],
      technologies: ["PostgreSQL", "Next.js"],
      education: [{ degree: "BSc", fieldOfStudy: "Computer Science", institution: "MIT" }],
      yearsOfExperience: 6,
    },
  });

  await candidatePreferencesRepo.upsert(testCandidate.id, {
    remotePreference: "WORLDWIDE_REMOTE",
    preferredLocations: ["US", "CA"],
    salaryMin: 120000,
    experienceLevel: "SENIOR",
  });

  await projectsRepo.create({
    candidateProfileId: testCandidate.id,
    name: "Job Hub",
    technologies: ["TypeScript", "React", "PostgreSQL"],
  });

  // Create test matching job
  const testJob = await jobRepo.create({
    id: "job_cloud_202",
    title: "Senior Full Stack Engineer",
    company: "CloudTech Inc",
    status: "ACTIVE",
    remoteType: "WORLDWIDE_REMOTE",
    allowedCountries: [],
    skills: ["TypeScript", "React", "PostgreSQL"],
    requirements: ["Bachelor in CS", "5+ years experience"],
    experience: "5+ years",
    salaryMin: 130000,
    salaryMax: 160000,
    postedAt: referenceDate,
  });

  // Mock AI Provider with truthful responses
  const mockAi = new MockAiProvider(async () => ({
    strengths: [
      "Verified 6 years of TypeScript and React production experience aligns with role.",
      "Demonstrated PostgreSQL and fullstack project evidence in Job Hub repository.",
    ],
    gaps: ["No direct Docker production operations highlighted."],
    risks: ["Candidate minimum compensation is within budget."],
    explanation:
      "Outstanding alignment across core frontend and backend requirements. The candidate satisfies all seniority benchmarks.",
    confidence: 0.95,
  }));

  // Create workflow function with injected dependencies
  const matchingWorkflowFunction = createMatchCandidateJobFunction({
    candidateProfileRepo,
    candidatePreferencesRepo,
    projectsRepo,
    jobRepo,
    jobMatchRepo,
    aiProvider: mockAi,
    referenceDate,
  });

  const handler = (matchingWorkflowFunction as any)["fn"];
  assert.ok(typeof handler === "function", "Inngest function must expose underlying async handler fn");

  // ---------------------------------------------------------------------------
  // 1. Event Catalog Registration
  // ---------------------------------------------------------------------------
  await t.test("1. Event Catalog: validates eventType schemas for matching events", () => {
    assert.equal(jobMatchRequestedEvent.name, "job.match.requested");
    assert.equal(jobMatchedEvent.name, "job.matched");
  });

  // ---------------------------------------------------------------------------
  // 2. Valid candidate + job → successful JobMatch persistence
  // ---------------------------------------------------------------------------
  await t.test("2. Valid candidate + job: executes durable workflow and persists JobMatch", async () => {
    const { step, executedSteps, emittedEvents } = createMockStep();

    const result = await handler({
      event: {
        name: "job.match.requested",
        data: {
          candidateProfileId: testCandidate.id,
          jobId: testJob.id,
        },
      },
      step,
    });

    assert.equal(result.status, "MATCHED");
    assert.equal(result.candidateProfileId, testCandidate.id);
    assert.equal(result.jobId, testJob.id);
    assert.equal(result.hardConstraintsPassed, true);
    assert.ok(result.overallScore >= 8.5);
    assert.equal(result.decision, "EXCELLENT_MATCH");

    // Verify all durable steps were executed
    assert.ok(executedSteps.includes("load-candidate-data"));
    assert.ok(executedSteps.includes("load-job-data"));
    assert.ok(executedSteps.includes("evaluate-hard-constraints"));
    assert.ok(executedSteps.includes("compute-match-scores"));
    assert.ok(executedSteps.includes("generate-ai-explanation"));
    assert.ok(executedSteps.includes("persist-job-match"));
    assert.ok(executedSteps.includes("emit-job-matched"));

    // Verify completion event was emitted
    assert.equal(emittedEvents.length, 1);
    assert.equal(emittedEvents[0]?.name, "job.matched");
    assert.equal(emittedEvents[0]?.data.matchId, result.matchId);

    // Verify persistence in repository
    const persisted = await jobMatchRepo.findById(result.matchId);
    assert.ok(persisted !== null);
    assert.equal(persisted.overallScore, result.overallScore);
    assert.equal(persisted.decision, "EXCELLENT_MATCH");
    assert.equal(persisted.strengths.length, 2);
    assert.equal(persisted.confidence, 0.95);
  });

  // ---------------------------------------------------------------------------
  // 3. Hard constraint failure → SKIP match persisted correctly
  // ---------------------------------------------------------------------------
  await t.test("3. Hard constraint failure: persists SKIP match without calling AI", async () => {
    const onsiteJob = await jobRepo.create({
      id: "job_onsite_303",
      title: "Onsite Lab Engineer",
      company: "Hardware Corp",
      status: "ACTIVE",
      remoteType: "ONSITE",
    });

    // Mock AI that throws if invoked to prove it was bypassed
    const failAi = new MockAiProvider(async () => {
      throw new Error("AI should not be called when hard constraints fail!");
    });

    const workflowWithFailAi = createMatchCandidateJobFunction({
      candidateProfileRepo,
      candidatePreferencesRepo,
      projectsRepo,
      jobRepo,
      jobMatchRepo,
      aiProvider: failAi,
      referenceDate,
    });
    const customHandler = (workflowWithFailAi as any)["fn"];

    const { step, executedSteps, emittedEvents } = createMockStep();
    const result = await customHandler({
      event: {
        name: "job.match.requested",
        data: {
          candidateProfileId: testCandidate.id,
          jobId: onsiteJob.id,
        },
      },
      step,
    });

    assert.equal(result.status, "MATCHED");
    assert.equal(result.hardConstraintsPassed, false);
    assert.equal(result.overallScore, 0.0);
    assert.equal(result.decision, "SKIP");

    // Verify persisted record in repository
    const persisted = await jobMatchRepo.findById(result.matchId);
    assert.ok(persisted !== null);
    assert.equal(persisted.hardConstraintsPassed, false);
    assert.equal(persisted.decision, "SKIP");
    assert.ok(persisted.hardConstraintFailures.some((f) => f.includes("REMOTE_POLICY_MISMATCH")));
    assert.ok(persisted.explanation.includes("disqualified by hard constraint"));

    assert.equal(emittedEvents.length, 1);
    assert.equal(emittedEvents[0]?.data.decision, "SKIP");
  });

  // ---------------------------------------------------------------------------
  // 4. Repeated same event → no duplicate job_match
  // ---------------------------------------------------------------------------
  await t.test("4. Idempotency: repeated workflow execution produces zero duplicate rows", async () => {
    const initialMatchCount = (await jobMatchRepo.listByCandidate(testCandidate.id)).length;

    const { step } = createMockStep();
    // Run 1
    const res1 = await handler({
      event: {
        name: "job.match.requested",
        data: { candidateProfileId: testCandidate.id, jobId: testJob.id },
      },
      step,
    });

    // Run 2 (identical event)
    const res2 = await handler({
      event: {
        name: "job.match.requested",
        data: { candidateProfileId: testCandidate.id, jobId: testJob.id },
      },
      step,
    });

    const finalMatchCount = (await jobMatchRepo.listByCandidate(testCandidate.id)).length;

    // Must update the existing match rather than creating duplicate row
    assert.equal(res1.matchId, res2.matchId);
    assert.equal(finalMatchCount, initialMatchCount);
  });

  // ---------------------------------------------------------------------------
  // 5. Existing match → idempotent update
  // ---------------------------------------------------------------------------
  await t.test("5. Idempotent update: re-evaluating with custom weights updates existing row", async () => {
    const customWeights = {
      skills: 0.6,
      experience: 0.1,
      remoteLocation: 0.1,
      projects: 0.1,
      education: 0.05,
      salary: 0.025,
      freshness: 0.025,
    };

    const { step } = createMockStep();
    const updatedResult = await handler({
      event: {
        name: "job.match.requested",
        data: {
          candidateProfileId: testCandidate.id,
          jobId: testJob.id,
          customWeights,
        },
      },
      step,
    });

    const persisted = await jobMatchRepo.findById(updatedResult.matchId);
    assert.ok(persisted !== null);
    assert.equal(persisted.weightsUsed.skills, 0.6);
  });

  // ---------------------------------------------------------------------------
  // 6. Candidate not found → NonRetriableError
  // ---------------------------------------------------------------------------
  await t.test("6. Candidate not found: throws NonRetriableError", async () => {
    const { step } = createMockStep();

    await assert.rejects(
      async () =>
        handler({
          event: {
            name: "job.match.requested",
            data: { candidateProfileId: "cand_non_existent_999", jobId: testJob.id },
          },
          step,
        }),
      (err: unknown) =>
        err instanceof Error &&
        (err.name === "NonRetriableError" || err instanceof NonRetriableError) &&
        err.message.includes("Candidate profile with ID") &&
        err.message.includes("was not found")
    );
  });

  // ---------------------------------------------------------------------------
  // 7. Job not found → NonRetriableError
  // ---------------------------------------------------------------------------
  await t.test("7. Job not found: throws NonRetriableError", async () => {
    const { step } = createMockStep();

    await assert.rejects(
      async () =>
        handler({
          event: {
            name: "job.match.requested",
            data: { candidateProfileId: testCandidate.id, jobId: "job_non_existent_999" },
          },
          step,
        }),
      (err: unknown) =>
        err instanceof Error &&
        (err.name === "NonRetriableError" || err instanceof NonRetriableError) &&
        err.message.includes("Job with ID") &&
        err.message.includes("was not found")
    );
  });

  // ---------------------------------------------------------------------------
  // 8. AI provider failure → observable error, no silent conversion
  // ---------------------------------------------------------------------------
  await t.test("8. AI provider failure: raises error observably without silent conversion", async () => {
    const failingAi = new MockAiProvider(async () => {
      throw new AiProviderError("OpenAI 503 Service Unavailable", "SERVICE_UNAVAILABLE");
    });

    const wf = createMatchCandidateJobFunction({
      candidateProfileRepo,
      candidatePreferencesRepo,
      projectsRepo,
      jobRepo,
      jobMatchRepo,
      aiProvider: failingAi,
      referenceDate,
    });
    const customHandler = (wf as any)["fn"];

    const { step } = createMockStep();
    await assert.rejects(
      async () =>
        customHandler({
          event: {
            name: "job.match.requested",
            data: { candidateProfileId: testCandidate.id, jobId: testJob.id },
          },
          step,
        }),
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("AI semantic match explanation failed")
    );
  });

  // ---------------------------------------------------------------------------
  // 9. AI schema validation failure → validation error
  // ---------------------------------------------------------------------------
  await t.test("9. AI schema validation failure: rejects malformed AI output", async () => {
    const malformedAi = new MockAiProvider(async () => ({
      // missing required fields: strengths, explanation, confidence
      gaps: ["No Go"],
      risks: [],
    }));

    const wf = createMatchCandidateJobFunction({
      candidateProfileRepo,
      candidatePreferencesRepo,
      projectsRepo,
      jobRepo,
      jobMatchRepo,
      aiProvider: malformedAi,
      referenceDate,
    });
    const customHandler = (wf as any)["fn"];

    const { step } = createMockStep();
    await assert.rejects(
      async () =>
        customHandler({
          event: {
            name: "job.match.requested",
            data: { candidateProfileId: testCandidate.id, jobId: testJob.id },
          },
          step,
        }),
      (err: unknown) =>
        err instanceof Error &&
        (err.message.includes("failed schema validation") || err.message.includes("malformed"))
    );
  });

  // ---------------------------------------------------------------------------
  // 10. Database persistence failure behavior
  // ---------------------------------------------------------------------------
  await t.test("10. Database persistence failure: bubbles up error for Inngest retry", async () => {
    jobMatchRepo.shouldFailUpsert = true;

    const { step } = createMockStep();
    await assert.rejects(
      async () =>
        handler({
          event: {
            name: "job.match.requested",
            data: { candidateProfileId: testCandidate.id, jobId: testJob.id },
          },
          step,
        }),
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("PostgreSQL connection failure")
    );

    jobMatchRepo.shouldFailUpsert = false; // reset
  });

  // ---------------------------------------------------------------------------
  // 11. Seven-factor scores & AI attributes verified in database entity
  // ---------------------------------------------------------------------------
  await t.test("11. Persisted Entity Integrity: verifies all seven factors and AI audit fields", async () => {
    const { step } = createMockStep();
    const result = await handler({
      event: {
        name: "job.match.requested",
        data: { candidateProfileId: testCandidate.id, jobId: testJob.id },
      },
      step,
    });

    const persisted = await jobMatchRepo.findById(result.matchId);
    assert.ok(persisted !== null);

    // 7 Factors
    assert.equal(typeof persisted.categoryScores.skillsScore, "number");
    assert.equal(typeof persisted.categoryScores.experienceScore, "number");
    assert.equal(typeof persisted.categoryScores.remoteLocationScore, "number");
    assert.equal(typeof persisted.categoryScores.projectsScore, "number");
    assert.equal(typeof persisted.categoryScores.educationScore, "number");
    assert.equal(typeof persisted.categoryScores.salaryScore, "number");
    assert.equal(typeof persisted.categoryScores.freshnessScore, "number");

    // AI audit fields
    assert.ok(Array.isArray(persisted.strengths) && persisted.strengths.length > 0);
    assert.ok(Array.isArray(persisted.gaps));
    assert.ok(Array.isArray(persisted.risks));
    assert.ok(typeof persisted.explanation === "string" && persisted.explanation.length > 10);
    assert.ok(persisted.confidence >= 0 && persisted.confidence <= 1);
  });
});
