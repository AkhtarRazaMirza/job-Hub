/**
 * Job Hub — Phase 3 / Step 3.6
 * Job Verification Engine Deterministic Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  jobVerificationEngine,
  JobVerificationEngine,
  checkJobFreshness,
  detectSpamSignals,
  auditRemoteClassification,
  JobSourceRegistry,
  type CreateJobInput,
  type JobSourceContract,
} from "@job-hub/jobs";
import { verifyJobFunction } from "@job-hub/inngest";

function createMockJob(overrides: Partial<CreateJobInput> = {}): CreateJobInput {
  return {
    source: "remoteok",
    sourceJobId: "job_v_101",
    title: "Senior Distributed Systems Engineer",
    company: "PlanetScale Inc",
    location: "Worldwide",
    remoteType: "WORLDWIDE_REMOTE",
    allowedCountries: [],
    salaryMin: 170000,
    salaryMax: 210000,
    salary: 170000,
    currency: "USD",
    skills: ["Go", "Distributed Systems", "MySQL"],
    requirements: ["5+ years distributed systems experience"],
    description: "Build robust distributed database infrastructure at scale.",
    applicationUrl: "https://jobs.example.com/apply/101",
    canonicalUrl: "https://jobs.example.com/jobs/101",
    status: "ACTIVE",
    postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    ...overrides,
  };
}

test("Step 3.6 — Job Verification Engine Test Suite", async (t) => {
  // 1. Freshness Checker
  await t.test("1. Freshness Check: identifies fresh, stale, future-dated, and undisclosed posting dates", () => {
    const now = new Date("2026-08-28T12:00:00Z");

    // 1a. Fresh job (5 days ago)
    const freshJob = createMockJob({
      postedAt: new Date("2026-08-23T12:00:00Z"),
    });
    const freshResult = checkJobFreshness(freshJob, { maxStaleDays: 90, now });
    assert.equal(freshResult.isStale, false);
    assert.equal(freshResult.freshnessDays, 5);

    // 1b. Stale job (100 days ago > 90 days limit)
    const staleJob = createMockJob({
      postedAt: new Date("2026-05-20T12:00:00Z"),
    });
    const staleResult = checkJobFreshness(staleJob, { maxStaleDays: 90, now });
    assert.equal(staleResult.isStale, true);
    assert.equal(staleResult.freshnessDays, 100);
    assert.ok(staleResult.reasons[0]?.includes("stale"));

    // 1c. Future dated job
    const futureJob = createMockJob({
      postedAt: new Date("2026-09-15T12:00:00Z"),
    });
    const futureResult = checkJobFreshness(futureJob, { now });
    assert.equal(futureResult.isStale, true);
    assert.ok(futureResult.reasons[0]?.includes("future"));

    // 1d. Undisclosed posting date (truthfulness: unknown remains unknown)
    const undisclosedJob = createMockJob({ postedAt: null });
    const undisclosedResult = checkJobFreshness(undisclosedJob, { now });
    assert.equal(undisclosedResult.isStale, false);
    assert.equal(undisclosedResult.freshnessDays, null);
  });

  // 2. Spam & Quality Signals Detection
  await t.test("2. Spam Detection: catches placeholder companies, fraud keywords, and off-platform contact scams", () => {
    // 2a. Clean legitimate job
    const cleanJob = createMockJob();
    const cleanCheck = detectSpamSignals(cleanJob);
    assert.equal(cleanCheck.isSpam, false);
    assert.equal(cleanCheck.reasons.length, 0);

    // 2b. Placeholder company
    const placeholderJob = createMockJob({ company: "Confidential" });
    const placeholderCheck = detectSpamSignals(placeholderJob);
    assert.equal(placeholderCheck.isSpam, true);
    assert.ok(placeholderCheck.reasons.some((r) => r.includes("Placeholder company")));

    // 2c. Scam phrases in description
    const scamJob = createMockJob({
      description: "Earn $1,000 daily from home with our envelope stuffing opportunity!",
    });
    const scamCheck = detectSpamSignals(scamJob);
    assert.equal(scamCheck.isSpam, true);
    assert.ok(scamCheck.reasons.some((r) => r.includes("scam")));

    // 2d. Off-platform Telegram contact scam
    const offPlatformJob = createMockJob({
      description: "Please do not apply here. Telegram me @scammer99 for immediate interview.",
    });
    const offPlatformCheck = detectSpamSignals(offPlatformJob);
    assert.equal(offPlatformCheck.isSpam, true);
  });

  // 3. Remote Classification Audit
  await t.test("3. Remote Policy Audit: enforces non-negotiable rule that Remote alone is not worldwide", () => {
    // 3a. Explicit Worldwide Remote passes
    const worldwideJob = createMockJob({
      remoteType: "WORLDWIDE_REMOTE",
      location: "Worldwide",
    });
    const worldwideAudit = auditRemoteClassification(worldwideJob);
    assert.equal(worldwideAudit.isValid, true);
    assert.equal(worldwideAudit.auditedRemoteType, "WORLDWIDE_REMOTE");

    // 3b. "Remote" alone without global qualifier must downgrade to UNKNOWN
    const ambiguousRemoteJob = createMockJob({
      remoteType: "WORLDWIDE_REMOTE",
      location: "Remote", // Ambiguous without worldwide scope
    });
    const ambiguousAudit = auditRemoteClassification(ambiguousRemoteJob);
    assert.equal(ambiguousAudit.isValid, false);
    assert.equal(
      ambiguousAudit.auditedRemoteType,
      "UNKNOWN",
      "Per 04_ai_agent_skills.md §6, ambiguous remote must downgrade to UNKNOWN"
    );

    // 3c. Country remote with country location passes
    const countryJob = createMockJob({
      remoteType: "COUNTRY_REMOTE",
      location: "Germany",
    });
    const countryAudit = auditRemoteClassification(countryJob);
    assert.equal(countryAudit.isValid, true);
    assert.equal(countryAudit.auditedRemoteType, "COUNTRY_REMOTE");
  });

  // 4. Live URL and Verification Engine Integration
  await t.test("4. Verification Engine: probes live application URLs and reports truthful states", async () => {
    const customRegistry = new JobSourceRegistry();
    const mockAdapter: JobSourceContract = {
      id: "mock_verifier_source",
      name: "Mock Verifier",
      type: "API",
      discover: async () => [],
      normalize: async () => ({} as any),
      getApplicationUrl: async () => "https://example.com/apply",
      verifyStatus: async ({ applicationUrl }) => {
        if (applicationUrl.includes("closed")) return "CLOSED";
        if (applicationUrl.includes("timeout")) return "UNKNOWN";
        return "ACTIVE";
      },
    };
    customRegistry.register(mockAdapter);

    const engine = new JobVerificationEngine(customRegistry);

    // 4a. Active job
    const activeJob = createMockJob({
      source: "mock_verifier_source",
      applicationUrl: "https://example.com/apply/active",
    });
    const activeResult = await engine.verify(activeJob);
    assert.equal(activeResult.status, "ACTIVE");
    assert.equal(activeResult.isVerified, true);
    assert.equal(activeResult.applicationUrlValid, true);

    // 4b. Closed job
    const closedJob = createMockJob({
      source: "mock_verifier_source",
      applicationUrl: "https://example.com/apply/closed",
    });
    const closedResult = await engine.verify(closedJob);
    assert.equal(closedResult.status, "CLOSED");
    assert.equal(closedResult.isVerified, false);

    // 4c. Stale job gets marked CLOSED even if HTTP is 200
    const staleJob = createMockJob({
      source: "mock_verifier_source",
      applicationUrl: "https://example.com/apply/active",
      postedAt: new Date("2025-01-01T00:00:00Z"), // Very old
    });
    const staleResult = await engine.verify(staleJob, { maxStaleDays: 60 });
    assert.equal(staleResult.status, "CLOSED");
    assert.equal(staleResult.isStale, true);
    assert.equal(staleResult.isVerified, false);

    // 4d. Spam job gets marked CLOSED
    const spamJob = createMockJob({
      source: "mock_verifier_source",
      company: "Anonymous",
      applicationUrl: "https://example.com/apply/active",
    });
    const spamResult = await engine.verify(spamJob);
    assert.equal(spamResult.status, "CLOSED");
    assert.equal(spamResult.isSpam, true);
    assert.equal(spamResult.isVerified, false);

    // 4e. Invalid URL
    const invalidUrlJob = createMockJob({
      source: "mock_verifier_source",
      applicationUrl: "invalid-url",
    });
    const invalidUrlResult = await engine.verify(invalidUrlJob);
    assert.equal(invalidUrlResult.applicationUrlValid, false);
    assert.equal(invalidUrlResult.status, "CLOSED");
  });

  // 5. Batch Verification
  await t.test("5. Batch Verification: aggregates active, closed, spam, and stale metrics", async () => {
    const customRegistry = new JobSourceRegistry();
    const mockAdapter: JobSourceContract = {
      id: "batch_verify_src",
      name: "Batch Verify Src",
      type: "API",
      discover: async () => [],
      normalize: async () => ({} as any),
      getApplicationUrl: async () => "https://example.com",
      verifyStatus: async ({ applicationUrl }) =>
        applicationUrl.includes("closed") ? "CLOSED" : "ACTIVE",
    };
    customRegistry.register(mockAdapter);
    const engine = new JobVerificationEngine(customRegistry);

    const jobs: CreateJobInput[] = [
      createMockJob({
        source: "batch_verify_src",
        sourceJobId: "b1",
        applicationUrl: "https://example.com/b1",
      }),
      createMockJob({
        source: "batch_verify_src",
        sourceJobId: "b2",
        applicationUrl: "https://example.com/b2-closed",
      }),
      createMockJob({
        source: "batch_verify_src",
        sourceJobId: "b3",
        company: "Confidential",
        applicationUrl: "https://example.com/b3",
      }),
      createMockJob({
        source: "batch_verify_src",
        sourceJobId: "b4",
        applicationUrl: "https://example.com/b4",
        postedAt: new Date("2024-01-01T00:00:00Z"), // Stale
      }),
    ];

    const batchResult = await engine.verifyBatch(jobs, { maxStaleDays: 90 });
    assert.equal(batchResult.totalProcessed, 4);
    assert.equal(batchResult.activeCount, 1, "Only b1 should be ACTIVE");
    assert.equal(batchResult.closedCount, 3, "b2, b3, b4 should be CLOSED");
    assert.equal(batchResult.spamCount, 1, "b3 should be flagged as SPAM");
    assert.equal(batchResult.staleCount, 1, "b4 should be flagged as STALE");
  });

  // 6. Inngest Durable Function: verifyJobFunction Simulation
  await t.test("6. Inngest Workflow: verifyJobFunction executes inside durable steps and dispatches job.verified", async () => {
    const executedSteps: string[] = [];
    const emittedEvents: { name: string; data: any }[] = [];

    const mockStep = {
      run: async (stepId: string, fn: () => Promise<any>) => {
        executedSteps.push(stepId);
        return await fn();
      },
      sendEvent: async (stepId: string, events: any) => {
        executedSteps.push(stepId);
        const evArray = Array.isArray(events) ? events : [events];
        emittedEvents.push(...evArray);
        return { ids: ["event_v_1"] };
      },
    };

    const validJob = createMockJob({
      source: "remoteok",
      sourceJobId: "inngest_v_1",
    });

    const testEvent = {
      name: "job.normalized" as const,
      data: {
        job: validJob as unknown as Record<string, unknown>,
        source: "remoteok",
        sourceJobId: "inngest_v_1",
        rawUrl: "https://remoteok.com/remote-jobs/1",
        normalizedAt: new Date().toISOString(),
      },
    };

    const handler = (verifyJobFunction as any)["fn"];
    assert.ok(typeof handler === "function");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 200 });

    let result: any;
    try {
      result = await handler({
        event: testEvent,
        step: mockStep,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(result.success, true);
    assert.equal(result.source, "remoteok");
    assert.equal(result.sourceJobId, "inngest_v_1");

    // Verify step boundaries
    assert.ok(executedSteps.includes("verify-job-status"), "Must execute verification inside step.run()");
    assert.ok(executedSteps.includes("emit-job-verified"), "Must dispatch event inside step.sendEvent()");

    // Verify emitted event
    assert.equal(emittedEvents.length, 1);
    assert.equal(emittedEvents[0]?.name, "job.verified");
    assert.equal(emittedEvents[0]?.data.source, "remoteok");
    assert.equal(emittedEvents[0]?.data.sourceJobId, "inngest_v_1");
  });
});
