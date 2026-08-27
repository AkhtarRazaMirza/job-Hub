import type { GitHubClient, GitHubRepoMetadata } from "./types";
import { GitHubError, GitHubNotFoundError, GitHubRateLimitError } from "./types";

const GITHUB_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export class HttpGitHubClient implements GitHubClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(options?: { baseUrl?: string; token?: string; timeoutMs?: number }) {
    this.baseUrl = options?.baseUrl || "https://api.github.com";
    this.token = options?.token || process.env.GITHUB_TOKEN;
    this.timeoutMs = options?.timeoutMs || 10_000;
  }

  private validateIdentifier(val: string, fieldName: string) {
    if (!val || !GITHUB_NAME_REGEX.test(val)) {
      throw new GitHubError(`Invalid GitHub ${fieldName}: "${val}"`, "INVALID_INPUT");
    }
  }

  private async request<T>(path: string, customHeaders?: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "JobHub-Candidate-Ingestion",
      ...customHeaders,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (res.status === 404) {
        throw new GitHubNotFoundError(`GitHub resource at ${path} not found.`);
      }

      if (res.status === 403 || res.status === 429) {
        throw new GitHubRateLimitError();
      }

      if (!res.ok) {
        throw new GitHubError(`GitHub API responded with HTTP ${res.status}`, `HTTP_${res.status}`);
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof GitHubError) {
        throw err;
      }
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") {
        throw new GitHubError("GitHub API request timed out.", "TIMEOUT");
      }
      throw new GitHubError(
        err instanceof Error ? err.message : "Failed to communicate with GitHub API.",
        "NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async fetchRepository(owner: string, repo: string): Promise<GitHubRepoMetadata> {
    this.validateIdentifier(owner, "owner");
    this.validateIdentifier(repo, "repo");

    const data = await this.request<{
      name: string;
      full_name: string;
      description: string | null;
      html_url: string;
      default_branch: string;
      stargazers_count: number;
      forks_count: number;
      open_issues_count: number;
      fork: boolean;
      license: { name: string } | null;
      topics?: string[];
      created_at: string;
      updated_at: string;
    }>(`/repos/${owner}/${repo}`);

    return {
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      htmlUrl: data.html_url,
      defaultBranch: data.default_branch || "main",
      stars: data.stargazers_count || 0,
      forks: data.forks_count || 0,
      openIssues: data.open_issues_count || 0,
      isFork: Boolean(data.fork),
      license: data.license?.name || null,
      topics: data.topics || [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async fetchReadme(owner: string, repo: string): Promise<string | null> {
    this.validateIdentifier(owner, "owner");
    this.validateIdentifier(repo, "repo");

    try {
      const data = await this.request<{ content?: string; encoding?: string }>(
        `/repos/${owner}/${repo}/readme`
      );

      if (data && data.content && data.encoding === "base64") {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return null;
    } catch (err: unknown) {
      if (err instanceof GitHubNotFoundError) {
        return null;
      }
      throw err;
    }
  }

  async fetchLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    this.validateIdentifier(owner, "owner");
    this.validateIdentifier(repo, "repo");

    return await this.request<Record<string, number>>(`/repos/${owner}/${repo}/languages`);
  }
}
