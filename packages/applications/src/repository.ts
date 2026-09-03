/**
 * Job Hub — Phase 6 / Step 6.3
 * Application Repository & Persistence Layer
 *
 * Implements candidate-isolated persistence, transactional state transitions,
 * audit event logging, and truthful provenance queries.
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 12 & 13, §5 Phase 6
 * - 02_how_to_build.md §2, §10, §14, §17
 * - 04_ai_agent_skills.md §17 & §18
 */

import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  db,
  applications,
  applicationDocuments,
  applicationAnswers,
  applicationEvents,
  jobs,
  jobMatches,
  type Database,
} from "@job-hub/db";
import {
  type Application,
  type ApplicationStatus,
  type ApplicationDocument,
  type ApplicationAnswer,
  type ApplicationEvent,
  type CreateApplicationInput,
  type UpdateApplicationInput,
  type TransitionStatusInput,
  type ListApplicationsOptions,
  type ApplicationStats,
  APPLICATION_STATUS,
  APPLICATION_EVENT_TYPE,
} from "./types";
import {
  ApplicationNotFoundError,
  ApplicationConflictError,
  ApplicationError,
} from "./errors";
import { validateTransition } from "./lifecycle";

export interface ApplicationWithDetails extends Application {
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    remoteType: string;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string | null;
    canonicalUrl: string | null;
    source: string;
  };
  match?: {
    id: string;
    overallScore: string;
    decision: string;
  } | null;
  documents: ApplicationDocument[];
  answers: ApplicationAnswer[];
  events: ApplicationEvent[];
}

export interface ApplicationWithJob extends Application {
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    remoteType: string;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string | null;
    canonicalUrl: string | null;
    source: string;
  };
  match?: {
    id: string;
    overallScore: string;
    decision: string;
  } | null;
}

export interface ApplicationRepository {
  create(input: CreateApplicationInput): Promise<Application>;
  findById(id: string, candidateProfileId: string): Promise<ApplicationWithDetails | null>;
  findByCandidateAndJob(candidateProfileId: string, jobId: string): Promise<Application | null>;
  list(
    candidateProfileId: string,
    options?: ListApplicationsOptions
  ): Promise<{ items: ApplicationWithJob[]; total: number }>;
  transitionStatus(input: TransitionStatusInput): Promise<Application>;
  updateNotes(
    id: string,
    candidateProfileId: string,
    notes: string | null
  ): Promise<Application>;
  updateFollowUp(
    id: string,
    candidateProfileId: string,
    followUpDate: Date | null,
    nextAction: string | null
  ): Promise<Application>;
  withdraw(
    id: string,
    candidateProfileId: string,
    reason?: string
  ): Promise<Application>;
  delete(id: string, candidateProfileId: string): Promise<boolean>;
  getStats(candidateProfileId: string): Promise<ApplicationStats>;
  getEvents(applicationId: string): Promise<ApplicationEvent[]>;
}

export class DrizzleApplicationRepository implements ApplicationRepository {
  private readonly database: Database;

  constructor(database: Database = db) {
    this.database = database;
  }

  async create(input: CreateApplicationInput): Promise<Application> {
    // 1. Verify canonical job exists
    const [job] = await this.database
      .select()
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .limit(1);

    if (!job) {
      throw new ApplicationError(`Canonical job ${input.jobId} does not exist`);
    }

    // 2. Check for existing application to avoid duplicate unique constraint collision
    const existing = await this.findByCandidateAndJob(
      input.candidateProfileId,
      input.jobId
    );
    if (existing) {
      throw new ApplicationConflictError(input.candidateProfileId, input.jobId);
    }

    // 3. Resolve match if not explicitly provided
    let matchId = input.matchId ?? null;
    let matchScore: string | null = null;

    if (matchId) {
      const [m] = await this.database
        .select()
        .from(jobMatches)
        .where(
          and(
            eq(jobMatches.id, matchId),
            eq(jobMatches.candidateProfileId, input.candidateProfileId)
          )
        )
        .limit(1);
      if (m) {
        matchScore = m.overallScore;
      }
    } else {
      const [m] = await this.database
        .select()
        .from(jobMatches)
        .where(
          and(
            eq(jobMatches.candidateProfileId, input.candidateProfileId),
            eq(jobMatches.jobId, input.jobId)
          )
        )
        .limit(1);
      if (m) {
        matchId = m.id;
        matchScore = m.overallScore;
      }
    }

    const initialStatus: ApplicationStatus =
      input.status ?? APPLICATION_STATUS.PREPARED;
    const submittedAt =
      initialStatus === APPLICATION_STATUS.APPLIED ? new Date() : null;

    try {
      return await this.database.transaction(async (tx) => {
        const [app] = await tx
          .insert(applications)
          .values({
            candidateProfileId: input.candidateProfileId,
            jobId: input.jobId,
            matchId,
            company: job.company,
            role: job.title,
            source: job.source,
            applicationUrl: job.canonicalUrl,
            matchScore,
            status: initialStatus,
            submittedAt,
            nextAction: input.nextAction ?? null,
            followUpDate: input.followUpDate ?? null,
            notes: input.notes ?? null,
            resumeVersionId: input.resumeVersionId ?? null,
            coverLetterVersionId: input.coverLetterVersionId ?? null,
            confirmationReference: input.confirmationReference ?? null,
            answers: input.answers as any,
          })
          .returning();

        if (!app) {
          throw new ApplicationError("Failed to insert application record");
        }

        // Record creation audit event
        await tx.insert(applicationEvents).values({
          applicationId: app.id,
          fromStatus: null,
          toStatus: initialStatus,
          eventType: APPLICATION_EVENT_TYPE.CREATED,
          metadata: {
            source: job.source,
            matchScore,
            resumeVersionId: input.resumeVersionId,
          },
          notes: input.notes ?? "Application record created",
        });

        return this.mapToApplication(app);
      });
    } catch (error: any) {
      if (
        error?.code === "23505" ||
        error?.message?.includes("applications_candidate_profile_id_job_id_unique")
      ) {
        throw new ApplicationConflictError(input.candidateProfileId, input.jobId);
      }
      throw error;
    }
  }

  async findById(
    id: string,
    candidateProfileId: string
  ): Promise<ApplicationWithDetails | null> {
    const [app] = await this.database
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, id),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (!app) {
      return null;
    }

    const [job] = await this.database
      .select()
      .from(jobs)
      .where(eq(jobs.id, app.jobId))
      .limit(1);

    let matchRecord: { id: string; overallScore: string; decision: string } | null = null;
    if (app.matchId) {
      const [m] = await this.database
        .select()
        .from(jobMatches)
        .where(eq(jobMatches.id, app.matchId))
        .limit(1);
      if (m) {
        matchRecord = {
          id: m.id,
          overallScore: m.overallScore,
          decision: m.decision,
        };
      }
    }

    const docs = await this.database
      .select()
      .from(applicationDocuments)
      .where(eq(applicationDocuments.applicationId, id))
      .orderBy(desc(applicationDocuments.createdAt));

    const ans = await this.database
      .select()
      .from(applicationAnswers)
      .where(eq(applicationAnswers.applicationId, id))
      .orderBy(desc(applicationAnswers.createdAt));

    const evts = await this.database
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, id))
      .orderBy(desc(applicationEvents.createdAt));

    return {
      ...this.mapToApplication(app),
      job: {
        id: job ? job.id : app.jobId,
        title: job ? job.title : app.role,
        company: job ? job.company : app.company,
        location: job?.location ?? null,
        remoteType: job?.remoteType ?? "UNKNOWN",
        salaryMin: job?.salaryMin ?? null,
        salaryMax: job?.salaryMax ?? null,
        currency: job?.currency ?? null,
        canonicalUrl: job?.canonicalUrl ?? app.applicationUrl,
        source: job ? job.source : app.source,
      },
      match: matchRecord,
      documents: docs.map((d) => ({
        id: d.id,
        applicationId: d.applicationId,
        documentType: d.documentType as any,
        fileName: d.fileName,
        storageKey: d.storageKey,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        version: d.version,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      answers: ans.map((a) => ({
        id: a.id,
        applicationId: a.applicationId,
        question: a.question,
        answer: a.answer,
        confidence: a.confidence as any,
        isConfirmed: a.isConfirmed,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      events: evts.map((e) => ({
        id: e.id,
        applicationId: e.applicationId,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        eventType: e.eventType,
        metadata: e.metadata as Record<string, unknown> | null,
        notes: e.notes,
        createdAt: e.createdAt,
      })),
    };
  }

  async findByCandidateAndJob(
    candidateProfileId: string,
    jobId: string
  ): Promise<Application | null> {
    const [app] = await this.database
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.candidateProfileId, candidateProfileId),
          eq(applications.jobId, jobId)
        )
      )
      .limit(1);

    return app ? this.mapToApplication(app) : null;
  }

  async list(
    candidateProfileId: string,
    options: ListApplicationsOptions = {}
  ): Promise<{ items: ApplicationWithJob[]; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    const conditions = [eq(applications.candidateProfileId, candidateProfileId)];
    if (options.status) {
      conditions.push(eq(applications.status, options.status));
    }

    const whereClause = and(...conditions);

    // Total count
    const [totalRow] = await this.database
      .select({ value: count() })
      .from(applications)
      .where(whereClause);

    const total = Number(totalRow?.value ?? 0);

    // Items
    const rows = await this.database
      .select({
        app: applications,
        job: jobs,
        match: jobMatches,
      })
      .from(applications)
      .leftJoin(jobs, eq(applications.jobId, jobs.id))
      .leftJoin(jobMatches, eq(applications.matchId, jobMatches.id))
      .where(whereClause)
      .orderBy(desc(applications.createdAt))
      .limit(limit)
      .offset(offset);

    const items: ApplicationWithJob[] = rows.map(({ app, job, match }) => ({
      ...this.mapToApplication(app),
      job: {
        id: job ? job.id : app.jobId,
        title: job ? job.title : app.role,
        company: job ? job.company : app.company,
        location: job?.location ?? null,
        remoteType: job?.remoteType ?? "UNKNOWN",
        salaryMin: job?.salaryMin ?? null,
        salaryMax: job?.salaryMax ?? null,
        currency: job?.currency ?? null,
        canonicalUrl: job?.canonicalUrl ?? app.applicationUrl,
        source: job ? job.source : app.source,
      },
      match: match
        ? {
            id: match.id,
            overallScore: match.overallScore,
            decision: match.decision,
          }
        : null,
    }));

    return { items, total };
  }

  async transitionStatus(input: TransitionStatusInput): Promise<Application> {
    const [existing] = await this.database
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, input.id),
          eq(applications.candidateProfileId, input.candidateProfileId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new ApplicationNotFoundError(input.id);
    }

    const currentStatus = existing.status as ApplicationStatus;
    const toStatus = input.toStatus;

    // Validate state transition using authoritative domain rules
    validateTransition(currentStatus, toStatus);

    return await this.database.transaction(async (tx) => {
      const updateData: Partial<typeof applications.$inferInsert> = {
        status: toStatus,
      };

      // If transitioning to APPLIED and submittedAt is not set, set it now
      if (toStatus === APPLICATION_STATUS.APPLIED && !existing.submittedAt) {
        updateData.submittedAt = new Date();
      }

      if (input.notes !== undefined) {
        updateData.notes = input.notes;
      }
      if (input.nextAction !== undefined) {
        updateData.nextAction = input.nextAction;
      }
      if (input.followUpDate !== undefined) {
        updateData.followUpDate = input.followUpDate;
      }
      if (input.confirmationReference !== undefined) {
        updateData.confirmationReference = input.confirmationReference;
      }

      const [updated] = await tx
        .update(applications)
        .set(updateData)
        .where(eq(applications.id, input.id))
        .returning();

      if (!updated) {
        throw new ApplicationError("Failed to update application status");
      }

      // Record audit event
      await tx.insert(applicationEvents).values({
        applicationId: input.id,
        fromStatus: currentStatus,
        toStatus: toStatus,
        eventType:
          toStatus === APPLICATION_STATUS.WITHDRAWN
            ? APPLICATION_EVENT_TYPE.WITHDRAWN
            : APPLICATION_EVENT_TYPE.STATUS_CHANGE,
        metadata: {
          previousStatus: currentStatus,
          newStatus: toStatus,
          confirmationReference: input.confirmationReference,
        },
        notes: input.notes ?? `Status transitioned from ${currentStatus} to ${toStatus}`,
      });

      return this.mapToApplication(updated);
    });
  }

  async updateNotes(
    id: string,
    candidateProfileId: string,
    notes: string | null
  ): Promise<Application> {
    const [existing] = await this.database
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, id),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new ApplicationNotFoundError(id);
    }

    return await this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(applications)
        .set({ notes })
        .where(eq(applications.id, id))
        .returning();

      if (!updated) {
        throw new ApplicationError("Failed to update notes");
      }

      await tx.insert(applicationEvents).values({
        applicationId: id,
        fromStatus: existing.status,
        toStatus: existing.status,
        eventType: APPLICATION_EVENT_TYPE.NOTE_ADDED,
        notes: notes ?? "Notes cleared",
      });

      return this.mapToApplication(updated);
    });
  }

  async updateFollowUp(
    id: string,
    candidateProfileId: string,
    followUpDate: Date | null,
    nextAction: string | null
  ): Promise<Application> {
    const [existing] = await this.database
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, id),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new ApplicationNotFoundError(id);
    }

    return await this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(applications)
        .set({
          followUpDate,
          nextAction,
        })
        .where(eq(applications.id, id))
        .returning();

      if (!updated) {
        throw new ApplicationError("Failed to update follow-up");
      }

      await tx.insert(applicationEvents).values({
        applicationId: id,
        fromStatus: existing.status,
        toStatus: existing.status,
        eventType: APPLICATION_EVENT_TYPE.FOLLOW_UP_SCHEDULED,
        metadata: {
          followUpDate: followUpDate ? followUpDate.toISOString() : null,
          nextAction,
        },
        notes: nextAction ?? "Follow-up schedule updated",
      });

      return this.mapToApplication(updated);
    });
  }

  async withdraw(
    id: string,
    candidateProfileId: string,
    reason?: string
  ): Promise<Application> {
    return this.transitionStatus({
      id,
      candidateProfileId,
      toStatus: APPLICATION_STATUS.WITHDRAWN,
      notes: reason ?? "Application withdrawn by candidate",
    });
  }

  async delete(id: string, candidateProfileId: string): Promise<boolean> {
    const [existing] = await this.database
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, id),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (!existing) {
      return false;
    }

    const deleted = await this.database
      .delete(applications)
      .where(
        and(
          eq(applications.id, id),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .returning();

    return deleted.length > 0;
  }

  async getStats(candidateProfileId: string): Promise<ApplicationStats> {
    const rows = await this.database
      .select({
        status: applications.status,
        count: count(),
      })
      .from(applications)
      .where(eq(applications.candidateProfileId, candidateProfileId))
      .groupBy(applications.status);

    const stats: ApplicationStats = {
      total: 0,
      prepared: 0,
      applied: 0,
      underReview: 0,
      interviewScheduled: 0,
      interviewCompleted: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
    };

    for (const r of rows) {
      const c = Number(r.count);
      stats.total += c;
      switch (r.status) {
        case APPLICATION_STATUS.PREPARED:
          stats.prepared = c;
          break;
        case APPLICATION_STATUS.APPLIED:
          stats.applied = c;
          break;
        case APPLICATION_STATUS.UNDER_REVIEW:
          stats.underReview = c;
          break;
        case APPLICATION_STATUS.INTERVIEW_SCHEDULED:
          stats.interviewScheduled = c;
          break;
        case APPLICATION_STATUS.INTERVIEW_COMPLETED:
          stats.interviewCompleted = c;
          break;
        case APPLICATION_STATUS.OFFER:
          stats.offer = c;
          break;
        case APPLICATION_STATUS.REJECTED:
          stats.rejected = c;
          break;
        case APPLICATION_STATUS.WITHDRAWN:
          stats.withdrawn = c;
          break;
      }
    }

    return stats;
  }

  async getEvents(applicationId: string): Promise<ApplicationEvent[]> {
    const rows = await this.database
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId))
      .orderBy(desc(applicationEvents.createdAt));

    return rows.map((e) => ({
      id: e.id,
      applicationId: e.applicationId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      eventType: e.eventType,
      metadata: e.metadata as Record<string, unknown> | null,
      notes: e.notes,
      createdAt: e.createdAt,
    }));
  }

  private mapToApplication(raw: typeof applications.$inferSelect): Application {
    return {
      id: raw.id,
      candidateProfileId: raw.candidateProfileId,
      jobId: raw.jobId,
      matchId: raw.matchId,
      company: raw.company,
      role: raw.role,
      source: raw.source,
      applicationUrl: raw.applicationUrl,
      matchScore: raw.matchScore,
      status: raw.status as ApplicationStatus,
      submittedAt: raw.submittedAt,
      nextAction: raw.nextAction,
      followUpDate: raw.followUpDate,
      notes: raw.notes,
      resumeVersionId: raw.resumeVersionId,
      coverLetterVersionId: raw.coverLetterVersionId,
      confirmationReference: raw.confirmationReference,
      answers: raw.answers,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
