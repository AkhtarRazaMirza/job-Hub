"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SavedJobFeedItem } from "./types";
import {
  Bookmark,
  ExternalLink,
  Trash2,
  Edit3,
  Check,
  Building2,
  Globe,
  DollarSign,
  Clock,
  Loader2,
} from "lucide-react";

interface SavedJobsTabProps {
  items: SavedJobFeedItem[];
  onUnsave: (jobId: string) => Promise<void>;
  onUpdateNotes: (jobId: string, notes: string | null) => Promise<void>;
}

export function SavedJobsTab({ items, onUnsave, onUpdateNotes }: SavedJobsTabProps) {
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>("");
  const [isUpdatingNotes, setIsUpdatingNotes] = useState(false);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);

  const startEdit = (jobId: string, currentNotes: string | null) => {
    setEditingJobId(jobId);
    setNoteDraft(currentNotes || "");
  };

  const cancelEdit = () => {
    setEditingJobId(null);
    setNoteDraft("");
  };

  const handleSaveNotes = async (jobId: string) => {
    setIsUpdatingNotes(true);
    try {
      await onUpdateNotes(jobId, noteDraft.trim() || null);
      setEditingJobId(null);
    } finally {
      setIsUpdatingNotes(false);
    }
  };

  const handleRemove = async (jobId: string) => {
    setIsRemovingId(jobId);
    try {
      await onUnsave(jobId);
    } finally {
      setIsRemovingId(null);
    }
  };

  if (items.length === 0) {
    return (
      <Card className="border-dashed border-border/80 bg-card/40 p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 mb-4">
          <Bookmark className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-bold text-foreground">No Saved Jobs Yet</h3>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
          Bookmark promising job matches to save them here, write personal application notes, and track your active opportunities.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map(({ id, jobId, notes, savedAt, job, match }) => {
        const isEditing = editingJobId === jobId;
        const isRemoving = isRemovingId === jobId;

        const formattedSalary = (() => {
          if (job.salaryMin && job.salaryMax) {
            return `${job.currency || "USD"} ${job.salaryMin.toLocaleString()} – ${job.salaryMax.toLocaleString()}`;
          }
          if (job.salary) {
            return `${job.currency || "USD"} ${job.salary.toLocaleString()}`;
          }
          return null;
        })();

        return (
          <Card
            key={id}
            className="border-border/80 shadow-sm transition bg-card/60 backdrop-blur-sm overflow-hidden"
          >
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {match && (
                      <span className="inline-flex items-center justify-center rounded-md font-bold text-xs px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">
                        Match: {match.overallScore.toFixed(1)}/10
                      </span>
                    )}
                    <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                      <Globe className="h-3 w-3 mr-1" />
                      {job.remoteType.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <h3 className="text-lg font-bold text-foreground">
                    <a
                      href={job.applicationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                    >
                      <span>{job.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                    </a>
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {job.company}
                    </span>
                    {job.location && <span>• {job.location}</span>}
                    {formattedSalary && (
                      <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                        <DollarSign className="h-3 w-3" />
                        {formattedSalary}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px]">
                      <Clock className="h-3 w-3" />
                      Saved on {new Date(savedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-start">
                  <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1">
                    <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer">
                      <span>View Job</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(jobId)}
                    disabled={isRemoving}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1 px-2.5"
                    aria-label="Remove saved job"
                  >
                    {isRemoving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0 space-y-2.5">
              {/* Notes Section */}
              <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 text-xs">
                {isEditing ? (
                  <div className="space-y-2">
                    <label className="font-semibold text-foreground block">
                      Candidate Notes (Visible only to you):
                    </label>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="Add personal application notes, recruiter contacts, or referral status..."
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={cancelEdit}
                        disabled={isUpdatingNotes}
                        className="h-7 text-xs px-2.5"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSaveNotes(jobId)}
                        disabled={isUpdatingNotes}
                        className="h-7 text-xs px-2.5 gap-1"
                      >
                        {isUpdatingNotes ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-3 w-3" />
                            <span>Save Note</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1">
                      <span className="font-semibold text-foreground/80 block">Notes:</span>
                      {notes ? (
                        <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {notes}
                        </p>
                      ) : (
                        <p className="text-muted-foreground/60 italic">
                          No notes added. Click edit to add personal reminders.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(jobId, notes)}
                      className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>{notes ? "Edit" : "Add Note"}</span>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
