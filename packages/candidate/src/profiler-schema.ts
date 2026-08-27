import { z } from "zod";
import { verificationStatusSchema, remotePreferenceSchema } from "./validation";

/**
 * Strict Zod schema for Candidate Skills.
 * Grounded in 01_build_the_system.md §4 Step 2 and 04_ai_agent_skills.md §1.
 */
export const candidateSkillSchema = z.object({
  name: z.string().min(1, "Skill name is required"),
  category: z.string().optional(),
  yearsOfExperience: z.number().nonnegative().optional(),
  status: verificationStatusSchema.default("INFERRED"),
  sourceEvidence: z.string().optional(),
});

export type CandidateSkill = z.infer<typeof candidateSkillSchema>;

/**
 * Strict Zod schema for Candidate Experience.
 */
export const candidateExperienceSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  role: z.string().min(1, "Role title is required"),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  isCurrent: z.boolean().default(false),
  description: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  status: verificationStatusSchema.default("INFERRED"),
  sourceEvidence: z.string().optional(),
});

export type CandidateExperience = z.infer<typeof candidateExperienceSchema>;

/**
 * Strict Zod schema for Candidate Education.
 */
export const candidateEducationSchema = z.object({
  institution: z.string().min(1, "Institution is required"),
  degree: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  graduationYear: z.number().int().optional(),
  status: verificationStatusSchema.default("INFERRED"),
  sourceEvidence: z.string().optional(),
});

export type CandidateEducation = z.infer<typeof candidateEducationSchema>;

/**
 * Strict Zod schema for Candidate Projects.
 */
export const candidateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  url: z.string().optional(),
  status: verificationStatusSchema.default("INFERRED"),
  sourceEvidence: z.string().optional(),
});

export type CandidateProject = z.infer<typeof candidateProjectSchema>;

/**
 * Strict Zod schema for Candidate Achievements.
 */
export const candidateAchievementSchema = z.object({
  title: z.string().min(1, "Achievement title is required"),
  description: z.string().optional(),
  status: verificationStatusSchema.default("INFERRED"),
  sourceEvidence: z.string().optional(),
});

export type CandidateAchievement = z.infer<typeof candidateAchievementSchema>;

/**
 * Strict Zod schema for Location & Remote Preferences.
 */
export const candidateLocationPreferencesSchema = z.object({
  remotePreference: remotePreferenceSchema.default("UNKNOWN"),
  explicitLocations: z.array(z.string()).default([]),
  status: verificationStatusSchema.default("INFERRED"),
  sourceEvidence: z.string().optional(),
});

export type CandidateLocationPreferences = z.infer<typeof candidateLocationPreferencesSchema>;

/**
 * Canonical Structured Candidate Profile Schema.
 * Mandated by 01_build_the_system.md §4 Step 2 and 04_ai_agent_skills.md §1 & §2.
 */
export const structuredCandidateProfileSchema = z.object({
  headline: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  technicalSkills: z.array(candidateSkillSchema).default([]),
  experience: z.array(candidateExperienceSchema).default([]),
  education: z.array(candidateEducationSchema).default([]),
  projects: z.array(candidateProjectSchema).default([]),
  achievements: z.array(candidateAchievementSchema).default([]),
  technologies: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  rolePreferences: z.array(z.string()).default([]),
  locationPreferences: candidateLocationPreferencesSchema.default({
    remotePreference: "UNKNOWN",
    explicitLocations: [],
    status: "USER_REQUIRED",
  }),
  missingInformation: z.array(z.string()).default([]),
});

export type StructuredCandidateProfile = z.infer<typeof structuredCandidateProfileSchema>;

/**
 * Client-facing input schema for profiling a resume.
 * Strict ownership enforcement: does NOT accept userId or candidateProfileId.
 */
export const profileFromResumeInputSchema = z
  .object({
    resumeId: z.string().min(1, "Resume ID is required"),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
  })
  .strict();

export type ProfileFromResumeInput = z.infer<typeof profileFromResumeInputSchema>;
