/**
 * Deterministic Text Similarity & Normalization Utilities for Job Deduplication
 * Grounded in 02_how_to_build.md §7:
 * "Use deterministic checks first... Then use semantic similarity for harder duplicates. Do not rely on an LLM alone."
 */

const COMMON_ABBREVIATIONS: Record<string, string> = {
  "sr": "senior",
  "sr.": "senior",
  "jr": "junior",
  "jr.": "junior",
  "eng": "engineer",
  "engr": "engineer",
  "sw": "software",
  "swe": "software engineer",
  "dev": "developer",
  "lead": "lead",
  "mgr": "manager",
  "vp": "vice president",
  "inc": "",
  "inc.": "",
  "llc": "",
  "ltd": "",
  "ltd.": "",
  "corp": "",
  "corp.": "",
  "co": "",
  "co.": "",
};

/**
 * Normalizes a title or company string into clean, standardized tokens.
 */
export function normalizeEntityString(input: string | null | undefined): string {
  if (!input) return "";

  const words = input
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const standardized = words.map((w) => COMMON_ABBREVIATIONS[w] ?? w).filter((w) => w.length > 0);

  return standardized.join(" ").trim();
}

/**
 * Tokenizes a string into a unique set of word tokens.
 */
export function tokenizeWords(input: string): Set<string> {
  const normalized = normalizeEntityString(input);
  return new Set(normalized.split(/\s+/).filter((w) => w.length > 0));
}

/**
 * Computes Jaccard similarity between two strings (0.0 to 1.0).
 */
export function jaccardSimilarity(textA: string, textB: string): number {
  const tokensA = tokenizeWords(textA);
  const tokensB = tokenizeWords(textB);

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...tokensA, ...tokensB]).size;
  return unionCount === 0 ? 0.0 : intersectionCount / unionCount;
}

/**
 * Computes Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Computes normalized string similarity based on Levenshtein distance (0.0 to 1.0).
 */
export function stringSimilarity(a: string, b: string): number {
  const normA = normalizeEntityString(a);
  const normB = normalizeEntityString(b);

  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(normA, normB);
  return Math.max(0, (maxLen - distance) / maxLen);
}
