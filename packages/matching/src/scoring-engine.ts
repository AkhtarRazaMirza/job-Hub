/**
 * Job Hub — Phase 4 / Step 4.3
 * Deterministic Seven-Factor Weighted Scoring Engine
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 02_how_to_build.md §9 (Initial weighted score formula)
 * - 04_ai_agent_skills.md §9 & §10 (Match decision rules)
 * - 04_ai_agent_skills.md §23 Rule 13 ("Prefer deterministic code over AI")
 *
 * Factors:
 * 1. Skills (30%)
 * 2. Experience (20%)
 * 3. Remote/Location (20%)
 * 4. Projects (10%)
 * 5. Education (10%)
 * 6. Salary (5%)
 * 7. Job Freshness (5%)
 *
 * Scale: 0.00 to 10.00
 * Decision Categories:
 * - < 6.0: SKIP
 * - 6.0 – 7.9: REVIEW
 * - 8.0 – 8.9: STRONG_MATCH
 * - 9.0 – 10.0: EXCELLENT_MATCH
 *
 * PURE and DETERMINISTIC:
 * - No LLM calls
 * - No database access
 * - Identical inputs produce identical outputs
 */

import type {
  CandidateMatchData,
  JobMatchData,
  CategoryScores,
  ScoringWeights,
  MatchDecision,
  HardConstraintResult,
} from "./types";
import { DEFAULT_SCORING_WEIGHTS } from "./types";
import { scoringWeightsSchema } from "./validation";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .trim()
    .replace(/\.js$/i, "")
    .replace(/js$/i, "")
    .replace(/[^a-z0-9+#]/g, "");
}

/**
 * 1. Skills Score (0.00 to 1.00)
 */
export function calculateSkillsScore(candidate: CandidateMatchData, job: JobMatchData): number {
  const candidateSkills = (candidate.skills ?? []).map(normalizeToken).filter(Boolean);
  const jobSkills = (job.skills ?? []).map(normalizeToken).filter(Boolean);

  if (jobSkills.length === 0) {
    // If job specifies requirements, check overlap with candidate skills
    const reqTokens = (job.requirements ?? [])
      .flatMap((r) => r.toLowerCase().split(/\s+/))
      .map(normalizeToken)
      .filter((t) => t.length > 2);

    if (reqTokens.length > 0 && candidateSkills.length > 0) {
      const matches = candidateSkills.filter((cs) => reqTokens.includes(cs));
      const ratio = matches.length / Math.min(candidateSkills.length, 5);
      return Math.min(1.0, Math.max(0.4, 0.4 + ratio * 0.6));
    }
    return 0.70; // Neutral default when no explicit requirements
  }

  if (candidateSkills.length === 0) {
    return 0.10;
  }

  let matchedCount = 0;
  for (const js of jobSkills) {
    const isMatched = candidateSkills.some(
      (cs) => cs === js || cs.includes(js) || js.includes(cs)
    );
    if (isMatched) matchedCount++;
  }

  const coverage = matchedCount / jobSkills.length;
  return Math.min(1.0, Math.max(0.0, coverage));
}

/**
 * 2. Experience Score (0.00 to 1.00)
 */
export function calculateExperienceScore(candidate: CandidateMatchData, job: JobMatchData): number {
  const levelOrder: Record<string, number> = {
    ENTRY: 1,
    MID: 2,
    SENIOR: 3,
    LEAD: 4,
    PRINCIPAL: 5,
  };

  const candLevelStr = candidate.experienceLevel?.toUpperCase().trim() ?? "MID";
  const candLevelNum = levelOrder[candLevelStr] ?? 2;

  // Extract years from job
  let jobYearsRequired: number | null = null;
  if (job.experience) {
    const match = job.experience.match(/(\d+)\+?\s*(?:-\s*\d+)?\s*(?:years?|yrs?)/i);
    if (match && match[1]) {
      jobYearsRequired = parseInt(match[1], 10);
    } else {
      const upper = job.experience.toUpperCase();
      if (upper.includes("PRINCIPAL") || upper.includes("STAFF")) jobYearsRequired = 10;
      else if (upper.includes("LEAD")) jobYearsRequired = 8;
      else if (upper.includes("SENIOR") || upper.includes("SR")) jobYearsRequired = 5;
      else if (upper.includes("MID")) jobYearsRequired = 3;
      else if (upper.includes("ENTRY") || upper.includes("JUNIOR")) jobYearsRequired = 0;
    }
  }

  const candYears = candidate.yearsOfExperience ?? (candLevelNum * 2.5);

  if (jobYearsRequired === null) {
    return 0.75; // Neutral baseline when unspecified
  }

  if (candYears >= jobYearsRequired) {
    return 1.00;
  }

  const gap = jobYearsRequired - candYears;
  if (gap <= 1) return 0.80;
  if (gap <= 2) return 0.60;
  if (gap <= 3) return 0.40;
  return 0.20;
}

/**
 * 3. Remote / Location Score (0.00 to 1.00)
 */
export function calculateRemoteLocationScore(candidate: CandidateMatchData, job: JobMatchData): number {
  const candRemote = candidate.remotePreference?.toUpperCase().trim() ?? "UNKNOWN";
  const jobRemote = job.remoteType?.toUpperCase().trim() ?? "UNKNOWN";

  if (jobRemote === "WORLDWIDE_REMOTE") {
    return candRemote === "WORLDWIDE_REMOTE" || candRemote === "COUNTRY_REMOTE" ? 1.00 : 0.85;
  }

  const candLocs = (candidate.preferredLocations ?? []).map((l) => l.trim().toUpperCase());
  const jobCountries = (job.allowedCountries ?? []).map((c) => c.trim().toUpperCase());

  const hasLocationMatch =
    candLocs.length > 0 &&
    jobCountries.length > 0 &&
    jobCountries.some((jc) => candLocs.includes(jc));

  if (jobRemote === "COUNTRY_REMOTE" || jobRemote === "REGION_REMOTE") {
    if (hasLocationMatch) return 0.95;
    if (candRemote === "WORLDWIDE_REMOTE" && jobCountries.length === 0) return 0.90;
    return 0.40;
  }

  if (jobRemote === "HYBRID" || jobRemote === "ONSITE") {
    if (hasLocationMatch) return 0.80;
    if (candRemote === "WORLDWIDE_REMOTE" || candRemote === "COUNTRY_REMOTE") return 0.10;
    return 0.50;
  }

  return 0.60; // Neutral default
}

/**
 * 4. Projects Score (0.00 to 1.00)
 */
export function calculateProjectsScore(candidate: CandidateMatchData, job: JobMatchData): number {
  const projects = candidate.projects ?? [];
  if (projects.length === 0) {
    return 0.30;
  }

  const jobSkills = (job.skills ?? []).map(normalizeToken).filter(Boolean);
  if (jobSkills.length === 0) {
    return 0.75; // Has projects, job skills not listed
  }

  const projectTechs = new Set(
    projects
      .flatMap((p) => p.technologies ?? [])
      .map(normalizeToken)
      .filter(Boolean)
  );

  let matchCount = 0;
  for (const js of jobSkills) {
    if (projectTechs.has(js)) matchCount++;
  }

  if (matchCount >= 3) return 1.00;
  if (matchCount === 2) return 0.85;
  if (matchCount === 1) return 0.70;
  return 0.45;
}

/**
 * 5. Education Score (0.00 to 1.00)
 */
export function calculateEducationScore(candidate: CandidateMatchData, job: JobMatchData): number {
  const education = candidate.education ?? [];
  const reqText = (job.requirements ?? []).join(" ").toLowerCase();
  const requiresDegree =
    reqText.includes("bachelor") ||
    reqText.includes("degree") ||
    reqText.includes("master") ||
    reqText.includes("bs in") ||
    reqText.includes("computer science");

  if (education.length === 0) {
    return requiresDegree ? 0.30 : 0.65;
  }

  const degrees = education.map((e) => (e.degree ?? "").toLowerCase());
  const hasAdvanced = degrees.some((d) => d.includes("master") || d.includes("phd") || d.includes("doctor"));
  if (hasAdvanced) return 1.00;

  const hasBachelor = degrees.some((d) => d.includes("bachelor") || d.includes("bs") || d.includes("b.s."));
  if (hasBachelor) return requiresDegree ? 1.00 : 0.90;

  return 0.75;
}

/**
 * 6. Salary Score (0.00 to 1.00)
 */
export function calculateSalaryScore(candidate: CandidateMatchData, job: JobMatchData): number {
  const candMin = candidate.salaryMin;
  const jobMax = job.salaryMax ?? job.salary ?? job.salaryMin;
  const jobMin = job.salaryMin ?? job.salary ?? job.salaryMax;

  // If salary is unspecified on either side, maintain truthfulness: do not penalize
  if (candMin === null || candMin === undefined || candMin <= 0 || !jobMax) {
    return 0.75;
  }

  if (jobMin && jobMin >= candMin) {
    return 1.00;
  }

  if (jobMax >= candMin) {
    return 0.90;
  }

  // Job max is below candidate minimum
  const deficit = candMin - jobMax;
  const deficitRatio = deficit / candMin;

  if (deficitRatio <= 0.10) return 0.60;
  if (deficitRatio <= 0.20) return 0.30;
  return 0.10;
}

/**
 * 7. Job Freshness Score (0.00 to 1.00)
 */
export function calculateFreshnessScore(
  job: JobMatchData,
  referenceDate: Date = new Date()
): number {
  if (!job.postedAt) {
    return 0.70;
  }

  const postedDate = typeof job.postedAt === "string" ? new Date(job.postedAt) : job.postedAt;
  if (isNaN(postedDate.getTime())) {
    return 0.70;
  }

  const ageDays = Math.max(0, (referenceDate.getTime() - postedDate.getTime()) / ONE_DAY_MS);

  if (ageDays <= 7) return 1.00;
  if (ageDays <= 14) return 0.85;
  if (ageDays <= 30) return 0.70;
  if (ageDays <= 60) return 0.50;
  if (ageDays <= 90) return 0.30;
  return 0.10;
}

/**
 * Derives the exact MatchDecision category from the numerical overall score.
 * Grounded in 04_ai_agent_skills.md §10.
 */
export function deriveMatchDecision(overallScore: number): MatchDecision {
  if (overallScore < 6.0) return "SKIP";
  if (overallScore < 8.0) return "REVIEW";
  if (overallScore < 9.0) return "STRONG_MATCH";
  return "EXCELLENT_MATCH";
}

/**
 * Pure deterministic seven-factor weighted scoring engine.
 */
export function calculateMatchScores(
  candidate: CandidateMatchData,
  job: JobMatchData,
  hardConstraints: HardConstraintResult,
  customWeights?: ScoringWeights,
  referenceDate: Date = new Date()
): {
  overallScore: number;
  decision: MatchDecision;
  categoryScores: CategoryScores;
  weightsUsed: ScoringWeights;
} {
  // Validate or use default weights
  const weights: ScoringWeights = customWeights
    ? scoringWeightsSchema.parse(customWeights)
    : DEFAULT_SCORING_WEIGHTS;

  // Calculate 7 category scores
  const categoryScores: CategoryScores = {
    skillsScore: Math.round(calculateSkillsScore(candidate, job) * 100) / 100,
    experienceScore: Math.round(calculateExperienceScore(candidate, job) * 100) / 100,
    remoteLocationScore: Math.round(calculateRemoteLocationScore(candidate, job) * 100) / 100,
    projectsScore: Math.round(calculateProjectsScore(candidate, job) * 100) / 100,
    educationScore: Math.round(calculateEducationScore(candidate, job) * 100) / 100,
    salaryScore: Math.round(calculateSalaryScore(candidate, job) * 100) / 100,
    freshnessScore: Math.round(calculateFreshnessScore(job, referenceDate) * 100) / 100,
  };

  // If hard constraints failed: override score to 0.00 and decision to SKIP
  // Grounded in 02_how_to_build.md §9 ("Hard constraints should override the score")
  if (!hardConstraints.passed) {
    return {
      overallScore: 0.00,
      decision: "SKIP",
      categoryScores,
      weightsUsed: weights,
    };
  }

  // Calculate weighted sum
  const weightedSum =
    categoryScores.skillsScore * weights.skills +
    categoryScores.experienceScore * weights.experience +
    categoryScores.remoteLocationScore * weights.remoteLocation +
    categoryScores.projectsScore * weights.projects +
    categoryScores.educationScore * weights.education +
    categoryScores.salaryScore * weights.salary +
    categoryScores.freshnessScore * weights.freshness;

  // Map to 0.00 – 10.00 range
  const overallScore = Math.min(10.0, Math.max(0.0, Math.round(weightedSum * 1000) / 100));
  const decision = deriveMatchDecision(overallScore);

  return {
    overallScore,
    decision,
    categoryScores,
    weightsUsed: weights,
  };
}
