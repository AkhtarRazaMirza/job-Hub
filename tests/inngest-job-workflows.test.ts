/**
 * Job Hub — Phase 3 / Step 3.8
 * Inngest Durable Workflows & Full Ingestion Pipeline Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverJobsFunction,
  normalizeJobFunction,
  verifyJobFunction,
  deduplicateAndIngestJobFunction,
  jobDiscoveryTriggerEvent,
  jobDiscoveredEvent,
  jobNormalizedEvent,
  jobVerifiedEvent,
  jobDuplicateDetectedEvent,
  jobIngestedEvent,
} from "@job-hub/inngest";
import { jobRepository } from "@job-hub/jobs/server";

test("Step 3.8 — Inngest Durable Scheduled Discovery & Processing Workflows Test Suite", async (t) => {
  // 1. Event Schemas Validation
  await t.test("1. Event Catalog: validates eventType definitions for complete ingestion pipeline", () => {
    assert.equal(jobDiscoveryTriggerEvent.name, "jobs/discovery.trigger");
    assert.equal(jobDiscoveredEvent.name, "job.discovered");
    assert.equal(jobNormalizedEvent.name, "job.normalized");
    assert.equal(jobVerifiedEvent.name, "job.verified");
    assert.equal(jobDuplicateDetectedEvent.name, "job.duplicate.detected");
    assert.equal(jobIngestedEvent.name, "job.ingested");
  });

  // 2. deduplicateAndIngestJobFunction: Unique Job Flow
  await t.test("2. Durable Workflow: persists unique job and emits job.ingested", async () => {
    const executedSteps: string[] = [];
    const emittedEvents: { name: string; data: any }[] = [];

    const mockStep = {
      run: async (stepId: string, fn: () => Promise<any>) => {
        executedSteps.push(stepId);
        if (stepId === "check-duplicate") {
          return { isDuplicate: false, match: null };
        }
        if (stepId === "persist-canonical-job") {
          return {
            id: "job_persisted_901",
            source: "remoteok",
            sourceJobId: "rok_901",
            title: "Staff SRE",
            company: "Cloud Scale Co",
            remoteType: "WORLDWIDE_REMOTE",
          };
        }
        return await fn();
      },
      sendEvent: async (stepId: string, events: any) => {
        executedSteps.push(stepId);
        const evArray = Array.isArray(events) ? events : [events];
        emittedEvents.push(...evArray);
        return { ids: ["event_ingest_1"] };
      },
    };

    const verifiedEvent = {
      name: "job.verified" as const,
      data: {
        source: "remoteok",
        sourceJobId: "rok_901",
        status: "ACTIVE" as const,
        isVerified: true,
        isStale: false,
        isSpam: false,
        remoteClassification: "WORLDWIDE_REMOTE" as const,
        reasons: [],
        verifiedAt: new Date().toISOString(),
        job: {
          source: "remoteok",
          sourceJobId: "rok_901",
          title: "Staff SRE",
          company: "Cloud Scale Co",
          location: "Worldwide",
          remoteType: "WORLDWIDE_REMOTE",
          applicationUrl: "https://example.com/apply/901",
          canonicalUrl: "https://example.com/jobs/901",
          skills: ["Kubernetes", "Go"],
          status: "ACTIVE",
        },
      },
    };

    const handler = (deduplicateAndIngestJobFunction as any)["fn"];
    assert.ok(typeof handler === "function");

    const result = await handler({
      event: verifiedEvent,
      step: mockStep,
    });

    assert.equal(result.status, "INGESTED");
    assert.equal(result.jobId, "job_persisted_901");
    assert.ok(executedSteps.includes("check-duplicate"));
    assert.ok(executedSteps.includes("persist-canonical-job"));
    assert.ok(executedSteps.includes("emit-job-ingested"));

    assert.equal(emittedEvents.length, 1);
    assert.equal(emittedEvents[0]?.name, "job.ingested");
    assert.equal(emittedEvents[0]?.data.jobId, "job_persisted_901");
    assert.equal(emittedEvents[0]?.data.title, "Staff SRE");
  });

  // 3. deduplicateAndIngestJobFunction: Duplicate Job Flow
  await t.test("3. Durable Workflow: detects duplicate, skips persistence, and emits job.duplicate.detected", async () => {
    const executedSteps: string[] = [];
    const emittedEvents: { name: string; data: any }[] = [];

    const mockStep = {
      run: async (stepId: string, fn: () => Promise<any>) => {
        executedSteps.push(stepId);
        if (stepId === "check-duplicate") {
          return {
            isDuplicate: true,
            match: {
              canonicalJobId: "canonical_existing_777",
              matchType: "EXACT_CANONICAL_URL",
              confidence: 1.0,
              reasons: ["Exact match on canonical URL"],
            },
          };
        }
        return await fn();
      },
      sendEvent: async (stepId: string, events: any) => {
        executedSteps.push(stepId);
        const evArray = Array.isArray(events) ? events : [events];
        emittedEvents.push(...evArray);
        return { ids: ["event_dup_1"] };
      },
    };

    const verifiedEvent = {
      name: "job.verified" as const,
      data: {
        source: "arbeitnow",
        sourceJobId: "arb_777",
        status: "ACTIVE" as const,
        isVerified: true,
        isStale: false,
        isSpam: false,
        remoteClassification: "WORLDWIDE_REMOTE" as const,
        reasons: [],
        verifiedAt: new Date().toISOString(),
        job: {
          source: "arbeitnow",
          sourceJobId: "arb_777",
          title: "Staff SRE",
          company: "Cloud Scale Co",
          canonicalUrl: "https://example.com/jobs/901",
          applicationUrl: "https://example.com/apply/901",
          status: "ACTIVE",
        },
      },
    };

    const handler = (deduplicateAndIngestJobFunction as any)["fn"];
    const result = await handler({
      event: verifiedEvent,
      step: mockStep,
    });

    assert.equal(result.status, "DUPLICATE");
    assert.equal(result.canonicalJobId, "canonical_existing_777");
    assert.ok(executedSteps.includes("check-duplicate"));
    assert.ok(!executedSteps.includes("persist-canonical-job"), "Must NOT persist duplicate job");
    assert.ok(executedSteps.includes("emit-duplicate-detected"));

    assert.equal(emittedEvents.length, 1);
    assert.equal(emittedEvents[0]?.name, "job.duplicate.detected");
    assert.equal(emittedEvents[0]?.data.canonicalJobId, "canonical_existing_777");
  });

  // 4. End-to-End Pipeline Chain Simulation
  await t.test("4. Full Pipeline: simulates discovery -> normalize -> verify -> deduplicate flow", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 200 });

    try {
      // Step A: Normalized Handler Simulation
      const normHandler = (normalizeJobFunction as any)["fn"];
      const normSteps: string[] = [];
      const normEmitted: any[] = [];
      const normResult = await normHandler({
        event: {
          name: "job.discovered",
          data: {
            source: "remoteok",
            sourceJobId: "chain_101",
            url: "https://remoteok.com/job/chain_101",
            discoveredAt: new Date().toISOString(),
            data: {
              id: "chain_101",
              position: "Fullstack Architect",
              company: "Acme Global",
              location: "Worldwide",
              apply_url: "https://example.com/apply/chain_101",
            },
          },
        },
        step: {
          run: async (s: string, fn: any) => { normSteps.push(s); return await fn(); },
          sendEvent: async (s: string, ev: any) => { normSteps.push(s); normEmitted.push(ev); },
        },
      });

      assert.equal(normResult.success, true);
      assert.equal(normEmitted[0]?.name, "job.normalized");

      // Step B: Verify Handler Simulation
      const verifyHandler = (verifyJobFunction as any)["fn"];
      const verifySteps: string[] = [];
      const verifyEmitted: any[] = [];

      const verifyResult = await verifyHandler({
        event: normEmitted[0],
        step: {
          run: async (s: string, fn: any) => { verifySteps.push(s); return await fn(); },
          sendEvent: async (s: string, ev: any) => { verifySteps.push(s); verifyEmitted.push(ev); },
        },
      });

    assert.equal(verifyResult.success, true);
    assert.equal(verifyEmitted[0]?.name, "job.verified");

    // Step C: Ingestion / Deduplication Simulation
    const ingestHandler = (deduplicateAndIngestJobFunction as any)["fn"];
    const ingestSteps: string[] = [];
    const ingestEmitted: any[] = [];
    const ingestResult = await ingestHandler({
      event: verifyEmitted[0],
      step: {
        run: async (s: string, fn: any) => {
          ingestSteps.push(s);
          if (s === "check-duplicate") return { isDuplicate: false, match: null };
          if (s === "persist-canonical-job") return { id: "job_chain_created", ...verifyEmitted[0].data.job };
          return await fn();
        },
        sendEvent: async (s: string, ev: any) => { ingestSteps.push(s); ingestEmitted.push(ev); },
      },
    });

    assert.equal(ingestResult.status, "INGESTED");
    assert.equal(ingestResult.jobId, "job_chain_created");
    assert.equal(ingestEmitted[0]?.name, "job.ingested");
  } finally {
    globalThis.fetch = originalFetch;
  }
  });
});
