/**
 * Safe callback URL validator and sanitization helper.
 * Strictly prevents open redirect attacks by ensuring only relative,
 * safe internal application paths are allowed.
 */
export function getSafeCallbackUrl(
  rawUrl: string | null | undefined,
  defaultUrl: string = "/dashboard"
): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    return defaultUrl;
  }

  const trimmed = rawUrl.trim();

  // Must begin with a single '/' and not with protocol-relative '//' or Windows path '\'
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return defaultUrl;
  }

  // Must not contain URI schemes, colons (like javascript: or https:) or control characters
  if (trimmed.includes(":") || /[\r\n\t\0]/.test(trimmed)) {
    return defaultUrl;
  }

  return trimmed;
}
