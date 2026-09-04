"use client";

import { useState, useEffect, useCallback } from "react";
import { trpcClient } from "@/lib/trpc/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  Recommendation,
  RecommendationStatus,
  RecommendationType,
  ConfidenceLevel,
} from "@job-hub/applications";
import {
  Lightbulb,
  CheckCircle2,
  XCircle,
  TrendingUp,
  RefreshCw,
  Loader2,
  AlertCircle,
  Compass,
  Briefcase,
  Target,
  FileText,
  Sparkles,
  ShieldCheck,
  BarChart,
} from "lucide-react";

export function LearningTab() {
  const [statusFilter, setStatusFilter] = useState<RecommendationStatus | "ALL">("ACTIVE");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async (status: RecommendationStatus | "ALL") => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const filterArg = status === "ALL" ? undefined : status;
      const res = await trpcClient.learning.getRecommendations.query({
        status: filterArg,
        limit: 50,
      });
      setRecommendations(res as Recommendation[]);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load learning recommendations");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const filterArg = statusFilter === "ALL" ? undefined : statusFilter;
    trpcClient.learning.getRecommendations
      .query({
        status: filterArg,
        limit: 50,
      })
      .then((res) => {
        if (!isMounted) return;
        setRecommendations(res as Recommendation[]);
        setIsLoading(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setErrorMsg(err.message || "Failed to load learning recommendations");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [statusFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setErrorMsg(null);
    try {
      await trpcClient.learning.refresh.mutate({ force: true });
      await fetchRecommendations(statusFilter);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to trigger learning refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    setActionInProgressId(id);
    setErrorMsg(null);
    try {
      await trpcClient.learning.acknowledge.mutate({ id });
      setRecommendations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "APPLIED" as RecommendationStatus } : r))
      );
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to apply recommendation");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setActionInProgressId(id);
    setErrorMsg(null);
    try {
      await trpcClient.learning.dismiss.mutate({ id });
      setRecommendations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "DISMISSED" as RecommendationStatus } : r))
      );
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to dismiss recommendation");
    } finally {
      setActionInProgressId(null);
    }
  };

  const getTypeIcon = (type: RecommendationType) => {
    switch (type) {
      case "ROLE_FOCUS":
        return <Briefcase className="h-4 w-4 text-blue-500" />;
      case "SOURCE_FOCUS":
        return <Compass className="h-4 w-4 text-emerald-500" />;
      case "MATCH_SCORE_BAND":
        return <Target className="h-4 w-4 text-purple-500" />;
      case "RESUME_VERSION":
        return <FileText className="h-4 w-4 text-amber-500" />;
      case "SKILL_INSIGHT":
        return <Sparkles className="h-4 w-4 text-indigo-500" />;
      default:
        return <Lightbulb className="h-4 w-4 text-primary" />;
    }
  };

  const getConfidenceBadge = (confidence: ConfidenceLevel) => {
    switch (confidence) {
      case "HIGH":
        return (
          <Badge variant="secondary" className="text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 text-[11px] font-medium">
            High Confidence (≥10 apps)
          </Badge>
        );
      case "MEDIUM":
        return (
          <Badge variant="secondary" className="text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 text-[11px] font-medium">
            Medium Confidence (4–9 apps)
          </Badge>
        );
      case "LOW_CONFIDENCE":
        return (
          <Badge variant="outline" className="text-muted-foreground text-[11px] font-medium">
            Low Confidence (&lt;4 apps)
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: RecommendationStatus) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge variant="default" className="text-[11px]">
            Active
          </Badge>
        );
      case "APPLIED":
        return (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px]">
            Acknowledged
          </Badge>
        );
      case "DISMISSED":
        return (
          <Badge variant="outline" className="text-muted-foreground line-through text-[11px]">
            Dismissed
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Candidate Learning & Strategy Insights
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deterministic observations derived from real application outcomes to guide your future job search.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter Tabs */}
          <div
            className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs"
            role="group"
            aria-label="Filter recommendations by status"
          >
            {(["ACTIVE", "APPLIED", "DISMISSED", "ALL"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded capitalize font-medium transition-colors cursor-pointer ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.toLowerCase()}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="h-8 text-xs gap-1.5 cursor-pointer"
            aria-label="Refresh learning recommendations"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "Analyzing..." : "Refresh"}</span>
          </Button>
        </div>
      </div>

      {/* Safety Notice: Candidate Truth Invariant */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs">
          <p className="font-semibold text-foreground">Truthful Advisory Only</p>
          <p className="text-muted-foreground leading-relaxed">
            Recommendations never alter your verified skills, experience, or master resume.
            All insights are non-causal observations highlighting where your applications have historically seen the strongest interview and response rates.
          </p>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs font-medium text-destructive flex items-center gap-2"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading && recommendations.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-24 space-y-3"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">
            Analyzing application outcome patterns...
          </p>
        </div>
      ) : recommendations.length === 0 ? (
        /* Empty State */
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {statusFilter === "ACTIVE" ? "No Active Recommendations" : "No Recommendations Found"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              The learning engine requires at least 3 submitted applications with recorded outcomes
              to detect statistically valid patterns across roles, sources, score bands, and skills.
            </p>
            <div className="pt-2">
              <Badge variant="outline" className="text-xs font-normal">
                Status: Learning Engine Ready
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Recommendations Feed */
        <div className="space-y-4" role="feed" aria-label="Learning recommendations">
          {recommendations.map((rec) => {
            const isProcessing = actionInProgressId === rec.id;
            return (
              <Card key={rec.id} className="border bg-card shadow-sm hover:border-border transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getTypeIcon(rec.type)}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {rec.type.replace(/_/g, " ")}
                        </span>
                        {getConfidenceBadge(rec.confidence)}
                        {getStatusBadge(rec.status)}
                      </div>
                      <CardTitle className="text-base font-bold text-foreground pt-1">
                        {rec.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        Target: <span className="font-semibold text-foreground">{rec.evidence.primaryValue}</span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 text-xs">
                  {/* Summary & Explanation */}
                  <p className="text-foreground leading-relaxed font-medium">{rec.summary}</p>
                  {rec.explanation && (
                    <p className="text-muted-foreground leading-relaxed bg-muted/30 p-2.5 rounded-md border border-border/40">
                      {rec.explanation}
                    </p>
                  )}

                  {/* Evidence Cohort Table */}
                  {rec.evidence?.primaryMetric && (
                    <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <BarChart className="h-3.5 w-3.5 text-primary" />
                        <span>Empirical Outcome Evidence</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {/* Primary Cohort */}
                        <div className="bg-background/80 p-2.5 rounded border border-border/50 space-y-1">
                          <div className="text-[11px] font-semibold text-primary">
                            Primary: {rec.evidence.primaryValue}
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 text-[11px] text-muted-foreground">
                            <div>Applications: <span className="font-medium text-foreground">{rec.evidence.primaryMetric.applications}</span></div>
                            <div>Interviews: <span className="font-medium text-foreground">{rec.evidence.primaryMetric.interviews}</span></div>
                            <div>Offers: <span className="font-medium text-foreground">{rec.evidence.primaryMetric.offers}</span></div>
                            <div>Rejections: <span className="font-medium text-foreground">{rec.evidence.primaryMetric.rejections}</span></div>
                          </div>
                          <div className="pt-1 text-[11px] font-semibold text-foreground">
                            Interview Rate: {rec.evidence.primaryMetric.disclosureText}
                          </div>
                        </div>

                        {/* Comparison Cohort */}
                        {rec.evidence.comparisonMetric && (
                          <div className="bg-background/80 p-2.5 rounded border border-border/50 space-y-1">
                            <div className="text-[11px] font-semibold text-muted-foreground">
                              Comparison: {rec.evidence.comparisonValue ?? "Overall Baseline"}
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 text-[11px] text-muted-foreground">
                              <div>Applications: <span className="font-medium text-foreground">{rec.evidence.comparisonMetric.applications}</span></div>
                              <div>Interviews: <span className="font-medium text-foreground">{rec.evidence.comparisonMetric.interviews}</span></div>
                              <div>Offers: <span className="font-medium text-foreground">{rec.evidence.comparisonMetric.offers}</span></div>
                              <div>Rejections: <span className="font-medium text-foreground">{rec.evidence.comparisonMetric.rejections}</span></div>
                            </div>
                            <div className="pt-1 text-[11px] font-semibold text-muted-foreground">
                              Interview Rate: {rec.evidence.comparisonMetric.disclosureText}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-1 pb-3.5 flex items-center justify-between gap-3 border-t border-border/50 text-xs">
                  <div className="text-[11px] text-muted-foreground">
                    Generated on {new Date(rec.createdAt).toLocaleDateString()}
                  </div>

                  <div className="flex items-center gap-2">
                    {rec.status === "ACTIVE" ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isProcessing}
                          onClick={() => handleDismiss(rec.id)}
                          className="h-7 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          <span>Dismiss</span>
                        </Button>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          disabled={isProcessing}
                          onClick={() => handleAcknowledge(rec.id)}
                          className="h-7 text-xs cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          <span>Acknowledge & Focus</span>
                        </Button>
                      </>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        {rec.status === "APPLIED" ? "Acknowledged by candidate" : "Dismissed by candidate"}
                      </span>
                    )}
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
