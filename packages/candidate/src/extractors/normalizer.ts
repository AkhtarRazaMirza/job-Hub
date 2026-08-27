/**
 * Deterministic Resume Text Normalizer
 * Job Hub — Phase 2 / Step 2.6
 */

export interface NormalizationResult {
  normalizedText: string;
  characterCount: number;
  wordCount: number;
}

/**
 * Normalizes raw text extracted from documents:
 * 1. Strips null bytes and non-printable control characters.
 * 2. Unifies line breaks (\r\n and \r -> \n).
 * 3. Replaces unicode whitespace/non-breaking spaces with standard space.
 * 4. Collapses horizontal whitespace while preserving structure.
 * 5. Collapses excessive vertical whitespace (3+ newlines -> 2 newlines).
 * 6. Trims trailing line spaces and outer boundaries.
 */
export function normalizeDocumentText(rawText: string): NormalizationResult {
  if (!rawText) {
    return {
      normalizedText: "",
      characterCount: 0,
      wordCount: 0,
    };
  }

  // 1. Replace null characters and control characters except \t and \n
  const strippedControl = rawText.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

  // 2. Unify line breaks
  const unifiedLines = strippedControl.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 3. Normalize non-breaking spaces and unicode spaces
  const normalizedSpaces = unifiedLines.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");

  // 4. Process lines: trim trailing spaces on each line and collapse redundant horizontal whitespace
  const processedLines = normalizedSpaces
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd());

  // 5. Rejoin and collapse excessive blank lines (more than 2 consecutive newlines)
  const rejoined = processedLines.join("\n").replace(/\n{3,}/g, "\n\n");

  // 6. Final trim
  const normalizedText = rejoined.trim();

  // Compute character and word counts deterministically
  const characterCount = normalizedText.length;
  const wordCount = normalizedText.length > 0 ? normalizedText.split(/\s+/).filter(Boolean).length : 0;

  return {
    normalizedText,
    characterCount,
    wordCount,
  };
}
