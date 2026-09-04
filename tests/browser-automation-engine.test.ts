/**
 * Job Hub — Phase 8 / Step 8.4
 * Controlled Browser Engine & Orchestrator Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  applications,
  browserExecutions,
} from "@job-hub/db";
import { eq } from "drizzle-orm";
import {
  SimulatedBrowserDriver,
  BrowserSafetyHaltError,
  BrowserExecutionForbiddenError,
  type InspectedInputField,
  type CandidateFormContext,
} from "@job-hub/applications";
import {
  ControlledBrowserService,
  BrowserExecutionRepository,
} from "@job-hub/applications/server";

test("Phase 8 / Step 8.4 — Controlled Browser Engine & Orchestrator Suite", async (t) => {
  const testUserId1 = `usr_p84_1_${Date.now()}`;
  const testUserId2 = `usr_p84_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let jobId: string;
  let applicationId: string;

  const repository = new BrowserExecutionRepository();
  const service = new ControlledBrowserService(repository);

  await t.test("Setup: Create candidate profiles, job, and application", async () => {
    await db.insert(users).values([
      { id: testUserId1, name: "Jordan Staff", email: `${testUserId1}@example.com` },
      { id: testUserId2, name: "Morgan Other", email: `${testUserId2}@example.com` },
    ]);

    const [c1] = await db.insert(candidateProfiles).values({
      userId: testUserId1,
      headline: "Staff Cloud Engineer",
      skills: ["TypeScript", "Go", "Kubernetes"],
    }).returning();
    candidate1Id = c1!.id;

    const [c2] = await db.insert(candidateProfiles).values({
      userId: testUserId2,
      headline: "Frontend Engineer",
    }).returning();
    candidate2Id = c2!.id;

    const [j] = await db.insert(jobs).values({
      title: "Senior Cloud Architect",
      company: "CloudTech",
      location: "Remote",
      source: "remoteok",
      applicationUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
    }).returning();
    jobId = j!.id;

    const [app] = await db.insert(applications).values({
      candidateProfileId: candidate1Id,
      jobId,
      company: "CloudTech",
      role: "Senior Cloud Architect",
      source: "remoteok",
      applicationUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
      status: "PREPARED",
    }).returning();
    applicationId = app!.id;
  });

  const baseCandidateContext: CandidateFormContext = {
    profile: {
      name: "Jordan Staff",
      firstName: "Jordan",
      lastName: "Staff",
      email: "jordan.staff@example.com",
      phone: "+1-415-555-0100",
      location: "San Francisco, CA",
      linkedinUrl: "https://linkedin.com/in/jordanstaff",
      githubUrl: "https://github.com/jordanstaff",
    },
    preparationPackage: {
      applicationId,
      candidateProfileId: "will_be_set",
      jobId: "will_be_set",
      job: {
        id: "job_1",
        title: "Senior Cloud Architect",
        company: "CloudTech",
        location: "Remote",
        remoteType: "WORLDWIDE_REMOTE",
        skills: ["TypeScript", "Go"],
      },
      tailoredResume: {
        id: "tailored_res_123",
        candidateProfileId: "cand_1",
        jobId: "job_1",
        version: 1,
        targetRole: "Senior Cloud Architect",
        targetCompany: "CloudTech",
        summary: "Cloud Architect with 8+ years experience",
        skills: ["TypeScript", "Go"],
        experiences: [],
        projects: [],
        education: [],
        status: "APPROVED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      resumeDocument: {
        storageKey: "resumes/cand_1/tailored_res_123.pdf",
        mimeType: "application/pdf",
      },
      coverLetter: {
        id: "cl_123",
        candidateProfileId: "cand_1",
        jobId: "job_1",
        version: 1,
        targetCompany: "CloudTech",
        targetRole: "Senior Cloud Architect",
        content: "Dear CloudTech Team, I am eager to contribute...",
        status: "APPROVED",
        isApproved: true,
        userNotes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      answers: [],
      status: "PREPARED",
      hasUserRequiredFields: false,
      unconfirmedCount: 0,
      isApproved: true,
    },
  };

  await t.test("1. Clean Assisted Flow: Navigates, inspects, maps, fills safe fields, and uploads resume", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
    });

    const standardInputs: InspectedInputField[] = [
      { selector: "input[name='first_name']", name: "first_name", label: "First Name", type: "text" },
      { selector: "input[name='last_name']", name: "last_name", label: "Last Name", type: "text" },
      { selector: "input[name='email']", name: "email", label: "Email", type: "text" },
      { selector: "input[name='phone']", name: "phone", label: "Phone", type: "text" },
      { selector: "input[name='resume']", name: "resume", label: "Attach Resume/CV", type: "file" },
      { selector: "textarea[name='cover_letter']", name: "cover_letter", label: "Cover Letter", type: "textarea" },
    ];

    const driver = new SimulatedBrowserDriver({
      inputs: standardInputs,
      html: "<form><input name='email'/><input name='first_name'/><input type='file' name='resume'/></form>",
    });

    const result = await service.executeAssistedFlow({
      executionId: exec.id,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
      candidateContext: baseCandidateContext,
      driver,
    });

    assert.equal(result.status, "AWAITING_APPROVAL");
    assert.equal(result.formDetected, true);
    assert.equal(result.mappedFields.length, 6);
    assert.equal(result.uploadedDocuments.length, 1);
    assert.equal(result.uploadedDocuments[0]?.uploaded, true);

    // Verify filled values in driver
    assert.equal(driver.getFilledValue("input[name='first_name']"), "Jordan");
    assert.equal(driver.getFilledValue("input[name='last_name']"), "Staff");
    assert.equal(driver.getFilledValue("input[name='email']"), "jordan.staff@example.com");
    assert.ok(driver.getUploadedFile("input[name='resume']"));

    // Verify audit log
    assert.ok(result.auditLog.length >= 5);
    const hasNavStep = result.auditLog.some((e) => e.step === "NAVIGATING");
    const hasFillStep = result.auditLog.some((e) => e.step === "FILLING");
    assert.ok(hasNavStep, "Audit log must contain navigation step");
    assert.ok(hasFillStep, "Audit log must contain filling step");
  });

  await t.test("2. Safety Halt on CAPTCHA: Halts immediately without filling fields", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
    });

    const driver = new SimulatedBrowserDriver({
      simulateCaptcha: true,
      inputs: [{ selector: "input[name='email']", name: "email", type: "text" }],
    });

    const result = await service.executeAssistedFlow({
      executionId: exec.id,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
      candidateContext: baseCandidateContext,
      driver,
    });

    assert.equal(result.status, "STOPPED_SAFETY");
    assert.equal(result.safetyStopReason, "CAPTCHA_DETECTED");
    assert.match(result.errorMessage!, /CAPTCHA/);
    assert.equal(driver.getFilledValue("input[name='email']"), undefined);
  });

  await t.test("3. Safety Halt on Auth Wall & Blocked Automation", async () => {
    // Auth Wall
    const exec1 = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
    });

    const authDriver = new SimulatedBrowserDriver({
      simulateAuthWall: true,
    });

    const resAuth = await service.executeAssistedFlow({
      executionId: exec1.id,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
      candidateContext: baseCandidateContext,
      driver: authDriver,
    });

    assert.equal(resAuth.status, "STOPPED_SAFETY");
    assert.equal(resAuth.safetyStopReason, "AUTH_REQUIRED");

    // Blocked
    const exec2 = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
    });

    const blockedDriver = new SimulatedBrowserDriver({
      simulateBlocked: true,
    });

    const resBlocked = await service.executeAssistedFlow({
      executionId: exec2.id,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
      candidateContext: baseCandidateContext,
      driver: blockedDriver,
    });

    assert.equal(resBlocked.status, "STOPPED_SAFETY");
    assert.equal(resBlocked.safetyStopReason, "BLOCKED_AUTOMATION");
  });

  await t.test("4. Anti-SSRF Protection: Rejects loopback & private networks with immediate halt", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "http://127.0.0.1:8080/internal/apply",
    });

    await assert.rejects(
      async () => {
        await service.executeAssistedFlow({
          executionId: exec.id,
          candidateProfileId: candidate1Id,
          targetUrl: "http://127.0.0.1:8080/internal/apply",
          candidateContext: baseCandidateContext,
        });
      },
      BrowserSafetyHaltError
    );

    const updated = await repository.findById(exec.id, candidate1Id);
    assert.equal(updated.status, "STOPPED_SAFETY");
    assert.equal(updated.safetyStopReason, "SSRF_ATTEMPT");
  });

  await t.test("5. Sensitive Questions Pause & Confirmation Workflow: Pauses for review, then confirms", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
    });

    const inputsWithSensitive: InspectedInputField[] = [
      { selector: "input[name='first_name']", name: "first_name", label: "First Name", type: "text" },
      { selector: "input[name='email']", name: "email", label: "Email", type: "text" },
      {
        selector: "input[name='visa_sponsorship']",
        name: "visa_sponsorship",
        label: "Do you require visa sponsorship?",
        type: "radio",
      },
    ];

    const driver = new SimulatedBrowserDriver({
      inputs: inputsWithSensitive,
      html: "<form><input name='email'/><input name='visa_sponsorship'/></form>",
    });

    // Step A: First pass pauses for review
    const resA = await service.executeAssistedFlow({
      executionId: exec.id,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
      candidateContext: baseCandidateContext,
      driver,
    });

    assert.equal(resA.status, "PAUSED_FOR_REVIEW");
    assert.equal(resA.safetyStopReason, "SENSITIVE_QUESTION_PAUSE");
    assert.equal(driver.getFilledValue("input[name='visa_sponsorship']"), undefined);

    // Step B: Candidate explicitly confirms answer for sensitive field
    const resB = await repository.confirmField(
      exec.id,
      candidate1Id,
      "visa_sponsorship",
      "No, legally authorized"
    );

    assert.equal(resB.status, "AWAITING_APPROVAL");
    const visaField = resB.mappedFields.find((f) => f.name === "visa_sponsorship");
    assert.equal(visaField?.value, "No, legally authorized");
    assert.equal(visaField?.classification, "KNOWN");
    assert.equal(visaField?.requiresUserInput, false);
  });

  await t.test("6. Upload Failure Handling: Stops safely when document upload fails", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
    });

    const inputs: InspectedInputField[] = [
      { selector: "input[name='email']", name: "email", label: "Email", type: "text" },
      { selector: "input[name='resume']", name: "resume", label: "Resume", type: "file" },
    ];

    const driver = new SimulatedBrowserDriver({
      inputs,
      html: "<form><input name='email'/><input type='file' name='resume'/></form>",
      uploadShouldFail: true,
    });

    const res = await service.executeAssistedFlow({
      executionId: exec.id,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
      candidateContext: baseCandidateContext,
      driver,
    });

    assert.equal(res.status, "STOPPED_SAFETY");
    assert.equal(res.safetyStopReason, "UPLOAD_FAILURE");
    assert.match(res.errorMessage!, /Failed to upload tailored resume document/);
  });

  await t.test("7. Cross-Tenant Security Gate: Candidate 2 cannot access or run Candidate 1's execution", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
    });

    // Candidate 2 findById throws Forbidden
    await assert.rejects(async () => {
      await repository.findById(exec.id, candidate2Id);
    }, BrowserExecutionForbiddenError);

    // Candidate 2 update throws Forbidden
    await assert.rejects(async () => {
      await repository.update(exec.id, candidate2Id, { status: "AWAITING_APPROVAL" });
    }, BrowserExecutionForbiddenError);

    // Candidate 2 executeAssistedFlow throws Forbidden
    await assert.rejects(async () => {
      await service.executeAssistedFlow({
        executionId: exec.id,
        candidateProfileId: candidate2Id,
        targetUrl: "https://boards.greenhouse.io/cloudtech/jobs/123",
        candidateContext: baseCandidateContext,
      });
    }, BrowserExecutionForbiddenError);
  });

  await t.test("Teardown: Clean up test fixtures and verify cascade deletion", async () => {
    await db.delete(applications).where(eq(applications.id, applicationId));

    // Verify executions cascade deleted
    const remainingExecs = await db
      .select()
      .from(browserExecutions)
      .where(eq(browserExecutions.candidateProfileId, candidate1Id));
    assert.equal(remainingExecs.length, 0, "Browser executions must be cascade-deleted with application");

    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate1Id));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate2Id));
    await db.delete(jobs).where(eq(jobs.id, jobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));
  });
});
