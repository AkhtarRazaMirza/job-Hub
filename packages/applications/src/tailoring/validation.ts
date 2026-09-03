/**
 * Job Hub — Phase 7 / Step 7.1
 * Tailored Resume Domain Validation Schemas
 *
 * Strict Zod validation ensuring well-structured outputs and input hygiene.
 */

import { z } from "zod";
import { TAILORED_RESUME_STATUS } from "./types";

export const tailoredResumeStatusSchema = z.enum([
  TAILORED_RESUME_STATUS.DRAFT,
  TAILORED_RESUME_STATUS.GENERATED,
  TAILORED_RESUME_STATUS.APPROVED,
]);

export const tailoredContactInfoSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedinUrl: z.string().url("Valid LinkedIn URL required").optional(),
    portfolioUrl: z.string().url("Valid Portfolio URL required").optional(),
    githubUrl: z.string().url("Valid GitHub URL required").optional(),
  })
  .strict();

export const tailoredSummarySchema = z
  .object({
    headline: z.string().min(1, "Summary headline is required"),
    text: z.string().min(20, "Summary text must provide meaningful context"),
    keyThemes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const tailoredBulletSchema = z
  .object({
    text: z.string().min(10, "Bullet must contain descriptive content"),
    sourceCompany: z.string().min(1, "Source company provenance is required"),
    matchingSkills: z.array(z.string()).default([]),
    confidence: z.enum(["VERIFIED", "INFERRED"]).default("VERIFIED"),
  })
  .strict();

export const tailoredExperienceSchema = z
  .object({
    company: z.string().min(1, "Company name is required"),
    role: z.string().min(1, "Role title is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().nullable().optional(),
    isCurrent: z.boolean().default(false),
    location: z.string().optional(),
    bullets: z.array(tailoredBulletSchema).min(1, "At least one bullet point required"),
    technologies: z.array(z.string()).default([]),
  })
  .strict();

export const tailoredProjectSchema = z
  .object({
    name: z.string().min(1, "Project name is required"),
    description: z.string().min(10, "Project description is required"),
    technologies: z.array(z.string()).default([]),
    repositoryUrl: z.string().url("Valid repository URL required").optional(),
    liveUrl: z.string().url("Valid live URL required").optional(),
    highlight: z.string().min(1, "Project highlight is required"),
    sourceProjectId: z.string().optional(),
  })
  .strict();

export const tailoredSkillGroupSchema = z
  .object({
    category: z.string().min(1, "Skill category is required"),
    skills: z.array(z.string().min(1)).min(1, "At least one skill per category"),
  })
  .strict();

export const tailoredEducationSchema = z
  .object({
    institution: z.string().min(1, "Educational institution is required"),
    degree: z.string().optional(),
    fieldOfStudy: z.string().optional(),
    graduationYear: z.number().int().optional(),
  })
  .strict();

export const tailoredResumeDataSchema = z
  .object({
    contact: tailoredContactInfoSchema,
    targetTitle: z.string().min(1, "Target job title is required"),
    summary: tailoredSummarySchema,
    skills: z.array(tailoredSkillGroupSchema).min(1, "At least one skill group required"),
    experiences: z.array(tailoredExperienceSchema).min(1, "At least one experience required"),
    projects: z.array(tailoredProjectSchema).default([]),
    education: z.array(tailoredEducationSchema).default([]),
    strengths: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const tailorResumeClientInputSchema = z
  .object({
    jobId: z.string().min(1, "Job ID is required"),
    sourceResumeId: z.string().optional(),
    targetTitle: z.string().optional(),
    userInstructions: z.string().max(1000).optional(),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
  })
  .strict();
