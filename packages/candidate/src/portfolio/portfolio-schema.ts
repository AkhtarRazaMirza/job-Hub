import { z } from "zod";

/**
 * Zod schema for structured portfolio extraction.
 * Grounded in 04_ai_agent_skills.md §4 (Portfolio Extraction Skill).
 */
export const portfolioProjectSchema = z.object({
  name: z.string().describe("Name of the project as described on the portfolio site."),
  description: z.string().nullable().describe("Factual summary of what the project does."),
  url: z.string().nullable().describe("Direct link to live project demo, deployment, or repository if found."),
  roleDescription: z.string().nullable().describe("Candidate's role or contributions on the project."),
  technologies: z.array(z.string()).describe("Technologies, tools, and frameworks mentioned with the project."),
  caseStudySummary: z.string().nullable().describe("Summary of the problem, architectural decisions, and outcomes."),
});

export const portfolioExtractionSchema = z.object({
  candidateHeadline: z.string().nullable().describe("Candidate's headline or professional title on the portfolio."),
  candidateSummary: z.string().nullable().describe("High-level summary or bio presented on the portfolio."),
  detectedSkills: z.array(z.string()).describe("Skills, languages, and competencies listed on the portfolio site."),
  projects: z.array(portfolioProjectSchema).describe("List of portfolio projects extracted from the site."),
});

export type PortfolioExtraction = z.infer<typeof portfolioExtractionSchema>;
