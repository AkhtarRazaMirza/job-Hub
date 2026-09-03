/**
 * Job Hub — Phase 7 / Step 7.5
 * Application Preparation Package Orchestrator & API Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("AI application preparation")
 * - 02_how_to_build.md §11 & §12 ("Generate: tailored resume, cover letter, application answers")
 * - 04_ai_agent_skills.md §21 ("Orchestrator pipeline")
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  ApplicationPreparationService,
  coverLetterRepository,
  applicationAnswerRepository,
} from "@job-hub/applications/server";
import { MockAiProvider } from "@job-hub/ai";
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

test("Phase 7 / Step 7.5 — Application Preparation Package Orchestrator Suite", async (t) => {
  const testUserId1 = `usr_p75_test_1_${Date.now()}`;
  const testUserId2 = `usr_p75_test_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let masterResumeId: string;
  let originalMasterKey: string;
  let originalMasterUpdatedAt: Date;
  let jobId: string;
  let applicationId: string;

  const mockTailoredResumeData = {
    contact: {
      name: "Alice Engineer",
      email: "alice@example.com",
      phone: "+1-555-0100",
      location: "San Francisco, CA",
    },
    targetTitle: "Staff Backend Engineer",
    summary: {
      headline: "Staff Backend Engineer specializing in resilient systems",
      text: "Expert in distributed architectures and PostgreSQL optimization with verified production records.",
      keyThemes: ["TypeScript", "PostgreSQL"],
    },
    skills: [
      {
        category: "Backend",
        skills: ["TypeScript", "PostgreSQL"],
      },
    ],
    experiences: [
      {
        company: "Stripe",
        role: "Staff Engineer",
        startDate: "2020-01",
        endDate: "2024-01",
        isCurrent: false,
        bullets: [
          {
            text: "Engineered scalable billing pipelines in TypeScript.",
            sourceCompany: "Stripe",
            matchingSkills: ["TypeScript", "PostgreSQL"],
            confidence: "VERIFIED",
          },
        ],
        technologies: ["TypeScript", "PostgreSQL"],
      },
    ],
    projects: [],
    education: [
      {
        institution: "UC Berkeley",
        degree: "B.S.",
        fieldOfStudy: "Computer Science",
        graduationYear: 2019,
      },
    ],
  };

  const mockCoverLetterData = {
    title: "Cover Letter for Staff Backend Engineer at Monolith Labs",
    salutation: "Dear Hiring Team at Monolith Labs,",
    hook: "I am excited to apply for the Staff Backend Engineer position at Monolith Labs.",
    bodyParagraphs: [
      "During my time at Stripe, I led the scaling of payment systems using TypeScript and PostgreSQL.",
    ],
    callToAction: "I look forward to discussing how my experience can support Monolith Labs.",
    signoff: "Sincerely,\nAlice Engineer",
    content: "Dear Hiring Team at Monolith Labs,\n\nI am excited to apply for the Staff Backend Engineer position at Monolith Labs.\n\nDuring my time at Stripe, I led the scaling of payment systems using TypeScript and PostgreSQL.\n\nSincerely,\nAlice Engineer",
    highlightedSkills: ["TypeScript", "PostgreSQL"],
    highlightedProjects: [],
  };

  const mockAnswersData = {
    answers: [
      {
        question: "What is your primary programming language?",
        answer: "TypeScript, verified at Stripe from 2020 to 2024.",
        confidence: "VERIFIED",
        reasoning: "Candidate employment history at Stripe.",
        sourceEvidence: "Stripe experience (2020-01 to 2024-01)",
        isConfirmed: false,
      },
      {
        question: "Will you require visa sponsorship?",
        answer: "Candidate confirmation required regarding visa status.",
        confidence: "USER_REQUIRED",
        reasoning: "Cautionary question requiring explicit candidate review.",
        isConfirmed: false,
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Setup: Database Fixtures
  // ---------------------------------------------------------------------------

  await t.test("Setup: Create database test fixtures", async () => {
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Alice Candidate 7.5",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Bob Candidate 7.5",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [c1] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId1, headline: "Staff Backend Engineer" })
      .returning();
    candidate1Id = c1.id;

    const [c2] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId2, headline: "Bob Candidate" })
      .returning();
    candidate2Id = c2.id;

    originalMasterKey = `resumes/${candidate1Id}/master_${Date.now()}.pdf`;
    const [mResume] = await db
      .insert(resumes)
      .values({
        candidateProfileId: candidate1Id,
        fileName: "Master_Resume.pdf",
        storageKey: originalMasterKey,
        mimeType: "application/pdf",
        fileSize: 55000,
        fileHash: "sha256_hash_75_master",
        status: "PROFILED",
        extractedText: "Alice Engineer Stripe Staff Engineer TypeScript PostgreSQL 2020-01 to 2024-01 UC Berkeley",
        extractedAt: new Date(),
      })
      .returning();
    masterResumeId = mResume.id;
    originalMasterUpdatedAt = mResume.updatedAt;

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
        requirements: ["4+ years distributed systems experience"],
        description: "Staff Backend Engineer at Monolith Labs.",
      })
      .returning();
    jobId = jb.id;
  });

  // ---------------------------------------------------------------------------
  // 1. Package Orchestration & Assembly
  // ---------------------------------------------------------------------------

  let prepService: ApplicationPreparationService;

  await t.test("1. Orchestration Gate: Prepares complete application package with all artifacts", async () => {
    // Multi-response mock provider for sequential AI calls (Resume Tailor -> Cover Letter -> Answers)
    let callCount = 0;
    const mockAi: any = {
      calls: [],
      generateStructuredOutput: async (options: any) => {
        mockAi.calls.push(options);
        callCount++;
        if (options.schemaName === "TailoredResumeData") {
          return mockTailoredResumeData;
        }
        if (options.schemaName === "CoverLetterData") {
          return mockCoverLetterData;
        }
        if (options.schemaName === "ApplicationAnswersOutput") {
          return mockAnswersData;
        }
        return {};
      },
    };

    prepService = new ApplicationPreparationService({ aiProvider: mockAi });

    const pkg = await prepService.prepareApplicationPackage({
      candidateProfileId: candidate1Id,
      jobId,
    });

    assert.ok(pkg.applicationId);
    applicationId = pkg.applicationId;
    assert.equal(pkg.status, "PREPARED");
    assert.equal(pkg.job.title, "Staff Backend Engineer");
    assert.equal(pkg.job.company, "Monolith Labs");

    // Tailored resume
    assert.ok(pkg.tailoredResume);
    assert.equal(pkg.tailoredResume.targetTitle, "Staff Backend Engineer");

    // Document
    assert.ok(pkg.resumeDocument.storageKey.endsWith(".pdf"));
    assert.equal(pkg.resumeDocument.mimeType, "application/pdf");

    // Cover Letter
    assert.ok(pkg.coverLetter);
    assert.equal(pkg.coverLetter.status, "DRAFT");
    assert.equal(pkg.coverLetter.version, 1);

    // Answers
    assert.equal(pkg.answers.length, 2);
    assert.equal(pkg.hasUserRequiredFields, true);
    assert.equal(pkg.unconfirmedCount, 1);
    assert.equal(pkg.isApproved, false);
  });

  // ---------------------------------------------------------------------------
  // 2. Idempotency Gate
  // ---------------------------------------------------------------------------

  await t.test("2. Idempotency Gate: Re-running preparation returns existing package without duplicate records", async () => {
    const pkgSecondRun = await prepService.prepareApplicationPackage({
      candidateProfileId: candidate1Id,
      jobId,
    });

    assert.equal(pkgSecondRun.applicationId, applicationId);
    assert.equal(pkgSecondRun.coverLetter.version, 1);

    // Verify database row counts remain 1
    const apps = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.candidateProfileId, candidate1Id),
          eq(applications.jobId, jobId)
        )
      );
    assert.equal(apps.length, 1);

    const tailoreds = await db
      .select()
      .from(tailoredResumes)
      .where(
        and(
          eq(tailoredResumes.candidateProfileId, candidate1Id),
          eq(tailoredResumes.jobId, jobId)
        )
      );
    assert.equal(tailoreds.length, 1);
  });

  // ---------------------------------------------------------------------------
  // 3. User Review, Editing & Explicit Approval Gate
  // ---------------------------------------------------------------------------

  await t.test("3. Review Gate: Candidate can update cover letter and confirm USER_REQUIRED answer", async () => {
    const pkg = await prepService.getPackage(applicationId, candidate1Id);

    // Candidate edits cover letter
    const updatedCl = await coverLetterRepository.update({
      id: pkg.coverLetter.id,
      candidateProfileId: candidate1Id,
      content: "Polished custom cover letter text by user.",
    });
    assert.equal(updatedCl.content, "Polished custom cover letter text by user.");

    // Candidate confirms USER_REQUIRED visa question
    const visaAnswer = pkg.answers.find((a) => a.confidence === "USER_REQUIRED")!;
    await applicationAnswerRepository.updateAnswer({
      answerId: visaAnswer.id,
      applicationId,
      candidateProfileId: candidate1Id,
      answer: "I am a US Citizen and do not require visa sponsorship.",
      isConfirmed: true,
    });

    const refreshedPkg = await prepService.getPackage(applicationId, candidate1Id);
    assert.equal(refreshedPkg.unconfirmedCount, 0);
    assert.equal(refreshedPkg.hasUserRequiredFields, false);
  });

  await t.test("4. Approval Gate: Candidate approves package; application status remains PREPARED (NOT APPLIED)", async () => {
    const approvedPkg = await prepService.approvePackage({
      applicationId,
      candidateProfileId: candidate1Id,
    });

    assert.equal(approvedPkg.isApproved, true);
    assert.equal(approvedPkg.tailoredResume.status, "APPROVED");
    assert.equal(approvedPkg.coverLetter.status, "APPROVED");

    // NON-NEGOTIABLE RULE: Preparation is NOT submission!
    assert.equal(approvedPkg.status, "PREPARED", "Application status MUST remain PREPARED and not simulate submission");

    // Verify audit event recorded
    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId));
    assert.ok(events.length > 0);
    assert.ok(events.some((e) => e.notes?.includes("Candidate approved application preparation materials")));
  });

  // ---------------------------------------------------------------------------
  // 4. Candidate Ownership Isolation Gate
  // ---------------------------------------------------------------------------

  await t.test("5. Security Gate: Candidate 2 cannot view or approve Candidate 1's package", async () => {
    await assert.rejects(
      () => prepService.getPackage(applicationId, candidate2Id),
      /Application not found/
    );

    await assert.rejects(
      () =>
        prepService.approvePackage({
          applicationId,
          candidateProfileId: candidate2Id,
        }),
      /Application not found/
    );
  });

  // ---------------------------------------------------------------------------
  // 5. Master Resume Immutability Gate
  // ---------------------------------------------------------------------------

  await t.test("6. IMMUTABILITY RULE GATE: Master resume is strictly untouched by orchestration", async () => {
    const [currMaster] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, masterResumeId));

    assert.ok(currMaster);
    assert.equal(currMaster.storageKey, originalMasterKey);
    assert.equal(currMaster.fileHash, "sha256_hash_75_master");
    assert.equal(currMaster.fileName, "Master_Resume.pdf");
    assert.equal(
      currMaster.updatedAt.getTime(),
      originalMasterUpdatedAt.getTime(),
      "Master resume updatedAt must NOT be altered"
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Teardown
  // ---------------------------------------------------------------------------

  await t.test("Teardown: Clean up test fixtures and verify cascade deletion", async () => {
    await db.delete(jobs).where(eq(jobs.id, jobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));

    const remainingApps = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId));
    assert.equal(remainingApps.length, 0);
  });
});
