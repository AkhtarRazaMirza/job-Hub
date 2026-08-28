/**
 * Job Hub — Phase 3 / Step 3.7
 * Job Deduplication Engine Types
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 6
 * - 02_how_to_build.md §7
 * - 04_ai_agent_skills.md §8
 */

export type DeduplicationMatchType =
  | "EXACT_SOURCE_ID"
  | "EXACT_CANONICAL_URL"
  | "EXACT_APPLICATION_URL"
  | "NORMALIZED_COMPOUND_KEY"
  | "TEXT_SIMILARITY";

export interface DeduplicationMatch {
  canonicalJobId: string;
  matchType: DeduplicationMatchType;
  confidence: number; // 0.0 to 1.0
  reasons: string[];
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  match: DeduplicationMatch | null;
}

export interface DeduplicationOptions {
  /**
   * Minimum text similarity threshold for fuzzy matching (0.0 to 1.0).
   * Default: 0.85.
   */
  titleSimilarityThreshold?: number;

  /**
   * Whether to check candidate company active listings for compound key matches.
   * Default: true.
   */
  checkCompoundKey?: boolean;
}
