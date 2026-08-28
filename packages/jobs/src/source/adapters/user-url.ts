/**
 * User-Provided Job URL Source Adapter
 * Grounded in:
 * - 01_build_the_system.md §4 Step 3: "- user-provided job URLs"
 * - 02_how_to_build.md §5: "JobSource: USER_URL"
 */

import type { JobSourceContract, DiscoveredRawJob } from "../types";
import type { CreateJobInput, JobStatus } from "../../types";
import { cleanDescriptionText, classifyRemotePolicy } from "../utils";
import { JobValidationError } from "../../errors";

export interface UserJobUrlData {
  url: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  skills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
}

export class UserUrlAdapter implements JobSourceContract {
  readonly id = "user_url";
  readonly name = "User-Provided Job URL";
  readonly type = "USER_URL" as const;

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async discover(): Promise<DiscoveredRawJob[]> {
    // User URLs are submitted on demand rather than bulk pulled
    return [];
  }

  async normalize(raw: DiscoveredRawJob): Promise<CreateJobInput> {
    const data = (raw.data || {}) as UserJobUrlData;
    const url = raw.url || data.url;

    if (!url || typeof url !== "string") {
      throw new JobValidationError("User job submission requires a valid 'url'.");
    }

    const title = (data.title || "Discovered Opportunity").trim();
    const company = (data.company || "Direct Employer").trim();
    const cleanDesc = cleanDescriptionText(data.description || "User-submitted job listing.");

    // Conservative remote policy classification
    const remotePolicy = classifyRemotePolicy(
      data.location,
      Boolean(data.location && /remote/i.test(data.location))
    );

    return {
      source: this.id,
      sourceJobId: raw.sourceJobId || `usr_${Buffer.from(url).toString("base64url").slice(0, 32)}`,
      title,
      company,
      location: data.location ? data.location.trim() : null,
      remoteType: remotePolicy,
      allowedCountries: [],
      salary: data.salaryMin ?? null,
      salaryMin: data.salaryMin ?? null,
      salaryMax: data.salaryMax ?? null,
      currency: data.currency ? data.currency.toUpperCase().trim() : "USD",
      skills: Array.isArray(data.skills) ? data.skills : [],
      requirements: [],
      description: cleanDesc,
      applicationUrl: url,
      canonicalUrl: url,
      status: "ACTIVE",
      postedAt: raw.discoveredAt ?? new Date(),
    };
  }

  async getApplicationUrl(raw: DiscoveredRawJob): Promise<string> {
    const data = (raw.data || {}) as UserJobUrlData;
    return raw.url || data.url || "";
  }

  async verifyStatus(options: {
    applicationUrl: string;
    sourceJobId: string;
    signal?: AbortSignal;
  }): Promise<JobStatus> {
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
