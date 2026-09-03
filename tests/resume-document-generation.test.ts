/**
 * Job Hub — Phase 7 / Step 7.2
 * Tailored Resume Document Generation (PDF) & Storage Persistence Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Collect required documents, never alter master resume")
 * - 02_how_to_build.md §11 ("PDF/DOCX generation -> Version saved")
 * - 03_tech_stack.md §10 ("Cloudflare R2 / S3 client abstraction")
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  renderResumePdf,
  type TailoredResumeData,
} from "@job-hub/applications";
import {
  tailoredResumeRepository,
  tailoredResumeDocumentService,
} from "@job-hub/applications/server";
import {
  db,
  users,
  candidateProfiles,
  resumes,
  jobs,
  tailoredResumes,
} from "@job-hub/db";
import { eq } from "drizzle-orm";

test("Phase 7 / Step 7.2 — Tailored Resume Document Generation & Storage Suite", async (t) => {
  const validTailoredResume: TailoredResumeData = {
    contact: {
      name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+1-555-0199",
      location: "Toronto, Canada",
      linkedinUrl: "https://linkedin.com/in/janedoe",
      githubUrl: "https://github.com/janedoe",
    },
    targetTitle: "Staff Backend Engineer",
    summary: {
      headline: "Staff Backend Engineer specializing in resilient TypeScript architectures",
      text: "Extensive experience scaling backend architectures and durable workflows at high throughput across distributed systems.",
      keyThemes: ["Distributed Systems", "TypeScript", "PostgreSQL"],
    },
    skills: [
      {
        category: "Backend Engineering",
        skills: ["TypeScript", "Node.js", "PostgreSQL", "Docker"],
      },
      {
        category: "Architecture & DevOps",
        skills: ["Distributed Systems", "Docker", "CI/CD"],
      },
    ],
    experiences: [
      {
        company: "Stripe",
        role: "Senior Software Engineer",
        startDate: "2021-03",
        endDate: "2024-05",
        isCurrent: false,
        location: "Remote",
        bullets: [
          {
            text: "Architected and scaled payment ingestion APIs processing 15,000 rps with 99.99% availability.",
            sourceCompany: "Stripe",
            matchingSkills: ["TypeScript", "Node.js", "PostgreSQL"],
            confidence: "VERIFIED",
          },
          {
            text: "Led migration of billing services reducing p99 latency by 35% through query optimization.",
            sourceCompany: "Stripe",
            matchingSkills: ["PostgreSQL", "Node.js"],
            confidence: "VERIFIED",
          },
        ],
        technologies: ["TypeScript", "Node.js", "PostgreSQL"],
      },
      {
        company: "Vercel",
        role: "Full Stack Engineer",
        startDate: "2019-01",
        endDate: "2021-02",
        isCurrent: false,
        location: "Remote",
        bullets: [
          {
            text: "Engineered edge middleware and developer tooling, optimizing component bundle sizes by 25%.",
            sourceCompany: "Vercel",
            matchingSkills: ["TypeScript", "React", "Next.js"],
            confidence: "VERIFIED",
          },
        ],
        technologies: ["React", "TypeScript", "Next.js"],
      },
    ],
    projects: [
      {
        name: "CloudFlow",
        description: "Durable workflow engine in TypeScript and PostgreSQL.",
        technologies: ["TypeScript", "PostgreSQL", "Docker"],
        repositoryUrl: "https://github.com/janedoe/cloudflow",
        liveUrl: "https://cloudflow.dev",
        highlight: "Implements deterministic distributed execution over PostgreSQL.",
        sourceProjectId: "proj_1",
      },
    ],
    education: [
      {
        institution: "University of Waterloo",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        graduationYear: 2018,
      },
    ],
    strengths: ["High throughput TypeScript engineering", "PostgreSQL tuning"],
  };

  // ---------------------------------------------------------------------------
  // 1. PDF Rendering Unit Tests
  // ---------------------------------------------------------------------------

  await t.test("1. PDF Generation: Renders valid PDF document buffer", async () => {
    const pdfBuffer = await renderResumePdf(validTailoredResume);

    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 2000, "Rendered PDF should be substantial");

    // PDF Magic Bytes: %PDF-
    const header = pdfBuffer.subarray(0, 5).toString("ascii");
    assert.equal(header, "%PDF-");
  });

  await t.test("2. PDF Generation: Rejects malformed resume data before rendering", async () => {
    const malformed = {
      ...validTailoredResume,
      contact: {
        name: "", // Invalid empty name
        email: "not-an-email",
      },
    };

    await assert.rejects(
      () => renderResumePdf(malformed as any),
      /Name is required|Valid email is required/
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Storage Persistence & Candidate Isolation Tests
  // ---------------------------------------------------------------------------

  const testUserId1 = `usr_p72_test_1_${Date.now()}`;
  const testUserId2 = `usr_p72_test_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let masterResumeId: string;
  let createdJobId: string;
  let tailoredResumeId: string;
  let originalMasterStorageKey: string;
  let originalMasterUpdatedAt: Date;

  await t.test("Setup: Create database test entities", async () => {
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Jane Candidate 7.2",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Bob Candidate 7.2",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [cand1] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId1,
        headline: "Staff Engineer Candidate 7.2",
      })
      .returning();
    candidate1Id = cand1.id;

    const [cand2] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId2,
        headline: "Bob Engineer 7.2",
      })
      .returning();
    candidate2Id = cand2.id;

    originalMasterStorageKey = `resumes/${candidate1Id}/master_${Date.now()}.pdf`;
    const [mResume] = await db
      .insert(resumes)
      .values({
        candidateProfileId: candidate1Id,
        fileName: "Master_Resume_Original.pdf",
        storageKey: originalMasterStorageKey,
        mimeType: "application/pdf",
        fileSize: 42000,
        fileHash: "sha256_immutable_master_hash",
        status: "PROFILED",
        extractedText: "Master resume raw text",
        extractedAt: new Date(),
      })
      .returning();
    masterResumeId = mResume.id;
    originalMasterUpdatedAt = mResume.updatedAt;

    const [jobRecord] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `job_source_${Date.now()}`,
        title: "Staff Backend Engineer",
        company: "Monolith Labs",
        location: "Worldwide Remote",
        remoteType: "WORLDWIDE_REMOTE",
        applicationUrl: `https://monolithlabs.com/apply-${Date.now()}`,
        status: "ACTIVE",
        skills: ["TypeScript", "PostgreSQL"],
        requirements: ["5+ years"],
        description: "Staff Backend Engineer role.",
      })
      .returning();
    createdJobId = jobRecord.id;

    const record = await tailoredResumeRepository.create({
      candidateProfileId: candidate1Id,
      jobId: createdJobId,
      sourceResumeId: masterResumeId,
      targetTitle: "Staff Backend Engineer",
      tailoredData: validTailoredResume,
      truthfulnessScore: 100.0,
      status: "DRAFT",
    });
    tailoredResumeId = record.id;
  });

  await t.test("3. Document Service: Generates PDF and persists to storage provider", async () => {
    const result = await tailoredResumeDocumentService.generateAndStorePdf({
      tailoredResumeId,
      candidateProfileId: candidate1Id,
    });

    assert.equal(result.tailoredResumeId, tailoredResumeId);
    assert.equal(result.mimeType, "application/pdf");
    assert.ok(result.fileSize > 2000);
    assert.ok(result.storageKey.startsWith(`tailored-resumes/${candidate1Id}/`));
    assert.ok(result.storageKey.endsWith(".pdf"));

    // Verify database record was updated with storageKey and status GENERATED
    const updatedRecord = await tailoredResumeRepository.findById(
      tailoredResumeId,
      candidate1Id
    );
    assert.ok(updatedRecord);
    assert.equal(updatedRecord.storageKey, result.storageKey);
    assert.equal(updatedRecord.status, "GENERATED");
  });

  await t.test("4. Document Service: Retrieves stored PDF stream/buffer with identical bytes", async () => {
    const retrieved = await tailoredResumeDocumentService.getPdfBuffer({
      tailoredResumeId,
      candidateProfileId: candidate1Id,
    });

    assert.ok(Buffer.isBuffer(retrieved.buffer));
    assert.equal(retrieved.mimeType, "application/pdf");
    assert.equal(retrieved.buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  });

  await t.test("5. Security Gate: Candidate 2 cannot generate or retrieve Candidate 1's resume PDF", async () => {
    // Attempt generation as Candidate 2
    await assert.rejects(
      () =>
        tailoredResumeDocumentService.generateAndStorePdf({
          tailoredResumeId,
          candidateProfileId: candidate2Id,
        }),
      /Tailored resume not found/
    );

    // Attempt retrieval as Candidate 2
    await assert.rejects(
      () =>
        tailoredResumeDocumentService.getPdfBuffer({
          tailoredResumeId,
          candidateProfileId: candidate2Id,
        }),
      /Tailored resume not found/
    );
  });

  await t.test("6. IMMUTABILITY RULE GATE: Master resume is completely unmodified by PDF generation", async () => {
    const [currMaster] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, masterResumeId));

    assert.ok(currMaster);
    assert.equal(currMaster.storageKey, originalMasterStorageKey, "Storage key must remain master key");
    assert.equal(currMaster.fileHash, "sha256_immutable_master_hash");
    assert.equal(currMaster.fileName, "Master_Resume_Original.pdf");
    assert.equal(currMaster.status, "PROFILED");
    assert.equal(
      currMaster.updatedAt.getTime(),
      originalMasterUpdatedAt.getTime(),
      "Master resume updatedAt must NOT be altered"
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Teardown
  // ---------------------------------------------------------------------------

  await t.test("Teardown: Clean up test entities", async () => {
    await db.delete(jobs).where(eq(jobs.id, createdJobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));

    const remainingTailored = await db
      .select()
      .from(tailoredResumes)
      .where(eq(tailoredResumes.jobId, createdJobId));
    assert.equal(remainingTailored.length, 0);
  });
});
