import type { VerificationStatus } from "./types";

export type ProjectSource = "GITHUB" | "PORTFOLIO" | "RESUME" | "MANUAL";

export interface Project {
  id: string;
  candidateProfileId: string;
  name: string;
  description: string | null;
  url: string | null;
  repositoryUrl: string | null;
  primaryLanguage: string | null;
  languages: string[];
  technologies: string[];
  architectureEvidence: string | null;
  qualityNotes: string | null;
  source: ProjectSource;
  verificationStatus: VerificationStatus;
  confirmedByUser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  candidateProfileId: string;
  name: string;
  description?: string | null;
  url?: string | null;
  repositoryUrl?: string | null;
  primaryLanguage?: string | null;
  languages?: string[];
  technologies?: string[];
  architectureEvidence?: string | null;
  qualityNotes?: string | null;
  source?: ProjectSource;
  verificationStatus?: VerificationStatus;
  confirmedByUser?: boolean;
}

export interface ProjectsRepository {
  findByProfileId(candidateProfileId: string): Promise<Project[]>;
  findById(id: string): Promise<Project | null>;
  create(input: CreateProjectInput): Promise<Project>;
  delete(id: string): Promise<boolean>;
}
