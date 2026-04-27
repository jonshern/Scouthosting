// Storage abstraction for org-scoped uploads.
//
// Two drivers selected via STORAGE_DRIVER:
//   "fs"  (default in dev)  — local filesystem under var/uploads/<orgId>/
//   "gcs" (default in prod) — Google Cloud Storage bucket
//
// Both expose the same async interface: save / moveFromTemp / readStream /
// remove / exists. Object key = `<orgId>/<filename>`; the route layer
// resolves through Prisma first to enforce the tenant boundary, so the
// storage layer doesn't have to.

import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_ROOT || path.join(ROOT, "var", "uploads")
);

const DRIVER = (process.env.STORAGE_DRIVER || "fs").toLowerCase();

/* ------------------------------------------------------------------ */
/* Defensive validation (shared)                                       */
/* ------------------------------------------------------------------ */

function assertOrgId(orgId) {
  if (!/^[a-z0-9]+$/i.test(orgId)) throw new Error("Invalid orgId");
}
function assertFilename(filename) {
  if (!/^[a-z0-9._-]+$/i.test(filename)) throw new Error("Invalid filename");
}
function key(orgId, filename) {
  assertOrgId(orgId);
  assertFilename(filename);
  return `${orgId}/${filename}`;
}

/* ------------------------------------------------------------------ */
/* Filesystem driver                                                   */
/* ------------------------------------------------------------------ */

const fsDriver = {
  async save(orgId, filename, buffer) {
    const dir = path.join(UPLOAD_ROOT, orgId);
    assertOrgId(orgId);
    assertFilename(filename);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, filename), buffer);
  },
  async moveFromTemp(orgId, filename, tempPath) {
    const dir = path.join(UPLOAD_ROOT, orgId);
    assertOrgId(orgId);
    assertFilename(filename);
    await fs.promises.mkdir(dir, { recursive: true });
    const dest = path.join(dir, filename);
    try {
      await fs.promises.rename(tempPath, dest);
    } catch (err) {
      if (err.code === "EXDEV") {
        await fs.promises.copyFile(tempPath, dest);
        await fs.promises.unlink(tempPath);
      } else {
        throw err;
      }
    }
  },
  readStream(orgId, filename) {
    return fs.createReadStream(path.join(UPLOAD_ROOT, key(orgId, filename)));
  },
  async remove(orgId, filename) {
    try {
      await fs.promises.unlink(path.join(UPLOAD_ROOT, key(orgId, filename)));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  },
  async exists(orgId, filename) {
    try {
      await fs.promises.access(path.join(UPLOAD_ROOT, key(orgId, filename)));
      return true;
    } catch {
      return false;
    }
  },
};

/* ------------------------------------------------------------------ */
/* GCS driver — lazily loaded so dev doesn't pay the install cost      */
/* ------------------------------------------------------------------ */

function gcsDriver() {
  // Dynamic import so @google-cloud/storage is only required in prod.
  // The dependency is added by the GCP Terraform module's deploy doc.
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error("GCS_BUCKET env var required when STORAGE_DRIVER=gcs");
  }
  let bucket;
  async function getBucket() {
    if (bucket) return bucket;
    const { Storage } = await import("@google-cloud/storage");
    bucket = new Storage().bucket(bucketName);
    return bucket;
  }

  return {
    async save(orgId, filename, buffer) {
      const b = await getBucket();
      await b.file(key(orgId, filename)).save(buffer, { resumable: false });
    },
    async moveFromTemp(orgId, filename, tempPath) {
      const b = await getBucket();
      await b.upload(tempPath, { destination: key(orgId, filename), resumable: false });
      await fs.promises.unlink(tempPath).catch(() => {});
    },
    readStream(orgId, filename) {
      // Returns a Readable. The caller pipes to res. We can't await here,
      // so kick off the bucket fetch and wrap the stream that comes back.
      const out = new PassThrough();
      getBucket()
        .then((b) => b.file(key(orgId, filename)).createReadStream().pipe(out))
        .catch((err) => out.destroy(err));
      return out;
    },
    async remove(orgId, filename) {
      const b = await getBucket();
      await b.file(key(orgId, filename)).delete({ ignoreNotFound: true });
    },
    async exists(orgId, filename) {
      const b = await getBucket();
      const [ok] = await b.file(key(orgId, filename)).exists();
      return ok;
    },
  };
}

const driver = DRIVER === "gcs" ? gcsDriver() : fsDriver;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export const save = (...a) => driver.save(...a);
export const moveFromTemp = (...a) => driver.moveFromTemp(...a);
export const readStream = (...a) => driver.readStream(...a);
export const remove = (...a) => driver.remove(...a);
export const exists = (...a) => driver.exists(...a);

export function absolutePath(orgId, filename) {
  // Only meaningful for the fs driver; the GCS driver returns null so
  // callers know to use readStream instead.
  if (DRIVER === "gcs") return null;
  return path.join(UPLOAD_ROOT, key(orgId, filename));
}

export const storageDriver = DRIVER;
