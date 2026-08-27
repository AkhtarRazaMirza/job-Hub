import { z } from "zod";

/**
 * Zod schema for structured repository analysis output.
 * Grounded in 04_ai_agent_skills.md §3 (GitHub Analysis Skill).
 */
export const gitHubRepoAnalysisSchema = z.object({
  technologies: z
    .array(z.string())
    .describe("Specific technologies, libraries, databases, and frameworks detected in the repository."),
  architectureEvidence: z
    .string()
    .describe("Architectural patterns, structure, and design evidence found in the documentation/code."),
  qualityNotes: z
    .string()
    .describe("Assessment of testing, documentation quality, production patterns, and complexity."),
  summary: z
    .string()
    .describe("Brief factual summary of the project's purpose and functionality."),
});

export type GitHubRepoAnalysis = z.infer<typeof gitHubRepoAnalysisSchema>;
