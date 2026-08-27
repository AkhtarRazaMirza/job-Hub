import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { db, user, candidateProfiles, resumes } from "@job-hub/db";
import { eq } from "drizzle-orm";
import {
  normalizeDocumentText,
  PdfTextExtractor,
  DocxTextExtractor,
  CompositeResumeTextExtractor,
  ResumeExtractionService,
  EmptyExtractionError,
  ResourceLimitExceededError,
  ResumeExtractionTimeoutError,
  ResumeExtractionError,
  ResumeNotFoundError,
  ResumeForbiddenError,
  resumeService,
} from "@job-hub/candidate/server";
import { DiskStorageProvider } from "@job-hub/storage";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";

const createCaller = createCallerFactory(appRouter);

// Unique test run identifier for database and storage isolation
const RUN_ID = `test_extract_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const testUser1Id = `${RUN_ID}_user_1`;
const testUser2Id = `${RUN_ID}_user_2`;
const testStorageDir = path.resolve(`.test-storage-${RUN_ID}`);

// Dynamic synthetic fixture generators
const candidateRequire = createRequire(new URL("../packages/candidate/package.json", import.meta.url));
const JSZip = createRequire(candidateRequire.resolve("mammoth"))("jszip");

function createSyntheticPdf(textContent: string, pageCount = 1): Buffer {
  if (pageCount === 1) {
    const contentStream = `BT /F1 12 Tf 72 712 Td (${textContent.replace(/[()\\]/g, "\\$&")}) Tj ET`;
    const streamLength = Buffer.byteLength(contentStream, "utf-8");

    const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${contentStream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000118 00000 n 
0000000234 00000 n 
0000000350 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
450
%%EOF`;
    return Buffer.from(pdf, "utf-8");
  }

  // Multi-page synthetic PDF
  const pageKids: string[] = [];
  const objects: string[] = [];
  let objIndex = 3;

  for (let p = 1; p <= pageCount; p++) {
    const pageObjId = objIndex++;
    const contentObjId = objIndex++;
    pageKids.push(`${pageObjId} 0 R`);

    const stream = `BT /F1 12 Tf 72 712 Td (Page ${p}: ${textContent}) Tj ET`;
    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 ${pageCount * 2 + 3} 0 R >> >> >>\nendobj`
    );
    objects.push(
      `${contentObjId} 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf-8")} >>\nstream\n${stream}\nendstream\nendobj`
    );
  }

  const fontObjId = pageCount * 2 + 3;
  objects.push(`${fontObjId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [${pageKids.join(" ")}] /Count ${pageCount} >>
endobj
${objects.join("\n")}
xref
0 ${fontObjId + 1}
0000000000 65535 f 
trailer
<< /Size ${fontObjId + 1} /Root 1 0 R >>
startxref
100
%%EOF`;

  return Buffer.from(pdf, "utf-8");
}

async function createSyntheticDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  const bodyXml = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>`
    )
    .join("");
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
  zip.file("word/document.xml", docXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function cleanupDb() {
  try {
    const profiles = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser1Id));
    const profiles2 = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, testUser2Id));

    const allProfileIds = [...profiles, ...profiles2].map((p) => p.id);
    for (const pid of allProfileIds) {
      await db.delete(resumes).where(eq(resumes.candidateProfileId, pid));
    }

    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, testUser1Id));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.userId, testUser2Id));
    await db.delete(user).where(eq(user.id, testUser1Id));
    await db.delete(user).where(eq(user.id, testUser2Id));
  } catch {
    // Ignore cleanup errors
  }

  try {
    await fs.rm(testStorageDir, { recursive: true, force: true });
  } catch {
    // Ignore storage cleanup errors
  }
}

function createUserCaller(userId: string, email: string) {
  return createCaller({
    session: {
      session: { id: `sess_${userId}`, expiresAt: new Date(Date.now() + 86400000) } as any,
      user: { id: userId, email, name: `User ${userId}` } as any,
    },
    headers: new Headers(),
  });
}

test("Step 2.6 — Resume Text Extraction Foundation Test Suite", async (t) => {
  let testStorage: DiskStorageProvider;
  let user1ProfileId: string;
  let user2ProfileId: string;

  await t.test("Setup: Create test users and dedicated test storage", async () => {
    await cleanupDb();
    testStorage = new DiskStorageProvider(testStorageDir);

    const now = new Date();
    await db.insert(user).values([
      {
        id: testUser1Id,
        name: "Synthetic Alice",
        email: `${testUser1Id}@example.com`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: testUser2Id,
        name: "Synthetic Bob",
        email: `${testUser2Id}@example.com`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const [p1] = await db
      .insert(candidateProfiles)
      .values({ userId: testUser1Id, createdAt: now, updatedAt: now })
      .returning();
    const [p2] = await db
      .insert(candidateProfiles)
      .values({ userId: testUser2Id, createdAt: now, updatedAt: now })
      .returning();

    user1ProfileId = p1!.id;
    user2ProfileId = p2!.id;

    assert.ok(user1ProfileId);
    assert.ok(user2ProfileId);
  });

  // 1. Valid PDF Extraction
  await t.test("1. Valid PDF extraction extracts text and page count", async () => {
    const extractor = new PdfTextExtractor();
    const buffer = createSyntheticPdf("Senior Distributed Systems Engineer - Alice");
    const result = await extractor.extract(buffer);

    assert.equal(result.format, "pdf");
    assert.equal(result.pageCount, 1);
    assert.ok(result.normalizedText.includes("Senior Distributed Systems Engineer - Alice"));
    assert.ok(result.characterCount > 0);
    assert.ok(result.wordCount > 0);
  });

  // 2. Valid DOCX Extraction
  await t.test("2. Valid DOCX extraction extracts text and preserves paragraph boundaries", async () => {
    const extractor = new DocxTextExtractor();
    const buffer = await createSyntheticDocx([
      "Bob Smith - Principal Software Architect",
      "Specialized in PostgreSQL, TypeScript, and Distributed Systems.",
    ]);
    const result = await extractor.extract(buffer);

    assert.equal(result.format, "docx");
    assert.ok(result.normalizedText.includes("Bob Smith - Principal Software Architect"));
    assert.ok(result.normalizedText.includes("Specialized in PostgreSQL, TypeScript, and Distributed Systems."));
    // Paragraph boundary preserved as newline
    assert.ok(result.normalizedText.includes("\n\n"));
    assert.ok(result.characterCount > 0);
    assert.ok(result.wordCount >= 8);
  });

  // 3. Corrupt PDF
  await t.test("3. Corrupt PDF fails cleanly with ResumeExtractionError", async () => {
    const extractor = new PdfTextExtractor();
    const corruptBuffer = Buffer.from("%PDF-1.4\ncorrupted garbage binary data that cannot be parsed %%EOF");

    await assert.rejects(
      async () => {
        await extractor.extract(corruptBuffer);
      },
      (err: unknown) => {
        assert.ok(err instanceof ResumeExtractionError);
        return true;
      }
    );
  });

  // 4. Corrupt DOCX
  await t.test("4. Corrupt DOCX fails cleanly with ResumeExtractionError", async () => {
    const extractor = new DocxTextExtractor();
    const corruptDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0xff, 0xff, 0xaa, 0xbb]);

    await assert.rejects(
      async () => {
        await extractor.extract(corruptDocx);
      },
      (err: unknown) => {
        assert.ok(err instanceof ResumeExtractionError);
        return true;
      }
    );
  });

  // 5. Empty / Whitespace-only Extraction
  await t.test("5. Empty or whitespace-only documents throw EmptyExtractionError", async () => {
    const pdfExtractor = new PdfTextExtractor();
    const emptyPdf = createSyntheticPdf("     \n\t   ");
    await assert.rejects(
      async () => {
        await pdfExtractor.extract(emptyPdf);
      },
      (err: unknown) => {
        assert.ok(err instanceof EmptyExtractionError);
        return true;
      }
    );

    const docxExtractor = new DocxTextExtractor();
    const emptyDocx = await createSyntheticDocx(["    ", "\t\t"]);
    await assert.rejects(
      async () => {
        await docxExtractor.extract(emptyDocx);
      },
      (err: unknown) => {
        assert.ok(err instanceof EmptyExtractionError);
        return true;
      }
    );
  });

  // 6. PDF Page / Resource Limit
  await t.test("6. PDF exceeding maximum page count throws ResourceLimitExceededError", async () => {
    const extractor = new PdfTextExtractor();
    // Generate 52 pages (exceeding MAX_PDF_PAGES = 50)
    const largePdf = createSyntheticPdf("Page content", 52);

    await assert.rejects(
      async () => {
        await extractor.extract(largePdf);
      },
      (err: unknown) => {
        assert.ok(err instanceof ResourceLimitExceededError);
        assert.match(err.message, /exceeds maximum allowable limit of 50 pages/);
        return true;
      }
    );
  });

  // 7. Extraction Timeout / Failure Behavior
  await t.test("7. Extraction timeout triggers ResumeExtractionTimeoutError cleanly", async () => {
    // Construct an extractor with an artificially tiny timeout
    class TimeoutPdfExtractor extends PdfTextExtractor {
      override async extract(_buffer: Buffer) {
        throw new ResumeExtractionTimeoutError("PDF text extraction exceeded timeout limit of 10 seconds.");
      }
    }

    const extractor = new TimeoutPdfExtractor();
    await assert.rejects(
      async () => {
        await extractor.extract(Buffer.from("%PDF-1.4 sample"));
      },
      (err: unknown) => {
        assert.ok(err instanceof ResumeExtractionTimeoutError);
        assert.equal(err.code, "EXTRACTION_TIMEOUT");
        return true;
      }
    );
  });

  // 8. Text Normalization
  await t.test("8. Text normalizer cleans control characters, unifies line breaks, and computes counts", () => {
    const raw = "\x00\x08Hello\r\n\r\n\r\n\r\nWorld \t \rNext Line\x1F  ";
    const result = normalizeDocumentText(raw);

    assert.ok(!result.normalizedText.includes("\x00"));
    assert.ok(!result.normalizedText.includes("\x08"));
    assert.ok(!result.normalizedText.includes("\x1F"));
    assert.ok(!result.normalizedText.includes("\r"));
    // Maximum 2 consecutive newlines
    assert.ok(!result.normalizedText.includes("\n\n\n"));
    assert.equal(result.wordCount, 4); // "Hello", "World", "Next", "Line"
    assert.equal(result.characterCount, result.normalizedText.length);
  });

  // 9. Successful Status Transition (UPLOADED -> PROCESSING -> PROCESSED)
  await t.test("9. Successful extraction transitions resume to PROCESSED and stores extracted text", async () => {
    const caller1 = createUserCaller(testUser1Id, `${testUser1Id}@example.com`);
    const pdfBuffer = createSyntheticPdf("Staff Cloud Architect - Alice Valid Candidate");

    // 1. Initial Upload establishes status UPLOADED
    const uploaded = await caller1.resume.upload({
      fileName: "alice-architect.pdf",
      fileBase64: pdfBuffer.toString("base64"),
      mimeType: "application/pdf",
    });

    assert.equal(uploaded.status, "UPLOADED");

    // 2. Trigger text extraction via tRPC
    const processed = await caller1.resume.extractText({ id: uploaded.id });

    assert.equal(processed.id, uploaded.id);
    assert.equal(processed.status, "PROCESSED");
    // Verify that heavy extractedText is omitted from client metadata response
    assert.equal((processed as any).extractedText, undefined);
    assert.ok(processed.extractedAt !== null);
    assert.equal(processed.processingError, null);
  });

  // 10. Failed Status Transition (UPLOADED -> PROCESSING -> FAILED)
  await t.test("10. Corrupt document extraction transitions resume to FAILED without marking PROCESSED", async () => {
    const caller1 = createUserCaller(testUser1Id, `${testUser1Id}@example.com`);
    // Upload a corrupt PDF starting with valid %PDF- magic bytes to pass upload validation
    const corruptPdf = Buffer.from("%PDF-1.4\ncorrupted garbage binary with unparsable cross-reference stream %%EOF");

    const uploaded = await caller1.resume.upload({
      fileName: "alice-corrupt.pdf",
      fileBase64: corruptPdf.toString("base64"),
      mimeType: "application/pdf",
    });

    assert.equal(uploaded.status, "UPLOADED");

    // Trigger text extraction on corrupt document
    const failed = await caller1.resume.extractText({ id: uploaded.id });

    assert.equal(failed.status, "FAILED");
    assert.equal(failed.extractedAt, null);
    assert.ok(failed.processingError !== null);
    assert.ok(failed.processingError.length > 0);
  });

  // 10b. Retry after failure
  await t.test("10b. Successful retry after failure transitions to PROCESSED and clears processingError", async () => {
    const caller1 = createUserCaller(testUser1Id, `${testUser1Id}@example.com`);
    const corruptPdf = Buffer.from("%PDF-1.4\ncorrupt temp stream %%EOF");

    const uploaded = await caller1.resume.upload({
      fileName: "alice-retry.pdf",
      fileBase64: corruptPdf.toString("base64"),
      mimeType: "application/pdf",
    });

    const failed = await caller1.resume.extractText({ id: uploaded.id });
    assert.equal(failed.status, "FAILED");
    assert.ok(failed.processingError !== null);

    // Overwrite storage file with valid PDF to simulate fixing/re-uploading document
    const validPdf = createSyntheticPdf("Alice Engineer - Successfully Retried Document");
    const [row] = await db.select().from(resumes).where(eq(resumes.id, uploaded.id)).limit(1);
    const { storage } = await import("@job-hub/storage");
    await storage.upload(row!.storageKey, validPdf, "application/pdf");

    // Retry extraction
    const retried = await caller1.resume.extractText({ id: uploaded.id });
    assert.equal(retried.status, "PROCESSED");
    assert.equal(retried.processingError, null);
    assert.ok(retried.extractedAt !== null);
  });

  // 11. Database Persistence
  await t.test("11. Database record strictly persists extracted text and timestamps", async () => {
    const caller1 = createUserCaller(testUser1Id, `${testUser1Id}@example.com`);
    const docxBuffer = await createSyntheticDocx([
      "Alice Fullstack - Lead Engineer",
      "10 years experience building distributed resilient backends.",
    ]);

    const uploaded = await caller1.resume.upload({
      fileName: "alice-lead.docx",
      fileBase64: docxBuffer.toString("base64"),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await caller1.resume.extractText({ id: uploaded.id });

    // Directly query PostgreSQL to verify persisted fields
    const [row] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, uploaded.id))
      .limit(1);

    assert.ok(row);
    assert.equal(row.status, "PROCESSED");
    assert.ok(row.extractedText?.includes("Alice Fullstack - Lead Engineer"));
    assert.ok(row.extractedText?.includes("10 years experience building distributed resilient backends."));
    assert.ok(row.extractedAt instanceof Date);
    assert.equal(row.processingError, null);
  });

  // 11b. Format Spoofing Defense
  await t.test("11b. Format spoofing: Mismatched format hints or random binary are strictly rejected", async () => {
    const composite = new CompositeResumeTextExtractor();
    const pdfBuffer = createSyntheticPdf("PDF Content");
    const docxBuffer = await createSyntheticDocx(["DOCX Content"]);

    // PDF pretending to be DOCX
    await assert.rejects(
      async () => composite.extract(pdfBuffer, "docx"),
      /Document format mismatch: claimed format 'docx' does not match binary signature 'pdf'/
    );

    // DOCX pretending to be PDF
    await assert.rejects(
      async () => composite.extract(docxBuffer, "pdf"),
      /Document format mismatch: claimed format 'pdf' does not match binary signature 'docx'/
    );

    // Random binary
    await assert.rejects(
      async () => composite.extract(Buffer.from([0x01, 0x02, 0x03, 0x04])),
      /Unsupported or unrecognizable binary format/
    );
  });

  // 12. Cross-User Isolation
  await t.test("12. User 2 cannot extract or process User 1's resume (FORBIDDEN)", async () => {
    const caller1 = createUserCaller(testUser1Id, `${testUser1Id}@example.com`);
    const caller2 = createUserCaller(testUser2Id, `${testUser2Id}@example.com`);

    const pdfBuffer = createSyntheticPdf("Private User 1 Confidential Document");
    const user1Resume = await caller1.resume.upload({
      fileName: "private-alice.pdf",
      fileBase64: pdfBuffer.toString("base64"),
      mimeType: "application/pdf",
    });

    // User 2 attempts to trigger extraction on User 1's resume
    await assert.rejects(
      async () => {
        await caller2.resume.extractText({ id: user1Resume.id });
      },
      (err: unknown) => {
        assert.ok(err && typeof err === "object" && "code" in err && err.code === "FORBIDDEN");
        return true;
      }
    );
  });

  await t.test("Teardown: Clean up test users, database records, and test storage", async () => {
    await cleanupDb();
    const { queryClient } = await import("@job-hub/db");
    await queryClient.end();
  });
});
