/**
 * Job Hub — Phase 7 / Step 7.4
 * Application Answers Domain, Truthfulness Engine, and AI Answerer Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Generate application answers with explicit confidence")
 * - 02_how_to_build.md §12 ("Generate: application answers")
 * - 04_ai_agent_skills.md §13 ("Application Question Answering Skill") & §21 ("ApplicationAnswerer")
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationAnswerItemSchema,
  generateAnswersOutputSchema,
  generateAnswersClientInputSchema,
  updateAnswerClientInputSchema,
  validateApplicationAnswersTruthfulness,
  ApplicationAnswerTruthfulnessViolationError,
  type ApplicationAnswerItem,
} from "@job-hub/applications";
import {
  ApplicationAnswerer,
  applicationAnswerRepository,
} from "@job-hub/applications/server";
import { MockAiProvider } from "@job-hub/ai";
import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  applications,
  applicationAnswers,
} from "@job-hub/db";
import { eq } from "drizzle-orm";

test("Phase 7 / Step 7.4 — Application Answers Domain, Truthfulness & Answerer Suite", async (t) => {
  const candidateFixture: UnifiedCandidateProfile = {
    profile: {
      id: "cand_p74_fixture",
      userId: "usr_p74_fixture",
      headline: "Principal Systems Architect",
      createdAt: new Date(),
      updatedAt: new Date(),
      linkedinUrl: "https://linkedin.com/in/principal",
      portfolioUrl: null,
      sourceResumeId: null,
      profileData: null,
      profiledAt: new Date(),
    },
    preferences: {
      id: "pref_1",
      candidateProfileId: "cand_p74_fixture",
      targetRoles: ["Staff Backend Engineer"],
      preferredLocations: ["Remote", "San Francisco, CA"],
      remotePreference: "REMOTE_ONLY",
      salaryMin: 220000,
      salaryCurrency: "USD",
      experienceLevel: "SENIOR",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    skills: [
      { name: "TypeScript", status: "VERIFIED" },
      { name: "PostgreSQL", status: "VERIFIED" },
      { name: "Node.js", status: "VERIFIED" },
    ],
    experiences: [
      {
        id: "exp_1",
        candidateProfileId: "cand_p74_fixture",
        company: "Stripe",
        role: "Staff Engineer",
        startDate: "2020-01",
        endDate: "2024-01",
        description: "Built high-throughput financial pipelines.",
        technologies: ["TypeScript", "PostgreSQL"],
      },
    ],
    projects: [],
    education: [
      {
        id: "edu_1",
        candidateProfileId: "cand_p74_fixture",
        institution: "UC Berkeley",
        degree: "B.S.",
        fieldOfStudy: "EECS",
        graduationYear: 2019,
      },
    ],
    achievements: [],
    truthfulness: {
      isConsistent: true,
      conflicts: [],
      missingRequiredFields: [],
      profileCompletionPercentage: 95,
    },
  };

  const jobFixture: Job = {
    id: "job_p74_fixture",
    source: "remoteok",
    sourceJobId: "job_rok_74",
    title: "Staff Backend Engineer",
    company: "Monolith Labs",
    location: "Remote",
    remoteType: "WORLDWIDE_REMOTE",
    skills: ["TypeScript", "PostgreSQL"],
    requirements: ["4+ years experience"],
    description: "Looking for Staff Backend Engineer.",
    applicationUrl: "https://monolithlabs.com/apply",
    status: "ACTIVE",
    scrapedAt: new Date(),
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };

  const validGroundedAnswers: ApplicationAnswerItem[] = [
    {
      question: "What is your primary programming language and years of experience with it?",
      answer: "My primary programming language is TypeScript with 4 years of verified professional experience at Stripe.",
      confidence: "VERIFIED",
      reasoning: "Candidate experience at Stripe documents TypeScript engineering from 2020-01 to 2024-01.",
      sourceEvidence: "Experience at Stripe (2020-01 to 2024-01)",
      isConfirmed: false,
    },
    {
      question: "Are you open to remote work?",
      answer: "Yes, candidate preference is explicitly REMOTE_ONLY.",
      confidence: "VERIFIED",
      reasoning: "Candidate preferences indicate REMOTE_ONLY.",
      sourceEvidence: "Candidate preferences",
      isConfirmed: false,
    },
    {
      question: "Will you now or in the future require visa sponsorship to work in the United States?",
      answer: "Candidate confirmation required regarding visa sponsorship.",
      confidence: "USER_REQUIRED",
      reasoning: "Visa status is a cautionary question requiring explicit user confirmation.",
      isConfirmed: false,
    },
  ];

  // ---------------------------------------------------------------------------
  // 1. Schema Validation Gates
  // ---------------------------------------------------------------------------

  await t.test("1. Schema Gate: Validates compliant ApplicationAnswerItem entities", () => {
    const parsed = generateAnswersOutputSchema.parse({ answers: validGroundedAnswers });
    assert.equal(parsed.answers.length, 3);
    assert.equal(parsed.answers[0]!.confidence, "VERIFIED");
    assert.equal(parsed.answers[2]!.confidence, "USER_REQUIRED");
  });

  await t.test("2. Schema Gate: Rejects invalid confidence levels and empty fields", () => {
    const invalid = {
      question: "What is your experience?",
      answer: "Some answer",
      confidence: "CERTAIN", // Invalid enum
      reasoning: "Some reasoning",
    };
    assert.throws(() => applicationAnswerItemSchema.parse(invalid));
  });

  await t.test("3. Security Gate: Client input schemas reject client-injected userId & candidateProfileId", () => {
    assert.throws(
      () =>
        generateAnswersClientInputSchema.parse({
          jobId: "job_1",
          questions: ["Q1"],
          userId: "hacked_user_id",
        }),
      /userId cannot be client-supplied/
    );

    assert.throws(
      () =>
        updateAnswerClientInputSchema.parse({
          answerId: "ans_1",
          applicationId: "app_1",
          answer: "New answer",
          candidateProfileId: "hacked_cand_id",
        }),
      /candidateProfileId cannot be client-supplied/
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Truthfulness & Cautionary Rule Gates
  // ---------------------------------------------------------------------------

  await t.test("4. Truthfulness Gate: Properly classified answers pass", () => {
    const result = validateApplicationAnswersTruthfulness(
      validGroundedAnswers,
      candidateFixture
    );
    assert.equal(result.isValid, true);
    assert.equal(result.violations.length, 0);
  });

  await t.test("5. Truthfulness Gate: Rejects definitive answers on cautionary visa/sponsorship questions", () => {
    const recklessAnswers: ApplicationAnswerItem[] = [
      {
        question: "Do you require visa sponsorship?",
        answer: "No, candidate is authorized to work.", // AI guessing!
        confidence: "VERIFIED", // VIOLATION! Must be USER_REQUIRED
        reasoning: "Assumed from US location",
        sourceEvidence: "Location in US",
        isConfirmed: false,
      },
    ];

    const result = validateApplicationAnswersTruthfulness(
      recklessAnswers,
      candidateFixture
    );
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some((v) => v.violationType === "UNAUTHORIZED_CONFIDENCE"));
  });

  await t.test("6. Truthfulness Gate: Rejects VERIFIED claims lacking source evidence", () => {
    const missingEvidence: ApplicationAnswerItem[] = [
      {
        question: "What is your background?",
        answer: "I have extensive experience.",
        confidence: "VERIFIED",
        reasoning: "Looks verified",
        sourceEvidence: "", // Empty source evidence!
        isConfirmed: false,
      },
    ];

    const result = validateApplicationAnswersTruthfulness(
      missingEvidence,
      candidateFixture
    );
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some((v) => v.violationType === "MISSING_EVIDENCE"));
  });

  // ---------------------------------------------------------------------------
  // 3. AI ApplicationAnswerer Service Gate
  // ---------------------------------------------------------------------------

  await t.test("7. AI Answerer Gate: Generates answers with MockAiProvider", async () => {
    const mockAi = new MockAiProvider({ answers: validGroundedAnswers });
    const answerer = new ApplicationAnswerer({ aiProvider: mockAi });

    const result = await answerer.generateAnswers({
      candidate: candidateFixture,
      job: jobFixture,
      questions: ["Primary language", "Remote preference", "Visa sponsorship"],
    });

    assert.equal(result.truthfulness.isValid, true);
    assert.equal(result.answers.length, 3);
  });

  await t.test("8. AI Answerer Gate: Strict mode throws ApplicationAnswerTruthfulnessViolationError on hallucination", async () => {
    const badOutput: ApplicationAnswerItem[] = [
      {
        question: "Do you require visa sponsorship?",
        answer: "No sponsorship needed.",
        confidence: "VERIFIED",
        reasoning: "Guessed",
        sourceEvidence: "None",
        isConfirmed: false,
      },
    ];
    const mockAi = new MockAiProvider({ answers: badOutput });
    const answerer = new ApplicationAnswerer({ aiProvider: mockAi });

    await assert.rejects(
      () =>
        answerer.generateAnswers({
          candidate: candidateFixture,
          job: jobFixture,
          questions: ["Do you require visa sponsorship?"],
        }),
      ApplicationAnswerTruthfulnessViolationError
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Persistence, User Editing & Candidate Isolation
  // ---------------------------------------------------------------------------

  const testUserId1 = `usr_p74_test_1_${Date.now()}`;
  const testUserId2 = `usr_p74_test_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let dbJobId: string;
  let applicationId: string;
  let createdAnswerId: string;

  await t.test("Setup: Create database test entities", async () => {
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Jane Candidate 7.4",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Bob Candidate 7.4",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [c1] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId1, headline: "Staff Candidate 7.4" })
      .returning();
    candidate1Id = c1.id;

    const [c2] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId2, headline: "Bob Candidate 7.4" })
      .returning();
    candidate2Id = c2.id;

    const [jb] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `job_source_${Date.now()}`,
        title: "Staff Backend Engineer",
        company: "Monolith Labs",
        location: "Remote",
        remoteType: "WORLDWIDE_REMOTE",
        applicationUrl: `https://monolithlabs.com/apply-${Date.now()}`,
        status: "ACTIVE",
        skills: ["TypeScript", "PostgreSQL"],
        requirements: ["5+ years"],
        description: "Staff role.",
      })
      .returning();
    dbJobId = jb.id;

    const [app] = await db
      .insert(applications)
      .values({
        candidateProfileId: candidate1Id,
        jobId: dbJobId,
        company: "Monolith Labs",
        role: "Staff Backend Engineer",
        source: "remoteok",
        status: "PREPARED",
      })
      .returning();
    applicationId = app.id;
  });

  await t.test("9. Persistence: Saves answers to application_answers table", async () => {
    const saved = await applicationAnswerRepository.saveAnswers(
      applicationId,
      candidate1Id,
      validGroundedAnswers
    );

    assert.equal(saved.length, 3);
    assert.equal(saved[0]!.question, validGroundedAnswers[0]!.question);
    assert.equal(saved[2]!.confidence, "USER_REQUIRED");
    createdAnswerId = saved[2]!.id;

    const fetched = await applicationAnswerRepository.findByApplicationId(
      applicationId,
      candidate1Id
    );
    assert.equal(fetched.length, 3);
  });

  await t.test("10. Persistence: Candidate can update and confirm USER_REQUIRED answer (editable user requirement)", async () => {
    const updated = await applicationAnswerRepository.updateAnswer({
      answerId: createdAnswerId,
      applicationId,
      candidateProfileId: candidate1Id,
      answer: "I am a US citizen and do not require sponsorship.",
      isConfirmed: true,
    });

    assert.equal(updated.answer, "I am a US citizen and do not require sponsorship.");
    assert.equal(updated.isConfirmed, true);
  });

  await t.test("11. Security Gate: Candidate 2 cannot access or update Candidate 1's answers", async () => {
    await assert.rejects(
      () =>
        applicationAnswerRepository.findByApplicationId(
          applicationId,
          candidate2Id
        ),
      /Application not found/
    );

    await assert.rejects(
      () =>
        applicationAnswerRepository.updateAnswer({
          answerId: createdAnswerId,
          applicationId,
          candidateProfileId: candidate2Id,
          answer: "Malicious edit",
        }),
      /Application not found/
    );
  });

  // ---------------------------------------------------------------------------
  // 5. Teardown
  // ---------------------------------------------------------------------------

  await t.test("Teardown: Clean up test fixtures and verify cascade deletion", async () => {
    await db.delete(jobs).where(eq(jobs.id, dbJobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));

    const remainingAnswers = await db
      .select()
      .from(applicationAnswers)
      .where(eq(applicationAnswers.applicationId, applicationId));
    assert.equal(remainingAnswers.length, 0);
  });
});
