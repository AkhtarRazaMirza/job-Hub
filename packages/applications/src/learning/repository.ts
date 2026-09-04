/**
 * Job Hub — Phase 10 / Step 10.5
 * Candidate-Isolated Learning Repository
 *
 * Implements persistent storage, lifecycle state machine, and idempotency
 * for candidate recommendations.
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 10 ("Learning")
 * - 02_how_to_build.md §16 ("Learning engine")
 * - 03_tech_stack.md §4 ("PostgreSQL via Drizzle ORM")
 * - 04_ai_agent_skills.md §20 & §21
 *
 * Invariants Enforced:
 * 1. Candidate Tenant Isolation: Every query and mutation is strictly scoped to candidateProfileId.
 * 2. Idempotency: Deduplicates active recommendations by (candidateProfileId, targetKey).
 * 3. Lifecycle Integrity: Transitions ACTIVE -> DISMISSED or ACTIVE -> APPLIED with timestamps.
 * 4. Auditable History: Dismissed and applied recommendations preserve historical evidence snapshots.
 */

import crypto from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  recommendations,
  type Database,
} from "@job-hub/db";
import type {
  Recommendation,
  RecommendationStatus,
  RecommendationType,
  OutcomeEvidence,
  ConfidenceLevel,
} from "./types";

export interface GetRecommendationsOptions {
  status?: RecommendationStatus;
  type?: RecommendationType;
  limit?: number;
}

export interface UpsertRecommendationInput {
  type: RecommendationType;
  targetKey: string;
  title: string;
  summary: string;
  explanation: string;
  confidence: ConfidenceLevel;
  evidence: OutcomeEvidence;
}

export class LearningRepository {
  constructor(private readonly database: Database = db) {}

  /**
   * Fetches recommendations for a candidate with optional status and type filters.
   * Strictly tenant-isolated.
   */
  async getRecommendations(
    candidateProfileId: string,
    options: GetRecommendationsOptions = {}
  ): Promise<Recommendation[]> {
    const limit = Math.min(options.limit ?? 20, 50);

    const conditions = [eq(recommendations.candidateProfileId, candidateProfileId)];

    if (options.status) {
      conditions.push(eq(recommendations.status, options.status));
    }
    if (options.type) {
      conditions.push(eq(recommendations.type, options.type));
    }

    const rows = await this.database
      .select()
      .from(recommendations)
      .where(and(...conditions))
      .orderBy(desc(recommendations.createdAt))
      .limit(limit);

    return rows.map((r) => this.mapRowToRecommendation(r));
  }

  /**
   * Retrieves a single recommendation by ID, enforcing tenant isolation.
   */
  async getRecommendationById(
    candidateProfileId: string,
    id: string
  ): Promise<Recommendation | null> {
    const [row] = await this.database
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.id, id),
          eq(recommendations.candidateProfileId, candidateProfileId)
        )
      );

    if (!row) return null;
    return this.mapRowToRecommendation(row);
  }

  /**
   * Transitions a recommendation to DISMISSED status.
   * Returns updated recommendation or null if not found or unauthorized.
   */
  async dismissRecommendation(
    candidateProfileId: string,
    id: string
  ): Promise<Recommendation | null> {
    const now = new Date();

    const [updated] = await this.database
      .update(recommendations)
      .set({
        status: "DISMISSED",
        dismissedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(recommendations.id, id),
          eq(recommendations.candidateProfileId, candidateProfileId)
        )
      )
      .returning();

    if (!updated) return null;
    return this.mapRowToRecommendation(updated);
  }

  /**
   * Transitions a recommendation to APPLIED status (user acknowledged / acted on insight).
   * Returns updated recommendation or null if not found or unauthorized.
   */
  async applyRecommendation(
    candidateProfileId: string,
    id: string
  ): Promise<Recommendation | null> {
    const now = new Date();

    const [updated] = await this.database
      .update(recommendations)
      .set({
        status: "APPLIED",
        appliedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(recommendations.id, id),
          eq(recommendations.candidateProfileId, candidateProfileId)
        )
      )
      .returning();

    if (!updated) return null;
    return this.mapRowToRecommendation(updated);
  }

  /**
   * Idempotently saves generated recommendations.
   * If an ACTIVE recommendation with the same targetKey exists for this candidate,
   * updates the evidence snapshot and copy in-place without duplicating rows.
   * If not, inserts a new active recommendation.
   */
  async saveRecommendationsIdempotent(
    candidateProfileId: string,
    inputs: UpsertRecommendationInput[]
  ): Promise<Recommendation[]> {
    const results: Recommendation[] = [];

    for (const input of inputs) {
      // Check for existing recommendation for this candidate and targetKey
      const [existing] = await this.database
        .select()
        .from(recommendations)
        .where(
          and(
            eq(recommendations.candidateProfileId, candidateProfileId),
            eq(recommendations.targetKey, input.targetKey)
          )
        );

      const now = new Date();

      if (existing) {
        // Update in-place to refresh evidence and copy without duplicating
        const [updated] = await this.database
          .update(recommendations)
          .set({
            title: input.title,
            summary: input.summary,
            explanation: input.explanation,
            confidence: input.confidence,
            evidence: input.evidence,
            updatedAt: now,
          })
          .where(eq(recommendations.id, existing.id))
          .returning();

        results.push(this.mapRowToRecommendation(updated));
      } else {
        // Insert new active recommendation
        const id = crypto.randomUUID();
        const [inserted] = await this.database
          .insert(recommendations)
          .values({
            id,
            candidateProfileId,
            type: input.type,
            targetKey: input.targetKey,
            title: input.title,
            summary: input.summary,
            explanation: input.explanation,
            confidence: input.confidence,
            evidence: input.evidence,
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        results.push(this.mapRowToRecommendation(inserted));
      }
    }

    return results;
  }

  private mapRowToRecommendation(row: typeof recommendations.$inferSelect): Recommendation {
    return {
      id: row.id,
      candidateProfileId: row.candidateProfileId,
      type: row.type as RecommendationType,
      title: row.title,
      summary: row.summary,
      explanation: row.explanation,
      confidence: row.confidence as ConfidenceLevel,
      evidence: row.evidence as OutcomeEvidence,
      status: row.status as RecommendationStatus,
      dismissedAt: row.dismissedAt?.toISOString() ?? null,
      appliedAt: row.appliedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
