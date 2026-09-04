/**
 * Job Hub — Phase 8 / Step 8.1
 * Browser Agent Database Schema & Migration Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  applications,
  browserExecutions,
  type BrowserFieldMapping,
  type BrowserUploadedDocument,
  type BrowserAuditLogEntry,
} from "@job-hub/db";
import { eq } from "drizzle-orm";

test("Phase 8 / Step 8.1 — Browser Agent Database Schema & Migration Test Suite", async (t) => {
  const testUserId1 = `usr_p81_1_${Date.now()}`;
  const testUserId2 = `usr_p81_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let jobId: string;
  let applicationId: string;
  let executionId: string;

  await t.test("1. Migration Integrity Gate: 0016 migration exists and is registered", async () => {
    const journalPath = path.resolve(process.cwd(), "packages/db/drizzle/meta/_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const entry16 = journal.entries.find((e: { idx: number }) => e.idx === 16);
    assert.ok(entry16, "Entry 16 must exist in Drizzle migration journal");
    assert.equal(entry16.tag, "0016_noisy_wallow");

    const sqlPath = path.resolve(process.cwd(), "packages/db/drizzle/0016_noisy_wallow.sql");
    assert.ok(fs.existsSync(sqlPath), "0016_noisy_wallow.sql migration file must exist");
  });

  await t.test("Setup: Create candidate profiles, job, and application", async () => {
    await db.insert(users).values([
      { id: testUserId1, name: "Candidate One", email: `${testUserId1}@example.com` },
      { id: testUserId2, name: "Candidate Two", email: `${testUserId2}@example.com` },
    ]);

    const [c1] = await db.insert(candidateProfiles).values({
      userId: testUserId1,
      headline: "Staff Engineer",
    }).returning();
    candidate1Id = c1!.id;

    const [c2] = await db.insert(candidateProfiles).values({
      userId: testUserId2,
      headline: "Lead Engineer",
    }).returning();
    candidate2Id = c2!.id;

    const [j] = await db.insert(jobs).values({
      title: "Senior Full Stack Engineer",
      company: "Acme Corp",
      location: "Remote",
      source: "remoteok",
      applicationUrl: "https://example.com/jobs/senior-fullstack/apply",
    }).returning();
    jobId = j!.id;

    const [app] = await db.insert(applications).values({
      candidateProfileId: candidate1Id,
      jobId,
      company: "Acme Corp",
      role: "Senior Full Stack Engineer",
      source: "remoteok",
      applicationUrl: "https://example.com/jobs/senior-fullstack/apply",
      status: "PREPARED",
    }).returning();
    applicationId = app!.id;
  });

  await t.test("2. Persistence: Insert browser execution record with structured metadata", async () => {
    const sampleFieldMappings: BrowserFieldMapping[] = [
      {
        fieldId: "fld_1",
        selector: "input[name='fullName']",
        name: "fullName",
        label: "Full Name",
        fieldType: "text",
        semanticType: "full_name",
        classification: "KNOWN",
        value: "Candidate One",
        filled: true,
        confidence: "VERIFIED",
      },
      {
        fieldId: "fld_2",
        selector: "input[name='visaRequired']",
        name: "visaRequired",
        label: "Do you require visa sponsorship?",
        fieldType: "radio",
        semanticType: "sensitive_sponsorship",
        classification: "UNSAFE",
        filled: false,
        requiresUserInput: true,
        confidence: "USER_REQUIRED",
        reason: "Sensitive immigration status question requires explicit candidate confirmation",
      },
    ];

    const sampleDocuments: BrowserUploadedDocument[] = [
      {
        documentType: "RESUME",
        documentId: "res_doc_1",
        fileName: "tailored_resume_acme.pdf",
        fileSize: 10240,
        version: "v1",
        uploaded: true,
        uploadedAt: new Date().toISOString(),
      },
    ];

    const sampleAuditLog: BrowserAuditLogEntry[] = [
      {
        timestamp: new Date().toISOString(),
        step: "NAVIGATING",
        action: "GOTO_URL",
        status: "SUCCESS",
        message: "Successfully navigated to https://example.com/jobs/senior-fullstack/apply",
      },
      {
        timestamp: new Date().toISOString(),
        step: "DETECTING_FORM",
        action: "DETECT_FORM",
        status: "SUCCESS",
        message: "Detected application form container",
      },
    ];

    const [rec] = await db.insert(browserExecutions).values({
      applicationId,
      candidateProfileId: candidate1Id,
      targetUrl: "https://example.com/jobs/senior-fullstack/apply",
      detectedDomain: "example.com",
      status: "PAUSED_FOR_REVIEW",
      formDetected: true,
      mappedFields: sampleFieldMappings,
      uploadedDocuments: sampleDocuments,
      safetyStopReason: "SENSITIVE_QUESTION_PAUSE",
      safetyDetails: { question: "Do you require visa sponsorship?" },
      auditLog: sampleAuditLog,
    }).returning();

    assert.ok(rec, "Record must be inserted");
    executionId = rec.id;
    assert.equal(rec.applicationId, applicationId);
    assert.equal(rec.candidateProfileId, candidate1Id);
    assert.equal(rec.status, "PAUSED_FOR_REVIEW");
    assert.equal(rec.formDetected, true);
    assert.equal(rec.mappedFields?.length, 2);
    assert.equal(rec.mappedFields?.[0]?.classification, "KNOWN");
    assert.equal(rec.mappedFields?.[1]?.classification, "UNSAFE");
    assert.equal(rec.uploadedDocuments?.length, 1);
    assert.equal(rec.uploadedDocuments?.[0]?.documentType, "RESUME");
    assert.equal(rec.auditLog?.length, 2);
  });

  await t.test("3. Query & Candidate Isolation Gate: Query execution by candidateProfileId", async () => {
    // Candidate 1 finds execution
    const [c1Record] = await db
      .select()
      .from(browserExecutions)
      .where(eq(browserExecutions.candidateProfileId, candidate1Id));
    assert.ok(c1Record, "Candidate 1 must find execution");
    assert.equal(c1Record.id, executionId);

    // Candidate 2 query returns empty
    const c2Records = await db
      .select()
      .from(browserExecutions)
      .where(eq(browserExecutions.candidateProfileId, candidate2Id));
    assert.equal(c2Records.length, 0, "Candidate 2 must not see Candidate 1's browser execution");
  });

  await t.test("4. Status Update Gate: Can update execution status and approval fields", async () => {
    const approvedAt = new Date();
    const [updated] = await db
      .update(browserExecutions)
      .set({
        status: "AWAITING_APPROVAL",
        userApproved: true,
        userApprovedAt: approvedAt,
      })
      .where(eq(browserExecutions.id, executionId))
      .returning();

    assert.equal(updated?.status, "AWAITING_APPROVAL");
    assert.equal(updated?.userApproved, true);
    assert.ok(updated?.userApprovedAt);
  });

  await t.test("5. Cascade Deletion Gate: Deleting application cascades to browser execution", async () => {
    await db.delete(applications).where(eq(applications.id, applicationId));

    const remaining = await db
      .select()
      .from(browserExecutions)
      .where(eq(browserExecutions.id, executionId));
    assert.equal(remaining.length, 0, "Browser execution must be cascade-deleted when application is deleted");
  });

  await t.test("Teardown: Clean up test fixtures", async () => {
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate1Id));
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, candidate2Id));
    await db.delete(jobs).where(eq(jobs.id, jobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));
  });
});
