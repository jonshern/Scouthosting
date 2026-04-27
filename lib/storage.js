// Storage abstraction for org-scoped uploads.
//
// Phase 1: local filesystem under var/uploads/<orgId>/<filename>.
// Later phases will swap the implementation for an S3-compatible backend
// without changing the call sites.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_ROOT || path.join(ROOT, "var", "uploads")
);

function orgDir(orgId) {
  // Defensive: orgId is a cuid we generate, but make sure no traversal sneaks in.
  if (!/^[a-z0-9]+$/i.test(orgId)) throw new Error("Invalid orgId");
  return path.join(UPLOAD_ROOT, orgId);
}

function pathFor(orgId, filename) {
  if (!/^[a-z0-9._-]+$/i.test(filename)) throw new Error("Invalid filename");
  return path.join(orgDir(orgId), filename);
}

export async function save(orgId, filename, buffer) {
  await fs.promises.mkdir(orgDir(orgId), { recursive: true });
  await fs.promises.writeFile(pathFor(orgId, filename), buffer);
}

export async function moveFromTemp(orgId, filename, tempPath) {
  await fs.promises.mkdir(orgDir(orgId), { recursive: true });
  const dest = pathFor(orgId, filename);
  try {
    await fs.promises.rename(tempPath, dest);
  } catch (err) {
    if (err.code === "EXDEV") {
      // Cross-device — copy then unlink.
      await fs.promises.copyFile(tempPath, dest);
      await fs.promises.unlink(tempPath);
    } else {
      throw err;
    }
  }
}

export function readStream(orgId, filename) {
  return fs.createReadStream(pathFor(orgId, filename));
}

export function absolutePath(orgId, filename) {
  return pathFor(orgId, filename);
}

export async function remove(orgId, filename) {
  try {
    await fs.promises.unlink(pathFor(orgId, filename));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

export async function exists(orgId, filename) {
  try {
    await fs.promises.access(pathFor(orgId, filename));
    return true;
  } catch {
    return false;
  }
}
