import { eq } from "drizzle-orm";
import { db as defaultDb, projects, type Database } from "@job-hub/db";
import type { Project, ProjectsRepository, CreateProjectInput, ProjectSource } from "./project-types";
import type { VerificationStatus } from "./types";

export class DrizzleProjectsRepository implements ProjectsRepository {
  constructor(private readonly db: Database = defaultDb) {}

  private toEntity(row: typeof projects.$inferSelect): Project {
    return {
      id: row.id,
      candidateProfileId: row.candidateProfileId,
      name: row.name,
      description: row.description,
      url: row.url,
      repositoryUrl: row.repositoryUrl,
      primaryLanguage: row.primaryLanguage,
      languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
      technologies: Array.isArray(row.technologies) ? (row.technologies as string[]) : [],
      architectureEvidence: row.architectureEvidence,
      qualityNotes: row.qualityNotes,
      source: (row.source as ProjectSource) || "GITHUB",
      verificationStatus: (row.verificationStatus as VerificationStatus) || "VERIFIED",
      confirmedByUser: row.confirmedByUser,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByProfileId(candidateProfileId: string): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.candidateProfileId, candidateProfileId))
      .orderBy(projects.createdAt);

    return rows.map((r) => this.toEntity(r));
  }

  async findById(id: string): Promise<Project | null> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const [row] = await this.db
      .insert(projects)
      .values({
        candidateProfileId: input.candidateProfileId,
        name: input.name,
        description: input.description ?? null,
        url: input.url ?? null,
        repositoryUrl: input.repositoryUrl ?? null,
        primaryLanguage: input.primaryLanguage ?? null,
        languages: input.languages ?? [],
        technologies: input.technologies ?? [],
        architectureEvidence: input.architectureEvidence ?? null,
        qualityNotes: input.qualityNotes ?? null,
        source: input.source ?? "GITHUB",
        verificationStatus: input.verificationStatus ?? "VERIFIED",
        confirmedByUser: input.confirmedByUser ?? true,
      })
      .returning();

    return this.toEntity(row!);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  }
}
