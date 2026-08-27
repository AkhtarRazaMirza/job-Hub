"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpcClient } from "@/lib/trpc/client";
import type { Project, GitHubAnalysisResult } from "@job-hub/candidate";
import {
  FolderGit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  ExternalLink,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

export type ProjectItem = Omit<Project, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

function normalizeProject(item: ProjectItem): Project {
  return {
    ...item,
    createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt),
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt),
  };
}

interface ProjectsSectionProps {
  initialProjects?: ProjectItem[];
}

export function ProjectsSection({ initialProjects = [] }: ProjectsSectionProps) {
  const [projectsList, setProjectsList] = useState<Project[]>(() =>
    initialProjects.map(normalizeProject)
  );
  const [repoInput, setRepoInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [analysisDraft, setAnalysisDraft] = useState<GitHubAnalysisResult | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title?: string;
    message: string;
  } | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!repoInput.trim()) return;

    setIsAnalyzing(true);
    setFeedback(null);
    setAnalysisDraft(null);

    try {
      const result = await trpcClient.candidate.analyzeGitHubRepo.mutate({
        repositoryUrl: repoInput.trim(),
      });
      setAnalysisDraft(result);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to analyze GitHub repository.";

      setFeedback({
        type: "error",
        title: "Analysis Failed",
        message,
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleConfirmSave() {
    if (!analysisDraft) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const created = await trpcClient.candidate.confirmProject.mutate({
        name: analysisDraft.name,
        description: analysisDraft.description,
        repositoryUrl: analysisDraft.repositoryUrl,
        primaryLanguage: analysisDraft.primaryLanguage,
        languages: analysisDraft.languages,
        technologies: analysisDraft.technologies,
        architectureEvidence: analysisDraft.architectureEvidence,
        qualityNotes: analysisDraft.qualityNotes,
      });

      setProjectsList((prev) => [...prev, normalizeProject(created)]);
      setAnalysisDraft(null);
      setRepoInput("");
      setFeedback({
        type: "success",
        title: "Project Verified & Saved",
        message: `"${analysisDraft.name}" saved as a verified candidate project with code proof.`,
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to save project.";

      setFeedback({
        type: "error",
        title: "Save Failed",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id);
    setFeedback(null);

    try {
      await trpcClient.candidate.deleteProject.mutate({ id });
      setProjectsList((prev) => prev.filter((p) => p.id !== id));
      setFeedback({
        type: "success",
        message: `Project "${name}" removed from profile.`,
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to delete project.";

      setFeedback({
        type: "error",
        message,
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <FolderGit2 className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <CardTitle className="text-xl">Verified GitHub Projects</CardTitle>
            <CardDescription>
              Analyze repositories to extract verified project information with code proof. Grounded in 02_how_to_build.md §3.
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

        {/* Add Repository Input */}
        <form onSubmit={handleAnalyze} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="e.g. owner/repo or https://github.com/owner/repo"
            disabled={isAnalyzing}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
          <Button type="submit" disabled={isAnalyzing || !repoInput.trim()} size="sm" className="gap-1.5">
            {isAnalyzing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Analyze GitHub Repo</span>
              </>
            )}
          </Button>
        </form>

        {/* Analysis Draft Preview / Confirmation Card */}
        {analysisDraft && (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderGit2 className="h-4 w-4 text-primary" aria-hidden="true" />
                <h4 className="font-semibold text-sm text-foreground">{analysisDraft.name}</h4>
                <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  VERIFIED EVIDENCE
                </Badge>
              </div>
              <a
                href={analysisDraft.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <span>View on GitHub</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {analysisDraft.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {analysisDraft.description}
              </p>
            )}

            {analysisDraft.technologies && analysisDraft.technologies.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Verified Technologies & Frameworks
                </p>
                <div className="flex flex-wrap gap-1">
                  {analysisDraft.technologies.map((t, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysisDraft.architectureEvidence && (
              <div className="text-xs text-muted-foreground bg-background/60 p-2.5 rounded border border-border/40">
                <strong className="text-foreground">Architecture Evidence: </strong>
                {analysisDraft.architectureEvidence}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAnalysisDraft(null)}
                disabled={isSaving}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmSave}
                disabled={isSaving}
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
                    <span>Confirm & Save to Profile</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Existing Projects List */}
        {projectsList.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Confirmed Candidate Projects ({projectsList.length})
            </p>
            <div className="grid gap-3">
              {projectsList.map((proj) => (
                <div
                  key={proj.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-border bg-card"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{proj.name}</span>
                      <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {proj.verificationStatus}
                      </Badge>
                      {proj.primaryLanguage && (
                        <Badge variant="secondary" className="text-[10px]">
                          {proj.primaryLanguage}
                        </Badge>
                      )}
                    </div>

                    {proj.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {proj.description}
                      </p>
                    )}

                    {proj.technologies && proj.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {proj.technologies.slice(0, 6).map((t, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground font-mono"
                          >
                            {t}
                          </span>
                        ))}
                        {proj.technologies.length > 6 && (
                          <span className="text-[9px] text-muted-foreground">
                            +{proj.technologies.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {proj.repositoryUrl && (
                      <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs">
                        <a href={proj.repositoryUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Repo
                        </a>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === proj.id}
                      onClick={() => handleDelete(proj.id, proj.name)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete project ${proj.name}`}
                    >
                      {deletingId === proj.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          !analysisDraft && (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground space-y-1">
              <FolderGit2 className="mx-auto h-6 w-6 text-muted-foreground/60 mb-2" />
              <p className="font-medium text-foreground">No verified GitHub projects yet</p>
              <p>Add your public GitHub repositories above to analyze and extract verified code evidence.</p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
