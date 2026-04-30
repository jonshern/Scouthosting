// Bearer-token auth tests. The token's raw value is shown to the caller
// exactly once and only its sha256 hash is stored — so the contract is
// "issuer returns raw, verifier accepts raw, store leaks the hash".

import { describe, it, expect } from "vitest";
import {
  generateRawToken,
  hashToken,
  issueToken,
  verifyToken,
  revokeToken,
  _internal,
} from "../lib/apiToken.js";

function fakePrisma() {
  const tokens = [];
  return {
    apiToken: {
      async create({ data }) {
        const row = { id: `id${tokens.length + 1}`, createdAt: new Date(), ...data };
        tokens.push(row);
        return row;
      },
      async findUnique({ where, select }) {
        const row = tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!row) return null;
        if (select) return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));
        return row;
      },
      async update({ where, data }) {
        const row = tokens.find((t) => t.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return row;
      },
    },
    _tokens: tokens,
  };
}

describe("generateRawToken", () => {
  it("is unique across runs (no static seed)", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toBe(b);
  });

  it("starts with the documented prefix", () => {
    expect(generateRawToken().startsWith(_internal.TOKEN_PREFIX)).toBe(true);
  });

  it("carries 256 bits of entropy in hex past the prefix", () => {
    const raw = generateRawToken();
    const hex = raw.slice(_internal.TOKEN_PREFIX.length);
    expect(hex).toHaveLength(_internal.TOKEN_BYTES * 2);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });
});

describe("hashToken", () => {
  it("is deterministic", () => {
    const raw = "compass_pat_abcd";
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  it("differs from the raw input (not just a passthrough)", () => {
    const raw = "compass_pat_abcd";
    expect(hashToken(raw)).not.toBe(raw);
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("issueToken", () => {
  it("stores the hash, not the raw token", async () => {
    const prisma = fakePrisma();
    const r = await issueToken("user1", "Mason iPhone", prisma);
    expect(r.raw.startsWith(_internal.TOKEN_PREFIX)).toBe(true);
    expect(prisma._tokens).toHaveLength(1);
    expect(prisma._tokens[0].tokenHash).toBe(hashToken(r.raw));
    expect(prisma._tokens[0].tokenHash).not.toBe(r.raw);
  });

  it("trims + caps the device name", async () => {
    const prisma = fakePrisma();
    const longName = " ".repeat(2) + "x".repeat(200);
    const r = await issueToken("user1", longName, prisma);
    expect(r.name.length).toBe(80);
    expect(r.name.trim()).toBe(r.name);
  });

  it("rejects missing args", async () => {
    const prisma = fakePrisma();
    await expect(issueToken()).rejects.toThrow(/missing userId/);
    await expect(issueToken("u", "")).rejects.toThrow(/missing name/);
    await expect(issueToken("u", "x")).rejects.toThrow(/missing prismaClient/);
  });
});

describe("verifyToken", () => {
  it("returns the userId for a valid Authorization header", async () => {
    const prisma = fakePrisma();
    const r = await issueToken("user1", "iPhone", prisma);
    const v = await verifyToken(`Bearer ${r.raw}`, prisma);
    expect(v).toEqual({ userId: "user1", tokenId: r.id });
  });

  it("returns null on null / missing / non-Bearer / wrong-prefix headers", async () => {
    const prisma = fakePrisma();
    expect(await verifyToken(null, prisma)).toBeNull();
    expect(await verifyToken("", prisma)).toBeNull();
    expect(await verifyToken("Token blah", prisma)).toBeNull();
    expect(await verifyToken("Bearer not_a_compass_token", prisma)).toBeNull();
  });

  it("returns null for revoked tokens", async () => {
    const prisma = fakePrisma();
    const r = await issueToken("user1", "iPhone", prisma);
    await revokeToken(r.id, prisma);
    expect(await verifyToken(`Bearer ${r.raw}`, prisma)).toBeNull();
  });

  it("returns null for unknown tokens (not in the DB)", async () => {
    const prisma = fakePrisma();
    const fake = generateRawToken();
    expect(await verifyToken(`Bearer ${fake}`, prisma)).toBeNull();
  });

  it("accepts case-insensitive 'bearer' / 'BEARER'", async () => {
    const prisma = fakePrisma();
    const r = await issueToken("user1", "iPhone", prisma);
    expect(await verifyToken(`bearer ${r.raw}`, prisma)).toMatchObject({ userId: "user1" });
    expect(await verifyToken(`BEARER ${r.raw}`, prisma)).toMatchObject({ userId: "user1" });
  });
});
