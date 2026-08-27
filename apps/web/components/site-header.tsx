import Link from "next/link";
import { Briefcase, User } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight transition-colors hover:text-foreground/80"
          aria-label="Job Hub Home"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-base font-bold">Job Hub</span>
        </Link>
        <nav aria-label="Main Navigation" className="flex items-center gap-4 text-sm font-medium">
          <Link
            href="/"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Home
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-foreground bg-muted/60 transition-colors hover:bg-muted"
          >
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Profile</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
