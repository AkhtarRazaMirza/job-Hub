"use client";

/**
 * Job Hub — Phase 8 / Step 8.7
 * Assisted Browser Execution & Human Approval Dialog
 *
 * Grounded in:
 * - 01_build_the_system.md §5 Phase 8 ("Browser agent")
 * - 02_how_to_build.md §13 ("Browser agent flow")
 * - 04_ai_agent_skills.md §14, §15, §16
 *
 * Safety & Submission Invariants:
 * - Controlled browser session for form filling assistance.
 * - Absolute Safety Stops prominently displayed (CAPTCHA, Auth Wall, MFA, Blocked Automation, SSRF).
 * - Pre-submission Human Approval Invariant: Submit button is disabled without explicit confirmation.
 * - Candidate Truthfulness: Unmapped and sensitive fields require candidate verification before submission.
 * - Uncertain submission state clearly communicated without marking application as APPLIED.
 */

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  BrowserExecutionSummary,
  BrowserExecutionStatus,
  BrowserFieldMapping,
  SafetyHaltReason,
} from "@job-hub/applications";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Lock,
  FileCheck,
  XCircle,
  HelpCircle,
  RefreshCw,
  X,
  Send,
  Eye,
  Edit2,
  Check,
} from "lucide-react";

export interface BrowserExecutionDialogProps {
  applicationId: string;
  jobTitle: string;
  company: string;
  applicationUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
  execution?: BrowserExecutionSummary | null;
  isLoading?: boolean;
  onStartExecution?: (applicationId: string, targetUrl?: string) => Promise<void>;
  onConfirmField?: (executionId: string, fieldId: string, value: string) => Promise<void>;
  onApproveAndSubmit?: (executionId: string) => Promise<{
    submissionVerified: boolean;
    confirmationReference?: string;
  }>;
  onCancelExecution?: (executionId: string) => Promise<void>;
}

export function BrowserExecutionDialog({
  applicationId,
  jobTitle,
  company,
  applicationUrl,
  isOpen,
  onClose,
  execution: initialExecution = null,
  isLoading: initialLoading = false,
  onStartExecution,
  onConfirmField,
  onApproveAndSubmit,
  onCancelExecution,
}: BrowserExecutionDialogProps) {
  const [targetUrl, setTargetUrl] = useState(applicationUrl || "");
  const [execution, setExecution] = useState<BrowserExecutionSummary | null>(initialExecution);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Field editing state: fieldId -> editing value
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [isSavingField, setIsSavingField] = useState(false);

  // Human approval checkbox state
  const [userConfirmedReview, setUserConfirmedReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const [uncertainNotice, setUncertainNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentStatus: BrowserExecutionStatus = execution?.status || "INITIALIZING";
  const mappedFields: BrowserFieldMapping[] = execution?.mappedFields || [];

  // Check unresolved fields
  const unresolvedRequiredFields = mappedFields.filter(
    (f) => f.requiresUserInput && !f.value
  );
  const hasUnsafeUnverifiedFields = mappedFields.filter(
    (f) => f.classification === "UNSAFE" && f.confidence !== "VERIFIED"
  );
  const canApproveAndSubmit =
    userConfirmedReview &&
    unresolvedRequiredFields.length === 0 &&
    hasUnsafeUnverifiedFields.length === 0 &&
    currentStatus !== "STOPPED_SAFETY" &&
    currentStatus !== "SUBMITTED_VERIFIED" &&
    !isSubmitting;

  const handleStart = async () => {
    if (!onStartExecution) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      await onStartExecution(applicationId, targetUrl || undefined);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to start execution");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveField = async (fieldId: string) => {
    if (!onConfirmField || !execution) return;
    try {
      setIsSavingField(true);
      await onConfirmField(execution.id, fieldId, editingValue);
      setEditingFieldId(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update field answer");
    } finally {
      setIsSavingField(false);
    }
  };

  const handleSubmit = async () => {
    if (!onApproveAndSubmit || !execution) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const res = await onApproveAndSubmit(execution.id);
      if (res.submissionVerified) {
        setSubmissionSuccess(res.confirmationReference || "Application submitted successfully.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      if (msg.includes("uncertain") || msg.includes("SUBMISSION_UNCERTAIN")) {
        setUncertainNotice(msg);
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!onCancelExecution || !execution) return;
    try {
      setIsLoading(true);
      await onCancelExecution(execution.id);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to cancel execution");
    } finally {
      setIsLoading(false);
    }
  };

  // Helper badge color mappings
  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case "KNOWN":
        return <Badge variant="success">KNOWN</Badge>;
      case "UNSAFE":
        return <Badge variant="destructive">UNSAFE</Badge>;
      case "AMBIGUOUS":
        return <Badge className="bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30">AMBIGUOUS</Badge>;
      default:
        return <Badge variant="secondary">UNKNOWN</Badge>;
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case "VERIFIED":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Verified
          </span>
        );
      case "INFERRED":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
            <HelpCircle className="h-3 w-3" />
            Inferred
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            <AlertTriangle className="h-3 w-3" />
            User Required
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="browser-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto"
    >
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-background shadow-2xl border border-border">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle id="browser-dialog-title" className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Assisted Application Filling
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {currentStatus}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {jobTitle} • {company}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        {/* Content Body */}
        <CardContent className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submission Success Banner */}
          {submissionSuccess && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-700 dark:text-emerald-400 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>Application Successfully Submitted & Verified!</span>
              </div>
              <p className="text-muted-foreground pl-7">
                Confirmation reference: <span className="font-mono font-medium">{submissionSuccess}</span>.
                Application status has been updated to <strong>APPLIED</strong>.
              </p>
            </div>
          )}

          {/* Uncertain Submission Banner */}
          {uncertainNotice && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-400 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span>Submission State Uncertain</span>
              </div>
              <p className="text-muted-foreground pl-7">
                {uncertainNotice}. To prevent duplicate submissions, the application was <strong>NOT</strong> marked as APPLIED. Please inspect the employer portal or your confirmation email.
              </p>
            </div>
          )}

          {/* Absolute Safety Halt Banner */}
          {currentStatus === "STOPPED_SAFETY" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-destructive text-sm">
                <ShieldAlert className="h-5 w-5" />
                <span>Safety Stop Triggered: {execution?.safetyStopReason || "SECURITY_BARRIER"}</span>
              </div>
              <p className="text-foreground/90 pl-7">
                {execution?.errorMessage ||
                  "The browser agent halted navigation because a security challenge (CAPTCHA, MFA, Auth Wall, or sensitive question) was encountered."}
              </p>
              <div className="pl-7 pt-1">
                <span className="text-[11px] text-muted-foreground">
                  Rule: The agent never attempts to bypass CAPTCHA, scrape unauthorized data, or answer unverified sensitive questions.
                </span>
              </div>
            </div>
          )}

          {/* Step 1: Initialized / Navigation Setup */}
          {(!execution || currentStatus === "INITIALIZING") && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4 text-xs">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                <ExternalLink className="h-4 w-4 text-primary" />
                Application Target URL
              </h3>
              <p className="text-muted-foreground">
                Enter or verify the direct application URL for this job. The browser agent will validate the URL against security rules (anti-SSRF, loopback prohibition, and ATS domain checks) before launching.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/company/jobs/12345"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <Button
                  type="button"
                  onClick={handleStart}
                  disabled={isLoading || !targetUrl.trim()}
                  className="cursor-pointer gap-1.5"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Starting...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Start Form Assistant</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Active Navigation / Detection Indicator */}
          {isLoading && (
            <div className="flex items-center justify-center p-6 border rounded-lg bg-muted/20 gap-3 text-xs text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Controlled browser session is inspecting page elements and mapping fields safely...</span>
            </div>
          )}

          {/* Step 2: Form Inspector & Mapped Fields Checklist */}
          {mappedFields.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-primary" />
                  Inspected Form Fields ({mappedFields.length})
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {unresolvedRequiredFields.length > 0 ? (
                    <span className="text-amber-600 font-medium">
                      {unresolvedRequiredFields.length} field(s) require confirmation
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-medium">
                      All required fields resolved
                    </span>
                  )}
                </span>
              </div>

              <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden">
                {mappedFields.map((field) => {
                  const isEditing = editingFieldId === field.fieldId;

                  return (
                    <div
                      key={field.fieldId}
                      className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {field.label || field.name || field.fieldId}
                          </span>
                          {field.requiresUserInput && (
                            <span className="text-[10px] text-rose-500 font-bold">*Required</span>
                          )}
                          {getClassificationBadge(field.classification)}
                          {getConfidenceBadge(field.confidence || "USER_REQUIRED")}
                        </div>

                        <div className="text-muted-foreground text-[11px] flex flex-wrap items-center gap-3">
                          <span>Type: {field.fieldType}</span>
                          {field.semanticType && <span>Semantic: {field.semanticType}</span>}
                          {field.reason && <span>• {field.reason}</span>}
                        </div>

                        {/* Field Value Display or Edit Box */}
                        {isEditing ? (
                          <div className="flex items-center gap-2 pt-1.5">
                            <input
                              type="text"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              placeholder="Enter confirmed value..."
                              className="flex-1 rounded border border-input bg-background px-2.5 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSaveField(field.fieldId)}
                              disabled={isSavingField}
                              className="h-7 text-xs px-2 gap-1 cursor-pointer"
                            >
                              {isSavingField ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              <span>Confirm</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingFieldId(null)}
                              className="h-7 text-xs px-2 cursor-pointer"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="pt-0.5">
                            <span className="text-foreground/90 font-mono bg-muted/40 px-2 py-0.5 rounded border border-border/40 text-[11px]">
                              {field.value || <span className="italic text-muted-foreground/60">No value set</span>}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Edit / Confirm Button */}
                      {!isEditing && (
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingFieldId(field.fieldId);
                              setEditingValue(field.value || "");
                            }}
                            className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>{field.value ? "Edit" : "Provide Value"}</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Attached Documents */}
          {execution?.uploadedDocuments && execution.uploadedDocuments.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                <FileCheck className="h-3.5 w-3.5 text-primary" />
                Attached Application Documents
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {execution.uploadedDocuments.map((doc, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded border border-border/60 bg-muted/20 text-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-foreground">{doc.fileName}</p>
                      <p className="text-[11px] text-muted-foreground">Type: {doc.documentType}</p>
                    </div>
                    <Badge variant={doc.uploaded ? "success" : "secondary"} className="text-[10px]">
                      {doc.uploaded ? "Uploaded" : "Pending Approval"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Pre-submission Human Approval Invariant */}
          {execution && currentStatus !== "SUBMITTED_VERIFIED" && (
            <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-foreground text-xs">
                    Pre-Submission Human Approval Gate
                  </h4>
                  <p className="text-muted-foreground text-[11px]">
                    The browser agent will never submit on your behalf without your explicit authorization. Please verify the accuracy of all filled fields above.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="confirm-submission-checkbox"
                  checked={userConfirmedReview}
                  onChange={(e) => setUserConfirmedReview(e.target.checked)}
                  disabled={unresolvedRequiredFields.length > 0 || currentStatus === "STOPPED_SAFETY"}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                />
                <label
                  htmlFor="confirm-submission-checkbox"
                  className="text-xs font-medium text-foreground cursor-pointer select-none"
                >
                  I have reviewed all filled fields and authorize final submission to {company}.
                </label>
              </div>

              {unresolvedRequiredFields.length > 0 && (
                <p className="text-[11px] text-amber-600 font-medium">
                  Please provide and confirm answers for all required fields marked above before approving.
                </p>
              )}

              {hasUnsafeUnverifiedFields.length > 0 && (
                <p className="text-[11px] text-rose-600 font-medium">
                  Sensitive questions (e.g. visa, salary, demographics) must be verified before approval.
                </p>
              )}
            </div>
          )}
        </CardContent>

        {/* Footer Actions */}
        <CardHeader className="flex flex-row items-center justify-between border-t pt-4 pb-4 shrink-0 bg-muted/10">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Cancel Execution
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs cursor-pointer"
            >
              Close
            </Button>

            {execution && currentStatus !== "SUBMITTED_VERIFIED" && (
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handleSubmit}
                disabled={!canApproveAndSubmit}
                className="text-xs gap-1.5 cursor-pointer font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Approve & Submit Application</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
