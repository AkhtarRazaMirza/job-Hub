/**
 * Job Hub — Phase 7 / Step 7.3
 * Custom Cover Letter Domain, Truthfulness Engine, and AI Writer Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Generate cover letter when useful")
 * - 02_how_to_build.md §12 ("Generate: cover letter")
 * - 04_ai_agent_skills.md §12 ("Cover Letter Skill") & §21 ("CoverLetterWriter")
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  coverLetterDataSchema,
  generateCoverLetterClientInputSchema,
  updateCoverLetterClientInputSchema,
  validateCoverLetterTruthfulness,
  CoverLetterTruthfulnessViolationError,
  type CoverLetterData,
} from "@job-hub/applications";
import {
  CoverLetterWriter,
  coverLetterRepository,
} from "@job-hub/applications/server";
import { MockAiProvider } from "@job-hub/ai";
import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";
import {
  db,
  users,
  candidateProfiles,
  jobs,
  coverLetters,
} from "@job-hub/db";
import { eq } from "drizzle-orm";

test("Phase 7 / Step 7.3 — Custom Cover Letter Domain, Truthfulness & Writer Suite", async (t) => {
  const candidateFixture: UnifiedCandidateProfile = {
    profile: {
      id: "cand_p73_fixture",
      userId: "usr_p73_fixture",
      headline: "Senior Distributed Systems Engineer",
      createdAt: new Date(),
      updatedAt: new Date(),
      phone: null,
      location: null,
      linkedinUrl: null,
      portfolioUrl: null,
      githubUrl: null,
    },
    preferences: null,
    skills: [
      { name: "TypeScript", status: "VERIFIED" },
      { name: "Node.js", status: "VERIFIED" },
      { name: "PostgreSQL", status: "VERIFIED" },
      { name: "Docker", status: "VERIFIED" },
    ],
    experiences: [
      {
        id: "exp_1",
        candidateProfileId: "cand_p73_fixture",
        company: "Stripe",
        role: "Senior Software Engineer",
        startDate: "2021-03",
        endDate: "2024-05",
        description: "Scaled payment ingestion APIs processing 15,000 rps with 99.99% availability.",
        technologies: ["TypeScript", "Node.js", "PostgreSQL"],
      },
    ],
    projects: [
      {
        id: "proj_1",
        candidateProfileId: "cand_p73_fixture",
        name: "CloudFlow",
        description: "Durable workflow engine in TypeScript and PostgreSQL.",
        technologies: ["TypeScript", "PostgreSQL"],
        repositoryUrl: null,
        liveUrl: null,
        isHighlighted: true,
        source: "GITHUB",
        confidence: "VERIFIED",
        extractedAt: new Date(),
      },
    ],
    education: [
      {
        id: "edu_1",
        candidateProfileId: "cand_p73_fixture",
        institution: "University of Waterloo",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        graduationYear: 2018,
      },
    ],
    achievements: [],
    truthfulness: {
      isConsistent: true,
      conflicts: [],
      missingRequiredFields: [],
      profileCompletionPercentage: 90,
    },
  };

  const jobFixture: Job = {
    id: "job_p73_fixture",
    source: "remoteok",
    sourceJobId: "rok_123",
    title: "Staff Backend Engineer",
    company: "Monolith Labs",
    location: "Remote",
    remoteType: "WORLDWIDE_REMOTE",
    skills: ["TypeScript", "PostgreSQL", "Node.js"],
    requirements: ["5+ years experience building distributed systems"],
    description: "Looking for a Staff Backend Engineer to design high-scale services.",
    applicationUrl: "https://monolithlabs.com/apply",
    status: "ACTIVE",
    scrapedAt: new Date(),
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };

  const validCoverLetter: CoverLetterData = {
    title: "Cover Letter for Staff Backend Engineer at Monolith Labs",
    salutation: "Dear Hiring Team at Monolith Labs,",
    hook: "I am writing to express my enthusiastic interest in the Staff Backend Engineer role at Monolith Labs.",
    bodyParagraphs: [
      "At Stripe, I led the scaling of critical payment ingestion APIs that sustained high throughput while optimizing PostgreSQL database performance.",
      "Additionally, through my open-source project CloudFlow, I engineered a durable distributed workflow engine leveraging TypeScript and PostgreSQL.",
    ],
    callToAction: "I would welcome the opportunity to discuss how my distributed systems experience can help Monolith Labs scale.",
    signoff: "Sincerely,\nJane Candidate",
    content: "Full assembled letter content matching the body paragraphs and value proposition.",
    highlightedSkills: ["TypeScript", "PostgreSQL"],
    highlightedProjects: ["CloudFlow"],
  };

  // ---------------------------------------------------------------------------
  // 1. Schema Validation Gates
  // ---------------------------------------------------------------------------

  await t.test("1. Schema Gate: Validates compliant CoverLetterData", () => {
    const parsed = coverLetterDataSchema.parse(validCoverLetter);
    assert.equal(parsed.title, validCoverLetter.title);
    assert.equal(parsed.highlightedSkills.length, 2);
  });

  await t.test("2. Schema Gate: Rejects missing required fields and short content", () => {
    const invalid = {
      ...validCoverLetter,
      hook: "Too short", // < 10 chars
    };
    assert.throws(() => coverLetterDataSchema.parse(invalid));
  });

  await t.test("3. Security Gate: Client input schema rejects client-injected userId & candidateProfileId", () => {
    const spoofed = {
      jobId: "job_123",
      userId: "spoofed_usr_id",
    };
    assert.throws(
      () => generateCoverLetterClientInputSchema.parse(spoofed),
      /userId cannot be client-supplied/
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Truthfulness & Anti-Hallucination Gates
  // ---------------------------------------------------------------------------

  await t.test("4. Truthfulness Gate: Evidence-grounded cover letter passes", () => {
    const result = validateCoverLetterTruthfulness(validCoverLetter, candidateFixture);
    assert.equal(result.isValid, true);
    assert.equal(result.violations.length, 0);
  });

  await t.test("5. Truthfulness Gate: Rejects ungrounded skill claims", () => {
    const ungroundedSkill: CoverLetterData = {
      ...validCoverLetter,
      highlightedSkills: ["Kubernetes", "Rust"], // Not in candidate profile
    };
    const result = validateCoverLetterTruthfulness(ungroundedSkill, candidateFixture);
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some((v) => v.type === "UNGROUNDED_SKILL"));
  });

  await t.test("6. Truthfulness Gate: Rejects fabricated project claims", () => {
    const fabricatedProj: CoverLetterData = {
      ...validCoverLetter,
      highlightedProjects: ["CryptoBotX"], // Fabricated
    };
    const result = validateCoverLetterTruthfulness(fabricatedProj, candidateFixture);
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some((v) => v.type === "FABRICATED_PROJECT"));
  });

  await t.test("7. Truthfulness Gate: Rejects fabricated quantitative metrics", () => {
    const fabricatedMetric: CoverLetterData = {
      ...validCoverLetter,
      content: "I single-handedly generated $50M in ARR by revamping our architecture.",
    };
    const result = validateCoverLetterTruthfulness(fabricatedMetric, candidateFixture);
    assert.equal(result.isValid, false);
    assert.ok(result.violations.some((v) => v.type === "FABRICATED_METRIC"));
  });

  // ---------------------------------------------------------------------------
  // 3. AI CoverLetterWriter Service Gate
  // ---------------------------------------------------------------------------

  await t.test("8. AI Writer Gate: Generates structured cover letter with MockAiProvider", async () => {
    const mockAi = new MockAiProvider(validCoverLetter);

    const writer = new CoverLetterWriter({ aiProvider: mockAi, strictTruthfulness: true });
    const result = await writer.generateCoverLetter({
      candidate: candidateFixture,
      job: jobFixture,
    });

    assert.equal(result.truthfulness.isValid, true);
    assert.equal(result.data.title, validCoverLetter.title);
  });

  await t.test("9. AI Writer Gate: Strict mode throws CoverLetterTruthfulnessViolationError on hallucination", async () => {
    const hallucinated: CoverLetterData = {
      ...validCoverLetter,
      highlightedSkills: ["Cobol", "Fortran"],
    };
    const mockAi = new MockAiProvider(hallucinated);

    const writer = new CoverLetterWriter({ aiProvider: mockAi, strictTruthfulness: true });
    await assert.rejects(
      () =>
        writer.generateCoverLetter({
          candidate: candidateFixture,
          job: jobFixture,
        }),
      CoverLetterTruthfulnessViolationError
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Persistence, Monotonic Versioning & Candidate Isolation
  // ---------------------------------------------------------------------------

  const testUserId1 = `usr_p73_test_1_${Date.now()}`;
  const testUserId2 = `usr_p73_test_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let dbJobId: string;
  let coverLetterId: string;

  await t.test("Setup: Create database test fixtures", async () => {
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Jane Candidate 7.3",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Bob Candidate 7.3",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [c1] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId1, headline: "Staff Candidate 7.3" })
      .returning();
    candidate1Id = c1.id;

    const [c2] = await db
      .insert(candidateProfiles)
      .values({ userId: testUserId2, headline: "Bob Candidate 7.3" })
      .returning();
    candidate2Id = c2.id;

    const [jb] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `job_source_${Date.now()}`,
        title: "Staff Backend Engineer",
        company: "Monolith Labs",
        location: "Remote",
        remoteType: "WORLDWIDE_REMOTE",
        applicationUrl: `https://monolithlabs.com/apply-${Date.now()}`,
        status: "ACTIVE",
        skills: ["TypeScript", "PostgreSQL"],
        requirements: ["5+ years"],
        description: "Staff role.",
      })
      .returning();
    dbJobId = jb.id;
  });

  await t.test("10. Persistence: Saves cover letter v1 and monotonic v2 with metadata", async () => {
    // Save v1
    const v1 = await coverLetterRepository.create({
      candidateProfileId: candidate1Id,
      jobId: dbJobId,
      data: validCoverLetter,
      status: "DRAFT",
    });

    assert.equal(v1.version, 1);
    assert.equal(v1.status, "DRAFT");
    assert.equal(v1.candidateProfileId, candidate1Id);
    coverLetterId = v1.id;

    // Save v2
    const v2 = await coverLetterRepository.create({
      candidateProfileId: candidate1Id,
      jobId: dbJobId,
      data: {
        ...validCoverLetter,
        title: "Revised Cover Letter for Staff Backend Engineer",
      },
      status: "APPROVED",
    });

    assert.equal(v2.version, 2);
    assert.equal(v2.status, "APPROVED");

    // Fetch latest
    const latest = await coverLetterRepository.findLatestByCandidateAndJob(
      candidate1Id,
      dbJobId
    );
    assert.ok(latest);
    assert.equal(latest.version, 2);
  });

  await t.test("11. Persistence: Candidate can update cover letter content (editable user requirement)", async () => {
    const updatedContent = "User edited content with refined opening paragraph.";
    const updated = await coverLetterRepository.update({
      id: coverLetterId,
      candidateProfileId: candidate1Id,
      content: updatedContent,
      status: "APPROVED",
    });

    assert.equal(updated.content, updatedContent);
    assert.equal(updated.status, "APPROVED");
  });

  await t.test("12. Security Gate: Candidate 2 cannot read or update Candidate 1's cover letter", async () => {
    const cand2Read = await coverLetterRepository.findById(
      coverLetterId,
      candidate2Id
    );
    assert.equal(cand2Read, null, "Cross-candidate read must return null");

    await assert.rejects(
      () =>
        coverLetterRepository.update({
          id: coverLetterId,
          candidateProfileId: candidate2Id,
          content: "Malicious modification",
        }),
      /Cover letter not found/
    );
  });

  // ---------------------------------------------------------------------------
  // 5. Teardown
  // ---------------------------------------------------------------------------

  await t.test("Teardown: Clean up test fixtures and verify cascade deletion", async () => {
    await db.delete(jobs).where(eq(jobs.id, dbJobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));

    const remaining = await db
      .select()
      .from(coverLetters)
      .where(eq(coverLetters.jobId, dbJobId));
    assert.equal(remaining.length, 0);
  });
});
