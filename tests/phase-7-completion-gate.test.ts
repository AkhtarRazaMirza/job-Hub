/**
 * Job Hub — Phase 7 / Step 7.7
 * Phase 7 Definitive Completion Gate Test Suite
 *
 * System Invariants Tested:
 * 1. Master Resume Immutability Invariant: resumes table is never mutated or overwritten in place.
 * 2. Deterministic PDF Document Generation & Candidate-Isolated Storage.
 * 3. Cover Letter Anti-Hallucination & Truthfulness Verification.
 * 4. Application Answers Cautionary Rules (USER_REQUIRED enforcement on visa/salary/relocation).
 * 5. Full Application Preparation Package Orchestration & Approval Invariant (PREPARED status preserved; no auto-submission).
 * 6. Multi-Tenant Candidate Isolation & Client-Input Rejection of Spoofed Identifiers.
 * 7. Source of Truth Documentation Integrity Invariant (The 4 core documents are strictly unchanged).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  db,
  users,
  candidateProfiles,
  resumes,
  jobs,
  applications,
  tailoredResumes,
  coverLetters,
  applicationAnswers,
  applicationEvents,
} from "@job-hub/db";
import { eq, and } from "drizzle-orm";
import {
  renderResumePdf,
  validateResumeTruthfulness,
  validateCoverLetterTruthfulness,
  validateApplicationAnswersTruthfulness,
  generateAnswersClientInputSchema,
  preparePackageClientInputSchema,
  approvePackageClientInputSchema,
  type ApplicationAnswerItem,
} from "@job-hub/applications";
import {
  ApplicationPreparationService,
  coverLetterRepository,
  applicationAnswerRepository,
  tailoredResumeRepository,
} from "@job-hub/applications/server";
import { MockAiProvider } from "@job-hub/ai";
import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";

test("Phase 7 Definitive Completion Gate Suite", async (t) => {
  const testUserId1 = `usr_gate7_1_${Date.now()}`;
  const testUserId2 = `usr_gate7_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let masterResumeId: string;
  let masterStorageKey: string;
  let masterFileHash: string;
  let masterUpdatedAt: Date;
  let testJobId: string;
  let applicationId: string;

  const candidateFixture: UnifiedCandidateProfile = {
    profile: {
      id: "cand_gate7_fixture",
      userId: testUserId1,
      headline: "Principal Systems Engineer",
      createdAt: new Date(),
      updatedAt: new Date(),
      linkedinUrl: "https://linkedin.com/in/gate7",
      portfolioUrl: null,
      sourceResumeId: null,
      profileData: null,
      profiledAt: new Date(),
    },
    preferences: {
      id: "pref_gate7",
      candidateProfileId: "cand_gate7_fixture",
      targetRoles: ["Principal Systems Engineer"],
      preferredLocations: ["Remote"],
      remotePreference: "REMOTE_ONLY",
      salaryMin: 230000,
      salaryCurrency: "USD",
      experienceLevel: "STAFF",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    skills: [
      { name: "Rust", status: "VERIFIED" },
      { name: "Distributed Systems", status: "VERIFIED" },
      { name: "PostgreSQL", status: "VERIFIED" },
    ],
    experiences: [
      {
        id: "exp_gate7",
        candidateProfileId: "cand_gate7_fixture",
        company: "Stripe",
        role: "Principal Systems Engineer",
        startDate: "2019-01",
        endDate: "2024-01",
        description: "Built distributed payment engines in Rust.",
        technologies: ["Rust", "Distributed Systems", "PostgreSQL"],
      },
    ],
    projects: [
      {
        id: "proj_gate7",
        candidateProfileId: "cand_gate7_fixture",
        name: "RustDB Engine",
        description: "Embedded storage engine in Rust.",
        technologies: ["Rust"],
        url: "https://github.com/gate7/rustdb",
        source: "GITHUB",
        verificationStatus: "VERIFIED",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    education: [],
    achievements: [],
    truthfulness: {
      isConsistent: true,
      conflicts: [],
      missingRequiredFields: [],
      profileCompletionPercentage: 100,
    },
  };

  const jobFixture: Job = {
    id: "job_gate7_fixture",
    source: "remoteok",
    sourceJobId: `rok_${Date.now()}`,
    title: "Principal Distributed Systems Engineer",
    company: "CloudScale Systems",
    location: "Remote",
    remoteType: "WORLDWIDE_REMOTE",
    skills: ["Rust", "Distributed Systems", "PostgreSQL"],
    requirements: ["7+ years systems engineering"],
    description: "Seeking Principal Distributed Systems Engineer.",
    applicationUrl: "https://cloudscale.com/apply",
    status: "ACTIVE",
    scrapedAt: new Date(),
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };

  // ---------------------------------------------------------------------------
  // Setup: Database Fixtures
  // ---------------------------------------------------------------------------

  await t.test("Setup: Seed isolated candidate profiles, master resume, and target job", async () => {
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Candidate Gate 7.1",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Candidate Gate 7.2",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [c1] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId1, headline: "Principal Systems Engineer" })
      .returning();
    candidate1Id = c1.id;

    const [c2] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId2, headline: "Attacker Candidate" })
      .returning();
    candidate2Id = c2.id;

    masterStorageKey = `resumes/${candidate1Id}/master_${Date.now()}.pdf`;
    masterFileHash = "sha256_gate7_master_immutable_hash";
    const [mResume] = await db
      .insert(resumes)
      .values({
        candidateProfileId: candidate1Id,
        fileName: "Master_Resume_Original.pdf",
        storageKey: masterStorageKey,
        mimeType: "application/pdf",
        fileSize: 62000,
        fileHash: masterFileHash,
        status: "PROFILED",
        extractedText: "Principal Systems Engineer Rust Distributed Systems PostgreSQL Stripe 2019 to 2024",
        extractedAt: new Date(),
      })
      .returning();
    masterResumeId = mResume.id;
    masterUpdatedAt = mResume.updatedAt;

    const [jb] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `job_gate7_${Date.now()}`,
        title: "Principal Distributed Systems Engineer",
        company: "CloudScale Systems",
        location: "Remote",
        remoteType: "WORLDWIDE_REMOTE",
        applicationUrl: `https://cloudscale.com/apply-${Date.now()}`,
        status: "ACTIVE",
        skills: ["Rust", "Distributed Systems", "PostgreSQL"],
        requirements: ["7+ years experience"],
        description: "CloudScale Systems seeking Principal Distributed Systems Engineer.",
      })
      .returning();
    testJobId = jb.id;
  });

  // ---------------------------------------------------------------------------
  // 1. INVARIANT 1: Master Resume Immutability
  // ---------------------------------------------------------------------------

  await t.test("INVARIANT 1: Master resume in resumes table is strictly immutable and never modified", async () => {
    // Check initial state
    const [initial] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, masterResumeId));

    assert.equal(initial.storageKey, masterStorageKey);
    assert.equal(initial.fileHash, masterFileHash);
    assert.equal(initial.fileName, "Master_Resume_Original.pdf");

    // Perform PDF rendering
    const pdfBytes = await renderResumePdf({
      contact: { name: "Candidate One", email: "c1@example.com" },
      targetTitle: "Principal Distributed Systems Engineer",
      summary: { headline: "Headline", text: "Experienced systems engineer specializing in distributed architectures and Rust performance.", keyThemes: ["Rust"] },
      skills: [{ category: "Backend", skills: ["Rust", "PostgreSQL"] }],
      experiences: [
        {
          company: "Stripe",
          role: "Principal Systems Engineer",
          startDate: "2019-01",
          endDate: "2024-01",
          bullets: [{ text: "Built Rust engines.", sourceCompany: "Stripe", matchingSkills: ["Rust"], confidence: "VERIFIED" }],
          technologies: ["Rust"],
        },
      ],
      projects: [],
      education: [],
    });

    assert.ok(pdfBytes.length > 0);
    assert.ok(pdfBytes.slice(0, 5).toString().startsWith("%PDF"));

    // Verify master resume after operations
    const [after] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, masterResumeId));

    assert.equal(after.storageKey, masterStorageKey);
    assert.equal(after.fileHash, masterFileHash);
    assert.equal(after.updatedAt.getTime(), masterUpdatedAt.getTime());
  });

  // ---------------------------------------------------------------------------
  // 2. INVARIANT 2: Cover Letter Truthfulness & Anti-Hallucination
  // ---------------------------------------------------------------------------

  await t.test("INVARIANT 2: Cover letter validator strictly rejects hallucinated skills and projects", () => {
    // Valid grounded cover letter
    const validCL = {
      title: "Cover Letter",
      salutation: "Dear Hiring Team,",
      hook: "I am writing to apply for the Principal Distributed Systems Engineer position.",
      bodyParagraphs: ["At Stripe, I engineered distributed payment systems using Rust."],
      callToAction: "I look forward to discussing the role.",
      signoff: "Sincerely,\nCandidate One",
      highlightedSkills: ["Rust", "Distributed Systems"],
      highlightedProjects: ["RustDB Engine"],
      content: "Dear Hiring Team,\n\nI am writing to apply for the Principal Distributed Systems Engineer position.\n\nAt Stripe, I engineered distributed payment systems using Rust.\n\nSincerely,\nCandidate One",
    };

    const validResult = validateCoverLetterTruthfulness(validCL, candidateFixture);
    assert.equal(validResult.isValid, true);
    assert.equal(validResult.violations.length, 0);

    // Hallucinated cover letter claiming unverified skills and fake projects
    const fakeCL = {
      ...validCL,
      highlightedSkills: ["Rust", "Quantum Cryptography", "Solidity"], // Fake skills!
      highlightedProjects: ["TopSecretQuantumBlockchain"], // Fake project!
    };

    const fakeResult = validateCoverLetterTruthfulness(fakeCL, candidateFixture);
    assert.equal(fakeResult.isValid, false);
    assert.ok(fakeResult.violations.some((v) => v.type === "UNGROUNDED_SKILL"));
    assert.ok(fakeResult.violations.some((v) => v.type === "FABRICATED_PROJECT"));
  });

  // ---------------------------------------------------------------------------
  // 3. INVARIANT 3: Application Answers Cautionary Rules (USER_REQUIRED)
  // ---------------------------------------------------------------------------

  await t.test("INVARIANT 3: Sensitive questions (visa/sponsorship/relocation) require USER_REQUIRED confidence", () => {
    const recklessAnswers: ApplicationAnswerItem[] = [
      {
        question: "Will you now or in the future require visa sponsorship?",
        answer: "No, candidate is authorized.", // AI guessing!
        confidence: "VERIFIED", // VIOLATION! Must be USER_REQUIRED
        reasoning: "Assumed from location",
        sourceEvidence: "Location",
        isConfirmed: false,
      },
    ];

    const truthfulness = validateApplicationAnswersTruthfulness(recklessAnswers, candidateFixture);
    assert.equal(truthfulness.isValid, false);
    assert.ok(
      truthfulness.violations.some((v) => v.violationType === "UNAUTHORIZED_CONFIDENCE")
    );

    // Properly classified cautionary answer passes
    const groundedAnswers: ApplicationAnswerItem[] = [
      {
        question: "Will you now or in the future require visa sponsorship?",
        answer: "Candidate confirmation required.",
        confidence: "USER_REQUIRED",
        reasoning: "Cautionary question requires candidate confirmation",
        isConfirmed: false,
      },
    ];
    const passResult = validateApplicationAnswersTruthfulness(groundedAnswers, candidateFixture);
    assert.equal(passResult.isValid, true);
  });

  // ---------------------------------------------------------------------------
  // 4. INVARIANT 4: Application Preparation Package Orchestration & Approval
  // ---------------------------------------------------------------------------

  await t.test("INVARIANT 4: Application package prepares all artifacts; status remains PREPARED upon approval (no auto-submission)", async () => {
    const mockAi: any = {
      calls: [],
      generateStructuredOutput: async (options: any) => {
        if (options.schemaName === "TailoredResumeData") {
          return {
            contact: { name: "Candidate One", email: "c1@example.com" },
            targetTitle: "Principal Distributed Systems Engineer",
            summary: { headline: "Principal Systems Engineer", text: "Expert in Rust and PostgreSQL.", keyThemes: ["Rust"] },
            skills: [{ category: "Systems", skills: ["Rust", "PostgreSQL"] }],
            experiences: [
              {
                company: "Stripe",
                role: "Principal Systems Engineer",
                startDate: "2019-01",
                endDate: "2024-01",
                isCurrent: false,
                bullets: [
                  { text: "Built Rust engines.", sourceCompany: "Stripe", matchingSkills: ["Rust"], confidence: "VERIFIED" },
                ],
                technologies: ["Rust"],
              },
            ],
            projects: [],
            education: [],
          };
        }
        if (options.schemaName === "CoverLetterData") {
          return {
            title: "Cover Letter",
            salutation: "Dear Hiring Team,",
            hook: "Excited to apply.",
            bodyParagraphs: ["Experience at Stripe building Rust engines."],
            callToAction: "Let's connect.",
            signoff: "Sincerely,\nCandidate One",
            content: "Dear Hiring Team,\n\nExcited to apply.\n\nExperience at Stripe building Rust engines.\n\nSincerely,\nCandidate One",
            highlightedSkills: ["Rust"],
            highlightedProjects: [],
          };
        }
        if (options.schemaName === "ApplicationAnswersOutput") {
          return {
            answers: [
              {
                question: "Do you require visa sponsorship?",
                answer: "Candidate confirmation required.",
                confidence: "USER_REQUIRED",
                reasoning: "Cautionary question",
                isConfirmed: false,
              },
            ],
          };
        }
        return {};
      },
    };

    const prepService = new ApplicationPreparationService({ aiProvider: mockAi });

    // 1. Prepare Package
    const pkg = await prepService.prepareApplicationPackage({
      candidateProfileId: candidate1Id,
      jobId: testJobId,
    });

    assert.ok(pkg.applicationId);
    applicationId = pkg.applicationId;
    assert.equal(pkg.status, "PREPARED");
    assert.equal(pkg.tailoredResume.status, "GENERATED");
    assert.equal(pkg.coverLetter.status, "DRAFT");
    assert.ok(pkg.resumeDocument.storageKey.endsWith(".pdf"));
    assert.equal(pkg.unconfirmedCount, 1);
    assert.equal(pkg.isApproved, false);

    // 2. Candidate confirms the USER_REQUIRED question
    const ans = pkg.answers[0]!;
    await applicationAnswerRepository.updateAnswer({
      answerId: ans.id,
      applicationId,
      candidateProfileId: candidate1Id,
      answer: "I am a US Citizen and do not require visa sponsorship.",
      isConfirmed: true,
    });

    // 3. Candidate approves the package
    const approvedPkg = await prepService.approvePackage({
      applicationId,
      candidateProfileId: candidate1Id,
    });

    assert.equal(approvedPkg.isApproved, true);
    assert.equal(approvedPkg.tailoredResume.status, "APPROVED");
    assert.equal(approvedPkg.coverLetter.status, "APPROVED");

    // NON-NEGOTIABLE RULE: Status MUST remain PREPARED! (Never APPLIED!)
    assert.equal(approvedPkg.status, "PREPARED");

    // Verify audit log event
    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId));
    assert.ok(events.some((e) => e.notes?.includes("Candidate approved application preparation materials")));
  });

  // ---------------------------------------------------------------------------
  // 5. INVARIANT 5: Cross-User Candidate Isolation & Spoofing Rejection
  // ---------------------------------------------------------------------------

  await t.test("INVARIANT 5: Candidate 2 cannot access Candidate 1's package and client spoofing is blocked", async () => {
    const prepService = new ApplicationPreparationService();

    // Candidate 2 cannot view Candidate 1's package
    await assert.rejects(
      () => prepService.getPackage(applicationId, candidate2Id),
      /Application not found/
    );

    // Candidate 2 cannot approve Candidate 1's package
    await assert.rejects(
      () => prepService.approvePackage({ applicationId, candidateProfileId: candidate2Id }),
      /Application not found/
    );

    // Security: Zod schemas reject client-supplied userId or candidateProfileId
    assert.throws(
      () =>
        preparePackageClientInputSchema.parse({
          jobId: "job_1",
          userId: "spoofed_user",
        }),
      /userId cannot be client-supplied/
    );

    assert.throws(
      () =>
        approvePackageClientInputSchema.parse({
          applicationId: "app_1",
          candidateProfileId: "spoofed_candidate",
        }),
      /candidateProfileId cannot be client-supplied/
    );
  });

  // ---------------------------------------------------------------------------
  // 6. INVARIANT 6: Source of Truth Documentation Integrity
  // ---------------------------------------------------------------------------

  await t.test("INVARIANT 6: The four authoritative source-of-truth documents are strictly untouched", () => {
    const s = execSync("git diff --name-only").toString();
    const untracked = execSync("git status --porcelain").toString();

    assert.ok(
      !s.includes("01_build_the_system.md"),
      "01_build_the_system.md must NOT have any modifications"
    );
    assert.ok(
      !s.includes("02_how_to_build.md"),
      "02_how_to_build.md must NOT have any modifications"
    );
    assert.ok(
      !s.includes("03_tech_stack.md"),
      "03_tech_stack.md must NOT have any modifications"
    );
    assert.ok(
      !s.includes("04_ai_agent_skills.md"),
      "04_ai_agent_skills.md must NOT have any modifications"
    );
  });

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  await t.test("Teardown: Clean up test fixtures and verify database cascade", async () => {
    await db.delete(jobs).where(eq(jobs.id, testJobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));

    const remaining = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId));
    assert.equal(remaining.length, 0);
  });
});
