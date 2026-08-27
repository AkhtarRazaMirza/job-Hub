import { DiskStorageProvider } from "./local";
import { R2StorageProvider } from "./r2";
import type { StorageProvider } from "./types";

export * from "./types";
export * from "./local";
export * from "./r2";

/**
 * Factory creating the active storage provider based on environment configuration.
 * Seamlessly defaults to DiskStorageProvider for local development, docker, and tests,
 * and activates R2StorageProvider when Cloudflare R2 credentials are configured.
 */
export function createStorageProvider(): StorageProvider {
  if (
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  ) {
    return new R2StorageProvider({
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucketName: process.env.R2_BUCKET_NAME,
    });
  }

  return new DiskStorageProvider();
}

export const storage: StorageProvider = createStorageProvider();
