/**
 * Job Hub — Phase 7 / Step 7.3
 * Cover Letter Writer Prompt Templates
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";

export const COVER_LETTER_SYSTEM_PROMPT = `You are an expert, professional executive recruiter and technical resume advisor writing a tailored, compelling cover letter for a candidate applying to a specific role.

CRITICAL NON-NEGOTIABLE GROUNDING RULES:
1. ONLY use facts, experience, projects, skills, and metrics explicitly provided in the CANDIDATE PROFILE and MASTER RESUME.
2. DO NOT invent employers, job titles, employment dates, responsibilities, or technologies.
3. DO NOT invent percentages, revenue figures, cost savings, user scale, or quantitative metrics.
4. DO NOT invent personal connections, mutual acquaintances, or reasons for loving the company beyond public job details.
5. If specific company background is unknown, remain professionally focused on the job description and candidate capabilities.
6. The letter MUST be structured into:
   - salutation (e.g. "Dear Hiring Team at [Company],")
   - hook (engaging 1-2 sentence opening referencing the role and core value proposition)
   - bodyParagraphs (2-3 detailed paragraphs highlighting relevant experience and verified projects)
   - callToAction (confident closing sentence inviting further conversation)
   - signoff (e.g. "Sincerely,")
   - content (the complete assembled letter)
   - highlightedSkills (array of exact matching skills found in candidate profile)
   - highlightedProjects (array of exact matching projects from candidate profile)
`;

export function buildCoverLetterUserPrompt(
  candidate: UnifiedCandidateProfile,
  job: Job,
  customNotes?: string
): string {
  const candidateSummary = {
    headline: candidate.profile.headline ?? "",
    skills: candidate.skills.map((s) => ({
      name: s.name,
      status: s.status,
    })),
    experiences: candidate.experiences.map((e) => ({
      company: e.company,
      role: e.role,
      startDate: e.startDate,
      endDate: e.endDate,
      description: e.description,
      technologies: e.technologies,
    })),
    projects: candidate.projects.map((p) => ({
      name: p.name,
      description: p.description,
      technologies: p.technologies,
    })),
    education: candidate.education,
  };

  const jobSummary = {
    title: job.title,
    company: job.company,
    location: job.location,
    remoteType: job.remoteType,
    skills: job.skills,
    requirements: job.requirements,
    description: (job.description ?? "").substring(0, 3000),
  };

  return `Generate a professional, structured cover letter for this candidate and target job:

TARGET JOB:
${JSON.stringify(jobSummary, null, 2)}

CANDIDATE EVIDENCE:
${JSON.stringify(candidateSummary, null, 2)}

${customNotes ? `CANDIDATE ADDITIONAL NOTES:\n${customNotes}` : ""}

Return valid JSON adhering strictly to the required schema. Assemble the complete letter in the "content" field.`;
}
