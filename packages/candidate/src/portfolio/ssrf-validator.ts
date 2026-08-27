import { PortfolioSecurityError } from "./types";

/**
 * Validates external URLs to strictly prevent SSRF attacks, private network exploration,
 * cloud metadata access, and protocol smuggling.
 */
export function validatePortfolioUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new PortfolioSecurityError(`Invalid portfolio URL format: "${rawUrl}"`);
  }

  // 1. Enforce HTTP / HTTPS protocol only
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PortfolioSecurityError(
      `Disallowed URL protocol "${parsed.protocol}". Only "http:" and "https:" are allowed.`
    );
  }

  // 2. Enforce standard web ports
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    throw new PortfolioSecurityError(
      `Disallowed port "${parsed.port}". Only standard HTTP (80) and HTTPS (443) ports are allowed.`
    );
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // 3. Reject loopback and local hostnames
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new PortfolioSecurityError(`Access to local or private host "${hostname}" is blocked.`);
  }

  // 4. Reject cloud metadata hostnames
  if (
    hostname === "metadata.google.internal" ||
    hostname === "169.254.169.254" ||
    hostname === "instance-data"
  ) {
    throw new PortfolioSecurityError("Access to cloud metadata endpoints is strictly blocked.");
  }

  // 5. Detect and block private IPv4 patterns
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const b0 = parseInt(ipv4Match[1]!, 10);
    const b1 = parseInt(ipv4Match[2]!, 10);

    // 0.0.0.0/8 (Current network)
    if (b0 === 0) {
      throw new PortfolioSecurityError(`Private IP access blocked: "${hostname}"`);
    }
    // 10.0.0.0/8 (Private network)
    if (b0 === 10) {
      throw new PortfolioSecurityError(`Private IP access blocked: "${hostname}"`);
    }
    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) {
      throw new PortfolioSecurityError(`Loopback IP access blocked: "${hostname}"`);
    }
    // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (b0 === 169 && b1 === 254) {
      throw new PortfolioSecurityError(`Link-local IP access blocked: "${hostname}"`);
    }
    // 172.16.0.0/12 (Private network: 172.16 - 172.31)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) {
      throw new PortfolioSecurityError(`Private IP access blocked: "${hostname}"`);
    }
    // 192.168.0.0/16 (Private network)
    if (b0 === 192 && b1 === 168) {
      throw new PortfolioSecurityError(`Private IP access blocked: "${hostname}"`);
    }
    // 100.64.0.0/10 (Shared address space)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) {
      throw new PortfolioSecurityError(`Shared carrier IP access blocked: "${hostname}"`);
    }
  }

  // 6. Detect and block IPv6 loopback / unique local / link local
  if (
    hostname.startsWith("[fe80:") ||
    hostname.startsWith("[fc00:") ||
    hostname.startsWith("[fd") ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fc00:") ||
    hostname.startsWith("fd")
  ) {
    throw new PortfolioSecurityError(`Private IPv6 address blocked: "${hostname}"`);
  }

  return parsed;
}
