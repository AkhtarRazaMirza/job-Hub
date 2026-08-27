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
import {
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
} from "lucide-react";

interface LinkedInSectionProps {
  initialLinkedInUrl?: string | null;
  onLinkedInUpdated?: (url: string) => void;
}

export function LinkedInSection({
  initialLinkedInUrl = null,
  onLinkedInUpdated,
}: LinkedInSectionProps) {
  const [linkedinUrlInput, setLinkedinUrlInput] = useState(initialLinkedInUrl || "");
  const [savedUrl, setSavedUrl] = useState<string | null>(initialLinkedInUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title?: string;
    message: string;
  } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!linkedinUrlInput.trim()) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const updated = await trpcClient.candidate.updateLinkedInUrl.mutate({
        linkedinUrl: linkedinUrlInput.trim(),
      });

      setSavedUrl(updated.linkedinUrl ?? null);
      setFeedback({
        type: "success",
        title: "LinkedIn Profile Linked",
        message: "Successfully saved your LinkedIn profile URL.",
      });

      if (onLinkedInUpdated && updated.linkedinUrl) {
        onLinkedInUpdated(updated.linkedinUrl);
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to update LinkedIn profile URL.";

      setFeedback({
        type: "error",
        title: "Update Failed",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <CardTitle className="text-xl">LinkedIn Profile</CardTitle>
              <CardDescription>
                Optional personal LinkedIn profile link. Grounded in 01_build_the_system.md §4 Step 1.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            OPTIONAL
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
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

        {savedUrl && (
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/30 border text-xs">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Linked:</span>
              <span className="font-medium text-foreground truncate max-w-sm">{savedUrl}</span>
            </div>
            <a
              href={savedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              <span>Visit</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={linkedinUrlInput}
            onChange={(e) => setLinkedinUrlInput(e.target.value)}
            placeholder="https://www.linkedin.com/in/username"
            disabled={isSaving}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
          <Button type="submit" disabled={isSaving || !linkedinUrlInput.trim()} size="sm" className="gap-1.5">
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Link</span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
