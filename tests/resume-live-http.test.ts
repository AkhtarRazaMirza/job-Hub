import test from "node:test";
import assert from "node:assert/strict";
import { db, user, session as sessionTable, candidateProfiles, resumes } from "@job-hub/db";
import { eq } from "drizzle-orm";

const BASE_URL = "http://localhost:3000";
const RUN_ID = `live_resume_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
const testEmail1 = `${RUN_ID}_1@example.com`;
const testEmail2 = `${RUN_ID}_2@example.com`;
const testPassword = "Password123!@#Test";

let cookieUser1 = "";
let cookieUser2 = "";
let user1Id = "";
let user2Id = "";
let uploadedResumeId = "";

const samplePdfBuffer = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

async function cleanup() {
  if (user1Id) {
    const p1 = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.userId, user1Id));
    for (const p of p1) {
      await db.delete(resumes).where(eq(resumes.candidateProfileId, p.id));
    }
    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, user1Id));
    await db.delete(sessionTable).where(eq(sessionTable.userId, user1Id));
    await db.delete(user).where(eq(user.id, user1Id));
  }
  if (user2Id) {
    const p2 = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.userId, user2Id));
    for (const p of p2) {
      await db.delete(resumes).where(eq(resumes.candidateProfileId, p.id));
    }
    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, user2Id));
    await db.delete(sessionTable).where(eq(sessionTable.userId, user2Id));
    await db.delete(user).where(eq(user.id, user2Id));
  }
}

test("Live HTTP Endpoint & UI Integration for Resume Ingestion", async (t) => {
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
        name: "Resume Live Candidate One",
      }),
    });

    assert.equal(res1.status, 200, "Sign up User 1 should succeed");
    const setCookie1 = res1.headers.get("set-cookie");
    assert.ok(setCookie1, "User 1 must receive session cookie");
    cookieUser1 = setCookie1.split(";")[0]!;
    const data1 = await res1.json();
    user1Id = data1.user.id;

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
        name: "Resume Live Candidate Two",
      }),
    });

    assert.equal(res2.status, 200, "Sign up User 2 should succeed");
    const setCookie2 = res2.headers.get("set-cookie");
    assert.ok(setCookie2, "User 2 must receive session cookie");
    cookieUser2 = setCookie2.split(";")[0]!;
    const data2 = await res2.json();
    user2Id = data2.user.id;
  });

  await t.test("Live 1: Unauthenticated resume operations return 401 Unauthorized", async () => {
    const resList = await fetch(`${BASE_URL}/api/trpc/resume.list`);
    assert.equal(resList.status, 401);

    const resUpload = await fetch(`${BASE_URL}/api/trpc/resume.upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "resume.pdf",
        fileBase64: samplePdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      }),
    });
    assert.equal(resUpload.status, 401);
  });

  await t.test("Live 2: Authenticated user uploads resume via live tRPC POST endpoint", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/resume.upload`, {
      method: "POST",
      headers: {
        Cookie: cookieUser1,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: "Senior_FullStack_Resume.pdf",
        fileBase64: samplePdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      }),
    });

    assert.equal(res.status, 200, "Live upload must return 200");
    const json = await res.json();
    assert.ok(json.result?.data?.id);
    assert.equal(json.result.data.fileName, "Senior_FullStack_Resume.pdf");
    assert.equal(json.result.data.status, "UPLOADED");
    uploadedResumeId = json.result.data.id;
  });

  await t.test("Live 3: Authenticated user lists resumes via live tRPC GET endpoint", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/resume.list`, {
      headers: { Cookie: cookieUser1 },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json.result?.data));
    assert.equal(json.result.data.length, 1);
    assert.equal(json.result.data[0]?.id, uploadedResumeId);
  });

  await t.test("Live 4: Authenticated user gets specific resume via live tRPC endpoint", async () => {
    const inputParam = encodeURIComponent(JSON.stringify({ id: uploadedResumeId }));
    const res = await fetch(`${BASE_URL}/api/trpc/resume.get?input=${inputParam}`, {
      headers: { Cookie: cookieUser1 },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.result?.data?.id, uploadedResumeId);
    assert.equal(json.result?.data?.status, "UPLOADED");
  });

  await t.test("Live 5: Cross-user isolation: User 2 cannot list User 1's resume", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/resume.list`, {
      headers: { Cookie: cookieUser2 },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json.result?.data, []);
  });

  await t.test("Live 6: Cross-user isolation: User 2 cannot get User 1's resume (403 Forbidden)", async () => {
    // Create profile for user 2 first
    await fetch(`${BASE_URL}/api/trpc/candidate.createProfile`, {
      method: "POST",
      headers: { Cookie: cookieUser2, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const inputParam = encodeURIComponent(JSON.stringify({ id: uploadedResumeId }));
    const res = await fetch(`${BASE_URL}/api/trpc/resume.get?input=${inputParam}`, {
      headers: { Cookie: cookieUser2 },
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error?.data?.code, "FORBIDDEN");
  });

  await t.test("Live 7: Cross-user isolation: User 2 cannot delete User 1's resume (403 Forbidden)", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/resume.delete`, {
      method: "POST",
      headers: { Cookie: cookieUser2, "Content-Type": "application/json" },
      body: JSON.stringify({ id: uploadedResumeId }),
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error?.data?.code, "FORBIDDEN");
  });

  await t.test("Live 8: Client-supplied userId in upload is strictly rejected (400)", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/resume.upload`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "hack.pdf",
        fileBase64: samplePdfBuffer.toString("base64"),
        mimeType: "application/pdf",
        userId: "hacked_user_id",
      }),
    });

    assert.equal(res.status, 400);
  });

  await t.test("Live 9: /profile renders Resume Documents section with truthful status", async () => {
    const res = await fetch(`${BASE_URL}/profile`, {
      headers: { Cookie: cookieUser1 },
    });

    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Resume Documents"), "Must render Resume Documents card");
    assert.ok(html.includes("Senior_FullStack_Resume.pdf"), "Must render uploaded resume filename");
    assert.ok(html.includes("UPLOADED"), "Must render honest UPLOADED status badge");
    assert.ok(html.includes("Truthfulness Notice"), "Must render Truthfulness Notice");
    assert.ok(!html.includes("Resume Verified"), "Must NEVER claim resume is verified");
  });

  await t.test("Live 10: Authenticated user deletes their resume via live tRPC endpoint", async () => {
    const res = await fetch(`${BASE_URL}/api/trpc/resume.delete`, {
      method: "POST",
      headers: { Cookie: cookieUser1, "Content-Type": "application/json" },
      body: JSON.stringify({ id: uploadedResumeId }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.result?.data?.success, true);

    // Verify row removed from DB
    const [row] = await db.select().from(resumes).where(eq(resumes.id, uploadedResumeId));
    assert.equal(row, undefined);
  });

  await t.test("Teardown: Clean up live test data", async () => {
    await cleanup();
    const { queryClient } = await import("@job-hub/db");
    await queryClient.end();
  });
});
