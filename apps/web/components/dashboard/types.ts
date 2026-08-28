/**
 * Types for Candidate Dashboard components.
 */

export type MatchDecision = "EXCELLENT_MATCH" | "STRONG_MATCH" | "REVIEW" | "SKIP" | (string & {});

export type RemoteType =
  | "WORLDWIDE_REMOTE"
  | "COUNTRY_REMOTE"
  | "REGION_REMOTE"
  | "HYBRID"
  | "ONSITE"
  | "UNKNOWN"
  | (string & {});

export interface DashboardStats {
  totalMatches: number;
  excellentMatches: number;
  strongMatches: number;
  reviewMatches: number;
  skipMatches?: number;
  savedJobsCount: number;
}

export interface DashboardOverview {
  profile: {
    id: string;
    userId: string;
    headline: string | null;
    portfolioUrl: string | null;
    linkedinUrl: string | null;
    profiledAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  profileData: any;
  preferences: {
    remotePreference: string;
    preferredLocations: string[];
    salaryMin: number | null;
    salaryCurrency: string;
    targetRoles: string[];
    experienceLevel: string;
  } | null;
  projects: any[];
  truthfulness: {
    verifiedCount: number;
    inferredCount: number;
    userProvidedCount: number;
    userRequiredCount: number;
    missingRequiredFields: string[];
    profileCompletionPercentage: number;
  };
  stats: DashboardStats;
}

export interface MatchFeedItem {
  match: {
    id: string;
    overallScore: number;
    decision: string;
    confidence: number;
    hardConstraintsPassed: boolean;
    hardConstraintFailures: string[];
    categoryScores: Record<string, number>;
    strengths: string[];
    gaps: string[];
    risks: string[];
    explanation: string;
    createdAt: Date | string;
  };
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    remoteType: string;
    allowedCountries: string[] | null;
    salary: number | null;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string | null;
    experience: string | null;
    skills: string[] | null;
    applicationUrl: string;
    status: string;
    postedAt: Date | string | null;
  };
  isSaved: boolean;
  savedJobId: string | null;
}

export interface SavedJobFeedItem {
  id: string;
  jobId: string;
  notes: string | null;
  savedAt: Date | string;
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    remoteType: string;
    allowedCountries: string[] | null;
    salary: number | null;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string | null;
    experience: string | null;
    skills: string[] | null;
    applicationUrl: string;
    status: string;
    postedAt: Date | string | null;
  };
  match: {
    id: string;
    overallScore: number;
    decision: string;
    confidence: number;
    strengths: string[];
    gaps: string[];
    risks: string[];
  } | null;
}
