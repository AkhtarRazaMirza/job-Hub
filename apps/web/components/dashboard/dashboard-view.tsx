"use client";

import { useState, useCallback } from "react";
import { ProfileOverviewCard } from "./profile-overview-card";
import { MatchCard } from "./match-card";
import { SavedJobsTab } from "./saved-jobs-tab";
import { ApplicationsTab } from "./applications-tab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpcClient } from "@/lib/trpc/client";
import type {
  DashboardOverview,
  MatchFeedItem,
  SavedJobFeedItem,
  ApplicationFeedItem,
  RemoteType,
} from "./types";
import type { ApplicationStatus } from "@job-hub/applications";
import {
  Sparkles,
  Bookmark,
  Send,
  FileText,
  SlidersHorizontal,
  RefreshCw,
  Loader2,
  AlertCircle,
  Briefcase,
} from "lucide-react";

interface DashboardViewProps {
  initialOverview: DashboardOverview | null;
  initialMatches: {
    items: MatchFeedItem[];
    total: number;
    hasMore: boolean;
  } | null;
  initialSavedJobs: {
    items: SavedJobFeedItem[];
    total: number;
    hasMore: boolean;
  } | null;
  initialApplications?: {
    items: ApplicationFeedItem[];
    total: number;
  } | null;
}

export function DashboardView({
  initialOverview,
  initialMatches,
  initialSavedJobs,
  initialApplications,
}: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<"matches" | "saved" | "applications">("matches");
  const [overview, setOverview] = useState<DashboardOverview | null>(initialOverview);

  // Matches Feed State
  const [matches, setMatches] = useState<MatchFeedItem[]>(initialMatches?.items || []);
  const [totalMatches, setTotalMatches] = useState<number>(initialMatches?.total || 0);
  const [hasMoreMatches, setHasMoreMatches] = useState<boolean>(initialMatches?.hasMore || false);
  const [matchesOffset, setMatchesOffset] = useState<number>(0);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  // Filters State
  const [selectedDecision, setSelectedDecision] = useState<string | undefined>(undefined);
  const [selectedMinScore, setSelectedMinScore] = useState<number | undefined>(undefined);
  const [selectedRemoteType, setSelectedRemoteType] = useState<RemoteType | undefined>(undefined);

  // Saved Jobs State
  const [savedJobsList, setSavedJobsList] = useState<SavedJobFeedItem[]>(
    initialSavedJobs?.items || []
  );
  const [totalSavedJobs, setTotalSavedJobs] = useState<number>(
    initialSavedJobs?.total || 0
  );
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  // Error State
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reload Matches based on current filters
  const reloadMatches = useCallback(
    async (decision?: string, minScore?: number, remoteType?: RemoteType, offset = 0) => {
      setIsLoadingMatches(true);
      setErrorMsg(null);
      try {
        const res = await trpcClient.dashboard.matchesFeed.query({
          limit: 20,
          offset,
          decision: decision as any,
          minScore,
          remoteType: remoteType as any,
        });

        if (offset === 0) {
          setMatches(res.items as any);
        } else {
          setMatches((prev) => [...prev, ...(res.items as any)]);
        }
        setTotalMatches(res.total);
        setHasMoreMatches(res.hasMore);
        setMatchesOffset(offset);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load matches");
      } finally {
        setIsLoadingMatches(false);
      }
    },
    []
  );

  // Reload Saved Jobs
  const reloadSavedJobs = useCallback(async () => {
    setIsLoadingSaved(true);
    setErrorMsg(null);
    try {
      const res = await trpcClient.dashboard.savedJobsFeed.query({
        limit: 50,
        offset: 0,
      });
      setSavedJobsList(res.items as any);
      setTotalSavedJobs(res.total);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load saved jobs");
    } finally {
      setIsLoadingSaved(false);
    }
  }, []);

  // Applications State
  const [applicationsList, setApplicationsList] = useState<ApplicationFeedItem[]>(
    initialApplications?.items || []
  );
  const [totalApplications, setTotalApplications] = useState<number>(
    initialApplications?.total || 0
  );
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);
  const [selectedApplicationStatus, setSelectedApplicationStatus] = useState<
    ApplicationStatus | undefined
  >(undefined);

  // Reload Applications
  const reloadApplications = useCallback(
    async (status?: ApplicationStatus) => {
      setIsLoadingApplications(true);
      setErrorMsg(null);
      try {
        const res = await trpcClient.applications.list.query({
          limit: 50,
          status,
        });
        setApplicationsList(res.items as any);
        setTotalApplications(res.total);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load applications");
      } finally {
        setIsLoadingApplications(false);
      }
    },
    []
  );

  const handleTransitionStatus = async (
    id: string,
    toStatus: ApplicationStatus,
    extra?: {
      notes?: string;
      nextAction?: string;
      followUpDate?: string;
      confirmationReference?: string;
    }
  ) => {
    try {
      await trpcClient.applications.transitionStatus.mutate({
        id,
        toStatus,
        ...extra,
      });
      await reloadApplications(selectedApplicationStatus);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to transition application status");
      throw err;
    }
  };

  const handleUpdateApplicationNotes = async (id: string, notes: string | null) => {
    try {
      await trpcClient.applications.updateNotes.mutate({ id, notes });
      await reloadApplications(selectedApplicationStatus);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update notes");
      throw err;
    }
  };

  const handleUpdateApplicationFollowUp = async (
    id: string,
    followUpDate: string | null,
    nextAction: string | null
  ) => {
    try {
      await trpcClient.applications.updateFollowUp.mutate({
        id,
        followUpDate: followUpDate || undefined,
        nextAction: nextAction || undefined,
      });
      await reloadApplications(selectedApplicationStatus);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update follow-up");
      throw err;
    }
  };

  const handleWithdrawApplication = async (id: string, reason?: string) => {
    try {
      await trpcClient.applications.withdraw.mutate({ id, reason });
      await reloadApplications(selectedApplicationStatus);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to withdraw application");
      throw err;
    }
  };

  const handleDeleteApplication = async (id: string) => {
    try {
      await trpcClient.applications.delete.mutate({ id });
      await reloadApplications(selectedApplicationStatus);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete application");
      throw err;
    }
  };

  // Handle Decision Filter Change
  const handleDecisionFilter = (decision: string | undefined) => {
    setSelectedDecision(decision);
    reloadMatches(decision, selectedMinScore, selectedRemoteType, 0);
  };

  // Handle Score Threshold Change
  const handleMinScoreFilter = (minScore: number | undefined) => {
    setSelectedMinScore(minScore);
    reloadMatches(selectedDecision, minScore, selectedRemoteType, 0);
  };

  // Handle Remote Type Filter Change
  const handleRemoteTypeFilter = (remoteType: RemoteType | undefined) => {
    setSelectedRemoteType(remoteType);
    reloadMatches(selectedDecision, selectedMinScore, remoteType, 0);
  };

  // Toggle Save on a Job Match Card
  const handleToggleSave = async (jobId: string, currentSaved: boolean, currentSavedId: string | null) => {
    try {
      if (currentSaved && currentSavedId) {
        // Unsave
        await trpcClient.savedJobs.unsave.mutate({ jobId });

        // Optimistically update matches feed
        setMatches((prev) =>
          prev.map((item) =>
            item.job.id === jobId ? { ...item, isSaved: false, savedJobId: null } : item
          )
        );

        // Optimistically update saved jobs list
        setSavedJobsList((prev) => prev.filter((item) => item.jobId !== jobId));
        setTotalSavedJobs((prev) => Math.max(0, prev - 1));

        // Update stats
        if (overview) {
          setOverview({
            ...overview,
            stats: {
              ...overview.stats,
              savedJobsCount: Math.max(0, overview.stats.savedJobsCount - 1),
            },
          });
        }
      } else {
        // Save
        const newSaved = await trpcClient.savedJobs.save.mutate({ jobId });

        // Optimistically update matches feed
        setMatches((prev) =>
          prev.map((item) =>
            item.job.id === jobId ? { ...item, isSaved: true, savedJobId: newSaved.id } : item
          )
        );

        // Refresh saved jobs list in background
        reloadSavedJobs();

        // Update stats
        if (overview) {
          setOverview({
            ...overview,
            stats: {
              ...overview.stats,
              savedJobsCount: overview.stats.savedJobsCount + 1,
            },
          });
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update saved job");
    }
  };

  // Unsave from Saved Jobs Tab
  const handleUnsaveFromTab = async (jobId: string) => {
    try {
      await trpcClient.savedJobs.unsave.mutate({ jobId });

      // Optimistically update saved jobs list
      setSavedJobsList((prev) => prev.filter((item) => item.jobId !== jobId));
      setTotalSavedJobs((prev) => Math.max(0, prev - 1));

      // Optimistically update matches feed
      setMatches((prev) =>
        prev.map((item) =>
          item.job.id === jobId ? { ...item, isSaved: false, savedJobId: null } : item
        )
      );

      // Update stats
      if (overview) {
        setOverview({
          ...overview,
          stats: {
            ...overview.stats,
            savedJobsCount: Math.max(0, overview.stats.savedJobsCount - 1),
          },
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to remove saved job");
    }
  };

  // Update Notes on Saved Job
  const handleUpdateNotes = async (jobId: string, notes: string | null) => {
    try {
      await trpcClient.savedJobs.updateNotes.mutate({ jobId, notes });
      setSavedJobsList((prev) =>
        prev.map((item) => (item.jobId === jobId ? { ...item, notes } : item))
      );
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save note");
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      {overview && (
        <ProfileOverviewCard
          overview={overview}
          onSelectTab={setActiveTab}
          onSelectDecision={handleDecisionFilter}
        />
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setErrorMsg(null)}
            className="h-6 text-xs px-2"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* View Switcher Tabs: Matches vs Saved Jobs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeTab === "matches" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("matches")}
            className="text-xs h-8 gap-1.5 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Job Matches</span>
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] px-1.5 py-0 rounded-full font-bold"
            >
              {totalMatches}
            </Badge>
          </Button>

          <Button
            type="button"
            variant={activeTab === "saved" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setActiveTab("saved");
              reloadSavedJobs();
            }}
            className="text-xs h-8 gap-1.5 cursor-pointer"
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span>Saved Jobs</span>
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] px-1.5 py-0 rounded-full font-bold"
            >
              {overview?.stats.savedJobsCount ?? totalSavedJobs}
            </Badge>
          </Button>

          <Button
            type="button"
            variant={activeTab === "applications" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setActiveTab("applications");
              reloadApplications(selectedApplicationStatus);
            }}
            className="text-xs h-8 gap-1.5 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Applications</span>
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] px-1.5 py-0 rounded-full font-bold"
            >
              {overview?.stats.totalApplications ?? totalApplications}
            </Badge>
          </Button>
        </div>

        {/* Refresh button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (activeTab === "matches") {
              reloadMatches(selectedDecision, selectedMinScore, selectedRemoteType, 0);
            } else if (activeTab === "saved") {
              reloadSavedJobs();
            } else {
              reloadApplications(selectedApplicationStatus);
            }
          }}
          disabled={isLoadingMatches || isLoadingSaved || isLoadingApplications}
          className="text-xs h-8 gap-1 text-muted-foreground self-end sm:self-auto cursor-pointer"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              isLoadingMatches || isLoadingSaved || isLoadingApplications ? "animate-spin" : ""
            }`}
          />
          <span>Refresh</span>
        </Button>
      </div>

      {/* MATCHES VIEW */}
      {activeTab === "matches" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border border-border/60">
            {/* Decision Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <SlidersHorizontal className="h-3 w-3" />
                <span>Decision:</span>
              </span>

              <Button
                type="button"
                variant={selectedDecision === undefined ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleDecisionFilter(undefined)}
                className="h-7 text-xs px-2.5 cursor-pointer"
              >
                All ({overview?.stats.totalMatches ?? totalMatches})
              </Button>

              <Button
                type="button"
                variant={selectedDecision === "EXCELLENT_MATCH" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleDecisionFilter("EXCELLENT_MATCH")}
                className="h-7 text-xs px-2.5 text-emerald-600 dark:text-emerald-400 cursor-pointer"
              >
                Excellent ({overview?.stats.excellentMatches ?? 0})
              </Button>

              <Button
                type="button"
                variant={selectedDecision === "STRONG_MATCH" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleDecisionFilter("STRONG_MATCH")}
                className="h-7 text-xs px-2.5 text-blue-600 dark:text-blue-400 cursor-pointer"
              >
                Strong ({overview?.stats.strongMatches ?? 0})
              </Button>

              <Button
                type="button"
                variant={selectedDecision === "REVIEW" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleDecisionFilter("REVIEW")}
                className="h-7 text-xs px-2.5 text-amber-600 dark:text-amber-400 cursor-pointer"
              >
                Review ({overview?.stats.reviewMatches ?? 0})
              </Button>
            </div>

            {/* Score & Remote Filters */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={selectedMinScore !== undefined ? String(selectedMinScore) : ""}
                onChange={(e) =>
                  handleMinScoreFilter(
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="">Any Score</option>
                <option value="9">Score ≥ 9.0 (Top)</option>
                <option value="8">Score ≥ 8.0</option>
                <option value="7">Score ≥ 7.0</option>
                <option value="6">Score ≥ 6.0</option>
              </select>

              <select
                value={selectedRemoteType || ""}
                onChange={(e) =>
                  handleRemoteTypeFilter(
                    e.target.value ? (e.target.value as RemoteType) : undefined
                  )
                }
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="">All Remote Types</option>
                <option value="WORLDWIDE_REMOTE">Worldwide Remote</option>
                <option value="COUNTRY_REMOTE">Country Remote</option>
                <option value="REGION_REMOTE">Region Remote</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
          </div>

          {/* Matches List */}
          {isLoadingMatches && matches.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm">Evaluating and ranking remote opportunities...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 p-12 text-center bg-card/30">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3 text-muted-foreground">
                <Briefcase className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">No Matches Found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                No job matches meet your selected filters. Try broadening your criteria or reset the filters above.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedDecision(undefined);
                  setSelectedMinScore(undefined);
                  setSelectedRemoteType(undefined);
                  reloadMatches(undefined, undefined, undefined, 0);
                }}
                className="mt-4 text-xs h-8 cursor-pointer"
              >
                Reset All Filters
              </Button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {matches.map((item) => (
                <MatchCard
                  key={item.match.id}
                  item={item}
                  onToggleSave={handleToggleSave}
                />
              ))}

              {/* Load More Pagination */}
              {hasMoreMatches && (
                <div className="pt-2 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoadingMatches}
                    onClick={() =>
                      reloadMatches(
                        selectedDecision,
                        selectedMinScore,
                        selectedRemoteType,
                        matchesOffset + 20
                      )
                    }
                    className="text-xs h-8 cursor-pointer"
                  >
                    {isLoadingMatches ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : null}
                    <span>Load More Matches</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SAVED JOBS VIEW */}
      {activeTab === "saved" && (
        <div>
          {isLoadingSaved && savedJobsList.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              <p className="text-sm">Loading your bookmarked jobs...</p>
            </div>
          ) : (
            <SavedJobsTab
              items={savedJobsList}
              onUnsave={handleUnsaveFromTab}
              onUpdateNotes={handleUpdateNotes}
            />
          )}
        </div>
      )}

      {/* APPLICATIONS VIEW */}
      {activeTab === "applications" && (
        <ApplicationsTab
          items={applicationsList}
          isLoading={isLoadingApplications}
          selectedStatus={selectedApplicationStatus}
          onFilterStatus={(status) => {
            setSelectedApplicationStatus(status);
            reloadApplications(status);
          }}
          onTransitionStatus={handleTransitionStatus}
          onUpdateNotes={handleUpdateApplicationNotes}
          onUpdateFollowUp={handleUpdateApplicationFollowUp}
          onWithdraw={handleWithdrawApplication}
          onDelete={handleDeleteApplication}
        />
      )}
    </div>
  );
}
