import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@job-hub/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Briefcase,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  UserCheck,
  Send,
  Lock,
  Globe,
} from "lucide-react";

export default async function HomePage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  const isAuthenticated = !!session?.user;

  return (
    <main className="flex flex-col items-center justify-center px-4 py-12 sm:py-20">
      {/* Hero Section */}
      <div className="container mx-auto max-w-4xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-xs">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>Personal AI Remote-Job Application Platform</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
          Find, Match, and Apply to Remote Jobs{" "}
          <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            With Truthful AI
          </span>
        </h1>

        <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
          Job Hub evaluates worldwide remote engineering roles against your verified
          profile. Transparent scoring, tailored application materials, and strict
          human approval before anything is submitted.
        </p>

        {/* Primary Call to Action */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          {isAuthenticated ? (
            <>
              <Button asChild size="lg" className="h-11 px-6 font-semibold shadow-md">
                <Link href="/dashboard">
                  <Briefcase className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>Go to Dashboard</span>
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 px-6 font-medium">
                <Link href="/profile">
                  <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>View Profile</span>
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="lg" className="h-11 px-6 font-semibold shadow-md">
                <Link href="/register?callbackUrl=/dashboard">
                  <span>Get Started</span>
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 px-6 font-medium">
                <Link href="/sign-in?callbackUrl=/dashboard">
                  <span>Sign In</span>
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Core Principles & Features */}
      <div className="container mx-auto max-w-5xl mt-16 sm:mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border/80 bg-card/60 backdrop-blur-xs transition-shadow hover:shadow-md">
          <CardHeader className="pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg">Candidate Truth First</CardTitle>
            <CardDescription className="text-xs">
              Zero hallucinated experience
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            The system works exclusively from verified resumes, GitHub repositories,
            and portfolio items. It never invents skills, credentials, or answers.
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 backdrop-blur-xs transition-shadow hover:shadow-md">
          <CardHeader className="pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <Globe className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg">Transparent Fit Scoring</CardTitle>
            <CardDescription className="text-xs">
              0–10 calibrated evaluation
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            Jobs are deduplicated, normalized, and scored against your hard constraints,
            skills, and remote eligibility with clear explanations for every score.
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/60 backdrop-blur-xs transition-shadow hover:shadow-md">
          <CardHeader className="pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg">Human-in-the-Loop</CardTitle>
            <CardDescription className="text-xs">
              You retain final authority
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            Tailored resumes and answers are prepared for strong matches, but no
            application is ever submitted without explicit candidate review and approval.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
