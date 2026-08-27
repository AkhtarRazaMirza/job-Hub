import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";

export const MAX_RESUME_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MIN_RESUME_FILE_SIZE = 1; // 1 byte

export type SupportedResumeFormat = "pdf" | "docx";

export interface ValidatedResumeFile {
  format: SupportedResumeFormat;
  mimeType: string;
  sanitizedFileName: string;
  size: number;
  hash: string;
  storageKey: string;
}

/**
 * Checks magic bytes to verify actual file content matches declared format.
 * Never trusts file extensions or client-provided MIME types alone.
 */
export function verifyFileSignature(buffer: Buffer): SupportedResumeFormat {
  if (buffer.length < 4) {
    throw new Error("File too small to determine format");
  }

  // PDF Magic Bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return "pdf";
  }

  // DOCX Magic Bytes: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return "docx";
  }

  throw new Error("Unsupported file format: Only valid PDF and DOCX files are accepted.");
}

/**
 * Sanitizes a client-provided filename to prevent directory traversal and invalid characters.
 */
export function sanitizeFileName(rawFileName: string, format: SupportedResumeFormat): string {
  // Strip path traversal attempts and separators
  const baseName = path.basename(rawFileName).trim();
  // Remove control characters and non-printable characters
  const cleanName = baseName.replace(/[\x00-\x1F\x7F<>:"/\\|?*]/g, "");
  const nameWithoutExt = cleanName.replace(/\.(pdf|docx)$/i, "").trim();
  const safeBase = nameWithoutExt.substring(0, 100) || "resume";
  return `${safeBase}.${format}`;
}

/**
 * Validates a file buffer and its metadata deterministically.
 */
export function validateResumeFile(
  buffer: Buffer,
  rawFileName: string,
  candidateProfileId: string
): ValidatedResumeFile {
  if (buffer.length < MIN_RESUME_FILE_SIZE) {
    throw new Error("Resume file is empty.");
  }

  if (buffer.length > MAX_RESUME_FILE_SIZE) {
    throw new Error(`Resume file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum limit of 5 MB.`);
  }

  // Determine actual format from binary content
  const format = verifyFileSignature(buffer);

  // Validate filename extension matches detected binary format
  const lowerName = rawFileName.toLowerCase();
  if (format === "pdf" && !lowerName.endsWith(".pdf")) {
    throw new Error("File content is a PDF, but filename extension is not .pdf");
  }
  if (format === "docx" && !lowerName.endsWith(".docx")) {
    throw new Error("File content is a DOCX document, but filename extension is not .docx");
  }

  const sanitizedFileName = sanitizeFileName(rawFileName, format);
  const mimeType = format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  // SHA-256 integrity hash
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  // Server-generated storage key: resumes/{candidateProfileId}/{randomUUID}.{format}
  const storageKey = `resumes/${candidateProfileId}/${crypto.randomUUID()}.${format}`;

  return {
    format,
    mimeType,
    sanitizedFileName,
    size: buffer.length,
    hash,
    storageKey,
  };
}

/**
 * Client-facing input schema for uploading a resume via tRPC.
 * Rejects any attempt to inject userId, candidateProfileId, or ownership identifiers.
 */
export const uploadResumeInputSchema = z
  .object({
    fileName: z.string().min(1, "Filename is required").max(255, "Filename too long"),
    fileBase64: z.string().min(1, "File content is required"),
    mimeType: z.string().min(1, "MIME type is required"),
    userId: z.never({ invalid_type_error: "userId cannot be client-supplied" }).optional(),
    candidateProfileId: z.never({ invalid_type_error: "candidateProfileId cannot be client-supplied" }).optional(),
    id: z.never({ invalid_type_error: "id cannot be client-supplied" }).optional(),
  })
  .strict();

export type UploadResumeClientInput = z.infer<typeof uploadResumeInputSchema>;

export const deleteResumeInputSchema = z
  .object({
    id: z.string().min(1, "Resume ID is required"),
  })
  .strict();

export const getResumeInputSchema = z
  .object({
    id: z.string().min(1, "Resume ID is required"),
  })
  .strict();
