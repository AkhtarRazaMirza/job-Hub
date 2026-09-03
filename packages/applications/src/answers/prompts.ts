/**
 * Job Hub — Phase 7 / Step 7.4
 * Application Answerer Prompt Templates
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";

export const APPLICATION_ANSWERER_SYSTEM_PROMPT = `You are a careful, truthful technical application assistant generating responses for application questions based solely on candidate evidence.

CONFIDENCE RULES (MANDATORY):
- "VERIFIED": Directly and unambiguously supported by candidate profile, resume facts, verified skills, or verified experiences. You must include the exact source in sourceEvidence.
- "INFERRED": A reasonable interpretation based on evidence, but not explicitly stated (e.g., total years calculated from verified employment history).
- "USER_REQUIRED": Use whenever the question involves:
  * Work authorization, visa sponsorship, citizenship
  * Desired salary, compensation expectations
  * Relocation willingness
  * Notice period, earliest start date
  * Criminal background, security clearance
  * Demographic/diversity/EEO questions
  * Any question where candidate evidence does not provide explicit facts.
  DO NOT GUESS. Never fabricate answers for USER_REQUIRED questions. Indicate that candidate input is required.

Return structured JSON containing an array of objects matching the required schema.`;

export function buildAnswersUserPrompt(
  candidate: UnifiedCandidateProfile,
  job: Job,
  questions: string[]
): string {
  const candidateData = {
    headline: candidate.profile.headline,
    preferredLocations: candidate.preferences?.preferredLocations ?? [],
    skills: candidate.skills.map((s) => ({ name: s.name, status: s.status })),
    experiences: candidate.experiences.map((e) => ({
      company: e.company,
      role: e.role,
      startDate: e.startDate,
      endDate: e.endDate,
      technologies: e.technologies,
    })),
    education: candidate.education,
    preferences: candidate.preferences,
  };

  return `Answer the following application questions for candidate applying to ${job.title} at ${job.company}:

QUESTIONS TO ANSWER:
${JSON.stringify(questions, null, 2)}

CANDIDATE EVIDENCE:
${JSON.stringify(candidateData, null, 2)}

Produce JSON matching the required schema. Ensure every sensitive topic is strictly tagged as USER_REQUIRED.`;
}
