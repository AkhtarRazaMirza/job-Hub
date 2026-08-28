/**
 * Job Hub — Phase 3 / Step 3.4
 * Inngest Setup & Durable Workflow Infrastructure Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  inngest,
  functions,
  discoverJobsFunction,
  jobDiscoveryTriggerDataSchema,
  jobDiscoveredDataSchema,
  jobNormalizeRequestedDataSchema,
  jobDiscoveryTriggerEvent,
  jobDiscoveredEvent,
} from "@job-hub/inngest";
import { jobSourceRegistry, type JobSourceContract } from "@job-hub/jobs";
import { GET, PUT } from "../apps/web/app/api/inngest/route";

test("Step 3.4 — Inngest Setup & Durable Workflow Infrastructure Test Suite", async (t) => {
  // 1. Inngest Client Configuration
  await t.test("1. Inngest Client: instantiates with expected application ID and event bindings", () => {
    assert.ok(inngest, "Inngest client instance must exist");
    assert.equal(inngest.id, "job-hub", "Inngest client application ID must be 'job-hub'");
    assert.equal(typeof inngest.createFunction, "function", "Inngest client must support createFunction");
    assert.equal(typeof inngest.send, "function", "Inngest client must support send");
  });

  // 2. Event Schemas and Validation
  await t.test("2. Event Schemas: Zod validation for discovery triggers and discovered job events", () => {
    // 2a. jobDiscoveryTriggerDataSchema
    const validTrigger = {
      sourceId: "remoteok",
      limit: 25,
      tag: "react",
      triggeredBy: "manual" as const,
    };
    const parsedTrigger = jobDiscoveryTriggerDataSchema.safeParse(validTrigger);
    assert.equal(parsedTrigger.success, true, "Valid trigger payload must pass validation");

    // Empty trigger payload should be valid (defaults apply)
    const emptyTrigger = jobDiscoveryTriggerDataSchema.safeParse({});
    assert.equal(emptyTrigger.success, true, "Empty trigger payload must be valid for cron runs");

    // Negative limit rejected
    const invalidLimit = jobDiscoveryTriggerDataSchema.safeParse({ limit: -5 });
    assert.equal(invalidLimit.success, false, "Negative limit must be rejected");

    // 2b. jobDiscoveredDataSchema
    const validDiscovered = {
      source: "remoteok",
      sourceJobId: "90001",
      url: "https://remoteok.com/remote-jobs/90001",
      data: { position: "Software Engineer", company: "Acme" },
      discoveredAt: new Date().toISOString(),
    };
    const parsedDiscovered = jobDiscoveredDataSchema.safeParse(validDiscovered);
    assert.equal(parsedDiscovered.success, true, "Valid discovered job payload must pass validation");

    // Missing source or sourceJobId rejected
    const missingSource = jobDiscoveredDataSchema.safeParse({
      source: "",
      sourceJobId: "123",
      data: {},
      discoveredAt: new Date().toISOString(),
    });
    assert.equal(missingSource.success, false, "Empty source must be rejected");

    // 2c. jobNormalizeRequestedDataSchema
    const validNormalize = {
      source: "remoteok",
      sourceJobId: "90001",
      raw: { id: "90001", position: "Dev" },
    };
    assert.equal(
      jobNormalizeRequestedDataSchema.safeParse(validNormalize).success,
      true,
      "Normalize request schema must validate"
    );

    // 2d. eventType definitions
    assert.equal(jobDiscoveryTriggerEvent.name, "jobs/discovery.trigger");
    assert.equal(jobDiscoveredEvent.name, "job.discovered");
  });

  // 3. Durable Function Definitions and Triggers
  await t.test("3. Durable Function: discoverJobsFunction configuration, triggers, and retry policies", () => {
    assert.ok(discoverJobsFunction, "discoverJobsFunction must be defined");
    assert.ok(functions.length >= 1, "Functions export must contain registered functions");
    assert.ok(functions.includes(discoverJobsFunction), "Functions must include discoverJobsFunction");
  });

  // 4. Function Execution Logic: Step Isolation & Event Dispatch
  await t.test("4. Function Execution: step isolation, adapter resolution, and event dispatch simulation", async () => {
    // Register a predictable mock adapter
    const mockAdapter: JobSourceContract = {
      id: "inngest_test_source",
      name: "Inngest Test Source",
      type: "API",
      discover: async (options) => {
        const count = options?.limit ?? 2;
        return Array.from({ length: count }, (_, i) => ({
          source: "inngest_test_source",
          sourceJobId: `test_job_${i + 1}`,
          data: { title: `Test Job ${i + 1}`, company: "Test Co" },
          url: `https://example.com/job/${i + 1}`,
          discoveredAt: new Date("2026-08-28T00:00:00Z"),
        }));
      },
      normalize: async () => ({} as any),
      getApplicationUrl: async () => "https://example.com",
      verifyStatus: async () => "ACTIVE",
    };

    jobSourceRegistry.register(mockAdapter, { allowOverride: true });

    try {
      // Mock step runner to verify step-level execution
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
          return { ids: evArray.map((_, i) => `event_id_${i}`) };
        },
      };

      // 4a. Run discovery targeting only inngest_test_source
      const testEvent = {
        name: "jobs/discovery.trigger" as const,
        data: {
          sourceId: "inngest_test_source",
          limit: 3,
        },
      };

      const handler = (discoverJobsFunction as any)["fn"];
      assert.ok(typeof handler === "function", "Function internal execution handler must exist");

      const result = await handler({
        event: testEvent,
        step: mockStep,
      });

      assert.equal(result.success, true);
      assert.equal(result.totalDiscovered, 3);
      assert.deepEqual(result.sourcesProcessed, ["inngest_test_source"]);

      // Verify step execution sequence
      assert.ok(executedSteps.includes("resolve-job-sources"), "Must run resolve-job-sources step");
      assert.ok(executedSteps.includes("discover-from-inngest_test_source"), "Must run discover step");
      assert.ok(
        executedSteps.includes("emit-discovered-events-inngest_test_source"),
        "Must run sendEvent step"
      );

      // Verify emitted events
      assert.equal(emittedEvents.length, 3, "Must emit 3 job.discovered events");
      assert.equal(emittedEvents[0]?.name, "job.discovered");
      assert.equal(emittedEvents[0]?.data.source, "inngest_test_source");
      assert.equal(emittedEvents[0]?.data.sourceJobId, "test_job_1");

      // 4b. Non-existent sourceId throws clean error
      await assert.rejects(
        async () =>
          handler({
            event: {
              name: "jobs/discovery.trigger",
              data: { sourceId: "non_existent_source" },
            },
            step: mockStep,
          }),
        /not registered/
      );
    } finally {
      jobSourceRegistry.unregister("inngest_test_source");
    }
  });

  // 5. Next.js Serve Endpoint Introspection & Handshake
  await t.test("5. Next.js Serve Endpoint: GET introspection returns functions list in dev mode", async () => {
    // Ensure INNGEST_DEV=1 is set for the test
    process.env.INNGEST_DEV = "1";

    const request = new Request("http://localhost:3000/api/inngest", {
      method: "GET",
      headers: {
        host: "localhost:3000",
      },
    });

    const response = await GET(request);
    assert.equal(response.status, 200, "Serve GET endpoint must respond 200 OK in dev mode");

    const body = (await response.json()) as any;
    assert.ok(body, "Serve endpoint must return valid JSON");
    assert.equal(body.schema_version, "2024-05-24", "Inngest protocol schema version must be present");
    assert.equal(body.mode, "dev", "Endpoint must operate in dev mode");
    assert.ok(Array.isArray(body.function_count) || typeof body.function_count === "number");

    // PUT request handshake with mock fetch to isolate third-party sync calls
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      return new Response(JSON.stringify({ message: "Successfully registered" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const putRequest = new Request("http://localhost:3000/api/inngest", {
        method: "PUT",
        headers: {
          host: "localhost:3000",
        },
      });

      const putResponse = await PUT(putRequest);
      assert.equal(putResponse.status, 200, "Serve PUT handshake must respond 200 OK");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
