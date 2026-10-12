// Scout names in Lantern are encrypted at rest like roster names, but a
// family's scouts aren't in an org, so there is no org DEK. Each owner
// gets a key derived from MASTER_KEY with HKDF, bound to their user id;
// the ciphertext's AAD binds it to that user and the "journey.name"
// purpose, so a blob can't be moved to another user's row.
//
// Rotating MASTER_KEY means re-encrypting these names (decrypt with the
// old key, encrypt with the new) along with re-wrapping org DEKs.

import { decryptField, encryptField, getMasterKey, hkdf } from "@/lib/encryption";

const SALT = Buffer.from("compass:journey:v1");
const PURPOSE = "journey.name";

function ownerKey(ownerUserId: string): Buffer {
  return hkdf(getMasterKey(), SALT, `journey-owner:${ownerUserId}`, 32);
}

export function encryptScoutName(ownerUserId: string, name: string): Buffer {
  const blob = encryptField(name, ownerKey(ownerUserId), ownerUserId, PURPOSE);
  if (!blob) throw new Error("scout name is empty");
  return blob;
}

/** The name, or "" if it can't be read (e.g. a dev server restarted without MASTER_KEY). */
export function decryptScoutName(ownerUserId: string, blob: Uint8Array): string {
  try {
    return decryptField(blob, ownerKey(ownerUserId), ownerUserId, PURPOSE) ?? "";
  } catch {
    return "";
  }
}
