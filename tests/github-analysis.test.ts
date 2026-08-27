/**
 * Step 2.9 — GitHub Ingestion & Analysis Foundation Test Suite
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected with 401.
 * 2. Client cannot supply ownership fields (server-derived ownership via Better Auth).
 * 3. GitHub repository URL parsing and SSRF / injection prevention.
 * 4. Deterministic GitHub analysis with MockGitHubClient & MockAiProvider.
 * 5. Truthfulness invariant: Code repository proof produces VERIFIED status (04_ai_agent_skills.md §2).
 * 6. User confirmation workflow: Analysis returns a draft, user confirms before saving (02_how_to_build.md §3).
 * 7. Persistence to PostgreSQL in `projects` table (02_how_to_build.md §2).
 * 8. Cross-user isolation: User 2 cannot view or delete User 1's projects.
 * 9. Deletion of user-owned project.
 * 10. Clean database teardown.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, user, candidateProfiles, projects, queryClient } from "@job-hub/db";
import { appRouter } from "../apps/web/lib/trpc/routers/app";
import { createCallerFactory } from "../apps/web/lib/trpc/init";
import {
  CandidateProjectService,
  DrizzleProjectsRepository,
  DrizzleCandidateProfileRepository,
  GitHubAnalysisService,
  MockGitHubClient,
  type MockRepoFixture,
} from "@job-hub/candidate/server";
import { MockAiProvider } from "@job-hub/ai";
import {
  analyzeGitHubRepoInputSchema,
  confirmProjectInputSchema,
} from "@job-hub/candidate";

const createCaller = createCallerFactory(appRouter);

const testUser1Id = "github_test_user_1";
const testUser2Id = "github_test_user_2";
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

test("Step 2.9 — GitHub Ingestion & Analysis Foundation Test Suite", async (t) => {
  await t.test("Setup: Create test users and candidate profiles in PostgreSQL", async () => {
    // Clean up any stale records
    await db.delete(projects);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "github_user_1@example.com"));
    await db.delete(user).where(eq(user.email, "github_user_2@example.com"));

    // Insert users
    await db.insert(user).values([
      {
        id: testUser1Id,
        email: "github_user_1@example.com",
        name: "GitHub Candidate 1",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: testUser2Id,
        email: "github_user_2@example.com",
        name: "GitHub Candidate 2",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Insert candidate profiles
    const [p1] = await db
      .insert(candidateProfiles)
      .values({
        id: "profile-github-1",
        userId: testUser1Id,
      })
      .returning();
    profile1Id = p1!.id;

    const [p2] = await db
      .insert(candidateProfiles)
      .values({
        id: "profile-github-2",
        userId: testUser2Id,
      })
      .returning();
    profile2Id = p2!.id;
  });

  // 1. Unauthenticated requests are rejected (401)
  await t.test("1. Unauthenticated access to project procedures is rejected (401)", async () => {
    const unauth = createUnauthCaller();

    await assert.rejects(
      async () => unauth.candidate.analyzeGitHubRepo({ repositoryUrl: "owner/repo" }),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );

    await assert.rejects(
      async () =>
        unauth.candidate.confirmProject({
          name: "Test Project",
          primaryLanguage: "TypeScript",
          languages: ["TypeScript"],
          technologies: ["React", "PostgreSQL"],
        }),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );

    await assert.rejects(
      async () => unauth.candidate.listProjects(),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );

    await assert.rejects(
      async () => unauth.candidate.deleteProject({ id: "nonexistent" }),
      (err: any) => err.code === "UNAUTHORIZED" || /Unauthorized/i.test(err.message)
    );
  });

  // 2. Server-derived ownership rejects client-supplied ownership fields
  await t.test("2. Client-supplied ownership fields are strictly rejected", () => {
    assert.throws(() => {
      analyzeGitHubRepoInputSchema.parse({
        repositoryUrl: "owner/repo",
        userId: "hacker-user-id",
      });
    }, /userId cannot be client-supplied/);

    assert.throws(() => {
      confirmProjectInputSchema.parse({
        name: "Malicious Project",
        candidateProfileId: "hacker-profile-id",
      });
    }, /candidateProfileId cannot be client-supplied/);

    assert.throws(() => {
      confirmProjectInputSchema.parse({
        name: "Malicious Project",
        id: "injected-id",
      });
    }, /id cannot be client-supplied/);
  });

  // 3. GitHub repository URL identifier parsing
  await t.test("3. GitHub identifier parsing extracts owner/repo and blocks invalid input", () => {
    const p1 = GitHubAnalysisService.parseRepoIdentifier("https://github.com/torvalds/linux");
    assert.deepEqual(p1, { owner: "torvalds", repo: "linux" });

    const p2 = GitHubAnalysisService.parseRepoIdentifier("facebook/react");
    assert.deepEqual(p2, { owner: "facebook", repo: "react" });

    const p3 = GitHubAnalysisService.parseRepoIdentifier("git@github.com:vercel/next.js.git");
    assert.deepEqual(p3, { owner: "vercel", repo: "next.js" });

    // Invalid format
    assert.throws(() => {
      GitHubAnalysisService.parseRepoIdentifier("https://evil.com/owner/repo");
    }, /Invalid GitHub repository identifier/);

    assert.throws(() => {
      GitHubAnalysisService.parseRepoIdentifier("../../../etc/passwd");
    }, /Invalid GitHub repository identifier/);
  });

  // 4. Deterministic repository analysis with MockGitHubClient
  let analyzedDraft: any = null;
  await t.test("4. GitHub Analysis Service analyzes repo and returns VERIFIED draft", async () => {
    const fixture: MockRepoFixture = {
      metadata: {
        name: "high-throughput-queue",
        fullName: "testowner/high-throughput-queue",
        description: "A distributed, fault-tolerant message queue built in TypeScript and Go.",
        htmlUrl: "https://github.com/testowner/high-throughput-queue",
        defaultBranch: "main",
        stars: 120,
        forks: 15,
        openIssues: 2,
        isFork: false,
        license: "Apache-2.0",
        topics: ["distributed-systems", "message-queue", "raft"],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-06-01T00:00:00Z",
      },
      readme: `# High Throughput Queue
A production-grade distributed message queue implementing Raft consensus.
Includes end-to-end integration tests, Prometheus metrics, and Docker Compose clustering.`,
      languages: {
        TypeScript: 80000,
        Go: 20000,
      },
    };

    const mockGitHub = new MockGitHubClient([fixture]);
    const mockAi = new MockAiProvider(() => ({
      technologies: ["TypeScript", "Go", "Docker", "Prometheus", "Raft"],
      architectureEvidence: "Distributed clustering with Raft consensus and Docker orchestration.",
      qualityNotes: "High documentation quality with automated integration test suites and metrics.",
      summary: "A production-grade distributed message queue implementing Raft consensus.",
    }));

    const analysisService = new GitHubAnalysisService(mockGitHub, mockAi);
    const result = await analysisService.analyzeRepository({
      repositoryUrlOrId: "testowner/high-throughput-queue",
    });

    assert.equal(result.name, "high-throughput-queue");
    assert.equal(result.repositoryUrl, "https://github.com/testowner/high-throughput-queue");
    assert.equal(result.primaryLanguage, "TypeScript");
    assert.deepEqual(result.languages, ["TypeScript", "Go"]);
    assert.ok(result.technologies.includes("TypeScript"));
    assert.ok(result.technologies.includes("Go"));
    assert.ok(result.technologies.includes("Docker"));
    // Mandated truthfulness invariant: facts backed by code proof are VERIFIED
    assert.equal(result.verificationStatus, "VERIFIED");
    assert.ok(result.architectureEvidence?.includes("Raft"));

    analyzedDraft = result;
  });

  // 5. Candidate confirms and saves project
  let savedProjectId = "";
  await t.test("5. User confirmation workflow saves verified project in PostgreSQL", async () => {
    const caller1 = createMockCaller(testUser1Id, "github_user_1@example.com");

    const saved = await caller1.candidate.confirmProject({
      name: analyzedDraft.name,
      description: analyzedDraft.description,
      repositoryUrl: analyzedDraft.repositoryUrl,
      primaryLanguage: analyzedDraft.primaryLanguage,
      languages: analyzedDraft.languages,
      technologies: analyzedDraft.technologies,
      architectureEvidence: analyzedDraft.architectureEvidence,
      qualityNotes: analyzedDraft.qualityNotes,
    });

    assert.ok(saved.id, "Saved project must have a generated ID");
    assert.equal(saved.candidateProfileId, profile1Id);
    assert.equal(saved.name, "high-throughput-queue");
    assert.equal(saved.verificationStatus, "VERIFIED");
    assert.equal(saved.confirmedByUser, true);
    assert.equal(saved.source, "GITHUB");

    savedProjectId = saved.id;

    // Verify row in database
    const [dbRow] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, savedProjectId));

    assert.ok(dbRow);
    assert.equal(dbRow.name, "high-throughput-queue");
    assert.equal(dbRow.confirmedByUser, true);
    assert.equal(dbRow.verificationStatus, "VERIFIED");
  });

  // 6. List projects returns saved verified project
  await t.test("6. Authenticated candidate lists their verified projects", async () => {
    const caller1 = createMockCaller(testUser1Id, "github_user_1@example.com");

    const list = await caller1.candidate.listProjects();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, savedProjectId);
    assert.equal(list[0]?.name, "high-throughput-queue");
    assert.equal(list[0]?.verificationStatus, "VERIFIED");
  });

  // 7. Cross-user isolation: User 2 cannot see or delete User 1's project
  await t.test("7. Cross-user isolation: User 2 cannot view or delete User 1's projects", async () => {
    const caller2 = createMockCaller(testUser2Id, "github_user_2@example.com");

    // User 2 lists projects -> should be empty
    const user2Projects = await caller2.candidate.listProjects();
    assert.equal(user2Projects.length, 0);

    // User 2 tries to delete User 1's project -> 403 FORBIDDEN
    await assert.rejects(
      async () => caller2.candidate.deleteProject({ id: savedProjectId }),
      (err: any) => err.code === "FORBIDDEN" || /permission/i.test(err.message)
    );

    // Verify User 1's project still exists in DB
    const [stillExists] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, savedProjectId));
    assert.ok(stillExists, "Project must not be deleted by unauthorized user");
  });

  // 8. User 1 can delete their own project
  await t.test("8. Authenticated user can delete their own project", async () => {
    const caller1 = createMockCaller(testUser1Id, "github_user_1@example.com");

    const res = await caller1.candidate.deleteProject({ id: savedProjectId });
    assert.equal(res.success, true);

    const listAfter = await caller1.candidate.listProjects();
    assert.equal(listAfter.length, 0);
  });

  // Teardown
  await t.test("Teardown: Clean up test database records and close pool", async () => {
    await db.delete(projects);
    await db.delete(candidateProfiles);
    await db.delete(user).where(eq(user.email, "github_user_1@example.com"));
    await db.delete(user).where(eq(user.email, "github_user_2@example.com"));
    await queryClient.end();
  });
});
