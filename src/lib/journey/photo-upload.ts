// Reads a Lantern proof photo upload: multipart/form-data with a "photo"
// file part and clientId, key, day? and text? fields. Images only
// (checked by content), 10 MB cap, like the album uploader.

import type { NextRequest } from "next/server";
import { ApiError, badRequest } from "@/lib/api/v1";
import { sniffImageType, type ImageMime } from "@/lib/api/image-type";
import { ClientId, DoneOn, MAX_ENTRY_TEXT, ProgressKey } from "./schema";
import { z } from "zod";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024;

const Fields = z.object({
  clientId: ClientId,
  key: ProgressKey,
  day: DoneOn.optional(),
  text: z.string().max(MAX_ENTRY_TEXT).optional(),
});

export async function readPhotoUpload(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_REQUEST_BYTES) throw new ApiError(413, "too_large");
  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest("bad_form");
  const file = form.get("photo");
  if (!(file instanceof File)) throw badRequest("no_file");
  if (file.size === 0) throw badRequest("empty_file");
  if (file.size > MAX_BYTES) throw new ApiError(413, "too_large");
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const fields = Fields.parse({ clientId: field("clientId"), key: field("key"), day: field("day"), text: field("text") });
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType: ImageMime | null = sniffImageType(bytes);
  if (!mimeType) throw new ApiError(415, "unsupported_type");
  return { fields, bytes, mimeType };
}

/** The decrypted photo as a private, uncached response. */
export function photoResponse(p: { bytes: Buffer; mimeType: string }): Response {
  return new Response(new Uint8Array(p.bytes), {
    headers: {
      "content-type": p.mimeType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
