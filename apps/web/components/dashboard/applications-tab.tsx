"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApplicationCard } from "./application-card";
import type { ApplicationFeedItem } from "./types";
import {
  APPLICATION_STATUS,
  type ApplicationStatus,
} from "@job-hub/applications";
import {
  FileText,
  SlidersHorizontal,
  Loader2,
  Send,
  Calendar,
  Award,
  Clock,
} from "lucide-react";

interface ApplicationsTabProps {
  items: ApplicationFeedItem[];
  isLoading: boolean;
  selectedStatus?: string;
  onFilterStatus: (status?: ApplicationStatus) => void;
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

export function ApplicationsTab({
  items,
  isLoading,
  selectedStatus,
  onFilterStatus,
  onTransitionStatus,
  onUpdateNotes,
  onUpdateFollowUp,
  onWithdraw,
  onDelete,
}: ApplicationsTabProps) {
  // Compute counts for status filter pills
  const counts = {
    all: items.length,
    prepared: items.filter((i) => i.status === APPLICATION_STATUS.PREPARED).length,
    applied: items.filter((i) => i.status === APPLICATION_STATUS.APPLIED).length,
    underReview: items.filter((i) => i.status === APPLICATION_STATUS.UNDER_REVIEW).length,
    interview: items.filter(
      (i) =>
        i.status === APPLICATION_STATUS.INTERVIEW_SCHEDULED ||
        i.status === APPLICATION_STATUS.INTERVIEW_COMPLETED
    ).length,
    offer: items.filter((i) => i.status === APPLICATION_STATUS.OFFER).length,
    terminal: items.filter(
      (i) =>
        i.status === APPLICATION_STATUS.REJECTED ||
        i.status === APPLICATION_STATUS.WITHDRAWN
    ).length,
  };

  const filteredItems = selectedStatus
    ? items.filter((i) => i.status === selectedStatus)
    : items;

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border border-border/60">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
            <SlidersHorizontal className="h-3 w-3" />
            <span>Status:</span>
          </span>

          <Button
            type="button"
            variant={selectedStatus === undefined ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onFilterStatus(undefined)}
            className="h-7 text-xs px-2.5 cursor-pointer"
          >
            All ({counts.all})
          </Button>

          <Button
            type="button"
            variant={selectedStatus === APPLICATION_STATUS.PREPARED ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onFilterStatus(APPLICATION_STATUS.PREPARED)}
            className="h-7 text-xs px-2.5 text-amber-600 dark:text-amber-400 cursor-pointer"
          >
            Prepared ({counts.prepared})
          </Button>

          <Button
            type="button"
            variant={selectedStatus === APPLICATION_STATUS.APPLIED ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onFilterStatus(APPLICATION_STATUS.APPLIED)}
            className="h-7 text-xs px-2.5 text-blue-600 dark:text-blue-400 cursor-pointer"
          >
            Applied ({counts.applied})
          </Button>

          <Button
            type="button"
            variant={selectedStatus === APPLICATION_STATUS.UNDER_REVIEW ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onFilterStatus(APPLICATION_STATUS.UNDER_REVIEW)}
            className="h-7 text-xs px-2.5 text-purple-600 dark:text-purple-400 cursor-pointer"
          >
            Review ({counts.underReview})
          </Button>

          <Button
            type="button"
            variant={
              selectedStatus === APPLICATION_STATUS.INTERVIEW_SCHEDULED
                ? "secondary"
                : "ghost"
            }
            size="sm"
            onClick={() => onFilterStatus(APPLICATION_STATUS.INTERVIEW_SCHEDULED)}
            className="h-7 text-xs px-2.5 text-cyan-600 dark:text-cyan-400 cursor-pointer"
          >
            Interview ({counts.interview})
          </Button>

          <Button
            type="button"
            variant={selectedStatus === APPLICATION_STATUS.OFFER ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onFilterStatus(APPLICATION_STATUS.OFFER)}
            className="h-7 text-xs px-2.5 text-emerald-600 dark:text-emerald-400 cursor-pointer"
          >
            Offer ({counts.offer})
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm">Loading applications pipeline...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-card/40 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 mb-4">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-foreground">
            {selectedStatus ? `No Applications in '${selectedStatus}'` : "No Applications Tracked Yet"}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
            {selectedStatus
              ? "No job applications match this status filter. Select another filter or view all."
              : "Track the full lifecycle of your job applications: prepare, submit, schedule interviews, record next actions, and monitor outcomes."}
          </p>
          {selectedStatus && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onFilterStatus(undefined)}
              className="mt-4 text-xs h-8 cursor-pointer"
            >
              Show All Applications
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <ApplicationCard
              key={item.id}
              item={item}
              onTransitionStatus={onTransitionStatus}
              onUpdateNotes={onUpdateNotes}
              onUpdateFollowUp={onUpdateFollowUp}
              onWithdraw={onWithdraw}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
