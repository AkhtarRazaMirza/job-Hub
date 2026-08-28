/**
 * Job Hub — Phase 3 / Step 3.3
 * Job Source Adapters & Registry Deterministic Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  jobSourceRegistry,
  JobSourceRegistry,
  RemoteOkAdapter,
  ArbeitnowAdapter,
  JobSourceNetworkError,
  JobSourceRateLimitError,
  JobSourceParseError,
  JobSourceAdapterNotFoundError,
  classifyRemotePolicy,
  cleanDescriptionText,
  createJobInputSchema,
  type JobSourceContract,
} from "@job-hub/jobs";
import { jobRepository } from "@job-hub/jobs/server";
import { JobValidationError } from "@job-hub/jobs";

// ==========================================
// Fixtures
// ==========================================

const REMOTEOK_FIXTURE = [
  {
    legal: "Please do not scrape our API without permission. RemoteOK API terms of use...",
  },
  {
    id: "90001",
    epoch: "1740681600",
    date: "2025-02-27T18:40:00+00:00",
    company: "Distributed Cloud Inc",
    position: "Staff Backend Engineer",
    tags: ["typescript", "postgres", "distributed-systems", "remote"],
    description: "<p>We are looking for a <strong>Staff Backend Engineer</strong>.</p><ul><li>5+ years Node.js</li><li>Postgres expertise</li></ul>",
    location: "Worldwide",
    salary_min: 160000,
    salary_max: 190000,
    url: "https://remoteok.com/remote-jobs/90001-staff-backend-engineer",
    apply_url: "https://jobs.lever.co/distributedcloud/90001",
  },
  {
    id: "90002",
    epoch: "1740685200",
    date: "2025-02-27T19:40:00+00:00",
    company: "US Fintech LLC",
    position: "Senior React Developer",
    tags: ["react", "frontend", "typescript"],
    description: "Build high-speed trading dashboards &amp; financial tools.",
    location: "United States",
    salary_min: 140000,
    salary_max: 165000,
    url: "https://remoteok.com/remote-jobs/90002-senior-react-developer",
    apply_url: "https://remoteok.com/apply/90002",
  },
  {
    id: "90003",
    date: "2025-02-27T20:00:00+00:00",
    company: "Ambiguous Remote Co",
    position: "DevOps Engineer",
    tags: ["docker", "k8s"],
    description: "Manage cloud infrastructure.",
    location: "Remote", // Only says "Remote" without worldwide qualification
    url: "https://remoteok.com/remote-jobs/90003-devops-engineer",
    apply_url: "https://remoteok.com/apply/90003",
  },
];

const ARBEITNOW_FIXTURE = {
  data: [
    {
      slug: "senior-go-developer-88001",
      company_name: "Berlin Platform GmbH",
      title: "Senior Go Developer",
      description: "<p>Scale our high-throughput microservices.</p><br>Requirements:<br>- 4+ years Go",
      remote: true,
      url: "https://www.arbeitnow.com/jobs/companies/berlin-platform/senior-go-developer-88001",
      tags: ["Go", "Kubernetes", "Kafka"],
      job_types: ["Full Time"],
      location: "Germany",
      created_at: 1740681600,
    },
    {
      slug: "frontend-architect-88002",
      company_name: "Global Anywhere Ltd",
      title: "Frontend Architect",
      description: "Shape the next-gen web platform across all teams.",
      remote: true,
      url: "https://www.arbeitnow.com/jobs/companies/global-anywhere/frontend-architect-88002",
      tags: ["Next.js", "TypeScript", "Tailwind"],
      job_types: ["Full Time"],
      location: "Worldwide",
      created_at: 1740683400,
    },
    {
      slug: "office-admin-88003",
      company_name: "Local Onsite Corp",
      title: "Office Administrator",
      description: "Manage local office logistics and on-site hardware.",
      remote: false,
      url: "https://www.arbeitnow.com/jobs/companies/local-onsite/office-admin-88003",
      tags: ["Administration"],
      job_types: ["Full Time"],
      location: "Munich, Germany",
      created_at: 1740685000,
    },
  ],
};

function createMockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(handler(url, init));
  };
}

test("Step 3.3 — Job Source Adapters & Registry Test Suite", async (t) => {
  // 1. Adapter Contract Compliance
  await t.test("1. Adapter Contract Compliance: RemoteOK and Arbeitnow implement JobSourceContract", () => {
    const remoteOk = new RemoteOkAdapter();
    assert.equal(remoteOk.id, "remoteok");
    assert.equal(remoteOk.name, "RemoteOK");
    assert.equal(remoteOk.type, "API");
    assert.equal(typeof remoteOk.discover, "function");
    assert.equal(typeof remoteOk.normalize, "function");
    assert.equal(typeof remoteOk.getApplicationUrl, "function");
    assert.equal(typeof remoteOk.verifyStatus, "function");

    const arbeitnow = new ArbeitnowAdapter();
    assert.equal(arbeitnow.id, "arbeitnow");
    assert.equal(arbeitnow.name, "Arbeitnow");
    assert.equal(arbeitnow.type, "API");
    assert.equal(typeof arbeitnow.discover, "function");
    assert.equal(typeof arbeitnow.normalize, "function");
    assert.equal(typeof arbeitnow.getApplicationUrl, "function");
    assert.equal(typeof arbeitnow.verifyStatus, "function");
  });

  // 2. Registry Registration & Discovery
  await t.test("2. Registry Registration & Discovery: lookup, requirement, list, and override controls", () => {
    const registry = new JobSourceRegistry();
    const mockAdapter: JobSourceContract = {
      id: "mock_source",
      name: "Mock Source",
      type: "BOARD",
      discover: async () => [],
      normalize: async () => ({} as any),
      getApplicationUrl: async () => "https://example.com",
      verifyStatus: async () => "ACTIVE",
    };

    assert.equal(registry.has("mock_source"), false);
    registry.register(mockAdapter);
    assert.equal(registry.has("mock_source"), true);
    assert.equal(registry.get("mock_source")?.name, "Mock Source");
    assert.equal(registry.require("mock_source").id, "mock_source");
    assert.equal(registry.list().length, 1);

    // Duplicate registration without override should throw
    assert.throws(
      () => registry.register(mockAdapter),
      /already registered/
    );

    // Duplicate registration with override allowed
    assert.doesNotThrow(() => registry.register(mockAdapter, { allowOverride: true }));

    // Unregistering
    assert.equal(registry.unregister("mock_source"), true);
    assert.equal(registry.has("mock_source"), false);
    assert.throws(
      () => registry.require("mock_source"),
      (err: unknown) => err instanceof JobSourceAdapterNotFoundError
    );

    // Global registry has default adapters
    assert.ok(jobSourceRegistry.has("remoteok"), "Global registry must contain RemoteOK adapter");
    assert.ok(jobSourceRegistry.has("arbeitnow"), "Global registry must contain Arbeitnow adapter");
  });

  // 3. RemoteOK Successful Discovery and Normalization
  await t.test("3. RemoteOK Adapter: discovers raw jobs and normalizes to canonical Job schema", async () => {
    const mockFetch = createMockFetch(async (url) => {
      assert.ok(url.includes("remoteok.com/api"));
      return new Response(JSON.stringify(REMOTEOK_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const adapter = new RemoteOkAdapter(mockFetch);
    const discovered = await adapter.discover();

    // 4 items in fixture, but item 0 is legal disclaimer -> 3 real jobs discovered
    assert.equal(discovered.length, 3, "Must skip legal disclaimer and return 3 real jobs");
    assert.equal(discovered[0]?.sourceJobId, "90001");
    assert.equal(discovered[0]?.source, "remoteok");

    // Normalizing Job 1 (Worldwide Remote)
    const normalized1 = await adapter.normalize(discovered[0]!);
    const validated1 = createJobInputSchema.safeParse(normalized1);
    assert.equal(validated1.success, true, "Normalized job 1 must satisfy canonical CreateJobInput schema");
    assert.equal(normalized1.title, "Staff Backend Engineer");
    assert.equal(normalized1.company, "Distributed Cloud Inc");
    assert.equal(normalized1.remoteType, "WORLDWIDE_REMOTE", "Location 'Worldwide' must classify as WORLDWIDE_REMOTE");
    assert.equal(normalized1.salaryMin, 160000);
    assert.equal(normalized1.salaryMax, 190000);
    assert.equal(normalized1.applicationUrl, "https://jobs.lever.co/distributedcloud/90001");
    assert.equal(normalized1.canonicalUrl, "https://remoteok.com/remote-jobs/90001-staff-backend-engineer");
    assert.ok(normalized1.skills.includes("typescript"));
    assert.ok(!normalized1.description?.includes("<p>"), "HTML tags must be stripped from description");

    // Normalizing Job 2 (Country Remote)
    const normalized2 = await adapter.normalize(discovered[1]!);
    assert.equal(normalized2.remoteType, "COUNTRY_REMOTE", "Location 'United States' must classify as COUNTRY_REMOTE");
    assert.equal(normalized2.company, "US Fintech LLC");
    assert.ok(normalized2.description?.includes("Build high-speed trading dashboards & financial tools."));

    // Normalizing Job 3 (Ambiguous Remote -> UNKNOWN)
    const normalized3 = await adapter.normalize(discovered[2]!);
    assert.equal(
      normalized3.remoteType,
      "UNKNOWN",
      "Per 04_ai_agent_skills.md §6, 'Remote' alone must NOT be assumed worldwide"
    );

    // Verify getApplicationUrl
    const appUrl = await adapter.getApplicationUrl(discovered[0]!);
    assert.equal(appUrl, "https://jobs.lever.co/distributedcloud/90001");
  });

  // 4. Arbeitnow Successful Discovery and Normalization
  await t.test("4. Arbeitnow Adapter: discovers and normalizes jobs to canonical Job schema", async () => {
    const mockFetch = createMockFetch(async (url) => {
      assert.ok(url.includes("arbeitnow.com"));
      return new Response(JSON.stringify(ARBEITNOW_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const adapter = new ArbeitnowAdapter(mockFetch);
    const discovered = await adapter.discover({ limit: 2 });

    assert.equal(discovered.length, 2, "Must respect limit option");
    assert.equal(discovered[0]?.sourceJobId, "senior-go-developer-88001");

    // Normalize Job 1 (remote=true, location='Germany' -> COUNTRY_REMOTE)
    const normalized1 = await adapter.normalize(discovered[0]!);
    const validated1 = createJobInputSchema.safeParse(normalized1);
    assert.equal(validated1.success, true, "Arbeitnow job 1 must satisfy canonical CreateJobInput schema");
    assert.equal(normalized1.title, "Senior Go Developer");
    assert.equal(normalized1.company, "Berlin Platform GmbH");
    assert.equal(normalized1.remoteType, "COUNTRY_REMOTE");
    assert.ok(normalized1.skills.includes("Go"));
    assert.ok(normalized1.skills.includes("Kubernetes"));
    assert.ok(!normalized1.description?.includes("<p>"));

    // Normalize Job 2 (remote=true, location='Worldwide' -> WORLDWIDE_REMOTE)
    const normalized2 = await adapter.normalize(discovered[1]!);
    assert.equal(normalized2.remoteType, "WORLDWIDE_REMOTE");
    assert.equal(normalized2.title, "Frontend Architect");
  });

  // 5. Malformed and Invalid Provider Data
  await t.test("5. Malformed/invalid provider data handling produces explicit parse and validation errors", async () => {
    // 5a. RemoteOK returning invalid JSON string
    const badJsonFetch = createMockFetch(async () => new Response("Not JSON", { status: 200 }));
    const remoteOkBadJson = new RemoteOkAdapter(badJsonFetch);
    await assert.rejects(
      async () => remoteOkBadJson.discover(),
      (err: unknown) => err instanceof JobSourceParseError,
      "Invalid JSON must throw JobSourceParseError"
    );

    // 5b. RemoteOK returning object instead of array
    const notArrayFetch = createMockFetch(async () => new Response(JSON.stringify({ error: "none" }), { status: 200 }));
    const remoteOkNotArray = new RemoteOkAdapter(notArrayFetch);
    await assert.rejects(
      async () => remoteOkNotArray.discover(),
      (err: unknown) => err instanceof JobSourceParseError,
      "Non-array payload must throw JobSourceParseError"
    );

    // 5c. Arbeitnow returning empty body
    const arbeitnowBadFetch = createMockFetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    const arbeitnowBad = new ArbeitnowAdapter(arbeitnowBadFetch);
    await assert.rejects(
      async () => arbeitnowBad.discover(),
      (err: unknown) => err instanceof JobSourceParseError,
      "Arbeitnow missing data array must throw JobSourceParseError"
    );

    // 5d. Missing title or company during normalization
    const remoteOk = new RemoteOkAdapter();
    await assert.rejects(
      async () => remoteOk.normalize({
        source: "remoteok",
        sourceJobId: "1",
        data: { id: "1", company: "Acme" }, // missing position/title
        discoveredAt: new Date(),
      }),
      (err: unknown) => err instanceof JobValidationError,
      "Missing title must throw JobValidationError"
    );

    // 5e. Missing company during normalization
    await assert.rejects(
      async () => remoteOk.normalize({
        source: "remoteok",
        sourceJobId: "1",
        data: { id: "1", position: "Dev", apply_url: "https://example.com" }, // missing company
        discoveredAt: new Date(),
      }),
      (err: unknown) => err instanceof JobValidationError,
      "Missing company must throw JobValidationError"
    );
  });

  // 6. Network and HTTP Failure Handling
  await t.test("6. Network and HTTP failure behavior: 429 rate limit, 500 error, and network drops", async () => {
    // 6a. HTTP 429 Rate Limit
    const rateLimitFetch = createMockFetch(async () =>
      new Response("Rate limit exceeded", {
        status: 429,
        headers: { "retry-after": "60" },
      })
    );
    const rateLimitedAdapter = new RemoteOkAdapter(rateLimitFetch);
    await assert.rejects(
      async () => rateLimitedAdapter.discover(),
      (err: unknown) => {
        return (
          err instanceof JobSourceRateLimitError &&
          err.sourceId === "remoteok" &&
          err.retryAfterSeconds === 60
        );
      },
      "HTTP 429 must throw JobSourceRateLimitError with retryAfterSeconds"
    );

    // 6b. HTTP 503 Service Unavailable
    const serverErrorFetch = createMockFetch(async () =>
      new Response("Server Error", { status: 503, statusText: "Service Unavailable" })
    );
    const serverErrorAdapter = new ArbeitnowAdapter(serverErrorFetch);
    await assert.rejects(
      async () => serverErrorAdapter.discover(),
      (err: unknown) => {
        return (
          err instanceof JobSourceNetworkError &&
          err.sourceId === "arbeitnow" &&
          err.statusCode === 503
        );
      },
      "HTTP 503 must throw JobSourceNetworkError with statusCode 503"
    );

    // 6c. Network drop / connection refused (fetch throws TypeError)
    const networkDropFetch = createMockFetch(async () => {
      throw new TypeError("fetch failed: ECONNREFUSED");
    });
    const networkDropAdapter = new RemoteOkAdapter(networkDropFetch);
    await assert.rejects(
      async () => networkDropAdapter.discover(),
      (err: unknown) => {
        return (
          err instanceof JobSourceNetworkError &&
          err.message.includes("ECONNREFUSED")
        );
      },
      "Network drop must throw truthful JobSourceNetworkError without fabricating success"
    );
  });

  // 7. Status Verification
  await t.test("7. Status verification checks application URL state truthfulness", async () => {
    // 7a. Active (200 OK)
    const activeFetch = createMockFetch(async () => new Response(null, { status: 200 }));
    const adapter1 = new RemoteOkAdapter(activeFetch);
    const status1 = await adapter1.verifyStatus({ applicationUrl: "https://jobs.example.com/active" });
    assert.equal(status1, "ACTIVE");

    // 7b. Closed (404 Not Found)
    const closedFetch = createMockFetch(async () => new Response(null, { status: 404 }));
    const adapter2 = new RemoteOkAdapter(closedFetch);
    const status2 = await adapter2.verifyStatus({ applicationUrl: "https://jobs.example.com/closed" });
    assert.equal(status2, "CLOSED");

    // 7c. Network error -> UNKNOWN (does not guess)
    const errorFetch = createMockFetch(async () => {
      throw new Error("Network timeout");
    });
    const adapter3 = new RemoteOkAdapter(errorFetch);
    const status3 = await adapter3.verifyStatus({ applicationUrl: "https://jobs.example.com/timeout" });
    assert.equal(status3, "UNKNOWN", "Status verification failure must result in UNKNOWN, never invented");
  });

  // 8. End-to-End Pipeline with Database Persistence
  await t.test("8. Integration: Discovered and normalized jobs persist cleanly to PostgreSQL via repository", async () => {
    const mockFetch = createMockFetch(async () =>
      new Response(JSON.stringify(REMOTEOK_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const adapter = new RemoteOkAdapter(mockFetch);
    const [rawJob] = await adapter.discover({ limit: 1 });
    assert.ok(rawJob);

    const normalized = await adapter.normalize(rawJob);
    const testJobId = `adapter_test_${Date.now()}`;

    const created = await jobRepository.create({
      ...normalized,
      id: testJobId,
      sourceJobId: `ext_${testJobId}`,
    });

    try {
      assert.equal(created.id, testJobId);
      assert.equal(created.company, "Distributed Cloud Inc");
      assert.equal(created.remoteType, "WORLDWIDE_REMOTE");

      // Verify retrieval from DB
      const retrieved = await jobRepository.findById(testJobId);
      assert.ok(retrieved);
      assert.equal(retrieved.title, "Staff Backend Engineer");
      assert.equal(retrieved.salary, 160000);
      assert.deepEqual(retrieved.skills, ["typescript", "postgres", "distributed-systems"]);
    } finally {
      await jobRepository.delete(testJobId).catch(() => {});
    }
  });
});
