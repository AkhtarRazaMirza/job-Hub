/**
 * Step 2.11 — Candidate Profile Unified Aggregation & Truthfulness Verification Test Suite
 *
 * Verifies:
 * 1. Unauthenticated requests to unified profile procedures are rejected (401).
 * 2. Client-supplied ownership fields are strictly rejected via Zod z.never().
 * 3. Security: LinkedIn profile URL validator strictly enforces HTTPS LinkedIn URLs and rejects
 *    non-LinkedIn hosts, localhost, SSRF, non-HTTPS protocols, and arbitrary paths.
 * 4. LinkedIn profile URL updates candidate_profiles in PostgreSQL with server-derived session ownership.
 * 5. TRUTHFULNESS MANDATE:
 *    - Code-backed repository projects: strictly VERIFIED.
 *    - Extracted resume claims: strictly INFERRED.
 *    - User preferences & confirmed links: USER_PROVIDED.
 *    - Missing required fields: USER_REQUIRED.
 * 6. Unified Profile Aggregator computes accurate truthfulness metrics and completion percentage.
 * 7. Cross-user isolation: User 2 cannot access, update, or view User 1's unified profile data.
 * 8. Clean database teardown.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  db,
  user,
  candidateProfiles,
  candidatePreferences,
  projects,
  resumes,
  queryClient,
} from "@job-hub/db";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";
import {
  updateLinkedInUrlInputSchema,
  LINKEDIN_PROFILE_REGEX,
} from "@job-hub/candidate";

const createCaller = createCallerFactory(appRouter);

const testUser1Id = "unified_test_user_1";
const testUser2Id = "unified_test_user_2";
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

test("Step 2.11 — Candidate Profile Unified Aggregation & Truthfulness Verification Test Suite", async (t) => {
  await t.test("Setup: Create test users, candidate profiles, preferences, and projects in PostgreSQL", async () => {
    // Clean up any stale records
    await db.delete(projects);
    await db.delete(candidatePreferences);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "unified_user_1@example.com"));
    await db.delete(user).where(eq(user.email, "unified_user_2@example.com"));

    // Insert test users
    await db.insert(user).values([
      {
        id: testUser1Id,
        email: "unified_user_1@example.com",
        name: "Morgan Vance",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUser2Id,
        email: "unified_user_2@example.com",
        name: "Taylor Quinn",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Insert candidate profile for User 1 with structured resume data
    const [p1] = await db
      .insert(candidateProfiles)
      .values({
        id: "profile-unified-1",
        userId: testUser1Id,
        headline: "Principal Distributed Systems Engineer",
        portfolioUrl: "https://morganvance.dev",
        profileData: {
          headline: "Principal Distributed Systems Engineer",
          summary: "Over a decade building high-scale transactional pipelines.",
          technicalSkills: [
            { name: "Rust", status: "INFERRED", sourceEvidence: "Resume mentions 5 years Rust" },
            { name: "TypeScript", status: "INFERRED", sourceEvidence: "Resume mentions 8 years TS" },
            { name: "PostgreSQL", status: "INFERRED", sourceEvidence: "Production database tuning" },
          ],
          experience: [
            {
              company: "StreamScale Systems",
              role: "Principal Engineer",
              startDate: "2020-01",
              endDate: null,
              isCurrent: true,
              description: "Engineered core messaging bus.",
              technologies: ["Rust", "Kafka", "PostgreSQL"],
              status: "INFERRED",
            },
          ],
          education: [
            {
              institution: "University of Washington",
              degree: "B.S.",
              fieldOfStudy: "Computer Science",
              graduationYear: 2015,
              status: "INFERRED",
            },
          ],
          projects: [],
          achievements: [
            {
              title: "Reduced 99th percentile latency by 72%",
              status: "INFERRED",
            },
          ],
          technologies: ["Rust", "TypeScript", "Kafka", "PostgreSQL"],
          strengths: ["Low-latency architectures", "Deterministic state machines"],
          rolePreferences: ["Principal Engineer", "Staff Backend Engineer"],
          locationPreferences: {
            remotePreference: "WORLDWIDE_REMOTE",
            explicitLocations: [],
            status: "INFERRED",
          },
          missingInformation: [],
        },
      })
      .returning();
    profile1Id = p1!.id;

    // Insert candidate profile for User 2 (empty, bare-bones)
    const [p2] = await db
      .insert(candidateProfiles)
      .values({
        id: "profile-unified-2",
        userId: testUser2Id,
      })
      .returning();
    profile2Id = p2!.id;

    // Insert candidate preferences for User 1
    await db.insert(candidatePreferences).values({
      candidateProfileId: profile1Id,
      remotePreference: "WORLDWIDE_REMOTE",
      allowedCountries: ["US", "CA", "GB", "DE"],
      salaryMin: 180000,
      salaryCurrency: "USD",
      targetRoles: ["Principal Engineer", "Staff Backend Engineer"],
      experienceLevel: "STAFF",
    });

    // Insert confirmed projects for User 1:
    // 1 GitHub project (VERIFIED) + 1 Portfolio project (USER_PROVIDED)
    await db.insert(projects).values([
      {
        id: "proj-github-1",
        candidateProfileId: profile1Id,
        name: "high-throughput-bus",
        repositoryUrl: "https://github.com/morganvance/high-throughput-bus",
        primaryLanguage: "Rust",
        languages: ["Rust", "C++"],
        technologies: ["Rust", "Tokio", "SIMD"],
        architectureEvidence: "Zero-copy streaming pipeline with microbenchmark tests",
        source: "GITHUB",
        verificationStatus: "VERIFIED", // Code proof!
        confirmedByUser: true,
      },
      {
        id: "proj-portfolio-1",
        candidateProfileId: profile1Id,
        name: "Vance Cloud Analytics",
        url: "https://morganvance.dev/case-studies/analytics",
        technologies: ["Next.js", "Tailwind", "PostgreSQL"],
        architectureEvidence: "Interactive telemetry dashboard",
        source: "PORTFOLIO",
        verificationStatus: "USER_PROVIDED", // Self-reported claim confirmed by user
        confirmedByUser: true,
      },
    ]);
  });

  // 1. Unauthenticated requests are rejected (401)
  await t.test("1. Unauthenticated access to unified profile procedures is rejected (401)", async () => {
    const unauth = createUnauthCaller();

    await assert.rejects(
      async () =>
        unauth.candidate.updateLinkedInUrl({
          linkedinUrl: "https://www.linkedin.com/in/morganvance",
        }),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );

    await assert.rejects(
      async () => unauth.candidate.getUnifiedProfile(),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );
  });

  // 2. Client-supplied ownership fields are strictly rejected
  await t.test("2. Client-supplied ownership fields are strictly rejected via Zod z.never()", () => {
    assert.throws(() => {
      updateLinkedInUrlInputSchema.parse({
        linkedinUrl: "https://www.linkedin.com/in/morganvance",
        userId: "hacker-user-id",
      });
    }, /userId cannot be client-supplied/);

    assert.throws(() => {
      updateLinkedInUrlInputSchema.parse({
        linkedinUrl: "https://www.linkedin.com/in/morganvance",
        candidateProfileId: "hacker-profile-id",
      });
    }, /candidateProfileId cannot be client-supplied/);
  });

  // 3. Security: LinkedIn URL validation rejects invalid formats, SSRF, non-HTTPS, and non-LinkedIn domains
  await t.test("3. Security: LinkedIn URL validator enforces strict HTTPS personal profile URLs", () => {
    // Valid LinkedIn personal profile URLs
    assert.ok(LINKEDIN_PROFILE_REGEX.test("https://www.linkedin.com/in/morganvance"));
    assert.ok(LINKEDIN_PROFILE_REGEX.test("https://linkedin.com/in/morgan-vance-123"));
    assert.ok(LINKEDIN_PROFILE_REGEX.test("https://www.linkedin.com/in/morganvance/"));
    assert.ok(LINKEDIN_PROFILE_REGEX.test("https://uk.linkedin.com/in/morganvance"));

    // Disallowed / Malicious / Non-LinkedIn hosts
    assert.ok(!LINKEDIN_PROFILE_REGEX.test("http://www.linkedin.com/in/morganvance")); // Non-HTTPS
    assert.ok(!LINKEDIN_PROFILE_REGEX.test("https://evil-linkedin.com/in/morganvance")); // Domain spoofing
    assert.ok(!LINKEDIN_PROFILE_REGEX.test("https://localhost/in/morganvance")); // Localhost SSRF
    assert.ok(!LINKEDIN_PROFILE_REGEX.test("https://127.0.0.1/in/morganvance")); // IP SSRF
    assert.ok(!LINKEDIN_PROFILE_REGEX.test("https://169.254.169.254/latest/")); // Cloud metadata
    assert.ok(!LINKEDIN_PROFILE_REGEX.test("https://www.linkedin.com/jobs/view/12345")); // Not a personal profile
    assert.ok(!LINKEDIN_PROFILE_REGEX.test("https://www.linkedin.com/company/google")); // Company page, not personal

    assert.throws(() => {
      updateLinkedInUrlInputSchema.parse({
        linkedinUrl: "https://evil.com/fake-profile",
      });
    }, /Must be a valid HTTPS LinkedIn profile URL/);
  });

  // 4. Update LinkedIn URL persists to PostgreSQL
  await t.test("4. Update LinkedIn URL persists to candidate_profiles with server-derived ownership", async () => {
    const caller1 = createMockCaller(testUser1Id, "unified_user_1@example.com");

    const updated = await caller1.candidate.updateLinkedInUrl({
      linkedinUrl: "https://www.linkedin.com/in/morganvance",
    });

    assert.equal(updated.linkedinUrl, "https://www.linkedin.com/in/morganvance");
    assert.equal(updated.id, profile1Id);

    // Verify directly in PostgreSQL
    const [dbProfile] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, profile1Id));

    assert.equal(dbProfile?.linkedinUrl, "https://www.linkedin.com/in/morganvance");
  });

  // 5. Unified Profile Aggregator returns complete truthful profile
  await t.test("5. Unified Profile Aggregator computes truthful breakdown and completion score", async () => {
    const caller1 = createMockCaller(testUser1Id, "unified_user_1@example.com");

    const unified = await caller1.candidate.getUnifiedProfile();

    // Verify root profile entity
    assert.equal(unified.profile.id, profile1Id);
    assert.equal(unified.profile.headline, "Principal Distributed Systems Engineer");
    assert.equal(unified.profile.portfolioUrl, "https://morganvance.dev");
    assert.equal(unified.profile.linkedinUrl, "https://www.linkedin.com/in/morganvance");

    // Verify preferences entity
    assert.ok(unified.preferences);
    assert.equal(unified.preferences.remotePreference, "WORLDWIDE_REMOTE");
    assert.equal(unified.preferences.salaryMin, 180000);

    // Verify projects (GitHub + Portfolio)
    assert.equal(unified.projects.length, 2);
    const githubProj = unified.projects.find((p) => p.source === "GITHUB");
    const portfolioProj = unified.projects.find((p) => p.source === "PORTFOLIO");

    assert.ok(githubProj);
    assert.equal(githubProj.verificationStatus, "VERIFIED", "GitHub project backed by code must be VERIFIED");

    assert.ok(portfolioProj);
    assert.equal(portfolioProj.verificationStatus, "USER_PROVIDED", "Portfolio project must NOT be VERIFIED");

    // Verify structured facts
    assert.equal(unified.skills.length, 3);
    assert.equal(unified.experiences.length, 1);
    assert.equal(unified.education.length, 1);
    assert.equal(unified.achievements.length, 1);

    // TRUTHFULNESS AUDIT (04_ai_agent_skills.md §2):
    // 1 GitHub project is VERIFIED
    assert.equal(unified.truthfulness.verifiedCount, 1);

    // 3 skills + 1 experience + 1 education + 1 achievement = 6 INFERRED resume claims
    assert.equal(unified.truthfulness.inferredCount, 6);

    // 1 portfolio project + 3 preferences + 1 LinkedIn + 1 Portfolio URL = 6 USER_PROVIDED
    assert.equal(unified.truthfulness.userProvidedCount, 6);

    // Profile has all key sections; completion percentage should be high
    assert.ok(unified.truthfulness.profileCompletionPercentage >= 80);
  });

  // 6. Bare-bones profile correctly detects missing required fields
  await t.test("6. Bare-bones profile detects USER_REQUIRED missing fields accurately", async () => {
    const caller2 = createMockCaller(testUser2Id, "unified_user_2@example.com");

    const unified2 = await caller2.candidate.getUnifiedProfile();

    assert.equal(unified2.profile.id, profile2Id);
    assert.equal(unified2.preferences, null);
    assert.equal(unified2.projects.length, 0);
    assert.equal(unified2.skills.length, 0);

    // Should detect missing required information
    assert.ok(unified2.truthfulness.userRequiredCount > 0);
    assert.ok(unified2.truthfulness.missingRequiredFields.includes("Professional Headline"));
    assert.ok(unified2.truthfulness.missingRequiredFields.includes("Technical Skills"));
    assert.ok(unified2.truthfulness.missingRequiredFields.includes("Job Preferences (Remote & Salary)"));
    assert.ok(unified2.truthfulness.missingRequiredFields.includes("Projects (GitHub or Portfolio)"));
  });

  // 7. Cross-user isolation: User 2 cannot access or view User 1's profile data
  await t.test("7. Cross-user isolation: User 2 receives their own isolated profile", async () => {
    const caller2 = createMockCaller(testUser2Id, "unified_user_2@example.com");

    const unified2 = await caller2.candidate.getUnifiedProfile();

    assert.equal(unified2.profile.id, profile2Id);
    assert.notEqual(unified2.profile.id, profile1Id);
    assert.equal(unified2.profile.linkedinUrl, null);
    assert.equal(unified2.profile.portfolioUrl, null);
    assert.equal(unified2.projects.length, 0);
  });

  // Teardown
  await t.test("Teardown: Clean up test database records and close pool", async () => {
    await db.delete(projects);
    await db.delete(candidatePreferences);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "unified_user_1@example.com"));
    await db.delete(user).where(eq(user.email, "unified_user_2@example.com"));
    await queryClient.end();
  });
});
