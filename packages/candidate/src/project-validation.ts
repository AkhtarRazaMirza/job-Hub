import { z } from "zod";

export const analyzeGitHubRepoInputSchema = z
  .object({
    repositoryUrl: z.string().min(1, "Repository URL or shorthand (owner/repo) is required"),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z
      .never({ invalid_type_error: "candidateProfileId cannot be client-supplied" })
      .optional(),
  })
  .strict();

export const confirmProjectInputSchema = z
  .object({
    name: z.string().min(1, "Project name is required"),
    description: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    repositoryUrl: z.string().nullable().optional(),
    primaryLanguage: z.string().nullable().optional(),
    languages: z.array(z.string()).default([]),
    technologies: z.array(z.string()).default([]),
    architectureEvidence: z.string().nullable().optional(),
    qualityNotes: z.string().nullable().optional(),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z
      .never({ invalid_type_error: "candidateProfileId cannot be client-supplied" })
      .optional(),
    id: z.never({ invalid_type_error: "id cannot be client-supplied" }).optional(),
  })
  .strict();

export const deleteProjectInputSchema = z
  .object({
    id: z.string().min(1, "Project ID is required"),
  })
  .strict();

export type AnalyzeGitHubRepoInput = z.infer<typeof analyzeGitHubRepoInputSchema>;
export type ConfirmProjectInput = z.infer<typeof confirmProjectInputSchema>;
export type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>;
