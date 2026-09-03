"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApplicationFeedItem } from "./types";
import {
  APPLICATION_STATUS,
  APPLICATION_STATUS_LABELS,
  isTerminalStatus,
  getAllowedTransitions,
  type ApplicationStatus,
} from "@job-hub/applications";
import {
  Building2,
  Globe,
  DollarSign,
  Clock,
  ExternalLink,
  Edit3,
  Check,
  X,
  Calendar,
  AlertCircle,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react";

interface ApplicationCardProps {
  item: ApplicationFeedItem;
  onTransitionStatus: (
    id: string,
    toStatus: ApplicationStatus,
    extra?: {
      notes?: string;
      nextAction?: string;
      followUpDate?: string;
      confirmationReference?: string;
    }
  ) => Promise<void>;
  onUpdateNotes: (id: string, notes: string | null) => Promise<void>;
  onUpdateFollowUp: (
    id: string,
    followUpDate: string | null,
    nextAction: string | null
  ) => Promise<void>;
  onWithdraw: (id: string, reason?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ApplicationCard({
  item,
  onTransitionStatus,
  onUpdateNotes,
  onUpdateFollowUp,
  onWithdraw,
  onDelete,
}: ApplicationCardProps) {
  const currentStatus = item.status as ApplicationStatus;
  const isTerminal = isTerminalStatus(currentStatus);
  const allowedTransitions = getAllowedTransitions(currentStatus);

  // Note editing state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.notes || "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Follow-up editing state
  const [isEditingFollowUp, setIsEditingFollowUp] = useState(false);
  const [nextActionDraft, setNextActionDraft] = useState(item.nextAction || "");
  const [followUpDateDraft, setFollowUpDateDraft] = useState(
    item.followUpDate ? new Date(item.followUpDate).toISOString().slice(0, 10) : ""
  );
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false);

  // Transition / Action loading state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedNextStatus, setSelectedNextStatus] = useState<string>("");
  const [confirmationRefDraft, setConfirmationRefDraft] = useState(
    item.confirmationReference || ""
  );
  const [showTransitionModal, setShowTransitionModal] = useState(false);

  // Status Badge Styling
  const getStatusBadgeProps = (status: ApplicationStatus) => {
    switch (status) {
      case APPLICATION_STATUS.PREPARED:
        return {
          label: "Prepared",
          className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
        };
      case APPLICATION_STATUS.APPLIED:
        return {
          label: "Applied",
          className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
        };
      case APPLICATION_STATUS.UNDER_REVIEW:
        return {
          label: "Under Review",
          className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
        };
      case APPLICATION_STATUS.INTERVIEW_SCHEDULED:
        return {
          label: "Interview Scheduled",
          className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
        };
      case APPLICATION_STATUS.INTERVIEW_COMPLETED:
        return {
          label: "Interview Completed",
          className: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
        };
      case APPLICATION_STATUS.OFFER:
        return {
          label: "Offer",
          className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold",
        };
      case APPLICATION_STATUS.REJECTED:
        return {
          label: "Rejected",
          className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
        };
      case APPLICATION_STATUS.WITHDRAWN:
        return {
          label: "Withdrawn",
          className: "bg-muted text-muted-foreground border-border/80",
        };
      default:
        return {
          label: status,
          className: "bg-muted text-foreground border-border",
        };
    }
  };

  const statusBadge = getStatusBadgeProps(currentStatus);

  const formattedSalary = (() => {
    if (item.job.salaryMin && item.job.salaryMax) {
      return `${item.job.currency || "USD"} ${item.job.salaryMin.toLocaleString()} – ${item.job.salaryMax.toLocaleString()}`;
    }
    return null;
  })();

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      await onUpdateNotes(item.id, noteDraft.trim() || null);
      setIsEditingNotes(false);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveFollowUp = async () => {
    setIsSavingFollowUp(true);
    try {
      const parsedDate = followUpDateDraft
        ? new Date(followUpDateDraft).toISOString()
        : null;
      await onUpdateFollowUp(item.id, parsedDate, nextActionDraft.trim() || null);
      setIsEditingFollowUp(false);
    } finally {
      setIsSavingFollowUp(false);
    }
  };

  const executeTransition = async (targetStatus: ApplicationStatus) => {
    setIsTransitioning(true);
    try {
      await onTransitionStatus(item.id, targetStatus, {
        confirmationReference: confirmationRefDraft.trim() || undefined,
      });
      setShowTransitionModal(false);
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <Card className="border-border/80 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden transition hover:border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            {/* Badges Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`text-xs font-semibold ${statusBadge.className}`}>
                {statusBadge.label}
              </Badge>

              {item.matchScore && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-3 w-3" />
                  <span>{`Match: ${parseFloat(item.matchScore).toFixed(1)} / 10`}</span>
                </span>
              )}

              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                <Globe className="h-3 w-3 mr-1" />
                {item.job.remoteType.replace(/_/g, " ")}
              </Badge>

              <span className="text-[11px] text-muted-foreground">
                Source: <span className="font-medium text-foreground">{item.source}</span>
              </span>

              {item.confirmationReference && (
                <Badge variant="secondary" className="text-[11px] font-mono">
                  Ref: {item.confirmationReference}
                </Badge>
              )}
            </div>

            {/* Role & Company */}
            <h3 className="text-lg font-bold text-foreground">
              {item.applicationUrl ? (
                <a
                  href={item.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  <span>{item.role}</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                </a>
              ) : (
                <span>{item.role}</span>
              )}
            </h3>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {item.company}
              </span>
              {item.job.location && <span>• {item.job.location}</span>}
              {formattedSalary && (
                <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="h-3 w-3" />
                  {formattedSalary}
                </span>
              )}
              {item.submittedAt && (
                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Applied {new Date(item.submittedAt).toLocaleDateString()}</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Status Transition Selector */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {isTerminal ? (
              <span className="text-xs italic text-muted-foreground bg-muted/40 px-2.5 py-1 rounded border border-border/40">
                Terminal State
              </span>
            ) : allowedTransitions.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground hidden sm:inline">Move to:</span>
                <select
                  aria-label="Change application status"
                  value={selectedNextStatus}
                  onChange={(e) => {
                    const val = e.target.value as ApplicationStatus;
                    if (val) {
                      setSelectedNextStatus(val);
                      executeTransition(val);
                    }
                  }}
                  disabled={isTransitioning}
                  className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer"
                >
                  <option value="">Update Status...</option>
                  {allowedTransitions.map((status) => (
                    <option key={status} value={status}>
                      {APPLICATION_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                {isTransitioning && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              </div>
            ) : null}

            {/* Delete button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(item.id)}
              className="h-8 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
              title="Delete application record"
              aria-label="Delete application"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0 border-t border-border/40 mt-1">
        {/* Next Action & Follow-up Section */}
        <div className="bg-muted/30 rounded-md p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>Next Action & Follow-up</span>
            </span>
            {!isEditingFollowUp ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNextActionDraft(item.nextAction || "");
                  setFollowUpDateDraft(
                    item.followUpDate
                      ? new Date(item.followUpDate).toISOString().slice(0, 10)
                      : ""
                  );
                  setIsEditingFollowUp(true);
                }}
                className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Edit3 className="h-3 w-3" />
                <span>{item.nextAction || item.followUpDate ? "Edit" : "Set Follow-up"}</span>
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={handleSaveFollowUp}
                  disabled={isSavingFollowUp}
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                >
                  {isSavingFollowUp ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Save</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingFollowUp(false)}
                  className="h-6 px-1.5 text-[11px] text-muted-foreground cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {isEditingFollowUp ? (
            <div className="space-y-2 mt-2">
              <input
                type="text"
                value={nextActionDraft}
                onChange={(e) => setNextActionDraft(e.target.value)}
                placeholder="e.g. Follow up on LinkedIn with hiring manager"
                className="w-full rounded border border-input bg-background px-2.5 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-muted-foreground">Due Date:</label>
                <input
                  type="date"
                  value={followUpDateDraft}
                  onChange={(e) => setFollowUpDateDraft(e.target.value)}
                  className="rounded border border-input bg-background px-2 py-0.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
              {item.nextAction ? (
                <span className="font-medium text-foreground">{item.nextAction}</span>
              ) : (
                <span className="italic text-muted-foreground/80">No next action set</span>
              )}
              {item.followUpDate && (
                <span className="inline-flex items-center gap-1 text-primary font-medium">
                  <Clock className="h-3 w-3" />
                  <span>Due {new Date(item.followUpDate).toLocaleDateString()}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Notes Section */}
        <div className="rounded-md border border-border/40 p-2.5 text-xs bg-card/40">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Application Notes</span>
            </span>
            {!isEditingNotes ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNoteDraft(item.notes || "");
                  setIsEditingNotes(true);
                }}
                className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Edit3 className="h-3 w-3" />
                <span>{item.notes ? "Edit" : "Add Notes"}</span>
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes}
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                >
                  {isSavingNotes ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Save</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingNotes(false)}
                  className="h-6 px-1.5 text-[11px] text-muted-foreground cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {isEditingNotes ? (
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Record interviewer details, feedback, referral notes, or questions asked..."
              rows={2}
              maxLength={2000}
              className="w-full rounded border border-input bg-background p-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          ) : (
            <p className="text-muted-foreground whitespace-pre-wrap">
              {item.notes || (
                <span className="italic text-muted-foreground/60">
                  No notes recorded yet.
                </span>
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
