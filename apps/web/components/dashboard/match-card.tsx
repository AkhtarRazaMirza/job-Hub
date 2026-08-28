"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MatchFeedItem } from "./types";
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Globe,
  DollarSign,
  Building2,
  Clock,
  Loader2,
} from "lucide-react";

interface MatchCardProps {
  item: MatchFeedItem;
  onToggleSave: (jobId: string, isSaved: boolean, savedJobId: string | null) => Promise<void>;
}

export function MatchCard({ item, onToggleSave }: MatchCardProps) {
  const { match, job, isSaved, savedJobId } = item;
  const [isSaving, setIsSaving] = useState(false);

  // Format decision badge styling
  const getDecisionBadge = (decision: string, score: number) => {
    switch (decision) {
      case "EXCELLENT_MATCH":
        return {
          label: "Excellent Match",
          className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
          scoreBg: "bg-emerald-600 text-white dark:bg-emerald-500",
        };
      case "STRONG_MATCH":
        return {
          label: "Strong Match",
          className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
          scoreBg: "bg-blue-600 text-white dark:bg-blue-500",
        };
      case "REVIEW":
        return {
          label: "Review",
          className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
          scoreBg: "bg-amber-600 text-white dark:bg-amber-500",
        };
      default:
        return {
          label: "Skip",
          className: "bg-muted text-muted-foreground border-border",
          scoreBg: "bg-muted text-muted-foreground",
        };
    }
  };

  const badgeInfo = getDecisionBadge(match.decision, match.overallScore);

  const handleSaveClick = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onToggleSave(job.id, isSaved, savedJobId);
    } finally {
      setIsSaving(false);
    }
  };

  // Salary formatting
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
    <Card className="border-border/80 shadow-sm transition hover:border-primary/40 bg-card/60 backdrop-blur-sm overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center justify-center rounded-md font-bold text-sm px-2.5 py-0.5 ${badgeInfo.scoreBg}`}>
                {`${match.overallScore.toFixed(1)} / 10`}
              </span>
              <Badge variant="outline" className={`text-xs font-semibold ${badgeInfo.className}`}>
                {badgeInfo.label}
              </Badge>
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                <Globe className="h-3 w-3 mr-1" />
                {job.remoteType.replace(/_/g, " ")}
              </Badge>
            </div>

            <h3 className="text-lg font-bold text-foreground hover:text-primary transition-colors">
              <a
                href={job.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
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
              {job.location && (
                <span>• {job.location}</span>
              )}
              {formattedSalary && (
                <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="h-3 w-3" />
                  {formattedSalary}
                </span>
              )}
              {job.postedAt && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(job.postedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-start">
            <Button
              type="button"
              variant={isSaved ? "default" : "outline"}
              size="sm"
              onClick={handleSaveClick}
              disabled={isSaving}
              className={`h-8 text-xs gap-1.5 transition ${
                isSaved
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : "hover:border-purple-500 hover:text-purple-600"
              }`}
              aria-label={isSaved ? "Unsave job" : "Save job bookmark"}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isSaved ? (
                <>
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>Save</span>
                </>
              )}
            </Button>

            <Button asChild size="sm" className="h-8 text-xs gap-1">
              <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer">
                <span>View Job</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* AI Match Explanation */}
        {match.explanation && (
          <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/40 pt-2.5">
            {match.explanation}
          </p>
        )}

        {/* Strengths and Gaps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
          {/* Top Strengths */}
          {match.strengths && match.strengths.length > 0 && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-1">
              <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Strengths</span>
              </div>
              <ul className="space-y-1 pl-4 list-disc text-foreground/90">
                {match.strengths.slice(0, 3).map((strength, idx) => (
                  <li key={idx} className="leading-snug">
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gaps / Risks */}
          {((match.gaps && match.gaps.length > 0) || (match.risks && match.risks.length > 0)) && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-1">
              <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Gaps & Considerations</span>
              </div>
              <ul className="space-y-1 pl-4 list-disc text-foreground/90">
                {[...(match.gaps || []), ...(match.risks || [])].slice(0, 3).map((item, idx) => (
                  <li key={idx} className="leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Skills Pills */}
        {job.skills && job.skills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Skills:</span>
            {job.skills.slice(0, 6).map((skill, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
              >
                {skill}
              </span>
            ))}
            {job.skills.length > 6 && (
              <span className="text-[11px] text-muted-foreground">
                +{job.skills.length - 6} more
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
