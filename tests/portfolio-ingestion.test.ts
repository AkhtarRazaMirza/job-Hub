/**
 * Step 2.10 — Portfolio Website Ingestion & Crawling Foundation Test Suite
 *
 * Verifies:
 * 1. Unauthenticated requests to portfolio procedures are rejected with 401.
 * 2. Client-supplied ownership fields are strictly rejected via Zod z.never().
 * 3. SSRF security boundaries: Blocks localhost, 127.0.0.1, private IPs, cloud metadata, invalid protocols.
 * 4. Deterministic portfolio crawling with MockPortfolioCrawler & MockAiProvider.
 * 5. TRUTHFULNESS MANDATE: Portfolio claims are self-reported and saved as INFERRED / USER_PROVIDED, NEVER VERIFIED.
 * 6. User confirmation workflow: Analysis returns an in-memory draft, only confirmed projects are saved to PostgreSQL.
 * 7. Candidate profile updates portfolioUrl upon confirmation.
 * 8. Cross-user isolation: User 2 cannot access or confirm projects for User 1.
 * 9. Clean database teardown.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, user, candidateProfiles, projects, queryClient } from "@job-hub/db";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";
import {
  CandidatePortfolioService,
  PortfolioExtractionService,
  MockPortfolioCrawler,
  validatePortfolioUrl,
  PortfolioSecurityError,
  DrizzleProjectsRepository,
  DrizzleCandidateProfileRepository,
} from "@job-hub/candidate/server";
import { MockAiProvider } from "@job-hub/ai";
import {
  crawlPortfolioInputSchema,
  confirmPortfolioProjectsInputSchema,
} from "@job-hub/candidate";

const createCaller = createCallerFactory(appRouter);

const testUser1Id = "portfolio_test_user_1";
const testUser2Id = "portfolio_test_user_2";
let profile1Id = "";
let profile2Id = "";

function createMockCaller(userId: string, email: string) {
  return createCaller({
    session: {
      session: {
        id: `sess-${userId}`,
        userId,
        expiresAt: new Date(Date.now() + 86400000),
        token: `tok-${userId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: userId,
        email,
        name: "Test User",
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    user: {
      id: userId,
      email,
      name: "Test User",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

function createUnauthCaller() {
  return createCaller({
    session: null,
    user: null,
  });
}

test("Step 2.10 — Portfolio Website Ingestion & Crawling Foundation Test Suite", async (t) => {
  await t.test("Setup: Create test users and candidate profiles in PostgreSQL", async () => {
    // Clean up any stale records
    await db.delete(projects);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "portfolio_user_1@example.com"));
    await db.delete(user).where(eq(user.email, "portfolio_user_2@example.com"));

    // Insert users
    await db.insert(user).values([
      {
        id: testUser1Id,
        email: "portfolio_user_1@example.com",
        name: "Portfolio Candidate 1",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUser2Id,
        email: "portfolio_user_2@example.com",
        name: "Portfolio Candidate 2",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Insert candidate profiles
    const [p1] = await db
      .insert(candidateProfiles)
      .values({
        id: "profile-portfolio-1",
        userId: testUser1Id,
      })
      .returning();
    profile1Id = p1!.id;

    const [p2] = await db
      .insert(candidateProfiles)
      .values({
        id: "profile-portfolio-2",
        userId: testUser2Id,
      })
      .returning();
    profile2Id = p2!.id;
  });

  // 1. Unauthenticated requests are rejected (401)
  await t.test("1. Unauthenticated access to portfolio procedures is rejected (401)", async () => {
    const unauth = createUnauthCaller();

    await assert.rejects(
      async () => unauth.candidate.crawlPortfolio({ portfolioUrl: "https://example.com" }),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );

    await assert.rejects(
      async () =>
        unauth.candidate.confirmPortfolio({
          portfolioUrl: "https://example.com",
          projects: [
            {
              name: "Unauthorized Project",
              technologies: ["React"],
            },
          ],
        }),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );
  });

  // 2. Client-supplied ownership fields are strictly rejected
  await t.test("2. Client-supplied ownership fields are strictly rejected via Zod z.never()", () => {
    assert.throws(() => {
      crawlPortfolioInputSchema.parse({
        portfolioUrl: "https://example.com",
        userId: "hacker-user-id",
      });
    }, /userId cannot be client-supplied/);

    assert.throws(() => {
      confirmPortfolioProjectsInputSchema.parse({
        portfolioUrl: "https://example.com",
        projects: [{ name: "Valid Project" }],
        userId: "hacker-user-id",
      });
    }, /userId cannot be client-supplied/);

    assert.throws(() => {
      confirmPortfolioProjectsInputSchema.parse({
        portfolioUrl: "https://example.com",
        projects: [{ name: "Valid Project", candidateProfileId: "hacker-profile-id" }],
      });
    }, /candidateProfileId cannot be client-supplied/);
  });

  // 3. Strict SSRF and URL validation boundaries
  await t.test("3. Security: SSRF validator blocks private IPs, metadata, localhost, and non-http/https", () => {
    // Disallowed protocols
    assert.throws(() => validatePortfolioUrl("file:///etc/passwd"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("ftp://files.example.com"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("gopher://127.0.0.1"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("javascript:alert(1)"), PortfolioSecurityError);

    // Loopback & localhost
    assert.throws(() => validatePortfolioUrl("http://localhost"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("http://127.0.0.1"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("http://127.0.0.1:8080"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("http://0.0.0.0"), PortfolioSecurityError);

    // Cloud metadata endpoints
    assert.throws(() => validatePortfolioUrl("http://169.254.169.254/latest/meta-data/"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("http://metadata.google.internal"), PortfolioSecurityError);

    // Private IPv4 ranges
    assert.throws(() => validatePortfolioUrl("http://10.0.0.1"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("http://172.16.0.1"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("http://172.31.255.255"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("http://192.168.1.1"), PortfolioSecurityError);

    // Non-standard ports
    assert.throws(() => validatePortfolioUrl("https://example.com:22"), PortfolioSecurityError);
    assert.throws(() => validatePortfolioUrl("http://example.com:5432"), PortfolioSecurityError);

    // Valid public domains accepted
    const valid1 = validatePortfolioUrl("https://alexdev.io");
    assert.equal(valid1.hostname, "alexdev.io");

    const valid2 = validatePortfolioUrl("http://johndoe.github.io/portfolio");
    assert.equal(valid2.hostname, "johndoe.github.io");
  });

  // 4. Deterministic portfolio crawl & AI extraction
  let extractedDraft: any = null;
  await t.test("4. Portfolio Extraction Service extracts project draft with INFERRED status", async () => {
    const mockCrawler = new MockPortfolioCrawler([
      {
        url: "https://alex-portfolio.dev",
        title: "Alex Carter — Full Stack & Cloud Systems Engineer",
        description: "Portfolio of Alex Carter featuring distributed systems and cloud architecture.",
        extractedText: `Alex Carter
Full Stack & Cloud Systems Engineer

Projects:

1. Apex Real-time Analytics Platform
A high-scale telemetry ingestion engine handling 50k events/sec.
Role: Lead Architect
Technologies: Go, Apache Kafka, TimescaleDB, Docker
Case Study: Replaced a legacy polling architecture with Kafka streaming, reducing ingestion latency by 85%.
Live Demo: https://apex-demo.dev

2. CloudCanvas Workspace
Interactive visual canvas for cloud infrastructure modeling.
Role: Full-stack Developer
Technologies: TypeScript, React, Next.js, PostgreSQL
Case Study: Implemented real-time multi-user collaboration using WebSockets.
Website: https://cloudcanvas.dev`,
        links: ["https://apex-demo.dev", "https://cloudcanvas.dev"],
      },
    ]);

    const mockAi = new MockAiProvider(() => ({
      candidateHeadline: "Full Stack & Cloud Systems Engineer",
      candidateSummary: "Specializing in distributed systems and real-time telemetry.",
      detectedSkills: ["Go", "Kafka", "TypeScript", "React", "Docker", "PostgreSQL"],
      projects: [
        {
          name: "Apex Real-time Analytics Platform",
          description: "A high-scale telemetry ingestion engine handling 50k events/sec.",
          url: "https://apex-demo.dev",
          roleDescription: "Lead Architect",
          technologies: ["Go", "Kafka", "TimescaleDB", "Docker"],
          caseStudySummary: "Replaced a legacy polling architecture with Kafka streaming, reducing ingestion latency by 85%.",
        },
        {
          name: "CloudCanvas Workspace",
          description: "Interactive visual canvas for cloud infrastructure modeling.",
          url: "https://cloudcanvas.dev",
          roleDescription: "Full-stack Developer",
          technologies: ["TypeScript", "React", "Next.js", "PostgreSQL"],
          caseStudySummary: "Implemented real-time multi-user collaboration using WebSockets.",
        },
      ],
    }));

    const extractionService = new PortfolioExtractionService(mockCrawler, mockAi);
    const result = await extractionService.extractPortfolio("https://alex-portfolio.dev");

    assert.equal(result.portfolioUrl, "https://alex-portfolio.dev");
    assert.equal(result.candidateHeadline, "Full Stack & Cloud Systems Engineer");
    assert.equal(result.projects.length, 2);

    // TRUTHFULNESS INVARIANT: All portfolio claims must be INFERRED!
    for (const proj of result.projects) {
      assert.equal(
        proj.verificationStatus,
        "INFERRED",
        "Portfolio site claims must NEVER be falsely classified as VERIFIED"
      );
    }

    assert.equal(result.projects[0]?.name, "Apex Real-time Analytics Platform");
    assert.ok(result.projects[0]?.technologies.includes("Kafka"));
    assert.equal(result.projects[1]?.name, "CloudCanvas Workspace");

    extractedDraft = result;
  });

  // 5. User confirmation workflow saves projects to PostgreSQL with USER_PROVIDED status
  await t.test("5. User confirmation saves selected projects and updates portfolioUrl", async () => {
    const caller1 = createMockCaller(testUser1Id, "portfolio_user_1@example.com");

    const confirmed = await caller1.candidate.confirmPortfolio({
      portfolioUrl: extractedDraft.portfolioUrl,
      projects: extractedDraft.projects.map((p: any) => ({
        name: p.name,
        description: p.description,
        url: p.url,
        roleDescription: p.roleDescription,
        technologies: p.technologies,
        caseStudySummary: p.caseStudySummary,
      })),
    });

    assert.equal(confirmed.length, 2);
    assert.equal(confirmed[0]?.candidateProfileId, profile1Id);
    assert.equal(confirmed[0]?.source, "PORTFOLIO");
    // TRUTHFULNESS: Confirmed portfolio project must NOT be VERIFIED!
    assert.equal(confirmed[0]?.verificationStatus, "USER_PROVIDED");
    assert.equal(confirmed[0]?.confirmedByUser, true);
    assert.equal(confirmed[1]?.name, "CloudCanvas Workspace");

    // Verify candidate profile has portfolioUrl updated in PostgreSQL
    const [updatedProfile] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, profile1Id));

    assert.equal(updatedProfile?.portfolioUrl, "https://alex-portfolio.dev");

    // Verify projects exist in database
    const dbProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.candidateProfileId, profile1Id));

    assert.equal(dbProjects.length, 2);
    for (const dp of dbProjects) {
      assert.equal(dp.source, "PORTFOLIO");
      assert.notEqual(dp.verificationStatus, "VERIFIED", "Portfolio claim must not be VERIFIED");
    }
  });

  // 6. List projects returns confirmed portfolio projects
  await t.test("6. Candidate listProjects returns confirmed portfolio projects", async () => {
    const caller1 = createMockCaller(testUser1Id, "portfolio_user_1@example.com");

    const list = await caller1.candidate.listProjects();
    assert.equal(list.length, 2);
    assert.ok(list.some((p) => p.name === "Apex Real-time Analytics Platform"));
    assert.ok(list.some((p) => p.name === "CloudCanvas Workspace"));
  });

  // 7. Cross-user isolation: User 2 cannot access or modify User 1's portfolio data
  await t.test("7. Cross-user isolation: User 2 has separate profile and cannot see User 1's projects", async () => {
    const caller2 = createMockCaller(testUser2Id, "portfolio_user_2@example.com");

    const user2Projects = await caller2.candidate.listProjects();
    assert.equal(user2Projects.length, 0);

    const [user2Profile] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, profile2Id));

    assert.equal(user2Profile?.portfolioUrl, null, "User 2 portfolioUrl must remain unaffected");
  });

  // Teardown
  await t.test("Teardown: Clean up test database records and close pool", async () => {
    await db.delete(projects);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "portfolio_user_1@example.com"));
    await db.delete(user).where(eq(user.email, "portfolio_user_2@example.com"));
    await queryClient.end();
  });
});
