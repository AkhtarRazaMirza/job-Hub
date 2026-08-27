"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { StructuredCandidateProfile } from "@job-hub/candidate";
import {
  Briefcase,
  GraduationCap,
  Sparkles,
  Code2,
  FolderGit2,
  Trophy,
  AlertTriangle,
  MapPin,
  Calendar,
  HelpCircle,
  FileCheck,
} from "lucide-react";

interface StructuredProfileSectionProps {
  profileData: StructuredCandidateProfile;
  headline?: string | null;
  profiledAt?: Date | string | null;
}

export function StructuredProfileSection({
  profileData,
  headline,
  profiledAt,
}: StructuredProfileSectionProps) {
  function formatDate(d?: Date | string | null) {
    if (!d) return null;
    const date = typeof d === "string" ? new Date(d) : d;
    return isNaN(date.getTime()) ? null : date.toLocaleDateString();
  }

  const formattedProfiledDate = formatDate(profiledAt);

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle className="text-xl">AI-Extracted Profile</CardTitle>
                <Badge variant="outline" className="text-xs text-primary border-primary/30">
                  INFERRED
                </Badge>
              </div>
              <CardDescription>
                Structured facts parsed deterministically from your resume text via AI.
              </CardDescription>
            </div>
            {formattedProfiledDate && (
              <span className="text-xs text-muted-foreground">
                Profiled: {formattedProfiledDate}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(headline || profileData.headline) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Professional Headline
              </p>
              <p className="text-base font-semibold text-foreground">
                {headline || profileData.headline}
              </p>
            </div>
          )}

          {profileData.summary && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Executive Summary
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {profileData.summary}
              </p>
            </div>
          )}

          {/* Truthfulness Notice */}
          <Alert className="bg-muted/40 border-border">
            <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <AlertTitle className="text-xs font-semibold text-foreground">
              Truthfulness Notice (Non-Negotiable)
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground mt-0.5">
              These items are extracted directly from self-reported resume text and are classified
              as <strong className="text-foreground">INFERRED</strong>. They are not externally verified facts.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Technical Skills */}
      {profileData.technicalSkills && profileData.technicalSkills.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-lg">Technical Skills & Technologies</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profileData.technicalSkills.map((skill, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs"
                >
                  <span className="font-medium text-foreground">{skill.name}</span>
                  {skill.category && (
                    <span className="text-[10px] text-muted-foreground">({skill.category})</span>
                  )}
                  {skill.yearsOfExperience !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      • {skill.yearsOfExperience}y
                    </span>
                  )}
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-muted-foreground/30">
                    {skill.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Work Experience */}
      {profileData.experience && profileData.experience.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-lg">Work Experience</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileData.experience.map((exp, idx) => (
              <div key={idx} className="border-l-2 border-primary/30 pl-4 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-sm text-foreground">
                    {exp.role} <span className="font-normal text-muted-foreground">at</span> {exp.company}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" aria-hidden="true" />
                      {exp.startDate || "Unknown"} — {exp.isCurrent ? "Present" : exp.endDate || "Unknown"}
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                      {exp.status}
                    </Badge>
                  </div>
                </div>
                {exp.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                    {exp.description}
                  </p>
                )}
                {exp.technologies && exp.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1.5">
                    {exp.technologies.map((tech, tIdx) => (
                      <span
                        key={tIdx}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Education & Projects Grid */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Education */}
        {profileData.education && profileData.education.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle className="text-lg">Education</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {profileData.education.map((edu, idx) => (
                <div key={idx} className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">{edu.institution}</p>
                  <p className="text-xs text-muted-foreground">
                    {edu.degree} {edu.fieldOfStudy ? `in ${edu.fieldOfStudy}` : ""}
                    {edu.graduationYear ? ` (${edu.graduationYear})` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Projects */}
        {profileData.projects && profileData.projects.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FolderGit2 className="h-4 w-4 text-primary" aria-hidden="true" />
                <CardTitle className="text-lg">Projects</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {profileData.projects.map((proj, idx) => (
                <div key={idx} className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">{proj.name}</p>
                  {proj.description && (
                    <p className="text-xs text-muted-foreground">{proj.description}</p>
                  )}
                  {proj.technologies && proj.technologies.length > 0 && (
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {proj.technologies.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Missing Information / Action Required */}
      {profileData.missingInformation && profileData.missingInformation.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <CardTitle className="text-base text-amber-600 dark:text-amber-400">
                Action Required: Missing Candidate Information
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              These required facts were not found in the uploaded resume. Under Job Hub truthfulness rules,
              the AI does not invent them. Please provide them in your Preferences below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
              {profileData.missingInformation.map((item, idx) => (
                <li key={idx} className="font-medium">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
