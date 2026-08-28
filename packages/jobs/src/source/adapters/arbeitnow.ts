import type {
  JobSourceContract,
  DiscoveredRawJob,
  DiscoverOptions,
  VerifyStatusOptions,
} from "../types";
import type { CreateJobInput, JobStatus } from "../../types";
import {
  JobSourceNetworkError,
  JobSourceRateLimitError,
  JobSourceParseError,
} from "../errors";
import { JobValidationError } from "../../errors";
import { cleanDescriptionText, classifyRemotePolicy } from "../utils";

interface ArbeitnowRawItem {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number | string;
}

interface ArbeitnowApiResponse {
  data?: ArbeitnowRawItem[];
}

/**
 * Arbeitnow Public Job Board API Adapter.
 * Grounded in 01_build_the_system.md §4 Step 3 and 02_how_to_build.md §5 & §6.
 */
export class ArbeitnowAdapter implements JobSourceContract {
  readonly id = "arbeitnow";
  readonly name = "Arbeitnow";
  readonly type = "API" as const;
  readonly baseUrl: string;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    baseUrl = "https://www.arbeitnow.com/api/job-board-api"
  ) {
    this.baseUrl = baseUrl;
  }

  async discover(options?: DiscoverOptions): Promise<DiscoveredRawJob[]> {
    const url = this.baseUrl;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "JobHub-Bot/1.0 (+https://jobhub.dev)",
        },
        signal: options?.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new JobSourceNetworkError(`Failed to fetch from Arbeitnow: ${msg}`, this.id);
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      throw new JobSourceRateLimitError("Arbeitnow rate limit exceeded.", this.id, retryAfter);
    }

    if (!response.ok) {
      throw new JobSourceNetworkError(
        `Arbeitnow returned HTTP ${response.status}: ${response.statusText}`,
        this.id,
        response.status
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err: unknown) {
      throw new JobSourceParseError("Failed to parse JSON response from Arbeitnow.", this.id, err);
    }

    const typedPayload = payload as ArbeitnowApiResponse;
    if (!typedPayload || !Array.isArray(typedPayload.data)) {
      throw new JobSourceParseError("Arbeitnow response does not contain a valid data array.", this.id);
    }

    const rawJobs = typedPayload.data.filter(
      (item): item is ArbeitnowRawItem =>
        Boolean(item) &&
        typeof item === "object" &&
        Boolean(item.slug || item.url)
    );

    const results: DiscoveredRawJob[] = [];
    const limit = options?.limit ?? rawJobs.length;

    for (let i = 0; i < Math.min(rawJobs.length, limit); i++) {
      const job = rawJobs[i]!;
      results.push({
        source: this.id,
        sourceJobId: job.slug || String(i),
        data: job,
        url: job.url,
        discoveredAt: new Date(),
      });
    }

    return results;
  }

  async normalize(raw: DiscoveredRawJob): Promise<CreateJobInput> {
    const item = raw.data as ArbeitnowRawItem;
    if (!item || typeof item !== "object") {
      throw new JobSourceParseError("Invalid raw data for Arbeitnow job.", this.id);
    }

    const title = (item.title || "").trim();
    if (!title) {
      throw new JobValidationError("Missing required title in Arbeitnow job item.");
    }

    const company = (item.company_name || "").trim();
    if (!company) {
      throw new JobValidationError("Missing required company_name in Arbeitnow job item.");
    }

    const appUrl = (item.url || "").trim();
    if (!appUrl || (!appUrl.startsWith("http://") && !appUrl.startsWith("https://"))) {
      throw new JobValidationError("Missing or invalid application URL in Arbeitnow job item.");
    }

    // Parse creation timestamp
    let postedAt: Date | null = null;
    if (typeof item.created_at === "number") {
      postedAt = new Date(item.created_at * 1000);
    } else if (item.created_at) {
      const d = new Date(item.created_at);
      if (!isNaN(d.getTime())) postedAt = d;
    }

    // Tags -> Skills
    const skills = Array.isArray(item.tags)
      ? item.tags
          .map((t) => String(t).trim())
          .filter((t) => t.length > 0 && t.toLowerCase() !== "remote")
      : [];

    const isExplicitRemote = Boolean(item.remote);
    const remoteType = classifyRemotePolicy(item.location, isExplicitRemote);

    return {
      source: this.id,
      sourceJobId: item.slug || raw.sourceJobId,
      canonicalUrl: appUrl,
      title,
      company,
      location: item.location ? item.location.trim() : null,
      remoteType,
      allowedCountries: [],
      salary: null,
      salaryMin: null,
      salaryMax: null,
      currency: "EUR",
      skills,
      requirements: [],
      description: cleanDescriptionText(item.description),
      applicationUrl: appUrl,
      status: "ACTIVE",
      postedAt,
    };
  }

  async getApplicationUrl(raw: DiscoveredRawJob): Promise<string> {
    const item = raw.data as ArbeitnowRawItem;
    const url = item?.url;
    if (!url) {
      throw new JobValidationError("No application URL available on Arbeitnow job item.");
    }
    return url;
  }

  async verifyStatus(options: VerifyStatusOptions): Promise<JobStatus> {
    try {
      const res = await this.fetchFn(options.applicationUrl, {
        method: "HEAD",
        signal: options.signal,
        headers: {
          "User-Agent": "JobHub-Bot/1.0 (+https://jobhub.dev)",
        },
      });

      if (res.status >= 200 && res.status < 400) {
        return "ACTIVE";
      }

      if (res.status === 404 || res.status === 410) {
        return "CLOSED";
      }

      return "UNKNOWN";
    } catch {
      return "UNKNOWN";
    }
  }
}
