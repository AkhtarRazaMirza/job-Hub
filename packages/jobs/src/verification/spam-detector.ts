/**
 * Job Spam and Quality Heuristics Detector
 * Grounded in 04_ai_agent_skills.md §7:
 * "Check: application URL, active status, posting freshness, location restrictions, company identity, obvious spam signals."
 */

import type { CreateJobInput } from "../types";

const PLACEHOLDER_COMPANIES = new Set([
  "confidential",
  "confidential company",
  "unknown",
  "n/a",
  "na",
  "anonymous",
  "hiring company",
  "secret company",
  "undisclosed",
  "company name",
  "your company",
  "private client",
]);

const SCAM_PATTERNS = [
  /\b(earn|make)\s+\$\s*\d{3,}\s*(daily|a day|per day|hourly|a week|weekly)\b/i,
  /\b(envelope stuffing|mystery shopper|reshipping agent|package forwarding clerk|wire transfer agent)\b/i,
  /\b(crypto\s+investment\s+guaranteed|passive\s+income\s+guaranteed)\b/i,
  /\b(send\s+(\$|\d+).*application\s+fee)\b/i,
  /\b(telegram\s+me\s+@|whatsapp\s+only\s+\+)/i,
];

export interface SpamDetectionResult {
  isSpam: boolean;
  reasons: string[];
}

export function detectSpamSignals(job: CreateJobInput): SpamDetectionResult {
  const reasons: string[] = [];

  const companyLower = job.company.toLowerCase().trim();
  if (PLACEHOLDER_COMPANIES.has(companyLower)) {
    reasons.push(`Placeholder company identity detected: "${job.company}"`);
  }

  const combinedText = `${job.title} ${job.description || ""}`;

  for (const pattern of SCAM_PATTERNS) {
    if (pattern.test(combinedText)) {
      reasons.push("Obvious scam or fraudulent job posting pattern detected");
      break;
    }
  }

  // Check if title is suspicious clickbait
  if (/^(\s*click\s+here\s*|\s*apply\s+now\s*!*|\s*urgent\s+hiring\s*!*)$/i.test(job.title.trim())) {
    reasons.push("Title contains generic clickbait phrase rather than a valid job role");
  }

  return {
    isSpam: reasons.length > 0,
    reasons,
  };
}
