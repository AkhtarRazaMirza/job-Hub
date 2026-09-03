import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@job-hub/auth";
import { createCaller } from "@/lib/trpc/caller";
import { createTRPCContext } from "@/lib/trpc/context";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogIn, ArrowLeft, UserCheck, Briefcase } from "lucide-react";

export const metadata: Metadata = {
  title: "Candidate Dashboard | Job Hub",
  description: "Review personalized remote job matches, transparent fit explanations, and bookmarked opportunities.",
};

export default async function DashboardPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  // 1. Unauthenticated Guard
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
              You must be signed in to access your candidate dashboard and personalized matches.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground pt-2">
            <p>
              Match evaluations and saved job bookmarks are strictly private and isolated to your authenticated account.
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

  // 2. Preload data server-side via tRPC caller
  const caller = createCaller(await createTRPCContext({ headers: reqHeaders }));

  let initialOverview = null;
  let initialMatches = null;
  let initialSavedJobs = null;
  let initialApplications = null;
  let hasProfile = true;

  try {
    const [overviewRes, matchesRes, savedRes, applicationsRes] = await Promise.all([
      caller.dashboard.overview(),
      caller.dashboard.matchesFeed({ limit: 20, offset: 0 }),
      caller.dashboard.savedJobsFeed({ limit: 20, offset: 0 }),
      caller.applications.list({ limit: 50, offset: 0 }),
    ]);

    initialOverview = overviewRes;
    initialMatches = matchesRes;
    initialSavedJobs = savedRes;
    initialApplications = applicationsRes;
  } catch (error: any) {
    if (error?.code === "NOT_FOUND" || error?.message?.includes("Candidate profile not found")) {
      hasProfile = false;
    }
  }

  // 3. Prompt candidate to set up profile if none exists
  if (!hasProfile) {
    return (
      <main className="container mx-auto max-w-xl px-4 py-16">
        <Card className="border-border/80 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <UserCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">Create Your Candidate Profile</CardTitle>
            <CardDescription className="text-sm mt-1">
              Complete your candidate profile to discover truthful AI-matched remote jobs.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground pt-2 space-y-2">
            <p>
              Job Hub evaluates opportunities against your verified skills, experience, and remote preferences.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center gap-3 pt-4 border-t">
            <Button asChild size="sm">
              <Link href="/profile">
                <Briefcase className="mr-1.5 h-4 w-4" />
                <span>Go to Profile Setup</span>
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <DashboardView
        initialOverview={initialOverview as any}
        initialMatches={initialMatches as any}
        initialSavedJobs={initialSavedJobs as any}
        initialApplications={initialApplications as any}
      />
    </main>
  );
}
