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

interface RemoteOkRawItem {
  id?: string | number;
  epoch?: string | number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number | string;
  salary_max?: number | string;
  url?: string;
  apply_url?: string;
  legal?: string;
}

/**
 * RemoteOK Public API Job Source Adapter.
 * Grounded in 01_build_the_system.md §4 Step 3 and 02_how_to_build.md §5 & §6.
 */
export class RemoteOkAdapter implements JobSourceContract {
  readonly id = "remoteok";
  readonly name = "RemoteOK";
  readonly type = "API" as const;
  readonly baseUrl: string;

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    baseUrl = "https://remoteok.com/api"
  ) {
    this.baseUrl = baseUrl;
  }

  async discover(options?: DiscoverOptions): Promise<DiscoveredRawJob[]> {
    let url = this.baseUrl;
    if (options?.tag) {
      url += `?tag=${encodeURIComponent(options.tag)}`;
    }

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
      throw new JobSourceNetworkError(`Failed to fetch from RemoteOK: ${msg}`, this.id);
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      throw new JobSourceRateLimitError("RemoteOK rate limit exceeded.", this.id, retryAfter);
    }

    if (!response.ok) {
      throw new JobSourceNetworkError(
        `RemoteOK returned HTTP ${response.status}: ${response.statusText}`,
        this.id,
        response.status
      );
    }

    let items: unknown;
    try {
      items = await response.json();
    } catch (err: unknown) {
      throw new JobSourceParseError("Failed to parse JSON response from RemoteOK.", this.id, err);
    }

    if (!Array.isArray(items)) {
      throw new JobSourceParseError("RemoteOK response is not a valid array.", this.id);
    }

    // RemoteOK puts a legal disclaimer in the first element: { legal: "..." }
    const rawJobs = items.filter(
      (item): item is RemoteOkRawItem =>
        Boolean(item) &&
        typeof item === "object" &&
        !("legal" in item) &&
        "id" in item
    );

    const results: DiscoveredRawJob[] = [];
    const limit = options?.limit ?? rawJobs.length;

    for (let i = 0; i < Math.min(rawJobs.length, limit); i++) {
      const job = rawJobs[i]!;
      results.push({
        source: this.id,
        sourceJobId: String(job.id),
        data: job,
        url: job.url,
        discoveredAt: new Date(),
      });
    }

    return results;
  }

  async normalize(raw: DiscoveredRawJob): Promise<CreateJobInput> {
    const item = raw.data as RemoteOkRawItem;
    if (!item || typeof item !== "object") {
      throw new JobSourceParseError("Invalid raw data for RemoteOK job.", this.id);
    }

    const title = (item.position || "").trim();
    if (!title) {
      throw new JobValidationError("Missing required job position/title in RemoteOK item.");
    }

    const company = (item.company || "").trim();
    if (!company) {
      throw new JobValidationError("Missing required company name in RemoteOK item.");
    }

    const appUrl = (item.apply_url || item.url || "").trim();
    if (!appUrl || (!appUrl.startsWith("http://") && !appUrl.startsWith("https://"))) {
      throw new JobValidationError("Missing or invalid application URL in RemoteOK item.");
    }

    // Parse salary values
    let salaryMin: number | null = null;
    if (typeof item.salary_min === "number" && item.salary_min > 0) {
      salaryMin = Math.round(item.salary_min);
    } else if (typeof item.salary_min === "string" && !isNaN(Number(item.salary_min))) {
      salaryMin = Math.round(Number(item.salary_min));
    }

    let salaryMax: number | null = null;
    if (typeof item.salary_max === "number" && item.salary_max > 0) {
      salaryMax = Math.round(item.salary_max);
    } else if (typeof item.salary_max === "string" && !isNaN(Number(item.salary_max))) {
      salaryMax = Math.round(Number(item.salary_max));
    }

    // Parse posted date
    let postedAt: Date | null = null;
    if (item.date) {
      const d = new Date(item.date);
      if (!isNaN(d.getTime())) postedAt = d;
    } else if (item.epoch) {
      const d = new Date(Number(item.epoch) * 1000);
      if (!isNaN(d.getTime())) postedAt = d;
    }

    // Tags -> Skills
    const skills = Array.isArray(item.tags)
      ? item.tags
          .map((t) => String(t).trim())
          .filter((t) => t.length > 0 && t.toLowerCase() !== "remote")
      : [];

    const remoteType = classifyRemotePolicy(item.location, true);

    const rawCanonical = (item.url || raw.url || "").trim();
    const canonicalUrl =
      rawCanonical && (rawCanonical.startsWith("http://") || rawCanonical.startsWith("https://"))
        ? rawCanonical
        : null;

    return {
      source: this.id,
      sourceJobId: String(item.id),
      canonicalUrl,
      title,
      company,
      location: item.location ? item.location.trim() : null,
      remoteType,
      allowedCountries: [],
      salary: salaryMin,
      salaryMin,
      salaryMax,
      currency: "USD",
      skills,
      requirements: [],
      description: cleanDescriptionText(item.description),
      applicationUrl: appUrl,
      status: "ACTIVE",
      postedAt,
    };
  }

  async getApplicationUrl(raw: DiscoveredRawJob): Promise<string> {
    const item = raw.data as RemoteOkRawItem;
    const url = item?.apply_url || item?.url;
    if (!url) {
      throw new JobValidationError("No application URL available on RemoteOK job item.");
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
