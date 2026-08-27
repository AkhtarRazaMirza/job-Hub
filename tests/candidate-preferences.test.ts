/**
 * Job Hub — Phase 2 / Step 2.8
 * Candidate Preferences & Profile Review Integration Test Suite
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected (401).
 * 2. Server-derived ownership: client-supplied ownership fields are strictly rejected.
 * 3. Getting preferences for user with profile returns truthful defaults.
 * 4. Updating preferences persists to PostgreSQL candidate_preferences table.
 * 5. Cross-user isolation: User 2 cannot read or modify User 1's preferences.
 * 6. Strict input validation: negative salary, empty strings, invalid enums rejected.
 * 7. Idempotent upsert: repeated updates update the same row without duplicates.
 * 8. End-to-end integration: AI profiling produces INFERRED facts, missing facts are surfaced,
 *    and candidate sets explicit preferences linking to their candidate profile.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, user, candidateProfiles, candidatePreferences, resumes, queryClient } from "@job-hub/db";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";
import { updatePreferencesInputSchema } from "@job-hub/candidate";
import { MockAiProvider } from "@job-hub/ai";
import { CandidateProfilerService } from "@job-hub/candidate/server";

const createCaller = createCallerFactory(appRouter);

const testUser1Id = "pref_test_user_1";
const testUser2Id = "pref_test_user_2";
let profile1Id = "";
let profile2Id = "";

function createMockCaller(userId: string, email: string) {
  return createCaller({
    session: {
      session: {
        id: `sess-${userId}`,
        userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: `tok-${userId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: userId,
        email,
        name: "Test User",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    user: {
      id: userId,
      email,
      name: "Test User",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

function createUnauthCaller() {
  return createCaller({
    session: null,
    user: null,
  });
}

test("Step 2.8 — Candidate Preferences & Profile Review Test Suite", async (t) => {
  await t.test("Setup: Create test users and candidate profiles in PostgreSQL", async () => {
    try {
      // Clean up any stale records
      await db.delete(candidatePreferences);
      await db.delete(resumes);
      await db.delete(candidateProfiles);
      await db.delete(user).where(eq(user.email, "pref_user_1@example.com"));
      await db.delete(user).where(eq(user.email, "pref_user_2@example.com"));

      // Insert users
      await db.insert(user).values([
        {
          id: testUser1Id,
          email: "pref_user_1@example.com",
          name: "Preferences Candidate 1",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: testUser2Id,
          email: "pref_user_2@example.com",
          name: "Preferences Candidate 2",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Insert candidate profiles
      const [p1] = await db
        .insert(candidateProfiles)
        .values({
          id: "profile-pref-1",
          userId: testUser1Id,
        })
        .returning();
      profile1Id = p1!.id;

      const [p2] = await db
        .insert(candidateProfiles)
        .values({
          id: "profile-pref-2",
          userId: testUser2Id,
        })
        .returning();
      profile2Id = p2!.id;
    } catch (e) {
      console.error("SETUP ERROR OCCURRED:", e);
      throw e;
    }
  });

  // 1. Unauthenticated requests are rejected
  await t.test("1. Unauthenticated access to preferences is rejected (401)", async () => {
    const unauth = createUnauthCaller();
    await assert.rejects(
      async () => unauth.candidate.getPreferences(),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );
    await assert.rejects(
      async () => unauth.candidate.updatePreferences({ remotePreference: "WORLDWIDE_REMOTE" }),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );
  });

  // 2. Server-derived ownership: Client cannot supply ownership fields
  await t.test("2. Client-supplied ownership fields are strictly rejected", () => {
    const maliciousInputWithUserId = {
      remotePreference: "WORLDWIDE_REMOTE",
      userId: "victim_user_id",
    };
    const result1 = updatePreferencesInputSchema.safeParse(maliciousInputWithUserId);
    assert.equal(result1.success, false);

    const maliciousInputWithProfileId = {
      remotePreference: "WORLDWIDE_REMOTE",
      candidateProfileId: "victim_profile_id",
    };
    const result2 = updatePreferencesInputSchema.safeParse(maliciousInputWithProfileId);
    assert.equal(result2.success, false);

    const maliciousInputWithId = {
      remotePreference: "WORLDWIDE_REMOTE",
      id: "arbitrary_id",
    };
    const result3 = updatePreferencesInputSchema.safeParse(maliciousInputWithId);
    assert.equal(result3.success, false);
  });

  // 3. User with no prior preferences receives truthful default object
  await t.test("3. User without existing preferences receives truthful defaults", async () => {
    const caller1 = createMockCaller(testUser1Id, "pref_user_1@example.com");
    const prefs = await caller1.candidate.getPreferences();

    assert.ok(prefs);
    assert.equal(prefs.candidateProfileId, profile1Id);
    assert.equal(prefs.remotePreference, "UNKNOWN");
    assert.equal(prefs.experienceLevel, "MID");
    assert.equal(prefs.salaryMin, null);
    assert.equal(prefs.salaryCurrency, "USD");
    assert.deepEqual(prefs.targetRoles, []);
    assert.deepEqual(prefs.preferredLocations, []);
  });

  // 4. Updating preferences persists in PostgreSQL
  await t.test("4. Updating preferences persists to PostgreSQL", async () => {
    const caller1 = createMockCaller(testUser1Id, "pref_user_1@example.com");
    const updated = await caller1.candidate.updatePreferences({
      remotePreference: "WORLDWIDE_REMOTE",
      preferredLocations: ["United States", "Canada", "Europe"],
      salaryMin: 175000,
      salaryCurrency: "USD",
      targetRoles: ["Staff Distributed Systems Engineer", "Principal Cloud Architect"],
      experienceLevel: "LEAD",
    });

    assert.equal(updated.candidateProfileId, profile1Id);
    assert.equal(updated.remotePreference, "WORLDWIDE_REMOTE");
    assert.equal(updated.salaryMin, 175000);
    assert.equal(updated.salaryCurrency, "USD");
    assert.equal(updated.experienceLevel, "LEAD");
    assert.deepEqual(updated.preferredLocations, ["United States", "Canada", "Europe"]);
    assert.deepEqual(updated.targetRoles, [
      "Staff Distributed Systems Engineer",
      "Principal Cloud Architect",
    ]);

    // Verify row directly in PostgreSQL
    const [dbRow] = await db
      .select()
      .from(candidatePreferences)
      .where(eq(candidatePreferences.candidateProfileId, profile1Id));

    assert.ok(dbRow, "Database row must exist in candidate_preferences");
    assert.equal(dbRow.remotePreference, "WORLDWIDE_REMOTE");
    assert.equal(dbRow.salaryMin, 175000);
    assert.equal(dbRow.experienceLevel, "LEAD");
  });

  // 5. Cross-user isolation: User 2 cannot access or modify User 1's preferences
  await t.test("5. Cross-user isolation: User 2 has separate preferences", async () => {
    const caller2 = createMockCaller(testUser2Id, "pref_user_2@example.com");

    // User 2 reads their own preferences
    const prefs2 = await caller2.candidate.getPreferences();
    assert.equal(prefs2.candidateProfileId, profile2Id);
    assert.equal(prefs2.remotePreference, "UNKNOWN");

    // User 2 updates their own preferences
    await caller2.candidate.updatePreferences({
      remotePreference: "ONSITE",
      salaryMin: 90000,
      experienceLevel: "ENTRY",
    });

    // User 1's preferences remain unaffected
    const caller1 = createMockCaller(testUser1Id, "pref_user_1@example.com");
    const prefs1 = await caller1.candidate.getPreferences();
    assert.equal(prefs1.candidateProfileId, profile1Id);
    assert.equal(prefs1.remotePreference, "WORLDWIDE_REMOTE");
    assert.equal(prefs1.salaryMin, 175000);
    assert.equal(prefs1.experienceLevel, "LEAD");
  });

  // 6. Strict input validation
  await t.test("6. Input validation rejects invalid payloads", async () => {
    const caller1 = createMockCaller(testUser1Id, "pref_user_1@example.com");

    // Negative salary
    await assert.rejects(
      async () =>
        caller1.candidate.updatePreferences({
          salaryMin: -5000,
        }),
      (err: any) => err.code === "BAD_REQUEST" || /Salary cannot be negative/i.test(err.message)
    );

    // Empty string in targetRoles
    await assert.rejects(
      async () =>
        caller1.candidate.updatePreferences({
          targetRoles: ["Valid Role", ""],
        }),
      (err: any) => err.code === "BAD_REQUEST" || /Target role cannot be empty/i.test(err.message)
    );

    // Invalid experienceLevel
    await assert.rejects(
      async () =>
        caller1.candidate.updatePreferences({
          experienceLevel: "GRANDMASTER" as any,
        }),
      (err: any) => err.code === "BAD_REQUEST" || /invalid_enum_value/i.test(err.message)
    );
  });

  // 7. Idempotent upsert: repeated updates do not create duplicate rows
  await t.test("7. Idempotent upsert maintains unique 1:1 relationship", async () => {
    const caller1 = createMockCaller(testUser1Id, "pref_user_1@example.com");

    await caller1.candidate.updatePreferences({ salaryMin: 180000 });
    await caller1.candidate.updatePreferences({ salaryMin: 185000 });
    await caller1.candidate.updatePreferences({ salaryMin: 190000 });

    const allRows = await db
      .select()
      .from(candidatePreferences)
      .where(eq(candidatePreferences.candidateProfileId, profile1Id));

    assert.equal(allRows.length, 1, "Exactly one preferences row must exist per candidate profile");
    assert.equal(allRows[0]?.salaryMin, 190000);
  });

  // 8. End-to-End Profile Review & Preferences Integration
  await t.test("8. End-to-End: AI Profiling produces INFERRED facts, candidate confirms preferences", async () => {
    // 1. Insert processed resume for User 1
    const [insertedResume] = await db
      .insert(resumes)
      .values({
        id: "resume-pref-test-1",
        candidateProfileId: profile1Id,
        fileName: "resume.pdf",
        storageKey: "resumes/profile-pref-1/resume.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        status: "PROCESSED",
        extractedText: "Alex Senior Engineer - 8 years of TypeScript, PostgreSQL, and Distributed Systems.",
      })
      .returning();

    // 2. Profile resume using MockAiProvider
    const mockAi = new MockAiProvider(() => ({
      headline: "Senior Distributed Systems Engineer",
      summary: "8 years of engineering high-throughput backend services.",
      technicalSkills: [
        { name: "TypeScript", category: "Language", yearsOfExperience: 8, status: "INFERRED" },
        { name: "PostgreSQL", category: "Database", yearsOfExperience: 6, status: "INFERRED" },
      ],
      experience: [
        {
          company: "Cloud Corp",
          role: "Senior Backend Engineer",
          startDate: "2020-01",
          isCurrent: true,
          technologies: ["TypeScript", "PostgreSQL"],
          status: "INFERRED",
        },
      ],
      education: [],
      projects: [],
      achievements: [],
      technologies: ["TypeScript", "PostgreSQL"],
      strengths: ["Distributed Consensus", "High Availability"],
      rolePreferences: ["Senior Backend Engineer", "Staff Engineer"],
      locationPreferences: {
        remotePreference: "WORLDWIDE_REMOTE",
        explicitLocations: [],
        status: "INFERRED",
      },
      missingInformation: [
        "Salary expectations: USER_REQUIRED",
        "Work authorization: USER_REQUIRED",
      ],
    }));

    const profilerService = new CandidateProfilerService(undefined, undefined, mockAi);
    const profiled = await profilerService.profileResume({
      userId: testUser1Id,
      resumeId: insertedResume!.id,
    });

    // Verify truthfulness invariant on profiled data
    assert.equal(profiled.headline, "Senior Distributed Systems Engineer");
    assert.ok(profiled.profileData);
    assert.equal(profiled.profileData.technicalSkills[0]?.status, "INFERRED");
    assert.notEqual(profiled.profileData.technicalSkills[0]?.status, "VERIFIED");
    assert.ok(profiled.profileData.missingInformation.some((m) => m.includes("USER_REQUIRED")));

    // 3. User sets explicit preferences addressing the missing information
    const caller1 = createMockCaller(testUser1Id, "pref_user_1@example.com");
    const updatedPrefs = await caller1.candidate.updatePreferences({
      remotePreference: "WORLDWIDE_REMOTE",
      salaryMin: 180000,
      salaryCurrency: "USD",
      targetRoles: profiled.profileData.rolePreferences,
      experienceLevel: "SENIOR",
    });

    assert.equal(updatedPrefs.remotePreference, "WORLDWIDE_REMOTE");
    assert.equal(updatedPrefs.salaryMin, 180000);
    assert.equal(updatedPrefs.experienceLevel, "SENIOR");
    assert.deepEqual(updatedPrefs.targetRoles, ["Senior Backend Engineer", "Staff Engineer"]);
  });

  await t.test("Teardown: Clean up test database records and close pool", async () => {
    await db.delete(candidatePreferences);
    await db.delete(resumes);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "pref_user_1@example.com"));
    await db.delete(user).where(eq(user.email, "pref_user_2@example.com"));
    await queryClient.end();
  });
});
