"use client";

import { useState, useEffect, useCallback } from "react";
import { trpcClient } from "@/lib/trpc/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ApplicationOverviewMetrics,
  ApplicationFunnelMetrics,
  ScoreBandConversionMetrics,
  SourcePerformanceMetrics,
  RolePerformanceMetrics,
  ResumeVersionPerformanceMetrics,
  ApplicationTrendsMetrics,
  TrendGranularity,
} from "@job-hub/applications";
import {
  BarChart3,
  TrendingUp,
  Briefcase,
  CheckCircle2,
  Calendar,
  Layers,
  FileText,
  AlertCircle,
  Loader2,
  RefreshCw,
  Info,
} from "lucide-react";

export function AnalyticsTab() {
  const [granularity, setGranularity] = useState<TrendGranularity>("week");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [overview, setOverview] = useState<ApplicationOverviewMetrics | null>(null);
  const [funnel, setFunnel] = useState<ApplicationFunnelMetrics | null>(null);
  const [scoreBands, setScoreBands] = useState<ScoreBandConversionMetrics[]>([]);
  const [sources, setSources] = useState<SourcePerformanceMetrics[]>([]);
  const [roles, setRoles] = useState<RolePerformanceMetrics[]>([]);
  const [resumeVersions, setResumeVersions] = useState<ResumeVersionPerformanceMetrics[]>([]);
  const [trends, setTrends] = useState<ApplicationTrendsMetrics | null>(null);

  const fetchAllAnalytics = useCallback(
    async (selectedGranularity: TrendGranularity) => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const [
          overviewRes,
          funnelRes,
          scoreBandsRes,
          sourcesRes,
          rolesRes,
          resumeVersionsRes,
          trendsRes,
        ] = await Promise.all([
          trpcClient.analytics.overview.query(),
          trpcClient.analytics.funnel.query(),
          trpcClient.analytics.matchScores.query(),
          trpcClient.analytics.sources.query(),
          trpcClient.analytics.roles.query({ limit: 20 }),
          trpcClient.analytics.resumeVersions.query(),
          trpcClient.analytics.trends.query({ granularity: selectedGranularity }),
        ]);

        setOverview(overviewRes);
        setFunnel(funnelRes);
        setScoreBands(scoreBandsRes);
        setSources(sourcesRes);
        setRoles(rolesRes);
        setResumeVersions(resumeVersionsRes);
        setTrends(trendsRes);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load analytics data");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      trpcClient.analytics.overview.query(),
      trpcClient.analytics.funnel.query(),
      trpcClient.analytics.matchScores.query(),
      trpcClient.analytics.sources.query(),
      trpcClient.analytics.roles.query({ limit: 20 }),
      trpcClient.analytics.resumeVersions.query(),
      trpcClient.analytics.trends.query({ granularity }),
    ])
      .then(
        ([
          overviewRes,
          funnelRes,
          scoreBandsRes,
          sourcesRes,
          rolesRes,
          resumeVersionsRes,
          trendsRes,
        ]) => {
          if (!isMounted) return;
          setOverview(overviewRes);
          setFunnel(funnelRes);
          setScoreBands(scoreBandsRes);
          setSources(sourcesRes);
          setRoles(rolesRes);
          setResumeVersions(resumeVersionsRes);
          setTrends(trendsRes);
          setIsLoading(false);
        }
      )
      .catch((err: any) => {
        if (!isMounted) return;
        setErrorMsg(err.message || "Failed to load analytics data");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [granularity]);

  const handleGranularityChange = (newGranularity: TrendGranularity) => {
    setGranularity(newGranularity);
  };

  if (isLoading && !overview) {
    return (
      <div
        className="flex flex-col items-center justify-center py-24 space-y-3"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">
          Computing truthful candidate analytics...
        </p>
      </div>
    );
  }

  if (errorMsg && !overview) {
    return (
      <div
        className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center space-y-3"
        role="alert"
      >
        <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
        <p className="text-sm font-semibold text-destructive">{errorMsg}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fetchAllAnalytics(granularity)}
          className="text-xs"
        >
          Try Again
        </Button>
      </div>
    );
  }

  const isZeroApplications = !overview || overview.totalApplications === 0;

  return (
    <div className="space-y-8">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Job Search Analytics & Performance
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Truthful metrics derived directly from stored applications and lifecycle events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Granularity Selector */}
          <div
            className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs"
            role="group"
            aria-label="Trends time granularity"
          >
            {(["day", "week", "month"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => handleGranularityChange(g)}
                className={`px-2.5 py-1 rounded capitalize font-medium transition-colors ${
                  granularity === g
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchAllAnalytics(granularity)}
            disabled={isLoading}
            className="h-8 text-xs gap-1.5"
            aria-label="Refresh analytics data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Empty State when 0 Applications */}
      {isZeroApplications ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              No Application Data Yet
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Analytics will display truthful funnel conversions, interview rates, and
              source performance as you prepare and submit job applications.
            </p>
            <div className="pt-2">
              <Badge variant="outline" className="text-xs font-normal">
                Status: Observation Layer Ready
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Section 1: KPI Overview Cards */}
          <section aria-labelledby="kpi-overview-title" className="space-y-3">
            <h3 id="kpi-overview-title" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Key Search Metrics
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Total Applications */}
              <Card className="bg-card">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Total Apps</p>
                  <p className="text-2xl font-bold text-foreground">
                    {overview.totalApplications}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {overview.activeCount} active in-flight
                  </p>
                </CardContent>
              </Card>

              {/* Applied */}
              <Card className="bg-card">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Submitted</p>
                  <p className="text-2xl font-bold text-foreground">
                    {overview.appliedCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {overview.preparedCount} prepared
                  </p>
                </CardContent>
              </Card>

              {/* Response Rate */}
              <Card className="bg-card">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Response Rate</p>
                  <p className="text-2xl font-bold text-foreground">
                    {overview.responseRate.percentage !== null
                      ? `${overview.responseRate.percentage.toFixed(1)}%`
                      : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground" title="Responses received / Total submitted">
                    {overview.responseRate.numerator} of {overview.responseRate.denominator} applied
                  </p>
                </CardContent>
              </Card>

              {/* Interview Rate */}
              <Card className="bg-card">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Interview Rate</p>
                  <p className="text-2xl font-bold text-foreground">
                    {overview.interviewRate.percentage !== null
                      ? `${overview.interviewRate.percentage.toFixed(1)}%`
                      : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground" title="Interviews scheduled or completed / Total submitted">
                    {overview.interviewRate.numerator} of {overview.interviewRate.denominator} applied
                  </p>
                </CardContent>
              </Card>

              {/* Offer Rate */}
              <Card className="bg-card">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Offer Rate</p>
                  <p className="text-2xl font-bold text-foreground">
                    {overview.offerRate.percentage !== null
                      ? `${overview.offerRate.percentage.toFixed(1)}%`
                      : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground" title="Offers received / Total submitted">
                    {overview.offerRate.numerator} of {overview.offerRate.denominator} applied
                  </p>
                </CardContent>
              </Card>

              {/* Average Match Score */}
              <Card className="bg-card">
                <CardContent className="p-4 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Avg Match Score</p>
                  <p className="text-2xl font-bold text-foreground">
                    {overview.averageMatchScore.average !== null
                      ? overview.averageMatchScore.average.toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {overview.averageMatchScore.scoredCount} scored ({overview.averageMatchScore.unscoredCount} unscored)
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Section 2: Application Funnel */}
          {funnel && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Application Funnel Progression
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">
                    Funnel conversion based on recorded application milestones
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Visual Stage Bars */}
                <div className="space-y-2">
                  {funnel.stages.map((st) => (
                    <div key={st.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-foreground">{st.label}</span>
                        <span className="text-muted-foreground">
                          {st.count} apps {st.percentageOfTotal !== null ? `(${st.percentageOfTotal.toFixed(1)}% of total)` : ""}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(0, st.percentageOfTotal ?? 0))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Terminal Outcomes */}
                <div className="flex items-center gap-4 pt-2 border-t border-border/60 text-xs text-muted-foreground">
                  <div>
                    <span className="font-semibold text-foreground">Rejected: </span>
                    {funnel.terminalOutcomes.rejected.count} apps
                    {funnel.terminalOutcomes.rejected.percentageOfApplied !== null &&
                      ` (${funnel.terminalOutcomes.rejected.percentageOfApplied.toFixed(1)}% of applied)`}
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Withdrawn: </span>
                    {funnel.terminalOutcomes.withdrawn.count} apps
                  </div>
                </div>

                {/* Accessible Funnel Table */}
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left text-xs border-collapse" aria-label="Application Funnel Stages">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground">
                        <th scope="col" className="py-2 pr-4 font-semibold">Stage</th>
                        <th scope="col" className="py-2 px-4 font-semibold">Count</th>
                        <th scope="col" className="py-2 px-4 font-semibold">% of Total</th>
                        <th scope="col" className="py-2 pl-4 font-semibold">% of Applied</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {funnel.stages.map((st) => (
                        <tr key={st.stage} className="hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium text-foreground">{st.label}</td>
                          <td className="py-2 px-4 text-foreground">{st.count}</td>
                          <td className="py-2 px-4 text-muted-foreground">
                            {st.percentageOfTotal !== null ? `${st.percentageOfTotal.toFixed(1)}%` : "—"}
                          </td>
                          <td className="py-2 pl-4 text-muted-foreground">
                            {st.percentageOfApplied !== null ? `${st.percentageOfApplied.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 3: Interview Conversion by Match-Score Band */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Interview Conversion by Match-Score Band
                </span>
                <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" />
                  Observation of outcomes by score band (non-causal)
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Analyzes actual interview outcomes grouped by match score range. Missing scores are explicitly categorized as Unscored.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse" aria-label="Conversion by Match-Score Band">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-semibold">Match Score Band</th>
                      <th scope="col" className="py-2 px-4 font-semibold">Total Apps</th>
                      <th scope="col" className="py-2 px-4 font-semibold">Submitted</th>
                      <th scope="col" className="py-2 px-4 font-semibold">Interviews</th>
                      <th scope="col" className="py-2 px-4 font-semibold">Offers</th>
                      <th scope="col" className="py-2 pl-4 font-semibold">Interview Conversion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {scoreBands.map((band) => (
                      <tr key={band.band} className="hover:bg-muted/30">
                        <td className="py-2 pr-4 font-medium text-foreground">{band.label}</td>
                        <td className="py-2 px-4 text-foreground">{band.totalApplications}</td>
                        <td className="py-2 px-4 text-foreground">{band.appliedCount}</td>
                        <td className="py-2 px-4 text-foreground">{band.interviewCount}</td>
                        <td className="py-2 px-4 text-foreground">{band.offerCount}</td>
                        <td className="py-2 pl-4 font-medium text-foreground">
                          {band.interviewConversionRate.formatted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Source & Role Performance (2 Columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Source Performance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  Job Source Performance
                </CardTitle>
                <CardDescription className="text-xs">
                  Application outcomes grouped by job discovery source.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No source records found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse" aria-label="Job Source Performance">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground">
                          <th scope="col" className="py-2 pr-3 font-semibold">Source</th>
                          <th scope="col" className="py-2 px-3 font-semibold">Total</th>
                          <th scope="col" className="py-2 px-3 font-semibold">Submitted</th>
                          <th scope="col" className="py-2 px-3 font-semibold">Interview Rate</th>
                          <th scope="col" className="py-2 pl-3 font-semibold">Offer Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {sources.map((s) => (
                          <tr key={s.source} className="hover:bg-muted/30">
                            <td className="py-2 pr-3 font-medium capitalize text-foreground">{s.source}</td>
                            <td className="py-2 px-3 text-foreground">{s.totalApplications}</td>
                            <td className="py-2 px-3 text-foreground">{s.appliedCount}</td>
                            <td className="py-2 px-3 text-foreground">{s.interviewRate.formatted}</td>
                            <td className="py-2 pl-3 text-foreground">{s.offerRate.formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Target Role Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Target Role Performance
                </CardTitle>
                <CardDescription className="text-xs">
                  Outcome distribution by target role title.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {roles.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No role records found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse" aria-label="Target Role Performance">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground">
                          <th scope="col" className="py-2 pr-3 font-semibold">Role</th>
                          <th scope="col" className="py-2 px-3 font-semibold">Total</th>
                          <th scope="col" className="py-2 px-3 font-semibold">Submitted</th>
                          <th scope="col" className="py-2 pl-3 font-semibold">Interview Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {roles.map((r) => (
                          <tr key={r.role} className="hover:bg-muted/30">
                            <td className="py-2 pr-3 font-medium text-foreground">{r.role}</td>
                            <td className="py-2 px-3 text-foreground">{r.totalApplications}</td>
                            <td className="py-2 px-3 text-foreground">{r.appliedCount}</td>
                            <td className="py-2 pl-3 text-foreground">{r.interviewRate.formatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Section 5: Resume Version Performance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Resume Version Performance
              </CardTitle>
              <CardDescription className="text-xs">
                Outcome rates associated with the resume version attached to applications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resumeVersions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No resume versions found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse" aria-label="Resume Version Performance">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground">
                        <th scope="col" className="py-2 pr-4 font-semibold">Resume Document</th>
                        <th scope="col" className="py-2 px-4 font-semibold">Total Applications</th>
                        <th scope="col" className="py-2 px-4 font-semibold">Submitted</th>
                        <th scope="col" className="py-2 px-4 font-semibold">Interviews</th>
                        <th scope="col" className="py-2 px-4 font-semibold">Offers</th>
                        <th scope="col" className="py-2 pl-4 font-semibold">Interview Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {resumeVersions.map((rv, idx) => (
                        <tr key={rv.resumeVersionId ?? `unassigned-${idx}`} className="hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium text-foreground">{rv.versionName}</td>
                          <td className="py-2 px-4 text-foreground">{rv.totalApplications}</td>
                          <td className="py-2 px-4 text-foreground">{rv.appliedCount}</td>
                          <td className="py-2 px-4 text-foreground">{rv.interviewCount}</td>
                          <td className="py-2 px-4 text-foreground">{rv.offerCount}</td>
                          <td className="py-2 pl-4 font-medium text-foreground">{rv.interviewRate.formatted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 6: Application Activity Trends */}
          {trends && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Application Activity Trends ({trends.granularity})
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {trends.totalApplicationsInPeriod} applications in timeline
                  </span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Volume of applications submitted and recorded outcomes bucketed by {trends.granularity}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trends.dataPoints.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    No time-series data available for the current period.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse" aria-label="Application Trends">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground">
                          <th scope="col" className="py-2 pr-4 font-semibold">Period</th>
                          <th scope="col" className="py-2 px-4 font-semibold">Total Apps</th>
                          <th scope="col" className="py-2 px-4 font-semibold">Submitted</th>
                          <th scope="col" className="py-2 px-4 font-semibold">Interviews</th>
                          <th scope="col" className="py-2 px-4 font-semibold">Offers</th>
                          <th scope="col" className="py-2 pl-4 font-semibold">Rejected</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {trends.dataPoints.map((dp) => (
                          <tr key={dp.period} className="hover:bg-muted/30">
                            <td className="py-2 pr-4 font-medium text-foreground">{dp.dateLabel}</td>
                            <td className="py-2 px-4 text-foreground">{dp.totalApplications}</td>
                            <td className="py-2 px-4 text-foreground">{dp.appliedCount}</td>
                            <td className="py-2 px-4 text-foreground">{dp.interviewCount}</td>
                            <td className="py-2 px-4 text-foreground">{dp.offerCount}</td>
                            <td className="py-2 pl-4 text-foreground">{dp.rejectedCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
