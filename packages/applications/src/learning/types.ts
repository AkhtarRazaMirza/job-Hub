/**
 * Job Hub — Phase 10 / Step 10.1
 * Learning Domain Types & Models
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 03_tech_stack.md §4 ("TypeScript")
 * - 04_ai_agent_skills.md §20 ("Learning Skill") & §21 ("RecommendationAgent")
 *
 * Core Invariants:
 * 1. Read-Only Candidate Truth: Learning never alters candidate identity, profile,
 *    verified skills, work authorization, or master resumes.
 * 2. Deterministic Grounding: Recommendations are backed by explicit measurable evidence.
 * 3. Non-Causal Framing: Patterns describe observed outcome correlations, never causality.
 * 4. Sample-Size Transparency: Explicit confidence classification and sample sizes.
 * 5. User Control: Recommendations are suggestions that candidates can review, dismiss, or apply.
 */

/**
 * Categorical types of evidence-based recommendations.
 */
export type RecommendationType =
  | "ROLE_FOCUS"
  | "SOURCE_FOCUS"
  | "MATCH_SCORE_BAND"
  | "RESUME_VERSION"
  | "SKILL_INSIGHT";

/**
 * Lifecycle status of a candidate recommendation.
 * Active recommendations are actionable; dismissed or applied recommendations
 * are preserved for historical auditability and idempotency.
 */
export type RecommendationStatus = "ACTIVE" | "DISMISSED" | "APPLIED";

/**
 * Confidence level based strictly on deterministic evidence thresholds.
 */
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW_CONFIDENCE";

/**
 * Quantitative metrics for a specific outcome cohort.
 */
export interface EvidenceMetric {
  applications: number;
  interviews: number;
  offers: number;
  rejections: number;
  interviewRate: number | null; // null when applications === 0
  offerRate: number | null;
  responseRate: number | null;
  averageMatchScore: number | null;
  disclosureText: string; // e.g. "6 of 20 applications (30.0%)"
}

/**
 * Traceable, auditable evidence snapshot supporting a recommendation.
 */
export interface OutcomeEvidence {
  dimension: "role" | "source" | "match_score_band" | "resume_version" | "skill";
  primaryValue: string; // e.g. "AI Full-Stack" or "remoteok"
  primaryMetric: EvidenceMetric;
  comparisonValue?: string | null; // e.g. "Frontend-only" or "himalayas"
  comparisonMetric?: EvidenceMetric | null;
  sampleSize: number;
  minSampleSizeThreshold: number;
  isStatisticallyMeaningful: boolean;
  explanation: string;
}

/**
 * Full domain entity representing a personalized, evidence-grounded recommendation.
 */
export interface Recommendation {
  id: string;
  candidateProfileId: string;
  type: RecommendationType;
  title: string;
  summary: string;
  explanation: string;
  confidence: ConfidenceLevel;
  evidence: OutcomeEvidence;
  status: RecommendationStatus;
  dismissedAt?: Date | string | null;
  appliedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Detected outcome pattern before recommendation generation.
 */
export interface DetectedPattern {
  type: RecommendationType;
  dimension: "role" | "source" | "match_score_band" | "resume_version" | "skill";
  targetKey: string;
  title: string;
  summary: string;
  explanation: string;
  confidence: ConfidenceLevel;
  evidence: OutcomeEvidence;
}
