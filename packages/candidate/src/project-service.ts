import type { CandidateProfileRepository } from "./types";
import { DrizzleCandidateProfileRepository } from "./repository";
import type { Project, ProjectsRepository } from "./project-types";
import { DrizzleProjectsRepository } from "./project-repository";
import { GitHubAnalysisService, gitHubAnalysisService } from "./github/github-analysis-service";
import type { GitHubAnalysisResult } from "./github/types";
import {
  confirmProjectInputSchema,
  type ConfirmProjectInput,
} from "./project-validation";
import {
  CandidateProfileNotFoundError,
  CandidateProfileValidationError,
  ResumeForbiddenError,
} from "./errors";

export class CandidateProjectService {
  constructor(
    private readonly profileRepository: CandidateProfileRepository = new DrizzleCandidateProfileRepository(),
    private readonly projectsRepository: ProjectsRepository = new DrizzleProjectsRepository(),
    private readonly analysisService: GitHubAnalysisService = gitHubAnalysisService
  ) {}

  /**
   * Analyzes a candidate's GitHub repository.
   * Derives candidate identity strictly from userId.
   * Returns analysis draft for candidate review and confirmation.
   * Grounded in 02_how_to_build.md §3: "Analyze README/languages/metadata -> User confirms -> Save".
   */
  async analyzeGitHubRepository(
    userId: string,
    repositoryUrlOrId: string
  ): Promise<GitHubAnalysisResult> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found.");
    }

    return await this.analysisService.analyzeRepository({
      repositoryUrlOrId,
    });
  }

  /**
   * Saves a user-confirmed verified project to PostgreSQL.
   * Enforces server-derived ownership.
   */
  async confirmAndSaveProject(
    userId: string,
    rawInput: unknown
  ): Promise<Project> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found.");
    }

    const validation = confirmProjectInputSchema.safeParse(rawInput);
    if (!validation.success) {
      throw new CandidateProfileValidationError(
        `Invalid project input: ${validation.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    const data: ConfirmProjectInput = validation.data;

    return await this.projectsRepository.create({
      candidateProfileId: profile.id,
      name: data.name,
      description: data.description ?? null,
      url: data.url ?? null,
      repositoryUrl: data.repositoryUrl ?? null,
      primaryLanguage: data.primaryLanguage ?? null,
      languages: data.languages,
      technologies: data.technologies,
      architectureEvidence: data.architectureEvidence ?? null,
      qualityNotes: data.qualityNotes ?? null,
      source: "GITHUB",
      verificationStatus: "VERIFIED", // Code & repo proof established!
      confirmedByUser: true,
    });
  }

  /**
   * Lists all projects for the authenticated candidate.
   */
  async listProjects(userId: string): Promise<Project[]> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found.");
    }

    return await this.projectsRepository.findByProfileId(profile.id);
  }

  /**
   * Deletes a candidate's project.
   * Verifies strict candidate ownership.
   */
  async deleteProject(userId: string, projectId: string): Promise<boolean> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new CandidateProfileNotFoundError("Candidate profile not found.");
    }

    const project = await this.projectsRepository.findById(projectId);
    if (!project) {
      return false;
    }

    if (project.candidateProfileId !== profile.id) {
      throw new ResumeForbiddenError("You do not have permission to delete this project.");
    }

    return await this.projectsRepository.delete(projectId);
  }
}

export const candidateProjectService = new CandidateProjectService();
