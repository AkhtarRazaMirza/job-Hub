/**
 * GitHub integration and analysis domain types.
 * Grounded in 02_how_to_build.md §3, 03_tech_stack.md §9, and 04_ai_agent_skills.md §3.
 */

export interface GitHubRepoMetadata {
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  openIssues: number;
  isFork: boolean;
  license: string | null;
  topics: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GitHubClient {
  fetchRepository(owner: string, repo: string): Promise<GitHubRepoMetadata>;
  fetchReadme(owner: string, repo: string): Promise<string | null>;
  fetchLanguages(owner: string, repo: string): Promise<Record<string, number>>;
  fetchUserRepositories?(username: string): Promise<GitHubRepoMetadata[]>;
}

export interface GitHubAnalysisResult {
  name: string;
  description: string | null;
  repositoryUrl: string;
  primaryLanguage: string | null;
  languages: string[];
  technologies: string[];
  architectureEvidence: string | null;
  qualityNotes: string | null;
  verificationStatus: "VERIFIED";
}

export class GitHubError extends Error {
  constructor(message: string, public readonly code: string = "GITHUB_ERROR") {
    super(message);
    this.name = "GitHubError";
  }
}

export class GitHubNotFoundError extends GitHubError {
  constructor(message: string = "GitHub repository not found.") {
    super(message, "NOT_FOUND");
    this.name = "GitHubNotFoundError";
  }
}

export class GitHubRateLimitError extends GitHubError {
  constructor(message: string = "GitHub API rate limit exceeded.") {
    super(message, "RATE_LIMITED");
    this.name = "GitHubRateLimitError";
  }
}
