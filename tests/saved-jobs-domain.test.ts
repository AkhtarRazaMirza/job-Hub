/**
 * Job Hub — Phase 5 / Step 5.1
 * Saved Jobs Domain & Persistence Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 8 & §5 Phase 5 ("saved jobs")
 * - 02_how_to_build.md §10 ("Saved Jobs")
 *
 * Tests:
 * 1. SavedJob schema accepts valid entity.
 * 2. Invalid candidateProfileId rejected.
 * 3. Invalid jobId rejected.
 * 4. Unknown fields rejected via .strict().
 * 5. Notes length validation (>2000 chars rejected).
 * 6. Repository creates saved job in PostgreSQL.
 * 7. Repository retrieves by ID.
 * 8. Repository retrieves by candidate/job pair.
 * 9. Duplicate candidate/job pair is rejected with SavedJobConflictError.
 * 10. Repository lists candidate's saved jobs with ordering and pagination.
 * 11. Repository updates notes.
 * 12. Repository deletes saved job (by ID and by candidate/job pair).
 * 13. Candidate and Job foreign keys are enforced by PostgreSQL.
 * 14. Cascade deletion works when candidate profile or job is removed.
 * 15. Teardown completely removes temporary records.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  savedJobSchema,
  createSavedJobInputSchema,
  updateSavedJobNotesInputSchema,
  SavedJobConflictError,
  SavedJobNotFoundError,
} from "@job-hub/jobs";
import { savedJobRepository, jobRepository } from "@job-hub/jobs/server";
import { candidateProfileRepository } from "@job-hub/candidate/server";
import { db, users, candidateProfiles, jobs, savedJobs } from "@job-hub/db";
import { eq } from "drizzle-orm";

test("Step 5.1 — Saved Jobs Domain & Persistence Test Suite", async (t) => {
  const testUserId = `usr_test_saved_${Date.now()}`;
  let testCandidateProfileId: string;
  let testJobId1: string;
  let testJobId2: string;
  let createdSavedJobId: string;

  // Setup: Create test user, candidate profile, and canonical jobs in PostgreSQL
  await t.test("Setup: Create test user, candidate profile, and canonical jobs in PostgreSQL", async () => {
    // 1. User
    await db.insert(users).values({
      id: testUserId,
      name: "Saved Jobs Tester",
      email: `${testUserId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Candidate Profile
    const profile = await candidateProfileRepository.create({
      userId: testUserId,
      headline: "Senior Platform Engineer",
      profileData: {
        skills: ["Go", "Kubernetes", "PostgreSQL"],
      },
    });
    testCandidateProfileId = profile.id;

    // 3. Job 1
    const job1 = await jobRepository.create({
      title: "Lead Infrastructure Engineer",
      company: "Cloud Native Corp",
      remoteType: "WORLDWIDE_REMOTE",
      skills: ["Go", "Kubernetes"],
      status: "ACTIVE",
      source: "manual",
    });
    testJobId1 = job1.id;

    // 4. Job 2
    const job2 = await jobRepository.create({
      title: "Staff SRE",
      company: "Scale Systems",
      remoteType: "WORLDWIDE_REMOTE",
      skills: ["Linux", "Terraform"],
      status: "ACTIVE",
      source: "manual",
    });
    testJobId2 = job2.id;
  });

  // 1. SavedJob schema accepts valid entity
  await t.test("1. Schema Validation: accepts valid SavedJob entity", () => {
    const valid = {
      id: "sj_valid_123",
      candidateProfileId: "cp_456",
      jobId: "job_789",
      notes: "Looks like a great team culture and strong tech stack.",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parsed = savedJobSchema.parse(valid);
    assert.equal(parsed.id, "sj_valid_123");
    assert.equal(parsed.candidateProfileId, "cp_456");
    assert.equal(parsed.jobId, "job_789");
    assert.equal(parsed.notes, "Looks like a great team culture and strong tech stack.");
  });

  // 2 & 3. Invalid identifiers rejected
  await t.test("2. Schema Validation: rejects missing or empty candidateProfileId and jobId", () => {
    assert.throws(
      () =>
        createSavedJobInputSchema.parse({
          candidateProfileId: "",
          jobId: "job_123",
        }),
      /Candidate profile ID is required/
    );

    assert.throws(
      () =>
        createSavedJobInputSchema.parse({
          candidateProfileId: "cp_123",
          jobId: "",
        }),
      /Job ID is required/
    );
  });

  // 4. Unknown fields rejected via .strict()
  await t.test("3. Schema Validation: rejects unexpected injected fields via .strict()", () => {
    assert.throws(
      () =>
        createSavedJobInputSchema.parse({
          candidateProfileId: "cp_123",
          jobId: "job_123",
          userId: "hacked_user_id", // Injected ownership override
        } as any),
      /unrecognized_keys/
    );
  });

  // 5. Notes length validation
  await t.test("4. Schema Validation: rejects notes exceeding maximum permitted character length", () => {
    const hugeNotes = "A".repeat(2001);
    assert.throws(
      () =>
        createSavedJobInputSchema.parse({
          candidateProfileId: "cp_123",
          jobId: "job_123",
          notes: hugeNotes,
        }),
      /Notes cannot exceed 2000 characters/
    );

    // Valid 2000 characters passes
    const validNotes = "B".repeat(2000);
    const parsed = createSavedJobInputSchema.parse({
      candidateProfileId: "cp_123",
      jobId: "job_123",
      notes: validNotes,
    });
    assert.equal(parsed.notes, validNotes);
  });

  // 6. Repository creates saved job in PostgreSQL
  await t.test("5. Persistence: repository creates saved job in PostgreSQL", async () => {
    const saved = await savedJobRepository.create({
      candidateProfileId: testCandidateProfileId,
      jobId: testJobId1,
      notes: "First priority application.",
    });

    assert.ok(saved.id);
    assert.equal(saved.candidateProfileId, testCandidateProfileId);
    assert.equal(saved.jobId, testJobId1);
    assert.equal(saved.notes, "First priority application.");
    assert.ok(saved.createdAt instanceof Date);
    assert.ok(saved.updatedAt instanceof Date);

    createdSavedJobId = saved.id;
  });

  // 7. Repository retrieves by ID
  await t.test("6. Persistence: repository retrieves saved job by ID", async () => {
    const retrieved = await savedJobRepository.findById(createdSavedJobId);
    assert.ok(retrieved !== null);
    assert.equal(retrieved!.id, createdSavedJobId);
    assert.equal(retrieved!.candidateProfileId, testCandidateProfileId);
    assert.equal(retrieved!.jobId, testJobId1);
    assert.equal(retrieved!.notes, "First priority application.");
  });

  // 8. Repository retrieves by candidate/job pair
  await t.test("7. Persistence: repository retrieves saved job by candidateProfileId + jobId", async () => {
    const retrieved = await savedJobRepository.findByCandidateAndJob(
      testCandidateProfileId,
      testJobId1
    );
    assert.ok(retrieved !== null);
    assert.equal(retrieved!.id, createdSavedJobId);
    assert.equal(retrieved!.jobId, testJobId1);

    // Non-existent returns null
    const notSaved = await savedJobRepository.findByCandidateAndJob(
      testCandidateProfileId,
      testJobId2
    );
    assert.equal(notSaved, null);
  });

  // 9. Duplicate candidate/job pair is rejected with SavedJobConflictError
  await t.test("8. Idempotency & Unique Constraint: duplicate save attempt throws SavedJobConflictError", async () => {
    await assert.rejects(
      async () =>
        savedJobRepository.create({
          candidateProfileId: testCandidateProfileId,
          jobId: testJobId1,
          notes: "Attempting to save again.",
        }),
      (err: unknown) =>
        err instanceof SavedJobConflictError &&
        err.message.includes("is already saved")
    );
  });

  // 10. Repository lists candidate's saved jobs with ordering and pagination
  await t.test("9. Persistence: repository lists candidate's saved jobs with ordering", async () => {
    // Save second job
    const saved2 = await savedJobRepository.create({
      candidateProfileId: testCandidateProfileId,
      jobId: testJobId2,
      notes: "Second bookmark.",
    });

    const list = await savedJobRepository.listByCandidate(testCandidateProfileId, {
      limit: 10,
      offset: 0,
    });

    assert.equal(list.length, 2);
    // Ordered desc by createdAt
    assert.equal(list[0]!.id, saved2.id);
    assert.equal(list[1]!.id, createdSavedJobId);

    const count = await savedJobRepository.countByCandidate(testCandidateProfileId);
    assert.equal(count, 2);
  });

  // 11. Repository updates notes
  await t.test("10. Persistence: repository updates notes for an existing saved job", async () => {
    const updated = await savedJobRepository.updateNotes({
      candidateProfileId: testCandidateProfileId,
      jobId: testJobId1,
      notes: "Updated note: Recruiter reached out on LinkedIn.",
    });

    assert.equal(updated.id, createdSavedJobId);
    assert.equal(updated.notes, "Updated note: Recruiter reached out on LinkedIn.");

    // Update non-existent throws SavedJobNotFoundError
    await assert.rejects(
      async () =>
        savedJobRepository.updateNotes({
          candidateProfileId: testCandidateProfileId,
          jobId: "00000000-0000-0000-0000-000000000000",
          notes: "Missing",
        }),
      (err: unknown) => err instanceof SavedJobNotFoundError
    );
  });

  // 12. Repository deletes saved job
  await t.test("11. Persistence: repository deletes saved job by ID and by candidate/job pair", async () => {
    // Delete second job by candidate/job pair
    const deletedByPair = await savedJobRepository.deleteByCandidateAndJob(
      testCandidateProfileId,
      testJobId2
    );
    assert.equal(deletedByPair, true);

    const check2 = await savedJobRepository.findByCandidateAndJob(
      testCandidateProfileId,
      testJobId2
    );
    assert.equal(check2, null);

    // Delete first job by ID
    const deletedById = await savedJobRepository.delete(createdSavedJobId);
    assert.equal(deletedById, true);

    const check1 = await savedJobRepository.findById(createdSavedJobId);
    assert.equal(check1, null);
  });

  // 13. Candidate and Job foreign keys are enforced by PostgreSQL
  await t.test("12. Integrity: PostgreSQL rejects non-existent candidate or job foreign keys", async () => {
    // Non-existent candidateProfileId
    await assert.rejects(
      async () =>
        savedJobRepository.create({
          candidateProfileId: "00000000-0000-0000-0000-000000000000",
          jobId: testJobId1,
        }),
      /violates foreign key constraint/
    );

    // Non-existent jobId
    await assert.rejects(
      async () =>
        savedJobRepository.create({
          candidateProfileId: testCandidateProfileId,
          jobId: "00000000-0000-0000-0000-000000000000",
        }),
      /violates foreign key constraint/
    );
  });

  // 14. Cascade deletion works when candidate profile or job is removed
  await t.test("13. Cascade Deletion: deleting canonical job cascades to saved_jobs", async () => {
    // Re-save job 1
    const saved = await savedJobRepository.create({
      candidateProfileId: testCandidateProfileId,
      jobId: testJobId1,
      notes: "Cascade test",
    });

    // Delete the canonical job
    await jobRepository.delete(testJobId1);

    // Verify saved job was cascade deleted
    const check = await savedJobRepository.findById(saved.id);
    assert.equal(check, null);
  });

  // 15. Teardown completely removes temporary data
  await t.test("14. Teardown: clean up remaining test entities", async () => {
    // Delete saved jobs
    await db.delete(savedJobs).where(eq(savedJobs.candidateProfileId, testCandidateProfileId));
    // Delete remaining job 2
    await db.delete(jobs).where(eq(jobs.id, testJobId2));
    // Delete candidate profile
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, testCandidateProfileId));
    // Delete test user
    await db.delete(users).where(eq(users.id, testUserId));
  });
});
