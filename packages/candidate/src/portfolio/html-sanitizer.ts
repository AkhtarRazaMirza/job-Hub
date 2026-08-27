/**
 * Sanitizes HTML from portfolio crawl and extracts clean text, headings, and project links.
 */
export function sanitizeAndExtractHtml(
  html: string,
  baseUrl: string
): {
  title: string | null;
  description: string | null;
  extractedText: string;
  links: string[];
} {
  // 1. Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch && titleMatch[1] ? titleMatch[1].trim() : null;

  // 2. Extract meta description
  const metaDescMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const rawDescription = metaDescMatch && metaDescMatch[1] ? metaDescMatch[1].trim() : null;

  // 3. Extract links (prioritize links with text)
  const links: string[] = [];
  const linkRegex = /<a[^>]*href=["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    try {
      const href = linkMatch[1]!;
      const resolved = new URL(href, baseUrl).toString();
      if (
        (resolved.startsWith("http://") || resolved.startsWith("https://")) &&
        !links.includes(resolved)
      ) {
        links.push(resolved);
      }
    } catch {
      // Ignore malformed href
    }
  }

  // 4. Strip non-content elements
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // 5. Add line breaks around block elements
  cleaned = cleaned
    .replace(/<\/(h[1-6]|p|div|section|article|li|tr|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

  // 6. Strip all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ");

  // 7. Decode HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 8. Collapse whitespace while preserving meaningful newlines
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0);

  const extractedText = lines.join("\n").slice(0, 12_000);

  return {
    title: rawTitle ? rawTitle.replace(/\s+/g, " ") : null,
    description: rawDescription ? rawDescription.replace(/\s+/g, " ") : null,
    extractedText,
    links: links.slice(0, 30),
  };
}
