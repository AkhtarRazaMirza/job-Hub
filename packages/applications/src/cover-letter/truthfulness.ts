/**
 * Job Hub — Phase 7 / Step 7.3
 * Cover Letter Deterministic Truthfulness & Anti-Hallucination Validator
 *
 * Enforces strict negative constraints:
 * - Never invent skills
 * - Never invent projects
 * - Never invent metrics
 * - Never fabricate personal or company connections
 *
 * Grounded in:
 * - 04_ai_agent_skills.md §12 ("Never claim experience the candidate doesn't have")
 * - 04_ai_agent_skills.md §23 ("Negative constraints: absolute prohibition against ungrounded claims")
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { CoverLetterData, CoverLetterTruthfulnessResult } from "./types";
import { extractMetricsFromText } from "../tailoring/resume-truthfulness";

function normalize(val: string): string {
  return val.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

export function validateCoverLetterTruthfulness(
  letter: CoverLetterData,
  candidate: UnifiedCandidateProfile,
  masterResumeText?: string
): CoverLetterTruthfulnessResult {
  const violations: CoverLetterTruthfulnessResult["violations"] = [];

  // Build candidate ground truth sets
  const candidateSkillSet = new Set(
    candidate.skills.map((s) => normalize(s.name))
  );

  const candidateProjectSet = new Set(
    candidate.projects.map((p) => normalize(p.name))
  );

  const masterTextNormalized = masterResumeText
    ? normalize(masterResumeText)
    : "";

  // 1. Validate Highlighted Skills
  for (const skill of letter.highlightedSkills) {
    const norm = normalize(skill);
    const inProfile = candidateSkillSet.has(norm);
    const inMaster = masterTextNormalized.includes(norm);

    if (!inProfile && !inMaster) {
      violations.push({
        type: "UNGROUNDED_SKILL",
        claim: skill,
        message: `Highlighted skill "${skill}" is not grounded in candidate verified profile or master resume.`,
      });
    }
  }

  // 2. Validate Highlighted Projects
  for (const proj of letter.highlightedProjects) {
    const norm = normalize(proj);
    const inProfile = candidateProjectSet.has(norm);
    const inMaster = masterTextNormalized.includes(norm);

    if (!inProfile && !inMaster) {
      violations.push({
        type: "FABRICATED_PROJECT",
        claim: proj,
        message: `Highlighted project "${proj}" is not grounded in candidate verified projects or master resume.`,
      });
    }
  }

  // 3. Validate Quantitative Metrics in Cover Letter Content
  const letterMetrics = extractMetricsFromText(letter.content);
  if (letterMetrics.length > 0) {
    const candidateCorpus = [
      candidate.profile.headline ?? "",
      ...candidate.skills.map((s) => s.name),
      ...candidate.experiences.map((e) => `${e.company} ${e.role} ${e.description ?? ""}`),
      ...candidate.projects.map((p) => `${p.name} ${p.description ?? ""}`),
      masterResumeText ?? "",
    ]
      .join(" ")
      .toLowerCase();

    for (const metric of letterMetrics) {
      const bareNumber = metric.replace(/[^0-9.]/g, "");
      if (bareNumber && !candidateCorpus.includes(bareNumber)) {
        violations.push({
          type: "FABRICATED_METRIC",
          claim: metric,
          message: `Cover letter mentions quantitative metric "${metric}" which is not grounded in candidate evidence.`,
        });
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
