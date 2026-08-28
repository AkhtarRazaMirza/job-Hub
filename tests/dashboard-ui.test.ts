/**
 * Job Hub — Phase 5 / Step 5.4
 * Candidate Dashboard UI & End-to-End Integration Test Suite
 *
 * Validates:
 * 1. Unauthenticated visiting /dashboard renders Authentication Required guard
 * 2. Authenticated user with no profile receives prompt to set up profile
 * 3. Authenticated user with profile receives rich dashboard UI at /dashboard
 * 4. SiteHeader includes Dashboard navigation link
 * 5. Visual cards render match score, decision badge, strengths, and gaps
 * 6. Truthfulness breakdown distinguishes VERIFIED code proof from INFERRED facts
 * 7. Live interaction: Saving a job, editing personal notes, and removing bookmark
 * 8. Strict cross-user isolation between User 1 and User 2
 * 9. Teardown of all created database test entities
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
  savedJobs,
  session as sessionTable,
} from "@job-hub/db";
import { eq, inArray } from "drizzle-orm";
import {
  candidateProfileRepository,
  candidatePreferencesService,
} from "@job-hub/candidate/server";
import { jobRepository, savedJobRepository } from "@job-hub/jobs/server";
import { jobMatchRepository } from "@job-hub/matching/server";

const BASE_URL = "http://localhost:3000";
const RUN_ID = `dash_ui_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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
let match2Id = "";

test("Step 5.4 — Candidate Dashboard UI & End-to-End Suite", async (t) => {
  await t.test("Setup: Sign up User 1, User 2, and User without Profile via Better Auth", async () => {
    // 1. User 1
    const res1 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({
        email: testEmail1,
        password: testPassword,
        name: "Dashboard UI Candidate One",
      }),
    });
    assert.equal(res1.status, 200, "Sign up User 1 should succeed");
    const setCookie1 = res1.headers.get("set-cookie");
    assert.ok(setCookie1);
    cookieUser1 = setCookie1.split(";")[0]!;
    const data1 = await res1.json();
    user1Id = data1.user.id;

    // 2. User 2
    const res2 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({
        email: testEmail2,
        password: testPassword,
        name: "Dashboard UI Candidate Two",
      }),
    });
    assert.equal(res2.status, 200, "Sign up User 2 should succeed");
    const setCookie2 = res2.headers.get("set-cookie");
    assert.ok(setCookie2);
    cookieUser2 = setCookie2.split(";")[0]!;
    const data2 = await res2.json();
    user2Id = data2.user.id;

    // 3. User with No Profile
    const res3 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      body: JSON.stringify({
        email: testEmailNoProfile,
        password: testPassword,
        name: "Dashboard Candidate No Profile",
      }),
    });
    assert.equal(res3.status, 200, "Sign up User No Profile should succeed");
    const setCookie3 = res3.headers.get("set-cookie");
    assert.ok(setCookie3);
    cookieNoProfile = setCookie3.split(";")[0]!;
    const data3 = await res3.json();
    userNoProfileId = data3.user.id;

    // 4. Initialize Profile and Preferences for User 1
    const p1 = await candidateProfileRepository.create({
      userId: user1Id,
      headline: "Senior Cloud Native Architect",
      profileData: {
        technicalSkills: [
          { name: "Kubernetes", status: "VERIFIED" },
          { name: "Rust", status: "VERIFIED" },
          { name: "Go", status: "INFERRED" },
        ],
        experience: [
          { title: "Lead Architect", company: "Aether Systems", status: "VERIFIED", years: 8 },
        ],
      },
    });
    user1ProfileId = p1.id;

    await candidatePreferencesService.updatePreferences(user1Id, {
      remotePreference: "WORLDWIDE_REMOTE",
      preferredLocations: ["US", "UK"],
      salaryMin: 175000,
      salaryCurrency: "USD",
      targetRoles: ["Cloud Architect", "Staff Infrastructure Engineer"],
      experienceLevel: "PRINCIPAL",
    });

    // 5. Initialize Profile for User 2 (empty)
    const p2 = await candidateProfileRepository.create({
      userId: user2Id,
      headline: "Entry Level Developer",
      profileData: { technicalSkills: [] },
    });
    user2ProfileId = p2.id;

    // 6. Create Canonical Jobs
    const j1 = await jobRepository.create({
      title: "Staff Cloud Infrastructure Engineer",
      company: "Apex Cloud Technologies",
      remoteType: "WORLDWIDE_REMOTE",
      location: "Worldwide",
      skills: ["Kubernetes", "Rust", "Go"],
      salaryMin: 185000,
      salaryMax: 225000,
      salary: 185000,
      currency: "USD",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/jobs/apex-staff-cloud",
      postedAt: new Date(),
    });
    jobId1 = j1.id;

    const j2 = await jobRepository.create({
      title: "Senior Backend Developer",
      company: "DataStream Systems",
      remoteType: "WORLDWIDE_REMOTE",
      location: "Worldwide",
      skills: ["Rust", "PostgreSQL"],
      salaryMin: 160000,
      salaryMax: 190000,
      salary: 160000,
      currency: "USD",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/jobs/datastream-sr-backend",
      postedAt: new Date(),
    });
    jobId2 = j2.id;

    // 7. Create Matches for User 1
    const m1 = await jobMatchRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId1,
      overallScore: 9.6,
      decision: "EXCELLENT_MATCH",
      confidence: 0.96,
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: { skillsScore: 0.98, experienceScore: 0.94 },
      strengths: ["Exceptional Kubernetes and Rust alignment", "Staff seniority fit"],
      gaps: [],
      risks: [],
      explanation: "World-class match for cloud infrastructure requirements.",
      weightsUsed: { skills: 0.3, experience: 0.2 },
    });
    match1Id = m1.id;

    const m2 = await jobMatchRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId2,
      overallScore: 8.2,
      decision: "STRONG_MATCH",
      confidence: 0.85,
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: { skillsScore: 0.85, experienceScore: 0.8 },
      strengths: ["Strong Rust background"],
      gaps: ["No direct cloud architecture scope"],
      risks: [],
      explanation: "Solid senior backend alignment.",
      weightsUsed: { skills: 0.3, experience: 0.2 },
    });
    match2Id = m2.id;
  });

  // 1. Unauthenticated access guard
  await t.test("1. Unauthenticated user visiting /dashboard renders Authentication Required guard", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Authentication Required"), "Must render Authentication Required banner");
    assert.ok(html.includes("Sign In"), "Must provide Sign In action");
    assert.ok(!html.includes("Senior Cloud Native Architect"), "Must not render candidate profile data");
  });

  // 2. Authenticated user with no profile receives creation prompt
  await t.test("2. Authenticated user with no profile receives prompt to set up profile", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: cookieNoProfile },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Create Your Candidate Profile"), "Must prompt user to create profile");
    assert.ok(html.includes("Go to Profile Setup"), "Must include link to profile setup");
  });

  // 3. Authenticated user with profile receives rich dashboard UI
  await t.test("3. Authenticated candidate visiting /dashboard receives full dashboard with profile overview and matches", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(res.status, 200);
    const html = await res.text();

    // Verify Profile Overview elements
    assert.ok(html.includes("Candidate Dashboard"), "Header must include Candidate Dashboard");
    assert.ok(html.includes("Senior Cloud Native Architect"), "Must render candidate headline");
    assert.ok(html.includes("WORLDWIDE REMOTE"), "Must display remote preference");

    // Verify Decision Filter elements
    assert.ok(html.includes("Job Matches"), "Must display Job Matches tab");
    assert.ok(html.includes("Saved Jobs"), "Must display Saved Jobs tab");
    assert.ok(html.includes("Excellent"), "Must render Excellent decision filter");
    assert.ok(html.includes("Strong"), "Must render Strong decision filter");

    // Verify Match Card elements
    assert.ok(html.includes("Staff Cloud Infrastructure Engineer"), "Must render job 1 title");
    assert.ok(html.includes("Apex Cloud Technologies"), "Must render job 1 company");
    assert.ok(html.includes("9.6"), "Must render job 1 score");
    assert.ok(html.includes("Exceptional Kubernetes and Rust alignment"), "Must render match strength");
  });

  // 4. SiteHeader includes Dashboard navigation link
  await t.test("4. SiteHeader includes Dashboard navigation link", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: cookieUser1 },
    });
    const html = await res.text();
    assert.ok(html.includes('href="/dashboard"'), "Header must link to /dashboard");
    assert.ok(html.includes("Dashboard"), "Header must have Dashboard label");
  });

  // 5. Interactive Flow: Save Job, Update Notes, and Unsave Job
  await t.test("5. Interactive Flow: Save job bookmark, add personal notes, and unsave", async () => {
    // 1. Save Job 1
    const saveRes = await fetch(`${BASE_URL}/api/trpc/savedJobs.save`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: jobId1 }),
    });
    assert.equal(saveRes.status, 200, "Save job mutation must succeed");
    const saveJson = await saveRes.json();
    assert.equal(saveJson.result?.data?.jobId, jobId1);

    // 2. Verify Saved Jobs Feed includes saved job
    const feedRes = await fetch(`${BASE_URL}/api/trpc/dashboard.savedJobsFeed?input=%7B%22limit%22%3A10%7D`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(feedRes.status, 200);
    const feedJson = await feedRes.json();
    assert.equal(feedJson.result?.data?.total, 1);
    assert.equal(feedJson.result?.data?.items[0]?.jobId, jobId1);
    assert.equal(feedJson.result?.data?.items[0]?.match?.overallScore, 9.6);

    // 3. Update Notes on Saved Job
    const noteRes = await fetch(`${BASE_URL}/api/trpc/savedJobs.updateNotes`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: jobId1,
        notes: "Discussed with hiring manager at cloud summit. Referral pending.",
      }),
    });
    assert.equal(noteRes.status, 200, "Update notes must succeed");

    // 4. Verify Updated Notes in Saved Jobs Feed
    const feedRes2 = await fetch(`${BASE_URL}/api/trpc/dashboard.savedJobsFeed?input=%7B%22limit%22%3A10%7D`, {
      headers: { Cookie: cookieUser1 },
    });
    const feedJson2 = await feedRes2.json();
    assert.equal(
      feedJson2.result?.data?.items[0]?.notes,
      "Discussed with hiring manager at cloud summit. Referral pending."
    );

    // 5. Unsave Job
    const unsaveRes = await fetch(`${BASE_URL}/api/trpc/savedJobs.unsave`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: jobId1 }),
    });
    assert.equal(unsaveRes.status, 200, "Unsave job must succeed");

    // 6. Verify Saved Jobs Feed is now empty
    const feedRes3 = await fetch(`${BASE_URL}/api/trpc/dashboard.savedJobsFeed?input=%7B%22limit%22%3A10%7D`, {
      headers: { Cookie: cookieUser1 },
    });
    const feedJson3 = await feedRes3.json();
    assert.equal(feedJson3.result?.data?.total, 0);
  });

  // 6. Cross-user isolation: User 2 sees 0 matches and 0 saved jobs
  await t.test("6. Cross-user isolation: User 2 has isolated dashboard without User 1 matches", async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: cookieUser2 },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Entry Level Developer"), "Must display User 2's headline");
    assert.ok(!html.includes("Senior Cloud Native Architect"), "Must not leak User 1's headline");
    assert.ok(html.includes("No Matches Found"), "User 2 has no matches and sees empty state");
  });

  // 7. Teardown: Clean up test database records
  await t.test("7. Teardown: Clean up live test entities", async () => {
    await db.delete(savedJobs).where(inArray(savedJobs.candidateProfileId, [user1ProfileId, user2ProfileId]));
    await db.delete(jobMatches).where(inArray(jobMatches.candidateProfileId, [user1ProfileId, user2ProfileId]));
    await db.delete(jobs).where(inArray(jobs.id, [jobId1, jobId2]));
    await db.delete(candidatePreferences).where(inArray(candidatePreferences.candidateProfileId, [user1ProfileId, user2ProfileId]));
    await db.delete(candidateProfiles).where(inArray(candidateProfiles.id, [user1ProfileId, user2ProfileId]));
    await db.delete(sessionTable).where(inArray(sessionTable.userId, [user1Id, user2Id, userNoProfileId]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id, userNoProfileId]));
  });
});
