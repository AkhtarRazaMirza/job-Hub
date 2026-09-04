"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@job-hub/auth/client";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  User,
  LayoutDashboard,
  LogIn,
  LogOut,
} from "lucide-react";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  const isHome = pathname === "/";
  const isDashboard = pathname.startsWith("/dashboard");
  const isProfile = pathname.startsWith("/profile");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 backdrop-blur-md overflow-x-clip">
      <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-3 sm:px-6 gap-2">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight transition-colors hover:text-foreground/80 shrink-0"
          aria-label="Job Hub Home"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-xs shrink-0">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-base font-bold text-foreground">Job Hub</span>
        </Link>

        <nav
          aria-label="Main Navigation"
          className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-medium shrink-0"
        >
          <Link
            href="/"
            className={`hidden sm:inline-block rounded-md px-2 py-1 transition-colors ${
              isHome
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            Home
          </Link>

          <Link
            href="/dashboard"
            className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
              isDashboard
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
            title="Dashboard"
            aria-label="Candidate Dashboard"
          >
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden xs:inline">Dashboard</span>
          </Link>

          <Link
            href="/profile"
            className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
              isProfile
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
            title="Profile"
            aria-label="Candidate Profile"
          >
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden xs:inline">Profile</span>
          </Link>

          <div className="h-4 w-px bg-border/80 mx-0.5" aria-hidden="true" />

          {/* Theme Toggle Button */}
          <ThemeToggle className="h-8 w-8" />

          {/* Authentication Actions */}
          {!isPending && (
            <>
              {session?.user ? (
                <div className="flex items-center gap-1">
                  <span
                    className="hidden lg:inline-block max-w-[100px] truncate text-xs text-muted-foreground font-normal"
                    title={session.user.email}
                  >
                    {session.user.name || session.user.email}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSignOut}
                    className="h-8 px-2 text-xs gap-1 cursor-pointer text-muted-foreground hover:text-destructive"
                    aria-label="Sign out of your account"
                    title="Sign out"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </Button>
                </div>
              ) : (
                <Button
                  asChild
                  variant="default"
                  size="sm"
                  className="h-8 px-2.5 text-xs gap-1 cursor-pointer font-medium"
                >
                  <Link href="/sign-in">
                    <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Sign In</span>
                  </Link>
                </Button>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
