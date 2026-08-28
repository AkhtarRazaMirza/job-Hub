/**
 * Remote Policy & Location Restriction Auditor
 * Grounded in:
 * - 01_build_the_system.md §4 Step 5
 * - 04_ai_agent_skills.md §6 & §7
 *
 * Enforces non-negotiable rule: "Remote" alone must NOT be interpreted as "worldwide".
 */

import type { CreateJobInput, RemoteType } from "../types";
import { classifyRemotePolicy } from "../source/utils";

export interface RemoteAuditResult {
  auditedRemoteType: RemoteType;
  isValid: boolean;
  warnings: string[];
}

export function auditRemoteClassification(job: CreateJobInput): RemoteAuditResult {
  const warnings: string[] = [];
  const loc = (job.location || "").toLowerCase().trim();

  // If classified as WORLDWIDE_REMOTE, verify that explicit global signals exist
  if (job.remoteType === "WORLDWIDE_REMOTE") {
    const hasWorldwideSignal =
      loc.includes("worldwide") ||
      loc.includes("anywhere") ||
      loc.includes("global") ||
      loc.includes("all locations");

    if (!hasWorldwideSignal) {
      warnings.push(
        `Job was classified as WORLDWIDE_REMOTE but location "${job.location}" lacks explicit global scope. Correcting to UNKNOWN per truthfulness rules.`
      );
      return {
        auditedRemoteType: "UNKNOWN",
        isValid: false,
        warnings,
      };
    }
  }

  // If location is solely "Remote" with no country or global qualifier
  if (loc === "remote" && job.remoteType !== "UNKNOWN") {
    warnings.push(
      `Job specifies only "Remote" without geographic bounds. Setting classification to UNKNOWN.`
    );
    return {
      auditedRemoteType: "UNKNOWN",
      isValid: false,
      warnings,
    };
  }

  // Re-verify against deterministic classifier
  const expectedPolicy = classifyRemotePolicy(
    job.location,
    job.remoteType === "WORLDWIDE_REMOTE" ||
      job.remoteType === "COUNTRY_REMOTE" ||
      job.remoteType === "REGION_REMOTE"
  );

  return {
    auditedRemoteType: (job.remoteType || expectedPolicy) as RemoteType,
    isValid: warnings.length === 0,
    warnings,
  };
}
