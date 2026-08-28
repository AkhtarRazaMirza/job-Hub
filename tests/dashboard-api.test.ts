/**
 * Job Hub — Phase 5 / Step 5.3
 * Candidate Dashboard Data & Feed API Test Suite
 *
 * Validates:
 * 1. Authentication enforcement (401 UNAUTHORIZED on unauthenticated calls)
 * 2. Profile existence validation (404 NOT_FOUND when no profile exists)
 * 3. Cross-user isolation (User 2 cannot see or access User 1's dashboard)
 * 4. Spoofing protection (Injected userId or candidateProfileId rejected with 403 FORBIDDEN)
 * 5. Dashboard stats procedure (truthful counts across decision buckets & saved jobs)
 * 6. Dashboard overview procedure (aggregates profile, preferences, projects, truthfulness & stats)
 * 7. Matches feed procedure (pagination, decision filter, score filter, remote filter, and isSaved flag)
 * 8. Saved jobs feed procedure (pagination, joined canonical jobs, and candidate match evaluations)
 * 9. Response sanitization (no database secret leakage)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { TRPCError } from "@trpc/server";
import {
  db,
  users,
  candidateProfiles,
  candidatePreferences,
  jobs,
  jobMatches,
  savedJobs,
} from "@job-hub/db";
import { eq, inArray } from "drizzle-orm";
import {
  candidateProfileRepository,
  candidatePreferencesService,
} from "@job-hub/candidate/server";
import { jobRepository, savedJobRepository } from "@job-hub/jobs/server";
import { jobMatchRepository } from "@job-hub/matching/server";

function createMockContext(userId: string | null = "test_user_dash_1") {
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
  };
}

function isTRPCErrorWithCode(err: unknown, code: string, messageSubstring?: string): boolean {
  if (!err || typeof err !== "object") return false;
  const trpcErr = err as { code?: string; name?: string; message?: string };
  const hasCode = trpcErr.code === code;
  const isTRPC = trpcErr.name === "TRPCError" || err instanceof TRPCError;
  if (!hasCode || !isTRPC) return false;
  if (messageSubstring && typeof trpcErr.message === "string") {
    return trpcErr.message.toLowerCase().includes(messageSubstring.toLowerCase());
  }
  return true;
}

test("Step 5.3 — Candidate Dashboard Data & Feed API Test Suite", async (t) => {
  const user1Id = `usr_dash1_${Date.now()}`;
  const user2Id = `usr_dash2_${Date.now()}`;
  const userNoProfileId = `usr_dash_noprofile_${Date.now()}`;

  let user1ProfileId: string;
  let user2ProfileId: string;

  let jobId1: string; // EXCELLENT_MATCH, Saved
  let jobId2: string; // STRONG_MATCH, Not saved
  let jobId3: string; // REVIEW, Not saved, Hybrid
  let jobId4: string; // SKIP, Saved

  let match1Id: string;
  let match2Id: string;
  let match3Id: string;
  let match4Id: string;

  let saved1Id: string;
  let saved4Id: string;

  // Setup database records
  await t.test("Setup: Create users, candidate profiles, preferences, jobs, matches, and saved jobs in PostgreSQL", async () => {
    // 1. Create test users
    await db.insert(users).values([
      {
        id: user1Id,
        name: "Dashboard Candidate 1",
        email: `${user1Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: user2Id,
        name: "Dashboard Candidate 2",
        email: `${user2Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: userNoProfileId,
        name: "Candidate No Profile",
        email: `${userNoProfileId}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Create Candidate Profiles
    const p1 = await candidateProfileRepository.create({
      userId: user1Id,
      headline: "Senior Distributed Systems Engineer",
      profileData: {
        technicalSkills: [
          { name: "TypeScript", status: "VERIFIED" },
          { name: "Go", status: "VERIFIED" },
          { name: "PostgreSQL", status: "VERIFIED" },
        ],
        experience: [
          {
            title: "Staff Engineer",
            company: "Apex Core",
            status: "VERIFIED",
            years: 6,
          },
        ],
        education: [{ institution: "Tech Institute", degree: "B.S. CS" }],
      },
    });
    user1ProfileId = p1.id;

    const p2 = await candidateProfileRepository.create({
      userId: user2Id,
      headline: "Junior Frontend Engineer",
      profileData: {
        technicalSkills: [{ name: "JavaScript", status: "INFERRED" }],
      },
    });
    user2ProfileId = p2.id;

    // 3. Create Preferences for User 1
    await candidatePreferencesService.updatePreferences(user1Id, {
      remotePreference: "WORLDWIDE_REMOTE",
      preferredLocations: ["US", "DE"],
      salaryMin: 150000,
      salaryCurrency: "USD",
      targetRoles: ["Staff Engineer", "Distributed Systems Engineer"],
      experienceLevel: "SENIOR",
    });

    // 4. Create Canonical Jobs
    const j1 = await jobRepository.create({
      title: "Principal Distributed Systems Engineer",
      company: "Cloud Core Inc",
      remoteType: "WORLDWIDE_REMOTE",
      location: "Worldwide",
      skills: ["Go", "PostgreSQL", "Kubernetes"],
      salaryMin: 180000,
      salaryMax: 220000,
      salary: 180000,
      currency: "USD",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/apply/j1-dist-sys",
      postedAt: new Date(Date.now() - 3600000),
    });
    jobId1 = j1.id;

    const j2 = await jobRepository.create({
      title: "Senior Backend Developer",
      company: "ScaleFlow Tech",
      remoteType: "WORLDWIDE_REMOTE",
      location: "Worldwide",
      skills: ["TypeScript", "Node.js", "PostgreSQL"],
      salaryMin: 160000,
      salaryMax: 190000,
      salary: 160000,
      currency: "USD",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/apply/j2-scale-flow",
      postedAt: new Date(Date.now() - 7200000),
    });
    jobId2 = j2.id;

    const j3 = await jobRepository.create({
      title: "Cloud Infrastructure Architect",
      company: "Hybrid Enterprises",
      remoteType: "HYBRID",
      location: "Berlin, DE",
      skills: ["AWS", "Terraform", "Go"],
      salaryMin: 130000,
      salaryMax: 150000,
      salary: 130000,
      currency: "EUR",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/apply/j3-hybrid-infra",
      postedAt: new Date(Date.now() - 10800000),
    });
    jobId3 = j3.id;

    const j4 = await jobRepository.create({
      title: "Junior QA Automation Intern",
      company: "TestLab Global",
      remoteType: "ONSITE",
      location: "New York, NY",
      skills: ["Selenium"],
      salaryMin: 50000,
      salaryMax: 60000,
      salary: 50000,
      currency: "USD",
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/apply/j4-qa-intern",
      postedAt: new Date(Date.now() - 14400000),
    });
    jobId4 = j4.id;

    // 5. Create Job Matches for User 1
    const m1 = await jobMatchRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId1,
      overallScore: 9.4,
      decision: "EXCELLENT_MATCH",
      confidence: 0.95,
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: { skillsScore: 0.95, experienceScore: 0.9 },
      strengths: ["Production Go & distributed systems background", "Salary alignment"],
      gaps: [],
      risks: [],
      explanation: "Outstanding alignment with distributed systems engineering requirements.",
      weightsUsed: { skills: 0.3, experience: 0.2 },
    });
    match1Id = m1.id;

    const m2 = await jobMatchRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId2,
      overallScore: 8.4,
      decision: "STRONG_MATCH",
      confidence: 0.88,
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: { skillsScore: 0.85, experienceScore: 0.8 },
      strengths: ["Strong TypeScript & PostgreSQL background"],
      gaps: ["No explicit frontend requirement"],
      risks: [],
      explanation: "Strong backend fullstack alignment.",
      weightsUsed: { skills: 0.3, experience: 0.2 },
    });
    match2Id = m2.id;

    const m3 = await jobMatchRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId3,
      overallScore: 6.8,
      decision: "REVIEW",
      confidence: 0.75,
      hardConstraintsPassed: true,
      hardConstraintFailures: [],
      categoryScores: { skillsScore: 0.7, experienceScore: 0.65 },
      strengths: ["Go proficiency"],
      gaps: ["Hybrid location mismatch"],
      risks: ["Requires onsite presence in Berlin"],
      explanation: "Skill match is viable but hybrid requirement requires candidate review.",
      weightsUsed: { skills: 0.3, experience: 0.2 },
    });
    match3Id = m3.id;

    const m4 = await jobMatchRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId4,
      overallScore: 3.2,
      decision: "SKIP",
      confidence: 0.99,
      hardConstraintsPassed: false,
      hardConstraintFailures: ["Seniority mismatch", "Onsite policy conflict"],
      categoryScores: { skillsScore: 0.2, experienceScore: 0.1 },
      strengths: [],
      gaps: ["Completely unrelated stack and junior requirements"],
      risks: ["Underemployment"],
      explanation: "Disqualified by hard constraints.",
      weightsUsed: { skills: 0.3, experience: 0.2 },
    });
    match4Id = m4.id;

    // 6. Save Jobs: User 1 saves Job 1 and Job 4
    const s1 = await savedJobRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId1,
      notes: "Top priority: connect with engineering VP.",
    });
    saved1Id = s1.id;

    const s4 = await savedJobRepository.create({
      candidateProfileId: user1ProfileId,
      jobId: jobId4,
      notes: "Saved for testing QA workflow.",
    });
    saved4Id = s4.id;
  });

  // 1. Unauthenticated access enforcement
  await t.test("1. Unauthenticated access: all dashboard procedures throw 401 UNAUTHORIZED", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));

    await assert.rejects(
      () => unauthCaller.dashboard.stats(),
      (err: unknown) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );

    await assert.rejects(
      () => unauthCaller.dashboard.overview(),
      (err: unknown) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );

    await assert.rejects(
      () => unauthCaller.dashboard.matchesFeed({}),
      (err: unknown) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );

    await assert.rejects(
      () => unauthCaller.dashboard.savedJobsFeed({}),
      (err: unknown) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
  });

  // 2. Profile existence validation
  await t.test("2. Profile check: user without candidate profile throws 404 NOT_FOUND", async () => {
    const callerNoProfile = appRouter.createCaller(createMockContext(userNoProfileId));

    await assert.rejects(
      () => callerNoProfile.dashboard.stats(),
      (err: unknown) => isTRPCErrorWithCode(err, "NOT_FOUND", "Candidate profile not found")
    );

    await assert.rejects(
      () => callerNoProfile.dashboard.overview(),
      (err: unknown) => isTRPCErrorWithCode(err, "NOT_FOUND", "Candidate profile not found")
    );

    await assert.rejects(
      () => callerNoProfile.dashboard.matchesFeed({}),
      (err: unknown) => isTRPCErrorWithCode(err, "NOT_FOUND", "Candidate profile not found")
    );

    await assert.rejects(
      () => callerNoProfile.dashboard.savedJobsFeed({}),
      (err: unknown) => isTRPCErrorWithCode(err, "NOT_FOUND", "Candidate profile not found")
    );
  });

  // 3. Dashboard stats procedure
  await t.test("3. Dashboard stats: returns truthful aggregated counts across decision buckets & saved jobs", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const stats = await caller1.dashboard.stats();

    assert.equal(stats.totalMatches, 4);
    assert.equal(stats.excellentMatches, 1);
    assert.equal(stats.strongMatches, 1);
    assert.equal(stats.reviewMatches, 1);
    assert.equal(stats.skipMatches, 1);
    assert.equal(stats.savedJobsCount, 2);
  });

  // 4. Dashboard overview procedure
  await t.test("4. Dashboard overview: delivers complete profile, preferences, truthfulness, and stats", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const overview = await caller1.dashboard.overview();

    assert.equal(overview.profile.id, user1ProfileId);
    assert.equal(overview.profile.userId, user1Id);
    assert.equal(overview.profile.headline, "Senior Distributed Systems Engineer");

    assert.ok(overview.preferences);
    assert.equal(overview.preferences.remotePreference, "WORLDWIDE_REMOTE");
    assert.equal(overview.preferences.salaryMin, 150000);

    assert.ok(overview.truthfulness);
    assert.ok(typeof overview.truthfulness.profileCompletionPercentage === "number");

    assert.equal(overview.stats.totalMatches, 4);
    assert.equal(overview.stats.excellentMatches, 1);
    assert.equal(overview.stats.strongMatches, 1);
    assert.equal(overview.stats.reviewMatches, 1);
    assert.equal(overview.stats.savedJobsCount, 2);
  });

  // 5. Matches feed procedure with isSaved boolean resolution
  await t.test("5. Matches feed: returns matches ordered by score, joined with canonical job, and resolves isSaved state", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const feed = await caller1.dashboard.matchesFeed({ limit: 10, offset: 0 });

    assert.equal(feed.total, 4);
    assert.equal(feed.items.length, 4);
    assert.equal(feed.hasMore, false);

    // Verify ordering by overallScore DESC
    assert.ok(feed.items[0].match.overallScore >= feed.items[1].match.overallScore);
    assert.ok(feed.items[1].match.overallScore >= feed.items[2].match.overallScore);

    // Job 1 (EXCELLENT_MATCH) is saved
    const item1 = feed.items.find((i) => i.job.id === jobId1);
    assert.ok(item1);
    assert.equal(item1!.match.decision, "EXCELLENT_MATCH");
    assert.equal(item1!.isSaved, true);
    assert.equal(item1!.savedJobId, saved1Id);
    assert.equal(item1!.job.company, "Cloud Core Inc");
    assert.equal(item1!.job.remoteType, "WORLDWIDE_REMOTE");

    // Job 2 (STRONG_MATCH) is not saved
    const item2 = feed.items.find((i) => i.job.id === jobId2);
    assert.ok(item2);
    assert.equal(item2!.match.decision, "STRONG_MATCH");
    assert.equal(item2!.isSaved, false);
    assert.equal(item2!.savedJobId, null);

    // Job 4 (SKIP) is saved
    const item4 = feed.items.find((i) => i.job.id === jobId4);
    assert.ok(item4);
    assert.equal(item4!.match.decision, "SKIP");
    assert.equal(item4!.isSaved, true);
    assert.equal(item4!.savedJobId, saved4Id);
  });

  // 6. Matches feed filtering by decision
  await t.test("6. Matches feed filters: decision filter strictly returns requested category", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const strongFeed = await caller1.dashboard.matchesFeed({
      decision: "STRONG_MATCH",
    });

    assert.equal(strongFeed.total, 1);
    assert.equal(strongFeed.items.length, 1);
    assert.equal(strongFeed.items[0].match.decision, "STRONG_MATCH");
    assert.equal(strongFeed.items[0].job.id, jobId2);
  });

  // 7. Matches feed filtering by score threshold
  await t.test("7. Matches feed filters: minScore threshold filters out lower scores", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const highMatchFeed = await caller1.dashboard.matchesFeed({
      minScore: 8.0,
    });

    assert.equal(highMatchFeed.total, 2);
    assert.equal(highMatchFeed.items.length, 2);
    assert.ok(highMatchFeed.items.every((i) => i.match.overallScore >= 8.0));
  });

  // 8. Matches feed filtering by remote type
  await t.test("8. Matches feed filters: remoteType filter returns only jobs matching location policy", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const hybridFeed = await caller1.dashboard.matchesFeed({
      remoteType: "HYBRID",
    });

    assert.equal(hybridFeed.total, 1);
    assert.equal(hybridFeed.items[0].job.remoteType, "HYBRID");
    assert.equal(hybridFeed.items[0].job.company, "Hybrid Enterprises");
  });

  // 9. Saved jobs feed procedure
  await t.test("9. Saved jobs feed: returns candidate's saved jobs joined with canonical jobs and latest match", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const feed = await caller1.dashboard.savedJobsFeed({ limit: 10, offset: 0 });

    assert.equal(feed.total, 2);
    assert.equal(feed.items.length, 2);

    const saved1 = feed.items.find((s) => s.jobId === jobId1);
    assert.ok(saved1);
    assert.equal(saved1!.notes, "Top priority: connect with engineering VP.");
    assert.equal(saved1!.job.company, "Cloud Core Inc");
    assert.ok(saved1!.match);
    assert.equal(saved1!.match!.decision, "EXCELLENT_MATCH");
    assert.equal(saved1!.match!.overallScore, 9.4);

    const saved4 = feed.items.find((s) => s.jobId === jobId4);
    assert.ok(saved4);
    assert.equal(saved4!.notes, "Saved for testing QA workflow.");
    assert.equal(saved4!.match!.decision, "SKIP");
  });

  // 10. Cross-user isolation
  await t.test("10. Cross-user isolation: User 2 sees 0 matches, 0 saved jobs, and empty feeds", async () => {
    const caller2 = appRouter.createCaller(createMockContext(user2Id));

    const stats2 = await caller2.dashboard.stats();
    assert.equal(stats2.totalMatches, 0);
    assert.equal(stats2.savedJobsCount, 0);

    const feed2 = await caller2.dashboard.matchesFeed({});
    assert.equal(feed2.total, 0);
    assert.equal(feed2.items.length, 0);

    const savedFeed2 = await caller2.dashboard.savedJobsFeed({});
    assert.equal(savedFeed2.total, 0);
    assert.equal(savedFeed2.items.length, 0);
  });

  // 11. Spoofing protection: Injected foreign userId or candidateProfileId
  await t.test("11. Spoofing protection: Injected userId or candidateProfileId is rejected with 403 FORBIDDEN", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));

    await assert.rejects(
      () =>
        (caller1.dashboard.stats as any)({
          userId: user2Id,
        }),
      (err: unknown) =>
        isTRPCErrorWithCode(err, "FORBIDDEN", "Cannot access another user's dashboard data")
    );

    await assert.rejects(
      () =>
        (caller1.dashboard.matchesFeed as any)({
          candidateProfileId: user2ProfileId,
        }),
      (err: unknown) =>
        isTRPCErrorWithCode(err, "FORBIDDEN", "Cannot access another candidate's dashboard data")
    );
  });

  // 12. Response sanitization
  await t.test("12. Response sanitization: ensures no secret credentials leaked in response", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const overview = await caller1.dashboard.overview();
    const feed = await caller1.dashboard.matchesFeed({});

    const serialized = JSON.stringify({ overview, feed });
    assert.equal(serialized.includes("password"), false);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("token_"), false);
  });

  // 13. Teardown
  await t.test("13. Teardown: clean up test database records", async () => {
    await db.delete(savedJobs).where(inArray(savedJobs.candidateProfileId, [user1ProfileId, user2ProfileId]));
    await db.delete(jobMatches).where(inArray(jobMatches.candidateProfileId, [user1ProfileId, user2ProfileId]));
    await db.delete(jobs).where(inArray(jobs.id, [jobId1, jobId2, jobId3, jobId4]));
    await db.delete(candidatePreferences).where(inArray(candidatePreferences.candidateProfileId, [user1ProfileId, user2ProfileId]));
    await db.delete(candidateProfiles).where(inArray(candidateProfiles.id, [user1ProfileId, user2ProfileId]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id, userNoProfileId]));
  });
});
