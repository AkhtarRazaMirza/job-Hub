/**
 * Portfolio Ingestion & Crawling Domain Types
 * Grounded in 01_build_the_system.md §4 Step 1, 02_how_to_build.md §3, and 04_ai_agent_skills.md §4.
 */

import type { VerificationStatus } from "../types";

export interface PortfolioCrawlResult {
  url: string;
  title?: string | null;
  description?: string | null;
  extractedText: string;
  links: string[];
}

export interface PortfolioProjectDraft {
  name: string;
  description: string | null;
  url: string | null;
  roleDescription: string | null;
  technologies: string[];
  caseStudySummary: string | null;
  verificationStatus: VerificationStatus; // "INFERRED" per truthfulness rules!
}

export interface PortfolioExtractionResult {
  portfolioUrl: string;
  candidateHeadline?: string | null;
  candidateSummary?: string | null;
  detectedSkills: string[];
  projects: PortfolioProjectDraft[];
}

export interface PortfolioCrawler {
  crawl(url: string): Promise<PortfolioCrawlResult>;
}

export class PortfolioError extends Error {
  constructor(message: string, public readonly code: string = "PORTFOLIO_ERROR") {
    super(message);
    this.name = "PortfolioError";
  }
}

export class PortfolioSecurityError extends PortfolioError {
  constructor(message: string = "Security violation: disallowed URL or host.") {
    super(message, "SSRF_DISALLOWED");
    this.name = "PortfolioSecurityError";
  }
}

export class PortfolioTimeoutError extends PortfolioError {
  constructor(message: string = "Portfolio crawling timed out.") {
    super(message, "TIMEOUT");
    this.name = "PortfolioTimeoutError";
  }
}

export class PortfolioSizeLimitError extends PortfolioError {
  constructor(message: string = "Portfolio page exceeds maximum allowed size (2 MB).") {
    super(message, "PAYLOAD_TOO_LARGE");
    this.name = "PortfolioSizeLimitError";
  }
}
