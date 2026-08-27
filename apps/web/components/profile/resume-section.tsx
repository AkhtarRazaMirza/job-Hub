"use client";

import { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpcClient } from "@/lib/trpc/client";
import type { ResumeMetadata } from "@job-hub/candidate";
import {
  FileText,
  Upload,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Info,
  Calendar,
  HardDrive,
  Sparkles,
} from "lucide-react";

export type ResumeItem = Omit<ResumeMetadata, "createdAt" | "updatedAt" | "extractedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  extractedAt?: Date | string | null;
};

export interface ResumeSectionProps {
  initialResumes?: ResumeItem[];
  activeSourceResumeId?: string | null;
  onProfileGenerated?: (profile: unknown) => void;
}

function normalizeResume(item: ResumeItem): ResumeMetadata {
  return {
    ...item,
    createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt),
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt),
    extractedAt:
      item.extractedAt instanceof Date
        ? item.extractedAt
        : item.extractedAt
        ? new Date(item.extractedAt)
        : null,
  };
}

export function ResumeSection({
  initialResumes = [],
  activeSourceResumeId,
  onProfileGenerated,
}: ResumeSectionProps) {
  const [resumes, setResumes] = useState<ResumeMetadata[]>(() =>
    initialResumes.map(normalizeResume)
  );
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [profilingId, setProfilingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleProfile(resumeId: string, fileName: string) {
    setProfilingId(resumeId);
    setFeedback(null);

    try {
      const updatedProfile = await trpcClient.candidate.profileFromResume.mutate({ resumeId });
      onProfileGenerated?.(updatedProfile);
      setFeedback({
        type: "success",
        title: "Candidate Profile Generated",
        message: `AI structured extraction completed for "${fileName}". View your profile below.`,
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to generate candidate profile. Please try again.";

      setFeedback({
        type: "error",
        title: "Profiling Error",
        message,
      });
    } finally {
      setProfilingId(null);
    }
  }

  async function handleExtract(id: string, fileName: string) {
    setExtractingId(id);
    setFeedback(null);

    try {
      const processed = await trpcClient.resume.extractText.mutate({ id });
      setResumes((prev) => prev.map((r) => (r.id === id ? normalizeResume(processed) : r)));
      if (processed.status === "PROCESSED") {
        setFeedback({
          type: "success",
          title: "Text Extracted",
          message: `Deterministic text extraction succeeded for "${fileName}". Resume text is ready for profiling.`,
        });
      } else {
        setFeedback({
          type: "error",
          title: "Extraction Failed",
          message: processed.processingError || "Failed to extract text from document.",
        });
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to extract text from resume. Please try again.";

      setFeedback({
        type: "error",
        title: "Extraction Error",
        message,
      });
    } finally {
      setExtractingId(null);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDate(dateValue: Date | string | undefined | null): string {
    if (!dateValue) return "Not available";
    const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
    return isNaN(date.getTime())
      ? "Invalid date"
      : date.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting the same file works
    e.target.value = "";

    // Client-side quick check
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({
        type: "error",
        title: "File Too Large",
        message: `The selected file size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 5 MB limit.`,
      });
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".docx")) {
      setFeedback({
        type: "error",
        title: "Unsupported Format",
        message: "Only PDF (.pdf) and Word (.docx) files are supported.",
      });
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    try {
      // Read file to base64
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const fileBase64 = btoa(binary);

      const uploaded = await trpcClient.resume.upload.mutate({
        fileName: file.name,
        fileBase64,
        mimeType: file.type || (lowerName.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      });

      // Update resumes list
      setResumes((prev) => [normalizeResume(uploaded), ...prev]);
      setFeedback({
        type: "success",
        title: "Resume Uploaded",
        message: `"${uploaded.fileName}" (${formatBytes(uploaded.fileSize)}) was stored securely in object storage.`,
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to upload resume. Please try again.";

      setFeedback({
        type: "error",
        title: "Upload Failed",
        message,
      });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string, fileName: string) {
    setDeletingId(id);
    setFeedback(null);

    try {
      await trpcClient.resume.delete.mutate({ id });
      setResumes((prev) => prev.filter((r) => r.id !== id));
      setFeedback({
        type: "success",
        title: "Resume Removed",
        message: `"${fileName}" was removed from storage and database.`,
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to delete resume. Please try again.";

      setFeedback({
        type: "error",
        title: "Delete Failed",
        message,
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card aria-labelledby="resume-documents-heading">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <CardTitle id="resume-documents-heading" className="text-xl">
                Resume Documents
              </CardTitle>
              <CardDescription className="mt-1">
                Upload your source resume. Files are stored securely in object storage and tracked in PostgreSQL.
              </CardDescription>
            </div>
          </div>
          <div>
            <Badge variant="secondary" className="gap-1">
              <HardDrive className="h-3 w-3" aria-hidden="true" />
              <span>{resumes.length} {resumes.length === 1 ? "Document" : "Documents"}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Feedback Alert */}
        <div aria-live="polite" aria-atomic="true">
          {feedback && (
            <Alert
              variant={feedback.type === "success" ? "success" : "destructive"}
              className="mb-4"
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
              )}
              <AlertTitle>{feedback.title}</AlertTitle>
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Upload Box */}
        <div className="rounded-lg border-2 border-dashed border-border/80 p-6 text-center bg-muted/10">
          <input
            ref={fileInputRef}
            type="file"
            id="resume-file-input"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            disabled={isUploading}
            className="sr-only"
            aria-label="Upload Resume Document"
          />
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <h4 className="mt-3 text-sm font-semibold text-foreground">
            Select a Resume File to Upload
          </h4>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Supported formats: PDF (.pdf) or Word (.docx). Maximum file size: 5 MB.
          </p>

          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Choose file to upload resume"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Uploading Document...</span>
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  <span>Choose Resume File</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Truthfulness Notice */}
        <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground/80 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-medium text-foreground">Truthfulness Notice: </span>
            Deterministic document text extraction extracts raw plain text from stored PDF and DOCX files. It confirms only: <span className="font-medium text-foreground">&quot;Resume text extracted.&quot;</span> It does <strong>NOT</strong> mean: &quot;Resume verified&quot;, &quot;Resume analyzed by AI&quot;, &quot;Skills verified&quot;, or &quot;Resume is accurate&quot;. This step is deterministic extraction only.
          </div>
        </div>

        {/* Existing Resumes List */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Uploaded Resume Records ({resumes.length})
          </h4>

          {resumes.length === 0 ? (
            <div className="rounded-md border p-4 text-center text-xs text-muted-foreground bg-muted/5">
              No resumes uploaded yet. Upload a PDF or DOCX file to establish your source resume.
            </div>
          ) : (
            <ul className="divide-y divide-border/60 rounded-md border" aria-label="List of Uploaded Resumes">
              {resumes.map((resume) => (
                <li
                  key={resume.id}
                  className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded p-2 bg-muted text-foreground shrink-0 mt-0.5">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate max-w-xs sm:max-w-md">
                        {resume.fileName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span>{formatBytes(resume.fileSize)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          <span>{formatDate(resume.createdAt)}</span>
                        </span>
                        {resume.extractedAt && (
                          <>
                            <span>•</span>
                            <span className="text-primary font-medium">Text Extracted</span>
                          </>
                        )}
                        {activeSourceResumeId === resume.id && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              Active Profile Source
                            </span>
                          </>
                        )}
                      </div>
                      {resume.status === "FAILED" && resume.processingError && (
                        <p className="text-xs text-destructive mt-1">
                          Extraction error: {resume.processingError}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Badge
                      variant={
                        resume.status === "PROCESSED"
                          ? "outline"
                          : resume.status === "FAILED"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {resume.status}
                    </Badge>

                    {resume.status !== "PROCESSED" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={extractingId === resume.id || deletingId === resume.id || profilingId === resume.id}
                        onClick={() => handleExtract(resume.id, resume.fileName)}
                        className="h-8 px-2 text-xs"
                        aria-label={`Extract text from ${resume.fileName}`}
                      >
                        {extractingId === resume.id ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                            <span>Extracting...</span>
                          </>
                        ) : (
                          <span>Extract Text</span>
                        )}
                      </Button>
                    )}

                    {resume.status === "PROCESSED" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={profilingId === resume.id || deletingId === resume.id || extractingId === resume.id}
                        onClick={() => handleProfile(resume.id, resume.fileName)}
                        className="h-8 px-2.5 text-xs border-primary/40 text-primary hover:bg-primary/5 gap-1.5"
                        aria-label={`Profile candidate from ${resume.fileName}`}
                      >
                        {profilingId === resume.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            <span>Profiling...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            <span>Profile with AI</span>
                          </>
                        )}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === resume.id || isUploading || extractingId === resume.id}
                      onClick={() => handleDelete(resume.id, resume.fileName)}
                      className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={`Delete ${resume.fileName}`}
                    >
                      {deletingId === resume.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
