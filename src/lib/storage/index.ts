// Storage facade. Driver selected via STORAGE_DRIVER:
//   "local"  (default) — filesystem in .local-uploads/
//   "s3"               — AWS S3 (or any S3-compatible: Cloudflare R2,
//                        Tigris, MinIO). Uses @aws-sdk/client-s3 if
//                        available; falls back to local with a warning.
//   "gcs"              — Google Cloud Storage via @google-cloud/storage
//                        (also optional dep).
//
// All drivers expose the same put/get/head/del + buildKey surface so
// callers don't care which one is wired up.

import { logger } from "@/lib/log";
import * as local from "./local";

const log = logger.child("storage");

export type StorageBackend = {
  put: (key: string, body: Uint8Array | Buffer) => Promise<{ key: string }>;
  get: (key: string) => Promise<Buffer>;
  head: (key: string) => Promise<{ exists: boolean; size?: number }>;
  del: (key: string) => Promise<void>;
};

let cached: StorageBackend | null = null;

export function getStorageBackend(): StorageBackend {
  if (cached) return cached;
  const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();
  if (driver === "s3") {
    cached = makeS3();
  } else if (driver === "gcs") {
    cached = makeGcs();
  } else {
    cached = local;
  }
  return cached;
}

export function _setStorageBackendForTests(b: StorageBackend | null): void {
  cached = b;
}

export const buildKey = local.buildKey;

export async function put(key: string, body: Uint8Array | Buffer): Promise<{ key: string }> {
  return getStorageBackend().put(key, body);
}
export async function get(key: string): Promise<Buffer> {
  return getStorageBackend().get(key);
}
export async function head(key: string): Promise<{ exists: boolean; size?: number }> {
  return getStorageBackend().head(key);
}
export async function del(key: string): Promise<void> {
  return getStorageBackend().del(key);
}

function makeS3(): StorageBackend {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    log.warn("STORAGE_DRIVER=s3 but S3_BUCKET unset; falling back to local");
    return local;
  }

  // Lazy: only require @aws-sdk/client-s3 if S3 is actually configured.
  // The require keeps Next.js bundling happy and avoids forcing the
  // dep on installations that don't use S3.
  let S3Client: new (cfg: unknown) => {
    send: (cmd: unknown) => Promise<unknown>;
  };
  let PutObjectCommand: new (cfg: unknown) => unknown;
  let GetObjectCommand: new (cfg: unknown) => unknown;
  let HeadObjectCommand: new (cfg: unknown) => unknown;
  let DeleteObjectCommand: new (cfg: unknown) => unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require("@aws-sdk/client-s3");
    S3Client = sdk.S3Client;
    PutObjectCommand = sdk.PutObjectCommand;
    GetObjectCommand = sdk.GetObjectCommand;
    HeadObjectCommand = sdk.HeadObjectCommand;
    DeleteObjectCommand = sdk.DeleteObjectCommand;
  } catch {
    log.warn("@aws-sdk/client-s3 not installed; falling back to local. Run `npm i @aws-sdk/client-s3` to enable S3 storage.");
    return local;
  }

  const s3 = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_FORCE_PATH_STYLE,
  });

  return {
    async put(key, body) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
      return { key };
    },
    async get(key) {
      const res = (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))) as {
        Body: { transformToByteArray: () => Promise<Uint8Array> };
      };
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    },
    async head(key) {
      try {
        const res = (await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        )) as { ContentLength?: number };
        return { exists: true, size: res.ContentLength };
      } catch {
        return { exists: false };
      }
    },
    async del(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

function makeGcs(): StorageBackend {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) {
    log.warn("STORAGE_DRIVER=gcs but GCS_BUCKET unset; falling back to local");
    return local;
  }
  let StorageCtor: new (opts?: unknown) => {
    bucket: (name: string) => {
      file: (key: string) => {
        save: (body: Uint8Array | Buffer) => Promise<unknown>;
        download: () => Promise<[Buffer]>;
        getMetadata: () => Promise<[{ size?: string | number }]>;
        delete: (opts?: { ignoreNotFound?: boolean }) => Promise<unknown>;
      };
    };
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    StorageCtor = require("@google-cloud/storage").Storage;
  } catch {
    log.warn("@google-cloud/storage not installed; falling back to local. Run `npm i @google-cloud/storage` to enable GCS.");
    return local;
  }
  const gcs = new StorageCtor();
  const bucket = gcs.bucket(bucketName);

  return {
    async put(key, body) {
      await bucket.file(key).save(body);
      return { key };
    },
    async get(key) {
      const [buf] = await bucket.file(key).download();
      return buf;
    },
    async head(key) {
      try {
        const [meta] = await bucket.file(key).getMetadata();
        const size = meta.size ? Number(meta.size) : undefined;
        return { exists: true, size };
      } catch {
        return { exists: false };
      }
    },
    async del(key) {
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
  };
}
