/**
 * Job Hub — Phase 8 / Step 8.4
 * Browser Executions Database Repository & Persistence Layer
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent")
 * - Invariant: Candidate Profile Isolation — all queries strictly enforce candidateProfileId.
 */

import {
  db,
  browserExecutions,
  type BrowserFieldMapping,
  type BrowserUploadedDocument,
  type BrowserAuditLogEntry,
} from "@job-hub/db";
import { eq, and, desc } from "drizzle-orm";
import {
  BrowserExecutionNotFoundError,
  BrowserExecutionForbiddenError,
} from "../errors";
import type { BrowserExecutionStatus, BrowserExecutionSummary } from "./types";

export interface CreateExecutionInput {
  applicationId: string;
  candidateProfileId: string;
  targetUrl: string;
  detectedDomain?: string;
}

export interface UpdateExecutionInput {
  status?: BrowserExecutionStatus;
  detectedDomain?: string;
  formDetected?: boolean;
  mappedFields?: BrowserFieldMapping[];
  uploadedDocuments?: BrowserUploadedDocument[];
  safetyStopReason?: string | null;
  safetyDetails?: Record<string, unknown> | null;
  userApproved?: boolean;
  userApprovedAt?: Date | null;
  submissionVerified?: boolean;
  confirmationReference?: string | null;
  errorMessage?: string | null;
  auditLog?: BrowserAuditLogEntry[];
}

export class BrowserExecutionRepository {
  /**
   * Creates a new browser execution session.
   */
  async create(input: CreateExecutionInput): Promise<BrowserExecutionSummary> {
    const [created] = await db
      .insert(browserExecutions)
      .values({
        applicationId: input.applicationId,
        candidateProfileId: input.candidateProfileId,
        targetUrl: input.targetUrl,
        detectedDomain: input.detectedDomain || null,
        status: "INITIALIZING",
        formDetected: false,
        mappedFields: [],
        uploadedDocuments: [],
        auditLog: [
          {
            timestamp: new Date().toISOString(),
            step: "INITIALIZING",
            action: "SESSION_CREATED",
            status: "SUCCESS",
            message: `Created browser execution session for application ${input.applicationId}`,
          },
        ],
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create browser execution record");
    }

    return this.mapToSummary(created);
  }

  /**
   * Retrieves a browser execution record by ID with strict candidate ownership verification.
   */
  async findById(
    id: string,
    candidateProfileId?: string
  ): Promise<BrowserExecutionSummary> {
    const [record] = await db
      .select()
      .from(browserExecutions)
      .where(eq(browserExecutions.id, id));

    if (!record) {
      throw new BrowserExecutionNotFoundError(id);
    }

    if (candidateProfileId && record.candidateProfileId !== candidateProfileId) {
      throw new BrowserExecutionForbiddenError();
    }

    return this.mapToSummary(record);
  }

  /**
   * Retrieves the most recent browser execution for a given application ID.
   */
  async findLatestByApplicationId(
    applicationId: string,
    candidateProfileId: string
  ): Promise<BrowserExecutionSummary | null> {
    const [record] = await db
      .select()
      .from(browserExecutions)
      .where(
        and(
          eq(browserExecutions.applicationId, applicationId),
          eq(browserExecutions.candidateProfileId, candidateProfileId)
        )
      )
      .orderBy(desc(browserExecutions.createdAt))
      .limit(1);

    return record ? this.mapToSummary(record) : null;
  }

  /**
   * Updates execution state, fields, safety stops, and audit log.
   */
  async update(
    id: string,
    candidateProfileId: string,
    patch: UpdateExecutionInput
  ): Promise<BrowserExecutionSummary> {
    // Verify existence & ownership
    await this.findById(id, candidateProfileId);

    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.detectedDomain !== undefined) updatePayload.detectedDomain = patch.detectedDomain;
    if (patch.formDetected !== undefined) updatePayload.formDetected = patch.formDetected;
    if (patch.mappedFields !== undefined) updatePayload.mappedFields = patch.mappedFields;
    if (patch.uploadedDocuments !== undefined) updatePayload.uploadedDocuments = patch.uploadedDocuments;
    if (patch.safetyStopReason !== undefined) updatePayload.safetyStopReason = patch.safetyStopReason;
    if (patch.safetyDetails !== undefined) updatePayload.safetyDetails = patch.safetyDetails;
    if (patch.userApproved !== undefined) updatePayload.userApproved = patch.userApproved;
    if (patch.userApprovedAt !== undefined) updatePayload.userApprovedAt = patch.userApprovedAt;
    if (patch.submissionVerified !== undefined) updatePayload.submissionVerified = patch.submissionVerified;
    if (patch.confirmationReference !== undefined) updatePayload.confirmationReference = patch.confirmationReference;
    if (patch.errorMessage !== undefined) updatePayload.errorMessage = patch.errorMessage;
    if (patch.auditLog !== undefined) updatePayload.auditLog = patch.auditLog;

    const [updated] = await db
      .update(browserExecutions)
      .set(updatePayload)
      .where(
        and(
          eq(browserExecutions.id, id),
          eq(browserExecutions.candidateProfileId, candidateProfileId)
        )
      )
      .returning();

    if (!updated) {
      throw new BrowserExecutionNotFoundError(id);
    }

    return this.mapToSummary(updated);
  }

  /**
   * Appends an entry to the execution audit log.
   */
  async appendAuditLog(
    id: string,
    candidateProfileId: string,
    entry: BrowserAuditLogEntry
  ): Promise<BrowserExecutionSummary> {
    const existing = await this.findById(id, candidateProfileId);
    const updatedLog = [...existing.auditLog, entry];

    return this.update(id, candidateProfileId, { auditLog: updatedLog });
  }

  /**
   * Confirms a candidate-supplied answer for a specific form field, updating it to KNOWN.
   */
  async confirmField(
    id: string,
    candidateProfileId: string,
    fieldId: string,
    confirmedValue: string
  ): Promise<BrowserExecutionSummary> {
    const existing = await this.findById(id, candidateProfileId);

    const updatedFields = existing.mappedFields.map((field) => {
      if (field.fieldId === fieldId || field.name === fieldId || field.selector === fieldId) {
        return {
          ...field,
          value: confirmedValue,
          classification: "KNOWN" as const,
          requiresUserInput: false,
          confidence: "VERIFIED" as const,
          reason: "Candidate explicitly confirmed answer in review",
        };
      }
      return field;
    });

    const stillRequiresInput = updatedFields.some((f) => f.requiresUserInput && !f.value);
    const newStatus: BrowserExecutionStatus = stillRequiresInput
      ? "PAUSED_FOR_REVIEW"
      : "AWAITING_APPROVAL";

    const auditEntry: BrowserAuditLogEntry = {
      timestamp: new Date().toISOString(),
      step: "FIELD_CONFIRMED",
      action: "CONFIRM_FIELD_ANSWER",
      status: "SUCCESS",
      message: `Candidate confirmed answer for field '${fieldId}'`,
      data: { fieldId },
    };

    return this.update(id, candidateProfileId, {
      mappedFields: updatedFields,
      status: newStatus,
      safetyStopReason: stillRequiresInput ? existing.safetyStopReason : null,
      auditLog: [...existing.auditLog, auditEntry],
    });
  }

  /**
   * Deletes an execution record.
   */
  async delete(id: string, candidateProfileId: string): Promise<void> {
    await this.findById(id, candidateProfileId);
    await db
      .delete(browserExecutions)
      .where(
        and(
          eq(browserExecutions.id, id),
          eq(browserExecutions.candidateProfileId, candidateProfileId)
        )
      );
  }

  private mapToSummary(raw: typeof browserExecutions.$inferSelect): BrowserExecutionSummary {
    return {
      id: raw.id,
      applicationId: raw.applicationId,
      candidateProfileId: raw.candidateProfileId,
      targetUrl: raw.targetUrl,
      detectedDomain: raw.detectedDomain,
      status: raw.status as BrowserExecutionStatus,
      formDetected: raw.formDetected,
      mappedFields: (raw.mappedFields as BrowserFieldMapping[]) || [],
      uploadedDocuments: (raw.uploadedDocuments as BrowserUploadedDocument[]) || [],
      safetyStopReason: raw.safetyStopReason,
      safetyDetails: (raw.safetyDetails as Record<string, unknown>) || null,
      userApproved: raw.userApproved,
      userApprovedAt: raw.userApprovedAt,
      submissionVerified: raw.submissionVerified,
      confirmationReference: raw.confirmationReference,
      errorMessage: raw.errorMessage,
      auditLog: (raw.auditLog as BrowserAuditLogEntry[]) || [],
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}

export const browserExecutionRepository = new BrowserExecutionRepository();
