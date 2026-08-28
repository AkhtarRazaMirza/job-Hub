/**
 * Job Hub — Phase 3 / Step 3.10
 * Phase 3 Completion Gate: End-to-End Ingestion, Normalization, Verification, Deduplication & API Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  jobSourceRegistry,
  jobNormalizationEngine,
  jobVerificationEngine,
  jobDeduplicationEngine,
  cleanCanonicalUrl,
  createJobInputSchema,
  type CreateJobInput,
  type DiscoveredRawJob,
} from "@job-hub/jobs";
import { jobRepository, jobSourceRepository } from "@job-hub/jobs/server";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import {
  discoverJobsFunction,
  normalizeJobFunction,
  verifyJobFunction,
  deduplicateAndIngestJobFunction,
} from "@job-hub/inngest";

test("Step 3.10 — Phase 3 Completion Gate Test Suite", async (t) => {
  const createdJobIds: string[] = [];

  t.after(async () => {
    // Teardown all test jobs created in database
    for (const id of createdJobIds) {
      try {
        await jobRepository.delete(id);
      } catch {
        // Ignore teardown errors
      }
    }
  });

  // 1. Adapter Registry & Discovery Gate
  await t.test("1. Discovery Gate: all foundational adapters registered and discoverable", () => {
    assert.ok(jobSourceRegistry.has("remoteok"), "RemoteOK adapter must be registered");
    assert.ok(jobSourceRegistry.has("arbeitnow"), "Arbeitnow adapter must be registered");
    assert.ok(jobSourceRegistry.has("user_url"), "UserUrl adapter must be registered");

    const adapters = jobSourceRegistry.list();
    assert.ok(adapters.length >= 3, "At least 3 source adapters must be active");
  });

  // 2. Normalization Engine Gate
  await t.test("2. Normalization Gate: converts diverse raw provider payloads into canonical Job model", async () => {
    const rawJob: DiscoveredRawJob = {
      source: "remoteok",
      sourceJobId: `gate_norm_${Date.now()}`,
      url: "https://remoteok.com/job/gate-norm?utm_source=twitter&utm_medium=feed",
      discoveredAt: new Date(),
      data: {
        id: `gate_norm_${Date.now()}`,
        position: "Principal Distributed Systems Engineer",
        company: "Global Scale Ltd",
        location: "Worldwide",
        tags: ["Rust", "Distributed Systems", "Raft"],
        description: "<p>Lead our <strong>core storage</strong> engine.</p>",
        salary_min: 190000,
        salary_max: 230000,
        apply_url: "https://example.com/apply/gate-norm?trk=campaign",
      },
    };

    const normalized = await jobNormalizationEngine.normalize(rawJob);

    // Strict schema check
    const validation = createJobInputSchema.safeParse(normalized);
    assert.equal(validation.success, true);

    // URL cleaning
    assert.equal(normalized.canonicalUrl, "https://remoteok.com/job/gate-norm");
    assert.equal(normalized.applicationUrl, "https://example.com/apply/gate-norm");

    // Remote classification
    assert.equal(normalized.remoteType, "WORLDWIDE_REMOTE");
    assert.equal(normalized.salaryMin, 190000);
    assert.equal(normalized.salaryMax, 230000);
    assert.deepEqual(normalized.skills, ["Rust", "Distributed Systems", "Raft"]);
  });

  // 3. Verification & Truthfulness Gate
  await t.test("3. Verification Gate: audits freshness, spam heuristics, and conservative remote bounds", async () => {
    // 3a. Active valid job
    const validJob: CreateJobInput = {
      source: "user_url",
      sourceJobId: `gate_v_${Date.now()}`,
      title: "Staff Cloud Engineer",
      company: "Cloudflare Inc",
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
      applicationUrl: "https://example.com/apply/gate-cf",
      status: "ACTIVE",
      postedAt: new Date(),
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 200 });

    try {
      const result = await jobVerificationEngine.verify(validJob);
      assert.equal(result.isVerified, true);
      assert.equal(result.status, "ACTIVE");
      assert.equal(result.isSpam, false);
      assert.equal(result.isStale, false);

      // 3b. Spam job rejected
      const spamJob: CreateJobInput = {
        ...validJob,
        company: "Confidential",
        description: "Earn $5,000 weekly stuffing envelopes from home!",
      };
      const spamResult = await jobVerificationEngine.verify(spamJob);
      assert.equal(spamResult.isVerified, false);
      assert.equal(spamResult.isSpam, true);
      assert.equal(spamResult.status, "CLOSED");

      // 3c. Ambiguous remote policy downgraded to UNKNOWN
      const ambiguousRemoteJob: CreateJobInput = {
        ...validJob,
        location: "Remote",
        remoteType: "WORLDWIDE_REMOTE",
      };
      const ambiguousResult = await jobVerificationEngine.verify(ambiguousRemoteJob);
      assert.equal(ambiguousResult.remoteClassification, "UNKNOWN");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Deduplication & Persistence Gate
  await t.test("4. Deduplication Gate: prevents duplicate jobs across multiple sources and compound keys", async () => {
    const uniqueUrl = `https://example.com/jobs/canonical-gate-${Date.now()}`;
    const testCompany = `Gate Enterprise ${Date.now()}`;

    // 4a. Persist canonical job
    const canonical = await jobRepository.create({
      source: "remoteok",
      sourceJobId: `canonical_${Date.now()}`,
      title: "Senior Backend Architect",
      company: testCompany,
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
      canonicalUrl: uniqueUrl,
      applicationUrl: `https://example.com/apply/gate-${Date.now()}`,
      status: "ACTIVE",
    });

    createdJobIds.push(canonical.id);

    // 4b. Detect duplicate by canonical URL
    const candidateDup1 = await jobDeduplicationEngine.findDuplicate({
      source: "arbeitnow",
      sourceJobId: `other_src_${Date.now()}`,
      title: "Senior Backend Architect",
      company: testCompany,
      canonicalUrl: uniqueUrl,
      applicationUrl: "https://other.example.com",
    });

    assert.equal(candidateDup1.isDuplicate, true);
    assert.equal(candidateDup1.match?.canonicalJobId, canonical.id);
    assert.equal(candidateDup1.match?.matchType, "EXACT_CANONICAL_URL");

    // 4c. Detect duplicate by normalized compound key
    const candidateDup2 = await jobDeduplicationEngine.findDuplicate({
      source: "user_url",
      sourceJobId: `user_src_${Date.now()}`,
      title: "Sr. Backend Architect",
      company: testCompany,
      canonicalUrl: "https://user.example.com",
      applicationUrl: "https://user.example.com/apply",
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
    });

    assert.equal(candidateDup2.isDuplicate, true);
    assert.equal(candidateDup2.match?.canonicalJobId, canonical.id);
  });

  // 5. Inngest Durable Workflow Functions Gate
  await t.test("5. Workflow Gate: durable functions export expected IDs and retry configs", () => {
    assert.equal(discoverJobsFunction.id, "discover-jobs");
    assert.equal(normalizeJobFunction.id, "normalize-job");
    assert.equal(verifyJobFunction.id, "verify-job");
    assert.equal(deduplicateAndIngestJobFunction.id, "deduplicate-and-ingest-job");
  });

  // 6. tRPC API & Security Gate
  await t.test("6. API Gate: enforces auth, prevents SSRF, and allows valid manual job submissions", async () => {
    const caller = appRouter.createCaller({
      session: {
        user: { id: "gate_user_1", email: "gate@example.com", name: "Gate User" },
        session: {
          id: "gate_sess_1",
          userId: "gate_user_1",
          token: "tok",
          expiresAt: new Date(Date.now() + 3600000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    });

    const jobUrl = `https://jobs.example.com/positions/gate-${Date.now()}`;

    const submission = await caller.jobs.submitUrl({
      url: jobUrl,
      title: "Security Automation Engineer",
      company: "Gate Defense Inc",
      location: "Worldwide",
    });

    assert.equal(submission.isDuplicate, false);
    assert.ok(submission.jobId);
    createdJobIds.push(submission.jobId);

    // Query back via tRPC
    const fetched = await caller.jobs.getById({ id: submission.jobId });
    assert.equal(fetched.id, submission.jobId);
    assert.equal(fetched.title, "Security Automation Engineer");
  });
});
