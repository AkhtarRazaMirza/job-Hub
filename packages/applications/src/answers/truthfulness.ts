/**
 * Job Hub — Phase 7 / Step 7.4
 * Application Answers Truthfulness & Cautionary Rule Validator
 *
 * Grounded in:
 * - 04_ai_agent_skills.md §13 ("Confidence levels: VERIFIED, INFERRED, USER_REQUIRED")
 * - 04_ai_agent_skills.md §23 ("Negative constraints: never guess or hallucinate on cautionary questions")
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { ApplicationAnswerItem, AnswersTruthfulnessResult } from "./types";

const SENSITIVE_TOPIC_REGEX =
  /(visa|sponsorship|authorized to work|work authorization|citizenship|green card|salary|compensation|relocat|notice period|earliest start|start date|criminal|felony|background check|clearance|disability|veteran|demographic|gender|race)/i;

/**
 * Validates that application answers obey non-negotiable confidence rules.
 * Never silently converts USER_REQUIRED fields to definitive answers.
 */
export function validateApplicationAnswersTruthfulness(
  answers: ApplicationAnswerItem[],
  candidate: UnifiedCandidateProfile
): AnswersTruthfulnessResult {
  const violations: AnswersTruthfulnessResult["violations"] = [];

  for (const item of answers) {
    const isSensitive = SENSITIVE_TOPIC_REGEX.test(item.question);

    // If the question involves visa, salary, relocation, notice period, legal status:
    if (isSensitive) {
      // Check if candidate has an explicit preference set (e.g. salary expectation in preferences)
      const hasExplicitSalary =
        /salary|compensation/i.test(item.question) &&
        Boolean(candidate.preferences?.salaryMin);

      const hasExplicitLocation =
        /relocat/i.test(item.question) &&
        candidate.preferences?.remotePreference !== undefined &&
        candidate.preferences?.remotePreference !== "UNKNOWN";

      // If no explicit candidate setting, MUST be USER_REQUIRED
      if (
        !hasExplicitSalary &&
        !hasExplicitLocation &&
        item.confidence !== "USER_REQUIRED"
      ) {
        violations.push({
          question: item.question,
          violationType: "UNAUTHORIZED_CONFIDENCE",
          message: `Cautionary question regarding "${item.question}" cannot be answered definitively as ${item.confidence}. It requires explicit candidate confirmation (USER_REQUIRED).`,
        });
      }
    }

    // If confidence is VERIFIED, evidence reasoning or source must be provided
    if (item.confidence === "VERIFIED" && (!item.sourceEvidence || item.sourceEvidence.trim().length === 0)) {
      violations.push({
        question: item.question,
        violationType: "MISSING_EVIDENCE",
        message: `Answer marked as VERIFIED for "${item.question}" must specify source evidence.`,
      });
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
