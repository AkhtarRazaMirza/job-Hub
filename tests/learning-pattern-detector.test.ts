/**
 * Job Hub — Phase 10 / Step 10.3
 * Deterministic Pattern Detection Test Suite
 *
 * Verifies:
 * 1. Confidence classification thresholds (HIGH, MEDIUM, LOW_CONFIDENCE).
 * 2. Positive pattern detection across roles, sources, score bands, resume versions, skills.
 * 3. Non-causal phrasing invariant (no causal claims).
 * 4. Insufficient data handling (total applications < 3 does not manufacture patterns).
 * 5. Negative case handling (identical conversion rates yield 0 false patterns).
 * 6. Deterministic ordering and attached evidence correctness.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  PatternDetector,
  classifyConfidence,
  MIN_HIGH_CONFIDENCE_SAMPLE,
  MIN_MEDIUM_CONFIDENCE_SAMPLE,
} from "../packages/applications/src/learning/pattern-detector";
import { buildEvidenceMetric, type OutcomeCohortAnalysis } from "../packages/applications/src/learning/analyzer";

test("Phase 10 / Step 10.3 — Deterministic Pattern Detection Suite", async (t) => {
  const detector = new PatternDetector();

  await t.test("1. classifyConfidence: Evaluates sample thresholds accurately", () => {
    assert.equal(classifyConfidence(15), "HIGH");
    assert.equal(classifyConfidence(MIN_HIGH_CONFIDENCE_SAMPLE), "HIGH");
    assert.equal(classifyConfidence(6), "MEDIUM");
    assert.equal(classifyConfidence(MIN_MEDIUM_CONFIDENCE_SAMPLE), "MEDIUM");
    assert.equal(classifyConfidence(3), "LOW_CONFIDENCE");
    assert.equal(classifyConfidence(1), "LOW_CONFIDENCE");

    // Pairwise comparison uses smaller of the two samples
    assert.equal(classifyConfidence(20, 12), "HIGH");
    assert.equal(classifyConfidence(20, 5), "MEDIUM");
    assert.equal(classifyConfidence(20, 2), "LOW_CONFIDENCE");
  });

  await t.test("2. Positive Case: Detects role pattern with like-for-like comparison", () => {
    // Canonical Example from 02_how_to_build.md §16:
    // AI Full-Stack: 20 apps, 6 interviews (30%)
    // Frontend-only: 20 apps, 1 interview (5%)
    const cohorts: OutcomeCohortAnalysis = {
      candidateProfileId: "cand_1",
      totalApplications: 40,
      baseline: buildEvidenceMetric({
        applications: 40,
        interviews: 7,
        offers: 1,
        rejections: 25,
      }),
      roles: [
        {
          role: "AI Full-Stack Engineer",
          metric: buildEvidenceMetric({
            applications: 20,
            interviews: 6,
            offers: 1,
            rejections: 10,
          }),
        },
        {
          role: "Frontend Developer",
          metric: buildEvidenceMetric({
            applications: 20,
            interviews: 1,
            offers: 0,
            rejections: 15,
          }),
        },
      ],
      sources: [],
      scoreBands: [],
      resumeVersions: [],
      skills: [],
    };

    const patterns = detector.detectPatterns(cohorts);
    assert.equal(patterns.length, 1);

    const rolePattern = patterns[0];
    assert.equal(rolePattern.type, "ROLE_FOCUS");
    assert.equal(rolePattern.confidence, "HIGH");
    assert.equal(rolePattern.evidence.primaryValue, "AI Full-Stack Engineer");
    assert.equal(rolePattern.evidence.comparisonValue, "Frontend Developer");
    assert.equal(rolePattern.evidence.primaryMetric.interviewRate, 0.3);
    assert.equal(rolePattern.evidence.comparisonMetric?.interviewRate, 0.05);

    // Non-causal language verification
    assert.match(rolePattern.summary, /observing higher interview rates/);
    assert.doesNotMatch(rolePattern.explanation, /causes/i);
    assert.doesNotMatch(rolePattern.explanation, /guarantees/i);
  });

  await t.test("3. Positive Case: Detects source pattern with lift over comparison source", () => {
    const cohorts: OutcomeCohortAnalysis = {
      candidateProfileId: "cand_1",
      totalApplications: 30,
      baseline: buildEvidenceMetric({
        applications: 30,
        interviews: 6,
        offers: 1,
      }),
      roles: [],
      sources: [
        {
          source: "remoteok",
          metric: buildEvidenceMetric({
            applications: 15,
            interviews: 5,
            offers: 1,
          }),
        },
        {
          source: "himalayas",
          metric: buildEvidenceMetric({
            applications: 15,
            interviews: 1,
            offers: 0,
          }),
        },
      ],
      scoreBands: [],
      resumeVersions: [],
      skills: [],
    };

    const patterns = detector.detectPatterns(cohorts);
    assert.equal(patterns.length, 1);

    const sourcePattern = patterns[0];
    assert.equal(sourcePattern.type, "SOURCE_FOCUS");
    assert.equal(sourcePattern.confidence, "HIGH");
    assert.equal(sourcePattern.evidence.primaryValue, "remoteok");
    assert.equal(sourcePattern.evidence.comparisonValue, "himalayas");
  });

  await t.test("4. Positive Case: Detects match score band pattern (85-100 band)", () => {
    const cohorts: OutcomeCohortAnalysis = {
      candidateProfileId: "cand_1",
      totalApplications: 25,
      baseline: buildEvidenceMetric({
        applications: 25,
        interviews: 4,
        offers: 0,
      }), // 16.0% baseline
      roles: [],
      sources: [],
      scoreBands: [
        {
          band: "85-100",
          metric: buildEvidenceMetric({
            applications: 10,
            interviews: 4,
            offers: 0,
          }), // 40.0% interview rate (lift +24%)
        },
        {
          band: "70-84",
          metric: buildEvidenceMetric({
            applications: 10,
            interviews: 0,
            offers: 0,
          }),
        },
        {
          band: "UNDER_60",
          metric: buildEvidenceMetric({
            applications: 5,
            interviews: 0,
            offers: 0,
          }),
        },
      ],
      resumeVersions: [],
      skills: [],
    };

    const patterns = detector.detectPatterns(cohorts);
    assert.ok(patterns.length >= 1);

    const bandPattern = patterns.find((p) => p.type === "MATCH_SCORE_BAND");
    assert.ok(bandPattern);
    assert.equal(bandPattern.confidence, "HIGH");
    assert.equal(bandPattern.evidence.primaryValue, "85-100");
  });

  await t.test("5. Insufficient Data: Total applications < 3 does NOT manufacture patterns", () => {
    const tinyCohorts: OutcomeCohortAnalysis = {
      candidateProfileId: "cand_tiny",
      totalApplications: 2,
      baseline: buildEvidenceMetric({
        applications: 2,
        interviews: 1,
        offers: 0,
      }),
      roles: [
        {
          role: "Lead Architect",
          metric: buildEvidenceMetric({
            applications: 2,
            interviews: 1,
            offers: 0,
          }),
        },
      ],
      sources: [],
      scoreBands: [],
      resumeVersions: [],
      skills: [],
    };

    const patterns = detector.detectPatterns(tinyCohorts);
    assert.equal(patterns.length, 0, "Must not manufacture patterns for < 3 total applications");
  });

  await t.test("6. Negative Case: Flat conversion rates produce zero false patterns", () => {
    const flatCohorts: OutcomeCohortAnalysis = {
      candidateProfileId: "cand_flat",
      totalApplications: 20,
      baseline: buildEvidenceMetric({
        applications: 20,
        interviews: 2,
        offers: 0,
      }), // 10.0% baseline
      roles: [
        {
          role: "Backend Engineer",
          metric: buildEvidenceMetric({
            applications: 10,
            interviews: 1,
            offers: 0,
          }), // 10.0%
        },
        {
          role: "Systems Engineer",
          metric: buildEvidenceMetric({
            applications: 10,
            interviews: 1,
            offers: 0,
          }), // 10.0%
        },
      ],
      sources: [],
      scoreBands: [],
      resumeVersions: [],
      skills: [],
    };

    const patterns = detector.detectPatterns(flatCohorts);
    assert.equal(patterns.length, 0, "Zero lift over baseline/peers must produce 0 false patterns");
  });
});
