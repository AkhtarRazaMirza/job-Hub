/**
 * Job Hub — Phase 7 / Step 7.4
 * Application Answers Repository (Drizzle Implementation)
 *
 * Persists answers to the application_answers table with candidate ownership isolation.
 */

import {
  db as defaultDb,
  applications,
  applicationAnswers,
  type Database,
} from "@job-hub/db";
import { eq, and } from "drizzle-orm";
import type {
  ApplicationAnswerRecord,
  ApplicationAnswerRepository,
  ApplicationAnswerItem,
  UpdateAnswerInput,
  AnswerConfidence,
} from "./types";
import {
  ApplicationNotFoundError,
  ApplicationAnswerNotFoundError,
} from "../errors";

export class DrizzleApplicationAnswerRepository
  implements ApplicationAnswerRepository
{
  constructor(private readonly db: Database = defaultDb) {}

  /**
   * Saves a collection of answers for an application with ownership validation.
   */
  async saveAnswers(
    applicationId: string,
    candidateProfileId: string,
    answers: ApplicationAnswerItem[]
  ): Promise<ApplicationAnswerRecord[]> {
    // 1. Verify candidate owns the application
    const [app] = await this.db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (!app) {
      throw new ApplicationNotFoundError(applicationId);
    }

    // 2. Clear old answers for this application if re-generating
    await this.db
      .delete(applicationAnswers)
      .where(eq(applicationAnswers.applicationId, applicationId));

    if (answers.length === 0) return [];

    // 3. Insert new answers
    const inserted = await this.db
      .insert(applicationAnswers)
      .values(
        answers.map((a) => ({
          applicationId,
          question: a.question,
          answer: a.answer,
          confidence: a.confidence,
          isConfirmed: a.isConfirmed,
        }))
      )
      .returning();

    return inserted.map((row) => this.mapRecord(row));
  }

  /**
   * Retrieves all answers for an application with candidate ownership isolation.
   */
  async findByApplicationId(
    applicationId: string,
    candidateProfileId: string
  ): Promise<ApplicationAnswerRecord[]> {
    const [app] = await this.db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (!app) {
      throw new ApplicationNotFoundError(applicationId);
    }

    const rows = await this.db
      .select()
      .from(applicationAnswers)
      .where(eq(applicationAnswers.applicationId, applicationId));

    return rows.map((r) => this.mapRecord(r));
  }

  /**
   * Updates an answer's text and/or confirmed status with candidate isolation.
   */
  async updateAnswer(input: UpdateAnswerInput): Promise<ApplicationAnswerRecord> {
    // 1. Verify candidate owns the application
    const [app] = await this.db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.candidateProfileId, input.candidateProfileId)
        )
      )
      .limit(1);

    if (!app) {
      throw new ApplicationNotFoundError(input.applicationId);
    }

    // 2. Update the answer
    const [updated] = await this.db
      .update(applicationAnswers)
      .set({
        answer: input.answer,
        ...(input.isConfirmed !== undefined ? { isConfirmed: input.isConfirmed } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(applicationAnswers.id, input.answerId),
          eq(applicationAnswers.applicationId, input.applicationId)
        )
      )
      .returning();

    if (!updated) {
      throw new ApplicationAnswerNotFoundError(input.answerId);
    }

    return this.mapRecord(updated);
  }

  private mapRecord(row: any): ApplicationAnswerRecord {
    return {
      id: row.id,
      applicationId: row.applicationId,
      question: row.question,
      answer: row.answer,
      confidence: row.confidence as AnswerConfidence,
      isConfirmed: row.isConfirmed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const applicationAnswerRepository = new DrizzleApplicationAnswerRepository();
