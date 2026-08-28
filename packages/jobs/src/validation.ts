import { z } from "zod";
import {
  REMOTE_TYPES,
  JOB_STATUSES,
  JOB_SOURCE_TYPES,
} from "./types";

/**
 * Zod schema for RemoteType.
 * Grounded in 04_ai_agent_skills.md §6.
 */
export const remoteTypeSchema = z.enum(REMOTE_TYPES);

/**
 * Zod schema for JobStatus.
 * Grounded in 01_build_the_system.md §4 Step 5.
 */
export const jobStatusSchema = z.enum(JOB_STATUSES);

/**
 * Zod schema for JobSourceType.
 * Grounded in 01_build_the_system.md §4 Step 3 and 02_how_to_build.md §5.
 */
export const jobSourceTypeSchema = z.enum(JOB_SOURCE_TYPES);

/**
 * URL validation helper enforcing valid HTTP/HTTPS URL syntax.
 */
export const httpUrlSchema = z
  .string()
  .url("Must be a valid URL")
  .refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "URL must start with http:// or https://"
  );

/**
 * Strict Zod schema for JobSource entity.
 */
export const jobSourceSchema = z.object({
  id: z.string().min(1, "Job source ID is required"),
  name: z.string().min(1, "Job source name is required").max(100, "Name too long"),
  type: jobSourceTypeSchema,
  url: httpUrlSchema.nullable().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Input schema for creating a JobSource.
 * Rejects unknown fields with .strict().
 */
export const createJobSourceInputSchema = z
  .object({
    id: z.string().min(1, "Job source ID cannot be empty").optional(),
    name: z.string().min(1, "Job source name is required").max(100, "Name too long"),
    type: jobSourceTypeSchema,
    url: httpUrlSchema.nullable().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateJobSourceSchemaInput = z.infer<typeof createJobSourceInputSchema>;

/**
 * Input schema for updating a JobSource.
 * Rejects unknown fields with .strict().
 */
export const updateJobSourceInputSchema = z
  .object({
    name: z.string().min(1, "Job source name cannot be empty").max(100, "Name too long").optional(),
    type: jobSourceTypeSchema.optional(),
    url: httpUrlSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateJobSourceSchemaInput = z.infer<typeof updateJobSourceInputSchema>;

/**
 * Strict Zod schema for canonical Job domain entity.
 * Grounded in 02_how_to_build.md §6.
 */
export const jobSchema = z.object({
  id: z.string().min(1, "Job ID is required"),
  source: z.string().min(1, "Source identifier is required").max(100),
  sourceJobId: z.string().nullable().optional(),
  jobSourceId: z.string().nullable().optional(),
  canonicalUrl: httpUrlSchema.nullable().optional(),
  title: z.string().min(1, "Job title is required").max(255, "Title too long"),
  company: z.string().min(1, "Company name is required").max(255, "Company name too long"),
  location: z.string().nullable().optional(),
  remoteType: remoteTypeSchema.default("UNKNOWN"),
  allowedCountries: z.array(z.string()).default([]),
  salary: z.number().int("Salary must be an integer").nonnegative("Salary cannot be negative").nullable().optional(),
  salaryMin: z.number().int("Minimum salary must be an integer").nonnegative("Minimum salary cannot be negative").nullable().optional(),
  salaryMax: z.number().int("Maximum salary must be an integer").nonnegative("Maximum salary cannot be negative").nullable().optional(),
  currency: z.string().min(1).max(10).nullable().optional().default("USD"),
  experience: z.string().nullable().optional(),
  skills: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  description: z.string().nullable().optional(),
  applicationUrl: httpUrlSchema,
  status: jobStatusSchema.default("ACTIVE"),
  postedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Strict Zod schema for creating a Job.
 * Rejects unknown fields with .strict().
 */
export const createJobInputSchema = z
  .object({
    id: z.string().min(1, "Job ID cannot be empty").optional(),
    source: z.string().min(1, "Source identifier is required").max(100),
    sourceJobId: z.string().nullable().optional(),
    jobSourceId: z.string().nullable().optional(),
    canonicalUrl: httpUrlSchema.nullable().optional(),
    title: z.string().min(1, "Job title is required").max(255, "Title too long"),
    company: z.string().min(1, "Company name is required").max(255, "Company name too long"),
    location: z.string().nullable().optional(),
    remoteType: remoteTypeSchema.optional().default("UNKNOWN"),
    allowedCountries: z.array(z.string()).optional().default([]),
    salary: z.number().int("Salary must be an integer").nonnegative("Salary cannot be negative").nullable().optional(),
    salaryMin: z.number().int("Minimum salary must be an integer").nonnegative("Minimum salary cannot be negative").nullable().optional(),
    salaryMax: z.number().int("Maximum salary must be an integer").nonnegative("Maximum salary cannot be negative").nullable().optional(),
    currency: z.string().min(1).max(10).nullable().optional().default("USD"),
    experience: z.string().nullable().optional(),
    skills: z.array(z.string()).optional().default([]),
    requirements: z.array(z.string()).optional().default([]),
    description: z.string().nullable().optional(),
    applicationUrl: httpUrlSchema,
    status: jobStatusSchema.optional().default("ACTIVE"),
    postedAt: z.coerce.date().nullable().optional(),
  })
  .strict();

export type CreateJobSchemaInput = z.infer<typeof createJobInputSchema>;

/**
 * Strict Zod schema for updating a Job.
 * Rejects unknown fields with .strict().
 */
export const updateJobInputSchema = z
  .object({
    source: z.string().min(1).max(100).optional(),
    sourceJobId: z.string().nullable().optional(),
    jobSourceId: z.string().nullable().optional(),
    canonicalUrl: httpUrlSchema.nullable().optional(),
    title: z.string().min(1).max(255).optional(),
    company: z.string().min(1).max(255).optional(),
    location: z.string().nullable().optional(),
    remoteType: remoteTypeSchema.optional(),
    allowedCountries: z.array(z.string()).optional(),
    salary: z.number().int().nonnegative().nullable().optional(),
    salaryMin: z.number().int().nonnegative().nullable().optional(),
    salaryMax: z.number().int().nonnegative().nullable().optional(),
    currency: z.string().min(1).max(10).nullable().optional(),
    experience: z.string().nullable().optional(),
    skills: z.array(z.string()).optional(),
    requirements: z.array(z.string()).optional(),
    description: z.string().nullable().optional(),
    applicationUrl: httpUrlSchema.optional(),
    status: jobStatusSchema.optional(),
    postedAt: z.coerce.date().nullable().optional(),
  })
  .strict();

export type UpdateJobSchemaInput = z.infer<typeof updateJobInputSchema>;
