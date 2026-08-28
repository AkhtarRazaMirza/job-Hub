"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardOverview } from "./types";
import {
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Globe,
  DollarSign,
  Briefcase,
  Layers,
  ArrowUpRight,
  Bookmark,
} from "lucide-react";

interface ProfileOverviewCardProps {
  overview: DashboardOverview;
  onSelectTab?: (tab: "matches" | "saved") => void;
  onSelectDecision?: (decision: string | undefined) => void;
}

export function ProfileOverviewCard({
  overview,
  onSelectTab,
  onSelectDecision,
}: ProfileOverviewCardProps) {
  const { profile, preferences, truthfulness, stats } = overview;

  return (
    <div className="space-y-4">
      {/* Top Banner / Summary Card */}
      <Card className="border-border/80 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                <span>Candidate Dashboard</span>
                <span>•</span>
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {truthfulness.profileCompletionPercentage}% Profile Ready
                </span>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">
                {profile.headline || "Verified Remote Candidate"}
              </CardTitle>

              {preferences && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                    <Globe className="h-3 w-3 text-primary" />
                    {preferences.remotePreference.replace("_", " ")}
                  </span>
                  {preferences.salaryMin && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                      <DollarSign className="h-3 w-3 text-primary" />
                      {preferences.salaryCurrency} {preferences.salaryMin.toLocaleString()}+
                    </span>
                  )}
                  {preferences.targetRoles?.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                      <Briefcase className="h-3 w-3 text-primary" />
                      {preferences.targetRoles.slice(0, 2).join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 self-start">
              <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                <Link href="/profile">
                  <span>Manage Profile</span>
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {/* Truthfulness Breakdown Pill Bar */}
          <div className="flex flex-wrap items-center gap-3 text-xs border-t border-border/40 pt-3">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="font-semibold">{truthfulness.verifiedCount} Verified</span>
              <span className="text-muted-foreground text-[11px]">(Code Proof)</span>
            </div>
            <span className="text-border">•</span>
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="font-semibold">{truthfulness.inferredCount} Inferred</span>
              <span className="text-muted-foreground text-[11px]">(Resume Extract)</span>
            </div>
            <span className="text-border">•</span>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              <span className="font-semibold">{truthfulness.userProvidedCount} Self-Reported</span>
            </div>
          </div>

          {/* Key Metric Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                onSelectTab?.("matches");
                onSelectDecision?.(undefined);
              }}
              className="rounded-lg border border-border/80 bg-background/50 p-3 text-left transition hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
            >
              <div className="text-xs text-muted-foreground font-medium">Total Matches</div>
              <div className="text-2xl font-extrabold text-foreground mt-0.5">{stats.totalMatches}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Evaluated jobs</div>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectTab?.("matches");
                onSelectDecision?.("EXCELLENT_MATCH");
              }}
              className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-left transition hover:border-emerald-500/40 hover:bg-emerald-500/10 cursor-pointer"
            >
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Excellent</div>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {stats.excellentMatches}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Score ≥ 9.0</div>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectTab?.("matches");
                onSelectDecision?.("STRONG_MATCH");
              }}
              className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-left transition hover:border-blue-500/40 hover:bg-blue-500/10 cursor-pointer"
            >
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">Strong</div>
              <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                {stats.strongMatches}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Score 7.5 – 8.9</div>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectTab?.("matches");
                onSelectDecision?.("REVIEW");
              }}
              className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-left transition hover:border-amber-500/40 hover:bg-amber-500/10 cursor-pointer"
            >
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">Review</div>
              <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
                {stats.reviewMatches}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Score 6.0 – 7.4</div>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab?.("saved")}
              className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-left transition hover:border-purple-500/40 hover:bg-purple-500/10 cursor-pointer col-span-2 sm:col-span-1"
            >
              <div className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                <Bookmark className="h-3 w-3" />
                <span>Saved Jobs</span>
              </div>
              <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
                {stats.savedJobsCount}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Bookmarked</div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
