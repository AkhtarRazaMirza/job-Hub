"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpcClient } from "@/lib/trpc/client";
import {
  createProfileInputSchema,
  updateProfileInputSchema,
  type CandidateProfile,
} from "@job-hub/candidate";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  User,
  Calendar,
  Clock,
  Database,
  KeyRound,
} from "lucide-react";

export interface ProfileUser {
  id: string;
  name: string | null;
  email: string;
}

export type CandidateProfileData = {
  id: string;
  userId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

interface ProfileViewProps {
  user: ProfileUser;
  initialProfile: CandidateProfileData | null;
}

function normalizeProfile(raw: CandidateProfileData | null): CandidateProfile | null {
  if (!raw) return null;
  return {
    id: raw.id,
    userId: raw.userId,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(raw.updatedAt),
  };
}

export function ProfileView({ user, initialProfile }: ProfileViewProps) {
  const [profile, setProfile] = useState<CandidateProfile | null>(() =>
    normalizeProfile(initialProfile)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  function formatDate(dateValue: Date | string | undefined | null): string {
    if (!dateValue) return "Not available";
    const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
    return isNaN(date.getTime())
      ? "Invalid date"
      : date.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "medium",
        });
  }

  function getErrorMessage(err: unknown): string {
    if (err && typeof err === "object") {
      if ("data" in err && (err as { data?: { code?: string } }).data?.code === "CONFLICT") {
        return "A candidate profile already exists for this user account.";
      }
      if ("data" in err && (err as { data?: { code?: string } }).data?.code === "UNAUTHORIZED") {
        return "Your session has expired. Please sign in again to continue.";
      }
      if ("data" in err && (err as { data?: { code?: string } }).data?.code === "BAD_REQUEST") {
        return "Invalid candidate profile request.";
      }
      if ("message" in err && typeof (err as { message: unknown }).message === "string") {
        const msg = (err as { message: string }).message;
        if (!msg.toLowerCase().includes("sql") && !msg.toLowerCase().includes("select") && !msg.toLowerCase().includes("insert")) {
          return msg;
        }
      }
    }
    return "An unexpected error occurred while communicating with the server. Please try again.";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    // Client-side validation check using domain schema
    const validation = createProfileInputSchema.safeParse({});
    if (!validation.success) {
      setIsSaving(false);
      setFeedback({
        type: "error",
        title: "Validation Error",
        message: validation.error.issues[0]?.message || "Invalid create input",
      });
      return;
    }

    try {
      // Calls tRPC candidate.createProfile without client-supplied userId
      const created = await trpcClient.candidate.createProfile.mutate({});
      setProfile(normalizeProfile(created));
      setFeedback({
        type: "success",
        title: "Profile Created",
        message: "Your candidate profile was successfully created and persisted in PostgreSQL.",
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        title: "Creation Failed",
        message: getErrorMessage(err),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    // Client-side validation check using domain schema
    const validation = updateProfileInputSchema.safeParse({});
    if (!validation.success) {
      setIsSaving(false);
      setFeedback({
        type: "error",
        title: "Validation Error",
        message: validation.error.issues[0]?.message || "Invalid update input",
      });
      return;
    }

    try {
      // Calls tRPC candidate.updateProfile (ownership server-controlled)
      const updated = await trpcClient.candidate.updateProfile.mutate({});
      setProfile(normalizeProfile(updated));
      setFeedback({
        type: "success",
        title: "Profile Updated",
        message: `Profile refreshed and verified at ${formatDate(updated.updatedAt)}.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        title: "Update Failed",
        message: getErrorMessage(err),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReload() {
    setIsLoading(true);
    setFeedback(null);

    try {
      const refreshed = await trpcClient.candidate.getProfile.query();
      setProfile(normalizeProfile(refreshed));
      setFeedback({
        type: "success",
        title: "Status Verified",
        message: refreshed
          ? "Profile state synchronized with server database."
          : "Server confirmed no candidate profile exists yet.",
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        title: "Verification Failed",
        message: getErrorMessage(err),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Feedback Alerts */}
      <div aria-live="polite" aria-atomic="true">
        {feedback && (
          <Alert
            variant={feedback.type === "success" ? "success" : "destructive"}
            className="mb-6"
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

      {/* Account Identity Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-lg">Account Identity</CardTitle>
            </div>
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              <span>Verified Session</span>
            </Badge>
          </div>
          <CardDescription>
            Authenticated user account derived securely from Better Auth.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Full Name
            </span>
            <p className="mt-1 font-medium text-foreground">
              {user.name || "Unnamed User"}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Email Address
            </span>
            <p className="mt-1 font-medium text-foreground">{user.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* Candidate Profile Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">Candidate Foundation</CardTitle>
              <CardDescription className="mt-1">
                Root candidate identity record stored in PostgreSQL (candidate_profiles table).
              </CardDescription>
            </div>
            <div>
              {profile ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Profile Active</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not Initialized
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {profile ? (
            /* STATE B: Existing Profile Details */
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border p-3.5 bg-muted/20 sm:col-span-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Candidate Profile ID (Server Assigned)</span>
                </div>
                <p className="mt-1.5 font-mono text-xs break-all text-foreground bg-background/80 p-2 rounded border border-border/50">
                  {profile.id}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Unique immutable identity linked 1:1 to your account.
                </p>
              </div>

              <div className="rounded-md border p-3.5 bg-muted/20">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Profile Created</span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-foreground">
                  {formatDate(profile.createdAt)}
                </p>
              </div>

              <div className="rounded-md border p-3.5 bg-muted/20">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Last Saved / Updated</span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-foreground">
                  {formatDate(profile.updatedAt)}
                </p>
              </div>

              <div className="rounded-md border p-3.5 bg-muted/20 sm:col-span-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Database className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Persistence Status</span>
                </div>
                <p className="mt-1 text-xs text-foreground">
                  Synchronized with PostgreSQL via Drizzle ORM. Future profile facts (skills, experience, preferences) will link to this root identity.
                </p>
              </div>
            </div>
          ) : (
            /* STATE A: No Profile Exists */
            <div className="rounded-lg border border-dashed p-6 text-center bg-muted/10">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Database className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <h4 className="mt-3 text-base font-semibold">
                No Candidate Profile Initialized
              </h4>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                You do not have a candidate profile record yet. Initializing your profile creates your foundational record in PostgreSQL tied to your authenticated session.
              </p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3 border-t bg-muted/10 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {profile
              ? "All modifications are validated and secured through tRPC procedures."
              : "Click initialize below to generate your candidate record."}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {profile ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReload}
                  disabled={isLoading || isSaving}
                  aria-label="Verify Profile with Server"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reload State</span>
                    </>
                  )}
                </Button>

                <form onSubmit={handleUpdate}>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSaving || isLoading}
                    aria-label="Update and save candidate profile timestamps"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save / Update Profile</span>
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <form onSubmit={handleCreate}>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving || isLoading}
                  aria-label="Initialize Candidate Profile"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>Initializing...</span>
                    </>
                  ) : (
                    <span>Initialize Candidate Profile</span>
                  )}
                </Button>
              </form>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
