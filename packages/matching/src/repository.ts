/**
 * Job Hub — Phase 4 / Step 4.1
 * JobMatch Repository Interface & Drizzle Implementation
 *
 * All database queries are strictly encapsulated within this repository.
 */

import { eq, and, desc, gte } from "drizzle-orm";
import {
  db as defaultDb,
  jobMatches as jobMatchesTable,
  type Database,
} from "@job-hub/db";
import type {
  JobMatch,
  CreateJobMatchInput,
  UpdateJobMatchInput,
  JobMatchFilter,
  CategoryScores,
  ScoringWeights,
  MatchDecision,
} from "./types";
import { DEFAULT_SCORING_WEIGHTS } from "./types";
import {
  JobMatchNotFoundError,
  JobMatchConflictError,
} from "./errors";

export interface JobMatchRepository {
  findById(id: string): Promise<JobMatch | null>;
  findByCandidateAndJob(candidateProfileId: string, jobId: string): Promise<JobMatch | null>;
  create(input: CreateJobMatchInput): Promise<JobMatch>;
  upsert(input: CreateJobMatchInput): Promise<JobMatch>;
  update(id: string, input: UpdateJobMatchInput): Promise<JobMatch>;
  listByCandidate(candidateProfileId: string, filter?: JobMatchFilter): Promise<JobMatch[]>;
  delete(id: string): Promise<boolean>;
}

export class DrizzleJobMatchRepository implements JobMatchRepository {
  constructor(private readonly db: Database = defaultDb) {}

  private toEntity(row: typeof jobMatchesTable.$inferSelect): JobMatch {
    return {
      id: row.id,
      candidateProfileId: row.candidateProfileId,
      jobId: row.jobId,
      overallScore: Number(row.overallScore),
      decision: row.decision as MatchDecision,
      hardConstraintsPassed: row.hardConstraintsPassed,
      hardConstraintFailures: Array.isArray(row.hardConstraintFailures)
        ? (row.hardConstraintFailures as string[])
        : [],
      categoryScores: row.categoryScores as CategoryScores,
      strengths: Array.isArray(row.strengths) ? (row.strengths as string[]) : [],
      gaps: Array.isArray(row.gaps) ? (row.gaps as string[]) : [],
      risks: Array.isArray(row.risks) ? (row.risks as string[]) : [],
      explanation: row.explanation,
      confidence: Number(row.confidence),
      weightsUsed: (row.weightsUsed as unknown as ScoringWeights) ?? DEFAULT_SCORING_WEIGHTS,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<JobMatch | null> {
    const [row] = await this.db
      .select()
      .from(jobMatchesTable)
      .where(eq(jobMatchesTable.id, id))
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async findByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<JobMatch | null> {
    const [row] = await this.db
      .select()
      .from(jobMatchesTable)
      .where(
        and(
          eq(jobMatchesTable.candidateProfileId, candidateProfileId),
          eq(jobMatchesTable.jobId, jobId)
        )
      )
      .limit(1);

    return row ? this.toEntity(row) : null;
  }

  async create(input: CreateJobMatchInput): Promise<JobMatch> {
    try {
      const [created] = await this.db
        .insert(jobMatchesTable)
        .values({
          ...(input.id ? { id: input.id } : {}),
          candidateProfileId: input.candidateProfileId,
          jobId: input.jobId,
          overallScore: input.overallScore.toFixed(2),
          decision: input.decision,
          hardConstraintsPassed: input.hardConstraintsPassed,
          hardConstraintFailures: input.hardConstraintFailures ?? [],
          categoryScores: input.categoryScores,
          strengths: input.strengths ?? [],
          gaps: input.gaps ?? [],
          risks: input.risks ?? [],
          explanation: input.explanation,
          confidence: input.confidence.toFixed(2),
          weightsUsed: input.weightsUsed ?? DEFAULT_SCORING_WEIGHTS,
        })
        .returning();

      return this.toEntity(created!);
    } catch (error: unknown) {
      const isUniqueViolation =
        (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") ||
        (error && typeof error === "object" && "cause" in error && (error as { cause: { code?: string } }).cause?.code === "23505") ||
        (error instanceof Error && (error.message.includes("23505") || error.message.includes("unique constraint")));

      if (isUniqueViolation) {
        throw new JobMatchConflictError(
          `Job match for candidate "${input.candidateProfileId}" and job "${input.jobId}" already exists.`
        );
      }
      throw error;
    }
  }

  async upsert(input: CreateJobMatchInput): Promise<JobMatch> {
    const values = {
      candidateProfileId: input.candidateProfileId,
      jobId: input.jobId,
      overallScore: input.overallScore.toFixed(2),
      decision: input.decision,
      hardConstraintsPassed: input.hardConstraintsPassed,
      hardConstraintFailures: input.hardConstraintFailures ?? [],
      categoryScores: input.categoryScores,
      strengths: input.strengths ?? [],
      gaps: input.gaps ?? [],
      risks: input.risks ?? [],
      explanation: input.explanation,
      confidence: input.confidence.toFixed(2),
      weightsUsed: input.weightsUsed ?? DEFAULT_SCORING_WEIGHTS,
      updatedAt: new Date(),
    };

    const [upserted] = await this.db
      .insert(jobMatchesTable)
      .values({
        ...(input.id ? { id: input.id } : {}),
        ...values,
      })
      .onConflictDoUpdate({
        target: [jobMatchesTable.candidateProfileId, jobMatchesTable.jobId],
        set: values,
      })
      .returning();

    return this.toEntity(upserted!);
  }

  async update(id: string, input: UpdateJobMatchInput): Promise<JobMatch> {
    const valuesToUpdate: Partial<typeof jobMatchesTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.overallScore !== undefined) {
      valuesToUpdate.overallScore = input.overallScore.toFixed(2);
    }
    if (input.decision !== undefined) {
      valuesToUpdate.decision = input.decision;
    }
    if (input.hardConstraintsPassed !== undefined) {
      valuesToUpdate.hardConstraintsPassed = input.hardConstraintsPassed;
    }
    if (input.hardConstraintFailures !== undefined) {
      valuesToUpdate.hardConstraintFailures = input.hardConstraintFailures;
    }
    if (input.categoryScores !== undefined) {
      valuesToUpdate.categoryScores = input.categoryScores;
    }
    if (input.strengths !== undefined) {
      valuesToUpdate.strengths = input.strengths;
    }
    if (input.gaps !== undefined) {
      valuesToUpdate.gaps = input.gaps;
    }
    if (input.risks !== undefined) {
      valuesToUpdate.risks = input.risks;
    }
    if (input.explanation !== undefined) {
      valuesToUpdate.explanation = input.explanation;
    }
    if (input.confidence !== undefined) {
      valuesToUpdate.confidence = input.confidence.toFixed(2);
    }
    if (input.weightsUsed !== undefined) {
      valuesToUpdate.weightsUsed = input.weightsUsed;
    }

    const [updated] = await this.db
      .update(jobMatchesTable)
      .set(valuesToUpdate)
      .where(eq(jobMatchesTable.id, id))
      .returning();

    if (!updated) {
      throw new JobMatchNotFoundError(id);
    }

    return this.toEntity(updated);
  }

  async listByCandidate(
    candidateProfileId: string,
    filter?: JobMatchFilter
  ): Promise<JobMatch[]> {
    const conditions = [eq(jobMatchesTable.candidateProfileId, candidateProfileId)];

    if (filter?.decision) {
      conditions.push(eq(jobMatchesTable.decision, filter.decision));
    }
    if (filter?.minScore !== undefined) {
      conditions.push(gte(jobMatchesTable.overallScore, filter.minScore.toFixed(2)));
    }

    let query = this.db
      .select()
      .from(jobMatchesTable)
      .where(and(...conditions))
      .orderBy(desc(jobMatchesTable.overallScore));

    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }
    if (filter?.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    const rows = await query;
    return rows.map((r) => this.toEntity(r));
  }

  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(jobMatchesTable)
      .where(eq(jobMatchesTable.id, id))
      .returning({ id: jobMatchesTable.id });

    return Boolean(deleted);
  }
}
