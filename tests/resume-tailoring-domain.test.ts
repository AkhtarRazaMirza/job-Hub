/**
 * Job Hub — Phase 7 / Step 7.1
 * Resume Tailoring Domain, Schema, Truthfulness Engine, and AI Tailor Test Suite
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 & §5 Phase 7 ("AI application preparation")
 * - 02_how_to_build.md §11 ("Resume tailoring: Maintain a master resume. Never mutate it. For each job: Master Resume + Job Description -> AI selection/rewrite -> Tailored Resume JSON -> Validation -> Version saved")
 * - 04_ai_agent_skills.md §11 ("Resume Tailoring Skill") & §21 ("ResumeTailor") & §23 ("Non-negotiable AI engineering rules")
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  tailoredResumeDataSchema,
  tailorResumeClientInputSchema,
  validateResumeTruthfulness,
  extractMetricsFromText,
  ResumeTruthfulnessViolationError,
  type TailoredResumeData,
} from "@job-hub/applications";
import {
  ResumeTailor,
  tailoredResumeRepository,
} from "@job-hub/applications/server";
import { MockAiProvider } from "@job-hub/ai";
import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";
import {
  db,
  users,
  candidateProfiles,
  resumes,
  jobs,
  tailoredResumes,
} from "@job-hub/db";
import { eq } from "drizzle-orm";

test("Phase 7 / Step 7.1 — Resume Tailoring Domain Foundation & Truthfulness Suite", async (t) => {
  // ---------------------------------------------------------------------------
  // Canonical Test Fixtures
  // ---------------------------------------------------------------------------
  const mockCandidate: UnifiedCandidateProfile = {
    profile: {
      id: "cand_test_p7_1",
      userId: "usr_test_p7_1",
      headline: "Senior Full Stack TypeScript Engineer",
      portfolioUrl: "https://janedoe.dev",
      linkedinUrl: "https://linkedin.com/in/janedoe",
      sourceResumeId: "res_test_master_1",
      profiledAt: new Date("2026-08-01"),
      createdAt: new Date("2026-08-01"),
      updatedAt: new Date("2026-08-01"),
    },
    preferences: null,
    projects: [
      {
        id: "proj_1",
        candidateProfileId: "cand_test_p7_1",
        name: "CloudFlow",
        description: "Durable workflow engine in TypeScript and PostgreSQL",
        url: "https://cloudflow.dev",
        repositoryUrl: "https://github.com/janedoe/cloudflow",
        primaryLanguage: "TypeScript",
        languages: ["TypeScript", "SQL"],
        technologies: ["TypeScript", "PostgreSQL", "Node.js", "Docker"],
        source: "GITHUB",
        verificationStatus: "VERIFIED",
        confirmedByUser: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    skills: [
      { name: "TypeScript", status: "VERIFIED" },
      { name: "Node.js", status: "VERIFIED" },
      { name: "React", status: "VERIFIED" },
      { name: "PostgreSQL", status: "VERIFIED" },
      { name: "Docker", status: "VERIFIED" },
      { name: "GraphQL", status: "INFERRED" },
    ],
    experiences: [
      {
        company: "Stripe",
        role: "Senior Software Engineer",
        startDate: "2021-03",
        endDate: "2024-05",
        isCurrent: false,
        description: "Scaled payment ingestion APIs processing 15,000 rps with 99.99% availability.",
        technologies: ["TypeScript", "Node.js", "PostgreSQL"],
        status: "VERIFIED",
      },
      {
        company: "Vercel",
        role: "Full Stack Engineer",
        startDate: "2019-01",
        endDate: "2021-02",
        isCurrent: false,
        description: "Developed developer tooling and edge middleware for Next.js applications.",
        technologies: ["React", "TypeScript", "Next.js"],
        status: "VERIFIED",
      },
    ],
    education: [
      {
        institution: "University of Waterloo",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        graduationYear: 2018,
        status: "VERIFIED",
      },
    ],
    achievements: [],
    truthfulness: {
      verifiedCount: 8,
      inferredCount: 1,
      userProvidedCount: 2,
      userRequiredCount: 0,
      missingRequiredFields: [],
      profileCompletionPercentage: 100,
    },
  };

  const masterResumeText = `
Jane Doe
Email: jane.doe@example.com | Phone: +1-555-0199 | Location: Toronto, Canada
LinkedIn: https://linkedin.com/in/janedoe | GitHub: https://github.com/janedoe

SUMMARY
Senior Full Stack Engineer with 6+ years specializing in TypeScript, Node.js, and distributed PostgreSQL architectures.

EXPERIENCE
Stripe — Senior Software Engineer (2021-03 to 2024-05)
- Scaled payment ingestion APIs processing 15,000 rps with 99.99% availability.
- Led migration of billing microservices reducing p99 latency by 35%.

Vercel — Full Stack Engineer (2019-01 to 2021-02)
- Built developer productivity tooling and edge middleware for Next.js applications.
- Reduced build bundle sizes by 25% across frontend components.

PROJECTS
CloudFlow (https://github.com/janedoe/cloudflow)
- Durable background workflow engine written in TypeScript and PostgreSQL.

EDUCATION
University of Waterloo — Bachelor of Science in Computer Science (Graduated 2018)
SKILLS
TypeScript, Node.js, React, Next.js, PostgreSQL, Docker, GraphQL, Redis
  `.trim();

  const mockJob: Job = {
    id: "job_p7_target_1",
    source: "remoteok",
    sourceJobId: "target_1",
    jobSourceId: null,
    canonicalUrl: "https://remoteok.com/job/target-1",
    title: "Staff Backend Engineer",
    company: "Monolith Labs",
    location: "Worldwide Remote",
    remoteType: "WORLDWIDE_REMOTE",
    allowedCountries: [],
    salary: 180000,
    salaryMin: 170000,
    salaryMax: 190000,
    currency: "USD",
    experience: "SENIOR",
    skills: ["TypeScript", "Node.js", "PostgreSQL", "Docker"],
    requirements: ["5+ years experience in TypeScript", "Proven experience scaling backend systems"],
    description: "Seeking a Staff Backend Engineer to scale our distributed streaming pipelines using TypeScript and PostgreSQL.",
    applicationUrl: "https://monolithlabs.com/apply",
    status: "ACTIVE",
    postedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validTailoredResume: TailoredResumeData = {
    contact: {
      name: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+1-555-0199",
      location: "Toronto, Canada",
      linkedinUrl: "https://linkedin.com/in/janedoe",
      githubUrl: "https://github.com/janedoe",
    },
    targetTitle: "Staff Backend Engineer",
    summary: {
      headline: "Staff Backend Engineer specializing in resilient TypeScript and PostgreSQL distributed services",
      text: "Proven engineering leader with extensive experience scaling backend architectures and durable workflows at high throughput.",
      keyThemes: ["TypeScript Backend Architecture", "High Throughput Ingestion", "PostgreSQL Resilience"],
    },
    skills: [
      {
        category: "Backend & Systems",
        skills: ["TypeScript", "Node.js", "PostgreSQL", "Docker"],
      },
      {
        category: "Web & Tooling",
        skills: ["React", "Next.js", "GraphQL"],
      },
    ],
    experiences: [
      {
        company: "Stripe",
        role: "Senior Software Engineer",
        startDate: "2021-03",
        endDate: "2024-05",
        isCurrent: false,
        location: "Remote",
        bullets: [
          {
            text: "Architected and scaled payment ingestion APIs processing 15,000 rps with 99.99% availability.",
            sourceCompany: "Stripe",
            matchingSkills: ["TypeScript", "Node.js", "PostgreSQL"],
            confidence: "VERIFIED",
          },
          {
            text: "Led migration of billing services reducing p99 latency by 35% through query optimization.",
            sourceCompany: "Stripe",
            matchingSkills: ["PostgreSQL", "Node.js"],
            confidence: "VERIFIED",
          },
        ],
        technologies: ["TypeScript", "Node.js", "PostgreSQL"],
      },
      {
        company: "Vercel",
        role: "Full Stack Engineer",
        startDate: "2019-01",
        endDate: "2021-02",
        isCurrent: false,
        location: "Remote",
        bullets: [
          {
            text: "Engineered edge middleware and developer tooling, optimizing component bundle sizes by 25%.",
            sourceCompany: "Vercel",
            matchingSkills: ["TypeScript", "React", "Next.js"],
            confidence: "VERIFIED",
          },
        ],
        technologies: ["React", "TypeScript", "Next.js"],
      },
    ],
    projects: [
      {
        name: "CloudFlow",
        description: "Durable workflow engine in TypeScript and PostgreSQL.",
        technologies: ["TypeScript", "PostgreSQL", "Docker"],
        repositoryUrl: "https://github.com/janedoe/cloudflow",
        liveUrl: "https://cloudflow.dev",
        highlight: "Implements deterministic distributed execution over PostgreSQL.",
        sourceProjectId: "proj_1",
      },
    ],
    education: [
      {
        institution: "University of Waterloo",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        graduationYear: 2018,
      },
    ],
    strengths: [
      "High-throughput TypeScript service engineering",
      "Demonstrated experience with PostgreSQL optimization at Stripe",
    ],
  };

  // ---------------------------------------------------------------------------
  // 1. Schema & Validation Gate
  // ---------------------------------------------------------------------------

  await t.test("1. Schema Gate: Validates compliant TailoredResumeData entity", () => {
    const parsed = tailoredResumeDataSchema.parse(validTailoredResume);
    assert.equal(parsed.targetTitle, "Staff Backend Engineer");
    assert.equal(parsed.experiences.length, 2);
    assert.equal(parsed.projects.length, 1);
  });

  await t.test("2. Schema Gate: Rejects missing contact info and missing required fields", () => {
    assert.throws(() =>
      tailoredResumeDataSchema.parse({
        ...validTailoredResume,
        contact: {
          name: "Jane Doe",
          // missing email!
        },
      })
    );

    assert.throws(() =>
      tailoredResumeDataSchema.parse({
        ...validTailoredResume,
        targetTitle: "", // empty title rejected
      })
    );
  });

  await t.test("3. Schema Gate: Rejects injected unknown fields via .strict()", () => {
    assert.throws(() =>
      tailoredResumeDataSchema.parse({
        ...validTailoredResume,
        injectedAdminPrivilege: true,
      })
    );
  });

  await t.test("4. Security Gate: Client input schema strictly rejects client-injected userId & candidateProfileId", () => {
    assert.throws(() =>
      tailorResumeClientInputSchema.parse({
        jobId: "job_123",
        userId: "hacked_user_id",
      })
    );

    assert.throws(() =>
      tailorResumeClientInputSchema.parse({
        jobId: "job_123",
        candidateProfileId: "hacked_cand_id",
      })
    );

    const validClient = tailorResumeClientInputSchema.parse({
      jobId: "job_123",
      targetTitle: "Staff Engineer",
      userInstructions: "Focus on PostgreSQL internals",
    });
    assert.equal(validClient.jobId, "job_123");
  });

  // ---------------------------------------------------------------------------
  // 2. Truthfulness & Anti-Hallucination Gate
  // ---------------------------------------------------------------------------

  await t.test("5. Truthfulness Gate: Factually grounded resume passes with 100% score", () => {
    const result = validateResumeTruthfulness(validTailoredResume, mockCandidate, masterResumeText);
    assert.equal(result.isValid, true);
    assert.equal(result.truthfulnessScore, 100);
    assert.equal(result.violations.length, 0);
    assert.equal(result.auditTrail.verifiedCompanies.length, 2);
    assert.equal(result.auditTrail.auditedBulletsCount, 3);
  });

  await t.test("6. Truthfulness Gate: Detects and rejects hallucinated employer", () => {
    const hallucinatedResume: TailoredResumeData = {
      ...validTailoredResume,
      experiences: [
        ...validTailoredResume.experiences,
        {
          company: "Goldman Sachs", // Never worked here!
          role: "Principal Architect",
          startDate: "2017-01",
          endDate: "2018-12",
          isCurrent: false,
          bullets: [
            {
              text: "Architected high-frequency trading platform.",
              sourceCompany: "Goldman Sachs",
              matchingSkills: ["TypeScript"],
              confidence: "VERIFIED",
            },
          ],
          technologies: ["TypeScript"],
        },
      ],
    };

    const result = validateResumeTruthfulness(hallucinatedResume, mockCandidate, masterResumeText);
    assert.equal(result.isValid, false);
    assert.ok(result.truthfulnessScore < 100);
    const employerViolation = result.violations.find((v) => v.type === "HALLUCINATED_EMPLOYER");
    assert.ok(employerViolation);
    assert.match(employerViolation.message, /Goldman Sachs/);
  });

  await t.test("7. Truthfulness Gate: Detects and rejects fabricated employment dates", () => {
    const fabricatedDateResume: TailoredResumeData = {
      ...validTailoredResume,
      experiences: [
        {
          ...validTailoredResume.experiences[0]!,
          startDate: "2015-01", // Master start date is 2021-03!
        },
      ],
    };

    const result = validateResumeTruthfulness(fabricatedDateResume, mockCandidate, masterResumeText);
    assert.equal(result.isValid, false);
    const dateViolation = result.violations.find((v) => v.type === "FABRICATED_DATES");
    assert.ok(dateViolation);
    assert.match(dateViolation.message, /contradicts master evidence/);
  });

  await t.test("8. Truthfulness Gate: Detects and rejects fabricated project", () => {
    const fabricatedProjectResume: TailoredResumeData = {
      ...validTailoredResume,
      projects: [
        {
          name: "Autonomous Quantum Swarm", // Completely invented!
          description: "Distributed quantum algorithms in TypeScript",
          technologies: ["TypeScript"],
          highlight: "Solves NP-hard problems in milliseconds",
        },
      ],
    };

    const result = validateResumeTruthfulness(fabricatedProjectResume, mockCandidate, masterResumeText);
    assert.equal(result.isValid, false);
    const projViolation = result.violations.find((v) => v.type === "FABRICATED_PROJECT");
    assert.ok(projViolation);
    assert.match(projViolation.message, /Autonomous Quantum Swarm/);
  });

  await t.test("9. Truthfulness Gate: Detects and rejects fabricated quantitative metrics", () => {
    const fabricatedMetricResume: TailoredResumeData = {
      ...validTailoredResume,
      experiences: [
        {
          ...validTailoredResume.experiences[0]!,
          bullets: [
            {
              text: "Increased company ARR by $50M through payment optimizations.", // Invented $50M!
              sourceCompany: "Stripe",
              matchingSkills: ["TypeScript"],
              confidence: "VERIFIED",
            },
          ],
        },
      ],
    };

    const result = validateResumeTruthfulness(fabricatedMetricResume, mockCandidate, masterResumeText);
    assert.equal(result.isValid, false);
    const metricViolation = result.violations.find((v) => v.type === "FABRICATED_METRIC");
    assert.ok(metricViolation);
    assert.match(metricViolation.message, /\$50m/i);
  });

  await t.test("10. Truthfulness Gate: Metric extraction helper extracts percentages and currencies", () => {
    const metrics = extractMetricsFromText("Boosted throughput by 35% and saved $2.5M with 50 engineers.");
    assert.ok(metrics.includes("35%"));
    assert.ok(metrics.some((m) => m.includes("2.5m")));
    assert.ok(metrics.some((m) => m.includes("50 engineers")));
  });

  // ---------------------------------------------------------------------------
  // 3. AI Tailoring Service Gate
  // ---------------------------------------------------------------------------

  await t.test("11. AI Tailor Gate: Generates validated tailored resume with MockAiProvider", async () => {
    const mockAi = new MockAiProvider(validTailoredResume);
    const tailor = new ResumeTailor({ aiProvider: mockAi });

    const result = await tailor.tailor({
      candidate: mockCandidate,
      masterResumeText,
      sourceResumeId: "res_test_master_1",
      job: mockJob,
      targetTitle: "Staff Backend Engineer",
    });

    assert.equal(result.tailoredData.targetTitle, "Staff Backend Engineer");
    assert.equal(result.truthfulness.isValid, true);
    assert.equal(result.truthfulness.truthfulnessScore, 100);
    assert.equal(mockAi.calls.length, 1);
  });

  await t.test("12. AI Tailor Gate: Strict mode throws ResumeTruthfulnessViolationError on hallucination", async () => {
    const hallucinatedData: TailoredResumeData = {
      ...validTailoredResume,
      experiences: [
        {
          company: "Unknown Phantom Tech",
          role: "CTO",
          startDate: "2010-01",
          endDate: null,
          isCurrent: true,
          bullets: [{ text: "Led engineering.", sourceCompany: "Unknown Phantom Tech", matchingSkills: [], confidence: "INFERRED" }],
          technologies: [],
        },
      ],
    };

    const mockAi = new MockAiProvider(hallucinatedData);
    const tailor = new ResumeTailor({ aiProvider: mockAi, strictTruthfulness: true });

    await assert.rejects(
      () =>
        tailor.tailor({
          candidate: mockCandidate,
          masterResumeText,
          sourceResumeId: "res_test_master_1",
          job: mockJob,
        }),
      ResumeTruthfulnessViolationError
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Persistence & Master Resume Immutability Gate
  // ---------------------------------------------------------------------------

  const testUserId1 = `usr_p7_test_1_${Date.now()}`;
  const testUserId2 = `usr_p7_test_2_${Date.now()}`;
  let candidate1Id: string;
  let candidate2Id: string;
  let masterResumeId: string;
  let createdJobId: string;
  let originalMasterUpdatedAt: Date;

  await t.test("13. Persistence Setup: Insert users, candidate profiles, master resume, and job", async () => {
    await db.insert(users).values([
      {
        id: testUserId1,
        name: "Jane Doe Candidate",
        email: `${testUserId1}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUserId2,
        name: "Bob Candidate",
        email: `${testUserId2}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const [cand1] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId1,
        headline: "Staff Engineer Candidate",
      })
      .returning();
    candidate1Id = cand1.id;

    const [cand2] = await db
      .insert(candidateProfiles)
      .values({
        userId: testUserId2,
        headline: "Bob Engineer",
      })
      .returning();
    candidate2Id = cand2.id;

    // Insert Master Resume into resumes table
    const [mResume] = await db
      .insert(resumes)
      .values({
        candidateProfileId: candidate1Id,
        fileName: "Jane_Doe_Master_Resume.pdf",
        storageKey: `resumes/${candidate1Id}/master_${Date.now()}.pdf`,
        mimeType: "application/pdf",
        fileSize: 45000,
        fileHash: "hash_original_master_sha256_unaltered",
        status: "PROFILED",
        extractedText: masterResumeText,
        extractedAt: new Date(),
      })
      .returning();
    masterResumeId = mResume.id;
    originalMasterUpdatedAt = mResume.updatedAt;

    // Insert target job
    const [jobRecord] = await db
      .insert(jobs)
      .values({
        source: "remoteok",
        sourceJobId: `job_source_${Date.now()}`,
        title: "Staff Backend Engineer",
        company: "Monolith Labs",
        location: "Worldwide Remote",
        remoteType: "WORLDWIDE_REMOTE",
        applicationUrl: `https://monolithlabs.com/apply-${Date.now()}`,
        status: "ACTIVE",
        skills: ["TypeScript", "PostgreSQL"],
        requirements: ["5+ years"],
        description: "Staff Backend Engineer role.",
      })
      .returning();
    createdJobId = jobRecord.id;
  });

  await t.test("14. Persistence: Saves tailored resume v1 and monotonic v2 with full metadata", async () => {
    // Create Version 1
    const v1 = await tailoredResumeRepository.create({
      candidateProfileId: candidate1Id,
      jobId: createdJobId,
      sourceResumeId: masterResumeId,
      targetTitle: "Staff Backend Engineer",
      tailoredData: validTailoredResume,
      truthfulnessScore: 100.0,
      status: "DRAFT",
    });

    assert.equal(v1.version, 1);
    assert.equal(v1.candidateProfileId, candidate1Id);
    assert.equal(v1.jobId, createdJobId);
    assert.equal(v1.sourceResumeId, masterResumeId);
    assert.equal(v1.status, "DRAFT");
    assert.equal(v1.truthfulnessScore, 100);

    // Create Version 2 for same candidate + job
    const v2 = await tailoredResumeRepository.create({
      candidateProfileId: candidate1Id,
      jobId: createdJobId,
      sourceResumeId: masterResumeId,
      targetTitle: "Staff Backend Engineer - Revision 2",
      tailoredData: validTailoredResume,
      truthfulnessScore: 100.0,
      status: "GENERATED",
    });

    assert.equal(v2.version, 2);
    assert.equal(v2.status, "GENERATED");

    // findLatestByCandidateAndJob returns v2
    const latest = await tailoredResumeRepository.findLatestByCandidateAndJob(
      candidate1Id,
      createdJobId
    );
    assert.ok(latest);
    assert.equal(latest.version, 2);
    assert.equal(latest.status, "GENERATED");
  });

  await t.test("15. Security Isolation: Candidate 2 cannot read or manipulate Candidate 1's tailored resume", async () => {
    const latest = await tailoredResumeRepository.findLatestByCandidateAndJob(
      candidate1Id,
      createdJobId
    );
    assert.ok(latest);

    // Candidate 2 lookup receives null
    const crossLookup = await tailoredResumeRepository.findById(latest.id, candidate2Id);
    assert.equal(crossLookup, null);

    // Candidate 2 cannot update status
    await assert.rejects(
      () => tailoredResumeRepository.updateStatus(latest.id, candidate2Id, "APPROVED"),
      /Tailored resume not found/
    );

    // Candidate 2 cannot delete
    await assert.rejects(
      () => tailoredResumeRepository.delete(latest.id, candidate2Id),
      /Tailored resume not found/
    );
  });

  await t.test("16. IMMUTABILITY RULE GATE: Master resume is strictly unmodified", async () => {
    const [currMaster] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, masterResumeId));

    assert.ok(currMaster);
    // Verifies all master attributes remain identical
    assert.equal(currMaster.fileHash, "hash_original_master_sha256_unaltered");
    assert.equal(currMaster.fileName, "Jane_Doe_Master_Resume.pdf");
    assert.equal(currMaster.extractedText, masterResumeText);
    assert.equal(currMaster.status, "PROFILED");
    assert.equal(
      currMaster.updatedAt.getTime(),
      originalMasterUpdatedAt.getTime(),
      "Master resume updatedAt must NOT be altered"
    );
  });

  await t.test("17. Persistence: Candidate 1 can update status to APPROVED and delete record", async () => {
    const latest = await tailoredResumeRepository.findLatestByCandidateAndJob(
      candidate1Id,
      createdJobId
    );
    assert.ok(latest);

    const approved = await tailoredResumeRepository.updateStatus(
      latest.id,
      candidate1Id,
      "APPROVED"
    );
    assert.equal(approved.status, "APPROVED");

    const deleted = await tailoredResumeRepository.delete(latest.id, candidate1Id);
    assert.equal(deleted, true);
  });

  // ---------------------------------------------------------------------------
  // 5. Teardown
  // ---------------------------------------------------------------------------

  await t.test("Teardown: Clean up test fixtures and verify cascade deletion", async () => {
    // Delete test jobs and users (cascades to candidate_profiles, resumes, tailored_resumes)
    await db.delete(jobs).where(eq(jobs.id, createdJobId));
    await db.delete(users).where(eq(users.id, testUserId1));
    await db.delete(users).where(eq(users.id, testUserId2));

    const remainingTailored = await db
      .select()
      .from(tailoredResumes)
      .where(eq(tailoredResumes.jobId, createdJobId));
    assert.equal(remainingTailored.length, 0);
  });
});
