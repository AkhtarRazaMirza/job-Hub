/**
 * Job Hub — Phase 8 / Step 8.8
 * Phase 8 Definitive Completion Gate Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent flow")
 * - 03_tech_stack.md §7 ("Playwright browser automation")
 * - 04_ai_agent_skills.md §14 ("Browser Agent Skill"), §15 ("Browser Safety Skill"), §16 ("Human Approval Skill")
 *
 * System Invariants Tested:
 * 1. Pre-Submission Human Approval Invariant: userApproved: true mandatory before submission.
 * 2. Submission Uncertainty Invariant: uncertain submission state leaves application as PREPARED (never APPLIED).
 * 3. Anti-SSRF & Network Security Invariant: private IPs, loopback, cloud metadata, credentials blocked.
 * 4. Absolute Safety Halts: CAPTCHA, Auth Wall, MFA, blocked automation, unexpected redirects halt immediately.
 * 5. Candidate Truthfulness & Sensitive Questions Caution: visa, salary, relocation, demographic, legal require verification.
 * 6. Idempotency & Duplicate Prevention: already-APPLIED applications cannot be submitted a second time.
 * 7. Multi-Tenant Candidate Isolation & Spoofing Defense: candidate profiles cannot access cross-tenant executions.
 * 8. Source of Truth Documentation Immutability: the 4 core documents are strictly unchanged.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
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
  validateBrowserTargetUrl,
  evaluateBrowserPageState,
  classifyFormField,
  mapFormFields,
  BrowserApprovalRequiredError,
  BrowserUncertainSubmissionError,
  BrowserExecutionForbiddenError,
  startBrowserExecutionClientInputSchema,
  confirmFieldAnswerClientInputSchema,
  approveBrowserSubmissionClientInputSchema,
  type InspectedInputField,
  type BrowserPageState,
} from "@job-hub/applications";
import {
  browserExecutionRepository,
  controlledBrowserService,
  browserSubmissionController,
  applicationRepository,
} from "@job-hub/applications/server";
import { SimulatedBrowserDriver } from "@job-hub/applications";

test("Phase 8 Definitive Completion Gate Suite", async (t) => {
  const testUserId1 = `usr_gate8_1_${Date.now()}`;
  const testUserId2 = `usr_gate8_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let testJobId: string;
  let applicationId: string;
  let testExecutionId: string;

  await t.test("Setup: Create candidate profiles, job, and application", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Phase 8 Gate User 1",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Phase 8 Gate User 2",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Candidate Profiles
    const [c1] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId1,
        headline: "Staff Software Engineer",
      })
      .returning();
    candidate1Id = c1.id;

    const [c2] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId2,
        headline: "Junior Developer",
      })
      .returning();
    candidate2Id = c2.id;

    // 3. Job
    const [job] = await db
      .insert(jobs)
      .values({
        source: "greenhouse",
        sourceJobId: `gh_gate8_${Date.now()}`,
        title: "Staff Distributed Systems Engineer",
        company: "HyperScale Inc",
        location: "Remote",
        remoteType: "WORLDWIDE_REMOTE",
        canonicalUrl: "https://boards.greenhouse.io/hyperscale/jobs/8888",
        applicationUrl: "https://boards.greenhouse.io/hyperscale/jobs/8888",
        status: "ACTIVE",
      })
      .returning();
    testJobId = job.id;

    // 4. Application
    const [app] = await db
      .insert(applications)
      .values({
        candidateProfileId: candidate1Id,
        jobId: testJobId,
        company: "HyperScale Inc",
        role: "Staff Distributed Systems Engineer",
        source: "greenhouse",
        status: "PREPARED",
        applicationUrl: "https://boards.greenhouse.io/hyperscale/jobs/8888",
      })
      .returning();
    applicationId = app.id;
  });

  // ===========================================================================
  // Invariant 1: Pre-Submission Human Approval Invariant
  // ===========================================================================
  await t.test("1. Pre-Submission Human Approval Invariant: Submission blocked without explicit candidate approval", async () => {
    // Create execution without user approval (userApproved = false)
    const exec = await browserExecutionRepository.create({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://boards.greenhouse.io/hyperscale/jobs/8888",
    });
    testExecutionId = exec.id;

    // Attempting to submit without approval throws BrowserApprovalRequiredError
    await assert.rejects(
      () =>
        browserSubmissionController.submitApplication({
          executionId: testExecutionId,
          candidateProfileId: candidate1Id,
        }),
      (err: any) => {
        assert.ok(err instanceof BrowserApprovalRequiredError);
        assert.ok(
          err.message.includes("explicit candidate approval") ||
          err.message.includes("approval is strictly required")
        );
        return true;
      }
    );

    // Verify application status remained PREPARED
    const [currentApp] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId));
    assert.equal(currentApp.status, "PREPARED");
  });

  // ===========================================================================
  // Invariant 2: Submission Uncertainty Invariant
  // ===========================================================================
  await t.test("2. Submission Uncertainty Invariant: Uncertain submission leaves application as PREPARED (never APPLIED)", async () => {
    const uncertainDriver = new SimulatedBrowserDriver({
      simulateSubmissionUncertain: true,
    });

    // Mark user approved and in AWAITING_APPROVAL status
    await browserExecutionRepository.update(testExecutionId, candidate1Id, {
      status: "AWAITING_APPROVAL",
      userApproved: true,
      userApprovedAt: new Date(),
    });

    await assert.rejects(
      () =>
        browserSubmissionController.submitApplication({
          executionId: testExecutionId,
          candidateProfileId: candidate1Id,
          driver: uncertainDriver,
        }),
      (err: any) => {
        assert.ok(err instanceof BrowserUncertainSubmissionError);
        return true;
      }
    );

    // Check execution status is SUBMISSION_UNCERTAIN
    const updatedExec = await browserExecutionRepository.findById(testExecutionId, candidate1Id);
    assert.equal(updatedExec.status, "SUBMISSION_UNCERTAIN");

    // Check application status is STILL PREPARED to prevent duplicate submissions
    const [currentApp] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId));
    assert.equal(currentApp.status, "PREPARED");
    assert.equal(currentApp.submittedAt, null);
  });

  // ===========================================================================
  // Invariant 3: Anti-SSRF & Network Security Invariant
  // ===========================================================================
  await t.test("3. Anti-SSRF & Network Security Invariant: Blocks loopback, cloud metadata, and private IP spaces", () => {
    const dangerousUrls = [
      "http://127.0.0.1:8080/admin",
      "http://localhost:3000/api",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.1/internal",
      "http://172.16.0.1/private",
      "http://192.168.1.1/router",
      "http://user:password@legitimate.com",
      "ftp://boards.greenhouse.io/job",
      "javascript:alert(1)",
    ];

    for (const url of dangerousUrls) {
      const result = validateBrowserTargetUrl(url);
      assert.equal(
        result.valid,
        false,
        `URL '${url}' must be blocked by Anti-SSRF validator`
      );
      assert.ok(result.error);
    }

    // Legitimate ATS URL passes
    const validResult = validateBrowserTargetUrl(
      "https://boards.greenhouse.io/hyperscale/jobs/8888",
      "https://boards.greenhouse.io/hyperscale/jobs/8888"
    );
    assert.equal(validResult.valid, true);
  });

  // ===========================================================================
  // Invariant 4: Absolute Safety Halts (Defense in Depth)
  // ===========================================================================
  await t.test("4. Absolute Safety Halts: Triggers immediate halt on CAPTCHA, Auth Wall, MFA, and blocked automation", () => {
    const baseUrl = "https://jobs.lever.co/company/job";

    // 1. CAPTCHA
    const captchaState: BrowserPageState = {
      url: baseUrl,
      title: "Security Check",
      domain: "jobs.lever.co",
      html: "<div>Please solve this Cloudflare Turnstile CAPTCHA to verify you are human</div>",
    };
    const captchaCheck = evaluateBrowserPageState(captchaState, baseUrl);
    assert.equal(captchaCheck.safe, false);
    assert.equal(captchaCheck.reason, "CAPTCHA_DETECTED");

    // 2. Auth Wall
    const authState: BrowserPageState = {
      url: baseUrl,
      title: "Sign in",
      domain: "jobs.lever.co",
      html: "<div>Please sign in to continue to application form</div>",
    };
    const authCheck = evaluateBrowserPageState(authState, baseUrl);
    assert.equal(authCheck.safe, false);
    assert.equal(authCheck.reason, "AUTH_REQUIRED");

    // 3. MFA
    const mfaState: BrowserPageState = {
      url: baseUrl,
      title: "Two-Factor Verification",
      domain: "jobs.lever.co",
      html: "<div>Enter the 6-digit verification code sent to your authenticator app</div>",
    };
    const mfaCheck = evaluateBrowserPageState(mfaState, baseUrl);
    assert.equal(mfaCheck.safe, false);
    assert.equal(mfaCheck.reason, "MFA_REQUIRED");

    // 4. Blocked Automation / Cloudflare
    const blockedState: BrowserPageState = {
      url: baseUrl,
      title: "Access Denied",
      domain: "jobs.lever.co",
      httpStatus: 403,
      html: "<div>Cloudflare Ray ID: 88888 Access Denied</div>",
    };
    const blockedCheck = evaluateBrowserPageState(blockedState, baseUrl);
    assert.equal(blockedCheck.safe, false);
    assert.equal(blockedCheck.reason, "BLOCKED_AUTOMATION");

    // 5. Unexpected Redirect
    const redirectState: BrowserPageState = {
      url: "https://phishing-site.example.com/apply",
      title: "Job Application",
      domain: "phishing-site.example.com",
      html: "<form></form>",
    };
    const redirectCheck = evaluateBrowserPageState(redirectState, baseUrl);
    assert.equal(redirectCheck.safe, false);
    assert.ok(
      redirectCheck.reason === "UNEXPECTED_REDIRECT" || redirectCheck.reason === "SSRF_ATTEMPT",
      "Expected redirect or SSRF halt reason"
    );
  });

  // ===========================================================================
  // Invariant 5: Candidate Truthfulness & Sensitive Questions Caution
  // ===========================================================================
  await t.test("5. Candidate Truthfulness & Sensitive Questions: Enforces UNSAFE / USER_REQUIRED on sensitive declarations", () => {
    const sensitiveInputs: InspectedInputField[] = [
      {
        selector: 'input[name="visa_sponsorship"]',
        name: "visa_sponsorship",
        label: "Will you now or in the future require visa sponsorship?",
        type: "radio",
        required: true,
      },
      {
        selector: 'input[name="desired_salary"]',
        name: "desired_salary",
        label: "What is your expected annual compensation / salary?",
        type: "text",
        required: true,
      },
      {
        selector: 'input[name="willing_to_relocate"]',
        name: "willing_to_relocate",
        label: "Are you willing to relocate for this role?",
        type: "radio",
        required: true,
      },
      {
        selector: 'select[name="ethnicity"]',
        name: "ethnicity",
        label: "Demographic survey: Ethnicity / Race identification",
        type: "select",
      },
      {
        selector: 'input[name="criminal_record"]',
        name: "criminal_record",
        label: "Have you ever been convicted of a felony or legal offense?",
        type: "radio",
        required: true,
      },
    ];

    for (const input of sensitiveInputs) {
      const res = classifyFormField(input);
      assert.equal(
        res.classification,
        "UNSAFE",
        `Field '${input.label}' must be classified as UNSAFE`
      );
      assert.equal(
        res.requiresUserInput,
        true,
        `Field '${input.label}' must require user input`
      );
      assert.equal(
        res.confidence,
        "USER_REQUIRED",
        `Field '${input.label}' confidence must be USER_REQUIRED`
      );
    }
  });

  // ===========================================================================
  // Invariant 6: Idempotency & Duplicate Submission Prevention
  // ===========================================================================
  await t.test("6. Idempotency & Duplicate Application Block: Cannot submit application that is already APPLIED", async () => {
    // Set execution to AWAITING_APPROVAL and approved
    await browserExecutionRepository.update(testExecutionId, candidate1Id, {
      status: "AWAITING_APPROVAL",
      userApproved: true,
    });

    // 1. Manually transition application to APPLIED
    await applicationRepository.transitionStatus({
      id: applicationId,
      candidateProfileId: candidate1Id,
      toStatus: "APPLIED",
      notes: "First verified submission",
      confirmationReference: "CONF-PREV-12345",
    });

    // 2. Attempting to submit again via browser controller must throw
    await assert.rejects(
      () =>
        browserSubmissionController.submitApplication({
          executionId: testExecutionId,
          candidateProfileId: candidate1Id,
        }),
      (err: any) => {
        assert.ok(err.message.includes("already been submitted and marked as APPLIED"));
        return true;
      }
    );
  });

  // ===========================================================================
  // Invariant 7: Multi-Tenant Candidate Isolation & Spoofing Defense
  // ===========================================================================
  await t.test("7. Multi-Tenant Isolation & Client Spoofing: Rejects cross-tenant access and injected identifiers", async () => {
    // Candidate 2 cannot access Candidate 1's execution
    await assert.rejects(
      () => browserExecutionRepository.findById(testExecutionId, candidate2Id),
      (err) => err instanceof BrowserExecutionForbiddenError
    );

    await assert.rejects(
      () =>
        browserExecutionRepository.confirmField(
          testExecutionId,
          candidate2Id,
          "first_name",
          "Attacker"
        ),
      (err) => err instanceof BrowserExecutionForbiddenError
    );

    await assert.rejects(
      () =>
        browserSubmissionController.submitApplication({
          executionId: testExecutionId,
          candidateProfileId: candidate2Id,
        }),
      (err) => err instanceof BrowserExecutionForbiddenError
    );

    // Zod client schema rejects client-supplied spoofed identifiers
    assert.throws(
      () =>
        startBrowserExecutionClientInputSchema.parse({
          applicationId,
          candidateProfileId: candidate2Id, // Injected!
        }),
      (err: any) => err.name === "ZodError"
    );

    assert.throws(
      () =>
        confirmFieldAnswerClientInputSchema.parse({
          executionId: testExecutionId,
          fieldId: "first_name",
          confirmedValue: "Attacker",
          userId: testUserId2, // Injected!
        }),
      (err: any) => err.name === "ZodError"
    );

    assert.throws(
      () =>
        approveBrowserSubmissionClientInputSchema.parse({
          executionId: testExecutionId,
          confirmed: false, // Must be true!
        }),
      (err: any) => err.name === "ZodError"
    );
  });

  // ===========================================================================
  // Invariant 8: Source of Truth Documentation Immutability
  // ===========================================================================
  await t.test("8. Source of Truth Documentation Immutability: The 4 core documents are strictly unchanged", () => {
    const gitDiff = execSync(
      "git diff -- 01_build_the_system.md 02_how_to_build.md 03_tech_stack.md 04_ai_agent_skills.md",
      { encoding: "utf-8" }
    ).trim();

    assert.equal(
      gitDiff,
      "",
      `Expected 0 git diff on core documentation files, but received:\n${gitDiff}`
    );
  });

  // Teardown
  await t.test("Teardown: Clean up test entities", async () => {
    await db.delete(browserExecutions).where(eq(browserExecutions.candidateProfileId, candidate1Id));
    await db.delete(applications).where(eq(applications.id, applicationId));
    await db.delete(jobs).where(eq(jobs.id, testJobId));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate1Id));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate2Id));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));
  });
});
