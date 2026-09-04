"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, Laptop } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";

function emptySubscribe() {
  return () => {};
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!isMounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        disabled
        aria-label="Loading theme"
      >
        <span className="h-4 w-4 rounded-full bg-muted animate-pulse" />
      </Button>
    );
  }

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const currentLabel =
    theme === "system"
      ? `Theme: System (${resolvedTheme}). Click to switch to Light.`
      : theme === "dark"
      ? "Theme: Dark. Click to switch to System."
      : "Theme: Light. Click to switch to Dark.";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      className={className}
      aria-label={currentLabel}
      title={currentLabel}
    >
      {theme === "system" ? (
        <Laptop className="h-4 w-4 text-foreground transition-transform duration-200" aria-hidden="true" />
      ) : resolvedTheme === "dark" ? (
        <Moon className="h-4 w-4 text-foreground transition-transform duration-200" aria-hidden="true" />
      ) : (
        <Sun className="h-4 w-4 text-foreground transition-transform duration-200" aria-hidden="true" />
      )}
      <span className="sr-only">{currentLabel}</span>
    </Button>
  );
}
