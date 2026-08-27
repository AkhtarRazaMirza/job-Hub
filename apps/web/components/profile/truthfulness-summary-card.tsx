"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TruthfulnessSummary } from "@job-hub/candidate";
import {
  ShieldCheck,
  HelpCircle,
  UserCheck,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

interface TruthfulnessSummaryCardProps {
  truthfulness: TruthfulnessSummary;
}

export function TruthfulnessSummaryCard({ truthfulness }: TruthfulnessSummaryCardProps) {
  return (
    <Card className="border-primary/20 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-lg">Profile Truthfulness & Ingestion Audit</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Completeness:</span>
            <span className="text-sm font-bold text-foreground">
              {truthfulness.profileCompletionPercentage}%
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500 rounded-full"
            style={{ width: `${truthfulness.profileCompletionPercentage}%` }}
          />
        </div>

        {/* Fact Status Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Verified</span>
            </div>
            <p className="mt-1 text-xl font-bold text-foreground">{truthfulness.verifiedCount}</p>
            <p className="text-[10px] text-muted-foreground">Code & repo proof</p>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <HelpCircle className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Inferred</span>
            </div>
            <p className="mt-1 text-xl font-bold text-foreground">{truthfulness.inferredCount}</p>
            <p className="text-[10px] text-muted-foreground">Unverified claims</p>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5">
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <UserCheck className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">User Confirmed</span>
            </div>
            <p className="mt-1 text-xl font-bold text-foreground">{truthfulness.userProvidedCount}</p>
            <p className="text-[10px] text-muted-foreground">Explicit user inputs</p>
          </div>

          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Missing</span>
            </div>
            <p className="mt-1 text-xl font-bold text-foreground">{truthfulness.userRequiredCount}</p>
            <p className="text-[10px] text-muted-foreground">Requires your input</p>
          </div>
        </div>

        {/* Missing Required Fields Callout */}
        {truthfulness.missingRequiredFields.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Recommended actions to improve matching accuracy:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {truthfulness.missingRequiredFields.map((field, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-300"
                >
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
