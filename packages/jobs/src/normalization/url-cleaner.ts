/**
 * Canonical URL Cleaner for Job Listings
 * Grounded in 02_how_to_build.md §6 & §7
 *
 * Strips non-functional tracking parameters and normalizes URLs deterministically.
 */

const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "ref",
  "ref_id",
  "trk",
  "tracking_id",
  "source",
  "spm",
  "si",
]);

/**
 * Cleans and normalizes a canonical URL.
 * Returns null if URL is invalid.
 */
export function cleanCanonicalUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    // Normalize protocol and host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Strip default ports
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }

    // Strip tracking query parameters
    const paramsToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (TRACKING_QUERY_PARAMS.has(lowerKey) || lowerKey.startsWith("utm_")) {
        paramsToDelete.push(key);
      }
    });

    for (const key of paramsToDelete) {
      parsed.searchParams.delete(key);
    }

    // Sort remaining query params deterministically
    parsed.searchParams.sort();

    // Normalize trailing slash in pathname (e.g. /jobs/123/ -> /jobs/123)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Remove empty hash
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}
