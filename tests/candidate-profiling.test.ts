import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, candidateProfiles, resumes, user, queryClient } from "@job-hub/db";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";
import { MockAiProvider } from "@job-hub/ai";
import {
  CandidateProfilerService,
  structuredCandidateProfileSchema,
  type StructuredCandidateProfile,
} from "@job-hub/candidate/server";
import { DrizzleCandidateProfileRepository } from "../packages/candidate/src/repository";
import { DrizzleResumeRepository } from "../packages/candidate/src/resume-repository";

const createCaller = createCallerFactory(appRouter);

// Test UUIDs
const testUser1Id = "11111111-2222-3333-4444-555555555555";
const testUser2Id = "22222222-3333-4444-5555-666666666666";

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
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      },
      user: {
        id: userId,
        email,
        name: "Test User",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    req: new Request("http://localhost:3000/api/trpc"),
    resHeaders: new Headers(),
  });
}

function createUnauthCaller() {
  return createCaller({
    session: null,
    req: new Request("http://localhost:3000/api/trpc"),
    resHeaders: new Headers(),
  });
}

const sampleStructuredOutput: StructuredCandidateProfile = {
  headline: "Senior Cloud & Distributed Systems Architect",
  summary: "10+ years of experience architecting distributed resilient microservices on AWS and Kubernetes.",
  technicalSkills: [
    {
      name: "TypeScript",
      category: "Languages",
      yearsOfExperience: 8,
      status: "INFERRED",
      sourceEvidence: "8 years writing TypeScript services in production.",
    },
    {
      name: "PostgreSQL",
      category: "Databases",
      yearsOfExperience: 10,
      status: "INFERRED",
      sourceEvidence: "Deep expertise optimizing PostgreSQL indexes and queries.",
    },
    {
      name: "Distributed Systems",
      category: "Architecture",
      status: "INFERRED",
      sourceEvidence: "Designed multi-region consensus and event sourcing systems.",
    },
  ],
  experience: [
    {
      company: "Acme Cloud Corp",
      role: "Principal Systems Engineer",
      startDate: "2020-01",
      endDate: null,
      isCurrent: true,
      description: "Leading core platform team.",
      technologies: ["TypeScript", "PostgreSQL", "Docker", "Kubernetes"],
      status: "INFERRED",
      sourceEvidence: "Lead core distributed infrastructure.",
    },
  ],
  education: [
    {
      institution: "State University",
      degree: "B.S. in Computer Science",
      fieldOfStudy: "Computer Science",
      graduationYear: 2014,
      status: "INFERRED",
      sourceEvidence: "State University, B.S. Computer Science 2014.",
    },
  ],
  projects: [
    {
      name: "Distributed Consensus Engine",
      description: "Raft consensus implementation in TypeScript.",
      technologies: ["TypeScript", "Node.js"],
      status: "INFERRED",
      sourceEvidence: "Open source raft implementation.",
    },
  ],
  achievements: [
    {
      title: "Reduced latency by 45%",
      description: "Redesigned caching tier using Redis.",
      status: "INFERRED",
      sourceEvidence: "Optimized response latency across services.",
    },
  ],
  technologies: ["TypeScript", "PostgreSQL", "Docker", "Kubernetes", "Redis"],
  strengths: ["High scalability architecture", "Database indexing and optimization"],
  rolePreferences: ["Principal Architect", "Staff Backend Engineer"],
  locationPreferences: {
    remotePreference: "WORLDWIDE_REMOTE",
    explicitLocations: ["Remote", "North America"],
    status: "INFERRED",
    sourceEvidence: "Prefers worldwide remote roles.",
  },
  missingInformation: [
    "Salary expectations (USER_REQUIRED)",
    "Specific work visa/citizenship status (USER_REQUIRED)",
  ],
};

test("Step 2.7 — AI Structured Candidate Profiling Test Suite", async (t) => {
  // Setup
  await t.test("Setup: Create test users and profiles in PostgreSQL", async () => {
    await db.delete(resumes);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "profile_test_1@example.com"));
    await db.delete(user).where(eq(user.email, "profile_test_2@example.com"));

    await db.insert(user).values([
      {
        id: testUser1Id,
        email: "profile_test_1@example.com",
        name: "Profile User 1",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUser2Id,
        email: "profile_test_2@example.com",
        name: "Profile User 2",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Create candidate profile for User 1 and User 2
    await db.insert(candidateProfiles).values([
      { id: "profile-user-1", userId: testUser1Id },
      { id: "profile-user-2", userId: testUser2Id },
    ]);
  });

  // 1. Unauthenticated request is rejected
  await t.test("1. Unauthenticated request is rejected (401)", async () => {
    const unauth = createUnauthCaller();
    await assert.rejects(
      async () => unauth.candidate.profileFromResume({ resumeId: "dummy-id" }),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );
  });

  // 2. Resume without extracted text is rejected
  await t.test("2. Resume without extracted text is rejected (BAD_REQUEST)", async () => {
    const [inserted] = await db
      .insert(resumes)
      .values({
        id: "resume-no-text",
        candidateProfileId: "profile-user-1",
        fileName: "resume.pdf",
        storageKey: "resumes/profile-user-1/no-text.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        status: "UPLOADED",
        extractedText: null,
      })
      .returning();

    const caller1 = createMockCaller(testUser1Id, "profile_test_1@example.com");
    await assert.rejects(
      async () => caller1.candidate.profileFromResume({ resumeId: inserted!.id }),
      /Resume does not contain extracted text/
    );
  });

  // 3. Resume with empty or whitespace-only extracted text is rejected
  await t.test("3. Resume with whitespace-only extracted text is rejected", async () => {
    const [inserted] = await db
      .insert(resumes)
      .values({
        id: "resume-empty-text",
        candidateProfileId: "profile-user-1",
        fileName: "empty.pdf",
        storageKey: "resumes/profile-user-1/empty.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        status: "PROCESSED",
        extractedText: "   \n\n   \t  ",
      })
      .returning();

    const caller1 = createMockCaller(testUser1Id, "profile_test_1@example.com");
    await assert.rejects(
      async () => caller1.candidate.profileFromResume({ resumeId: inserted!.id }),
      /Resume does not contain extracted text/
    );
  });

  // 4. Cross-user isolation: User 2 cannot profile User 1's resume
  await t.test("4. User 2 cannot profile User 1's resume (FORBIDDEN)", async () => {
    const [inserted] = await db
      .insert(resumes)
      .values({
        id: "resume-user-1-valid",
        candidateProfileId: "profile-user-1",
        fileName: "user1-cv.pdf",
        storageKey: "resumes/profile-user-1/user1.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        status: "PROCESSED",
        extractedText: "Alice Engineer - 10 years experience building distributed systems.",
      })
      .returning();

    const caller2 = createMockCaller(testUser2Id, "profile_test_2@example.com");
    await assert.rejects(
      async () => caller2.candidate.profileFromResume({ resumeId: inserted!.id }),
      (err: any) => err.code === "FORBIDDEN" || /permission/i.test(err.message)
    );
  });

  // 5. Client-supplied userId in input is strictly rejected
  await t.test("5. Client-supplied ownership fields are strictly rejected", async () => {
    const caller1 = createMockCaller(testUser1Id, "profile_test_1@example.com");
    await assert.rejects(
      async () =>
        (caller1.candidate.profileFromResume as any)({
          resumeId: "some-id",
          userId: testUser2Id,
        }),
      /userId cannot be client-supplied/
    );
  });

  // 6. AI structured output is validated by Zod schema
  await t.test("6. Valid AI structured output passes Zod validation", () => {
    const parsed = structuredCandidateProfileSchema.safeParse(sampleStructuredOutput);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.technicalSkills.length, 3);
      assert.equal(parsed.data.technicalSkills[0]?.name, "TypeScript");
      assert.equal(parsed.data.technicalSkills[0]?.status, "INFERRED");
    }
  });

  // 7. Invalid AI output is rejected by Zod validation
  await t.test("7. Invalid AI output missing required schema fields is rejected", async () => {
    const invalidMockProvider = new MockAiProvider(() => ({
      headline: 12345, // Should be string
      technicalSkills: "not-an-array", // Should be array
    }));

    const service = new CandidateProfilerService(
      new DrizzleCandidateProfileRepository(),
      new DrizzleResumeRepository(),
      invalidMockProvider
    );

    await assert.rejects(
      async () =>
        service.profileResume({
          userId: testUser1Id,
          resumeId: "resume-user-1-valid",
        }),
      /AI output failed schema validation|Mock AI output failed schema validation/
    );
  });

  // 8. AI Provider failure produces clean error behavior
  await t.test("8. AI Provider failure propagates clean error without crashing", async () => {
    const failingMockProvider = new MockAiProvider(() => {
      throw new Error("OpenAI API rate limit exceeded. Please try again later.");
    });

    const service = new CandidateProfilerService(
      new DrizzleCandidateProfileRepository(),
      new DrizzleResumeRepository(),
      failingMockProvider
    );

    await assert.rejects(
      async () =>
        service.profileResume({
          userId: testUser1Id,
          resumeId: "resume-user-1-valid",
        }),
      /rate limit exceeded/
    );
  });

  // 9. Successful candidate profiling persists structured data in PostgreSQL
  await t.test("9. Successful profiling persists structured data in candidate_profiles", async () => {
    const mockProvider = new MockAiProvider(() => sampleStructuredOutput);
    const service = new CandidateProfilerService(
      new DrizzleCandidateProfileRepository(),
      new DrizzleResumeRepository(),
      mockProvider
    );

    const updated = await service.profileResume({
      userId: testUser1Id,
      resumeId: "resume-user-1-valid",
    });

    assert.equal(updated.id, "profile-user-1");
    assert.equal(updated.headline, "Senior Cloud & Distributed Systems Architect");
    assert.ok(updated.profiledAt instanceof Date);
    assert.equal(updated.sourceResumeId, "resume-user-1-valid");

    // Directly verify in PostgreSQL
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, "profile-user-1"))
      .limit(1);

    assert.ok(row);
    assert.equal(row.headline, "Senior Cloud & Distributed Systems Architect");
    assert.equal(row.sourceResumeId, "resume-user-1-valid");
    assert.ok(row.profiledAt !== null);

    const persistedData = row.profileData as StructuredCandidateProfile;
    assert.ok(persistedData);
    assert.equal(persistedData.technicalSkills.length, 3);
    assert.equal(persistedData.technicalSkills[0]?.name, "TypeScript");
    assert.equal(persistedData.technicalSkills[0]?.status, "INFERRED");
    assert.equal(persistedData.experience.length, 1);
    assert.equal(persistedData.experience[0]?.company, "Acme Cloud Corp");
    assert.equal(persistedData.locationPreferences.remotePreference, "WORLDWIDE_REMOTE");
    assert.equal(persistedData.missingInformation.length, 2);
  });

  // 10. Re-running profiling updates profile data idempotently without duplicate records
  await t.test("10. Re-running profiling updates existing candidate profile without duplicates", async () => {
    const reProfileOutput: StructuredCandidateProfile = {
      ...sampleStructuredOutput,
      headline: "Updated Staff Infrastructure Architect",
    };

    const mockProvider = new MockAiProvider(() => reProfileOutput);
    const service = new CandidateProfilerService(
      new DrizzleCandidateProfileRepository(),
      new DrizzleResumeRepository(),
      mockProvider
    );

    const reProfiled = await service.profileResume({
      userId: testUser1Id,
      resumeId: "resume-user-1-valid",
    });

    assert.equal(reProfiled.id, "profile-user-1");
    assert.equal(reProfiled.headline, "Updated Staff Infrastructure Architect");

    // Verify there is still exactly 1 candidate profile for User 1
    const allProfiles = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser1Id));

    assert.equal(allProfiles.length, 1);
    assert.equal(allProfiles[0]?.headline, "Updated Staff Infrastructure Architect");
  });

  // 11. Truthfulness verification: facts are not marked VERIFIED from unverified resume text
  await t.test("11. Truthfulness: Extracted resume facts are INFERRED, not falsely VERIFIED", async () => {
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, "profile-user-1"))
      .limit(1);

    const data = row!.profileData as StructuredCandidateProfile;
    // Verify all technical skills are INFERRED, none falsely VERIFIED
    for (const skill of data.technicalSkills) {
      assert.notEqual(skill.status, "VERIFIED");
      assert.equal(skill.status, "INFERRED");
    }

    // Verify experience status
    for (const exp of data.experience) {
      assert.notEqual(exp.status, "VERIFIED");
      assert.equal(exp.status, "INFERRED");
    }

    // Missing information is explicitly captured
    assert.ok(data.missingInformation.some((m) => m.includes("USER_REQUIRED")));
  });

  // Teardown
  await t.test("Teardown: Clean up test database records and close pool", async () => {
    await db.delete(resumes);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "profile_test_1@example.com"));
    await db.delete(user).where(eq(user.email, "profile_test_2@example.com"));
    await queryClient.end();
  });
});
