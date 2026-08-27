"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpcClient } from "@/lib/trpc/client";
import type { CandidatePreferences, RemotePreference, ExperienceLevel } from "@job-hub/candidate";
import {
  Sliders,
  Globe2,
  DollarSign,
  Briefcase,
  GraduationCap,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export type PreferencesItem = Omit<CandidatePreferences, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

function normalizePreferences(item: PreferencesItem): CandidatePreferences {
  return {
    ...item,
    createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt),
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt),
  };
}

interface PreferencesSectionProps {
  initialPreferences: PreferencesItem;
  onUpdated?: (updated: CandidatePreferences) => void;
}

export function PreferencesSection({
  initialPreferences,
  onUpdated,
}: PreferencesSectionProps) {
  const [preferences, setPreferences] = useState<CandidatePreferences>(() =>
    normalizePreferences(initialPreferences)
  );
  const [remotePreference, setRemotePreference] = useState<RemotePreference>(
    initialPreferences.remotePreference || "UNKNOWN"
  );
  const [targetRolesInput, setTargetRolesInput] = useState<string>(
    initialPreferences.targetRoles?.join(", ") || ""
  );
  const [locationsInput, setLocationsInput] = useState<string>(
    initialPreferences.preferredLocations?.join(", ") || ""
  );
  const [salaryMin, setSalaryMin] = useState<string>(
    initialPreferences.salaryMin !== null && initialPreferences.salaryMin !== undefined
      ? String(initialPreferences.salaryMin)
      : ""
  );
  const [salaryCurrency, setSalaryCurrency] = useState<string>(
    initialPreferences.salaryCurrency || "USD"
  );
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    initialPreferences.experienceLevel || "MID"
  );

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    const parsedSalary = salaryMin.trim() !== "" ? parseInt(salaryMin, 10) : null;
    if (parsedSalary !== null && (isNaN(parsedSalary) || parsedSalary < 0)) {
      setIsSaving(false);
      setFeedback({
        type: "error",
        message: "Minimum salary must be a positive number or left blank.",
      });
      return;
    }

    const parsedRoles = targetRolesInput
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    const parsedLocations = locationsInput
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);

    try {
      const updated = await trpcClient.candidate.updatePreferences.mutate({
        remotePreference,
        targetRoles: parsedRoles,
        preferredLocations: parsedLocations,
        salaryMin: parsedSalary,
        salaryCurrency,
        experienceLevel,
      });

      const normalized = normalizePreferences(updated);
      setPreferences(normalized);
      onUpdated?.(normalized);
      setFeedback({
        type: "success",
        message: "Candidate preferences updated successfully.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update preferences.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSave}>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <CardTitle className="text-xl">Candidate Job Preferences</CardTitle>
              <CardDescription>
                Explicit preferences used to filter and match jobs. Grounded in 01_build_the_system.md Step 1.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
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
              <AlertDescription className="text-xs">{feedback.message}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Remote Preference */}
            <div className="space-y-1.5">
              <label htmlFor="remote-preference" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
                Remote Work Preference
              </label>
              <select
                id="remote-preference"
                value={remotePreference}
                onChange={(e) => setRemotePreference(e.target.value as RemotePreference)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="WORLDWIDE_REMOTE">Worldwide Remote (Anywhere)</option>
                <option value="COUNTRY_REMOTE">Country Remote (Within Home Country)</option>
                <option value="REGION_REMOTE">Region Remote (Specific Region/Timezone)</option>
                <option value="HYBRID">Hybrid (Partially Remote)</option>
                <option value="ONSITE">Onsite (In Office)</option>
                <option value="UNKNOWN">Not Specified</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                &ldquo;Remote alone must not be interpreted as worldwide.&rdquo; (01_build_the_system.md §4)
              </p>
            </div>

            {/* Experience Level */}
            <div className="space-y-1.5">
              <label htmlFor="experience-level" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                Target Experience Level
              </label>
              <select
                id="experience-level"
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="ENTRY">Entry Level (0-2 years)</option>
                <option value="MID">Mid Level (3-5 years)</option>
                <option value="SENIOR">Senior (5-8 years)</option>
                <option value="LEAD">Lead (8+ years)</option>
                <option value="PRINCIPAL">Principal / Staff (10+ years)</option>
              </select>
            </div>
          </div>

          {/* Target Roles */}
          <div className="space-y-1.5">
            <label htmlFor="target-roles" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
              Target Roles (comma-separated)
            </label>
            <input
              id="target-roles"
              type="text"
              value={targetRolesInput}
              onChange={(e) => setTargetRolesInput(e.target.value)}
              placeholder="e.g. Senior Backend Engineer, Distributed Systems Architect, Cloud Engineer"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Preferred Locations */}
            <div className="space-y-1.5">
              <label htmlFor="preferred-locations" className="text-xs font-semibold text-foreground">
                Preferred Locations (comma-separated)
              </label>
              <input
                id="preferred-locations"
                type="text"
                value={locationsInput}
                onChange={(e) => setLocationsInput(e.target.value)}
                placeholder="e.g. United States, Canada, Europe"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            {/* Salary Expectation */}
            <div className="space-y-1.5">
              <label htmlFor="salary-min" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Minimum Salary Expectation (Annual)
              </label>
              <div className="flex gap-2">
                <input
                  id="salary-min"
                  type="number"
                  min="0"
                  step="1000"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g. 150000"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
                <input
                  id="salary-currency"
                  type="text"
                  maxLength={5}
                  value={salaryCurrency}
                  onChange={(e) => setSalaryCurrency(e.target.value.toUpperCase())}
                  className="w-20 rounded-md border border-input bg-background px-2 py-2 text-center text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end border-t pt-4">
          <Button type="submit" disabled={isSaving} size="sm">
            {isSaving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Saving Preferences...</span>
              </>
            ) : (
              <span>Save Job Preferences</span>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
