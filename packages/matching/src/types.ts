/**
 * Job Hub — Phase 4 / Step 4.1
 * Matching Domain Types
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7 & §5 Phase 4
 * - 02_how_to_build.md §2, §8 & §9
 * - 04_ai_agent_skills.md §9, §10 & §23
 */

export type MatchDecision =
  | "SKIP"
  | "REVIEW"
  | "STRONG_MATCH"
  | "EXCELLENT_MATCH";

export interface CategoryScores {
  skillsScore: number; // 0.00 to 1.00
  experienceScore: number; // 0.00 to 1.00
  remoteLocationScore: number; // 0.00 to 1.00
  projectsScore: number; // 0.00 to 1.00
  educationScore: number; // 0.00 to 1.00
  salaryScore: number; // 0.00 to 1.00
  freshnessScore: number; // 0.00 to 1.00
}

export interface ScoringWeights {
  skills: number; // e.g. 0.30
  experience: number; // e.g. 0.20
  remoteLocation: number; // e.g. 0.20
  projects: number; // e.g. 0.10
  education: number; // e.g. 0.10
  salary: number; // e.g. 0.05
  freshness: number; // e.g. 0.05
  [key: string]: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  skills: 0.30,
  experience: 0.20,
  remoteLocation: 0.20,
  projects: 0.10,
  education: 0.10,
  salary: 0.05,
  freshness: 0.05,
};

export interface HardConstraintResult {
  passed: boolean;
  failures: string[];
}

export interface MatchEvaluationResult {
  overallScore: number; // 0.00 to 10.00
  decision: MatchDecision;
  hardConstraints: HardConstraintResult;
  categoryScores: CategoryScores;
  strengths: string[];
  gaps: string[];
  risks: string[];
  explanation: string;
  confidence: number; // 0.00 to 1.00
  weightsUsed: ScoringWeights;
}

export interface JobMatch {
  id: string;
  candidateProfileId: string;
  jobId: string;
  overallScore: number; // 0.00 to 10.00
  decision: MatchDecision;
  hardConstraintsPassed: boolean;
  hardConstraintFailures: string[];
  categoryScores: CategoryScores;
  strengths: string[];
  gaps: string[];
  risks: string[];
  explanation: string;
  confidence: number; // 0.00 to 1.00
  weightsUsed: ScoringWeights;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJobMatchInput {
  id?: string;
  candidateProfileId: string;
  jobId: string;
  overallScore: number; // 0.00 to 10.00
  decision: MatchDecision;
  hardConstraintsPassed: boolean;
  hardConstraintFailures?: string[];
  categoryScores: CategoryScores;
  strengths?: string[];
  gaps?: string[];
  risks?: string[];
  explanation: string;
  confidence: number; // 0.00 to 1.00
  weightsUsed?: ScoringWeights;
}

export interface UpdateJobMatchInput {
  overallScore?: number;
  decision?: MatchDecision;
  hardConstraintsPassed?: boolean;
  hardConstraintFailures?: string[];
  categoryScores?: CategoryScores;
  strengths?: string[];
  gaps?: string[];
  risks?: string[];
  explanation?: string;
  confidence?: number;
  weightsUsed?: ScoringWeights;
}

export interface JobMatchFilter {
  decision?: MatchDecision;
  minScore?: number;
  limit?: number;
  offset?: number;
}

/**
 * Pure Candidate data representation for matching evaluation.
 */
export interface CandidateMatchData {
  candidateProfileId?: string;
  headline?: string | null;
  skills?: string[];
  experienceLevel?: string; // "ENTRY" | "MID" | "SENIOR" | "LEAD" | "PRINCIPAL"
  yearsOfExperience?: number;
  remotePreference?: string; // "WORLDWIDE_REMOTE" | "COUNTRY_REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN"
  preferredLocations?: string[];
  salaryMin?: number | null;
  salaryCurrency?: string;
  projects?: Array<{
    name: string;
    technologies?: string[];
    description?: string;
  }>;
  education?: Array<{
    degree?: string;
    fieldOfStudy?: string;
    institution?: string;
  }>;
  targetRoles?: string[];
}

/**
 * Pure Job data representation for matching evaluation.
 */
export interface JobMatchData {
  id?: string;
  title: string;
  company: string;
  description?: string | null;
  location?: string | null;
  remoteType?: string; // "WORLDWIDE_REMOTE" | "COUNTRY_REMOTE" | "REGION_REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN"
  allowedCountries?: string[];
  skills?: string[];
  requirements?: string[];
  experience?: string | null;
  salary?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  status?: string; // "ACTIVE" | "CLOSED" | "UNKNOWN" | "ARCHIVED"
  postedAt?: Date | string | null;
}

/**
 * Semantic explanation synthesized by AI or fallback engine.
 */
export interface MatchExplanation {
  strengths: string[];
  gaps: string[];
  risks: string[];
  explanation: string;
  confidence: number;
}

/**
 * Input for the end-to-end matching evaluation.
 */
export interface EvaluateMatchInput {
  candidate: CandidateMatchData;
  job: JobMatchData;
  weights?: ScoringWeights;
}
