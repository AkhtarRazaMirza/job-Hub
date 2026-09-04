/**
 * Job Hub — Phase 8 / Step 8.5
 * Human Approval & Verified Submission Controller Test Suite
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
  applicationEvents,
} from "@job-hub/db";
import { eq, and } from "drizzle-orm";
import {
  BrowserApprovalRequiredError,
  BrowserUncertainSubmissionError,
  BrowserExecutionForbiddenError,
  ApplicationError,
} from "@job-hub/applications";
import {
  BrowserExecutionRepository,
  BrowserSubmissionController,
  SimulatedBrowserDriver,
  applicationRepository,
} from "@job-hub/applications/server";

test("Phase 8 / Step 8.5 — Human Approval & Verified Submission Controller Suite", async (t) => {
  const testUserId1 = `usr_p85_1_${Date.now()}`;
  const testUserId2 = `usr_p85_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let jobId: string;
  let applicationId: string;

  const repository = new BrowserExecutionRepository();
  const controller = new BrowserSubmissionController(repository, applicationRepository);

  await t.test("Setup: Create candidate profiles, job, and application", async () => {
    await db.insert(users).values([
      { id: testUserId1, name: "Riley Submission", email: `${testUserId1}@example.com` },
      { id: testUserId2, name: "Taylor Other", email: `${testUserId2}@example.com` },
    ]);

    const [c1] = await db.insert(candidateProfiles).values({
      userId: testUserId1,
      headline: "Principal Engineer",
    }).returning();
    candidate1Id = c1!.id;

    const [c2] = await db.insert(candidateProfiles).values({
      userId: testUserId2,
      headline: "Security Analyst",
    }).returning();
    candidate2Id = c2!.id;

    const [j] = await db.insert(jobs).values({
      title: "Staff Security Architect",
      company: "SecureCloud",
      location: "Remote",
      source: "remoteok",
      applicationUrl: "https://boards.greenhouse.io/securecloud/jobs/555",
    }).returning();
    jobId = j!.id;

    const [app] = await db.insert(applications).values({
      candidateProfileId: candidate1Id,
      jobId,
      company: "SecureCloud",
      role: "Staff Security Architect",
      source: "remoteok",
      applicationUrl: "https://boards.greenhouse.io/securecloud/jobs/555",
      status: "PREPARED",
    }).returning();
    applicationId = app!.id;
  });

  await t.test("1. Invariant: Submission blocked without explicit human approval", async () => {
    // Create execution without user approval
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/securecloud/jobs/555",
    });

    await repository.update(exec.id, candidate1Id, {
      status: "AWAITING_APPROVAL",
      userApproved: false, // NOT approved
      mappedFields: [
        {
          fieldId: "f1",
          selector: "input[name='name']",
          fieldType: "text",
          classification: "KNOWN",
          value: "Riley Submission",
          filled: true,
          confidence: "VERIFIED",
        },
      ],
    });

    await assert.rejects(
      async () => {
        await controller.submitApplication({
          executionId: exec.id,
          candidateProfileId: candidate1Id,
        });
      },
      BrowserApprovalRequiredError
    );

    // Verify application status remained PREPARED
    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
    assert.equal(app?.status, "PREPARED");
  });

  await t.test("2. Invariant: Submission blocked if unresolved required/unsafe questions remain", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/securecloud/jobs/555",
    });

    await repository.update(exec.id, candidate1Id, {
      status: "AWAITING_APPROVAL",
      userApproved: true,
      mappedFields: [
        {
          fieldId: "f_name",
          selector: "input[name='name']",
          fieldType: "text",
          classification: "KNOWN",
          value: "Riley Submission",
          filled: true,
          confidence: "VERIFIED",
        },
        {
          fieldId: "f_visa",
          selector: "input[name='visa']",
          fieldType: "radio",
          classification: "UNSAFE",
          value: undefined, // Unresolved sensitive field
          filled: false,
          requiresUserInput: true,
          confidence: "USER_REQUIRED",
        },
      ],
    });

    await assert.rejects(
      async () => {
        await controller.submitApplication({
          executionId: exec.id,
          candidateProfileId: candidate1Id,
        });
      },
      BrowserApprovalRequiredError
    );
  });

  await t.test("3. Invariant: Submission Uncertainty prevents duplicate applications and leaves status PREPARED", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/securecloud/jobs/555",
    });

    await repository.update(exec.id, candidate1Id, {
      status: "AWAITING_APPROVAL",
      userApproved: true,
      mappedFields: [
        {
          fieldId: "f_email",
          selector: "input[name='email']",
          fieldType: "text",
          classification: "KNOWN",
          value: "riley@example.com",
          filled: true,
          confidence: "VERIFIED",
        },
      ],
    });

    const uncertainDriver = new SimulatedBrowserDriver({
      simulateSubmissionUncertain: true,
    });

    await assert.rejects(
      async () => {
        await controller.submitApplication({
          executionId: exec.id,
          candidateProfileId: candidate1Id,
          driver: uncertainDriver,
        });
      },
      BrowserUncertainSubmissionError
    );

    // Verify execution status is SUBMISSION_UNCERTAIN
    const updatedExec = await repository.findById(exec.id, candidate1Id);
    assert.equal(updatedExec.status, "SUBMISSION_UNCERTAIN");
    assert.equal(updatedExec.submissionVerified, false);

    // INVARIANT CHECK: Application is strictly NOT marked as APPLIED
    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
    assert.equal(app?.status, "PREPARED", "Application status MUST NOT be set to APPLIED on uncertainty");

    // Verify audit event on application tracking
    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId));
    const uncertaintyEvent = events.find((e) => e.notes?.includes("Submission uncertainty encountered"));
    assert.ok(uncertaintyEvent, "Audit event must record uncertainty reason on application");
  });

  await t.test("4. Verified Submission Gate: Approves, submits, verifies, and updates application to APPLIED", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/securecloud/jobs/555",
    });

    await repository.update(exec.id, candidate1Id, {
      status: "AWAITING_APPROVAL",
      userApproved: true,
      mappedFields: [
        {
          fieldId: "f_email",
          selector: "input[name='email']",
          fieldType: "text",
          classification: "KNOWN",
          value: "riley@example.com",
          filled: true,
          confidence: "VERIFIED",
        },
      ],
    });

    const successDriver = new SimulatedBrowserDriver({
      simulateSubmissionSuccess: true,
      submissionConfirmationText: "Confirmation #GH-987654 Application Received",
    });

    const result = await controller.submitApplication({
      executionId: exec.id,
      candidateProfileId: candidate1Id,
      driver: successDriver,
    });

    assert.equal(result.submissionVerified, true);
    assert.equal(result.applicationStatus, "APPLIED");
    assert.equal(result.execution.status, "SUBMITTED_VERIFIED");
    assert.match(result.confirmationReference!, /GH-987654/);

    // Verify database state of application
    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
    assert.equal(app?.status, "APPLIED");
    assert.ok(app?.submittedAt, "submittedAt must be populated upon verified submission");
    assert.match(app?.confirmationReference!, /GH-987654/);
  });

  await t.test("5. Idempotency Gate: Re-submitting an already APPLIED application is blocked", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/securecloud/jobs/555",
    });

    await repository.update(exec.id, candidate1Id, {
      status: "AWAITING_APPROVAL",
      userApproved: true,
    });

    // Application is already APPLIED from previous test step
    await assert.rejects(
      async () => {
        await controller.submitApplication({
          executionId: exec.id,
          candidateProfileId: candidate1Id,
        });
      },
      ApplicationError
    );
  });

  await t.test("6. Cross-User Isolation: Candidate 2 cannot submit Candidate 1's application", async () => {
    const exec = await repository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/securecloud/jobs/555",
    });

    await assert.rejects(
      async () => {
        await controller.submitApplication({
          executionId: exec.id,
          candidateProfileId: candidate2Id,
        });
      },
      BrowserExecutionForbiddenError
    );
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(applications).where(eq(applications.id, applicationId));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate1Id));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate2Id));
    await db.delete(jobs).where(eq(jobs.id, jobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));
  });
});
