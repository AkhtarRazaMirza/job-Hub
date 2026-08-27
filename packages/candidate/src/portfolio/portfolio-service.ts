import { eq } from "drizzle-orm";
import { db as defaultDb, candidateProfiles, type Database } from "@job-hub/db";
import type { CandidateProfileRepository } from "../types";
import { DrizzleCandidateProfileRepository } from "../repository";
import type { Project, ProjectsRepository } from "../project-types";
import { DrizzleProjectsRepository } from "../project-repository";
import {
  PortfolioExtractionService,
  portfolioExtractionService,
} from "./portfolio-extraction-service";
import type { PortfolioExtractionResult } from "./types";
import {
  confirmPortfolioProjectsInputSchema,
  type ConfirmPortfolioProjectsInput,
} from "./portfolio-validation";
import {
  CandidateProfileNotFoundError,
  CandidateProfileValidationError,
} from "../errors";

export class CandidatePortfolioService {
  constructor(
    private readonly profileRepository: CandidateProfileRepository = new DrizzleCandidateProfileRepository(),
    private readonly projectsRepository: ProjectsRepository = new DrizzleProjectsRepository(),
    private readonly extractionService: PortfolioExtractionService = portfolioExtractionService,
    private readonly db: Database = defaultDb
  ) {}

  /**
   * Crawls a candidate's portfolio site and extracts structured project information using AI.
   * Grounded in 02_how_to_build.md §3: "Portfolio URL -> Controlled fetch/crawl -> Extract project info -> AI structure".
   * Derives candidate identity strictly from userId.
   * Returns analysis draft for candidate review. Nothing is saved until confirmed by user.
   */
  async crawlAndExtractPortfolio(
    userId: string,
    portfolioUrl: string
  ): Promise<PortfolioExtractionResult> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found.");
    }

    return await this.extractionService.extractPortfolio(portfolioUrl);
  }

  /**
   * Confirms and persists user-selected portfolio projects to PostgreSQL.
   * Grounded in 02_how_to_build.md §3: "User confirmation -> Save".
   *
   * TRUTHFULNESS RULE (04_ai_agent_skills.md §2):
   * Facts derived from a portfolio website without repository proof are self-reported claims.
   * Confirmed portfolio projects are saved with verificationStatus "USER_PROVIDED" (or "INFERRED"),
   * NEVER "VERIFIED".
   */
  async confirmPortfolioProjects(
    userId: string,
    rawInput: unknown
  ): Promise<Project[]> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found.");
    }

    const validation = confirmPortfolioProjectsInputSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new CandidateProfileValidationError(
        `Invalid portfolio confirmation input: ${validation.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    const data: ConfirmPortfolioProjectsInput = validation.data;

    // 1. Update candidate profile with portfolioUrl
    await this.db
      .update(candidateProfiles)
      .set({
        portfolioUrl: data.portfolioUrl,
        updatedAt: new Date(),
      })
      .where(eq(candidateProfiles.id, profile.id));

    // 2. Persist each confirmed portfolio project
    const createdProjects: Project[] = [];
    for (const p of data.projects) {
      const created = await this.projectsRepository.create({
        candidateProfileId: profile.id,
        name: p.name,
        description: p.description ?? null,
        url: p.url ?? null,
        technologies: p.technologies,
        architectureEvidence: p.caseStudySummary ?? null,
        qualityNotes: p.roleDescription ? `Role: ${p.roleDescription}` : null,
        source: "PORTFOLIO",
        verificationStatus: "USER_PROVIDED", // Self-reported portfolio claim confirmed by user; NOT VERIFIED!
        confirmedByUser: true,
      });
      createdProjects.push(created);
    }

    return createdProjects;
  }
}

export const candidatePortfolioService = new CandidatePortfolioService();
