/**
 * Job Hub — Phase 8 / Step 8.5
 * Human Approval & Verified Submission Controller
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent with human approval")
 * - 02_how_to_build.md §13 ("User review -> User approval -> Submit if permitted -> Capture confirmation -> Save application")
 * - 04_ai_agent_skills.md §16 ("Human Approval Skill: Before final submission: require explicit approval")
 *
 * ABSOLUTE INVARIANTS:
 * 1. Submission Safety: The agent MUST NOT submit an application automatically without explicit candidate approval (userApproved: true).
 * 2. Pre-submission Checks: All USER_REQUIRED, UNSAFE, and ambiguous fields must be resolved.
 * 3. Submission Uncertainty: If submission state is uncertain, STOP. Never retry blindly. Persist SUBMISSION_UNCERTAIN. Do NOT set APPLIED.
 * 4. Idempotency: Never submit an application that is already marked as APPLIED.
 */

import {
  db,
  applications,
  applicationEvents,
} from "@job-hub/db";
import { eq, and } from "drizzle-orm";
import {
  BrowserApprovalRequiredError,
  BrowserUncertainSubmissionError,
  BrowserExecutionForbiddenError,
  BrowserExecutionNotFoundError,
  ApplicationNotFoundError,
  ApplicationError,
} from "../errors";
import { type BrowserDriver, SimulatedBrowserDriver } from "./driver";
import { browserExecutionRepository, BrowserExecutionRepository } from "./repository";
import type { BrowserExecutionSummary } from "./types";
import { DrizzleApplicationRepository, type ApplicationRepository } from "../repository";

export interface SubmitApplicationOptions {
  executionId: string;
  candidateProfileId: string;
  driver?: BrowserDriver;
  applicationRepo?: ApplicationRepository;
}

export interface SubmitApplicationResult {
  execution: BrowserExecutionSummary;
  applicationStatus: string;
  submissionVerified: boolean;
  confirmationReference?: string | null;
}

export class BrowserSubmissionController {
  constructor(
    private readonly repository: BrowserExecutionRepository = browserExecutionRepository,
    private readonly appRepository: ApplicationRepository = new DrizzleApplicationRepository()
  ) {}

  /**
   * Validates all pre-submission invariants before clicking submit.
   * Enforces explicit candidate approval, lack of unresolved questions, and idempotency.
   */
  async validatePreSubmissionInvariants(
    executionId: string,
    candidateProfileId: string
  ): Promise<{ execution: BrowserExecutionSummary; targetApplication: typeof applications.$inferSelect }> {
    const execution = await this.repository.findById(executionId, candidateProfileId);

    // 1. Invariant: Approval Requirement
    if (!execution.userApproved) {
      throw new BrowserApprovalRequiredError(
        "Application cannot be submitted: explicit candidate approval (userApproved: true) is strictly required."
      );
    }

    // 2. Invariant: Must be in AWAITING_APPROVAL or PAUSED_FOR_REVIEW state
    if (execution.status !== "AWAITING_APPROVAL" && execution.status !== "PAUSED_FOR_REVIEW") {
      throw new BrowserApprovalRequiredError(
        `Application cannot be submitted from status '${execution.status}'. Must be 'AWAITING_APPROVAL'.`
      );
    }

    // 3. Invariant: No unresolved sensitive or required fields
    const unresolvedField = execution.mappedFields.find(
      (f) => (f.requiresUserInput || f.classification === "UNSAFE") && !f.value
    );
    if (unresolvedField) {
      throw new BrowserApprovalRequiredError(
        `Cannot submit: field '${unresolvedField.label || unresolvedField.name || unresolvedField.fieldId}' requires candidate confirmation.`
      );
    }

    // 4. Invariant: Target application existence and candidate ownership
    const [targetApp] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, execution.applicationId),
          eq(applications.candidateProfileId, candidateProfileId)
        )
      )
      .limit(1);

    if (!targetApp) {
      throw new ApplicationNotFoundError(execution.applicationId);
    }

    // 5. Invariant: Idempotency Protection — Do not submit if already APPLIED
    if (targetApp.status === "APPLIED") {
      throw new ApplicationError(
        "Application has already been submitted and marked as APPLIED. Duplicate submission is prevented."
      );
    }

    return { execution, targetApplication: targetApp };
  }

  /**
   * Executes the final submission action in the browser.
   * Handles verified confirmation, uncertain states, and application status transitions.
   */
  async submitApplication(
    options: SubmitApplicationOptions
  ): Promise<SubmitApplicationResult> {
    const { executionId, candidateProfileId } = options;
    const driver = options.driver || new SimulatedBrowserDriver();
    const appRepo = options.applicationRepo || this.appRepository;

    // 1. Verify pre-submission invariants
    const { execution, targetApplication } = await this.validatePreSubmissionInvariants(
      executionId,
      candidateProfileId
    );

    // 2. Transition execution status to SUBMITTING
    await this.repository.update(executionId, candidateProfileId, {
      status: "SUBMITTING",
    });

    await this.repository.appendAuditLog(executionId, candidateProfileId, {
      timestamp: new Date().toISOString(),
      step: "SUBMITTING",
      action: "CLICK_SUBMIT",
      status: "SUCCESS",
      message: "Candidate explicitly approved submission. Executing submission in browser.",
    });

    try {
      // 3. Perform the submission action in the browser
      const submitResult = await driver.clickSubmit();

      // -----------------------------------------------------------------------
      // A. UNCERTAIN SUBMISSION STATE
      // -----------------------------------------------------------------------
      if (submitResult.uncertain) {
        const uncertaintyMsg =
          submitResult.errorMessage ||
          "Submission confirmation could not be verified; state is uncertain.";

        await this.repository.update(executionId, candidateProfileId, {
          status: "SUBMISSION_UNCERTAIN",
          submissionVerified: false,
          errorMessage: uncertaintyMsg,
        });

        await this.repository.appendAuditLog(executionId, candidateProfileId, {
          timestamp: new Date().toISOString(),
          step: "SUBMISSION_UNCERTAINTY",
          action: "SUBMISSION_UNCERTAIN",
          status: "WARNING",
          message: `${uncertaintyMsg} Stopping execution to prevent duplicate submission. Application status remains ${targetApplication.status}.`,
        });

        // Record audit event on the application record
        await db.insert(applicationEvents).values({
          applicationId: targetApplication.id,
          fromStatus: targetApplication.status,
          toStatus: targetApplication.status,
          eventType: "NOTE_ADDED",
          notes: `[Job Hub Browser Agent] Submission uncertainty encountered: ${uncertaintyMsg}. Application was NOT marked as APPLIED to prevent duplicates.`,
          metadata: { executionId, uncertaintyReason: uncertaintyMsg },
        });

        throw new BrowserUncertainSubmissionError(uncertaintyMsg);
      }

      // -----------------------------------------------------------------------
      // B. SUBMISSION FAILED
      // -----------------------------------------------------------------------
      if (!submitResult.success) {
        const failureMsg = submitResult.errorMessage || "Browser form submission failed.";

        const failedExec = await this.repository.update(executionId, candidateProfileId, {
          status: "FAILED",
          errorMessage: failureMsg,
        });

        await this.repository.appendAuditLog(executionId, candidateProfileId, {
          timestamp: new Date().toISOString(),
          step: "SUBMISSION_FAILED",
          action: "SUBMIT_ERROR",
          status: "ERROR",
          message: failureMsg,
        });

        return {
          execution: failedExec,
          applicationStatus: targetApplication.status,
          submissionVerified: false,
        };
      }

      // -----------------------------------------------------------------------
      // C. VERIFIED SUCCESSFUL SUBMISSION
      // -----------------------------------------------------------------------
      const confirmationRef =
        submitResult.confirmationText ||
        `Submitted via Browser Agent at ${new Date().toISOString()}`;

      const verifiedExec = await this.repository.update(executionId, candidateProfileId, {
        status: "SUBMITTED_VERIFIED",
        submissionVerified: true,
        confirmationReference: confirmationRef,
      });

      await this.repository.appendAuditLog(executionId, candidateProfileId, {
        timestamp: new Date().toISOString(),
        step: "SUBMISSION_VERIFIED",
        action: "CONFIRMED_APPLIED",
        status: "SUCCESS",
        message: `Application submission verified with confirmation: "${confirmationRef}"`,
        data: { confirmationReference: confirmationRef },
      });

      // Transition application to APPLIED
      const updatedApp = await appRepo.transitionStatus({
        id: targetApplication.id,
        candidateProfileId,
        toStatus: "APPLIED",
        notes: `Application successfully submitted via Job Hub Browser Agent. Confirmation: ${confirmationRef}`,
        confirmationReference: confirmationRef,
      });

      return {
        execution: verifiedExec,
        applicationStatus: updatedApp.status,
        submissionVerified: true,
        confirmationReference: confirmationRef,
      };
    } catch (err: unknown) {
      if (err instanceof BrowserUncertainSubmissionError) {
        throw err;
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      await this.repository.update(executionId, candidateProfileId, {
        status: "FAILED",
        errorMessage: errMsg,
      });

      throw err;
    } finally {
      await driver.close();
    }
  }
}

export const browserSubmissionController = new BrowserSubmissionController();
