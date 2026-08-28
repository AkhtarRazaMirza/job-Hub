/**
 * Job Hub — Phase 4 / Step 4.2
 * Deterministic Hard Constraint Evaluator
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 02_how_to_build.md §8 (Deterministic filtering: Remote, Country, Experience, Required skills, Status, Freshness)
 * - 02_how_to_build.md §9 ("Hard constraints should override the score")
 * - 04_ai_agent_skills.md §6 & §23 Rule 4 ("Separate hard constraints from AI scoring")
 * - 04_ai_agent_skills.md §23 Rule 13 ("Prefer deterministic code over AI when a deterministic rule is sufficient")
 *
 * PURE and DETERMINISTIC:
 * - No OpenAI or LLM calls
 * - No database access
 * - No network or storage dependencies
 */

import type {
  CandidateMatchData,
  JobMatchData,
  HardConstraintResult,
} from "./types";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Standardizes country names/codes to ISO-like uppercase tokens.
 */
function normalizeCountryCode(country: string): string {
  const c = country.trim().toUpperCase();
  if (c === "USA" || c === "UNITED STATES" || c === "UNITED STATES OF AMERICA" || c === "U.S." || c === "U.S.A.") {
    return "US";
  }
  if (c === "UK" || c === "UNITED KINGDOM" || c === "GREAT BRITAIN" || c === "ENGLAND") {
    return "GB";
  }
  if (c === "CANADA") return "CA";
  if (c === "GERMANY" || c === "DEUTSCHLAND") return "DE";
  if (c === "INDIA") return "IN";
  return c;
}

/**
 * Extracts a numeric year floor from an experience string (e.g. "5+ years", "3-5 years", "minimum 7 years").
 */
function extractRequiredYears(expStr: string | null | undefined): number | null {
  if (!expStr) return null;
  const match = expStr.match(/(\d+)\+?\s*(?:-\s*\d+)?\s*(?:years?|yrs?)/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  const upper = expStr.toUpperCase();
  if (upper.includes("PRINCIPAL") || upper.includes("STAFF")) return 10;
  if (upper.includes("LEAD")) return 8;
  if (upper.includes("SENIOR") || upper.includes("SR")) return 5;
  if (upper.includes("MID")) return 3;
  if (upper.includes("ENTRY") || upper.includes("JUNIOR") || upper.includes("JR")) return 0;
  return null;
}

/**
 * Normalizes technical skill strings for deterministic matching (e.g. "React.js" -> "react", "NodeJS" -> "node").
 */
function normalizeSkill(skill: string): string {
  return skill
    .toLowerCase()
    .trim()
    .replace(/\.js$/i, "")
    .replace(/js$/i, "")
    .replace(/[^a-z0-9+#]/g, "");
}

/**
 * Pure deterministic evaluator assessing whether a candidate and job satisfy non-negotiable hard constraints.
 */
export function evaluateHardConstraints(
  candidate: CandidateMatchData,
  job: JobMatchData,
  referenceDate: Date = new Date()
): HardConstraintResult {
  const failures: string[] = [];

  // 1. Application / Job Status Constraint
  if (job.status) {
    const normStatus = job.status.toUpperCase().trim();
    if (normStatus === "CLOSED" || normStatus === "ARCHIVED") {
      failures.push(`JOB_STATUS_INACTIVE: Job is no longer active (status: ${job.status}).`);
    }
  }

  // 2. Job Freshness Constraint (stale if > 90 days)
  if (job.postedAt) {
    const postedDate = typeof job.postedAt === "string" ? new Date(job.postedAt) : job.postedAt;
    if (!isNaN(postedDate.getTime())) {
      const ageMs = referenceDate.getTime() - postedDate.getTime();
      if (ageMs > NINETY_DAYS_MS) {
        failures.push(
          `JOB_STALE: Job posting is Stale / older than 90 days (posted: ${postedDate.toISOString().split("T")[0]}).`
        );
      }
    }
  }

  // 3. Remote Policy & Country Eligibility Constraint
  const candidateRemote = candidate.remotePreference?.toUpperCase().trim() ?? "UNKNOWN";
  const jobRemote = job.remoteType?.toUpperCase().trim() ?? "UNKNOWN";
  const jobAllowedCountries = (job.allowedCountries ?? []).map(normalizeCountryCode);
  const candidateLocations = (candidate.preferredLocations ?? []).map(normalizeCountryCode);

  // 3a. Candidate requires remote, but job requires onsite/hybrid
  if (
    (candidateRemote === "WORLDWIDE_REMOTE" || candidateRemote === "COUNTRY_REMOTE") &&
    (jobRemote === "ONSITE" || jobRemote === "HYBRID")
  ) {
    failures.push(
      `REMOTE_POLICY_MISMATCH: Candidate requires remote work, but job requires ${jobRemote === "ONSITE" ? "Onsite" : jobRemote === "HYBRID" ? "Hybrid" : jobRemote} (${jobRemote}) presence.`
    );
  }

  // 3b. Candidate requires Worldwide Remote, but job is country-restricted
  if (candidateRemote === "WORLDWIDE_REMOTE") {
    if (jobRemote === "COUNTRY_REMOTE" || jobRemote === "REGION_REMOTE" || jobAllowedCountries.length > 0) {
      // If candidate also specifies preferred locations, check if any match allowed countries
      const hasLocationOverlap =
        candidateLocations.length > 0 &&
        jobAllowedCountries.some((c) => candidateLocations.includes(c));

      if (!hasLocationOverlap && jobAllowedCountries.length > 0) {
        failures.push(
          `COUNTRY_INELIGIBLE: Candidate requires worldwide remote, but job restricts remote work to: [${jobAllowedCountries.join(", ")}].`
        );
      }
    }
  }

  // 3c. Candidate specifies country preferences that do not overlap with job's allowed countries
  if (
    candidateLocations.length > 0 &&
    jobAllowedCountries.length > 0 &&
    (jobRemote === "COUNTRY_REMOTE" || jobRemote === "REGION_REMOTE")
  ) {
    const sharesLocation = jobAllowedCountries.some((c) => candidateLocations.includes(c));
    if (!sharesLocation) {
      failures.push(
        `LOCATION_MISMATCH: Candidate locations ([${candidateLocations.join(", ")}]) do not match job permitted countries ([${jobAllowedCountries.join(", ")}]).`
      );
    }
  }

  // 4. Experience Floor Constraint
  const candidateLevel = candidate.experienceLevel?.toUpperCase().trim();
  const jobRequiredYears = extractRequiredYears(job.experience);
  const candidateYears = candidate.yearsOfExperience ?? (
    candidateLevel === "PRINCIPAL" ? 12 :
    candidateLevel === "LEAD" ? 8 :
    candidateLevel === "SENIOR" ? 5 :
    candidateLevel === "MID" ? 3 :
    candidateLevel === "ENTRY" ? 1 : null
  );

  if (jobRequiredYears !== null && candidateYears !== null) {
    // If job requires senior+ (>= 5 years) and candidate is verified entry/junior (< 2 years)
    if (jobRequiredYears >= 5 && candidateYears < 2) {
      failures.push(
        `EXPERIENCE_FLOOR_UNMET: Job requires ${jobRequiredYears}+ years of experience, but candidate has ${candidateYears} years.`
      );
    }
    // If job requires lead/principal (>= 8 years) and candidate has <= 3 years
    else if (jobRequiredYears >= 8 && candidateYears <= 3) {
      failures.push(
        `EXPERIENCE_FLOOR_UNMET: Job requires staff/lead level (${jobRequiredYears}+ years), but candidate has ${candidateYears} years.`
      );
    }
  } else if (candidateLevel === "ENTRY") {
    const jobExpUpper = (job.experience ?? "").toUpperCase();
    if (jobExpUpper.includes("PRINCIPAL") || jobExpUpper.includes("STAFF") || jobExpUpper.includes("LEAD")) {
      failures.push(
        `EXPERIENCE_FLOOR_UNMET: Job requires ${job.experience}, but candidate is ENTRY level.`
      );
    }
  }

  // 5. Non-Negotiable Required Skills Constraint (when job specifies explicit mandatory core skills)
  const jobSkills = (job.skills ?? []).map(normalizeSkill).filter((s) => s.length > 0);
  const candidateSkills = (candidate.skills ?? []).map(normalizeSkill).filter((s) => s.length > 0);

  // If candidate has declared skills and job specifies 3+ explicit required skills, verify non-zero overlap
  if (jobSkills.length >= 3 && candidateSkills.length > 0) {
    const hasAnySkill = jobSkills.some((js) =>
      candidateSkills.some((cs) => cs.includes(js) || js.includes(cs))
    );
    if (!hasAnySkill) {
      failures.push(
        `SKILLS_DISQUALIFIED: Candidate has none of the primary required technical skills for this role.`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
