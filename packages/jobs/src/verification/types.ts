/**
 * Job Hub — Phase 3 / Step 3.6
 * Job Verification Engine Types
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 5
 * - 02_how_to_build.md §4
 * - 04_ai_agent_skills.md §6 & §7
 */

import type { JobStatus, RemoteType } from "../types";

export interface VerifyJobOptions {
  /**
   * Maximum age in days before a job posting is considered stale.
   * Default: 90 days.
   */
  maxStaleDays?: number;

  /**
   * Whether to check live status over HTTP.
   * Default: true.
   */
  checkLiveStatus?: boolean;

  /**
   * Optional AbortSignal for network probes.
   */
  signal?: AbortSignal;
}

export interface JobVerificationResult {
  status: JobStatus;
  isVerified: boolean;
  isStale: boolean;
  isSpam: boolean;
  applicationUrlValid: boolean;
  freshnessDays: number | null;
  remoteClassification: RemoteType;
  reasons: string[];
  verifiedAt: Date;
}

export interface BatchVerificationResult {
  results: {
    sourceJobId: string;
    source: string;
    verification: JobVerificationResult;
  }[];
  activeCount: number;
  closedCount: number;
  spamCount: number;
  staleCount: number;
  totalProcessed: number;
}
