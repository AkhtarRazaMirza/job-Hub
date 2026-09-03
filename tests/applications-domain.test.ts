/**
 * Job Hub — Phase 6 / Step 6.2 & 6.3
 * Application Domain, State Machine & Persistence Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 12 & 13, §5 Phase 6
 * - 02_how_to_build.md §2, §10, §14, §17
 * - 04_ai_agent_skills.md §17 & §18
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_LABELS,
  TERMINAL_STATUSES,
  VALID_APPLICATION_TRANSITIONS,
  isTerminalStatus,
  isValidTransition,
  validateTransition,
  getAllowedTransitions,
  getStatusLabel,
  applicationSchema,
  createApplicationClientInputSchema,
  createApplicationInputSchema,
  transitionStatusInputSchema,
  updateNotesInputSchema,
  updateFollowUpInputSchema,
  ApplicationError,
  ApplicationNotFoundError,
  ApplicationConflictError,
  InvalidStateTransitionError,
} from "@job-hub/applications";
import { applicationRepository } from "@job-hub/applications/server";
import { db, users, candidateProfiles, jobs, jobMatches, applications, applicationEvents } from "@job-hub/db";
import { eq } from "drizzle-orm";

test("Step 6.2 & 6.3 — Application Domain, Lifecycle State Machine & Persistence Suite", async (t) => {
  // ---------------------------------------------------------------------------
  // Domain Validation & State Machine Tests (Step 6.2)
  // ---------------------------------------------------------------------------

  await t.test("1. Schema Validation: accepts valid Application domain entity", () => {
    const validApp = {
      id: "app_123",
      candidateProfileId: "cand_123",
      jobId: "job_123",
      matchId: "match_123",
      company: "Acme Corp",
      role: "Senior Full Stack Engineer",
      source: "remoteok",
      applicationUrl: "https://remoteok.com/jobs/123",
      matchScore: "8.75",
      status: APPLICATION_STATUS.PREPARED,
      submittedAt: null,
      nextAction: "Review resume before submission",
      followUpDate: new Date("2026-09-10T12:00:00Z"),
      notes: "Referral from teammate",
      resumeVersionId: "res_123",
      coverLetterVersionId: null,
      confirmationReference: null,
      answers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parsed = applicationSchema.parse(validApp);
    assert.equal(parsed.id, "app_123");
    assert.equal(parsed.status, "PREPARED");
  });

  await t.test("2. Schema Validation: rejects missing required fields and invalid status", () => {
    assert.throws(() =>
      applicationSchema.parse({
        id: "app_123",
        // missing candidateProfileId, jobId, company, role, source
        status: "INVALID_STATUS",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  await t.test("3. Schema Validation: rejects injected unknown fields via .strict()", () => {
    assert.throws(
      () =>
        createApplicationClientInputSchema.parse({
          jobId: "job_123",
          userId: "injected_user_id", // should be rejected!
          candidateProfileId: "injected_profile_id", // should be rejected!
        }),
      /unrecognized_keys/
    );
  });

  await t.test("4. Schema Validation: rejects notes exceeding 2000 characters", () => {
    const longNotes = "a".repeat(2001);
    assert.throws(
      () =>
        updateNotesInputSchema.parse({
          id: "app_123",
          notes: longNotes,
        }),
      /cannot exceed 2000 characters/
    );
  });

  await t.test("5. State Machine: correctly classifies terminal statuses", () => {
    assert.equal(isTerminalStatus(APPLICATION_STATUS.REJECTED), true);
    assert.equal(isTerminalStatus(APPLICATION_STATUS.WITHDRAWN), true);
    assert.equal(isTerminalStatus(APPLICATION_STATUS.PREPARED), false);
    assert.equal(isTerminalStatus(APPLICATION_STATUS.APPLIED), false);
    assert.equal(isTerminalStatus(APPLICATION_STATUS.UNDER_REVIEW), false);
    assert.equal(isTerminalStatus(APPLICATION_STATUS.INTERVIEW_SCHEDULED), false);
    assert.equal(isTerminalStatus(APPLICATION_STATUS.INTERVIEW_COMPLETED), false);
    assert.equal(isTerminalStatus(APPLICATION_STATUS.OFFER), false);
  });

  await t.test("6. State Machine: validates legal transitions", () => {
    // PREPARED -> APPLIED or WITHDRAWN
    assert.equal(isValidTransition(APPLICATION_STATUS.PREPARED, APPLICATION_STATUS.APPLIED), true);
    assert.equal(isValidTransition(APPLICATION_STATUS.PREPARED, APPLICATION_STATUS.WITHDRAWN), true);

    // APPLIED -> UNDER_REVIEW, INTERVIEW_SCHEDULED, REJECTED, WITHDRAWN
    assert.equal(isValidTransition(APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.UNDER_REVIEW), true);
    assert.equal(isValidTransition(APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.INTERVIEW_SCHEDULED), true);
    assert.equal(isValidTransition(APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.REJECTED), true);
    assert.equal(isValidTransition(APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.WITHDRAWN), true);

    // UNDER_REVIEW -> INTERVIEW_SCHEDULED, OFFER, REJECTED, WITHDRAWN
    assert.equal(isValidTransition(APPLICATION_STATUS.UNDER_REVIEW, APPLICATION_STATUS.INTERVIEW_SCHEDULED), true);
    assert.equal(isValidTransition(APPLICATION_STATUS.UNDER_REVIEW, APPLICATION_STATUS.OFFER), true);

    // INTERVIEW_SCHEDULED -> INTERVIEW_COMPLETED, OFFER, REJECTED, WITHDRAWN
    assert.equal(isValidTransition(APPLICATION_STATUS.INTERVIEW_SCHEDULED, APPLICATION_STATUS.INTERVIEW_COMPLETED), true);

    // INTERVIEW_COMPLETED -> INTERVIEW_SCHEDULED (next round), OFFER, REJECTED, WITHDRAWN
    assert.equal(isValidTransition(APPLICATION_STATUS.INTERVIEW_COMPLETED, APPLICATION_STATUS.INTERVIEW_SCHEDULED), true);
    assert.equal(isValidTransition(APPLICATION_STATUS.INTERVIEW_COMPLETED, APPLICATION_STATUS.OFFER), true);

    // OFFER -> WITHDRAWN, REJECTED
    assert.equal(isValidTransition(APPLICATION_STATUS.OFFER, APPLICATION_STATUS.WITHDRAWN), true);
    assert.equal(isValidTransition(APPLICATION_STATUS.OFFER, APPLICATION_STATUS.REJECTED), true);
  });

  await t.test("7. State Machine: rejects illegal and terminal transitions", () => {
    // Self-transition rejected
    assert.equal(isValidTransition(APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.APPLIED), false);
    assert.throws(
      () => validateTransition(APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.APPLIED),
      InvalidStateTransitionError
    );

    // Skipping stages legally prohibited (e.g. PREPARED directly to OFFER)
    assert.equal(isValidTransition(APPLICATION_STATUS.PREPARED, APPLICATION_STATUS.OFFER), false);
    assert.throws(
      () => validateTransition(APPLICATION_STATUS.PREPARED, APPLICATION_STATUS.OFFER),
      InvalidStateTransitionError
    );

    // Terminal state cannot transition anywhere
    assert.equal(isValidTransition(APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.APPLIED), false);
    assert.throws(
      () => validateTransition(APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.APPLIED),
      /is terminal/
    );

    assert.equal(isValidTransition(APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.PREPARED), false);
    assert.throws(
      () => validateTransition(APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.PREPARED),
      /is terminal/
    );
  });

  await t.test("8. State Machine: truthful status labels", () => {
    assert.equal(getStatusLabel(APPLICATION_STATUS.PREPARED), "Prepared");
    assert.equal(getStatusLabel(APPLICATION_STATUS.APPLIED), "Applied");
    assert.equal(getStatusLabel(APPLICATION_STATUS.UNDER_REVIEW), "Under Review");
    assert.equal(getStatusLabel(APPLICATION_STATUS.INTERVIEW_SCHEDULED), "Interview Scheduled");
    assert.equal(getStatusLabel(APPLICATION_STATUS.INTERVIEW_COMPLETED), "Interview Completed");
    assert.equal(getStatusLabel(APPLICATION_STATUS.OFFER), "Offer");
    assert.equal(getStatusLabel(APPLICATION_STATUS.REJECTED), "Rejected");
    assert.equal(getStatusLabel(APPLICATION_STATUS.WITHDRAWN), "Withdrawn");
  });

  // ---------------------------------------------------------------------------
  // Persistence Layer Tests (Step 6.3)
  // ---------------------------------------------------------------------------

  const testUserId1 = `usr_app_test_1_${Date.now()}`;
  const testUserId2 = `usr_app_test_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let testJobId1: string;
  let testJobId2: string;
  let testMatchId1: string;
  let createdAppId: string;

  await t.test("Setup: Create database test fixtures", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Test Candidate 1",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Test Candidate 2",
        email: `${testUserId2}@example.com`,
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
        headline: "Senior Backend Engineer",
      })
      .returning();
    candidate1Id = cand1.id;

    const [cand2] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId2,
        headline: "Frontend Engineer",
      })
      .returning();
    candidate2Id = cand2.id;

    // 3. Canonical Jobs
    const [job1] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `ro_app_${Date.now()}_1`,
        title: "Staff Distributed Systems Engineer",
        company: "CloudScale Systems",
        location: "Worldwide",
        remoteType: "WORLDWIDE_REMOTE",
        salaryMin: 160000,
        salaryMax: 200000,
        currency: "USD",
        canonicalUrl: "https://cloudscale.example.com/jobs/staff-eng",
        applicationUrl: "https://cloudscale.example.com/jobs/staff-eng",
        status: "ACTIVE",
      })
      .returning();
    testJobId1 = job1.id;

    const [job2] = await db
      .insert(jobs)
      .values({
        source: "himalayas",
        sourceJobId: `him_app_${Date.now()}_2`,
        title: "Senior Full Stack Developer",
        company: "NextGen Technologies",
        location: "US/Canada",
        remoteType: "REGION_REMOTE",
        salaryMin: 140000,
        salaryMax: 180000,
        currency: "USD",
        canonicalUrl: "https://nextgen.example.com/careers/fullstack",
        applicationUrl: "https://nextgen.example.com/careers/fullstack",
        status: "ACTIVE",
      })
      .returning();
    testJobId2 = job2.id;

    // 4. Job Match for Candidate 1 & Job 1
    const [match1] = await db
      .insert(jobMatches)
      .values({
        candidateProfileId: candidate1Id,
        jobId: testJobId1,
        overallScore: "9.20",
        decision: "EXCELLENT_MATCH",
        hardConstraintsPassed: true,
        categoryScores: { skills: 0.95, experience: 0.90 },
        explanation: "Exceptional alignment with distributed systems experience.",
        confidence: "0.95",
        weightsUsed: { skills: 0.3, experience: 0.2 },
      })
      .returning();
    testMatchId1 = match1.id;
  });

  await t.test("9. Persistence: creates application and records audit event", async () => {
    const app = await applicationRepository.create({
      candidateProfileId: candidate1Id,
      jobId: testJobId1,
      matchId: testMatchId1,
      status: APPLICATION_STATUS.PREPARED,
      notes: "Applied via referral link",
      nextAction: "Submit application on company portal",
      followUpDate: new Date("2026-09-12T10:00:00Z"),
    });

    assert.ok(app.id);
    assert.equal(app.candidateProfileId, candidate1Id);
    assert.equal(app.jobId, testJobId1);
    assert.equal(app.company, "CloudScale Systems");
    assert.equal(app.role, "Staff Distributed Systems Engineer");
    assert.equal(app.source, "remoteok");
    assert.equal(app.matchScore, "9.20");
    assert.equal(app.status, APPLICATION_STATUS.PREPARED);
    assert.equal(app.submittedAt, null);
    assert.equal(app.notes, "Applied via referral link");
    assert.equal(app.nextAction, "Submit application on company portal");

    createdAppId = app.id;

    // Verify audit event in PostgreSQL
    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, app.id));

    assert.equal(events.length, 1);
    assert.equal(events[0].toStatus, "PREPARED");
    assert.equal(events[0].eventType, "CREATED");
  });

  await t.test("10. Persistence: rejects creation when canonical job does not exist", async () => {
    await assert.rejects(
      () =>
        applicationRepository.create({
          candidateProfileId: candidate1Id,
          jobId: "nonexistent_job_id",
        }),
      /does not exist/
    );
  });

  await t.test("11. Persistence: duplicate application prevention enforced", async () => {
    await assert.rejects(
      () =>
        applicationRepository.create({
          candidateProfileId: candidate1Id,
          jobId: testJobId1,
        }),
      ApplicationConflictError
    );
  });

  await t.test("12. Persistence: findById joins job, match, and audit events", async () => {
    const app = await applicationRepository.findById(createdAppId, candidate1Id);
    assert.ok(app);
    assert.equal(app.id, createdAppId);
    assert.equal(app.job.company, "CloudScale Systems");
    assert.equal(app.job.title, "Staff Distributed Systems Engineer");
    assert.equal(app.match?.overallScore, "9.20");
    assert.equal(app.match?.decision, "EXCELLENT_MATCH");
    assert.ok(app.events.length >= 1);
  });

  await t.test("13. Persistence: Candidate 2 cannot access Candidate 1's application", async () => {
    const app = await applicationRepository.findById(createdAppId, candidate2Id);
    assert.equal(app, null);
  });

  await t.test("14. Persistence: transitionStatus updates state and sets submittedAt when APPLIED", async () => {
    const updated = await applicationRepository.transitionStatus({
      id: createdAppId,
      candidateProfileId: candidate1Id,
      toStatus: APPLICATION_STATUS.APPLIED,
      notes: "Submitted through Greenhouse portal",
      confirmationReference: "GH-CONF-98431",
      nextAction: "Await initial recruiter screening response",
      followUpDate: new Date("2026-09-15T15:00:00Z"),
    });

    assert.equal(updated.status, APPLICATION_STATUS.APPLIED);
    assert.ok(updated.submittedAt instanceof Date);
    assert.equal(updated.confirmationReference, "GH-CONF-98431");
    assert.equal(updated.notes, "Submitted through Greenhouse portal");

    // Check that audit event was appended
    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, createdAppId));

    assert.equal(events.length, 2);
    const transitionEvent = events.find((e) => e.eventType === "STATUS_CHANGE");
    assert.ok(transitionEvent);
    assert.equal(transitionEvent?.fromStatus, "PREPARED");
    assert.equal(transitionEvent?.toStatus, "APPLIED");
  });

  await t.test("15. Persistence: rejects invalid status transition in repository", async () => {
    // Attempting to jump directly from APPLIED to OFFER (not an allowed transition from APPLIED)
    await assert.rejects(
      () =>
        applicationRepository.transitionStatus({
          id: createdAppId,
          candidateProfileId: candidate1Id,
          toStatus: APPLICATION_STATUS.OFFER,
        }),
      InvalidStateTransitionError
    );
  });

  await t.test("16. Persistence: updateNotes and updateFollowUp record events", async () => {
    const noteUpdated = await applicationRepository.updateNotes(
      createdAppId,
      candidate1Id,
      "Recruiter emailed asking for availability for phone screen"
    );
    assert.equal(
      noteUpdated.notes,
      "Recruiter emailed asking for availability for phone screen"
    );

    const followUpUpdated = await applicationRepository.updateFollowUp(
      createdAppId,
      candidate1Id,
      new Date("2026-09-18T14:00:00Z"),
      "Phone screen with hiring manager"
    );
    assert.equal(followUpUpdated.nextAction, "Phone screen with hiring manager");
  });

  await t.test("17. Persistence: list applications with pagination and status filter", async () => {
    // Create another application for Candidate 1 with Job 2
    await applicationRepository.create({
      candidateProfileId: candidate1Id,
      jobId: testJobId2,
      status: APPLICATION_STATUS.PREPARED,
      notes: "Considering applying",
    });

    const allApps = await applicationRepository.list(candidate1Id);
    assert.equal(allApps.total, 2);
    assert.equal(allApps.items.length, 2);

    const appliedOnly = await applicationRepository.list(candidate1Id, {
      status: APPLICATION_STATUS.APPLIED,
    });
    assert.equal(appliedOnly.total, 1);
    assert.equal(appliedOnly.items[0].id, createdAppId);

    // Candidate 2 list is empty
    const cand2Apps = await applicationRepository.list(candidate2Id);
    assert.equal(cand2Apps.total, 0);
    assert.equal(cand2Apps.items.length, 0);
  });

  await t.test("18. Persistence: getStats calculates status distribution truthfully", async () => {
    const stats = await applicationRepository.getStats(candidate1Id);
    assert.equal(stats.total, 2);
    assert.equal(stats.applied, 1);
    assert.equal(stats.prepared, 1);
    assert.equal(stats.offer, 0);
  });

  await t.test("19. Persistence: withdraw transitions application to terminal state WITHDRAWN", async () => {
    const withdrawn = await applicationRepository.withdraw(
      createdAppId,
      candidate1Id,
      "Accepted another offer"
    );
    assert.equal(withdrawn.status, APPLICATION_STATUS.WITHDRAWN);

    // Further transitions must now be rejected!
    await assert.rejects(
      () =>
        applicationRepository.transitionStatus({
          id: createdAppId,
          candidateProfileId: candidate1Id,
          toStatus: APPLICATION_STATUS.APPLIED,
        }),
      /is terminal/
    );
  });

  await t.test("20. Teardown: Clean up test fixtures and verify cascade deletion", async () => {
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));
    await db.delete(jobs).where(eq(jobs.id, testJobId1));
    await db.delete(jobs).where(eq(jobs.id, testJobId2));

    const orphanedApps = await db
      .select()
      .from(applications)
      .where(eq(applications.id, createdAppId));
    assert.equal(orphanedApps.length, 0);
  });
});
