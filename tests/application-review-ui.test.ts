/**
 * Job Hub — Phase 7 / Step 7.6
 * Review UI & User Approval Workflow Component Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 & 10 ("AI application preparation & Review UI")
 * - 02_how_to_build.md §11 & §12 ("User review & approval workflow")
 * - 04_ai_agent_skills.md §21 & §23 ("Confidence levels & human-in-the-loop approval")
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  db,
  users,
  candidateProfiles,
  resumes,
  jobs,
  applications,
  coverLetters,
  tailoredResumes,
  applicationAnswers,
} from "@job-hub/db";
import { eq } from "drizzle-orm";
import {
  applicationPreparationService,
  coverLetterRepository,
  applicationAnswerRepository,
} from "@job-hub/applications/server";

test("Phase 7 / Step 7.6 — Review UI & User Approval Workflow Suite", async (t) => {
  const componentPath = path.resolve(
    process.cwd(),
    "apps/web/components/applications/preparation-package-review.tsx"
  );

  await t.test("1. UI Component Integrity: Component file exists and exports PreparationPackageReview", () => {
    assert.ok(fs.existsSync(componentPath), "Component file must exist");
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("export function PreparationPackageReview"),
      "Must export PreparationPackageReview component"
    );
  });

  await t.test("2. Accessibility Gate: Includes standard dialog and tablist a11y semantics", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(source.includes('role="dialog"'), "Must include role=dialog");
    assert.ok(source.includes('aria-labelledby="prep-review-title"'), "Must link title via aria-labelledby");
    assert.ok(source.includes('role="tablist"'), "Must include role=tablist");
    assert.ok(source.includes('role="tab"'), "Must include role=tab buttons");
    assert.ok(source.includes('aria-selected='), "Must manage aria-selected state");
    assert.ok(source.includes('aria-label="Close dialog"'), "Must have accessible close button");
  });

  await t.test("3. Submission Boundary Rule: Displays clear cautionary boundary banner distinguishing PREPARED from APPLIED", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("No applications are automatically submitted"),
      "Must explicitly warn user that applications are not automatically submitted"
    );
    assert.ok(
      source.includes("PREPARED"),
      "Must display PREPARED badge"
    );
    assert.ok(
      source.includes("Preparation Workspace:"),
      "Must label workspace as preparation only"
    );
  });

  await t.test("4. Truthfulness & Confidence Classification: Displays badges for VERIFIED, INFERRED, and USER_REQUIRED", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(source.includes("VERIFIED"), "Must support VERIFIED badge");
    assert.ok(source.includes("INFERRED"), "Must support INFERRED badge");
    assert.ok(source.includes("USER_REQUIRED"), "Must support USER_REQUIRED badge");
    assert.ok(
      source.includes("unconfirmedCount"),
      "Must highlight and track unconfirmed USER_REQUIRED questions"
    );
    assert.ok(
      source.includes("Attention Required:"),
      "Must show attention banner when unconfirmed questions exist"
    );
  });

  await t.test("5. Human-In-The-Loop Approval & Editing: Allows candidate editing of cover letter and answers", () => {
    const source = fs.readFileSync(componentPath, "utf-8");
    assert.ok(
      source.includes("handleSaveCoverLetter"),
      "Must allow editing and saving cover letter"
    );
    assert.ok(
      source.includes("handleSaveAnswer"),
      "Must allow editing, overriding, and confirming answers"
    );
    assert.ok(
      source.includes("handleApprove"),
      "Must provide explicit candidate package approval control"
    );
    assert.ok(
      source.includes("Package Approved by Candidate"),
      "Must render persistent approved state indicator"
    );
  });

  // ---------------------------------------------------------------------------
  // End-to-End Approval Workflow State Transition Verification
  // ---------------------------------------------------------------------------

  const testUserId = `usr_p76_test_${Date.now()}`;
  let candidateId: string;
  let testJobId: string;
  let testAppId: string;
  let testClId: string;
  let testAnsId: string;

  await t.test("Setup: Create database entities for approval workflow", async () => {
    await db.insert(users).values({
      id: testUserId,
      name: "Review UI Candidate",
      email: `${testUserId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [cand] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId, headline: "Senior Engineer" })
      .returning();
    candidateId = cand.id;

    const [jb] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `job_source_${Date.now()}`,
        title: "Senior Full Stack Engineer",
        company: "Acme Cloud",
        location: "Remote",
        remoteType: "WORLDWIDE_REMOTE",
        applicationUrl: `https://acmecloud.com/apply-${Date.now()}`,
        status: "ACTIVE",
        skills: ["TypeScript", "React"],
        requirements: ["4+ years experience"],
        description: "Staff role.",
      })
      .returning();
    testJobId = jb.id;

    const [app] = await db
      .insert(applications)
      .values({
        candidateProfileId: candidateId,
        jobId: testJobId,
        company: "Acme Cloud",
        role: "Senior Full Stack Engineer",
        source: "remoteok",
        status: "PREPARED",
      })
      .returning();
    testAppId = app.id;

    const [cl] = await db
      .insert(coverLetters)
      .values({
        candidateProfileId: candidateId,
        jobId: testJobId,
        title: "Cover Letter",
        salutation: "Dear Hiring Team,",
        hook: "I am interested in this role.",
        bodyParagraphs: ["Experience at Acme"],
        callToAction: "Let's connect.",
        signoff: "Best regards",
        content: "Dear Hiring Team,\n\nI am interested in this role.",
        status: "DRAFT",
        version: 1,
      })
      .returning();
    testClId = cl.id;

    const [ans] = await db
      .insert(applicationAnswers)
      .values({
        applicationId: testAppId,
        question: "Do you require visa sponsorship?",
        answer: "Candidate confirmation required.",
        confidence: "USER_REQUIRED",
        isConfirmed: false,
      })
      .returning();
    testAnsId = ans.id;

    const [mResume] = await db
      .insert(resumes)
      .values({
        candidateProfileId: candidateId,
        fileName: "Master_Resume.pdf",
        storageKey: `resumes/${candidateId}/master.pdf`,
        mimeType: "application/pdf",
        fileSize: 45000,
        fileHash: "hash_76_master",
        status: "PROFILED",
      })
      .returning();

    await db
      .insert(tailoredResumes)
      .values({
        candidateProfileId: candidateId,
        jobId: testJobId,
        sourceResumeId: mResume.id,
        targetTitle: "Senior Full Stack Engineer",
        tailoredData: {
          contact: { name: "Test", email: "test@example.com" },
          targetTitle: "Senior Full Stack Engineer",
          summary: { headline: "Summary", text: "Text", keyThemes: [] },
          skills: [],
          experiences: [],
          projects: [],
          education: [],
        },
        truthfulnessScore: 100,
        status: "DRAFT",
        version: 1,
      });
  });

  await t.test("6. Interactive Workflow: Candidate edits cover letter, confirms USER_REQUIRED answer, and approves package", async () => {
    // 1. Candidate edits cover letter text
    const updatedCl = await coverLetterRepository.update({
      id: testClId,
      candidateProfileId: candidateId,
      content: "Polished candidate custom cover letter for Acme Cloud.",
    });
    assert.equal(updatedCl.content, "Polished candidate custom cover letter for Acme Cloud.");

    // 2. Candidate confirms USER_REQUIRED answer
    const updatedAns = await applicationAnswerRepository.updateAnswer({
      answerId: testAnsId,
      applicationId: testAppId,
      candidateProfileId: candidateId,
      answer: "I am authorized to work in the US without sponsorship.",
      isConfirmed: true,
    });
    assert.equal(updatedAns.isConfirmed, true);

    // 3. Candidate approves the package
    const approvedPkg = await applicationPreparationService.approvePackage({
      applicationId: testAppId,
      candidateProfileId: candidateId,
    });
    assert.equal(approvedPkg.isApproved, true);
    assert.equal(approvedPkg.coverLetter.status, "APPROVED");
    assert.equal(approvedPkg.tailoredResume.status, "APPROVED");
    // Invariant: Status stays PREPARED! (Never APPLIED!)
    assert.equal(approvedPkg.status, "PREPARED");
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(jobs).where(eq(jobs.id, testJobId));
    await db.delete(users).where(eq(users.id, testUserId));
  });
});
