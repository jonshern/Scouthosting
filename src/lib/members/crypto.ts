// Member ↔ encrypted column adapter.
//
// Encrypt: turn an inbound MemberInput into the Bytes columns the DB
// expects, plus the lastNameLc1 sort bucket.
//
// Decrypt: turn a row read from the DB back into an object with
// plaintext name/phone/address fields.
//
// Both helpers take an already-unwrapped DEK so callers don't have to
// pay the master-key unwrap cost per row. Read paths typically:
//   const dek = unwrapDekWithMaster(org);
//   const decoded = members.map((m) => decryptMember(m, dek, org.id));
//
// Performance note: AES-GCM in node:crypto is hardware-accelerated;
// decrypting ~7 fields per row over 100 rows is sub-millisecond and
// the page query dominates.

import { encryptField, decryptField } from "@/lib/encryption";

export type MemberPlaintextInput = {
  firstName: string;
  lastName: string;
  phone?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type EncryptedMemberColumns = {
  encFirstName: Buffer | null;
  encLastName: Buffer | null;
  encPhone: Buffer | null;
  encStreet: Buffer | null;
  encCity: Buffer | null;
  encState: Buffer | null;
  encZip: Buffer | null;
  lastNameLc1: string;
};

export type EncryptedMemberRow = {
  encFirstName: Buffer | Uint8Array | null;
  encLastName: Buffer | Uint8Array | null;
  encPhone: Buffer | Uint8Array | null;
  encStreet: Buffer | Uint8Array | null;
  encCity: Buffer | Uint8Array | null;
  encState: Buffer | Uint8Array | null;
  encZip: Buffer | Uint8Array | null;
};

export type DecryptedMember = {
  firstName: string;
  lastName: string;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export function encryptMemberPii(
  input: MemberPlaintextInput,
  dek: Buffer,
  orgId: string,
): EncryptedMemberColumns {
  return {
    encFirstName: encryptField(input.firstName, dek, orgId, "member.firstName"),
    encLastName: encryptField(input.lastName, dek, orgId, "member.lastName"),
    encPhone: encryptField(input.phone ?? null, dek, orgId, "member.phone"),
    encStreet: encryptField(input.street ?? null, dek, orgId, "member.street"),
    encCity: encryptField(input.city ?? null, dek, orgId, "member.city"),
    encState: encryptField(input.state ?? null, dek, orgId, "member.state"),
    encZip: encryptField(input.zip ?? null, dek, orgId, "member.zip"),
    lastNameLc1: (input.lastName[0] ?? "?").toLowerCase(),
  };
}

export function decryptMemberPii(
  row: EncryptedMemberRow,
  dek: Buffer,
  orgId: string,
): DecryptedMember {
  return {
    firstName: decryptField(row.encFirstName, dek, orgId, "member.firstName") ?? "",
    lastName: decryptField(row.encLastName, dek, orgId, "member.lastName") ?? "",
    phone: decryptField(row.encPhone, dek, orgId, "member.phone"),
    street: decryptField(row.encStreet, dek, orgId, "member.street"),
    city: decryptField(row.encCity, dek, orgId, "member.city"),
    state: decryptField(row.encState, dek, orgId, "member.state"),
    zip: decryptField(row.encZip, dek, orgId, "member.zip"),
  };
}

/** Format an address as a single line, omitting empty parts. */
export function formatAddress(m: Pick<DecryptedMember, "street" | "city" | "state" | "zip">): string {
  const parts: string[] = [];
  if (m.street) parts.push(m.street);
  const tail = [m.city, m.state].filter(Boolean).join(", ");
  if (tail) parts.push(tail + (m.zip ? ` ${m.zip}` : ""));
  else if (m.zip) parts.push(m.zip);
  return parts.join(" · ");
}
