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
  type VerificationStatus,
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
  FileCheck2,
  HelpCircle,
  Sparkles,
  Info,
} from "lucide-react";

export interface ProfileUser {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
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

  // Deterministic Foundational Completion Calculation
  const foundationChecks = [
    { name: "Authenticated Account", completed: true },
    { name: "Candidate Identity Record", completed: Boolean(profile) },
    { name: "Email Confirmation", completed: user.emailVerified },
  ];
  const completedChecksCount = foundationChecks.filter((c) => c.completed).length;
  const totalChecksCount = foundationChecks.length;
  const isProfileInitialized = Boolean(profile);

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
        if (
          !msg.toLowerCase().includes("sql") &&
          !msg.toLowerCase().includes("select") &&
          !msg.toLowerCase().includes("insert")
        ) {
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
      const created = await trpcClient.candidate.createProfile.mutate({});
      setProfile(normalizeProfile(created));
      setFeedback({
        type: "success",
        title: "Profile Created",
        message: "Your foundational candidate profile was successfully created and persisted in PostgreSQL.",
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
      const updated = await trpcClient.candidate.updateProfile.mutate({});
      setProfile(normalizeProfile(updated));
      setFeedback({
        type: "success",
        title: "Profile Updated",
        message: `Profile refreshed and verified in PostgreSQL at ${formatDate(updated.updatedAt)}.`,
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
      {/* Feedback Alerts (Live Region) */}
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

      {/* 1. Profile Completion & Foundation Status Card */}
      <Card aria-labelledby="foundation-status-heading">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle id="foundation-status-heading" className="text-lg">
                Foundational Profile Completion
              </CardTitle>
            </div>
            <div>
              {isProfileInitialized ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Profile Initialized</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground gap-1">
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                  <span>Action Required: Not Initialized</span>
                </Badge>
              )}
            </div>
          </div>
          <CardDescription>
            Deterministic status of foundational identity records currently established in PostgreSQL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3.5 bg-muted/20">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Foundational Setup Progress</span>
              <span className="font-semibold text-foreground">
                {completedChecksCount} of {totalChecksCount} checks complete
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
              {foundationChecks.map((check) => (
                <div
                  key={check.name}
                  className="flex items-center gap-1.5 rounded bg-background/60 p-2 border border-border/40"
                >
                  {check.completed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <HelpCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                  )}
                  <span className={check.completed ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {check.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 text-muted-foreground/80 mt-0.5" aria-hidden="true" />
            <p>
              Scope Note: This status strictly reflects foundational identity checks. Career records (skills, work history, education, remote preferences) are not yet in the domain and will be introduced in subsequent ingestion steps.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Account Information Card */}
      <Card aria-labelledby="account-identity-heading">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle id="account-identity-heading" className="text-lg">
                Account Information
              </CardTitle>
            </div>
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              <span>Session Authenticated</span>
            </Badge>
          </div>
          <CardDescription>
            Account credentials authenticated through Better Auth.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Candidate Name
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                User-Provided
              </Badge>
            </div>
            <p className="mt-1 font-medium text-foreground">
              {user.name || "Unnamed Candidate"}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email Address
              </span>
              {user.emailVerified ? (
                <Badge variant="success" className="text-[10px] px-1.5 py-0">
                  Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 dark:text-amber-400">
                  Needs Confirmation
                </Badge>
              )}
            </div>
            <p className="mt-1 font-medium text-foreground">{user.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Truthfulness & Verification Audit Table */}
      <Card aria-labelledby="truthfulness-audit-heading">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle id="truthfulness-audit-heading" className="text-lg">
              Data Truthfulness & Verification Audit
            </CardTitle>
          </div>
          <CardDescription>
            Job Hub Core Rule: Information is never labeled verified unless supported by an authoritative source. Missing or unverified data requires user confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" aria-label="Candidate Profile Fact Verification Table">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th scope="col" className="pb-2 font-semibold uppercase tracking-wider">Field / Fact</th>
                  <th scope="col" className="pb-2 font-semibold uppercase tracking-wider">Current Value</th>
                  <th scope="col" className="pb-2 font-semibold uppercase tracking-wider">Status</th>
                  <th scope="col" className="pb-2 font-semibold uppercase tracking-wider">Audit Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <th scope="row" className="py-2.5 font-medium text-foreground">
                    Root Identity Record
                  </th>
                  <td className="py-2.5 font-mono text-[11px] text-muted-foreground">
                    {profile ? `${profile.id.substring(0, 18)}...` : "None"}
                  </td>
                  <td className="py-2.5">
                    {profile ? (
                      <Badge variant="success">VERIFIED</Badge>
                    ) : (
                      <Badge variant="outline">USER_REQUIRED</Badge>
                    )}
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    {profile ? "PostgreSQL Unique Binding" : "Profile Initialization Required"}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-2.5 font-medium text-foreground">
                    Contact Email
                  </th>
                  <td className="py-2.5 text-muted-foreground">
                    {user.email}
                  </td>
                  <td className="py-2.5">
                    {user.emailVerified ? (
                      <Badge variant="success">VERIFIED</Badge>
                    ) : (
                      <Badge variant="outline">USER_REQUIRED</Badge>
                    )}
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    {user.emailVerified ? "Better Auth Verification" : "User-Provided (Pending Confirmation)"}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-2.5 font-medium text-foreground">
                    Candidate Full Name
                  </th>
                  <td className="py-2.5 text-muted-foreground">
                    {user.name || "Not provided"}
                  </td>
                  <td className="py-2.5">
                    <Badge variant="secondary">USER_PROVIDED</Badge>
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    Registration Form Input (Unverified)
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-2.5 font-medium text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                    <span>AI Inferred Facts</span>
                  </th>
                  <td className="py-2.5 text-muted-foreground">
                    0 Inferred Facts
                  </td>
                  <td className="py-2.5">
                    <Badge variant="secondary">INFERRED: 0</Badge>
                  </td>
                  <td className="py-2.5 text-muted-foreground">
                    Deterministic Engine (No AI Inference)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 4. Candidate Profile Persistence Record & Actions Card */}
      <Card aria-labelledby="persistence-heading">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle id="persistence-heading" className="text-xl">
                Candidate Record Management
              </CardTitle>
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
                  <span>Candidate Profile ID (Server-Enforced)</span>
                </div>
                <p className="mt-1.5 font-mono text-xs break-all text-foreground bg-background/80 p-2 rounded border border-border/50">
                  {profile.id}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Unique immutable identity linked 1:1 to your account. Client cannot modify or reassign ownership.
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
                  Synchronized with PostgreSQL via Drizzle ORM. Future candidate facts (skills, experience, preferences) will link to this root identity.
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
