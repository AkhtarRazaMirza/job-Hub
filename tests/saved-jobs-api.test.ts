/**
 * Job Hub — Phase 5 / Step 5.2
 * Saved Jobs tRPC API & Security Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 8 & §5 Phase 5 ("saved jobs")
 * - 02_how_to_build.md §10 ("Saved Jobs")
 *
 * Tests:
 * 1. Unauthenticated save rejected with 401 UNAUTHORIZED
 * 2. Unauthenticated list rejected with 401 UNAUTHORIZED
 * 3. Unauthenticated unsave rejected with 401 UNAUTHORIZED
 * 4. Authenticated user can save/bookmark a job
 * 5. Authenticated user can retrieve isSaved state
 * 6. Duplicate save returns 409 CONFLICT
 * 7. Saving non-existent job returns 404 NOT_FOUND
 * 8. Authenticated user can update notes on a saved job
 * 9. Updating notes on unsaved job returns 404 NOT_FOUND
 * 10. Authenticated user can list their saved jobs with pagination
 * 11. Authenticated user can retrieve total count of saved jobs
 * 12. Authenticated user can unsave a job
 * 13. Cross-user isolation: User 2 cannot see User 1's saved jobs
 * 14. Spoofing protection: Injected userId is rejected with 403 FORBIDDEN
 * 15. Spoofing protection: Injected candidateProfileId is rejected with 403 FORBIDDEN
 * 16. Response sanitization: Public fields only, no private credentials leaked
 * 17. Teardown: Clean up test records
 */

import test from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { candidateProfileRepository } from "@job-hub/candidate/server";
import { jobRepository, savedJobRepository } from "@job-hub/jobs/server";
import { db, users, candidateProfiles, jobs, savedJobs } from "@job-hub/db";
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

function createMockContext(userId: string | null = "usr_test_saved_api_1") {
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

test("Step 5.2 — Saved Jobs tRPC API & Security Test Suite", async (t) => {
  const user1Id = `usr_test_sj_api_1_${Date.now()}`;
  const user2Id = `usr_test_sj_api_2_${Date.now()}`;
  let user1ProfileId: string;
  let user2ProfileId: string;
  let testJobId1: string;
  let testJobId2: string;

  await t.test("Setup: Create test users, candidate profiles, and jobs in PostgreSQL", async () => {
    // 1. Users
    await db.insert(users).values([
      {
        id: user1Id,
        name: "Saved API User 1",
        email: `${user1Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: user2Id,
        name: "Saved API User 2",
        email: `${user2Id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 2. Profiles
    const p1 = await candidateProfileRepository.create({
      userId: user1Id,
      headline: "Senior Cloud Architect",
      profileData: { skills: ["AWS", "Terraform", "Go"] },
    });
    user1ProfileId = p1.id;

    const p2 = await candidateProfileRepository.create({
      userId: user2Id,
      headline: "Frontend Engineer",
      profileData: { skills: ["React", "TypeScript", "Tailwind"] },
    });
    user2ProfileId = p2.id;

    // 3. Jobs
    const j1 = await jobRepository.create({
      title: "Senior Cloud Architect",
      company: "Apex Clouds",
      remoteType: "WORLDWIDE_REMOTE",
      skills: ["AWS", "Terraform"],
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/apply/sj-api-1",
    });
    testJobId1 = j1.id;

    const j2 = await jobRepository.create({
      title: "Staff Frontend Architect",
      company: "Vanguard Tech",
      remoteType: "WORLDWIDE_REMOTE",
      skills: ["React", "Next.js"],
      status: "ACTIVE",
      source: "manual",
      applicationUrl: "https://example.com/apply/sj-api-2",
    });
    testJobId2 = j2.id;
  });

  // 1-3. Unauthenticated access
  await t.test("1. Unauthenticated access: save procedure throws 401 UNAUTHORIZED", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));
    await assert.rejects(
      () => unauthCaller.savedJobs.save({ jobId: testJobId1 }),
      (err: unknown) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
  });

  await t.test("2. Unauthenticated access: list procedure throws 401 UNAUTHORIZED", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));
    await assert.rejects(
      () => unauthCaller.savedJobs.list({}),
      (err: unknown) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
  });

  await t.test("3. Unauthenticated access: unsave procedure throws 401 UNAUTHORIZED", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));
    await assert.rejects(
      () => unauthCaller.savedJobs.unsave({ jobId: testJobId1 }),
      (err: unknown) => isTRPCErrorWithCode(err, "UNAUTHORIZED")
    );
  });

  // 4. Authenticated save
  await t.test("4. Authenticated save: user 1 saves job 1 successfully", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const saved = await caller1.savedJobs.save({
      jobId: testJobId1,
      notes: "Must review compensation before interview.",
    });

    assert.ok(saved.id);
    assert.equal(saved.candidateProfileId, user1ProfileId);
    assert.equal(saved.jobId, testJobId1);
    assert.equal(saved.notes, "Must review compensation before interview.");
  });

  // 5. Authenticated isSaved
  await t.test("5. Authenticated isSaved: returns true for saved job and false for unsaved job", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const status1 = await caller1.savedJobs.isSaved({ jobId: testJobId1 });
    assert.equal(status1.isSaved, true);
    assert.ok(status1.savedJobId);
    assert.equal(status1.notes, "Must review compensation before interview.");

    const status2 = await caller1.savedJobs.isSaved({ jobId: testJobId2 });
    assert.equal(status2.isSaved, false);
    assert.equal(status2.savedJobId, null);
  });

  // 6. Duplicate save returns 409 CONFLICT
  await t.test("6. Duplicate save: duplicate bookmark attempt throws 409 CONFLICT", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    await assert.rejects(
      () => caller1.savedJobs.save({ jobId: testJobId1 }),
      (err: unknown) => isTRPCErrorWithCode(err, "CONFLICT", "already saved")
    );
  });

  // 7. Non-existent job returns 404 NOT_FOUND
  await t.test("7. Job existence check: non-existent job throws 404 NOT_FOUND", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    await assert.rejects(
      () => caller1.savedJobs.save({ jobId: "00000000-0000-0000-0000-000000000000" }),
      (err: unknown) => isTRPCErrorWithCode(err, "NOT_FOUND", "not found")
    );
  });

  // 8. Update notes
  await t.test("8. Update notes: user 1 updates notes on saved job", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const updated = await caller1.savedJobs.updateNotes({
      jobId: testJobId1,
      notes: "Updated note: Recruiter connected via email.",
    });

    assert.equal(updated.jobId, testJobId1);
    assert.equal(updated.notes, "Updated note: Recruiter connected via email.");

    const status = await caller1.savedJobs.isSaved({ jobId: testJobId1 });
    assert.equal(status.notes, "Updated note: Recruiter connected via email.");
  });

  // 9. Update notes on unsaved job
  await t.test("9. Update notes on unsaved job: throws 404 NOT_FOUND", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    await assert.rejects(
      () =>
        caller1.savedJobs.updateNotes({
          jobId: testJobId2,
          notes: "Notes on unsaved",
        }),
      (err: unknown) => isTRPCErrorWithCode(err, "NOT_FOUND")
    );
  });

  // 10. List saved jobs
  await t.test("10. List saved jobs: returns candidate's saved jobs with pagination", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    // Also save job 2 for user 1
    await caller1.savedJobs.save({ jobId: testJobId2, notes: "Job 2" });

    const list = await caller1.savedJobs.list({ limit: 10, offset: 0 });
    assert.equal(list.items.length, 2);
    assert.equal(list.total, 2);

    const count = await caller1.savedJobs.count();
    assert.equal(count.count, 2);
  });

  // 11. Unsave job
  await t.test("11. Unsave job: removes bookmark and updates saved state", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const unsaveRes = await caller1.savedJobs.unsave({ jobId: testJobId2 });
    assert.equal(unsaveRes.jobId, testJobId2);
    assert.equal(unsaveRes.removed, true);

    const check = await caller1.savedJobs.isSaved({ jobId: testJobId2 });
    assert.equal(check.isSaved, false);

    const count = await caller1.savedJobs.count();
    assert.equal(count.count, 1);
  });

  // 12. Cross-user isolation
  await t.test("12. Cross-user isolation: User 2 sees 0 saved jobs and isSaved is false", async () => {
    const caller2 = appRouter.createCaller(createMockContext(user2Id));
    const list2 = await caller2.savedJobs.list({});
    assert.equal(list2.items.length, 0);
    assert.equal(list2.total, 0);

    const isSaved2 = await caller2.savedJobs.isSaved({ jobId: testJobId1 });
    assert.equal(isSaved2.isSaved, false);

    // User 2 cannot unsave User 1's saved job
    const unsaveRes = await caller2.savedJobs.unsave({ jobId: testJobId1 });
    assert.equal(unsaveRes.removed, false); // Returns false, does not remove User 1's row

    // Verify User 1's saved job is still intact
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const isSaved1 = await caller1.savedJobs.isSaved({ jobId: testJobId1 });
    assert.equal(isSaved1.isSaved, true);
  });

  // 13. Spoofing protection: Injected userId
  await t.test("13. Spoofing protection: Injected userId is rejected with 403 FORBIDDEN", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    await assert.rejects(
      () =>
        caller1.savedJobs.save({
          jobId: testJobId2,
          userId: user2Id, // Attempting to act as User 2
        }),
      (err: unknown) =>
        isTRPCErrorWithCode(
          err,
          "FORBIDDEN",
          "Cannot access another user's candidate profile"
        )
    );
  });

  // 14. Spoofing protection: Injected candidateProfileId
  await t.test("14. Spoofing protection: Injected candidateProfileId is rejected with 403 FORBIDDEN", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    await assert.rejects(
      () =>
        caller1.savedJobs.save({
          jobId: testJobId2,
          candidateProfileId: user2ProfileId, // Attempting to save on User 2's profile
        }),
      (err: unknown) =>
        isTRPCErrorWithCode(
          err,
          "FORBIDDEN",
          "Cannot access another candidate's saved jobs"
        )
    );
  });

  // 15. Response sanitization
  await t.test("15. Response sanitization: returns sanitized entity without leaking secrets", async () => {
    const caller1 = appRouter.createCaller(createMockContext(user1Id));
    const list = await caller1.savedJobs.list({});
    assert.ok(list.items.length > 0);
    const item = list.items[0]!;
    assert.ok("id" in item);
    assert.ok("candidateProfileId" in item);
    assert.ok("jobId" in item);
    assert.ok("notes" in item);
    assert.ok("createdAt" in item);
    assert.ok("updatedAt" in item);
    assert.equal((item as any).password, undefined);
    assert.equal((item as any).databaseUrl, undefined);
  });

  // 16. Teardown
  await t.test("16. Teardown: clean up test entities", async () => {
    await db.delete(savedJobs).where(eq(savedJobs.candidateProfileId, user1ProfileId));
    await db.delete(savedJobs).where(eq(savedJobs.candidateProfileId, user2ProfileId));
    await db.delete(jobs).where(eq(jobs.id, testJobId1));
    await db.delete(jobs).where(eq(jobs.id, testJobId2));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, user1ProfileId));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, user2ProfileId));
    await db.delete(users).where(eq(users.id, user1Id));
    await db.delete(users).where(eq(users.id, user2Id));
  });
});
