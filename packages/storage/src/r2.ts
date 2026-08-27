import type { StorageProvider, StorageUploadResult, StorageFile, R2Config } from "./types";

/**
 * Cloudflare R2 Storage Provider Boundary.
 *
 * Grounded in Job Hub Technology Specification:
 * "Cloudflare R2: Purpose: original resumes, tailored resumes, generated documents, application documents."
 * (03_tech_stack.md §10)
 *
 * Implements S3-compatible REST API contracts for Cloudflare R2 without requiring
 * bloated SDKs or hard dependencies when credentials are not yet configured.
 */
export class R2StorageProvider implements StorageProvider {
  private readonly config: R2Config;

  constructor(config: R2Config) {
    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
      throw new Error("Missing required Cloudflare R2 storage credentials (accountId, accessKeyId, secretAccessKey, bucketName)");
    }
    this.config = config;
  }

  get endpoint(): string {
    return `https://${this.config.accountId}.r2.cloudflarestorage.com/${this.config.bucketName}`;
  }

  async upload(
    _key: string,
    _data: Buffer | Uint8Array,
    _contentType: string
  ): Promise<StorageUploadResult> {
    throw new Error("Cloudflare R2 live network operations are not configured in this environment. Use DiskStorageProvider or configure production R2 driver.");
  }

  async download(_key: string): Promise<StorageFile> {
    throw new Error("Cloudflare R2 live network operations are not configured in this environment. Use DiskStorageProvider or configure production R2 driver.");
  }

  async delete(_key: string): Promise<void> {
    throw new Error("Cloudflare R2 live network operations are not configured in this environment. Use DiskStorageProvider or configure production R2 driver.");
  }

  async exists(_key: string): Promise<boolean> {
    throw new Error("Cloudflare R2 live network operations are not configured in this environment. Use DiskStorageProvider or configure production R2 driver.");
  }
}
