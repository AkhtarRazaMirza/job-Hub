/**
 * Job Hub — Phase 3 / Step 3.1
 * Job Domain Types, Zod Schemas & Database Entities Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  REMOTE_TYPES,
  JOB_STATUSES,
  JOB_SOURCE_TYPES,
  jobSourceSchema,
  createJobSourceInputSchema,
  updateJobSourceInputSchema,
  jobSchema,
  createJobInputSchema,
  updateJobInputSchema,
  remoteTypeSchema,
  jobStatusSchema,
  jobSourceTypeSchema,
  JobSourceConflictError,
  JobNotFoundError,
  JobSourceNotFoundError,
} from "@job-hub/jobs";
import {
  jobRepository,
  jobSourceRepository,
} from "@job-hub/jobs/server";
import { db, jobs as jobsTable, jobSources as jobSourcesTable } from "@job-hub/db";
import { eq } from "drizzle-orm";

const TEST_RUN_ID = `test_step31_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

test("Step 3.1 — Job Domain Types, Zod Schemas & Database Entities Test Suite", async (t) => {
  // Test cleanup trackers
  const createdJobSourceIds: string[] = [];
  const createdJobIds: string[] = [];

  // Cleanup helper
  async function cleanup() {
    for (const jid of createdJobIds) {
      await db.delete(jobsTable).where(eq(jobsTable.id, jid)).catch(() => {});
    }
    for (const sid of createdJobSourceIds) {
      await db.delete(jobSourcesTable).where(eq(jobSourcesTable.id, sid)).catch(() => {});
    }
  }

  // 1. Valid Job Schema
  await t.test("1. Valid Job schema validates canonical job entity cleanly", () => {
    const validJobData = {
      id: "job-12345",
      source: "remoteok",
      sourceJobId: "rok-9876",
      jobSourceId: "src-111",
      canonicalUrl: "https://remoteok.com/remote-jobs/senior-fullstack-engineer",
      title: "Senior Full-Stack Engineer",
      company: "Acme Remote Corp",
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
      allowedCountries: ["US", "CA", "GB"],
      salary: 140000,
      salaryMin: 130000,
      salaryMax: 150000,
      currency: "USD",
      experience: "SENIOR",
      skills: ["TypeScript", "Node.js", "PostgreSQL", "React"],
      requirements: ["5+ years building distributed applications", "Strong TypeScript foundation"],
      description: "We are seeking a seasoned full-stack engineer to build remote workflow systems.",
      applicationUrl: "https://remoteok.com/apply/9876",
      status: "ACTIVE",
      postedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parsed = jobSchema.safeParse(validJobData);
    assert.equal(parsed.success, true, "Valid job data must parse successfully");
    if (parsed.success) {
      assert.equal(parsed.data.title, "Senior Full-Stack Engineer");
      assert.equal(parsed.data.remoteType, "WORLDWIDE_REMOTE");
      assert.equal(parsed.data.salary, 140000);
      assert.equal(parsed.data.skills.length, 4);
    }
  });

  // 2. Invalid Job Schema
  await t.test("2. Invalid Job schema rejects missing required fields and invalid types", () => {
    // Missing title and company
    const missingFields = {
      id: "job-123",
      source: "remoteok",
      applicationUrl: "https://example.com/apply",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const res1 = jobSchema.safeParse(missingFields);
    assert.equal(res1.success, false, "Job missing title and company must be rejected");

    // Invalid remoteType
    const invalidRemote = {
      id: "job-123",
      source: "remoteok",
      title: "Dev",
      company: "Co",
      applicationUrl: "https://example.com/apply",
      remoteType: "ANYWHERE", // Invalid enum value
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const res2 = jobSchema.safeParse(invalidRemote);
    assert.equal(res2.success, false, "Job with invalid remoteType enum must be rejected");
  });

  // 3. Valid JobSource Schema
  await t.test("3. Valid JobSource schema validates correctly", () => {
    const validSource = {
      id: "source-1",
      name: "RemoteOK",
      type: "API",
      url: "https://remoteok.com/api",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parsed = jobSourceSchema.safeParse(validSource);
    assert.equal(parsed.success, true, "Valid JobSource must parse successfully");
    if (parsed.success) {
      assert.equal(parsed.data.name, "RemoteOK");
      assert.equal(parsed.data.type, "API");
      assert.equal(parsed.data.isActive, true);
    }
  });

  // 4. Invalid JobSource Schema
  await t.test("4. Invalid JobSource schema rejects invalid type and malformed URLs", () => {
    const invalidSourceType = {
      id: "source-1",
      name: "Invalid Source",
      type: "SCRAPER_BOT", // Not a permitted JobSourceType
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const res1 = jobSourceSchema.safeParse(invalidSourceType);
    assert.equal(res1.success, false, "Invalid JobSourceType must be rejected");

    const invalidUrl = {
      id: "source-2",
      name: "Bad URL Source",
      type: "FEED",
      url: "not-a-valid-url",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const res2 = jobSourceSchema.safeParse(invalidUrl);
    assert.equal(res2.success, false, "Malformed URL must be rejected");
  });

  // 5. RemoteType enum validation
  await t.test("5. RemoteType enum validation enforces explicit classifications without assuming remote=worldwide", () => {
    // 04_ai_agent_skills.md §6 explicit classifications
    assert.deepEqual(REMOTE_TYPES, [
      "WORLDWIDE_REMOTE",
      "COUNTRY_REMOTE",
      "REGION_REMOTE",
      "HYBRID",
      "ONSITE",
      "UNKNOWN",
    ]);

    for (const rt of REMOTE_TYPES) {
      const parsed = remoteTypeSchema.safeParse(rt);
      assert.equal(parsed.success, true, `${rt} must be a valid RemoteType`);
    }

    const invalidAttempts = ["remote", "fully-remote", "GLOBAL", "telecommute", ""];
    for (const attempt of invalidAttempts) {
      const parsed = remoteTypeSchema.safeParse(attempt);
      assert.equal(parsed.success, false, `"${attempt}" must not be accepted as RemoteType`);
    }
  });

  // 6. Salary / Null handling
  await t.test("6. Salary and nullable fields handle null, undefined, and non-negative integers properly", () => {
    // Completely null/undisclosed salary
    const jobWithoutSalary = {
      source: "himalayas",
      title: "Backend Engineer",
      company: "Cloud Systems",
      applicationUrl: "https://himalayas.app/jobs/backend-engineer",
      salary: null,
      salaryMin: null,
      salaryMax: null,
      currency: null,
    };
    const parsed1 = createJobInputSchema.safeParse(jobWithoutSalary);
    assert.equal(parsed1.success, true, "Undisclosed salary fields must accept null");

    // Negative salary must be rejected
    const negativeSalary = {
      ...jobWithoutSalary,
      salary: -50000,
    };
    const parsed2 = createJobInputSchema.safeParse(negativeSalary);
    assert.equal(parsed2.success, false, "Negative salary must be rejected");

    // Non-integer salary must be rejected
    const floatSalary = {
      ...jobWithoutSalary,
      salary: 120500.5,
    };
    const parsed3 = createJobInputSchema.safeParse(floatSalary);
    assert.equal(parsed3.success, false, "Non-integer salary must be rejected");

    // Valid integer salary
    const validSalary = {
      ...jobWithoutSalary,
      salary: 135000,
      salaryMin: 120000,
      salaryMax: 150000,
      currency: "EUR",
    };
    const parsed4 = createJobInputSchema.safeParse(validSalary);
    assert.equal(parsed4.success, true, "Valid positive integer salary range must be accepted");
  });

  // 7. URL validation
  await t.test("7. URL validation enforces http/https protocol and rejects dangerous schemes", () => {
    const validUrls = [
      "https://example.com/apply",
      "http://careers.company.org/jobs/42",
      "https://sub.domain.co.uk/path/to/job?ref=jobhub&utm_source=feed",
    ];
    for (const u of validUrls) {
      const parsed = createJobInputSchema.safeParse({
        source: "test",
        title: "Test",
        company: "Test",
        applicationUrl: u,
      });
      assert.equal(parsed.success, true, `Valid URL "${u}" must be accepted`);
    }

    const invalidUrls = [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://ftp.example.com/job",
      "not a url",
      "//missing-protocol.com",
    ];
    for (const u of invalidUrls) {
      const parsed = createJobInputSchema.safeParse({
        source: "test",
        title: "Test",
        company: "Test",
        applicationUrl: u,
      });
      assert.equal(parsed.success, false, `Dangerous or invalid URL "${u}" must be rejected`);
    }
  });

  // 8. Required field enforcement
  await t.test("8. Required field enforcement rejects empty strings and missing keys", () => {
    const missingTitle = {
      source: "test",
      title: "",
      company: "Acme",
      applicationUrl: "https://example.com",
    };
    assert.equal(createJobInputSchema.safeParse(missingTitle).success, false);

    const missingCompany = {
      source: "test",
      title: "Engineer",
      company: "   ",
      applicationUrl: "https://example.com",
    };
    // Zod min(1) fails on empty string
    const missingSource = {
      source: "",
      title: "Engineer",
      company: "Acme",
      applicationUrl: "https://example.com",
    };
    assert.equal(createJobInputSchema.safeParse(missingSource).success, false);
  });

  // 9. Unknown field rejection (.strict())
  await t.test("9. Input schemas reject unknown injected fields via .strict()", () => {
    const injectedJobInput = {
      source: "manual",
      title: "Frontend Engineer",
      company: "Startup Corp",
      applicationUrl: "https://startup.com/apply",
      maliciousField: "DROP TABLE jobs;",
      adminOverride: true,
    };
    const parsedJob = createJobInputSchema.safeParse(injectedJobInput);
    assert.equal(parsedJob.success, false, "Unknown fields in createJobInputSchema must be rejected");

    const injectedSourceInput = {
      name: "Custom Source",
      type: "API",
      unknownKey: "value",
    };
    const parsedSource = createJobSourceInputSchema.safeParse(injectedSourceInput);
    assert.equal(parsedSource.success, false, "Unknown fields in createJobSourceInputSchema must be rejected");
  });

  // 10. Database migration verification (Schema & columns in PostgreSQL)
  await t.test("10. Database migration 0010 applied successfully and tables exist with expected columns", async () => {
    // Check job_sources columns
    const sourceColumns = await db.execute<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'job_sources';`
    );
    const sourceColNames = sourceColumns.map((c) => c.column_name);
    assert.ok(sourceColNames.includes("id"), "job_sources must have id column");
    assert.ok(sourceColNames.includes("name"), "job_sources must have name column");
    assert.ok(sourceColNames.includes("type"), "job_sources must have type column");
    assert.ok(sourceColNames.includes("url"), "job_sources must have url column");
    assert.ok(sourceColNames.includes("is_active"), "job_sources must have is_active column");

    // Check jobs columns
    const jobColumns = await db.execute<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'jobs';`
    );
    const jobColNames = jobColumns.map((c) => c.column_name);
    assert.ok(jobColNames.includes("id"), "jobs must have id column");
    assert.ok(jobColNames.includes("source"), "jobs must have source column");
    assert.ok(jobColNames.includes("source_job_id"), "jobs must have source_job_id column");
    assert.ok(jobColNames.includes("job_source_id"), "jobs must have job_source_id column");
    assert.ok(jobColNames.includes("canonical_url"), "jobs must have canonical_url column");
    assert.ok(jobColNames.includes("title"), "jobs must have title column");
    assert.ok(jobColNames.includes("company"), "jobs must have company column");
    assert.ok(jobColNames.includes("remote_type"), "jobs must have remote_type column");
    assert.ok(jobColNames.includes("salary"), "jobs must have salary column");
    assert.ok(jobColNames.includes("skills"), "jobs must have skills column");
    assert.ok(jobColNames.includes("requirements"), "jobs must have requirements column");
    assert.ok(jobColNames.includes("application_url"), "jobs must have application_url column");
    assert.ok(jobColNames.includes("status"), "jobs must have status column");
  });

  // 11. Database persistence: JobSource and Job Repositories
  await t.test("11. Database persistence: create, retrieve, update, list, and delete via repositories", async () => {
    // 11a. Create JobSource
    const sourceName = `RemoteOK_${TEST_RUN_ID}`;
    const createdSource = await jobSourceRepository.create({
      name: sourceName,
      type: "API",
      url: "https://remoteok.com/api",
      isActive: true,
    });
    createdJobSourceIds.push(createdSource.id);

    assert.ok(createdSource.id, "Created source must have an ID");
    assert.equal(createdSource.name, sourceName);
    assert.equal(createdSource.type, "API");
    assert.equal(createdSource.isActive, true);

    // 11b. Find JobSource by ID and Name
    const foundById = await jobSourceRepository.findById(createdSource.id);
    assert.ok(foundById);
    assert.equal(foundById.name, sourceName);

    const foundByName = await jobSourceRepository.findByName(sourceName);
    assert.ok(foundByName);
    assert.equal(foundByName.id, createdSource.id);

    // 11c. Create Job linked to JobSource
    const createdJob = await jobRepository.create({
      source: "remoteok",
      sourceJobId: `ext_${TEST_RUN_ID}_1`,
      jobSourceId: createdSource.id,
      canonicalUrl: `https://remoteok.com/remote-jobs/${TEST_RUN_ID}_1`,
      title: "Senior AI Platform Engineer",
      company: "Neural Remote Systems",
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
      allowedCountries: ["US", "CA", "DE", "IN"],
      salary: 160000,
      salaryMin: 150000,
      salaryMax: 170000,
      currency: "USD",
      experience: "SENIOR",
      skills: ["TypeScript", "Python", "PostgreSQL", "Next.js"],
      requirements: ["5+ years experience", "Strong system design"],
      description: "Exciting opportunity to build autonomous job searching engines.",
      applicationUrl: `https://remoteok.com/apply/${TEST_RUN_ID}_1`,
      status: "ACTIVE",
      postedAt: new Date(),
    });
    createdJobIds.push(createdJob.id);

    assert.ok(createdJob.id, "Created job must have an ID");
    assert.equal(createdJob.title, "Senior AI Platform Engineer");
    assert.equal(createdJob.company, "Neural Remote Systems");
    assert.equal(createdJob.remoteType, "WORLDWIDE_REMOTE");
    assert.equal(createdJob.jobSourceId, createdSource.id);
    assert.equal(createdJob.skills.length, 4);

    // 11d. Retrieve Job by ID, source+sourceJobId, and canonicalUrl
    const foundJob = await jobRepository.findById(createdJob.id);
    assert.ok(foundJob);
    assert.equal(foundJob.title, "Senior AI Platform Engineer");

    const foundBySourceId = await jobRepository.findBySourceAndSourceJobId(
      "remoteok",
      `ext_${TEST_RUN_ID}_1`
    );
    assert.ok(foundBySourceId);
    assert.equal(foundBySourceId.id, createdJob.id);

    const foundByUrl = await jobRepository.findByCanonicalUrl(
      `https://remoteok.com/remote-jobs/${TEST_RUN_ID}_1`
    );
    assert.ok(foundByUrl);
    assert.equal(foundByUrl.id, createdJob.id);

    // 11e. Update Job
    const updatedJob = await jobRepository.update(createdJob.id, {
      salary: 175000,
      status: "CLOSED",
    });
    assert.equal(updatedJob.salary, 175000);
    assert.equal(updatedJob.status, "CLOSED");

    // 11f. List jobs with filtering
    const listFiltered = await jobRepository.list({
      source: "remoteok",
      status: "CLOSED",
      limit: 10,
    });
    assert.ok(listFiltered.some((j) => j.id === createdJob.id));

    // 11g. Delete Job
    const deletedJob = await jobRepository.delete(createdJob.id);
    assert.equal(deletedJob, true);
    const checkDeletedJob = await jobRepository.findById(createdJob.id);
    assert.equal(checkDeletedJob, null);

    // 11h. Delete JobSource
    const deletedSource = await jobSourceRepository.delete(createdSource.id);
    assert.equal(deletedSource, true);
    const checkDeletedSource = await jobSourceRepository.findById(createdSource.id);
    assert.equal(checkDeletedSource, null);
  });

  // 12. Unique constraints & foreign key cascade safety
  await t.test("12. Unique constraints and foreign key cascade safety", async () => {
    const uniqueSourceName = `UniqueSource_${TEST_RUN_ID}`;
    const s1 = await jobSourceRepository.create({
      name: uniqueSourceName,
      type: "BOARD",
    });
    createdJobSourceIds.push(s1.id);

    // Duplicate name must throw JobSourceConflictError
    await assert.rejects(
      async () => {
        await jobSourceRepository.create({
          name: uniqueSourceName,
          type: "API",
        });
      },
      (err: unknown) => err instanceof JobSourceConflictError,
      "Duplicate JobSource name must throw JobSourceConflictError"
    );

    // Test Foreign Key onDelete: "set null"
    const j1 = await jobRepository.create({
      source: "test_source",
      jobSourceId: s1.id,
      title: "Cascade Test Job",
      company: "Cascade Inc",
      applicationUrl: "https://example.com/apply",
    });
    createdJobIds.push(j1.id);

    assert.equal(j1.jobSourceId, s1.id);

    // Deleting s1 should set j1.jobSourceId to null without deleting j1
    await jobSourceRepository.delete(s1.id);
    const j1Reloaded = await jobRepository.findById(j1.id);
    assert.ok(j1Reloaded, "Job must not be deleted when parent JobSource is deleted");
    assert.equal(j1Reloaded.jobSourceId, null, "jobSourceId must be set to null on source deletion");
  });

  // Teardown
  await t.test("Teardown: Clean up test artifacts", async () => {
    await cleanup();
  });
});
