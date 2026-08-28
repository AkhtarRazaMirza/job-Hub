/**
 * Job Hub — Phase 4 / Step 4.4
 * Match Explainer AI Prompts & Templates
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 04_ai_agent_skills.md §9, §10, §21 (MatchExplainer)
 * - 04_ai_agent_skills.md §23 (Non-negotiable AI engineering rules: never trust raw LLM output,
 *   never let AI invent candidate information, make match scores explainable)
 *
 * Domain-specific prompts strictly placed within @job-hub/matching.
 */

import type {
  CandidateMatchData,
  JobMatchData,
  CategoryScores,
  ScoringWeights,
  HardConstraintResult,
  MatchDecision,
} from "./types";

export const MATCH_EXPLAINER_SYSTEM_PROMPT = `You are an objective, truth-preserving Candidate-Job Match Explainer in the Job Hub system.
Your mission is to synthesize an audit-ready, factual evaluation comparing a candidate's verified profile against a canonical job opportunity.

CRITICAL TRUTHFULNESS & FACTUAL RESTRAINT RULES (NON-NEGOTIABLE):
1. Rely SOLELY on the explicit candidate facts and job details provided in the prompt.
2. You MUST NOT invent, assume, or extrapolate candidate skills, work history, projects, certifications, or education.
3. If a skill or requirement is not explicitly stated in the candidate profile, treat it as UNVERIFIED or MISSING (report as a gap or risk).
4. Never convert unverified inferences into established facts.
5. Respect the deterministic scores and hard constraint outcomes provided. Do NOT attempt to overturn or reason away a hard constraint failure.
6. Return concise, high-density, evidence-grounded observations. Avoid generic AI praise or boilerplate.
`;

export function buildMatchExplainerUserPrompt(params: {
  candidate: CandidateMatchData;
  job: JobMatchData;
  hardConstraints: HardConstraintResult;
  overallScore: number;
  decision: MatchDecision;
  categoryScores: CategoryScores;
  weights: ScoringWeights;
}): string {
  const { candidate, job, hardConstraints, overallScore, decision, categoryScores } = params;

  return `Please evaluate the following candidate-job pair and produce a structured match explanation.

=== CANDIDATE PROFILE (SOURCE FACTS) ===
- Candidate ID: ${candidate.candidateProfileId ?? "unknown"}
- Headline: ${candidate.headline ?? "Not provided"}
- Technical Skills: ${(candidate.skills ?? []).join(", ") || "None specified"}
- Experience Level: ${candidate.experienceLevel ?? "Unspecified"} (${candidate.yearsOfExperience !== undefined ? `${candidate.yearsOfExperience} years` : "years unverified"})
- Remote Preference: ${candidate.remotePreference ?? "UNKNOWN"}
- Preferred Locations: ${(candidate.preferredLocations ?? []).join(", ") || "None"}
- Minimum Salary: ${candidate.salaryMin ? `${candidate.salaryMin} ${candidate.salaryCurrency ?? "USD"}` : "Unspecified"}
- Projects: ${
    (candidate.projects ?? []).length > 0
      ? candidate.projects!
          .map((p) => `${p.name} (Tech: ${(p.technologies ?? []).join(", ") || "N/A"})`)
          .join("; ")
      : "None listed"
  }
- Education: ${
    (candidate.education ?? []).length > 0
      ? candidate.education!
          .map((e) => `${e.degree ?? "Degree"} in ${e.fieldOfStudy ?? "Field"} (${e.institution ?? "Institution"})`)
          .join("; ")
      : "None listed"
  }

=== CANONICAL JOB OPPORTUNITY ===
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location ?? "Unspecified"}
- Remote Type: ${job.remoteType ?? "UNKNOWN"}
- Permitted Countries: ${(job.allowedCountries ?? []).join(", ") || "Any / Worldwide"}
- Required Experience: ${job.experience ?? "Not specified"}
- Required Skills: ${(job.skills ?? []).join(", ") || "None explicitly listed"}
- Key Requirements: ${(job.requirements ?? []).join("; ") || "None explicitly listed"}
- Compensation: ${job.salaryMin || job.salaryMax ? `${job.salaryMin ?? "?"} - ${job.salaryMax ?? "?"} ${job.currency ?? "USD"}` : "Unspecified"}

=== DETERMINISTIC AUDIT METRICS ===
- Hard Constraints Passed: ${hardConstraints.passed ? "YES" : "NO"}
- Hard Constraint Failures: ${hardConstraints.failures.length > 0 ? hardConstraints.failures.join(" | ") : "None"}
- Deterministic Overall Score: ${overallScore.toFixed(2)} / 10.00
- Recommended Decision: ${decision}
- Category Breakdown:
  * Skills Score: ${(categoryScores.skillsScore * 100).toFixed(0)}%
  * Experience Score: ${(categoryScores.experienceScore * 100).toFixed(0)}%
  * Remote/Location Score: ${(categoryScores.remoteLocationScore * 100).toFixed(0)}%
  * Projects Score: ${(categoryScores.projectsScore * 100).toFixed(0)}%
  * Education Score: ${(categoryScores.educationScore * 100).toFixed(0)}%
  * Salary Score: ${(categoryScores.salaryScore * 100).toFixed(0)}%
  * Freshness Score: ${(categoryScores.freshnessScore * 100).toFixed(0)}%

INSTRUCTIONS:
Provide structured output with:
1. strengths: 2 to 4 concrete bullet points matching verified candidate facts directly to job requirements.
2. gaps: 1 to 3 concrete missing skills or experience gaps identified from requirements.
3. risks: 1 to 3 risks (e.g. timezone overlap, seniority variance, tech stack adaptation). If hard constraints failed, include the constraint violation.
4. explanation: A 2-3 sentence objective audit summary justifying the score and decision.
5. confidence: A numeric confidence score between 0.00 and 1.00 reflecting data completeness.
`;
}
