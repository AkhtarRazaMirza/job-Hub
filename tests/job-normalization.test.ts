/**
 * Job Hub — Phase 3 / Step 3.5
 * Job Normalization Engine Deterministic Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  jobNormalizationEngine,
  JobNormalizationEngine,
  cleanCanonicalUrl,
  createJobInputSchema,
  JobValidationError,
  JobSourceAdapterNotFoundError,
  JobSourceRegistry,
  type DiscoveredRawJob,
  type JobSourceContract,
} from "@job-hub/jobs";
import { normalizeJobFunction } from "@job-hub/inngest";

test("Step 3.5 — Job Normalization Engine Test Suite", async (t) => {
  // 1. Canonical URL Cleaner
  await t.test("1. Canonical URL Cleaner: strips tracking params, normalizes protocol and trailing slashes", () => {
    // 1a. Strips marketing params
    const dirtyUrl = "https://jobs.example.com/posting/123/?utm_source=twitter&utm_medium=social&utm_campaign=hiring&fbclid=IwAR123&ref=job_board";
    const cleaned = cleanCanonicalUrl(dirtyUrl);
    assert.equal(cleaned, "https://jobs.example.com/posting/123");

    // 1b. Preserves functional query params
    const functionalUrl = "https://boards.greenhouse.io/company/jobs?gh_jid=45678&utm_source=feed";
    const cleanedFunctional = cleanCanonicalUrl(functionalUrl);
    assert.equal(cleanedFunctional, "https://boards.greenhouse.io/company/jobs?gh_jid=45678");

    // 1c. Normalizes hostname casing and strips default port
    const casedUrl = "HTTPS://JOBS.Example.COM:443/dev/engineer/";
    assert.equal(cleanCanonicalUrl(casedUrl), "https://jobs.example.com/dev/engineer");

    // 1d. Rejects invalid and non-http schemes
    assert.equal(cleanCanonicalUrl("javascript:alert(1)"), null);
    assert.equal(cleanCanonicalUrl("ftp://files.example.com/jobs"), null);
    assert.equal(cleanCanonicalUrl(""), null);
    assert.equal(cleanCanonicalUrl(null), null);
  });

  // 2. Normalizing Single Job via JobNormalizationEngine
  await t.test("2. Normalization Engine: converts raw discovered job into validated canonical CreateJobInput", async () => {
    const rawJob: DiscoveredRawJob = {
      source: "remoteok",
      sourceJobId: "90501",
      url: "https://remoteok.com/remote-jobs/90501-senior-fullstack-dev?utm_source=feed",
      discoveredAt: new Date("2026-08-28T00:00:00Z"),
      data: {
        id: "90501",
        position: "Senior Fullstack Engineer",
        company: "Acme Tech Inc",
        location: "Worldwide",
        salary_min: 150000,
        salary_max: 180000,
        tags: ["TypeScript", "react", "Node.js", "TypeScript", "   "],
        description: "<p>We need a <strong>Senior Fullstack Engineer</strong>.</p>",
        url: "https://remoteok.com/remote-jobs/90501-senior-fullstack-dev?utm_source=feed",
        apply_url: "https://jobs.lever.co/acme/90501?utm_campaign=hire",
        epoch: 1740681600,
      },
    };

    const normalized = await jobNormalizationEngine.normalize(rawJob);

    // Assert canonical schema validation
    const validation = createJobInputSchema.safeParse(normalized);
    assert.equal(validation.success, true, "Normalized job must strictly satisfy createJobInputSchema");

    // Assert normalized fields
    assert.equal(normalized.title, "Senior Fullstack Engineer");
    assert.equal(normalized.company, "Acme Tech Inc");
    assert.equal(normalized.source, "remoteok");
    assert.equal(normalized.sourceJobId, "90501");
    assert.equal(normalized.remoteType, "WORLDWIDE_REMOTE");
    assert.equal(normalized.salaryMin, 150000);
    assert.equal(normalized.salaryMax, 180000);
    assert.equal(normalized.salary, 150000);

    // Assert tracking parameters stripped from URLs
    assert.equal(normalized.canonicalUrl, "https://remoteok.com/remote-jobs/90501-senior-fullstack-dev");
    assert.equal(normalized.applicationUrl, "https://jobs.lever.co/acme/90501");

    // Assert skills deduplication and whitespace stripping
    assert.deepEqual(normalized.skills, ["TypeScript", "react", "Node.js"]);

    // Assert HTML cleaned from description
    assert.ok(normalized.description?.includes("Senior Fullstack Engineer"));
    assert.ok(!normalized.description?.includes("<p>"));
  });

  // 3. Salary Bound Correction and Handling
  await t.test("3. Normalization Engine: corrects inverted salary bounds and handles undisclosed salary", async () => {
    const customRegistry = new JobSourceRegistry();
    const mockAdapter: JobSourceContract = {
      id: "mock_salary_source",
      name: "Mock Salary",
      type: "API",
      discover: async () => [],
      normalize: async () => ({
        source: "mock_salary_source",
        sourceJobId: "sal_1",
        title: "Staff Engineer",
        company: "Fintech Co",
        location: null,
        remoteType: "UNKNOWN",
        allowedCountries: [],
        salaryMin: 200000,
        salaryMax: 150000, // Inverted by provider!
        salary: null,
        currency: "USD",
        skills: ["Go"],
        requirements: [],
        description: "Job description",
        applicationUrl: "https://example.com/apply",
        canonicalUrl: null,
        status: "ACTIVE",
        postedAt: null,
      }),
      getApplicationUrl: async () => "https://example.com/apply",
      verifyStatus: async () => "ACTIVE",
    };

    customRegistry.register(mockAdapter);
    const engine = new JobNormalizationEngine(customRegistry);

    const normalized = await engine.normalize({
      source: "mock_salary_source",
      sourceJobId: "sal_1",
      data: {},
      discoveredAt: new Date(),
    });

    // Min and Max should be corrected (min <= max)
    assert.equal(normalized.salaryMin, 150000);
    assert.equal(normalized.salaryMax, 200000);
    assert.equal(normalized.salary, 150000);
  });

  // 4. Truthful Error Handling on Missing or Invalid Sources
  await t.test("4. Normalization Engine: handles unregistered sources and malformed payloads truthfully", async () => {
    // 4a. Unregistered source
    await assert.rejects(
      async () =>
        jobNormalizationEngine.normalize({
          source: "unregistered_board",
          sourceJobId: "job_99",
          data: {},
          discoveredAt: new Date(),
        }),
      (err: unknown) => err instanceof JobSourceAdapterNotFoundError,
      "Unregistered source must throw JobSourceAdapterNotFoundError"
    );

    // 4b. Missing source identifier
    await assert.rejects(
      async () =>
        jobNormalizationEngine.normalize({
          source: "",
          sourceJobId: "job_99",
          data: {},
          discoveredAt: new Date(),
        }),
      (err: unknown) => err instanceof JobValidationError,
      "Missing source must throw JobValidationError"
    );

    // 4c. Missing sourceJobId
    await assert.rejects(
      async () =>
        jobNormalizationEngine.normalize({
          source: "remoteok",
          sourceJobId: "",
          data: {},
          discoveredAt: new Date(),
        }),
      (err: unknown) => err instanceof JobValidationError,
      "Missing sourceJobId must throw JobValidationError"
    );

    // 4d. Malformed payload missing required title or company
    await assert.rejects(
      async () =>
        jobNormalizationEngine.normalize({
          source: "remoteok",
          sourceJobId: "bad_item",
          data: { id: "bad_item" }, // Missing position, company, url
          discoveredAt: new Date(),
        }),
      (err: unknown) => err instanceof JobValidationError,
      "Malformed item failing validation must throw JobValidationError"
    );
  });

  // 5. Batch Normalization with Item-Level Error Isolation
  await t.test("5. Batch Normalization: processes multiple items with isolated errors", async () => {
    const rawBatch: DiscoveredRawJob[] = [
      // Valid item 1
      {
        source: "remoteok",
        sourceJobId: "batch_1",
        discoveredAt: new Date(),
        data: {
          id: "batch_1",
          position: "Frontend Engineer",
          company: "Web Corp",
          apply_url: "https://example.com/apply/1",
          location: "Worldwide",
        },
      },
      // Broken item (missing company and url)
      {
        source: "remoteok",
        sourceJobId: "batch_broken",
        discoveredAt: new Date(),
        data: {
          id: "batch_broken",
          position: "Ghost Role",
        },
      },
      // Valid item 2
      {
        source: "remoteok",
        sourceJobId: "batch_2",
        discoveredAt: new Date(),
        data: {
          id: "batch_2",
          position: "DevOps Engineer",
          company: "Cloud Corp",
          apply_url: "https://example.com/apply/2",
          location: "United States",
        },
      },
    ];

    const result = await jobNormalizationEngine.normalizeBatch(rawBatch);

    assert.equal(result.totalProcessed, 3);
    assert.equal(result.successful.length, 2, "2 valid jobs must succeed");
    assert.equal(result.failed.length, 1, "1 broken job must be reported in failed array");
    assert.equal(result.failed[0]?.sourceJobId, "batch_broken");
    assert.ok(result.failed[0]?.error.includes("validation") || result.failed[0]?.error.includes("company"));
    assert.equal(result.successful[0]?.job.title, "Frontend Engineer");
    assert.equal(result.successful[1]?.job.title, "DevOps Engineer");
  });

  // 6. Inngest Durable Function: normalizeJobFunction Simulation
  await t.test("6. Inngest Workflow: normalizeJobFunction executes inside durable steps and dispatches job.normalized", async () => {
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
        return { ids: ["event_norm_1"] };
      },
    };

    const testEvent = {
      name: "job.discovered" as const,
      data: {
        source: "remoteok",
        sourceJobId: "inngest_norm_1",
        url: "https://remoteok.com/remote-jobs/inngest_norm_1",
        discoveredAt: new Date().toISOString(),
        data: {
          id: "inngest_norm_1",
          position: "Platform Engineer",
          company: "Infra Ltd",
          apply_url: "https://example.com/apply/infra",
          location: "Worldwide",
          tags: ["Terraform", "AWS"],
        },
      },
    };

    const handler = (normalizeJobFunction as any)["fn"];
    assert.ok(typeof handler === "function");

    const result = await handler({
      event: testEvent,
      step: mockStep,
    });

    assert.equal(result.success, true);
    assert.equal(result.source, "remoteok");
    assert.equal(result.sourceJobId, "inngest_norm_1");
    assert.equal(result.remoteType, "WORLDWIDE_REMOTE");

    // Verify step boundaries
    assert.ok(executedSteps.includes("normalize-payload"), "Must execute normalize-payload inside step.run()");
    assert.ok(executedSteps.includes("emit-job-normalized"), "Must dispatch event inside step.sendEvent()");

    // Verify emitted event
    assert.equal(emittedEvents.length, 1);
    assert.equal(emittedEvents[0]?.name, "job.normalized");
    assert.equal(emittedEvents[0]?.data.source, "remoteok");
    assert.equal(emittedEvents[0]?.data.sourceJobId, "inngest_norm_1");
    assert.equal((emittedEvents[0]?.data.job as any).title, "Platform Engineer");
  });
});
