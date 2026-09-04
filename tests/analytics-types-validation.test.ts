/**
 * Phase 9 / Step 9.1 Focused Test Suite:
 * Analytics Domain Models, Types & Zod Filter Schemas
 *
 * Verifies:
 * 1. Zod filter validation for dates, status, sources, and granularity.
 * 2. Strict rejection of invalid date strings.
 * 3. Anti-spoofing assertion behavior.
 * 4. Score bands and type definitions alignment with domain invariants.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SCORE_BANDS,
  TREND_GRANULARITIES,
  type ScoreBand,
  type TrendGranularity,
} from "../packages/applications/src/analytics/types";
import {
  analyticsFilterSchema,
  analyticsTrendsFilterSchema,
  rolePerformanceFilterSchema,
  assertAnalyticsIdentityProtection,
} from "../packages/applications/src/analytics/validation";

describe("Phase 9 / Step 9.1 — Analytics Models, Types & Validation", () => {
  it("1. Schema Validation: Valid date filters and status pass", () => {
    const valid = analyticsFilterSchema.parse({
      startDate: "2026-01-01",
      endDate: "2026-03-31T23:59:59.000Z",
      source: "remoteok",
      status: "APPLIED",
    });

    assert.equal(valid.startDate, "2026-01-01");
    assert.equal(valid.endDate, "2026-03-31T23:59:59.000Z");
    assert.equal(valid.source, "remoteok");
    assert.equal(valid.status, "APPLIED");
  });

  it("2. Schema Validation: Invalid date strings are rejected", () => {
    assert.throws(
      () => {
        analyticsFilterSchema.parse({
          startDate: "not-a-valid-date",
        });
      },
      { name: "ZodError" }
    );
  });

  it("3. Trends Filter: Defaults granularity to 'week' and validates allowed granularities", () => {
    const defaultParsed = analyticsTrendsFilterSchema.parse({});
    assert.equal(defaultParsed.granularity, "week");

    const dayParsed = analyticsTrendsFilterSchema.parse({ granularity: "day" });
    assert.equal(dayParsed.granularity, "day");

    const monthParsed = analyticsTrendsFilterSchema.parse({ granularity: "month" });
    assert.equal(monthParsed.granularity, "month");

    assert.throws(
      () => {
        analyticsTrendsFilterSchema.parse({ granularity: "year" as any });
      },
      { name: "ZodError" }
    );
  });

  it("4. Role Performance Filter: Limits bounds to 1..100 with default 20", () => {
    const defaultParsed = rolePerformanceFilterSchema.parse({});
    assert.equal(defaultParsed.limit, 20);

    const custom = rolePerformanceFilterSchema.parse({ limit: 5 });
    assert.equal(custom.limit, 5);

    assert.throws(
      () => {
        rolePerformanceFilterSchema.parse({ limit: 0 });
      },
      { name: "ZodError" }
    );

    assert.throws(
      () => {
        rolePerformanceFilterSchema.parse({ limit: 101 });
      },
      { name: "ZodError" }
    );
  });

  it("5. Identity Protection: Blocks client-injected foreign userId or candidateProfileId", () => {
    const sessionUserId = "user-123";
    const profileId = "profile-123";

    // Matching IDs pass
    assert.doesNotThrow(() => {
      assertAnalyticsIdentityProtection(
        { userId: "user-123", candidateProfileId: "profile-123" },
        sessionUserId,
        profileId
      );
    });

    // Omitted IDs pass
    assert.doesNotThrow(() => {
      assertAnalyticsIdentityProtection({}, sessionUserId, profileId);
    });

    // Spoofed userId throws
    assert.throws(
      () => {
        assertAnalyticsIdentityProtection(
          { userId: "foreign-user" },
          sessionUserId,
          profileId
        );
      },
      /FORBIDDEN/
    );

    // Spoofed candidateProfileId throws
    assert.throws(
      () => {
        assertAnalyticsIdentityProtection(
          { candidateProfileId: "foreign-profile" },
          sessionUserId,
          profileId
        );
      },
      /FORBIDDEN/
    );
  });

  it("6. Domain Enums: Score bands and granularities match domain specification", () => {
    assert.deepEqual(SCORE_BANDS, ["85-100", "75-84", "60-74", "<60", "UNSCORED"]);
    assert.deepEqual(TREND_GRANULARITIES, ["day", "week", "month"]);
  });
});
