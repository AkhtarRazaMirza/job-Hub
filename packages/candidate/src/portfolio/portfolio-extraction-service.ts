import type { AiProvider } from "@job-hub/ai";
import { defaultAiProvider } from "@job-hub/ai";
import type {
  PortfolioCrawler,
  PortfolioExtractionResult,
  PortfolioProjectDraft,
} from "./types";
import { HttpPortfolioCrawler } from "./http-crawler";
import {
  portfolioExtractionSchema,
  type PortfolioExtraction,
} from "./portfolio-schema";

export class PortfolioExtractionService {
  constructor(
    private readonly crawler: PortfolioCrawler = new HttpPortfolioCrawler(),
    private readonly aiProvider: AiProvider = defaultAiProvider
  ) {}

  /**
   * Crawls a portfolio site and extracts structured project information using AI.
   * Grounded in 02_how_to_build.md §3 and 04_ai_agent_skills.md §4.
   *
   * TRUTHFULNESS INVARIANT (04_ai_agent_skills.md §2):
   * Portfolio claims are self-reported website descriptions without independent repository/code proof.
   * Therefore, all extracted portfolio projects are strictly assigned "INFERRED" status.
   */
  async extractPortfolio(portfolioUrl: string): Promise<PortfolioExtractionResult> {
    // 1. Controlled crawl of the portfolio URL
    const crawlResult = await this.crawler.crawl(portfolioUrl);

    // 2. Perform AI structured extraction
    let extraction: PortfolioExtraction;
    try {
      const systemPrompt = `You are the Job Hub Portfolio Extraction Engine.
Analyze the provided portfolio webpage text strictly following 04_ai_agent_skills.md §4:
- Extract project summaries, links, role descriptions, technologies, and case studies.
- Do NOT invent projects, metrics, or technologies not present in the webpage text.
- If information is missing, use null or empty array.
- Return structured output conforming to the schema.`;

      const userPrompt = `Portfolio URL: ${crawlResult.url}
Page Title: ${crawlResult.title || "None"}
Page Description: ${crawlResult.description || "None"}
Found Links:
${crawlResult.links.join("\n") || "None"}

Extracted Webpage Content:
${crawlResult.extractedText || "No visible text extracted."}`;

      extraction = await this.aiProvider.generateStructuredOutput<PortfolioExtraction>({
        schema: portfolioExtractionSchema,
        schemaName: "portfolioExtraction",
        systemPrompt,
        userPrompt,
      });
    } catch {
      // Deterministic fallback if AI provider is unconfigured
      extraction = {
        candidateHeadline: crawlResult.title || null,
        candidateSummary: crawlResult.description || null,
        detectedSkills: [],
        projects: crawlResult.title
          ? [
              {
                name: crawlResult.title,
                description: crawlResult.description || "Extracted from portfolio site.",
                url: crawlResult.url,
                roleDescription: null,
                technologies: [],
                caseStudySummary: null,
              },
            ]
          : [],
      };
    }

    // 3. Map extracted projects with mandatory INFERRED verification status
    const mappedProjects: PortfolioProjectDraft[] = extraction.projects.map((p) => ({
      name: p.name,
      description: p.description,
      url: p.url,
      roleDescription: p.roleDescription,
      technologies: p.technologies,
      caseStudySummary: p.caseStudySummary,
      verificationStatus: "INFERRED", // TRUTHFULNESS: Portfolio claims are unverified inference!
    }));

    return {
      portfolioUrl: crawlResult.url,
      candidateHeadline: extraction.candidateHeadline,
      candidateSummary: extraction.candidateSummary,
      detectedSkills: extraction.detectedSkills,
      projects: mappedProjects,
    };
  }
}

export const portfolioExtractionService = new PortfolioExtractionService();
