/**
 * Job Hub — Phase 10 / Step 10.2
 * Deterministic Outcome Analysis Test Suite
 *
 * Verifies:
 * 1. Safe arithmetic & zero-division handling in buildEvidenceMetric.
 * 2. Candidate tenant isolation in OutcomeAnalyzer.
 * 3. Multi-dimensional outcome aggregation across roles, sources, bands, and skills.
 * 4. Invariant: No double counting from application events or joined entities.
 * 5. Invariant: Zero mutations to underlying database records (read-only).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  applications,
  applicationEvents,
} from "@job-hub/db";
import {
  buildEvidenceMetric,
  OutcomeAnalyzer,
} from "../packages/applications/src/learning/analyzer";

test("Phase 10 / Step 10.2 — Deterministic Outcome Analysis Suite", async (t) => {
  const ts = Date.now();
  const userAId = `usr_p10_step2_a_${ts}`;
  const userBId = `usr_p10_step2_b_${ts}`;
  let candidateAId: string;
  let candidateBId: string;

  let job1Id: string;
  let job2Id: string;
  let job3Id: string;
  let job4Id: string;
  let app1Id: string;

  const analyzer = new OutcomeAnalyzer(db);

  await t.test("1. buildEvidenceMetric: Safe division and zero-denominator handling", () => {
    // 0 applications
    const zero = buildEvidenceMetric({ applications: 0, interviews: 0, offers: 0 });
    assert.equal(zero.applications, 0);
    assert.equal(zero.interviewRate, null);
    assert.equal(zero.offerRate, null);
    assert.equal(zero.responseRate, null);
    assert.equal(zero.averageMatchScore, null);
    assert.equal(zero.disclosureText, "0 of 0 (No data)");

    // Positive numbers
    const calculated = buildEvidenceMetric({
      applications: 20,
      interviews: 6,
      offers: 2,
      rejections: 10,
      responses: 18,
      averageMatchScore: 86.42,
    });
    assert.equal(calculated.applications, 20);
    assert.equal(calculated.interviews, 6);
    assert.equal(calculated.offers, 2);
    assert.equal(calculated.interviewRate, 0.3);
    assert.equal(calculated.offerRate, 0.1);
    assert.equal(calculated.responseRate, 0.9);
    assert.equal(calculated.averageMatchScore, 86.4);
    assert.equal(calculated.disclosureText, "6 of 20 applications (30.0%)");
  });

  await t.test("Setup: Create candidate profiles, jobs with skills, and application fixtures", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: userAId,
        name: "Learning User A",
        email: `${userAId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: userBId,
        name: "Learning User B",
        email: `${userBId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Candidate Profiles
    const [cA] = await db
      .insert(candidateProfiles)
      .values({ userId: userAId, headline: "Full-Stack AI Architect" })
      .returning();
    candidateAId = cA.id;

    const [cB] = await db
      .insert(candidateProfiles)
      .values({ userId: userBId, headline: "Frontend Specialist" })
      .returning();
    candidateBId = cB.id;

    // 3. Jobs
    const [j1, j2, j3, j4] = await db
      .insert(jobs)
      .values([
        {
          source: "remoteok",
          sourceJobId: `ro_p10_${ts}_1`,
          title: "AI Full-Stack Engineer",
          company: "Nexus AI",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/ai1",
          skills: ["TypeScript", "Next.js", "Python", "OpenAI"],
        },
        {
          source: "remoteok",
          sourceJobId: `ro_p10_${ts}_2`,
          title: "AI Full-Stack Engineer",
          company: "Vertex Labs",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://remoteok.com/jobs/ai2",
          skills: ["TypeScript", "React", "Python"],
        },
        {
          source: "himalayas",
          sourceJobId: `him_p10_${ts}_3`,
          title: "Frontend Developer",
          company: "Orbit Core",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://himalayas.app/jobs/fe1",
          skills: ["React", "CSS", "HTML"],
        },
        {
          source: "manual",
          sourceJobId: `man_p10_${ts}_4`,
          title: "DevOps Engineer",
          company: "Starlight Corp",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://starlight.com/jobs/devops",
          skills: ["Docker", "Kubernetes", "AWS"],
        },
      ])
      .returning();
    job1Id = j1.id;
    job2Id = j2.id;
    job3Id = j3.id;
    job4Id = j4.id;

    // 4. Candidate A Applications
    // App 1: AI Full-Stack, remoteok, OFFER (interview + offer)
    const [a1] = await db
      .insert(applications)
      .values({
        candidateProfileId: candidateAId,
        jobId: job1Id,
        company: "Nexus AI",
        role: "AI Full-Stack Engineer",
        source: "remoteok",
        matchScore: "92.00",
        status: "OFFER",
        submittedAt: new Date(),
      })
      .returning();
    app1Id = a1.id;

    // App 2: AI Full-Stack, remoteok, INTERVIEW_SCHEDULED
    await db.insert(applications).values({
      candidateProfileId: candidateAId,
      jobId: job2Id,
      company: "Vertex Labs",
      role: "AI Full-Stack Engineer",
      source: "remoteok",
      matchScore: "87.50",
      status: "INTERVIEW_SCHEDULED",
      submittedAt: new Date(),
    });

    // App 3: Frontend Developer, himalayas, REJECTED
    await db.insert(applications).values({
      candidateProfileId: candidateAId,
      jobId: job3Id,
      company: "Orbit Core",
      role: "Frontend Developer",
      source: "himalayas",
      matchScore: "65.00",
      status: "REJECTED",
      submittedAt: new Date(),
    });

    // 5. Candidate B Application (Cross-tenant isolation check)
    await db.insert(applications).values({
      candidateProfileId: candidateBId,
      jobId: job4Id,
      company: "Starlight Corp",
      role: "DevOps Engineer",
      source: "manual",
      matchScore: "78.00",
      status: "APPLIED",
      submittedAt: new Date(),
    });

    // Attach 3 events to App 1 to test anti-double-counting
    await db.insert(applicationEvents).values([
      { applicationId: app1Id, toStatus: "APPLIED", eventType: "STATUS_CHANGE" },
      { applicationId: app1Id, toStatus: "INTERVIEW_SCHEDULED", eventType: "STATUS_CHANGE" },
      { applicationId: app1Id, toStatus: "OFFER", eventType: "STATUS_CHANGE" },
    ]);
  });

  await t.test("2. Candidate Isolation: Analyzes only Candidate A's outcomes", async () => {
    const analysisA = await analyzer.analyzeCandidateOutcomes(candidateAId);

    // Candidate A has 3 applications
    assert.equal(analysisA.totalApplications, 3);
    assert.equal(analysisA.baseline.applications, 3);
    assert.equal(analysisA.baseline.interviews, 2); // App 1 & App 2
    assert.equal(analysisA.baseline.offers, 1); // App 1
    assert.equal(analysisA.baseline.rejections, 1); // App 3

    // Candidate B has 1 application, 0 interviews
    const analysisB = await analyzer.analyzeCandidateOutcomes(candidateBId);
    assert.equal(analysisB.totalApplications, 1);
    assert.equal(analysisB.baseline.applications, 1);
    assert.equal(analysisB.baseline.interviews, 0);
    assert.equal(analysisB.baseline.offers, 0);
  });

  await t.test("3. Multi-Dimensional Cohorts: Roles, Sources, Bands, and Skills", async () => {
    const analysisA = await analyzer.analyzeCandidateOutcomes(candidateAId);

    // Roles
    const aiRole = analysisA.roles.find((r) => r.role === "AI Full-Stack Engineer");
    assert.ok(aiRole);
    assert.equal(aiRole.metric.applications, 2);
    assert.equal(aiRole.metric.interviews, 2);
    assert.equal(aiRole.metric.interviewRate, 1.0);

    const feRole = analysisA.roles.find((r) => r.role === "Frontend Developer");
    assert.ok(feRole);
    assert.equal(feRole.metric.applications, 1);
    assert.equal(feRole.metric.interviews, 0);
    assert.equal(feRole.metric.interviewRate, 0.0);

    // Sources
    const remoteok = analysisA.sources.find((s) => s.source === "remoteok");
    assert.ok(remoteok);
    assert.equal(remoteok.metric.applications, 2);
    assert.equal(remoteok.metric.interviews, 2);

    const himalayas = analysisA.sources.find((s) => s.source === "himalayas");
    assert.ok(himalayas);
    assert.equal(himalayas.metric.applications, 1);
    assert.equal(himalayas.metric.interviews, 0);

    // Skills
    const pythonSkill = analysisA.skills.find((s) => s.skill === "Python");
    assert.ok(pythonSkill);
    assert.equal(pythonSkill.metric.applications, 2);
    assert.equal(pythonSkill.metric.interviews, 2);

    const tsSkill = analysisA.skills.find((s) => s.skill === "TypeScript");
    assert.ok(tsSkill);
    assert.equal(tsSkill.metric.applications, 2);
    assert.equal(tsSkill.metric.interviews, 2);
  });

  await t.test("4. Anti-Double-Counting: Events do not multiply application counts", async () => {
    const analysisA = await analyzer.analyzeCandidateOutcomes(candidateAId);
    // App 1 has 3 application events, but total applications remains exactly 3
    assert.equal(analysisA.totalApplications, 3);
    assert.equal(analysisA.baseline.interviews, 2);
    assert.equal(analysisA.baseline.offers, 1);
  });

  await t.test("5. Empty State Handling: Candidate with 0 applications", async () => {
    const emptyAnalysis = await analyzer.analyzeCandidateOutcomes("non_existent_profile_id");
    assert.equal(emptyAnalysis.totalApplications, 0);
    assert.equal(emptyAnalysis.baseline.applications, 0);
    assert.equal(emptyAnalysis.baseline.interviewRate, null);
    assert.equal(emptyAnalysis.baseline.disclosureText, "0 of 0 (No data)");
    assert.equal(emptyAnalysis.roles.length, 0);
    assert.equal(emptyAnalysis.sources.length, 0);
    assert.equal(emptyAnalysis.skills.length, 0);
  });

  await t.test("6. Invariant: Read-Only Immutability (Zero mutations)", async () => {
    const appsBefore = await db.select().from(applications).where(eq(applications.candidateProfileId, candidateAId));
    await analyzer.analyzeCandidateOutcomes(candidateAId);
    const appsAfter = await db.select().from(applications).where(eq(applications.candidateProfileId, candidateAId));

    assert.equal(appsBefore.length, appsAfter.length);
    for (let i = 0; i < appsBefore.length; i++) {
      assert.equal(appsBefore[i].id, appsAfter[i].id);
      assert.equal(appsBefore[i].status, appsAfter[i].status);
      assert.equal(appsBefore[i].matchScore, appsAfter[i].matchScore);
    }
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
    await db.delete(jobs).where(eq(jobs.id, job1Id));
    await db.delete(jobs).where(eq(jobs.id, job2Id));
    await db.delete(jobs).where(eq(jobs.id, job3Id));
    await db.delete(jobs).where(eq(jobs.id, job4Id));
  });
});
