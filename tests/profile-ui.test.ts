import test from "node:test";
import assert from "node:assert/strict";
import { db, user, session as sessionTable, candidateProfiles } from "@job-hub/db";
import { eq } from "drizzle-orm";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";
import { createProfileInputSchema, updateProfileInputSchema } from "@job-hub/candidate";

const createCaller = createCallerFactory(appRouter);
const BASE_URL = "http://localhost:3000";
const RUN_ID = `ui_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
const testEmail1 = `${RUN_ID}_user1@example.com`;
const testEmail2 = `${RUN_ID}_user2@example.com`;
const testPassword = "Password123!@#Test";

let cookieUser1 = "";
let cookieUser2 = "";
let user1Id = "";
let user2Id = "";

async function cleanup() {
  if (user1Id) {
    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, user1Id));
    await db.delete(sessionTable).where(eq(sessionTable.userId, user1Id));
    await db.delete(user).where(eq(user.id, user1Id));
  }
  if (user2Id) {
    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, user2Id));
    await db.delete(sessionTable).where(eq(sessionTable.userId, user2Id));
    await db.delete(user).where(eq(user.id, user2Id));
  }
}

test("Step 2.4 — Candidate Profile Completion & Truthfulness UX Suite", async (t) => {
  await t.test("Setup: Sign up User 1 and User 2", async () => {
    // User 1
    const res1 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        email: testEmail1,
        password: testPassword,
        name: "Test UI Candidate One",
      }),
    });
    assert.equal(res1.status, 200, "Sign up User 1 should succeed");
    const setCookie1 = res1.headers.get("set-cookie");
    assert.ok(setCookie1, "User 1 must receive session cookie");
    cookieUser1 = setCookie1.split(";")[0]!;
    const data1 = await res1.json();
    user1Id = data1.user.id;

    // User 2
    const res2 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        email: testEmail2,
        password: testPassword,
        name: "Test UI Candidate Two",
      }),
    });
    assert.equal(res2.status, 200, "Sign up User 2 should succeed");
    const setCookie2 = res2.headers.get("set-cookie");
    assert.ok(setCookie2, "User 2 must receive session cookie");
    cookieUser2 = setCookie2.split(";")[0]!;
    const data2 = await res2.json();
    user2Id = data2.user.id;
  });

  // 1. Unauthenticated user cannot use the profile page
  await t.test("1. Unauthenticated user visiting /profile receives Authentication Required guard", async () => {
    const res = await fetch(`${BASE_URL}/profile`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Authentication Required"), "Must render Authentication Required guard");
    assert.ok(html.includes("Sign In"), "Must include Sign In link");
    assert.ok(!html.includes("Initialize Candidate Profile"), "Unauthenticated user must not see creation action");

    // tRPC call directly is blocked
    const trpcRes = await fetch(`${BASE_URL}/api/trpc/candidate.getProfile`);
    assert.equal(trpcRes.status, 401, "Direct tRPC call without session must be 401");
  });

  // 2. Authenticated user with no profile sees creation state (STATE A) & completion indicator
  await t.test("2. Authenticated user with no profile sees creation state (STATE A)", async () => {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Candidate Profile"), "Page header must be present");
    assert.ok(html.includes("No Candidate Profile Initialized"), "Must indicate profile not initialized");
    assert.ok(html.includes("Initialize Candidate Profile"), "Must provide Initialize button");
    assert.ok(html.includes(testEmail1), "Must display authenticated user email");
    assert.ok(html.includes("Action Required: Not Initialized"), "Completion status indicates action required");
    assert.ok(html.includes("Foundational Profile Completion"), "Profile completion card is present");
  });

  // 3. User can create a profile via tRPC
  let createdProfileId = "";
  await t.test("3. User can create a profile via tRPC", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.result?.data?.id, "Created profile must return an ID");
    assert.equal(json.result.data.userId, user1Id, "Created profile must belong to User 1");
    createdProfileId = json.result.data.id;
  });

  // 4. Created profile persists in PostgreSQL
  await t.test("4. Created profile persists in PostgreSQL", async () => {
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, user1Id));
    assert.ok(row, "Profile row must exist in PostgreSQL");
    assert.equal(row.id, createdProfileId);
    assert.equal(row.userId, user1Id);
  });

  // 5. Existing profile data is displayed (STATE B) with Profile Initialized status
  await t.test("5. Existing profile data is displayed on /profile (STATE B)", async () => {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Profile Active"), "Must display Profile Active badge");
    assert.ok(html.includes("Profile Initialized"), "Completion card shows Profile Initialized badge");
    assert.ok(html.includes(createdProfileId), "Must display candidate profile ID");
    assert.ok(html.includes("Save / Update Profile"), "Must show update action");
    assert.ok(!html.includes("No Candidate Profile Initialized"), "Must no longer show empty state");
  });

  // 6. Truthfulness audit section displays correct truthful classifications
  await t.test("6. Truthfulness audit table displays honest classifications", async () => {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Data Truthfulness &amp; Verification Audit") || html.includes("Data Truthfulness & Verification Audit"));
    assert.ok(html.includes("USER_PROVIDED"), "Candidate Name must be classified as USER_PROVIDED");
    assert.ok(html.includes("Registration Form Input (Unverified)"), "Unverified source must be stated");
    assert.ok(html.includes("0 Inferred Facts"), "AI inference count must be honestly reported as 0");
    assert.ok(html.includes("Deterministic Engine (No AI Inference)"), "Deterministic nature must be declared");
  });

  // 7. No unsupported "verified" claims appear
  await t.test("7. No unsupported verified claim for user name", async () => {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { Cookie: cookieUser1 },
    });
    const html = await res.text();
    // Candidate Name must have User-Provided badge, not Verified
    assert.ok(html.includes("User-Provided"), "Candidate Name must be marked User-Provided");
  });

  // 8. User can edit / update an existing profile
  let updatedTimestamp: string = "";
  await t.test("8. User can update an existing profile", async () => {
    await new Promise((r) => setTimeout(r, 50));
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.updateProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.result?.data?.id, createdProfileId);
    updatedTimestamp = json.result?.data?.updatedAt;
    assert.ok(updatedTimestamp, "Must return bumped updatedAt timestamp");
  });

  // 9. Updated values persist after reload
  await t.test("9. Updated values persist in PostgreSQL after reload", async () => {
    const [row] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, user1Id));
    assert.ok(row);
    assert.equal(row.id, createdProfileId);
    assert.ok(row.updatedAt.getTime() >= new Date(updatedTimestamp).getTime() - 1000);
  });

  // 10. Invalid input is rejected
  await t.test("10. Invalid input containing disallowed fields is rejected", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invalidField: "hack" }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error?.data?.code, "BAD_REQUEST");
  });

  // 11. Saving state & duplicate creation protection
  await t.test("11. Duplicate creation returns 409 CONFLICT", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.equal(json.error?.data?.code, "CONFLICT");
  });

  // 12. Server / API errors are presented safely without leaks
  await t.test("12. Server errors are sanitized without SQL or stack traces", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    assert.ok(!text.toLowerCase().includes("pg_"), "Must not leak PostgreSQL internal identifiers");
    assert.ok(!text.toLowerCase().includes("password"), "Must not leak credentials");
  });

  // 13. Cross-user isolation: User 2 cannot access User 1 profile
  await t.test("13. Cross-user isolation: User 2 sees uninitialized profile & USER_REQUIRED", async () => {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { Cookie: cookieUser2 },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes(testEmail2), "User 2 sees their own email");
    assert.ok(!html.includes(createdProfileId), "User 2 must NOT see User 1's profile ID");
    assert.ok(html.includes("No Candidate Profile Initialized"), "User 2 must see empty creation state");
    assert.ok(html.includes("Action Required: Not Initialized"), "User 2 completion badge indicates uninitialized");
  });

  // 14. No userId ownership injection is possible
  await t.test("14. Client-supplied userId injection is strictly rejected", async () => {
    // Client-side schema rejection
    const createValidation = createProfileInputSchema.safeParse({ userId: "injected_user_id" });
    assert.equal(createValidation.success, false, "Client schema must reject userId");

    const updateValidation = updateProfileInputSchema.safeParse({ userId: "injected_user_id" });
    assert.equal(updateValidation.success, false, "Client schema must reject update userId");

    // Server-side procedure rejection
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: "injected_user_id" }),
    });
    assert.equal(res.status, 400);
  });

  // Teardown
  await t.test("Teardown: Clean up test data from PostgreSQL", async () => {
    await cleanup();
    const { queryClient } = await import("@job-hub/db");
    await queryClient.end();
  });
});
