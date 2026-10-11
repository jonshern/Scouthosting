// Who may load a stored photo, and how it is served. Used by the
// /uploads/[...key] route; kept DB-light and pure where it can be so
// the rules are unit-tested.

import { EXT_BY_MIME } from "@/lib/api/image-type";

export type PhotoAccessInput = {
  albumVisibility: string | null; // null = not an album photo
  isChatPhoto: boolean;
  viewer: {
    signedIn: boolean;
    isSuperAdmin: boolean;
    isOrgMember: boolean;
    isChannelMember: boolean; // member of the chat channel the photo was posted in
  };
};

export type PhotoAccess = { ok: true } | { ok: false; status: 403 };

export function decidePhotoAccess(input: PhotoAccessInput): PhotoAccess {
  const { viewer } = input;
  if (viewer.isSuperAdmin && viewer.signedIn) return { ok: true };
  if (input.isChatPhoto) {
    // Chat photos are as private as the chat itself: org membership
    // isn't enough, or any unit member could open photos from a
    // leaders-only channel or a DM.
    return viewer.signedIn && viewer.isChannelMember ? { ok: true } : { ok: false, status: 403 };
  }
  if (input.albumVisibility === "members") {
    return viewer.signedIn && viewer.isOrgMember ? { ok: true } : { ok: false, status: 403 };
  }
  return { ok: true };
}

/**
 * Response headers for a stored photo. Only the allow-listed image
 * types are served inline; anything else (legacy rows with a client-
 * declared type) is forced to download as opaque bytes so a stored
 * "text/html" can't run script on our origin.
 */
export function photoHeaders(mimeType: string, byteLength: number): Record<string, string> {
  const isImage = Object.prototype.hasOwnProperty.call(EXT_BY_MIME, mimeType);
  return {
    "Content-Type": isImage ? mimeType : "application/octet-stream",
    "Content-Length": String(byteLength),
    "Content-Disposition": isImage ? "inline" : "attachment",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, max-age=600",
  };
}
