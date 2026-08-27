"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpcClient } from "@/lib/trpc/client";
import type {
  PortfolioExtractionResult,
  PortfolioProjectDraft,
  Project,
} from "@job-hub/candidate";
import {
  Globe,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  HelpCircle,
} from "lucide-react";

function normalizeProject(raw: any): Project {
  return {
    ...raw,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(raw.updatedAt),
  };
}

interface PortfolioSectionProps {
  initialPortfolioUrl?: string | null;
  onProjectsAdded?: (projects: Project[]) => void;
}

export function PortfolioSection({
  initialPortfolioUrl = null,
  onProjectsAdded,
}: PortfolioSectionProps) {
  const [portfolioUrlInput, setPortfolioUrlInput] = useState(initialPortfolioUrl || "");
  const [savedPortfolioUrl, setSavedPortfolioUrl] = useState<string | null>(initialPortfolioUrl);
  const [isCrawling, setIsCrawling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractionDraft, setExtractionDraft] = useState<PortfolioExtractionResult | null>(null);
  const [selectedProjectIndexes, setSelectedProjectIndexes] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title?: string;
    message: string;
  } | null>(null);

  async function handleCrawl(e: React.FormEvent) {
    e.preventDefault();
    if (!portfolioUrlInput.trim()) return;

    setIsCrawling(true);
    setFeedback(null);
    setExtractionDraft(null);

    try {
      const result = await trpcClient.candidate.crawlPortfolio.mutate({
        portfolioUrl: portfolioUrlInput.trim(),
      });
      setExtractionDraft(result);
      // Select all extracted projects by default for convenience
      setSelectedProjectIndexes(new Set(result.projects.map((_, i) => i)));
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to crawl portfolio website.";

      setFeedback({
        type: "error",
        title: "Portfolio Crawl Failed",
        message,
      });
    } finally {
      setIsCrawling(false);
    }
  }

  function toggleProjectSelection(index: number) {
    setSelectedProjectIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  async function handleConfirmSave() {
    if (!extractionDraft || selectedProjectIndexes.size === 0) return;

    setIsSaving(true);
    setFeedback(null);

    const projectsToSave: PortfolioProjectDraft[] = extractionDraft.projects.filter((_, i) =>
      selectedProjectIndexes.has(i)
    );

    try {
      const created = await trpcClient.candidate.confirmPortfolio.mutate({
        portfolioUrl: extractionDraft.portfolioUrl,
        projects: projectsToSave.map((p) => ({
          name: p.name,
          description: p.description,
          url: p.url,
          roleDescription: p.roleDescription,
          technologies: p.technologies,
          caseStudySummary: p.caseStudySummary,
        })),
      });

      setSavedPortfolioUrl(extractionDraft.portfolioUrl);
      setExtractionDraft(null);
      setFeedback({
        type: "success",
        title: "Portfolio Projects Confirmed",
        message: `Successfully confirmed and saved ${created.length} project(s) to your profile.`,
      });

      if (onProjectsAdded) {
        onProjectsAdded(created.map(normalizeProject));
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to save portfolio projects.";

      setFeedback({
        type: "error",
        title: "Confirmation Failed",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <CardTitle className="text-xl">Portfolio Website Ingestion</CardTitle>
            <CardDescription>
              Crawl your portfolio site to extract project summaries, case studies, and technologies. Grounded in 02_how_to_build.md §3.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {feedback && (
          <Alert
            variant={feedback.type === "error" ? "destructive" : "default"}
            className={feedback.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : ""}
          >
            {feedback.type === "error" ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            {feedback.title && <AlertTitle className="text-xs font-semibold">{feedback.title}</AlertTitle>}
            <AlertDescription className="text-xs mt-0.5">{feedback.message}</AlertDescription>
          </Alert>
        )}

        {savedPortfolioUrl && !extractionDraft && (
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/30 border text-xs">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Linked Portfolio:</span>
              <span className="font-medium text-foreground truncate max-w-sm">{savedPortfolioUrl}</span>
            </div>
            <a
              href={savedPortfolioUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              <span>Visit</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Portfolio Crawl Form */}
        <form onSubmit={handleCrawl} className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={portfolioUrlInput}
            onChange={(e) => setPortfolioUrlInput(e.target.value)}
            placeholder="https://yourportfolio.dev"
            disabled={isCrawling}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
          <Button type="submit" disabled={isCrawling || !portfolioUrlInput.trim()} size="sm" className="gap-1.5">
            {isCrawling ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Crawling Site...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Crawl & Extract</span>
              </>
            )}
          </Button>
        </form>

        {/* Extraction Draft Preview & Confirmation */}
        {extractionDraft && (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-foreground">Extracted Portfolio Draft</h4>
                <p className="text-xs text-muted-foreground">
                  Grounded in 04_ai_agent_skills.md §2: Portfolio claims are self-reported and classified as INFERRED.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1">
                <HelpCircle className="h-2.5 w-2.5" />
                INFERRED CLAIMS
              </Badge>
            </div>

            {extractionDraft.candidateHeadline && (
              <div className="text-xs">
                <strong className="text-foreground">Headline: </strong>
                <span className="text-muted-foreground">{extractionDraft.candidateHeadline}</span>
              </div>
            )}

            {extractionDraft.detectedSkills && extractionDraft.detectedSkills.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Detected Competencies & Skills
                </p>
                <div className="flex flex-wrap gap-1">
                  {extractionDraft.detectedSkills.map((s, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {extractionDraft.projects.length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold text-foreground">
                  Select Projects to Confirm & Save ({selectedProjectIndexes.size} of {extractionDraft.projects.length} selected):
                </p>
                <div className="space-y-2">
                  {extractionDraft.projects.map((proj, idx) => {
                    const isSelected = selectedProjectIndexes.has(idx);
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleProjectSelection(idx)}
                        className={`p-3 rounded-md border text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border/60 bg-background/50 hover:border-border"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-primary"
                            />
                            <span className="font-medium text-foreground">{proj.name}</span>
                          </div>
                          <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                            INFERRED
                          </Badge>
                        </div>

                        {proj.description && (
                          <p className="mt-1 text-muted-foreground pl-5.5 text-[11px]">
                            {proj.description}
                          </p>
                        )}

                        {proj.roleDescription && (
                          <p className="mt-1 text-muted-foreground pl-5.5 text-[11px] italic">
                            Role: {proj.roleDescription}
                          </p>
                        )}

                        {proj.technologies && proj.technologies.length > 0 && (
                          <div className="flex flex-wrap gap-1 pl-5.5 pt-1.5">
                            {proj.technologies.map((t, tidx) => (
                              <span
                                key={tidx}
                                className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground font-mono"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No distinct project sections detected on this page.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExtractionDraft(null)}
                disabled={isSaving}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmSave}
                disabled={isSaving || selectedProjectIndexes.size === 0}
                className="text-xs h-8 gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    <span>Confirm & Save Selected ({selectedProjectIndexes.size})</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
