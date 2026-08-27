import fs from "node:fs/promises";
import path from "node:path";
import type { StorageProvider, StorageUploadResult, StorageFile } from "./types";

export class DiskStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(/* turbopackIgnore: true */ baseDir || process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), ".storage"));
  }

  private resolveKey(key: string): string {
    // Prevent path traversal attacks
    const resolvedPath = path.resolve(this.baseDir, key);
    const relative = path.relative(this.baseDir, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Security Violation: Path traversal detected in storage key: ${key}`);
    }
    return resolvedPath;
  }

  async upload(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<StorageUploadResult> {
    const filePath = this.resolveKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await fs.writeFile(filePath, buffer);

    // Save contentType metadata
    await fs.writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType, size: buffer.length }));

    return {
      key,
      size: buffer.length,
      contentType,
    };
  }

  async download(key: string): Promise<StorageFile> {
    const filePath = this.resolveKey(key);
    const data = await fs.readFile(filePath);
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await fs.readFile(`${filePath}.meta.json`, "utf-8"));
      if (meta.contentType) {
        contentType = meta.contentType;
      }
    } catch {
      // metadata file optional
    }

    return {
      data,
      contentType,
      size: data.length,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKey(key);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== "ENOENT") {
        throw err;
      }
    }

    try {
      await fs.unlink(`${filePath}.meta.json`);
    } catch {
      // ignore
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolveKey(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
