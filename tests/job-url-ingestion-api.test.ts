/**
 * Job Hub — Phase 3 / Step 3.9
 * Manual Job URL Ingestion API & tRPC Procedures Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { validatePublicJobUrl } from "../apps/web/lib/trpc/routers/jobs";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { jobRepository } from "@job-hub/jobs/server";
import { UserUrlAdapter, submitJobUrlInputSchema } from "@job-hub/jobs";

function createMockContext(userId: string | null = "user_test_manual_ingest") {
  return {
    session: userId
      ? {
          user: {
            id: userId,
            email: "manual_tester@example.com",
            name: "Manual Tester",
          },
          session: {
            id: "session_manual_test",
            userId,
            token: "mock-token",
            expiresAt: new Date(Date.now() + 3600000),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }
      : null,
  };
}

test("Step 3.9 — Manual Job URL Ingestion API & tRPC Procedures Test Suite", async (t) => {
  // 1. SSRF and URL Validation
  await t.test("1. SSRF Protection: validates public URLs and rejects private, loopback, and internal hosts", () => {
    // 1a. Valid public URLs
    const validUrl = "https://careers.google.com/jobs/results/123456";
    const parsed = validatePublicJobUrl(validUrl);
    assert.equal(parsed.hostname, "careers.google.com");

    // 1b. Reject loopback
    assert.throws(
      () => validatePublicJobUrl("http://localhost:3000/jobs/1"),
      (err: unknown) => err instanceof TRPCError && err.code === "BAD_REQUEST"
    );
    assert.throws(
      () => validatePublicJobUrl("http://127.0.0.1/jobs"),
      (err: unknown) => err instanceof TRPCError && err.code === "BAD_REQUEST"
    );

    // 1c. Reject private IPv4 ranges (10.x, 192.168.x, 172.16.x)
    assert.throws(
      () => validatePublicJobUrl("http://10.0.0.1/api"),
      (err: unknown) => err instanceof TRPCError && err.code === "BAD_REQUEST"
    );
    assert.throws(
      () => validatePublicJobUrl("http://192.168.1.50/jobs"),
      (err: unknown) => err instanceof TRPCError && err.code === "BAD_REQUEST"
    );
    assert.throws(
      () => validatePublicJobUrl("http://172.20.0.5/jobs"),
      (err: unknown) => err instanceof TRPCError && err.code === "BAD_REQUEST"
    );

    // 1d. Reject AWS/Cloud metadata IP
    assert.throws(
      () => validatePublicJobUrl("http://169.254.169.254/latest/meta-data/"),
      (err: unknown) => err instanceof TRPCError && err.code === "BAD_REQUEST"
    );

    // 1e. Reject non-http protocols
    assert.throws(
      () => validatePublicJobUrl("ftp://files.example.com/job.pdf"),
      (err: unknown) => err instanceof TRPCError && err.code === "BAD_REQUEST"
    );
  });

  // 2. UserUrlAdapter Normalization
  await t.test("2. UserUrlAdapter: normalizes manual user submission into canonical job", async () => {
    const adapter = new UserUrlAdapter();
    const normalized = await adapter.normalize({
      source: "user_url",
      sourceJobId: "manual_custom_101",
      url: "https://jobs.apple.com/en-us/details/2005",
      discoveredAt: new Date(),
      data: {
        url: "https://jobs.apple.com/en-us/details/2005",
        title: "Kernel Engineer",
        company: "Apple",
        location: "Cupertino, CA",
        description: "<p>Deep kernel OS development.</p>",
        skills: ["C", "C++", "Kernel"],
        salaryMin: 180000,
        salaryMax: 240000,
        currency: "USD",
      },
    });

    assert.equal(normalized.source, "user_url");
    assert.equal(normalized.title, "Kernel Engineer");
    assert.equal(normalized.company, "Apple");
    assert.equal(normalized.location, "Cupertino, CA");
    assert.equal(normalized.remoteType, "ONSITE");
    assert.equal(normalized.salaryMin, 180000);
    assert.equal(normalized.salaryMax, 240000);
    assert.deepEqual(normalized.skills, ["C", "C++", "Kernel"]);
    assert.ok(normalized.description?.includes("Deep kernel OS development."));
  });

  // 3. tRPC jobsRouter: Authentication & SSRF Enforcement
  await t.test("3. tRPC Router Security: enforces authentication and rejects unauthorized access", async () => {
    const unauthCaller = appRouter.createCaller(createMockContext(null));

    await assert.rejects(
      async () =>
        unauthCaller.jobs.submitUrl({
          url: "https://example.com/job/1",
          title: "Developer",
        }),
      (err: unknown) => err instanceof TRPCError && err.code === "UNAUTHORIZED"
    );

    await assert.rejects(
      async () => unauthCaller.jobs.list(),
      (err: unknown) => err instanceof TRPCError && err.code === "UNAUTHORIZED"
    );
  });

  // 4. tRPC jobsRouter: Ingestion, Deduplication, and Retrieval End-to-End
  await t.test("4. tRPC Router Ingestion: ingests manual job, deduplicates, and retrieves via procedures", async () => {
    const authCaller = appRouter.createCaller(createMockContext("user_manual_worker"));
    const testUrl = `https://jobs.github.com/positions/test-${Date.now()}`;

    // 4a. Initial submission (unique)
    const submitResult = await authCaller.jobs.submitUrl({
      url: testUrl,
      title: "Staff Systems Engineer",
      company: "GitHub",
      location: "Worldwide",
      description: "Build robust distributed Git infrastructure.",
      skills: ["Rust", "Git", "Distributed Systems"],
      salaryMin: 190000,
      salaryMax: 230000,
      currency: "USD",
    });

    assert.equal(submitResult.isDuplicate, false);
    assert.ok(submitResult.jobId);
    assert.equal(submitResult.job?.company, "GitHub");

    try {
      // 4b. Duplicate submission with same URL
      const duplicateResult = await authCaller.jobs.submitUrl({
        url: testUrl,
        title: "Staff Systems Engineer",
        company: "GitHub",
      });

      assert.equal(duplicateResult.isDuplicate, true);
      assert.equal(duplicateResult.jobId, submitResult.jobId);

      // 4c. Query by ID
      const retrieved = await authCaller.jobs.getById({ id: submitResult.jobId });
      assert.equal(retrieved.id, submitResult.jobId);
      assert.equal(retrieved.title, "Staff Systems Engineer");
      assert.equal(retrieved.remoteType, "WORLDWIDE_REMOTE");

      // 4d. Query unknown ID throws NOT_FOUND
      await assert.rejects(
        async () => authCaller.jobs.getById({ id: "00000000-0000-0000-0000-000000000000" }),
        (err: unknown) => err instanceof TRPCError && err.code === "NOT_FOUND"
      );

      // 4e. List jobs
      const listResult = await authCaller.jobs.list({ limit: 10 });
      assert.ok(Array.isArray(listResult));
      assert.ok(listResult.some((j) => j.id === submitResult.jobId));
    } finally {
      // Cleanup
      await jobRepository.delete(submitResult.jobId);
    }
  });
});
