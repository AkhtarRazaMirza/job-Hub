/**
 * Job Hub — Phase 8 / Step 8.6
 * Browser Agent tRPC API & Security Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent flow")
 * - 04_ai_agent_skills.md §14, §15, §16
 *
 * Tests:
 * 1. Unauthenticated access throws UNAUTHORIZED
 * 2. Missing candidate profile throws NOT_FOUND
 * 3. Client spoofing rejection (Zod rejects userId / candidateProfileId)
 * 4. SSRF protection prevents dangerous targets
 * 5. startExecution creates execution and performs safe assisted flow
 * 6. getExecution and getLatestExecution return candidate's execution
 * 7. Cross-tenant isolation blocks User 2 from accessing User 1's execution
 * 8. confirmField successfully records candidate verification
 * 9. approveAndSubmit executes verified submission and transitions application to APPLIED
 * 10. cancelExecution cleanly cancels session
 * 11. Teardown
 */

import test from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  applications,
  browserExecutions,
} from "@job-hub/db";
import { eq } from "drizzle-orm";

function isTRPCErrorWithCode(
  err: unknown,
  code: string,
  messageSubstring?: string
): boolean {
  const e = err as any;
  if (!e || (e.name !== "TRPCError" && !(e instanceof TRPCError))) {
    return false;
  }
  if (e.code !== code) {
    return false;
  }
  if (messageSubstring && !e.message?.includes(messageSubstring)) {
    return false;
  }
  return true;
}

function createMockContext(userId: string | null = "usr_test_browser_api_1") {
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
    user: userId
      ? {
          id: userId,
          email: `${userId}@example.com`,
          name: `User ${userId}`,
        }
      : null,
  };
}

test("Step 8.6 — Browser Agent tRPC API & Security Suite", async (t) => {
  const testUserId1 = `usr_test_br_api_1_${Date.now()}`;
  const testUserId2 = `usr_test_br_api_2_${Date.now()}`;
  const testUserIdNoProfile = `usr_test_br_no_prof_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let testJobId1: string;
  let testAppId1: string;
  let executionId1: string;

  const unauthCaller = appRouter.createCaller(createMockContext(null));
  const caller1 = appRouter.createCaller(createMockContext(testUserId1));
  const caller2 = appRouter.createCaller(createMockContext(testUserId2));
  const callerNoProfile = appRouter.createCaller(createMockContext(testUserIdNoProfile));

  await t.test("Setup: Create test users, candidate profiles, job, and application", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Browser API Test User 1",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Browser API Test User 2",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserIdNoProfile,
        name: "No Profile User",
        email: `${testUserIdNoProfile}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Candidate Profiles
    const [cand1] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId1,
        firstName: "Ada",
        lastName: "Lovelace",
        headline: "Principal Systems Architect",
        email: `${testUserId1}@example.com`,
        phone: "+1-555-0199",
        location: "London, UK",
        city: "London",
        country: "UK",
        linkedinUrl: "https://linkedin.com/in/adalovelace",
        githubUrl: "https://github.com/adalovelace",
      })
      .returning();
    candidate1Id = cand1.id;

    const [cand2] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId2,
        firstName: "Charles",
        lastName: "Babbage",
        headline: "Computing Pioneer",
        email: `${testUserId2}@example.com`,
      })
      .returning();
    candidate2Id = cand2.id;

    // 3. Canonical Job
    const [job1] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `ro_br_api_${Date.now()}_1`,
        title: "Staff Infrastructure Engineer",
        company: "Nebula Automation Corp",
        location: "Remote",
        remoteType: "WORLDWIDE_REMOTE",
        canonicalUrl: "https://boards.greenhouse.io/nebula/jobs/12345",
        applicationUrl: "https://boards.greenhouse.io/nebula/jobs/12345",
        status: "ACTIVE",
      })
      .returning();
    testJobId1 = job1.id;

    // 4. Initial Application for User 1
    const [app1] = await db
      .insert(applications)
      .values({
        candidateProfileId: candidate1Id,
        jobId: testJobId1,
        company: "Nebula Automation Corp",
        role: "Staff Infrastructure Engineer",
        source: "remoteok",
        status: "PREPARED",
        applicationUrl: "https://boards.greenhouse.io/nebula/jobs/12345",
      })
      .returning();
    testAppId1 = app1.id;
  });

  // 1. Unauthenticated access throws UNAUTHORIZED
  await t.test("1. Unauthenticated access throws UNAUTHORIZED", async () => {
    await assert.rejects(
      () => unauthCaller.browser.startExecution({ applicationId: testAppId1 }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.browser.getExecution({ executionId: "nonexistent" }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.browser.getLatestExecution({ applicationId: testAppId1 }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.browser.confirmField({ executionId: "e1", fieldId: "f1", confirmedValue: "val" }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.browser.approveAndSubmit({ executionId: "e1", confirmed: true }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
    await assert.rejects(
      () => unauthCaller.browser.cancelExecution({ executionId: "e1" }),
      (err) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
  });

  // 2. Missing candidate profile throws NOT_FOUND
  await t.test("2. Missing candidate profile throws NOT_FOUND", async () => {
    await assert.rejects(
      () => callerNoProfile.browser.startExecution({ applicationId: testAppId1 }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND", "Candidate profile not found")
    );
  });

  // 3. Client spoofing protection
  await t.test("3. Client spoofing protection rejects injected identity fields", async () => {
    await assert.rejects(
      () =>
        (caller1.browser.startExecution as any)({
          applicationId: testAppId1,
          candidateProfileId: candidate2Id,
        }),
      (err) => isTRPCErrorWithCode(err, "BAD_REQUEST")
    );
    await assert.rejects(
      () =>
        (caller1.browser.confirmField as any)({
          executionId: "e1",
          fieldId: "f1",
          confirmedValue: "val",
          userId: testUserId2,
        }),
      (err) => isTRPCErrorWithCode(err, "BAD_REQUEST")
    );
  });

  // 4. SSRF protection
  await t.test("4. SSRF protection blocks private network targets", async () => {
    await assert.rejects(
      () =>
        caller1.browser.startExecution({
          applicationId: testAppId1,
          targetUrl: "http://127.0.0.1:8080/admin",
        }),
      (err) => isTRPCErrorWithCode(err, "BAD_REQUEST", "forbidden") || isTRPCErrorWithCode(err, "BAD_REQUEST", "loopback")
    );
    await assert.rejects(
      () =>
        caller1.browser.startExecution({
          applicationId: testAppId1,
          targetUrl: "http://169.254.169.254/latest/meta-data",
        }),
      (err) => isTRPCErrorWithCode(err, "BAD_REQUEST", "forbidden") || isTRPCErrorWithCode(err, "BAD_REQUEST", "metadata")
    );
  });

  // 5. startExecution creates execution and performs assisted flow
  await t.test("5. startExecution creates execution and executes assisted flow", async () => {
    const result = await caller1.browser.startExecution({
      applicationId: testAppId1,
      targetUrl: "https://boards.greenhouse.io/nebula/jobs/12345",
    });

    assert.ok(result.id);
    assert.equal(result.applicationId, testAppId1);
    assert.ok(["PAUSED_FOR_REVIEW", "AWAITING_APPROVAL"].includes(result.status));
    assert.ok(result.mappedFields.length > 0);

    executionId1 = result.id;
  });

  // 6. getExecution and getLatestExecution
  await t.test("6. getExecution and getLatestExecution return candidate's execution", async () => {
    const execById = await caller1.browser.getExecution({ executionId: executionId1 });
    assert.equal(execById.id, executionId1);
    assert.equal(execById.applicationId, testAppId1);
    assert.equal(execById.candidateProfileId, candidate1Id);

    const latest = await caller1.browser.getLatestExecution({ applicationId: testAppId1 });
    assert.ok(latest);
    assert.equal(latest?.id, executionId1);
  });

  // 7. Cross-tenant isolation
  await t.test("7. Cross-tenant isolation prevents User 2 from accessing User 1's execution", async () => {
    // Cannot get User 1's execution
    await assert.rejects(
      () => caller2.browser.getExecution({ executionId: executionId1 }),
      (err) => isTRPCErrorWithCode(err, "FORBIDDEN") || isTRPCErrorWithCode(err, "NOT_FOUND")
    );

    // Cannot start execution on User 1's application
    await assert.rejects(
      () => caller2.browser.startExecution({ applicationId: testAppId1 }),
      (err) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );

    // Cannot confirm field on User 1's execution
    await assert.rejects(
      () =>
        caller2.browser.confirmField({
          executionId: executionId1,
          fieldId: "first_name",
          confirmedValue: "Hacker",
        }),
      (err) => isTRPCErrorWithCode(err, "FORBIDDEN") || isTRPCErrorWithCode(err, "NOT_FOUND")
    );

    // Cannot approve and submit User 1's execution
    await assert.rejects(
      () => caller2.browser.approveAndSubmit({ executionId: executionId1, confirmed: true }),
      (err) => isTRPCErrorWithCode(err, "FORBIDDEN") || isTRPCErrorWithCode(err, "NOT_FOUND")
    );
  });

  // 8. confirmField records verification
  await t.test("8. confirmField records candidate confirmation", async () => {
    const updated = await caller1.browser.confirmField({
      executionId: executionId1,
      fieldId: "first_name",
      confirmedValue: "Ada Augusta",
    });

    const field = updated.mappedFields.find((f: any) => f.fieldId === "first_name");
    assert.ok(field);
    assert.equal(field?.value, "Ada Augusta");
    assert.equal(field?.confidence, "VERIFIED");

    // Also confirm the resume field so all required inputs are confirmed before submission
    await caller1.browser.confirmField({
      executionId: executionId1,
      fieldId: "resume",
      confirmedValue: "resumes/cand_1/approved_resume.pdf",
    });
  });

  // 9. approveAndSubmit executes submission and transitions application to APPLIED
  await t.test("9. approveAndSubmit executes verified submission and transitions application to APPLIED", async () => {
    const submitResult = await caller1.browser.approveAndSubmit({
      executionId: executionId1,
      confirmed: true,
    });

    assert.equal(submitResult.submissionVerified, true);
    assert.equal(submitResult.execution.status, "SUBMITTED_VERIFIED");
    assert.equal(submitResult.applicationStatus, "APPLIED");
    assert.ok(submitResult.confirmationReference);

    // Verify application status updated in DB
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, testAppId1));
    assert.equal(app.status, "APPLIED");
    assert.ok(app.submittedAt);
  });

  // 10. cancelExecution cleanly cancels a session
  await t.test("10. cancelExecution updates status to CANCELLED", async () => {
    // Create a new execution for cancellation testing
    const [exec2] = await db
      .insert(browserExecutions)
      .values({
        applicationId: testAppId1,
        candidateProfileId: candidate1Id,
        targetUrl: "https://boards.greenhouse.io/nebula/jobs/12345",
        status: "INITIALIZED",
      })
      .returning();

    const cancelled = await caller1.browser.cancelExecution({
      executionId: exec2.id,
    });

    assert.equal(cancelled.status, "CANCELLED");
  });

  // 11. Teardown
  await t.test("11. Teardown: clean up test entities", async () => {
    await db.delete(browserExecutions).where(eq(browserExecutions.candidateProfileId, candidate1Id));
    await db.delete(applications).where(eq(applications.id, testAppId1));
    await db.delete(jobs).where(eq(jobs.id, testJobId1));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate1Id));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate2Id));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));
    await db.delete(users).where(eq(users.id, testUserIdNoProfile));
  });
});
