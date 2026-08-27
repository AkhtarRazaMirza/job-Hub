/**
 * Resume Domain Types
 * Job Hub — Phase 2 / Step 2.5
 */

export type ResumeProcessingStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "PROCESSED"
  | "FAILED";

export interface Resume {
  id: string;
  candidateProfileId: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  fileHash: string | null;
  status: ResumeProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResumeMetadata {
  id: string;
  candidateProfileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string | null;
  status: ResumeProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateResumeRecordInput {
  id?: string;
  candidateProfileId: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  fileHash?: string | null;
  status?: ResumeProcessingStatus;
}
