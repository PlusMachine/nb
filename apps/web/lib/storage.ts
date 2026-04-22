import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { getServerEnv } from "./env";

export interface StorageObject {
  body: Buffer;
  contentType: string | null;
}

export interface StorageAdapter {
  upload(params: { key: string; body: Buffer | string; contentType?: string }): Promise<void>;
  getObject(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
}

const validateStorageKey = (key: string) => {
  if (!key || key.includes("\0") || key.startsWith("/") || key.split("/").includes("..")) {
    throw new Error("INVALID_STORAGE_KEY");
  }
};

class LocalStorageAdapter implements StorageAdapter {
  private readonly rootDir = resolve(process.cwd(), ".storage", getServerEnv().STORAGE_BUCKET);

  private resolvePath(key: string) {
    validateStorageKey(key);

    const targetPath = resolve(this.rootDir, key);
    const relativePath = relative(this.rootDir, targetPath);

    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("INVALID_STORAGE_KEY");
    }

    return targetPath;
  }

  private async ensureParentDir(key: string) {
    await mkdir(dirname(this.resolvePath(key)), { recursive: true });
  }

  async upload(params: { key: string; body: Buffer | string; contentType?: string }) {
    const payload = Buffer.isBuffer(params.body) ? params.body : Buffer.from(params.body);
    await this.ensureParentDir(params.key);
    await writeFile(this.resolvePath(params.key), payload);

    if (params.contentType) {
      await writeFile(`${this.resolvePath(params.key)}.meta`, JSON.stringify({
        contentType: params.contentType
      }));
    }
  }

  async getObject(key: string): Promise<StorageObject | null> {
    try {
      const [body, metaRaw] = await Promise.all([
        readFile(this.resolvePath(key)),
        readFile(`${this.resolvePath(key)}.meta`, "utf8").catch(() => null)
      ]);

      const parsedMeta = metaRaw ? JSON.parse(metaRaw) as { contentType?: string } : null;
      return {
        body,
        contentType: parsedMeta?.contentType ?? null
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async delete(key: string) {
    await Promise.all([
      rm(this.resolvePath(key), { force: true }),
      rm(`${this.resolvePath(key)}.meta`, { force: true })
    ]);
  }
}

class S3StorageAdapter implements StorageAdapter {
  private async getClient() {
    const env = getServerEnv();

    if (!env.STORAGE_ACCESS_KEY_ID || !env.STORAGE_SECRET_ACCESS_KEY) {
      throw new Error("STORAGE_CREDENTIALS_MISSING");
    }

    const { S3Client } = await import("@aws-sdk/client-s3");

    return new S3Client({
      region: env.STORAGE_REGION,
      endpoint: env.STORAGE_ENDPOINT,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
      }
    });
  }

  async upload(params: { key: string; body: Buffer | string; contentType?: string }) {
    validateStorageKey(params.key);
    const env = getServerEnv();
    const body = Buffer.isBuffer(params.body) ? params.body : Buffer.from(params.body);
    const client = await this.getClient();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");

    await client.send(new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: params.key,
      Body: body,
      ContentType: params.contentType
    }));
  }

  async getObject(key: string): Promise<StorageObject | null> {
    validateStorageKey(key);
    const env = getServerEnv();
    const client = await this.getClient();
    const { GetObjectCommand, NoSuchKey } = await import("@aws-sdk/client-s3");

    try {
      const response = await client.send(new GetObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: key
      }));

      if (!response.Body) {
        return null;
      }

      const body = Buffer.from(await response.Body.transformToByteArray());
      return {
        body,
        contentType: response.ContentType ?? null
      };
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return null;
      }

      if (error instanceof Error && error.name === "NoSuchKey") {
        return null;
      }

      throw error;
    }
  }

  async delete(key: string) {
    validateStorageKey(key);
    const env = getServerEnv();
    const client = await this.getClient();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");

    await client.send(new DeleteObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key
    }));
  }
}

const buildStorageAdapter = (): StorageAdapter => {
  const env = getServerEnv();
  return env.STORAGE_PROVIDER === "s3"
    ? new S3StorageAdapter()
    : new LocalStorageAdapter();
};

export const storageAdapter: StorageAdapter = buildStorageAdapter();
