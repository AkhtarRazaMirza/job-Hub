/**
 * Job Hub — Phase 3 / Step 3.1
 * Canonical Job Domain Types and Enums
 *
 * Implements architectural requirements from:
 * - 01_build_the_system.md §4 Step 4 & 5
 * - 02_how_to_build.md §5 & §6
 * - 04_ai_agent_skills.md §5 & §6
 */

/**
 * Explicit Remote Eligibility Classifications.
 * Grounded in 04_ai_agent_skills.md §6:
 * Rule: "Remote" alone must NOT be interpreted as "worldwide".
 */
export const REMOTE_TYPES = [
  "WORLDWIDE_REMOTE",
  "COUNTRY_REMOTE",
  "REGION_REMOTE",
  "HYBRID",
  "ONSITE",
  "UNKNOWN",
] as const;

export type RemoteType = (typeof REMOTE_TYPES)[number];

/**
 * Job Status Lifecycle.
 * Grounded in 01_build_the_system.md §4 Step 5 and 02_how_to_build.md §6.
 */
export const JOB_STATUSES = [
  "ACTIVE",
  "CLOSED",
  "UNKNOWN",
  "ARCHIVED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Job Source Classifications.
 * Grounded in 01_build_the_system.md §4 Step 3 and 02_how_to_build.md §5.
 */
export const JOB_SOURCE_TYPES = [
  "API",
  "FEED",
  "ATS",
  "BOARD",
  "USER_URL",
] as const;

export type JobSourceType = (typeof JOB_SOURCE_TYPES)[number];

/**
 * Canonical Job Source Entity.
 */
export interface JobSource {
  id: string;
  name: string;
  type: JobSourceType | string;
  url: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJobSourceInput {
  id?: string;
  name: string;
  type: JobSourceType | string;
  url?: string | null;
  isActive?: boolean;
}

export interface UpdateJobSourceInput {
  name?: string;
  type?: JobSourceType | string;
  url?: string | null;
  isActive?: boolean;
}

/**
 * Canonical Job Entity.
 * Represents the normalized internal schema for any job discovered from any source.
 * Grounded in 02_how_to_build.md §6.
 */
export interface Job {
  id: string;
  source: string;
  sourceJobId: string | null;
  jobSourceId: string | null;
  canonicalUrl: string | null;
  title: string;
  company: string;
  location: string | null;
  remoteType: RemoteType | string;
  allowedCountries: string[];
  salary: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  experience: string | null;
  skills: string[];
  requirements: string[];
  description: string | null;
  applicationUrl: string;
  status: JobStatus | string;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJobInput {
  id?: string;
  source: string;
  sourceJobId?: string | null;
  jobSourceId?: string | null;
  canonicalUrl?: string | null;
  title: string;
  company: string;
  location?: string | null;
  remoteType?: RemoteType | string;
  allowedCountries?: string[];
  salary?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  experience?: string | null;
  skills?: string[];
  requirements?: string[];
  description?: string | null;
  applicationUrl: string;
  status?: JobStatus | string;
  postedAt?: Date | null;
}

export interface UpdateJobInput {
  source?: string;
  sourceJobId?: string | null;
  jobSourceId?: string | null;
  canonicalUrl?: string | null;
  title?: string;
  company?: string;
  location?: string | null;
  remoteType?: RemoteType | string;
  allowedCountries?: string[];
  salary?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  experience?: string | null;
  skills?: string[];
  requirements?: string[];
  description?: string | null;
  applicationUrl?: string;
  status?: JobStatus | string;
  postedAt?: Date | null;
}

export interface JobFilter {
  source?: string;
  jobSourceId?: string;
  remoteType?: RemoteType | string;
  status?: JobStatus | string;
  company?: string;
  limit?: number;
  offset?: number;
}
