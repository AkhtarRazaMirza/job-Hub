/**
 * Job Hub — Phase 3 / Step 3.7
 * Job Deduplication Engine Deterministic Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  jobDeduplicationEngine,
  JobDeduplicationEngine,
  normalizeEntityString,
  jaccardSimilarity,
  stringSimilarity,
  type CreateJobInput,
  type JobRepository,
  type Job,
} from "@job-hub/jobs";
import { jobRepository } from "@job-hub/jobs/server";

function createMockCandidateJob(overrides: Partial<CreateJobInput> = {}): CreateJobInput {
  return {
    source: "remoteok",
    sourceJobId: "dedup_source_1",
    title: "Senior Fullstack Engineer",
    company: "Vercel Inc",
    location: "Worldwide",
    remoteType: "WORLDWIDE_REMOTE",
    allowedCountries: [],
    salaryMin: 160000,
    salaryMax: 200000,
    salary: 160000,
    currency: "USD",
    skills: ["TypeScript", "Next.js", "React"],
    requirements: ["5+ years Next.js"],
    description: "Build Next.js web application frameworks.",
    applicationUrl: "https://example.com/apply/vercel-fullstack",
    canonicalUrl: "https://example.com/jobs/vercel-fullstack",
    status: "ACTIVE",
    postedAt: new Date(),
    ...overrides,
  };
}

test("Step 3.7 — Job Deduplication Engine Test Suite", async (t) => {
  // 1. Text Normalization and Similarity Metrics
  await t.test("1. Text Normalizer & Similarity: handles abbreviations and computes deterministic token scores", () => {
    const raw = "Sr. Software Eng, Inc.";
    const norm = normalizeEntityString(raw);
    assert.equal(norm, "senior software engineer");

    const simExact = jaccardSimilarity("Senior React Developer", "Senior React Developer");
    assert.equal(simExact, 1.0);

    const simAbbrev = stringSimilarity("Sr. Fullstack Eng", "Senior Fullstack Engineer");
    assert.ok(simAbbrev >= 0.85, "Abbreviated variations should have high similarity");

    const simDistinct = jaccardSimilarity("Chief Financial Officer", "Frontend Engineer");
    assert.equal(simDistinct, 0.0);
  });

  // 2. Exact Match Tests with Mock Repository
  await t.test("2. Exact Source and URL Matches: detects duplicates with 1.0 confidence", async () => {
    const existingJob: Job = {
      id: "job_canonical_101",
      source: "remoteok",
      sourceJobId: "dedup_source_1",
      jobSourceId: null,
      canonicalUrl: "https://example.com/jobs/vercel-fullstack",
      title: "Senior Fullstack Engineer",
      company: "Vercel Inc",
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
      allowedCountries: [],
      salary: 160000,
      salaryMin: 160000,
      salaryMax: 200000,
      currency: "USD",
      skills: ["TypeScript"],
      requirements: [],
      description: "Build frameworks",
      applicationUrl: "https://example.com/apply/vercel-fullstack",
      status: "ACTIVE",
      postedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockRepo: JobRepository = {
      findById: async () => null,
      findBySourceAndSourceJobId: async (source, sourceJobId) =>
        source === "remoteok" && sourceJobId === "dedup_source_1" ? existingJob : null,
      findByCanonicalUrl: async (url) =>
        url === "https://example.com/jobs/vercel-fullstack" ? existingJob : null,
      findByApplicationUrl: async (url) =>
        url === "https://example.com/apply/vercel-fullstack" ? existingJob : null,
      findByCompany: async () => [existingJob],
      create: async () => existingJob,
      update: async () => existingJob,
      list: async () => [existingJob],
      delete: async () => true,
    };

    const engine = new JobDeduplicationEngine(mockRepo);

    // 2a. Match on source + sourceJobId
    const resSourceId = await engine.findDuplicate(
      createMockCandidateJob({ sourceJobId: "dedup_source_1" })
    );
    assert.equal(resSourceId.isDuplicate, true);
    assert.equal(resSourceId.match?.matchType, "EXACT_SOURCE_ID");
    assert.equal(resSourceId.match?.canonicalJobId, "job_canonical_101");
    assert.equal(resSourceId.match?.confidence, 1.0);

    // 2b. Match on canonicalUrl from different source
    const resUrl = await engine.findDuplicate(
      createMockCandidateJob({
        source: "arbeitnow",
        sourceJobId: "arbeit_99",
        canonicalUrl: "https://example.com/jobs/vercel-fullstack",
      })
    );
    assert.equal(resUrl.isDuplicate, true);
    assert.equal(resUrl.match?.matchType, "EXACT_CANONICAL_URL");
    assert.equal(resUrl.match?.canonicalJobId, "job_canonical_101");

    // 2c. Match on applicationUrl
    const resAppUrl = await engine.findDuplicate(
      createMockCandidateJob({
        source: "arbeitnow",
        sourceJobId: "arbeit_100",
        canonicalUrl: "https://distinct.example.com",
        applicationUrl: "https://example.com/apply/vercel-fullstack",
      })
    );
    assert.equal(resAppUrl.isDuplicate, true);
    assert.equal(resAppUrl.match?.matchType, "EXACT_APPLICATION_URL");
  });

  // 3. Normalized Compound Key & Fuzzy Title Matching
  await t.test("3. Compound Key & Fuzzy Matching: identifies normalized title and fuzzy variations for same company", async () => {
    const existingJob: Job = {
      id: "job_canonical_202",
      source: "arbeitnow",
      sourceJobId: "arb_202",
      jobSourceId: null,
      canonicalUrl: "https://example.com/jobs/stripe-swe",
      title: "Senior Software Engineer",
      company: "Stripe",
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
      allowedCountries: [],
      salary: null,
      salaryMin: null,
      salaryMax: null,
      currency: null,
      skills: ["Ruby", "Go"],
      requirements: [],
      description: "Core payments infrastructure",
      applicationUrl: "https://stripe.com/jobs/202",
      status: "ACTIVE",
      postedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockRepo: JobRepository = {
      findById: async () => null,
      findBySourceAndSourceJobId: async () => null,
      findByCanonicalUrl: async () => null,
      findByApplicationUrl: async () => null,
      findByCompany: async (company) => (company.toLowerCase().includes("stripe") ? [existingJob] : []),
      create: async () => existingJob,
      update: async () => existingJob,
      list: async () => [existingJob],
      delete: async () => true,
    };

    const engine = new JobDeduplicationEngine(mockRepo);

    // 3a. Same company with abbreviated title ("Sr. Software Eng" vs "Senior Software Engineer")
    const candidateCompound = createMockCandidateJob({
      source: "remoteok",
      sourceJobId: "new_rok_55",
      company: "Stripe",
      title: "Sr. Software Eng",
      canonicalUrl: "https://remoteok.com/job/55",
      applicationUrl: "https://remoteok.com/apply/55",
    });

    const resCompound = await engine.findDuplicate(candidateCompound);
    assert.equal(resCompound.isDuplicate, true);
    assert.equal(resCompound.match?.matchType, "NORMALIZED_COMPOUND_KEY");
    assert.equal(resCompound.match?.canonicalJobId, "job_canonical_202");
    assert.equal(resCompound.match?.confidence, 0.95);

    // 3b. Distinct job from same company does NOT match
    const distinctRole = createMockCandidateJob({
      source: "remoteok",
      sourceJobId: "new_rok_99",
      company: "Stripe",
      title: "Product Marketing Manager",
      canonicalUrl: "https://remoteok.com/job/99",
      applicationUrl: "https://remoteok.com/apply/99",
    });

    const resDistinct = await engine.findDuplicate(distinctRole);
    assert.equal(resDistinct.isDuplicate, false);
    assert.equal(resDistinct.match, null);
  });

  // 4. PostgreSQL Database Integration
  await t.test("4. PostgreSQL Integration: persists canonical job and detects duplicate via real Drizzle repository", async () => {
    const testSourceId = `test_dedup_${Date.now()}`;
    const testCanonicalUrl = `https://example.com/test-dedup-job-${Date.now()}`;
    const testCompany = `Test Dedup Co ${Date.now()}`;

    // 4a. Persist first canonical job
    const createdCanonical = await jobRepository.create({
      source: "remoteok",
      sourceJobId: testSourceId,
      canonicalUrl: testCanonicalUrl,
      title: "Staff Infrastructure Engineer",
      company: testCompany,
      location: "Worldwide",
      remoteType: "WORLDWIDE_REMOTE",
      skills: ["Kubernetes", "Go"],
      applicationUrl: `https://example.com/apply-${Date.now()}`,
      status: "ACTIVE",
    });

    assert.ok(createdCanonical.id);

    try {
      // 4b. Test deduplication engine against DB with same canonicalUrl
      const duplicateCandidate = createMockCandidateJob({
        source: "arbeitnow",
        sourceJobId: `other_${Date.now()}`,
        canonicalUrl: testCanonicalUrl,
        title: "Staff Infrastructure Engineer",
        company: testCompany,
      });

      const dedupResult = await jobDeduplicationEngine.findDuplicate(duplicateCandidate);
      assert.equal(dedupResult.isDuplicate, true);
      assert.equal(dedupResult.match?.canonicalJobId, createdCanonical.id);
      assert.equal(dedupResult.match?.matchType, "EXACT_CANONICAL_URL");

      // 4c. Test distinct job against DB
      const uniqueCandidate = createMockCandidateJob({
        source: "remoteok",
        sourceJobId: `unique_${Date.now()}`,
        canonicalUrl: `https://example.com/unique-${Date.now()}`,
        title: "Senior Security Specialist",
        company: `Unique Security Corp ${Date.now()}`,
      });

      const uniqueResult = await jobDeduplicationEngine.findDuplicate(uniqueCandidate);
      assert.equal(uniqueResult.isDuplicate, false);
      assert.equal(uniqueResult.match, null);
    } finally {
      // Clean up test job
      await jobRepository.delete(createdCanonical.id);
    }
  });
});
