/**
 * Candidate and Job Data Mappers for Matching Engine
 * Grounded in:
 * - 01_build_the_system.md §4 Step 7
 * - 02_how_to_build.md §8 & §9
 */

import type { CandidateMatchData, JobMatchData } from "./types";

export interface RawCandidateProfileLike {
  id: string;
  headline?: string | null;
  profileData?: unknown;
}

export interface RawCandidatePreferencesLike {
  remotePreference?: string | null;
  preferredLocations?: string[] | null;
  salaryMin?: number | null;
  salaryCurrency?: string | null;
  targetRoles?: string[] | null;
  experienceLevel?: string | null;
}

export interface RawProjectLike {
  name: string;
  technologies?: string[] | null;
  description?: string | null;
}

export interface RawJobLike {
  id: string;
  title: string;
  company: string;
  description?: string | null;
  location?: string | null;
  remoteType?: string | null;
  allowedCountries?: string[] | null;
  skills?: string[] | null;
  requirements?: string[] | null;
  experience?: string | null;
  salary?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  status?: string | null;
  postedAt?: Date | string | null;
}

/**
 * Builds pure CandidateMatchData from database profile, preferences, and verified projects.
 */
export function buildCandidateMatchData(
  profile: RawCandidateProfileLike,
  preferences?: RawCandidatePreferencesLike | null,
  projects?: RawProjectLike[] | null
): CandidateMatchData {
  const profileData = (profile.profileData as Record<string, unknown> | null) ?? {};

  const rawTechnicalSkills = Array.isArray(profileData.technicalSkills)
    ? (profileData.technicalSkills as Array<{ name?: string }>)
    : [];
  const skillsFromProfile = rawTechnicalSkills
    .map((s) => s?.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  const technologies = Array.isArray(profileData.technologies)
    ? (profileData.technologies as string[])
    : [];
  const combinedSkills = Array.from(new Set([...skillsFromProfile, ...technologies]));

  const rawEducation = Array.isArray(profileData.education)
    ? (profileData.education as Array<{
        degree?: string;
        fieldOfStudy?: string;
        institution?: string;
      }>)
    : [];
  const education = rawEducation.map((e) => ({
    degree: e.degree,
    fieldOfStudy: e.fieldOfStudy,
    institution: e.institution,
  }));

  const projectList = (projects ?? []).map((p) => ({
    name: p.name,
    technologies: p.technologies ? Array.from(p.technologies) : [],
    description: p.description ?? undefined,
  }));

  const locPrefs = (profileData.locationPreferences as Record<string, unknown> | null) ?? {};
  const remotePref =
    preferences?.remotePreference ??
    (typeof locPrefs.remotePreference === "string" ? locPrefs.remotePreference : "UNKNOWN");
  const explicitLocs = Array.isArray(locPrefs.explicitLocations)
    ? (locPrefs.explicitLocations as string[])
    : [];
  const preferredLocs =
    preferences?.preferredLocations && preferences.preferredLocations.length > 0
      ? preferences.preferredLocations
      : explicitLocs;

  return {
    candidateProfileId: profile.id,
    headline: profile.headline,
    skills: combinedSkills,
    experienceLevel:
      preferences?.experienceLevel ??
      (typeof profileData.experienceLevel === "string" ? profileData.experienceLevel : "MID"),
    yearsOfExperience:
      typeof profileData.yearsOfExperience === "number"
        ? profileData.yearsOfExperience
        : undefined,
    remotePreference: remotePref,
    preferredLocations: preferredLocs,
    salaryMin: preferences?.salaryMin ?? null,
    salaryCurrency: preferences?.salaryCurrency ?? "USD",
    projects: projectList,
    education,
    targetRoles:
      preferences?.targetRoles ??
      (Array.isArray(profileData.rolePreferences) ? (profileData.rolePreferences as string[]) : []),
  };
}

/**
 * Builds pure JobMatchData from database canonical Job record.
 */
export function buildJobMatchData(job: RawJobLike): JobMatchData {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    description: job.description,
    location: job.location,
    remoteType: job.remoteType ?? "UNKNOWN",
    allowedCountries: job.allowedCountries ? Array.from(job.allowedCountries) : [],
    skills: job.skills ? Array.from(job.skills) : [],
    requirements: job.requirements ? Array.from(job.requirements) : [],
    experience: job.experience,
    salary: job.salary,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    status: job.status ?? "ACTIVE",
    postedAt: job.postedAt
      ? job.postedAt instanceof Date
        ? job.postedAt.toISOString()
        : String(job.postedAt)
      : null,
  };
}
