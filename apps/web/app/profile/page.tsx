import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@job-hub/auth";
import { createCaller } from "@/lib/trpc/caller";
import { createTRPCContext } from "@/lib/trpc/context";
import { ProfileView } from "@/components/profile/profile-view";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogIn, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Candidate Profile | Job Hub",
  description: "View and manage your foundational candidate profile and verified credentials.",
};

export default async function ProfilePage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  // Unauthenticated Access Guard
  if (!session?.user) {
    return (
      <main className="container mx-auto max-w-xl px-4 py-16">
        <Card className="border-border/80 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">Authentication Required</CardTitle>
            <CardDescription className="text-sm mt-1">
              You must be signed in to view and manage your candidate profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground pt-2">
            <p>
              Candidate profiles are strictly tied to authenticated user accounts to protect candidate privacy and ensure verified credentials cannot be tampered with.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center gap-3 pt-4 border-t">
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                <span>Return to Home</span>
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/">
                <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
                <span>Sign In / Register</span>
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  // Preload initial profile, resumes, preferences, and verified projects through server tRPC caller
  const caller = createCaller(await createTRPCContext({ headers: reqHeaders }));
  const [initialProfile, initialResumes] = await Promise.all([
    caller.candidate.getProfile(),
    caller.resume.list(),
  ]);

  const [initialPreferences, initialProjects] = initialProfile
    ? await Promise.all([
        caller.candidate.getPreferences().catch(() => null),
        caller.candidate.listProjects().catch(() => []),
      ])
    : [null, []];

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          <span>Job Hub</span>
          <span>/</span>
          <span>Account</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Candidate Profile
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your verified remote candidate profile identity.
        </p>
      </div>

      <ProfileView
        user={{
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email,
          emailVerified: session.user.emailVerified,
        }}
        initialProfile={initialProfile}
        initialResumes={initialResumes}
        initialPreferences={initialPreferences}
        initialProjects={initialProjects}
      />
    </main>
  );
}
