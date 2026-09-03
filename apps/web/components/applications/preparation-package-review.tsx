"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApplicationPreparationPackage } from "@job-hub/applications";
import {
  FileText,
  Mail,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  Download,
  Edit3,
  Check,
  Save,
  ShieldCheck,
  X,
  ExternalLink,
  Sparkles,
} from "lucide-react";

interface PreparationPackageReviewProps {
  packageData: ApplicationPreparationPackage;
  onClose?: () => void;
  onUpdateCoverLetter?: (id: string, content: string) => Promise<void>;
  onUpdateAnswer?: (
    answerId: string,
    applicationId: string,
    answer: string,
    isConfirmed?: boolean
  ) => Promise<void>;
  onApprovePackage?: (applicationId: string) => Promise<void>;
  onDownloadPdf?: () => void;
}

export function PreparationPackageReview({
  packageData,
  onClose,
  onUpdateCoverLetter,
  onUpdateAnswer,
  onApprovePackage,
  onDownloadPdf,
}: PreparationPackageReviewProps) {
  const [activeTab, setActiveTab] = useState<"resume" | "coverLetter" | "answers">("resume");

  // Cover letter editing state
  const [isEditingCoverLetter, setIsEditingCoverLetter] = useState(false);
  const [coverLetterContent, setCoverLetterContent] = useState(
    packageData.coverLetter.content
  );
  const [isSavingCoverLetter, setIsSavingCoverLetter] = useState(false);

  // Answers editing state map: answerId -> { text, isConfirmed }
  const [answersState, setAnswersState] = useState<
    Record<string, { answer: string; isConfirmed: boolean; isEditing: boolean }>
  >(() => {
    const map: Record<string, { answer: string; isConfirmed: boolean; isEditing: boolean }> = {};
    for (const ans of packageData.answers) {
      map[ans.id] = {
        answer: ans.answer,
        isConfirmed: ans.isConfirmed,
        isEditing: false,
      };
    }
    return map;
  });

  const [isApproving, setIsApproving] = useState(false);

  // Calculate remaining unconfirmed count
  const unconfirmedCount = Object.values(answersState).filter(
    (item, index) =>
      packageData.answers[index]?.confidence === "USER_REQUIRED" && !item.isConfirmed
  ).length;

  const handleSaveCoverLetter = async () => {
    if (!onUpdateCoverLetter) return;
    try {
      setIsSavingCoverLetter(true);
      await onUpdateCoverLetter(packageData.coverLetter.id, coverLetterContent);
      setIsEditingCoverLetter(false);
    } catch (err) {
      console.error("Failed to update cover letter:", err);
    } finally {
      setIsSavingCoverLetter(false);
    }
  };

  const handleSaveAnswer = async (answerId: string, isConfirmed?: boolean) => {
    if (!onUpdateAnswer) return;
    const current = answersState[answerId];
    if (!current) return;

    try {
      await onUpdateAnswer(
        answerId,
        packageData.applicationId,
        current.answer,
        isConfirmed !== undefined ? isConfirmed : current.isConfirmed
      );
      setAnswersState((prev) => ({
        ...prev,
        [answerId]: {
          ...prev[answerId]!,
          isConfirmed: isConfirmed !== undefined ? isConfirmed : prev[answerId]!.isConfirmed,
          isEditing: false,
        },
      }));
    } catch (err) {
      console.error("Failed to update answer:", err);
    }
  };

  const handleApprove = async () => {
    if (!onApprovePackage) return;
    try {
      setIsApproving(true);
      await onApprovePackage(packageData.applicationId);
    } catch (err) {
      console.error("Failed to approve package:", err);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="prep-review-title"
      className="bg-card text-card-foreground rounded-xl border border-border shadow-xl max-w-5xl w-full mx-auto overflow-hidden flex flex-col max-h-[90vh]"
    >
      {/* 1. Header Bar */}
      <div className="p-5 border-b border-border bg-muted/20 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h2 id="prep-review-title" className="text-xl font-bold tracking-tight">
              Application Package: {packageData.job.title}
            </h2>
            <Badge variant="outline" className="text-xs bg-muted/50">
              {packageData.job.company}
            </Badge>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs font-semibold"
            >
              PREPARED
            </Badge>
            {packageData.isApproved && (
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs flex items-center gap-1"
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>APPROVED</span>
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {packageData.job.location ?? "Remote"} • Remote Type: {packageData.job.remoteType}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onDownloadPdf && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDownloadPdf}
              className="h-8 text-xs cursor-pointer flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </Button>
          )}
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 cursor-pointer text-muted-foreground hover:text-foreground"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 2. Cautionary & Boundary Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          <strong>Preparation Workspace:</strong> These materials are prepared for your review. No applications are automatically submitted. Review and approve your tailored materials before submitting externally.
        </span>
      </div>

      {/* 3. Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Application materials tabs"
        className="flex border-b border-border bg-muted/10 px-5 gap-2 pt-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "resume"}
          onClick={() => setActiveTab("resume")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "resume"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Tailored Resume</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "coverLetter"}
          onClick={() => setActiveTab("coverLetter")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "coverLetter"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          <span>Cover Letter</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "answers"}
          onClick={() => setActiveTab("answers")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "answers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span>Application Answers</span>
          {unconfirmedCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
              {unconfirmedCount}
            </span>
          )}
        </button>
      </div>

      {/* 4. Tab Content Panels */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* --- TAB 1: TAILORED RESUME --- */}
        {activeTab === "resume" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Tailored Executive Summary</h3>
                <p className="text-xs text-muted-foreground">
                  Grounded strictly in candidate evidence and targeted for {packageData.job.title}
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                Truthfulness Score: {packageData.tailoredResume.truthfulnessScore}%
              </Badge>
            </div>

            <Card className="p-4 bg-muted/10 border-border/60">
              <p className="text-xs leading-relaxed italic text-foreground">
                &ldquo;{packageData.tailoredResume.tailoredData.summary.text}&rdquo;
              </p>
            </Card>

            {/* Targeted Skills */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Targeted Technical Skills
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {packageData.tailoredResume.tailoredData.skills.flatMap((cat) =>
                  cat.skills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="text-xs bg-muted/60"
                    >
                      {skill}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            {/* Grounded Experiences */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tailored Experiences & Grounded Bullets
              </h4>
              {packageData.tailoredResume.tailoredData.experiences.map((exp, idx) => (
                <Card key={idx} className="p-4 border-border/50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="text-xs font-bold text-foreground">
                        {exp.role} • {exp.company}
                      </h5>
                      <p className="text-[11px] text-muted-foreground">
                        {exp.startDate} — {exp.endDate ?? "Present"}
                      </p>
                    </div>
                  </div>
                  <ul className="list-disc list-inside space-y-1.5 mt-2 text-xs text-foreground/90">
                    {exp.bullets.map((b, bIdx) => (
                      <li key={bIdx} className="leading-normal">
                        <span>{b.text}</span>
                        <span className="ml-2 inline-flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1 font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          >
                            {b.confidence}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB 2: COVER LETTER --- */}
        {activeTab === "coverLetter" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Custom Cover Letter</h3>
                <p className="text-xs text-muted-foreground">
                  Personalized narrative grounded in candidate facts. Direct edit capability below.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isEditingCoverLetter ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveCoverLetter}
                    disabled={isSavingCoverLetter}
                    className="h-7 text-xs cursor-pointer flex items-center gap-1"
                  >
                    <Save className="h-3 w-3" />
                    <span>{isSavingCoverLetter ? "Saving..." : "Save Edits"}</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingCoverLetter(true)}
                    className="h-7 text-xs cursor-pointer flex items-center gap-1"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>Edit Letter</span>
                  </Button>
                )}
              </div>
            </div>

            {isEditingCoverLetter ? (
              <textarea
                value={coverLetterContent}
                onChange={(e) => setCoverLetterContent(e.target.value)}
                rows={12}
                className="w-full p-3 text-xs rounded-lg border border-border bg-background font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label="Edit cover letter content"
              />
            ) : (
              <Card className="p-6 bg-muted/5 border-border/60">
                <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground">
                  {coverLetterContent}
                </pre>
              </Card>
            )}

            <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
              <span>Highlighted Skills:</span>
              {packageData.coverLetter.highlightedSkills?.map((s) => (
                <Badge key={s} variant="outline" className="text-[11px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB 3: APPLICATION ANSWERS --- */}
        {activeTab === "answers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Application Questions & Answers</h3>
                <p className="text-xs text-muted-foreground">
                  Confidence classified: VERIFIED (factual evidence), INFERRED (calculated), USER_REQUIRED (cautionary user input).
                </p>
              </div>
            </div>

            {unconfirmedCount > 0 && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Attention Required:</strong> {unconfirmedCount} cautionary question(s) require your explicit confirmation before final approval.
                </span>
              </div>
            )}

            <div className="space-y-3">
              {packageData.answers.map((item) => {
                const state = answersState[item.id] ?? {
                  answer: item.answer,
                  isConfirmed: item.isConfirmed,
                  isEditing: false,
                };

                const isUserRequired = item.confidence === "USER_REQUIRED";
                const isConfirmed = state.isConfirmed;

                // Confidence badge color
                const badgeClass =
                  item.confidence === "VERIFIED"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : item.confidence === "INFERRED"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";

                return (
                  <Card
                    key={item.id}
                    className={`p-4 border transition-colors ${
                      isUserRequired && !isConfirmed
                        ? "border-rose-500/50 bg-rose-500/5"
                        : "border-border/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <span className="text-xs font-bold text-foreground">
                          Q: {item.question}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className={`text-[10px] ${badgeClass}`}>
                          {item.confidence}
                        </Badge>
                        {isConfirmed && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 flex items-center gap-0.5"
                          >
                            <Check className="h-2.5 w-2.5" /> Confirmed
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Answer Body / Editing */}
                    {state.isEditing ? (
                      <div className="space-y-2 mt-2">
                        <textarea
                          value={state.answer}
                          onChange={(e) =>
                            setAnswersState((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id]!,
                                answer: e.target.value,
                              },
                            }))
                          }
                          rows={3}
                          className="w-full p-2 text-xs rounded border border-border bg-background"
                          aria-label={`Edit answer for ${item.question}`}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSaveAnswer(item.id, true)}
                            className="h-6 text-[11px] cursor-pointer"
                          >
                            Save & Confirm
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-foreground/90 mt-1 leading-relaxed">
                        A: {state.answer}
                      </p>
                    )}


                    {/* Candidate Action Buttons */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setAnswersState((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...prev[item.id]!,
                              isEditing: !prev[item.id]!.isEditing,
                            },
                          }))
                        }
                        className="text-primary hover:underline cursor-pointer text-[11px]"
                      >
                        {state.isEditing ? "Cancel" : "Override Answer"}
                      </button>

                      {isUserRequired && !isConfirmed && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSaveAnswer(item.id, true)}
                          className="h-6 text-[11px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 cursor-pointer"
                        >
                          Confirm & Approve Answer
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5. Footer Bar & Approval Controls */}
      <div className="p-4 border-t border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>
            Immutable master resume protected • Provenance maintained
          </span>
        </div>

        <div className="flex items-center gap-3">
          {packageData.isApproved ? (
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Package Approved by Candidate</span>
            </Badge>
          ) : (
            <Button
              type="button"
              onClick={handleApprove}
              disabled={isApproving || unconfirmedCount > 0}
              className="cursor-pointer text-xs font-semibold px-4 flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {isApproving
                  ? "Approving..."
                  : unconfirmedCount > 0
                    ? `Confirm ${unconfirmedCount} question(s) to approve`
                    : "Approve Application Package"}
              </span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
