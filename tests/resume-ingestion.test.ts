import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { db, user, candidateProfiles, resumes } from "@job-hub/db";
import { eq } from "drizzle-orm";
import {
  validateResumeFile,
  verifyFileSignature,
  sanitizeFileName,
  uploadResumeInputSchema,
  deleteResumeInputSchema,
  getResumeInputSchema,
  MAX_RESUME_FILE_SIZE,
} from "@job-hub/candidate";
import {
  resumeService,
  ResumeNotFoundError,
  ResumeForbiddenError,
} from "@job-hub/candidate/server";
import {
  DiskStorageProvider,
  R2StorageProvider,
} from "@job-hub/storage";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";

const createCaller = createCallerFactory(appRouter);

// Unique test run identifier for database and filesystem isolation
const RUN_ID = `test_resume_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const testUser1Id = `${RUN_ID}_user_1`;
const testUser2Id = `${RUN_ID}_user_2`;
const testStorageDir = path.resolve(`.test-storage-${RUN_ID}`);

// Sample valid PDF buffer: starts with %PDF-
const validPdfBuffer = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

// Sample valid DOCX buffer: starts with PK\x03\x04
const validDocxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00]);

async function cleanupDb() {
  try {
    const profiles = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser1Id));
    for (const p of profiles) {
      await db.delete(resumes).where(eq(resumes.candidateProfileId, p.id));
    }

    const profiles2 = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser2Id));
    for (const p of profiles2) {
      await db.delete(resumes).where(eq(resumes.candidateProfileId, p.id));
    }

    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, testUser1Id));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, testUser2Id));
    await db.delete(user).where(eq(user.id, testUser1Id));
    await db.delete(user).where(eq(user.id, testUser2Id));
  } catch (err) {
    console.error("Database cleanup error:", err);
  }
}

async function cleanupStorageDir() {
  try {
    await fs.rm(testStorageDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

test("Step 2.5 — Resume Ingestion Foundation Test Suite", async (t) => {
  // -------------------------------------------------------------------------
  // SECTION 1: File Validation Rules (Deterministic, Binary-Verified)
  // -------------------------------------------------------------------------
  await t.test("1.1 File signature: Valid PDF magic bytes (%PDF-) accepted", () => {
    const format = verifyFileSignature(validPdfBuffer);
    assert.equal(format, "pdf");
  });

  await t.test("1.2 File signature: Valid DOCX magic bytes (PK\\x03\\x04) accepted", () => {
    const format = verifyFileSignature(validDocxBuffer);
    assert.equal(format, "docx");
  });

  await t.test("1.3 File signature: Unsupported binary format rejected", () => {
    const invalidBuffer = Buffer.from("<html><body>Not a resume</body></html>");
    assert.throws(
      () => verifyFileSignature(invalidBuffer),
      /Unsupported file format/,
      "Non-PDF/DOCX file header must throw unsupported format error"
    );

    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ executable
    assert.throws(
      () => verifyFileSignature(exeBuffer),
      /Unsupported file format/
    );
  });

  await t.test("1.4 File signature: Empty or tiny buffer (<4 bytes) rejected", () => {
    assert.throws(
      () => verifyFileSignature(Buffer.from("")),
      /File too small/
    );
    assert.throws(
      () => verifyFileSignature(Buffer.from("%PD")),
      /File too small/
    );
  });

  await t.test("1.5 Extension vs Binary mismatch rejected", () => {
    // DOCX binary with .pdf extension
    assert.throws(
      () => validateResumeFile(validDocxBuffer, "resume.pdf", "candidate_1"),
      /File content is a DOCX document, but filename extension is not \.docx/
    );

    // PDF binary with .docx extension
    assert.throws(
      () => validateResumeFile(validPdfBuffer, "resume.docx", "candidate_1"),
      /File content is a PDF, but filename extension is not \.pdf/
    );
  });

  await t.test("1.6 Oversized file rejected (> 5 MB)", () => {
    const oversizedBuffer = Buffer.alloc(MAX_RESUME_FILE_SIZE + 10);
    // Pretend PDF magic bytes
    oversizedBuffer[0] = 0x25;
    oversizedBuffer[1] = 0x50;
    oversizedBuffer[2] = 0x44;
    oversizedBuffer[3] = 0x46;
    oversizedBuffer[4] = 0x2d;

    assert.throws(
      () => validateResumeFile(oversizedBuffer, "resume.pdf", "candidate_1"),
      /exceeds the maximum limit of 5 MB/
    );
  });

  await t.test("1.7 Filename sanitization & path traversal prevention", () => {
    const traversalName = "../../etc/passwd.pdf";
    const sanitized = sanitizeFileName(traversalName, "pdf");
    assert.equal(sanitized, "passwd.pdf", "Path traversal segments must be stripped");

    const windowsPath = "C:\\Windows\\System32\\calc.pdf";
    const sanitizedWin = sanitizeFileName(windowsPath, "pdf");
    assert.ok(!sanitizedWin.includes(":") && !sanitizedWin.includes("\\"));

    const controlChars = "my\x00resume\x1f.docx";
    const sanitizedCtrl = sanitizeFileName(controlChars, "docx");
    assert.equal(sanitizedCtrl, "myresume.docx");
  });

  await t.test("1.8 Server-generated storage key is deterministic and safe", () => {
    const candidateId = "cand_uuid_12345";
    const validated = validateResumeFile(validPdfBuffer, "my_resume.pdf", candidateId);

    assert.ok(validated.storageKey.startsWith(`resumes/${candidateId}/`));
    assert.ok(validated.storageKey.endsWith(".pdf"));
    // Ensure raw filename is NOT part of the storage key
    assert.ok(!validated.storageKey.includes("my_resume"));

    // SHA-256 hash
    const expectedHash = crypto.createHash("sha256").update(validPdfBuffer).digest("hex");
    assert.equal(validated.hash, expectedHash);
  });

  await t.test("1.9 Input schema rejects client-supplied ownership fields", () => {
    // Client cannot supply userId
    const res1 = uploadResumeInputSchema.safeParse({
      fileName: "resume.pdf",
      fileBase64: validPdfBuffer.toString("base64"),
      mimeType: "application/pdf",
      userId: "malicious_user",
    });
    assert.equal(res1.success, false, "Schema must reject userId");

    // Client cannot supply candidateProfileId
    const res2 = uploadResumeInputSchema.safeParse({
      fileName: "resume.pdf",
      fileBase64: validPdfBuffer.toString("base64"),
      mimeType: "application/pdf",
      candidateProfileId: "malicious_candidate",
    });
    assert.equal(res2.success, false, "Schema must reject candidateProfileId");

    // Unknown fields rejected via strict mode
    const res3 = uploadResumeInputSchema.safeParse({
      fileName: "resume.pdf",
      fileBase64: validPdfBuffer.toString("base64"),
      mimeType: "application/pdf",
      isVerified: true,
    });
    assert.equal(res3.success, false, "Schema must reject unknown fields");
  });

  // -------------------------------------------------------------------------
  // SECTION 2: Storage Provider Abstraction & Path Traversal Hardening
  // -------------------------------------------------------------------------
  await t.test("2.1 DiskStorageProvider operations (upload, exists, download, delete)", async () => {
    const diskStorage = new DiskStorageProvider(testStorageDir);
    const testKey = "resumes/user_abc/test_doc.pdf";

    // 1. Upload
    const uploadRes = await diskStorage.upload(testKey, validPdfBuffer, "application/pdf");
    assert.equal(uploadRes.key, testKey);
    assert.equal(uploadRes.size, validPdfBuffer.length);
    assert.equal(uploadRes.contentType, "application/pdf");

    // 2. Exists
    const exists = await diskStorage.exists(testKey);
    assert.equal(exists, true, "Uploaded file must exist in disk storage");

    // 3. Download
    const downloaded = await diskStorage.download(testKey);
    assert.equal(downloaded.size, validPdfBuffer.length);
    assert.equal(downloaded.contentType, "application/pdf");
    assert.deepEqual(downloaded.data, validPdfBuffer);

    // 4. Delete
    await diskStorage.delete(testKey);
    const existsAfter = await diskStorage.exists(testKey);
    assert.equal(existsAfter, false, "Deleted file must no longer exist");
  });

  await t.test("2.2 DiskStorageProvider strictly blocks path traversal attacks in keys", async () => {
    const diskStorage = new DiskStorageProvider(testStorageDir);

    await assert.rejects(
      async () => diskStorage.upload("../../etc/passwd", validPdfBuffer, "text/plain"),
      /Path traversal detected/
    );

    await assert.rejects(
      async () => diskStorage.download("../secret.env"),
      /Path traversal detected/
    );

    await assert.rejects(
      async () => diskStorage.delete("/root/.ssh/id_rsa"),
      /Path traversal detected/
    );
  });

  await t.test("2.3 R2StorageProvider boundary validates config and refuses fake success", async () => {
    // Missing credentials throws during construction
    assert.throws(
      () => new R2StorageProvider({ accountId: "", accessKeyId: "", secretAccessKey: "", bucketName: "" }),
      /Missing required Cloudflare R2 storage credentials/
    );

    const r2 = new R2StorageProvider({
      accountId: "dummy_account",
      accessKeyId: "dummy_key",
      secretAccessKey: "dummy_secret",
      bucketName: "jobhub-resumes",
    });

    assert.equal(r2.endpoint, "https://dummy_account.r2.cloudflarestorage.com/jobhub-resumes");

    // Live operations without S3 driver throw explicit error (no fake success)
    await assert.rejects(
      async () => r2.upload("key.pdf", validPdfBuffer, "application/pdf"),
      /Cloudflare R2 live network operations are not configured/
    );
    await assert.rejects(
      async () => r2.download("key.pdf"),
      /Cloudflare R2 live network operations are not configured/
    );
  });

  // -------------------------------------------------------------------------
  // SECTION 3: Database & tRPC End-to-End Persistence & Access Control
  // -------------------------------------------------------------------------
  await t.test("Setup: Create test candidate users in PostgreSQL", async () => {
    await cleanupDb();

    await db.insert(user).values([
      {
        id: testUser1Id,
        name: "Resume Candidate One",
        email: `${testUser1Id}@example.com`,
        emailVerified: true,
      },
      {
        id: testUser2Id,
        name: "Resume Candidate Two",
        email: `${testUser2Id}@example.com`,
        emailVerified: true,
      },
    ]);
  });

  // Callers
  const unauthCaller = createCaller({ session: null, headers: new Headers() });
  const user1Caller = createCaller({
    session: {
      session: { id: "s1", expiresAt: new Date(Date.now() + 86400000) } as any,
      user: { id: testUser1Id, email: `${testUser1Id}@example.com`, name: "Candidate 1" } as any,
    },
    headers: new Headers(),
  });
  const user2Caller = createCaller({
    session: {
      session: { id: "s2", expiresAt: new Date(Date.now() + 86400000) } as any,
      user: { id: testUser2Id, email: `${testUser2Id}@example.com`, name: "Candidate 2" } as any,
    },
    headers: new Headers(),
  });

  await t.test("3.1 Unauthenticated requests cannot access any resume procedures", async () => {
    await assert.rejects(
      async () => unauthCaller.resume.upload({
        fileName: "resume.pdf",
        fileBase64: validPdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      }),
      { code: "UNAUTHORIZED" }
    );

    await assert.rejects(
      async () => unauthCaller.resume.list(),
      { code: "UNAUTHORIZED" }
    );

    await assert.rejects(
      async () => unauthCaller.resume.get({ id: "any_id" }),
      { code: "UNAUTHORIZED" }
    );

    await assert.rejects(
      async () => unauthCaller.resume.delete({ id: "any_id" }),
      { code: "UNAUTHORIZED" }
    );
  });

  let uploadedResumeId = "";
  let uploadedStorageKey = "";

  await t.test("3.2 Authenticated user can upload resume with server-derived ownership", async () => {
    const uploaded = await user1Caller.resume.upload({
      fileName: "My_Original_Resume.pdf",
      fileBase64: validPdfBuffer.toString("base64"),
      mimeType: "application/pdf",
    });

    assert.ok(uploaded.id, "Uploaded resume must have an ID");
    assert.equal(uploaded.fileName, "My_Original_Resume.pdf");
    assert.equal(uploaded.mimeType, "application/pdf");
    assert.equal(uploaded.fileSize, validPdfBuffer.length);
    assert.equal(uploaded.status, "UPLOADED", "Initial lifecycle status must be UPLOADED");
    assert.ok(uploaded.candidateProfileId, "Must link to candidateProfileId");
    assert.ok(uploaded.createdAt, "Must have createdAt timestamp");

    uploadedResumeId = uploaded.id;

    // Verify row in PostgreSQL resumes table
    const [row] = await db.select().from(resumes).where(eq(resumes.id, uploadedResumeId));
    assert.ok(row, "Resume metadata must be persisted in PostgreSQL");
    assert.equal(row.status, "UPLOADED");
    assert.equal(row.fileSize, validPdfBuffer.length);
    assert.ok(row.storageKey, "Storage key must be set");
    uploadedStorageKey = row.storageKey;

    // Verify candidate profile was auto-initialized and linked
    const [profile] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser1Id));
    assert.ok(profile, "Candidate profile must exist");
    assert.equal(row.candidateProfileId, profile.id, "Resume must belong to user 1's profile");
  });

  await t.test("3.3 Authenticated user can retrieve their own resume metadata via tRPC", async () => {
    const resume = await user1Caller.resume.get({ id: uploadedResumeId });
    assert.ok(resume);
    assert.equal(resume.id, uploadedResumeId);
    assert.equal(resume.fileName, "My_Original_Resume.pdf");
    assert.equal(resume.status, "UPLOADED");
  });

  await t.test("3.4 Authenticated user can list their resumes", async () => {
    const list = await user1Caller.resume.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, uploadedResumeId);
  });

  await t.test("3.5 Cross-user isolation: User 2 cannot see User 1's resume in list", async () => {
    const list2 = await user2Caller.resume.list();
    assert.equal(list2.length, 0, "User 2 must have an empty resume list");
  });

  await t.test("3.6 Cross-user isolation: User 2 cannot get User 1's resume (FORBIDDEN)", async () => {
    // Auto-initialize profile for User 2 so user 2 has a valid candidateProfile
    await user2Caller.candidate.createProfile();

    await assert.rejects(
      async () => user2Caller.resume.get({ id: uploadedResumeId }),
      { code: "FORBIDDEN" },
      "Accessing another user's resume must throw FORBIDDEN"
    );
  });

  await t.test("3.7 Cross-user isolation: User 2 cannot delete User 1's resume (FORBIDDEN)", async () => {
    await assert.rejects(
      async () => user2Caller.resume.delete({ id: uploadedResumeId }),
      { code: "FORBIDDEN" },
      "Deleting another user's resume must throw FORBIDDEN"
    );

    // Verify resume still intact in database
    const [row] = await db.select().from(resumes).where(eq(resumes.id, uploadedResumeId));
    assert.ok(row, "User 1's resume must still exist after unauthorized delete attempt");
  });

  await t.test("3.8 Client cannot supply ownership fields to upload procedure", async () => {
    await assert.rejects(
      async () =>
        user1Caller.resume.upload({
          fileName: "hack.pdf",
          fileBase64: validPdfBuffer.toString("base64"),
          mimeType: "application/pdf",
          userId: "hacked_user_id",
        } as any),
      { code: "BAD_REQUEST" }
    );

    await assert.rejects(
      async () =>
        user1Caller.resume.upload({
          fileName: "hack.pdf",
          fileBase64: validPdfBuffer.toString("base64"),
          mimeType: "application/pdf",
          candidateProfileId: "hacked_profile_id",
        } as any),
      { code: "BAD_REQUEST" }
    );
  });

  await t.test("3.9 Uploading invalid file format via tRPC returns BAD_REQUEST", async () => {
    await assert.rejects(
      async () =>
        user1Caller.resume.upload({
          fileName: "malicious.exe",
          fileBase64: Buffer.from("MZ malicious executable code").toString("base64"),
          mimeType: "application/x-msdownload",
        }),
      { code: "BAD_REQUEST" }
    );
  });

  await t.test("3.10 Authenticated user can delete their own resume", async () => {
    const deleteRes = await user1Caller.resume.delete({ id: uploadedResumeId });
    assert.deepEqual(deleteRes, { success: true, deletedId: uploadedResumeId });

    // Verify deleted from PostgreSQL
    const [row] = await db.select().from(resumes).where(eq(resumes.id, uploadedResumeId));
    assert.equal(row, undefined, "Resume row must be removed from PostgreSQL");

    // Verify get now returns NOT_FOUND
    await assert.rejects(
      async () => user1Caller.resume.get({ id: uploadedResumeId }),
      { code: "NOT_FOUND" }
    );
  });

  await t.test("3.11 Deleting nonexistent resume returns NOT_FOUND", async () => {
    await assert.rejects(
      async () => user1Caller.resume.delete({ id: "nonexistent_resume_id" }),
      { code: "NOT_FOUND" }
    );
  });

  // -------------------------------------------------------------------------
  // SECTION 4: Teardown & Clean State Verification
  // -------------------------------------------------------------------------
  await t.test("Teardown: Verify clean PostgreSQL and filesystem state", async () => {
    await cleanupDb();
    await cleanupStorageDir();

    // Verify no leftover test users or resumes
    const checkUsers = await db.select().from(user).where(eq(user.id, testUser1Id));
    assert.equal(checkUsers.length, 0, "No test user 1 remaining");

    const checkResumes = await db.select().from(resumes).where(eq(resumes.id, uploadedResumeId));
    assert.equal(checkResumes.length, 0, "No test resume remaining");

    const { queryClient } = await import("@job-hub/db");
    await queryClient.end();
  });
});
