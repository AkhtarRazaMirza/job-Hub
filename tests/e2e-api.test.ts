import test from "node:test";
import assert from "node:assert/strict";
import { db, user, session as sessionTable, candidateProfiles } from "@job-hub/db";
import { eq } from "drizzle-orm";

const BASE_URL = "http://localhost:3000";
const RUN_ID = `live_trpc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
const testEmail1 = `${RUN_ID}_1@example.com`;
const testEmail2 = `${RUN_ID}_2@example.com`;
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

test("Live tRPC HTTP Endpoint Integration against Next.js Server", async (t) => {
  await t.test("Setup: Sign up User 1 and User 2 via Better Auth endpoint", async () => {
    // User 1 sign up
    const res1 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        email: testEmail1,
        password: testPassword,
        name: "Test User One",
      }),
    });

    assert.equal(res1.status, 200, "Sign up User 1 should succeed");
    const setCookie1 = res1.headers.get("set-cookie");
    assert.ok(setCookie1, "User 1 must receive session cookie");
    cookieUser1 = setCookie1.split(";")[0]!;

    const data1 = await res1.json();
    user1Id = data1.user.id;
    assert.ok(user1Id, "User 1 ID must exist");

    // User 2 sign up
    const res2 = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        email: testEmail2,
        password: testPassword,
        name: "Test User Two",
      }),
    });

    assert.equal(res2.status, 200, "Sign up User 2 should succeed");
    const setCookie2 = res2.headers.get("set-cookie");
    assert.ok(setCookie2, "User 2 must receive session cookie");
    cookieUser2 = setCookie2.split(";")[0]!;

    const data2 = await res2.json();
    user2Id = data2.user.id;
    assert.ok(user2Id, "User 2 ID must exist");
  });

  await t.test("Live 1: GET /api/trpc/candidate.getProfile unauthenticated returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.getProfile`);
    assert.equal(res.status, 401, "Unauthenticated request must return 401");
    const json = await res.json();
    assert.equal(json.error?.data?.code, "UNAUTHORIZED");
  });

  await t.test("Live 2: GET /api/trpc/candidate.getProfile for user with no profile returns null", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.getProfile`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.result?.data, null, "User 1 profile should initially be null");
  });

  let createdProfileId = "";
  await t.test("Live 3: POST /api/trpc/candidate.createProfile creates profile (200 / created)", async () => {
    // Client supplies NO userId
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200, "tRPC createProfile must succeed");
    const json = await res.json();
    assert.ok(json.result?.data, "Created profile data must be returned");
    assert.equal(json.result.data.userId, user1Id, "Profile userId must be server-derived");
    createdProfileId = json.result.data.id;
  });

  await t.test("Live 4: GET /api/trpc/candidate.getProfile retrieves created profile", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.getProfile`, {
      headers: { Cookie: cookieUser1 },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.result?.data?.id, createdProfileId);
    assert.equal(json.result?.data?.userId, user1Id);
  });

  await t.test("Live 5: POST /api/trpc/candidate.updateProfile updates profile", async () => {
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
  });

  await t.test("Live 6: POST /api/trpc/candidate.updateProfile rejects client userId input (400)", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.updateProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: "attacker_id" }),
    });
    assert.equal(res.status, 400, "Supplying userId to updateProfile must be rejected with 400");
    const json = await res.json();
    assert.equal(json.error?.data?.code, "BAD_REQUEST");
  });

  await t.test("Live 7: POST /api/trpc/candidate.createProfile rejects client userId input (400)", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: "attacker_id" }),
    });
    assert.equal(res.status, 400, "Supplying userId to createProfile must be rejected with 400");
    const json = await res.json();
    assert.equal(json.error?.data?.code, "BAD_REQUEST");
  });

  await t.test("Live 8: POST /api/trpc/candidate.createProfile duplicate creation returns 409 Conflict", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 409, "Duplicate profile creation must return 409");
    const json = await res.json();
    assert.equal(json.error?.data?.code, "CONFLICT");
  });

  await t.test("Live 9: Cross-user isolation: User 2 cannot access or modify User 1 profile", async () => {
    // User 2 gets profile -> returns null
    const resGet = await fetch(`${BASE_URL}/api/trpc/candidate.getProfile`, {
      headers: { Cookie: cookieUser2 },
    });
    assert.equal(resGet.status, 200);
    const jsonGet = await resGet.json();
    assert.equal(jsonGet.result?.data, null, "User 2 cannot see User 1 profile");

    // User 2 attempts update -> returns 404 (User 2 has no profile)
    const resUpdate = await fetch(`${BASE_URL}/api/trpc/candidate.updateProfile`, {
      method: "POST",
      headers: {
        Cookie: cookieUser2,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(resUpdate.status, 404, "User 2 update must return 404");
    const jsonUpdate = await resUpdate.json();
    assert.equal(jsonUpdate.error?.data?.code, "NOT_FOUND");
  });

  await t.test("Teardown: Clean up live test data", async () => {
    await cleanup();
    const { queryClient } = await import("@job-hub/db");
    await queryClient.end();
  });
});
