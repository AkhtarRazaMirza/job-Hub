import type { GitHubClient, GitHubRepoMetadata } from "./types";
import { GitHubNotFoundError } from "./types";

export interface MockRepoFixture {
  metadata: GitHubRepoMetadata;
  readme?: string | null;
  languages?: Record<string, number>;
}

export class MockGitHubClient implements GitHubClient {
  private fixtures: Map<string, MockRepoFixture> = new Map();

  constructor(fixtures?: MockRepoFixture[]) {
    if (fixtures) {
      for (const f of fixtures) {
        this.addFixture(f);
      }
    }
  }

  addFixture(fixture: MockRepoFixture): void {
    const key = fixture.metadata.fullName.toLowerCase();
    this.fixtures.set(key, fixture);
  }

  async fetchRepository(owner: string, repo: string): Promise<GitHubRepoMetadata> {
    const key = `${owner}/${repo}`.toLowerCase();
    const fixture = this.fixtures.get(key);
    if (!fixture) {
      throw new GitHubNotFoundError(`Repository ${owner}/${repo} not found in mock.`);
    }
    return fixture.metadata;
  }

  async fetchReadme(owner: string, repo: string): Promise<string | null> {
    const key = `${owner}/${repo}`.toLowerCase();
    const fixture = this.fixtures.get(key);
    if (!fixture) {
      throw new GitHubNotFoundError(`Repository ${owner}/${repo} not found in mock.`);
    }
    return fixture.readme ?? null;
  }

  async fetchLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    const key = `${owner}/${repo}`.toLowerCase();
    const fixture = this.fixtures.get(key);
    if (!fixture) {
      throw new GitHubNotFoundError(`Repository ${owner}/${repo} not found in mock.`);
    }
    return fixture.languages ?? {};
  }
}
