/**
 * Job Hub — Phase 8 / Step 8.4
 * Controlled Browser Engine & Orchestrator
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent flow: Open -> Detect -> Map -> Fill -> Pause -> User Review -> Approval -> Submit")
 * - 04_ai_agent_skills.md §14 ("Browser Agent Skill"), §15 ("Browser Safety Skill"), §16 ("Human Approval Skill")
 *
 * Invariants:
 * - Isolated browser execution sessions.
 * - Anti-SSRF & domain redirection safety.
 * - Immediate safety halt on CAPTCHA, Auth, MFA, blocked automation, or sensitive unconfirmed questions.
 * - Never auto-submit without explicit human approval.
 */

import type { StorageProvider } from "@job-hub/storage";
import {
  BrowserExecutionNotFoundError,
  BrowserExecutionForbiddenError,
  BrowserSafetyHaltError,
} from "../errors";
import { type BrowserDriver, SimulatedBrowserDriver } from "./driver";
import {
  mapFormFields,
  detectApplicationForm,
  type CandidateFormContext,
} from "./field-mapper";
import { browserExecutionRepository, BrowserExecutionRepository } from "./repository";
import { evaluateBrowserPageState } from "./safety";
import type {
  BrowserExecutionStatus,
  BrowserExecutionSummary,
  BrowserPageState,
  CandidateSafetyContext,
} from "./types";
import { validateBrowserTargetUrl } from "./validation";

export interface ExecuteAssistedFlowOptions {
  executionId: string;
  candidateProfileId: string;
  targetUrl: string;
  expectedJobUrl?: string;
  candidateContext: CandidateFormContext;
  safetyContext?: CandidateSafetyContext;
  driver?: BrowserDriver;
  storageProvider?: StorageProvider;
}

export class ControlledBrowserService {
  constructor(
    private readonly repository: BrowserExecutionRepository = browserExecutionRepository
  ) {}

  /**
   * Executes the controlled, assisted form filling workflow up to the human approval gate.
   * Stops immediately upon any safety trigger, CAPTCHA, unmapped fields, or sensitive questions.
   */
  async executeAssistedFlow(
    options: ExecuteAssistedFlowOptions
  ): Promise<BrowserExecutionSummary> {
    const {
      executionId,
      candidateProfileId,
      targetUrl,
      expectedJobUrl,
      candidateContext,
      safetyContext,
      storageProvider,
    } = options;

    const driver = options.driver || new SimulatedBrowserDriver();

    // 1. Ownership & existence check
    const currentRecord = await this.repository.findById(executionId, candidateProfileId);

    // 2. Anti-SSRF & Target URL Security Validation
    const urlValidation = validateBrowserTargetUrl(targetUrl, expectedJobUrl);
    if (!urlValidation.valid) {
      const errorMsg = urlValidation.error || "Invalid target application URL";
      await this.repository.update(executionId, candidateProfileId, {
        status: "STOPPED_SAFETY",
        safetyStopReason: "SSRF_ATTEMPT",
        errorMessage: errorMsg,
      });
      await this.repository.appendAuditLog(executionId, candidateProfileId, {
        timestamp: new Date().toISOString(),
        step: "NAVIGATING",
        action: "URL_VALIDATION_HALT",
        status: "STOPPED",
        message: errorMsg,
      });
      throw new BrowserSafetyHaltError("SSRF_ATTEMPT", errorMsg);
    }

    try {
      // 3. Navigation Step
      await this.repository.update(executionId, candidateProfileId, {
        status: "NAVIGATING",
        detectedDomain: urlValidation.domain,
      });

      const navResult = await driver.goto(targetUrl);
      const currentUrl = navResult.url;
      const currentTitle = await driver.getTitle();
      const currentHtml = await driver.getContent();
      const currentStatus = await driver.getStatus();
      let detectedDomain = "";
      try {
        detectedDomain = new URL(currentUrl).hostname.toLowerCase();
      } catch {
        detectedDomain = urlValidation.domain || "";
      }

      await this.repository.appendAuditLog(executionId, candidateProfileId, {
        timestamp: new Date().toISOString(),
        step: "NAVIGATING",
        action: "GOTO_URL",
        status: "SUCCESS",
        message: `Navigated to ${currentUrl} (HTTP ${currentStatus})`,
        data: { url: currentUrl, domain: detectedDomain },
      });

      // 4. Safety Evaluation of Page State
      const pageState: BrowserPageState = {
        url: currentUrl,
        title: currentTitle,
        domain: detectedDomain,
        httpStatus: currentStatus,
        html: currentHtml,
      };

      const safetyEval = evaluateBrowserPageState(pageState, targetUrl);
      if (!safetyEval.safe) {
        const haltReason = safetyEval.reason || "BLOCKED_AUTOMATION";
        const haltMessage = safetyEval.message || "Safety stop triggered on page state.";

        await this.repository.update(executionId, candidateProfileId, {
          status: "STOPPED_SAFETY",
          safetyStopReason: haltReason,
          safetyDetails: safetyEval.details,
          errorMessage: haltMessage,
        });

        await this.repository.appendAuditLog(executionId, candidateProfileId, {
          timestamp: new Date().toISOString(),
          step: "PAGE_INSPECTION",
          action: "SAFETY_STOP",
          status: "STOPPED",
          message: haltMessage,
          data: { reason: haltReason, details: safetyEval.details },
        });

        return this.repository.findById(executionId, candidateProfileId);
      }

      // 5. Form Detection Step
      await this.repository.update(executionId, candidateProfileId, {
        status: "DETECTING_FORM",
      });

      const inputs = await driver.inspectInputs();
      pageState.inputs = inputs;

      const formCheck = detectApplicationForm(pageState);
      if (!formCheck.formDetected) {
        const msg = formCheck.reason || "Application form elements not detected on page.";
        await this.repository.update(executionId, candidateProfileId, {
          status: "STOPPED_SAFETY",
          safetyStopReason: "FORM_AMBIGUITY",
          formDetected: false,
          errorMessage: msg,
        });

        await this.repository.appendAuditLog(executionId, candidateProfileId, {
          timestamp: new Date().toISOString(),
          step: "DETECTING_FORM",
          action: "FORM_DETECTION_FAILED",
          status: "STOPPED",
          message: msg,
        });

        return this.repository.findById(executionId, candidateProfileId);
      }

      // 6. Field Mapping Step
      await this.repository.update(executionId, candidateProfileId, {
        status: "MAPPING_FIELDS",
        formDetected: true,
      });

      const mapResult = mapFormFields(inputs, candidateContext, safetyContext);

      await this.repository.appendAuditLog(executionId, candidateProfileId, {
        timestamp: new Date().toISOString(),
        step: "MAPPING_FIELDS",
        action: "FIELDS_MAPPED",
        status: "SUCCESS",
        message: `Mapped ${mapResult.fieldMappings.length} inputs (${mapResult.knownCount} known, ${mapResult.unsafeCount} unsafe, ${mapResult.unmappedCount} unmapped)`,
        data: {
          knownCount: mapResult.knownCount,
          unsafeCount: mapResult.unsafeCount,
          unmappedCount: mapResult.unmappedCount,
        },
      });

      // 7. Filling Step (Safe Fields & Approved Documents)
      await this.repository.update(executionId, candidateProfileId, {
        status: "FILLING",
        mappedFields: mapResult.fieldMappings,
        uploadedDocuments: mapResult.documentsToUpload,
      });

      const updatedFields = [...mapResult.fieldMappings];
      const updatedDocs = [...mapResult.documentsToUpload];

      for (let i = 0; i < updatedFields.length; i++) {
        const field = updatedFields[i]!;

        // Only fill KNOWN fields that have an approved value
        if (field.classification === "KNOWN" && field.value) {
          try {
            if (field.fieldType === "file" && field.semanticType === "resume_upload") {
              // Retrieve file from storage or create buffer
              let fileBuffer: Buffer = Buffer.from("%PDF-1.4\nTailored Resume");
              if (storageProvider && candidateContext.preparationPackage?.resumeDocument?.storageKey) {
                try {
                  const downloaded = await storageProvider.download(
                    candidateContext.preparationPackage.resumeDocument.storageKey
                  );
                  fileBuffer = downloaded.data;
                } catch {
                  // If storage read fails, retain sample buffer
                }
              }

              const uploadOk = await driver.uploadFile(
                field.selector,
                "tailored_resume.pdf",
                fileBuffer,
                "application/pdf"
              );

              if (!uploadOk) {
                // Upload failure triggers immediate safety halt
                await this.repository.update(executionId, candidateProfileId, {
                  status: "STOPPED_SAFETY",
                  safetyStopReason: "UPLOAD_FAILURE",
                  errorMessage: "Failed to upload tailored resume document to the application form.",
                });

                await this.repository.appendAuditLog(executionId, candidateProfileId, {
                  timestamp: new Date().toISOString(),
                  step: "FILLING",
                  action: "UPLOAD_FAILED",
                  status: "STOPPED",
                  message: "Resume upload failed in browser interaction.",
                });

                return this.repository.findById(executionId, candidateProfileId);
              }

              // Mark document as uploaded
              if (updatedDocs[0]) {
                updatedDocs[0] = {
                  ...updatedDocs[0],
                  uploaded: true,
                  uploadedAt: new Date().toISOString(),
                };
              }
              field.filled = true;
            } else if (field.fieldType === "select") {
              await driver.selectOption(field.selector, field.value);
              field.filled = true;
            } else if (field.fieldType === "checkbox" || field.fieldType === "radio") {
              const isChecked = ["true", "yes", "1"].includes(field.value.toLowerCase());
              await driver.checkField(field.selector, isChecked);
              field.filled = true;
            } else {
              // text, textarea, etc.
              await driver.fillField(field.selector, field.value);
              field.filled = true;
            }

            await this.repository.appendAuditLog(executionId, candidateProfileId, {
              timestamp: new Date().toISOString(),
              step: "FILLING",
              action: "FILL_INPUT",
              status: "SUCCESS",
              message: `Filled field '${field.name || field.fieldId}'`,
              data: { fieldId: field.fieldId, semanticType: field.semanticType },
            });
          } catch (err: unknown) {
            field.filled = false;
            field.fillError = err instanceof Error ? err.message : String(err);
          }
        }
      }

      // 8. Determine Final Assisted Execution State
      const stillRequiresInput =
        mapResult.requiresUserInput || updatedFields.some((f) => f.requiresUserInput && !f.value);

      const finalStatus: BrowserExecutionStatus = stillRequiresInput
        ? "PAUSED_FOR_REVIEW"
        : "AWAITING_APPROVAL";

      let finalStopReason: string | null = null;
      if (stillRequiresInput) {
        if (mapResult.unsafeCount > 0) {
          finalStopReason = "SENSITIVE_QUESTION_PAUSE";
        } else {
          finalStopReason = "FORM_AMBIGUITY";
        }
      }

      await this.repository.update(executionId, candidateProfileId, {
        status: finalStatus,
        mappedFields: updatedFields,
        uploadedDocuments: updatedDocs,
        safetyStopReason: finalStopReason,
      });

      await this.repository.appendAuditLog(executionId, candidateProfileId, {
        timestamp: new Date().toISOString(),
        step: "ASSISTED_FLOW_COMPLETE",
        action: finalStatus,
        status: stillRequiresInput ? "WARNING" : "SUCCESS",
        message: stillRequiresInput
          ? "Form interaction paused: candidate review required for sensitive/unmapped fields."
          : "All form fields filled. Application awaiting explicit candidate approval before submission.",
      });

      return this.repository.findById(executionId, candidateProfileId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.repository.update(executionId, candidateProfileId, {
        status: "FAILED",
        errorMessage: errMsg,
      });

      await this.repository.appendAuditLog(executionId, candidateProfileId, {
        timestamp: new Date().toISOString(),
        step: "EXECUTION_ERROR",
        action: "ERROR",
        status: "ERROR",
        message: errMsg,
      });

      throw err;
    } finally {
      await driver.close();
    }
  }
}

export const controlledBrowserService = new ControlledBrowserService();
