import type { RemoteType } from "../types";

/**
 * Strips HTML tags and unescapes common entities from external job descriptions.
 */
export function cleanDescriptionText(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;

  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Common regional patterns.
 */
const REGION_PATTERNS = [
  /\b(emea|apac|latam|americas|europe|eu|asia|oceania|nordics|benelux|latin america)\b/i,
];

/**
 * Common specific country patterns.
 */
const COUNTRY_PATTERNS = [
  /\b(united states|usa|us|uk|united kingdom|great britain|canada|germany|france|netherlands|spain|poland|brazil|india|australia|switzerland|austria|sweden|ireland|portugal|singapore|japan)\b/i,
];

/**
 * Deterministic remote eligibility helper for source adapters.
 * Grounded in 04_ai_agent_skills.md §6:
 * RULE: "Remote" alone must NOT be interpreted as "worldwide".
 */
export function classifyRemotePolicy(
  location?: string | null,
  isExplicitRemote?: boolean
): RemoteType {
  const loc = (location || "").trim().toLowerCase();

  // Explicit worldwide indicators
  if (
    loc.includes("worldwide") ||
    loc.includes("anywhere") ||
    loc.includes("global") ||
    loc.includes("all locations") ||
    loc === "remote worldwide" ||
    loc === "worldwide remote"
  ) {
    return "WORLDWIDE_REMOTE";
  }

  // Hybrid indicators
  if (loc.includes("hybrid")) {
    return "HYBRID";
  }

  // Onsite indicators
  if (loc.includes("onsite") || loc.includes("on-site") || loc.includes("in-office")) {
    return "ONSITE";
  }

  // If flagged as remote or contains "remote"
  const hasRemoteSignal = isExplicitRemote === true || loc.includes("remote");

  if (hasRemoteSignal) {
    // Check for regional boundary
    for (const pattern of REGION_PATTERNS) {
      if (pattern.test(loc)) {
        return "REGION_REMOTE";
      }
    }

    // Check for specific country boundary
    for (const pattern of COUNTRY_PATTERNS) {
      if (pattern.test(loc)) {
        return "COUNTRY_REMOTE";
      }
    }

    // If it only says "Remote" or ambiguous without worldwide qualification:
    // Grounded in strict non-negotiable rule: "Remote" alone must not be interpreted as "worldwide".
    return "UNKNOWN";
  }

  // If non-remote location is given (e.g. "Berlin, Germany" with isExplicitRemote=false)
  if (loc.length > 0) {
    return "ONSITE";
  }

  return "UNKNOWN";
}
