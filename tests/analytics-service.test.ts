/**
 * Job Hub — Phase 9 / Step 9.3 Focused Test Suite
 * Typed Analytics Domain Service & Metric Calculators
 *
 * Verifies:
 * 1. Safe Division & Truthful Rates: Denominator 0 returns null (never NaN or fake 0%).
 * 2. Average Match Score: Explicit null handling when no applications are scored.
 * 3. Non-Causal Score Bands: Truthful representation of conversion across all standard bands.
 * 4. Application Funnel: Stage progression rates and terminal outcomes.
 * 5. Deterministic Behavior: Consistent calculations across edge cases.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateRate,
  calculateAverageScore,
  AnalyticsService,
} from "../packages/applications/src/analytics/service";
import type { AnalyticsRepository } from "../packages/applications/src/analytics/repository";
import { SCORE_BANDS } from "../packages/applications/src/analytics/types";

describe("Phase 9 / Step 9.3 — Typed Analytics Domain Service & Metric Calculators", () => {
  it("1. calculateRate: Returns null and 'No data' on zero denominator (Never NaN / 0%)", () => {
    const zeroResult = calculateRate(0, 0);
    assert.equal(zeroResult.rate, null);
    assert.equal(zeroResult.percentage, null);
    assert.equal(zeroResult.formatted, "No data (0/0)");
    assert.equal(zeroResult.numerator, 0);
    assert.equal(zeroResult.denominator, 0);

    const zeroDenomWithNumerator = calculateRate(5, 0);
    assert.equal(zeroDenomWithNumerator.rate, null);
    assert.equal(zeroDenomWithNumerator.percentage, null);
    assert.equal(zeroDenomWithNumerator.formatted, "No data (5/0)");
  });

  it("2. calculateRate: Calculates exact rates and percentages with full disclosure formatting", () => {
    const normal = calculateRate(1, 4);
    assert.equal(normal.rate, 0.25);
    assert.equal(normal.percentage, 25.0);
    assert.equal(normal.formatted, "25.0% (1/4)");

    const recurring = calculateRate(1, 3);
    assert.ok(Math.abs((normal.rate ?? 0) - 0.25) < 0.001);
    assert.equal(recurring.percentage, 33.3);
    assert.equal(recurring.formatted, "33.3% (1/3)");
  });

  it("3. calculateAverageScore: Distinguishes unscored applications from 0 score", () => {
    const unscored = calculateAverageScore(0, 0, 5);
    assert.equal(unscored.average, null);
    assert.equal(unscored.scoredCount, 0);
    assert.equal(unscored.unscoredCount, 5);
    assert.equal(unscored.formatted, "No scored applications");

    const scored = calculateAverageScore(2, 175.0, 3);
    assert.equal(scored.average, 87.5);
    assert.equal(scored.scoredCount, 2);
    assert.equal(scored.unscoredCount, 1);
    assert.equal(scored.formatted, "87.5 / 100 (2 scored)");
  });

  it("4. AnalyticsService.getOverview: Formulates truthful rates and volume", async () => {
    const mockRepo: Partial<AnalyticsRepository> = {
      async getOverviewRaw() {
        return {
          totalApplications: 10,
          preparedCount: 2,
          appliedCount: 8,
          underReviewCount: 3,
          interviewScheduledCount: 2,
          interviewCompletedCount: 1,
          offerCount: 1,
          rejectedCount: 1,
          withdrawnCount: 0,
          milestoneResponses: 4, // 4 out of 8 applied
          milestoneInterviews: 2, // 2 out of 8 applied
          milestoneOffers: 1, // 1 out of 8 applied
          milestoneRejections: 1,
          scoredCount: 6,
          totalScoreSum: 480.0, // Avg 80.0
        };
      },
    };

    const service = new AnalyticsService(mockRepo as AnalyticsRepository);
    const overview = await service.getOverview("cand_test");

    assert.equal(overview.totalApplications, 10);
    assert.equal(overview.appliedCount, 8);
    assert.equal(overview.responseRate.percentage, 50.0);
    assert.equal(overview.responseRate.formatted, "50.0% (4/8)");
    assert.equal(overview.interviewRate.percentage, 25.0);
    assert.equal(overview.interviewRate.formatted, "25.0% (2/8)");
    assert.equal(overview.offerRate.percentage, 12.5);
    assert.equal(overview.offerRate.formatted, "12.5% (1/8)");
    assert.equal(overview.averageMatchScore.average, 80.0);
    assert.equal(overview.averageMatchScore.scoredCount, 6);
  });

  it("5. AnalyticsService.getFunnel: Computes stage percentages and terminal outcomes", async () => {
    const mockRepo: Partial<AnalyticsRepository> = {
      async getFunnelRaw() {
        return {
          totalApplications: 10,
          preparedCount: 2,
          appliedCount: 8,
          underReviewCount: 3,
          interviewScheduledCount: 2,
          interviewCompletedCount: 1,
          offerCount: 1,
          rejectedCount: 1,
          withdrawnCount: 1,
        };
      },
    };

    const service = new AnalyticsService(mockRepo as AnalyticsRepository);
    const funnel = await service.getFunnel("cand_test");

    assert.equal(funnel.totalApplications, 10);
    assert.equal(funnel.appliedCount, 8);
    assert.equal(funnel.stages.length, 6);

    const preparedStage = funnel.stages.find((s) => s.stage === "PREPARED");
    assert.ok(preparedStage);
    assert.equal(preparedStage.count, 2);
    assert.equal(preparedStage.percentageOfTotal, 20.0);

    const appliedStage = funnel.stages.find((s) => s.stage === "APPLIED");
    assert.ok(appliedStage);
    assert.equal(appliedStage.count, 8);
    assert.equal(appliedStage.percentageOfApplied, 100.0);

    assert.equal(funnel.terminalOutcomes.rejected.count, 1);
    assert.equal(funnel.terminalOutcomes.withdrawn.count, 1);
  });

  it("6. AnalyticsService.getScoreBandConversion: Preserves all 5 bands and uses non-causal phrasing", async () => {
    const mockRepo: Partial<AnalyticsRepository> = {
      async getScoreBandsRaw() {
        return [
          {
            band: "85-100",
            totalApplications: 5,
            appliedCount: 4,
            interviewCount: 2,
            offerCount: 1,
          },
        ];
      },
    };

    const service = new AnalyticsService(mockRepo as AnalyticsRepository);
    const bands = await service.getScoreBandConversion("cand_test");

    // All 5 standard bands exist
    assert.equal(bands.length, 5);
    const bandKeys = bands.map((b) => b.band);
    assert.deepEqual(bandKeys, SCORE_BANDS);

    const excellentBand = bands.find((b) => b.band === "85-100");
    assert.ok(excellentBand);
    assert.equal(excellentBand.totalApplications, 5);
    assert.equal(excellentBand.interviewCount, 2);
    assert.equal(excellentBand.interviewConversionRate.percentage, 50.0); // 2/4
    assert.equal(excellentBand.offerConversionRate.percentage, 25.0); // 1/4

    // Missing bands in raw output default safely to 0 with null rates
    const moderateBand = bands.find((b) => b.band === "60-74");
    assert.ok(moderateBand);
    assert.equal(moderateBand.totalApplications, 0);
    assert.equal(moderateBand.interviewConversionRate.rate, null);
    assert.equal(moderateBand.interviewConversionRate.formatted, "No data (0/0)");
  });

  it("7. Empty candidate state: Returns cleanly with zero counts and null rates", async () => {
    const mockEmptyRepo: Partial<AnalyticsRepository> = {
      async getOverviewRaw() {
        return {
          totalApplications: 0,
          preparedCount: 0,
          appliedCount: 0,
          underReviewCount: 0,
          interviewScheduledCount: 0,
          interviewCompletedCount: 0,
          offerCount: 0,
          rejectedCount: 0,
          withdrawnCount: 0,
          milestoneResponses: 0,
          milestoneInterviews: 0,
          milestoneOffers: 0,
          milestoneRejections: 0,
          scoredCount: 0,
          totalScoreSum: 0,
        };
      },
      async getFunnelRaw() {
        return {
          totalApplications: 0,
          preparedCount: 0,
          appliedCount: 0,
          underReviewCount: 0,
          interviewScheduledCount: 0,
          interviewCompletedCount: 0,
          offerCount: 0,
          rejectedCount: 0,
          withdrawnCount: 0,
        };
      },
      async getScoreBandsRaw() {
        return [];
      },
    };

    const service = new AnalyticsService(mockEmptyRepo as AnalyticsRepository);
    const overview = await service.getOverview("cand_empty");

    assert.equal(overview.totalApplications, 0);
    assert.equal(overview.appliedCount, 0);
    assert.equal(overview.responseRate.rate, null);
    assert.equal(overview.interviewRate.rate, null);
    assert.equal(overview.offerRate.rate, null);
    assert.equal(overview.averageMatchScore.average, null);

    const funnel = await service.getFunnel("cand_empty");
    assert.equal(funnel.totalApplications, 0);
    for (const stage of funnel.stages) {
      assert.equal(stage.count, 0);
      assert.equal(stage.percentageOfTotal, null);
    }
  });
});
