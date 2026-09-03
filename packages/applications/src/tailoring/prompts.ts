/**
 * Job Hub — Phase 7 / Step 7.1
 * Resume Tailoring AI Prompts
 *
 * Implements non-negotiable prompt instructions enforcing candidate truthfulness.
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9
 * - 02_how_to_build.md §11
 * - 04_ai_agent_skills.md §11 ("Resume Tailoring Skill") & §23 ("Non-negotiable AI rules")
 */

import type { UnifiedCandidateProfile } from "@job-hub/candidate";
import type { Job } from "@job-hub/jobs";

export const RESUME_TAILOR_SYSTEM_PROMPT = `You are the ResumeTailor AI agent for Job Hub.
Your objective is to prepare a high-quality, targeted resume tailored for a specific job posting.

NON-NEGOTIABLE TRUTHFULNESS & GROUNDING RULES:
1. The candidate's master resume and profile evidence are IMMUTABLE truths.
2. You MAY:
   - Reorder existing sections to emphasize job relevance.
   - Select the most relevant experience entries and verified projects.
   - Emphasize matching skills and technologies that the candidate actually possesses.
   - Rewrite existing bullet points to better highlight relevant impact and technologies.
   - Tailor the professional summary headline and narrative for the target role.
3. You MUST NOT:
   - Invent employers or companies the candidate never worked for.
   - Invent or alter employment dates.
   - Invent technologies, tools, or programming languages not present in candidate evidence.
   - Invent projects the candidate never built.
   - Invent degrees or educational institutions.
   - Fabricate quantitative metrics, dollar amounts, or percentages (e.g. "boosted ARR by 40%") if not present in the source evidence.
4. If a required job qualification is missing from candidate evidence, DO NOT invent it.
5. Every bullet point must cite its source company and highlight truthfully matching skills.

Produce a structured, schema-compliant JSON response.`;

export function buildResumeTailorUserPrompt(params: {
  candidate: UnifiedCandidateProfile;
  masterResumeText: string;
  job: Job;
  targetTitle?: string;
  userInstructions?: string;
}): string {
  const { candidate, masterResumeText, job, targetTitle, userInstructions } = params;

  const candidateProfile = candidate.profile;
  const verifiedProjects = candidate.projects.map((p) => ({
    name: p.name,
    description: p.description,
    technologies: p.technologies,
    languages: p.languages,
    url: p.url,
  }));

  const candidateExperiences = (candidate.experiences || []).map((e) => ({
    company: e.company,
    role: e.role,
    startDate: e.startDate,
    endDate: e.endDate,
    isCurrent: e.isCurrent,
    description: e.description,
    technologies: e.technologies,
  }));

  return `### TARGET JOB OPPORTUNITY
Title: ${targetTitle || job.title}
Company: ${job.company}
Location: ${job.location || "Not specified"}
Remote Policy: ${job.remoteType || "UNKNOWN"}
Required Skills & Keywords: ${JSON.stringify(job.skills || [])}
Requirements: ${JSON.stringify(job.requirements || [])}
Job Description:
${job.description || "No description provided."}

---

### CANDIDATE VERIFIED EVIDENCE
Candidate Name: ${candidateProfile.headline || "Candidate"}
Portfolio: ${candidateProfile.portfolioUrl || "N/A"}
LinkedIn: ${candidateProfile.linkedinUrl || "N/A"}

Verified Skills in Profile:
${JSON.stringify((candidate.skills || []).map((s) => s.name))}

Verified Experience Records:
${JSON.stringify(candidateExperiences, null, 2)}

Verified Projects (Code & Repository Evidence):
${JSON.stringify(verifiedProjects, null, 2)}

Education Records:
${JSON.stringify(candidate.education || [], null, 2)}

Master Resume Full Text (Authoritative Evidence):
"""
${masterResumeText}
"""

${userInstructions ? `User Custom Instructions:\n${userInstructions}\n` : ""}

Generate a tailored resume matching the target job description based solely on the verified candidate facts above.`;
}
