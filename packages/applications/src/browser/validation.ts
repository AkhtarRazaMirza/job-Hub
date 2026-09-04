/**
 * Job Hub — Phase 8 / Step 8.2
 * Browser Agent Target URL Validation & Client Input Schemas
 *
 * Security & Anti-SSRF Invariants:
 * - Strictly enforce http/https protocols.
 * - Prohibit private IP spaces, link-local addresses, loopback, and cloud metadata services.
 * - Block URL credentials (username:password@).
 * - Reject client-supplied userId or candidateProfileId injection.
 */

import { z } from "zod";
import { BrowserUrlValidationError } from "../errors";

/**
 * Known trusted Applicant Tracking Systems (ATS) and job hosting platforms
 * where application forms legitimately reside when redirected from job boards.
 */
export const TRUSTED_ATS_DOMAINS = new Set([
  "greenhouse.io",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "lever.co",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "jobs.smartrecruiters.com",
  "workable.com",
  "apply.workable.com",
  "jobvite.com",
  "jobs.jobvite.com",
  "recruitee.com",
  "rippling-ats.com",
  "bamboohr.com",
  "remoteok.com",
  "weworkremotely.com",
  "arbeitnow.com",
]);

/**
 * Checks whether an IPv4 address belongs to a private, loopback, or link-local range.
 */
function isPrivateOrLoopbackIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 0.0.0.0/8 (Broadcast/This Host)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private network: 172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata AWS/GCP/Azure)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  domain?: string;
  error?: string;
  isRecognizedAts?: boolean;
}

/**
 * Validates target application URLs to prevent SSRF, credential exfiltration,
 * loopback traversal, and malicious redirection.
 */
export function validateBrowserTargetUrl(
  rawUrl: string,
  expectedJobUrl?: string
): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "URL must be a non-empty string" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: `Malformed URL structure: ${rawUrl}` };
  }

  // 1. Protocol check: strictly http: or https:
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: `Forbidden URL protocol '${parsed.protocol}'. Only 'http:' and 'https:' are allowed.`,
    };
  }

  // 2. Reject embedded credentials (http://user:pass@host)
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "URLs containing embedded user credentials are strictly forbidden.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. Block loopback and local hostnames
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return {
      valid: false,
      error: `Access to local/loopback host '${hostname}' is strictly forbidden.`,
    };
  }

  // 4. Cloud metadata endpoints
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname === "instance-data"
  ) {
    return {
      valid: false,
      error: "Access to cloud instance metadata services is strictly forbidden.",
    };
  }

  // 5. Private IP range checks
  if (isPrivateOrLoopbackIp(hostname)) {
    return {
      valid: false,
      error: `Access to private network IP '${hostname}' is strictly forbidden.`,
    };
  }

  // 6. Check ATS recognition
  const isRecognizedAts = Array.from(TRUSTED_ATS_DOMAINS).some(
    (ats) => hostname === ats || hostname.endsWith(`.${ats}`)
  );

  // 7. Domain consistency check against expectedJobUrl if provided
  if (expectedJobUrl) {
    try {
      const expectedParsed = new URL(expectedJobUrl);
      const expectedHost = expectedParsed.hostname.toLowerCase();

      const sameHost =
        hostname === expectedHost ||
        hostname.endsWith(`.${expectedHost}`) ||
        expectedHost.endsWith(`.${hostname}`);

      if (!sameHost && !isRecognizedAts) {
        // Warning or halt if unexpected external domain
        return {
          valid: false,
          error: `Target host '${hostname}' does not match job posting host '${expectedHost}' and is not a recognized ATS.`,
        };
      }
    } catch {
      // If expectedJobUrl was somehow invalid, do not crash; proceed with general validation
    }
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    domain: hostname,
    isRecognizedAts,
  };
}

/**
 * Asserts URL validity, throwing BrowserUrlValidationError on failure.
 */
export function assertValidBrowserTargetUrl(url: string, expectedJobUrl?: string): string {
  const result = validateBrowserTargetUrl(url, expectedJobUrl);
  if (!result.valid || !result.normalizedUrl) {
    throw new BrowserUrlValidationError(result.error || "Invalid browser target URL");
  }
  return result.normalizedUrl;
}

// -----------------------------------------------------------------------------
// Client Input Schemas with Anti-Spoofing Rules
// -----------------------------------------------------------------------------

export const startBrowserExecutionClientInputSchema = z
  .object({
    applicationId: z.string().min(1, "applicationId is required"),
    targetUrl: z.string().url("Valid target URL required").optional(),
  })
  .strict();

export type StartBrowserExecutionClientInput = z.infer<
  typeof startBrowserExecutionClientInputSchema
>;

export const confirmFieldAnswerClientInputSchema = z
  .object({
    executionId: z.string().min(1, "executionId is required"),
    fieldId: z.string().min(1, "fieldId is required"),
    confirmedValue: z.string().min(1, "confirmedValue is required"),
  })
  .strict();

export type ConfirmFieldAnswerClientInput = z.infer<
  typeof confirmFieldAnswerClientInputSchema
>;

export const approveBrowserSubmissionClientInputSchema = z
  .object({
    executionId: z.string().min(1, "executionId is required"),
    confirmed: z.literal(true, {
      errorMap: () => ({ message: "Explicit confirmation (confirmed: true) is required" }),
    }),
  })
  .strict();

export type ApproveBrowserSubmissionClientInput = z.infer<
  typeof approveBrowserSubmissionClientInputSchema
>;

export const cancelBrowserExecutionClientInputSchema = z
  .object({
    executionId: z.string().min(1, "executionId is required"),
  })
  .strict();

export type CancelBrowserExecutionClientInput = z.infer<
  typeof cancelBrowserExecutionClientInputSchema
>;
