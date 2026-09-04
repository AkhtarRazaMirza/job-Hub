"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@job-hub/auth/client";
import { getSafeCallbackUrl } from "@/lib/auth-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Briefcase, Loader2, AlertCircle, ArrowLeft } from "lucide-react";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const safeCallbackUrl = getSafeCallbackUrl(rawCallbackUrl, "/dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage("Please provide both email and password.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (res.error) {
        setErrorMessage(
          res.error.message || "Invalid credentials. Please verify your email and password."
        );
        setLoading(false);
        return;
      }

      router.push(safeCallbackUrl);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(
        err.message || "An unexpected error occurred during sign in. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/80 shadow-lg">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground mb-1">
          <Briefcase className="h-5 w-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          Welcome to Job Hub
        </CardTitle>
        <CardDescription className="text-sm">
          Sign in to your candidate account to access your remote job matches and applications.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs font-medium">
                {errorMessage}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              name="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
            </div>
            <Input
              id="password"
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>

          <div className="text-center text-xs text-muted-foreground mt-2">
            Don&apos;t have an account yet?{" "}
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Create candidate account
            </Link>
          </div>

          <Button asChild variant="ghost" size="sm" className="w-full text-xs text-muted-foreground mt-1">
            <Link href="/">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              <span>Back to Home</span>
            </Link>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <Suspense
        fallback={
          <Card className="w-full max-w-md p-8 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
            <p className="text-sm">Loading sign in...</p>
          </Card>
        }
      >
        <SignInForm />
      </Suspense>
    </main>
  );
}
