import { describe, expect, it, beforeEach } from "vitest";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  decryptField,
  encryptField,
  formatRecoveryCode,
  parseRecoveryCode,
  provisionOrgVault,
  unwrapDekWithMaster,
  unwrapDekWithPassphrase,
  unwrapDekWithRecovery,
  WrongPassphraseError,
  WrongRecoveryCodeError,
  randomBytes,
  _resetMasterKeyForTests,
} from "./index";

const PASS = "test-passphrase-12345";
const ORG_ID = "org_test_01";

beforeEach(() => {
  // Pin a deterministic master key per test so the wraps round-trip.
  process.env.MASTER_KEY = randomBytes(32).toString("hex");
  _resetMasterKeyForTests();
});

describe("aesGcm round-trip", () => {
  it("encrypts and decrypts with correct key", () => {
    const key = randomBytes(32);
    const ct = aesGcmEncrypt(key, "hello world", "aad");
    const pt = aesGcmDecrypt(key, ct, "aad");
    expect(pt.toString("utf8")).toBe("hello world");
  });

  it("rejects ciphertext with a different key", () => {
    const k1 = randomBytes(32);
    const k2 = randomBytes(32);
    const ct = aesGcmEncrypt(k1, "secret", "aad");
    expect(() => aesGcmDecrypt(k2, ct, "aad")).toThrow();
  });

  it("rejects ciphertext with mismatched AAD", () => {
    const key = randomBytes(32);
    const ct = aesGcmEncrypt(key, "secret", "aad-a");
    expect(() => aesGcmDecrypt(key, ct, "aad-b")).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const key = randomBytes(32);
    const ct = aesGcmEncrypt(key, "secret", "aad");
    ct[ct.length - 1] ^= 0x01;
    expect(() => aesGcmDecrypt(key, ct, "aad")).toThrow();
  });
});

describe("recovery code formatting", () => {
  it("round-trips a 32-byte buffer through format/parse", () => {
    const buf = randomBytes(32);
    const code = formatRecoveryCode(buf);
    expect(code.startsWith("cmps-")).toBe(true);
    const parsed = parseRecoveryCode(code);
    expect(parsed.equals(buf)).toBe(true);
  });

  it("normalizes Crockford ambiguous chars", () => {
    const buf = randomBytes(32);
    const original = formatRecoveryCode(buf);
    // Substitute O→0, I→1, L→1, U→V (with case noise)
    const lower = original.toLowerCase();
    expect(parseRecoveryCode(lower).equals(buf)).toBe(true);
  });
});

describe("vault provisioning + unwrap", () => {
  it("provisions a vault that all three wraps unlock", async () => {
    const { fields, recoveryCode, dek } = await provisionOrgVault(PASS);

    const fromMaster = unwrapDekWithMaster({ encryptedDek: fields.encryptedDek });
    expect(fromMaster.equals(dek)).toBe(true);

    const fromPass = await unwrapDekWithPassphrase(
      {
        passphraseWrappedDek: fields.passphraseWrappedDek,
        passphraseSalt: fields.passphraseSalt,
        passphraseVerifier: fields.passphraseVerifier,
      },
      PASS,
    );
    expect(fromPass.equals(dek)).toBe(true);

    const fromRecovery = unwrapDekWithRecovery(
      {
        recoveryWrappedDek: fields.recoveryWrappedDek,
        recoverySalt: fields.recoverySalt,
        recoveryVerifier: fields.recoveryVerifier,
      },
      recoveryCode,
    );
    expect(fromRecovery.equals(dek)).toBe(true);
  });

  it("rejects wrong passphrase via verifier", async () => {
    const { fields } = await provisionOrgVault(PASS);
    await expect(
      unwrapDekWithPassphrase(
        {
          passphraseWrappedDek: fields.passphraseWrappedDek,
          passphraseSalt: fields.passphraseSalt,
          passphraseVerifier: fields.passphraseVerifier,
        },
        "wrong-passphrase-12",
      ),
    ).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("rejects wrong recovery code", async () => {
    const { fields } = await provisionOrgVault(PASS);
    expect(() =>
      unwrapDekWithRecovery(
        {
          recoveryWrappedDek: fields.recoveryWrappedDek,
          recoverySalt: fields.recoverySalt,
          recoveryVerifier: fields.recoveryVerifier,
        },
        "cmps-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA",
      ),
    ).toThrow(WrongRecoveryCodeError);
  });

  it("requires passphrase ≥ 12 chars", async () => {
    await expect(provisionOrgVault("short")).rejects.toThrow();
  });
});

describe("field-level encryption", () => {
  it("round-trips through encryptField/decryptField", async () => {
    const { dek } = await provisionOrgVault(PASS);
    const ct = encryptField("Avery", dek, ORG_ID, "member.firstName");
    expect(ct).not.toBeNull();
    const pt = decryptField(ct, dek, ORG_ID, "member.firstName");
    expect(pt).toBe("Avery");
  });

  it("returns null on null/empty input", async () => {
    const { dek } = await provisionOrgVault(PASS);
    expect(encryptField(null, dek, ORG_ID, "member.firstName")).toBeNull();
    expect(encryptField("", dek, ORG_ID, "member.firstName")).toBeNull();
    expect(decryptField(null, dek, ORG_ID, "member.firstName")).toBeNull();
  });

  it("rejects ciphertext with mismatched orgId (cross-tenant isolation)", async () => {
    const { dek } = await provisionOrgVault(PASS);
    const ct = encryptField("Avery", dek, "org_a", "member.firstName")!;
    expect(() => decryptField(ct, dek, "org_b", "member.firstName")).toThrow();
  });

  it("rejects ciphertext with mismatched purpose", async () => {
    const { dek } = await provisionOrgVault(PASS);
    const ct = encryptField("Avery", dek, ORG_ID, "member.firstName")!;
    expect(() => decryptField(ct, dek, ORG_ID, "member.lastName")).toThrow();
  });

  it("rejects ciphertext encrypted with a different DEK", async () => {
    const v1 = await provisionOrgVault(PASS);
    const v2 = await provisionOrgVault(PASS);
    const ct = encryptField("Avery", v1.dek, ORG_ID, "member.firstName")!;
    expect(() => decryptField(ct, v2.dek, ORG_ID, "member.firstName")).toThrow();
  });
});
