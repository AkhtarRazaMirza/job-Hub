import { z } from "zod";

export const crawlPortfolioInputSchema = z
  .object({
    portfolioUrl: z.string().min(1, "Portfolio URL is required"),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z
      .never({ invalid_type_error: "candidateProfileId cannot be client-supplied" })
      .optional(),
  })
  .strict();

export const confirmPortfolioProjectItemSchema = z
  .object({
    name: z.string().min(1, "Project name is required"),
    description: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    roleDescription: z.string().nullable().optional(),
    technologies: z.array(z.string()).default([]),
    caseStudySummary: z.string().nullable().optional(),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z
      .never({ invalid_type_error: "candidateProfileId cannot be client-supplied" })
      .optional(),
    id: z.never({ invalid_type_error: "id cannot be client-supplied" }).optional(),
  })
  .strict();

export const confirmPortfolioProjectsInputSchema = z
  .object({
    portfolioUrl: z.string().min(1, "Portfolio URL is required"),
    projects: z.array(confirmPortfolioProjectItemSchema).min(1, "At least one project must be confirmed"),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z
      .never({ invalid_type_error: "candidateProfileId cannot be client-supplied" })
      .optional(),
  })
  .strict();

export type CrawlPortfolioInput = z.infer<typeof crawlPortfolioInputSchema>;
export type ConfirmPortfolioProjectItem = z.infer<typeof confirmPortfolioProjectItemSchema>;
export type ConfirmPortfolioProjectsInput = z.infer<typeof confirmPortfolioProjectsInputSchema>;
