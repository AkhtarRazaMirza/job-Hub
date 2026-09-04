/**
 * Job Hub — Phase 9 / Step 9.2 Focused Test Suite
 * Candidate-Isolated SQL Analytics Repository
 *
 * Verifies:
 * 1. Candidate Isolation: Candidate A cannot observe Candidate B's applications or metrics.
 * 2. No Double Counting: Applications with multiple events/documents/answers are not multiplied.
 * 3. Scored vs Unscored: Null match scores explicitly handled and partitioned into 'UNSCORED'.
 * 4. Score Band Partitioning: Correctly buckets scores into 85-100, 75-84, 60-74, <60.
 * 5. Source & Role Aggregations: Dynamic and truthful counts without hardcoded assumptions.
 * 6. Empty State: Returns clean zero counts when candidate has zero applications.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { analyticsRepository } from "../packages/applications/src/analytics/repository";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  applications,
  applicationEvents,
  applicationDocuments,
  applicationAnswers,
} from "@job-hub/db";
import { eq } from "drizzle-orm";

test("Phase 9 / Step 9.2 — Candidate-Isolated SQL Analytics Repository Suite", async (t) => {
  const ts = Date.now();
  const user1Id = `usr_repo_test_1_${ts}`;
  const user2Id = `usr_repo_test_2_${ts}`;
  const emptyUserId = `usr_repo_empty_${ts}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let emptyCandidateId: string;

  let job1Id: string;
  let job2Id: string;
  let job3Id: string;
  let job4Id: string;
  let app1Id: string;

  await t.test("Setup: Create candidate profiles and application fixtures", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: user1Id,
        name: "Candidate One",
        email: `${user1Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: user2Id,
        name: "Candidate Two",
        email: `${user2Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: emptyUserId,
        name: "Empty Candidate",
        email: `${emptyUserId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Profiles
    const [c1] = await db
      .insert(candidateProfiles)
      .values({ userId: user1Id, headline: "Backend Engineer" })
      .returning();
    candidate1Id = c1.id;

    const [c2] = await db
      .insert(candidateProfiles)
      .values({ userId: user2Id, headline: "Frontend Engineer" })
      .returning();
    candidate2Id = c2.id;

    const [cEmpty] = await db
      .insert(candidateProfiles)
      .values({ userId: emptyUserId, headline: "New User" })
      .returning();
    emptyCandidateId = cEmpty.id;

    // 3. Jobs
    const [j1, j2, j3, j4] = await db
      .insert(jobs)
      .values([
        {
          source: "remoteok",
          sourceJobId: `ro_repo_${ts}_1`,
          title: "Senior Backend Engineer",
          company: "Acme Corp",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/1",
        },
        {
          source: "remoteok",
          sourceJobId: `ro_repo_${ts}_2`,
          title: "Platform Engineer",
          company: "Beta Systems",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/2",
        },
        {
          source: "himalayas",
          sourceJobId: `him_repo_${ts}_3`,
          title: "Full Stack Engineer",
          company: "Gamma Labs",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://himalayas.app/jobs/3",
        },
        {
          source: "manual",
          sourceJobId: `man_repo_${ts}_4`,
          title: "DevOps Engineer",
          company: "Delta Tech",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://example.com/jobs/4",
        },
      ])
      .returning();
    job1Id = j1.id;
    job2Id = j2.id;
    job3Id = j3.id;
    job4Id = j4.id;

    // 4. Applications for Candidate 1
    const [app1] = await db
      .insert(applications)
      .values({
        candidateProfileId: candidate1Id,
        jobId: job1Id,
        company: "Acme Corp",
        role: "Senior Backend Engineer",
        source: "remoteok",
        matchScore: "92.50",
        status: "OFFER",
        submittedAt: new Date(),
      })
      .returning();
    app1Id = app1.id;

    await db.insert(applications).values([
      {
        candidateProfileId: candidate1Id,
        jobId: job2Id,
        company: "Beta Systems",
        role: "Platform Engineer",
        source: "remoteok",
        matchScore: "86.00",
        status: "INTERVIEW_SCHEDULED",
        submittedAt: new Date(),
      },
      {
        candidateProfileId: candidate1Id,
        jobId: job3Id,
        company: "Gamma Labs",
        role: "Full Stack Engineer",
        source: "himalayas",
        matchScore: "74.00",
        status: "APPLIED",
        submittedAt: new Date(),
      },
      {
        candidateProfileId: candidate1Id,
        jobId: job4Id,
        company: "Delta Tech",
        role: "DevOps Engineer",
        source: "manual",
        matchScore: null, // Unscored
        status: "PREPARED",
      },
    ]);

    // Candidate 1 App 1 has multiple events, documents, and answers
    await db.insert(applicationEvents).values([
      {
        applicationId: app1Id,
        fromStatus: "PREPARED",
        toStatus: "APPLIED",
        eventType: "STATUS_CHANGE",
      },
      {
        applicationId: app1Id,
        fromStatus: "APPLIED",
        toStatus: "INTERVIEW_SCHEDULED",
        eventType: "STATUS_CHANGE",
      },
      {
        applicationId: app1Id,
        fromStatus: "INTERVIEW_SCHEDULED",
        toStatus: "OFFER",
        eventType: "STATUS_CHANGE",
      },
    ]);

    await db.insert(applicationDocuments).values([
      {
        applicationId: app1Id,
        documentType: "RESUME",
        fileName: "resume.pdf",
        storageKey: "resumes/resume.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      },
      {
        applicationId: app1Id,
        documentType: "COVER_LETTER",
        fileName: "cover.pdf",
        storageKey: "covers/cover.pdf",
        mimeType: "application/pdf",
        fileSize: 512,
      },
    ]);

    await db.insert(applicationAnswers).values([
      {
        applicationId: app1Id,
        question: "Years of experience?",
        answer: "7 years",
        confidence: "VERIFIED",
        isConfirmed: true,
      },
      {
        applicationId: app1Id,
        question: "Notice period?",
        answer: "2 weeks",
        confidence: "VERIFIED",
        isConfirmed: true,
      },
    ]);

    // 5. Applications for Candidate 2
    await db.insert(applications).values({
      candidateProfileId: candidate2Id,
      jobId: job1Id,
      company: "Acme Corp",
      role: "Staff Architect",
      source: "remoteok",
      matchScore: "62.00",
      status: "REJECTED",
      submittedAt: new Date(),
    });
  });

  await t.test("1. Candidate Isolation: Candidate A cannot see Candidate B applications", async () => {
    const overview1 = await analyticsRepository.getOverviewRaw(candidate1Id);
    const overview2 = await analyticsRepository.getOverviewRaw(candidate2Id);

    // Candidate 1 has 4 applications
    assert.equal(overview1.totalApplications, 4);
    assert.equal(overview1.offerCount, 1);
    assert.equal(overview1.interviewScheduledCount, 1);
    assert.equal(overview1.preparedCount, 1);
    assert.equal(overview1.rejectedCount, 0); // Candidate 2's rejection does NOT leak

    // Candidate 2 has 1 application
    assert.equal(overview2.totalApplications, 1);
    assert.equal(overview2.rejectedCount, 1);
    assert.equal(overview2.offerCount, 0);
  });

  await t.test("2. No Double Counting Invariant: Multiple events/docs/answers do NOT multiply count", async () => {
    const overview1 = await analyticsRepository.getOverviewRaw(candidate1Id);
    // Despite App 1 having 3 events, 2 docs, and 2 answers, total is strictly 4
    assert.equal(overview1.totalApplications, 4);
    assert.equal(overview1.appliedCount, 3); // 3 applied or beyond (Offer, Interview, Applied)

    const sources = await analyticsRepository.getSourcePerformanceRaw(candidate1Id);
    const remoteokSource = sources.find((s) => s.source === "remoteok");
    assert.ok(remoteokSource);
    // remoteok has 2 distinct applications for Candidate 1
    assert.equal(remoteokSource.totalApplications, 2);
    assert.equal(remoteokSource.offerCount, 1);
    assert.equal(remoteokSource.interviewCount, 2); // App1 reached offer, App2 reached interview
  });

  await t.test("3. Match Scores: Scored sum and count properly isolate unscored applications", async () => {
    const overview1 = await analyticsRepository.getOverviewRaw(candidate1Id);
    assert.equal(overview1.scoredCount, 3); // 92.50, 86.00, 74.00
    assert.equal(overview1.totalApplications, 4);
    // 92.50 + 86.00 + 74.00 = 252.5
    assert.equal(Math.round(overview1.totalScoreSum * 10), 2525);
  });

  await t.test("4. Score Bands: Truthfully buckets into non-causal score ranges", async () => {
    const bands = await analyticsRepository.getScoreBandsRaw(candidate1Id);

    const band85to100 = bands.find((b) => b.band === "85-100");
    const band60to74 = bands.find((b) => b.band === "60-74");
    const bandUnscored = bands.find((b) => b.band === "UNSCORED");

    assert.ok(band85to100);
    assert.equal(band85to100.totalApplications, 2); // 92.5 and 86.0
    assert.equal(band85to100.interviewCount, 2);
    assert.equal(band85to100.offerCount, 1);

    assert.ok(band60to74);
    assert.equal(band60to74.totalApplications, 1); // 74.0
    assert.equal(band60to74.interviewCount, 0);

    assert.ok(bandUnscored);
    assert.equal(bandUnscored.totalApplications, 1); // null
    assert.equal(bandUnscored.interviewCount, 0);
  });

  await t.test("5. Funnel Raw Breakdown: Accurate milestone state counts", async () => {
    const funnel = await analyticsRepository.getFunnelRaw(candidate1Id);
    assert.equal(funnel.totalApplications, 4);
    assert.equal(funnel.preparedCount, 1);
    assert.equal(funnel.appliedCount, 3);
    assert.equal(funnel.interviewScheduledCount, 1);
    assert.equal(funnel.offerCount, 1);
    assert.equal(funnel.rejectedCount, 0);
  });

  await t.test("6. Role Breakdown: Correct grouped counts by role", async () => {
    const roles = await analyticsRepository.getRolePerformanceRaw(candidate1Id);
    assert.equal(roles.length, 4);
    const backend = roles.find((r) => r.role === "Senior Backend Engineer");
    assert.ok(backend);
    assert.equal(backend.totalApplications, 1);
    assert.equal(backend.offerCount, 1);
  });

  await t.test("7. Empty State: Candidate with zero applications returns zero counts", async () => {
    const emptyOverview = await analyticsRepository.getOverviewRaw(emptyCandidateId);
    assert.equal(emptyOverview.totalApplications, 0);
    assert.equal(emptyOverview.appliedCount, 0);
    assert.equal(emptyOverview.scoredCount, 0);
    assert.equal(emptyOverview.totalScoreSum, 0);

    const emptyBands = await analyticsRepository.getScoreBandsRaw(emptyCandidateId);
    assert.equal(emptyBands.length, 0);

    const emptySources = await analyticsRepository.getSourcePerformanceRaw(emptyCandidateId);
    assert.equal(emptySources.length, 0);

    const emptyRoles = await analyticsRepository.getRolePerformanceRaw(emptyCandidateId);
    assert.equal(emptyRoles.length, 0);
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(users).where(eq(users.id, user1Id));
    await db.delete(users).where(eq(users.id, user2Id));
    await db.delete(users).where(eq(users.id, emptyUserId));
    await db.delete(jobs).where(eq(jobs.id, job1Id));
    await db.delete(jobs).where(eq(jobs.id, job2Id));
    await db.delete(jobs).where(eq(jobs.id, job3Id));
    await db.delete(jobs).where(eq(jobs.id, job4Id));
  });
});
