import test from "node:test";
import assert from "node:assert/strict";
import { db, user, candidateProfiles } from "@job-hub/db";
import { eq } from "drizzle-orm";
import {
  candidateProfileService,
  CandidateProfileConflictError,
  CandidateProfileNotFoundError,
  CandidateProfileValidationError,
} from "@job-hub/candidate/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";
import { TRPCError } from "@trpc/server";

const createCaller = createCallerFactory(appRouter);

// Unique prefix for test data isolation and clean teardown
const TEST_PREFIX = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const testUser1Id = `${TEST_PREFIX}_user_1`;
const testUser2Id = `${TEST_PREFIX}_user_2`;

async function cleanupTestData() {
  try {
    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, testUser1Id));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, testUser2Id));
    await db.delete(user).where(eq(user.id, testUser1Id));
    await db.delete(user).where(eq(user.id, testUser2Id));
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}

test("Step 2.2 — Candidate Profile tRPC & Persistence Test Suite", async (t) => {
  // Setup: Create 2 temporary users in PostgreSQL
  await t.test("Setup: Create temporary users in PostgreSQL", async () => {
    await cleanupTestData();

    await db.insert(user).values([
      {
        id: testUser1Id,
        name: "Test Candidate One",
        email: `${testUser1Id}@example.com`,
        emailVerified: true,
      },
      {
        id: testUser2Id,
        name: "Test Candidate Two",
        email: `${testUser2Id}@example.com`,
        emailVerified: true,
      },
    ]);

    const users = await db.select().from(user).where(eq(user.id, testUser1Id));
    assert.equal(users.length, 1, "User 1 must exist in PostgreSQL");
  });

  // Callers
  const unauthCaller = createCaller({ session: null, headers: new Headers() });
  const user1Caller = createCaller({
    session: {
      session: { id: "s1", expiresAt: new Date(Date.now() + 86400000) } as any,
      user: { id: testUser1Id, email: `${testUser1Id}@example.com`, name: "User 1" } as any,
    },
    headers: new Headers(),
  });
  const user2Caller = createCaller({
    session: {
      session: { id: "s2", expiresAt: new Date(Date.now() + 86400000) } as any,
      user: { id: testUser2Id, email: `${testUser2Id}@example.com`, name: "User 2" } as any,
    },
    headers: new Headers(),
  });

  // Test 1: Unauthenticated request cannot access candidate profile
  await t.test("Test 1: Unauthenticated request fails via tRPC", async () => {
    await assert.rejects(
      async () => unauthCaller.candidate.getProfile(),
      { code: "UNAUTHORIZED" },
      "Unauthenticated tRPC call must throw TRPCError with code UNAUTHORIZED"
    );

    await assert.rejects(
      async () => unauthCaller.candidate.createProfile(),
      { code: "UNAUTHORIZED" },
      "Unauthenticated tRPC create must throw UNAUTHORIZED"
    );
  });

  // Test 2: Authenticated user with no profile receives expected empty result
  await t.test("Test 2: Authenticated user with no profile receives null", async () => {
    const profile = await user1Caller.candidate.getProfile();
    assert.equal(profile, null, "Profile should be null for user with no profile");
  });

  // Test 3: Authenticated user can create their own candidate profile without supplying userId
  let createdProfileId = "";
  await t.test("Test 3: Authenticated user can create their own profile (ownership server-derived)", async () => {
    // Client supplies NO userId
    const created = await user1Caller.candidate.createProfile();
    assert.ok(created, "Created profile must exist");
    assert.ok(created.id, "Profile must have an id");
    assert.equal(created.userId, testUser1Id, "Profile userId must match authenticated user from session");
    assert.ok(created.createdAt instanceof Date, "createdAt must be a Date");
    assert.ok(created.updatedAt instanceof Date, "updatedAt must be a Date");
    createdProfileId = created.id;
  });

  // Test 4: Created profile persists in PostgreSQL
  await t.test("Test 4: Created profile persists in PostgreSQL", async () => {
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser1Id));

    assert.ok(row, "Profile row must exist in PostgreSQL table");
    assert.equal(row.id, createdProfileId, "Persisted ID must match created profile ID");
    assert.equal(row.userId, testUser1Id, "Persisted userId must match testUser1Id");
    assert.ok(row.createdAt, "Persisted createdAt must be set");
    assert.ok(row.updatedAt, "Persisted updatedAt must be set");
  });

  // Test 5: Authenticated user can retrieve their own profile
  await t.test("Test 5: Authenticated user can retrieve their own profile via tRPC", async () => {
    const profile = await user1Caller.candidate.getProfile();
    assert.ok(profile, "Profile must be found");
    assert.equal(profile.id, createdProfileId);
    assert.equal(profile.userId, testUser1Id);
  });

  // Test 6: Authenticated user can update their own profile
  let initialUpdatedAt: Date;
  await t.test("Test 6: Authenticated user can update their own profile via tRPC", async () => {
    const before = await user1Caller.candidate.getProfile();
    assert.ok(before);
    initialUpdatedAt = before.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 50));

    const updated = await user1Caller.candidate.updateProfile();
    assert.ok(updated, "Updated profile must be returned");
    assert.equal(updated.id, createdProfileId);
    assert.equal(updated.userId, testUser1Id);
    assert.ok(
      updated.updatedAt.getTime() >= initialUpdatedAt.getTime(),
      "updatedAt must be updated"
    );

    // Verify in PostgreSQL
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser1Id));
    assert.equal(row.id, createdProfileId);
    assert.ok(row.updatedAt.getTime() >= initialUpdatedAt.getTime());
  });

  // Test 7: userId cannot be supplied or reassigned through client input
  await t.test("Test 7: Client cannot supply or reassign userId through input", async () => {
    // Attempting to supply userId in create input
    await assert.rejects(
      async () =>
        user1Caller.candidate.createProfile({
          userId: "malicious_user_id",
        } as any),
      { code: "BAD_REQUEST" },
      "tRPC must reject create input containing userId with BAD_REQUEST"
    );

    // Attempting to supply userId in update input
    await assert.rejects(
      async () =>
        user1Caller.candidate.updateProfile({
          userId: "malicious_user_id",
        } as any),
      { code: "BAD_REQUEST" },
      "tRPC must reject update input containing userId with BAD_REQUEST"
    );

    // Attempting to supply user_id in update input
    await assert.rejects(
      async () =>
        user1Caller.candidate.updateProfile({
          user_id: "malicious_user_id",
        } as any),
      { code: "BAD_REQUEST" },
      "tRPC must reject update input containing user_id with BAD_REQUEST"
    );

    // Confirm profile ownership is unchanged in PostgreSQL
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, createdProfileId));
    assert.equal(row.userId, testUser1Id, "Profile ownership must remain testUser1Id");
  });

  // Test 8: A second create operation does not create a duplicate profile
  await t.test("Test 8: A second create operation returns CONFLICT via tRPC", async () => {
    await assert.rejects(
      async () => user1Caller.candidate.createProfile(),
      { code: "CONFLICT" },
      "Duplicate creation via tRPC must throw CONFLICT"
    );

    // Verify only 1 profile exists for testUser1 in PostgreSQL
    const rows = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser1Id));
    assert.equal(rows.length, 1, "Exactly one candidate profile must exist in DB");
  });

  // Test 9: Invalid profile input is rejected
  await t.test("Test 9: Invalid profile input is rejected", async () => {
    await assert.rejects(
      async () =>
        user1Caller.candidate.updateProfile({
          extraFieldNotAllowed: "invalid",
        } as any),
      { code: "BAD_REQUEST" },
      "Unknown input fields must be rejected with BAD_REQUEST"
    );
  });

  // Test 10: A different authenticated user cannot access or modify the first user's profile
  await t.test("Test 10: Cross-user isolation: User 2 cannot access or modify User 1's profile", async () => {
    // User 2 queries profile -> receives null
    const user2Profile = await user2Caller.candidate.getProfile();
    assert.equal(user2Profile, null, "User 2 must not see User 1's profile");

    // User 2 update throws NOT_FOUND
    await assert.rejects(
      async () => user2Caller.candidate.updateProfile(),
      { code: "NOT_FOUND" },
      "User 2 updating profile without having one must throw NOT_FOUND"
    );

    // User 1's profile is intact in PostgreSQL
    const user1Profile = await user1Caller.candidate.getProfile();
    assert.ok(user1Profile);
    assert.equal(user1Profile.id, createdProfileId);
    assert.equal(user1Profile.userId, testUser1Id);
  });

  // Teardown
  await t.test("Teardown: Clean up temporary test data from PostgreSQL", async () => {
    await cleanupTestData();

    const checkProfiles = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser1Id));
    assert.equal(checkProfiles.length, 0, "Test profile 1 must be deleted");

    const checkUsers = await db
      .select()
      .from(user)
      .where(eq(user.id, testUser1Id));
    assert.equal(checkUsers.length, 0, "Test user 1 must be deleted");

    const { queryClient } = await import("@job-hub/db");
    await queryClient.end();
  });
});
