/**
 * Job Hub — Phase 3 / Step 3.5
 * Job Normalization Engine Types
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 4
 * - 02_how_to_build.md §6
 * - 04_ai_agent_skills.md §5 & §6
 */

import type { CreateJobInput } from "../types";
import type { DiscoveredRawJob } from "../source/types";

export interface NormalizeJobOptions {
  /**
   * If true, strips marketing and tracking parameters (e.g. utm_*, fbclid) from canonical URLs.
   * Default: true.
   */
  stripTrackingParams?: boolean;
}

export interface NormalizedJobResult {
  job: CreateJobInput;
  source: string;
  sourceJobId: string;
  rawUrl?: string;
  normalizedAt: Date;
}

export interface NormalizeBatchItemError {
  source: string;
  sourceJobId: string;
  error: string;
  code?: string;
}

export interface NormalizeBatchResult {
  successful: NormalizedJobResult[];
  failed: NormalizeBatchItemError[];
  totalProcessed: number;
}
