/**
 * Job Hub — Phase 7 / Step 7.1
 * Resume Truthfulness & Anti-Hallucination Engine
 *
 * Implements Non-Negotiable Truthfulness Rules:
 * - 01_build_the_system.md §2 & §4 Step 9 ("Never alter master resume, work from verified information")
 * - 02_how_to_build.md §11 ("May not invent metrics, responsibilities, technologies, employers, achievements")
 * - 04_ai_agent_skills.md §2 ("Resume Truthfulness Skill"), §11 ("Resume Tailoring Skill"), §23 ("Rule 5: Never let AI invent candidate information")
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type {
  TailoredResumeData,
  TruthfulnessValidationResult,
  TruthfulnessViolation,
} from "./types";

function normalizeString(val: string): string {
  return val
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Extracts quantitative metrics (percentages, dollar amounts, scale counts) from text.
 * Helps detect AI-hallucinated figures in rewritten bullets.
 */
export function extractMetricsFromText(text: string): string[] {
  const metricRegex = /(?:\b\d+(?:\.\d+)?%|\$\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*[kKmMbB](?:illion)?)?|\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:users|clients|customers|requests|rps|qps|services|nodes|engineers|team members|leads)\b)/gi;
  const matches = text.match(metricRegex);
  return matches ? Array.from(new Set(matches.map((m) => m.trim().toLowerCase()))) : [];
}

/**
 * Validates a tailored resume against the candidate's canonical unified profile
 * and raw extracted master resume text.
 *
 * PURE & DETERMINISTIC:
 * - Rejects hallucinated employers
 * - Rejects fabricated employment dates
 * - Rejects ungrounded projects
 * - Rejects ungrounded skills
 * - Rejects invented metrics and quantitative claims
 */
export function validateResumeTruthfulness(
  tailoredData: TailoredResumeData,
  candidate: UnifiedCandidateProfile,
  masterResumeText: string
): TruthfulnessValidationResult {
  const violations: TruthfulnessViolation[] = [];
  const normalizedResumeText = masterResumeText.toLowerCase();

  // ---------------------------------------------------------------------------
  // 1. Gather Candidate Truth Evidence
  // ---------------------------------------------------------------------------
  const candidateExperiences = [
    ...(candidate.experiences || []),
    ...(candidate.profile.profileData?.experience || []),
  ];

  const candidateEmployers = new Set<string>();
  const employerDatesMap = new Map<string, { start?: string; end?: string | null }>();

  for (const exp of candidateExperiences) {
    const norm = normalizeString(exp.company);
    if (norm) {
      candidateEmployers.add(norm);
      employerDatesMap.set(norm, {
        start: exp.startDate,
        end: exp.endDate,
      });
    }
  }

  const candidateProjects = new Set<string>();
  for (const p of candidate.projects || []) {
    const norm = normalizeString(p.name);
    if (norm) candidateProjects.add(norm);
  }
  for (const p of candidate.profile.profileData?.projects || []) {
    const norm = normalizeString(p.name);
    if (norm) candidateProjects.add(norm);
  }

  const candidateSkills = new Set<string>();
  for (const s of candidate.skills || []) {
    const norm = normalizeString(s.name);
    if (norm) candidateSkills.add(norm);
  }
  for (const exp of candidateExperiences) {
    for (const t of exp.technologies || []) {
      const norm = normalizeString(t);
      if (norm) candidateSkills.add(norm);
    }
  }
  for (const p of candidate.projects || []) {
    for (const t of [...(p.technologies || []), ...(p.languages || [])]) {
      const norm = normalizeString(t);
      if (norm) candidateSkills.add(norm);
    }
  }

  const candidateEducations = new Set<string>();
  for (const edu of candidate.education || []) {
    const norm = normalizeString(edu.institution);
    if (norm) candidateEducations.add(norm);
  }
  for (const edu of candidate.profile.profileData?.education || []) {
    const norm = normalizeString(edu.institution);
    if (norm) candidateEducations.add(norm);
  }

  // ---------------------------------------------------------------------------
  // 2. Audit Tailored Experiences & Employers
  // ---------------------------------------------------------------------------
  const verifiedCompanies: string[] = [];

  for (const exp of tailoredData.experiences) {
    const normCompany = normalizeString(exp.company);
    const inProfile = candidateEmployers.has(normCompany);
    const inRawText = normalizedResumeText.includes(exp.company.toLowerCase().trim());

    if (!inProfile && !inRawText) {
      violations.push({
        type: "HALLUCINATED_EMPLOYER",
        message: `Employer '${exp.company}' was not found in candidate master profile or verified evidence.`,
        claim: exp.company,
      });
    } else {
      verifiedCompanies.push(exp.company);

      // Verify dates if employer matches profile
      const masterDates = employerDatesMap.get(normCompany);
      if (masterDates?.start) {
        const normTailoredStart = normalizeString(exp.startDate);
        const normMasterStart = normalizeString(masterDates.start);
        if (normTailoredStart && normMasterStart && normTailoredStart !== normMasterStart) {
          // If start year doesn't match
          const startYearTailored = exp.startDate.match(/\b(19\d\d|20\d\d)\b/)?.[0];
          const startYearMaster = masterDates.start.match(/\b(19\d\d|20\d\d)\b/)?.[0];
          if (startYearTailored && startYearMaster && startYearTailored !== startYearMaster) {
            violations.push({
              type: "FABRICATED_DATES",
              message: `Employment start date for '${exp.company}' (${exp.startDate}) contradicts master evidence (${masterDates.start}).`,
              claim: `${exp.startDate} vs ${masterDates.start}`,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Audit Tailored Projects
  // ---------------------------------------------------------------------------
  for (const proj of tailoredData.projects || []) {
    const normProj = normalizeString(proj.name);
    const inProjects = candidateProjects.has(normProj);
    const inRawText = normalizedResumeText.includes(proj.name.toLowerCase().trim());

    if (!inProjects && !inRawText) {
      violations.push({
        type: "FABRICATED_PROJECT",
        message: `Project '${proj.name}' was not found in candidate verified projects or master evidence.`,
        claim: proj.name,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Audit Tailored Skills
  // ---------------------------------------------------------------------------
  for (const group of tailoredData.skills || []) {
    for (const skill of group.skills) {
      const normSkill = normalizeString(skill);
      const inSkills = candidateSkills.has(normSkill);
      const inRawText = normalizedResumeText.includes(skill.toLowerCase().trim());

      if (!inSkills && !inRawText) {
        violations.push({
          type: "UNGROUNDED_SKILL",
          message: `Skill '${skill}' is not grounded in candidate profile or master resume text.`,
          claim: skill,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Audit Metrics & Quantified Claims in Bullets
  // ---------------------------------------------------------------------------
  let auditedBulletsCount = 0;
  for (const exp of tailoredData.experiences) {
    for (const bullet of exp.bullets) {
      auditedBulletsCount++;
      const metrics = extractMetricsFromText(bullet.text);

      for (const metric of metrics) {
        const simpleNum = metric.replace(/[^0-9]/g, "");
        if (simpleNum.length >= 2) {
          // Check if metric appears in master resume text
          const appearsInResume = normalizedResumeText.includes(metric) || normalizedResumeText.includes(simpleNum);
          if (!appearsInResume) {
            violations.push({
              type: "FABRICATED_METRIC",
              message: `Quantitative claim '${metric}' in bullet point is not supported by master resume evidence.`,
              claim: bullet.text,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Audit Education
  // ---------------------------------------------------------------------------
  for (const edu of tailoredData.education || []) {
    const normEdu = normalizeString(edu.institution);
    const inEdu = candidateEducations.has(normEdu);
    const inRawText = normalizedResumeText.includes(edu.institution.toLowerCase().trim());

    if (!inEdu && !inRawText) {
      violations.push({
        type: "FABRICATED_EDUCATION",
        message: `Educational institution '${edu.institution}' is not supported by candidate evidence.`,
        claim: edu.institution,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Calculate Truthfulness Score
  // ---------------------------------------------------------------------------
  const penalty = violations.length * 20;
  const truthfulnessScore = Math.max(0, 100 - penalty);
  const isValid = violations.length === 0;

  return {
    isValid,
    truthfulnessScore,
    violations,
    auditTrail: {
      verifiedCompanies,
      verifiedSkillsCount: candidateSkills.size,
      verifiedProjectsCount: candidateProjects.size,
      auditedBulletsCount,
    },
  };
}
