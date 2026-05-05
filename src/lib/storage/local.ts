import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Local-filesystem storage backend. The default in dev and the
 * fallback in prod when no cloud bucket is configured. Files land
 * in `.local-uploads/` at the repo root.
 *
 * Production should swap this for an S3 / R2 / GCS backend with
 * the same put / get / list / delete surface (port from the existing
 * Compass `lib/storage.js` at parity).
 */

const ROOT = process.env.LOCAL_UPLOADS_DIR ?? path.resolve(process.cwd(), ".local-uploads");

function safeKey(key: string): string {
  // Reject path traversal. Keys are flat strings like "orgs/<id>/photos/<id>.jpg".
  if (key.includes("..") || key.startsWith("/")) {
    throw new Error(`unsafe storage key: ${key}`);
  }
  return key;
}

function fullPath(key: string): string {
  return path.join(ROOT, safeKey(key));
}

export async function put(key: string, body: Uint8Array | Buffer): Promise<{ key: string }> {
  const p = fullPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
  return { key };
}

export async function get(key: string): Promise<Buffer> {
  return fs.readFile(fullPath(key));
}

export async function head(key: string): Promise<{ exists: boolean; size?: number }> {
  try {
    const st = await fs.stat(fullPath(key));
    return { exists: true, size: st.size };
  } catch {
    return { exists: false };
  }
}

export async function del(key: string): Promise<void> {
  try {
    await fs.unlink(fullPath(key));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

export function buildKey(orgId: string, scope: "photos" | "attachments" | "logos", filename: string): string {
  const ext = path.extname(filename).toLowerCase().slice(0, 8);
  const random = crypto.randomBytes(8).toString("hex");
  return `orgs/${orgId}/${scope}/${random}${ext}`;
}

export const localUploadsRoot = ROOT;
