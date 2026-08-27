export interface StorageUploadResult {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageFile {
  data: Buffer;
  contentType: string;
  size: number;
}

/**
 * StorageProvider abstraction decoupling application logic
 * from concrete object storage systems (Local Disk / Cloudflare R2).
 */
export interface StorageProvider {
  upload(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<StorageUploadResult>;
  download(key: string): Promise<StorageFile>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}
