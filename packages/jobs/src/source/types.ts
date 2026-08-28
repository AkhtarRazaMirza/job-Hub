/**
 * Job Hub — Phase 3 / Step 3.3
 * Job Source Contract and Adapter Types
 *
 * Implements architectural requirements from:
 * - 01_build_the_system.md §4 Step 3
 * - 02_how_to_build.md §5 & §6
 * - 04_ai_agent_skills.md §5 & §6
 */

import type {
  JobSourceType,
  JobStatus,
  CreateJobInput,
} from "../types";

/**
 * Raw job representation returned by an adapter's discover() method.
 */
export interface DiscoveredRawJob {
  source: string;
  sourceJobId: string;
  data: unknown;
  url?: string;
  discoveredAt: Date;
}

/**
 * Options passed to an adapter's discover() method.
 */
export interface DiscoverOptions {
  limit?: number;
  query?: string;
  tag?: string;
  signal?: AbortSignal;
}

/**
 * Verification input parameters for verifyStatus().
 */
export interface VerifyStatusOptions {
  applicationUrl: string;
  sourceJobId?: string | null;
  signal?: AbortSignal;
}

/**
 * Core JobSource Contract.
 * Grounded in 02_how_to_build.md §5:
 * JobSource
 * ├── discover()
 * ├── normalize()
 * ├── getApplicationUrl()
 * └── verifyStatus()
 */
export interface JobSourceContract {
  readonly id: string;
  readonly name: string;
  readonly type: JobSourceType;
  readonly baseUrl?: string;

  /**
   * Discover and fetch raw job listings from the external source.
   */
  discover(options?: DiscoverOptions): Promise<DiscoveredRawJob[]>;

  /**
   * Normalize an external raw job payload into the canonical CreateJobInput.
   */
  normalize(raw: DiscoveredRawJob): Promise<CreateJobInput>;

  /**
   * Extract the direct application URL from the raw job payload.
   */
  getApplicationUrl(raw: DiscoveredRawJob): Promise<string>;

  /**
   * Verify whether a job posting is still active or closed.
   */
  verifyStatus(options: VerifyStatusOptions): Promise<JobStatus>;
}

export type JobSourceAdapter = JobSourceContract;
