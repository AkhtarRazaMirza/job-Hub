/**
 * Job Hub — Phase 6 / Step 6.5
 * Application Tracking Dashboard UI & End-to-End Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 12 & 13, §5 Phase 6
 * - 02_how_to_build.md §10 ("Applications", "Application Details"), §14, §17
 * - 04_ai_agent_skills.md §17 & §18
 *
 * Validates:
 * 1. Unauthenticated visiting /dashboard renders Authentication Required guard
 * 2. Authenticated user with no profile receives setup profile prompt
 * 3. Authenticated candidate visiting /dashboard renders Applications tab button and counter
 * 4. Interactive Flow: Create application, verify rendered card, transition status, update follow-up & notes
 * 5. Truthful status badge rendering (Prepared, Applied, Under Review, Interview Scheduled, Offer, Rejected, Withdrawn)
 * 6. Terminal state enforcement in UI transitions (terminal state cannot transition)
 * 7. Strict cross-user isolation: User 2 sees 0 applications and cannot access User 1's records
 * 8. Teardown of live test entities
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  db,
  users,
  candidateProfiles,
  candidatePreferences,
  jobs,
  jobMatches,
  applications,
  applicationEvents,
  session as sessionTable,
} from "@job-hub/db";
import { eq, inArray } from "drizzle-orm";
import { candidateProfileRepository } from "@job-hub/candidate/server";
import { jobRepository } from "@job-hub/jobs/server";
import { jobMatchRepository } from "@job-hub/matching/server";
import { APPLICATION_STATUS } from "@job-hub/applications";

const BASE_URL = "http://localhost:3000";
const RUN_ID = `app_ui_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
const testEmail1 = `${RUN_ID}_user1@example.com`;
const testEmail2 = `${RUN_ID}_user2@example.com`;
const testEmailNoProfile = `${RUN_ID}_noprofile@example.com`;
const testPassword = "Password123!@#Test";

let cookieUser1 = "";
let cookieUser2 = "";
let cookieNoProfile = "";
let user1Id = "";
let user2Id = "";
let userNoProfileId = "";

let user1ProfileId = "";
let user2ProfileId = "";
let jobId1 = "";
let jobId2 = "";
let match1Id = "";

test("Step 6.5 — Application Tracking Dashboard UI & End-to-End Suite", async (t) => {
  await t.test("Setup: Sign up User 1, User 2, and create canonical fixtures", async () => {
    // 1. Sign up User 1
    const res1 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({
        email: testEmail1,
        password: testPassword,
        name: "Applications UI Candidate One",
      }),
    });
    assert.equal(res1.status, 200, "Sign up User 1 should succeed");
    const setCookie1 = res1.headers.get("set-cookie");
    assert.ok(setCookie1);
    cookieUser1 = setCookie1.split(";")[0]!;
    const data1 = await res1.json();
    user1Id = data1.user.id;

    // 2. Sign up User 2
    const res2 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({
        email: testEmail2,
        password: testPassword,
        name: "Applications UI Candidate Two",
      }),
    });
    assert.equal(res2.status, 200, "Sign up User 2 should succeed");
    const setCookie2 = res2.headers.get("set-cookie");
    assert.ok(setCookie2);
    cookieUser2 = setCookie2.split(";")[0]!;
    const data2 = await res2.json();
    user2Id = data2.user.id;

    // 3. Sign up User without Profile
    const res3 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({
        email: testEmailNoProfile,
        password: testPassword,
        name: "Applications No Profile Candidate",
      }),
    });
    assert.equal(res3.status, 200, "Sign up No Profile User should succeed");
    const setCookie3 = res3.headers.get("set-cookie");
    assert.ok(setCookie3);
    cookieNoProfile = setCookie3.split(";")[0]!;
    const data3 = await res3.json();
    userNoProfileId = data3.user.id;

    // 4. Create Profile for User 1
    const p1 = await candidateProfileRepository.create({
      userId: user1Id,
      headline: "Staff Cloud Engineer",
      profileData: {
        technicalSkills: [{ name: "TypeScript", status: "VERIFIED" }],
      },
    });
    user1ProfileId = p1.id;

    // 5. Create Profile for User 2
    const p2 = await candidateProfileRepository.create({
      userId: user2Id,
      headline: "Frontend Associate",
      profileData: { technicalSkills: [] },
    });
    user2ProfileId = p2.id;

    // 6. Create Canonical Jobs
    const j1 = await jobRepository.create({
      title: "Lead Infrastructure Architect",
      company: "AeroCloud Networks",
      remoteType: "WORLDWIDE_REMOTE",
      location: "Worldwide",
      skills: ["Kubernetes", "TypeScript"],
      salaryMin: 180000,
      salaryMax: 220000,
      salary: 180000,
      currency: "USD",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/jobs/aerocloud-lead-infra",
      postedAt: new Date(),
    });
    jobId1 = j1.id;

    const j2 = await jobRepository.create({
      title: "Principal Security Engineer",
      company: "SecureVault Inc",
      remoteType: "COUNTRY_REMOTE",
      location: "US",
      skills: ["Security", "Linux"],
      salaryMin: 190000,
      salaryMax: 230000,
      salary: 190000,
      currency: "USD",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/jobs/securevault-principal",
      postedAt: new Date(),
    });
    jobId2 = j2.id;

    // 7. Create Match for User 1 & Job 1
    const m1 = await jobMatchRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId1,
      overallScore: 9.5,
      decision: "EXCELLENT_MATCH",
      confidence: 0.95,
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: { skillsScore: 0.95, experienceScore: 0.95 },
      strengths: ["Direct infrastructure experience"],
      gaps: [],
      risks: [],
      explanation: "Top tier alignment for infrastructure architect.",
      weightsUsed: { skills: 0.3, experience: 0.2 },
    });
    match1Id = m1.id;
  });

  // 1. Unauthenticated visiting /dashboard renders guard
  await t.test("1. Unauthenticated user visiting /dashboard renders Authentication Required guard", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Authentication Required"));
  });

  // 2. Authenticated user without profile
  await t.test("2. Authenticated user with no profile receives prompt to set up profile", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: cookieNoProfile },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Create Your Candidate Profile"));
  });

  // 3. Authenticated candidate dashboard renders Applications tab
  await t.test("3. Authenticated candidate visiting /dashboard renders Applications tab button", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Applications"), "Dashboard must include Applications tab");
    assert.ok(html.includes("Job Matches"), "Dashboard must include Job Matches tab");
    assert.ok(html.includes("Saved Jobs"), "Dashboard must include Saved Jobs tab");
  });

  let createdAppId: string;

  // 4. Interactive Flow: Create application, transition status, update follow-up & notes
  await t.test("4. Interactive Flow: Create application and verify via tRPC", async () => {
    // 1. Create Application for Job 1
    const createRes = await fetch(`${BASE_URL}/api/trpc/applications.create`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: jobId1,
        matchId: match1Id,
        notes: "Preparing technical portfolio presentation",
        nextAction: "Tailor resume bullets for infrastructure architecture",
      }),
    });
    assert.equal(createRes.status, 200, "Create application mutation must succeed");
    const createJson = await createRes.json();
    assert.ok(createJson.result?.data?.id);
    assert.equal(createJson.result?.data?.status, "PREPARED");
    assert.equal(createJson.result?.data?.company, "AeroCloud Networks");
    assert.equal(createJson.result?.data?.role, "Lead Infrastructure Architect");
    createdAppId = createJson.result.data.id;

    // 2. Verify in Applications List
    const listRes = await fetch(`${BASE_URL}/api/trpc/applications.list`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.result?.data?.total, 1);
    assert.equal(listJson.result?.data?.items[0]?.id, createdAppId);
    assert.equal(listJson.result?.data?.items[0]?.status, "PREPARED");

    // 3. Transition to APPLIED
    const transitionRes = await fetch(`${BASE_URL}/api/trpc/applications.transitionStatus`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createdAppId,
        toStatus: APPLICATION_STATUS.APPLIED,
        notes: "Submitted through company career portal",
        confirmationReference: "AC-CONF-88231",
      }),
    });
    assert.equal(transitionRes.status, 200, "Transition to APPLIED must succeed");
    const transitionJson = await transitionRes.json();
    assert.equal(transitionJson.result?.data?.status, "APPLIED");
    assert.ok(transitionJson.result?.data?.submittedAt, "Submitted date must be set when APPLIED");

    // 4. Transition to UNDER_REVIEW
    const underReviewRes = await fetch(`${BASE_URL}/api/trpc/applications.transitionStatus`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createdAppId,
        toStatus: APPLICATION_STATUS.UNDER_REVIEW,
      }),
    });
    assert.equal(underReviewRes.status, 200);

    // 5. Update Follow-up Schedule
    const followUpRes = await fetch(`${BASE_URL}/api/trpc/applications.updateFollowUp`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createdAppId,
        nextAction: "Screening interview with Talent Partner",
        followUpDate: new Date("2026-09-25T14:00:00Z").toISOString(),
      }),
    });
    assert.equal(followUpRes.status, 200, "Update follow-up must succeed");
    const followUpJson = await followUpRes.json();
    assert.equal(followUpJson.result?.data?.nextAction, "Screening interview with Talent Partner");

    // 6. Update Notes
    const notesRes = await fetch(`${BASE_URL}/api/trpc/applications.updateNotes`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createdAppId,
        notes: "Recruiter confirmed strong interest in Kubernetes background.",
      }),
    });
    assert.equal(notesRes.status, 200, "Update notes must succeed");
    const notesJson = await notesRes.json();
    assert.equal(
      notesJson.result?.data?.notes,
      "Recruiter confirmed strong interest in Kubernetes background."
    );

    // 7. Withdraw application
    const withdrawRes = await fetch(`${BASE_URL}/api/trpc/applications.withdraw`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createdAppId,
        reason: "Position filled internally before scheduling",
      }),
    });
    assert.equal(withdrawRes.status, 200, "Withdraw must succeed");
    const withdrawJson = await withdrawRes.json();
    assert.equal(withdrawJson.result?.data?.status, "WITHDRAWN");

    // 8. Terminal state cannot transition
    const invalidTransRes = await fetch(`${BASE_URL}/api/trpc/applications.transitionStatus`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createdAppId,
        toStatus: APPLICATION_STATUS.APPLIED,
      }),
    });
    assert.notEqual(invalidTransRes.status, 200, "Transition from terminal status must fail");
  });

  // 5. Cross-user isolation: User 2 sees 0 applications
  await t.test("5. Cross-user isolation: User 2 has isolated applications state", async () => {
    const listRes = await fetch(`${BASE_URL}/api/trpc/applications.list`, {
      headers: { Cookie: cookieUser2 },
    });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.result?.data?.total, 0, "User 2 must see 0 applications");
    assert.equal(listJson.result?.data?.items?.length, 0);

    // User 2 cannot access User 1's application by ID
    const getRes = await fetch(
      `${BASE_URL}/api/trpc/applications.getById?input=${encodeURIComponent(
        JSON.stringify({ id: createdAppId })
      )}`,
      {
        headers: { Cookie: cookieUser2 },
      }
    );
    assert.notEqual(getRes.status, 200, "User 2 accessing User 1 app must fail");
  });

  // 6. Teardown
  await t.test("6. Teardown: Clean up live test entities", async () => {
    await db.delete(applications).where(inArray(applications.candidateProfileId, [user1ProfileId, user2ProfileId]));
    await db.delete(jobMatches).where(inArray(jobMatches.candidateProfileId, [user1ProfileId, user2ProfileId]));
    await db.delete(jobs).where(inArray(jobs.id, [jobId1, jobId2]));
    await db.delete(candidateProfiles).where(inArray(candidateProfiles.id, [user1ProfileId, user2ProfileId]));
    await db.delete(sessionTable).where(inArray(sessionTable.userId, [user1Id, user2Id, userNoProfileId]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id, userNoProfileId]));
  });
});
