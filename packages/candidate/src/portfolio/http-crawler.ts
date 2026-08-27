import type { PortfolioCrawler, PortfolioCrawlResult } from "./types";
import {
  PortfolioError,
  PortfolioTimeoutError,
  PortfolioSizeLimitError,
} from "./types";
import { validatePortfolioUrl } from "./ssrf-validator";
import { sanitizeAndExtractHtml } from "./html-sanitizer";

export const MAX_PORTFOLIO_BYTES = 2 * 1024 * 1024; // 2 MB
export const DEFAULT_CRAWL_TIMEOUT_MS = 10_000; // 10s

export class HttpPortfolioCrawler implements PortfolioCrawler {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(options?: { timeoutMs?: number; maxBytes?: number }) {
    this.timeoutMs = options?.timeoutMs || DEFAULT_CRAWL_TIMEOUT_MS;
    this.maxBytes = options?.maxBytes || MAX_PORTFOLIO_BYTES;
  }

  async crawl(url: string): Promise<PortfolioCrawlResult> {
    const validUrl = validatePortfolioUrl(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(validUrl.toString(), {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "JobHub-Portfolio-Crawler/1.0 (+https://jobhub.dev)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        },
      });

      if (!response.ok) {
        throw new PortfolioError(
          `Failed to fetch portfolio: HTTP ${response.status} ${response.statusText}`,
          `HTTP_${response.status}`
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml") &&
        !contentType.includes("text/plain")
      ) {
        throw new PortfolioError(
          `Unsupported content type: "${contentType}". Expected an HTML web page.`,
          "INVALID_CONTENT_TYPE"
        );
      }

      // Read response stream up to maxBytes
      if (!response.body) {
        throw new PortfolioError("Empty response body received from portfolio site.", "EMPTY_RESPONSE");
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > this.maxBytes) {
            reader.cancel();
            throw new PortfolioSizeLimitError();
          }
          chunks.push(value);
        }
      }

      const buffer = Buffer.concat(chunks);
      const html = buffer.toString("utf-8");

      const { title, description, extractedText, links } = sanitizeAndExtractHtml(
        html,
        validUrl.toString()
      );

      return {
        url: validUrl.toString(),
        title,
        description,
        extractedText,
        links,
      };
    } catch (err: unknown) {
      if (err instanceof PortfolioError) {
        throw err;
      }
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "AbortError") {
        throw new PortfolioTimeoutError();
      }
      throw new PortfolioError(
        err instanceof Error ? err.message : "Failed to crawl portfolio site.",
        "NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
