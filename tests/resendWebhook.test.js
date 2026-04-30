// Tests for lib/resendWebhook.js — Svix-style HMAC verification + the
// event normalizer. Both pure-functional; no DB.

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyResendSignature, normalizeResendEvent, _internal } from "../lib/resendWebhook.js";

const SECRET_BYTES = Buffer.from("compass-test-secret-bytes");
const SECRET = "whsec_" + SECRET_BYTES.toString("base64");

function sign({ id, ts, body }, secretBytes = SECRET_BYTES) {
  const signedContent = `${id}.${ts}.${body}`;
  return (
    "v1," +
    crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64")
  );
}

describe("verifyResendSignature", () => {
  it("accepts a well-signed payload", () => {
    const id = "msg_abc";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "email.delivered" });
    const sig = sign({ id, ts, body });
    const v = verifyResendSignature(
      { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig },
      body,
      SECRET,
    );
    expect(v.ok).toBe(true);
  });

  it("rejects when any header is missing", () => {
    expect(verifyResendSignature({}, "{}", SECRET).ok).toBe(false);
    expect(verifyResendSignature({ "svix-id": "a" }, "{}", SECRET).ok).toBe(false);
  });

  it("rejects when the body has been mutated", () => {
    const id = "msg_abc";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "email.delivered" });
    const sig = sign({ id, ts, body });
    const v = verifyResendSignature(
      { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig },
      body + "TAMPERED",
      SECRET,
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("no_match");
  });

  it("rejects a stale timestamp (>5 minute skew)", () => {
    const id = "msg_abc";
    const ts = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const body = "{}";
    const sig = sign({ id, ts, body });
    const v = verifyResendSignature(
      { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig },
      body,
      SECRET,
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("timestamp_skew");
  });

  it("accepts a multi-token signature header during key rotation", () => {
    const id = "msg_abc";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "{}";
    const oldSecret = Buffer.from("old-secret");
    const oldSig = sign({ id, ts, body }, oldSecret);
    const newSig = sign({ id, ts, body });
    const v = verifyResendSignature(
      {
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": `${oldSig} ${newSig}`,
      },
      body,
      SECRET,
    );
    expect(v.ok).toBe(true);
  });

  it("rejects when only the wrong-secret signature is present", () => {
    const id = "msg_abc";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "{}";
    const wrong = sign({ id, ts, body }, Buffer.from("wrong-secret"));
    const v = verifyResendSignature(
      { "svix-id": id, "svix-timestamp": ts, "svix-signature": wrong },
      body,
      SECRET,
    );
    expect(v.ok).toBe(false);
  });

  it("rejects unparseable timestamp", () => {
    const id = "msg_abc";
    const body = "{}";
    const ts = "not-a-number";
    const sig = sign({ id, ts: "0", body });
    const v = verifyResendSignature(
      { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig },
      body,
      SECRET,
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("bad_timestamp");
  });

  it("accepts capital-cased Svix-* header keys", () => {
    const id = "msg_abc";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "{}";
    const sig = sign({ id, ts, body });
    const v = verifyResendSignature(
      { "Svix-Id": id, "Svix-Timestamp": ts, "Svix-Signature": sig },
      body,
      SECRET,
    );
    expect(v.ok).toBe(true);
  });

  it("rejects when no secret is provided", () => {
    expect(
      verifyResendSignature(
        { "svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,xx" },
        "{}",
        "",
      ).ok,
    ).toBe(false);
  });

  it("parses both whsec_-prefixed and bare-base64 secrets", () => {
    expect(_internal.parseSecret("whsec_" + Buffer.from("a").toString("base64"))).not.toBeNull();
    expect(_internal.parseSecret(Buffer.from("a").toString("base64"))).not.toBeNull();
  });
});

describe("normalizeResendEvent", () => {
  it("classifies email.bounced with the bounceType subcategory", () => {
    const out = normalizeResendEvent({
      type: "email.bounced",
      data: { to: ["scout@example.invalid"], bounce: { bounceType: "Permanent" } },
    });
    expect(out).toEqual({
      kind: "bounced",
      email: "scout@example.invalid",
      reason: "bounced:permanent",
    });
  });

  it("falls back to plain 'bounced' when bounceType is absent", () => {
    const out = normalizeResendEvent({
      type: "email.bounced",
      data: { to: ["x@y.invalid"] },
    });
    expect(out.reason).toBe("bounced");
  });

  it("classifies email.complained", () => {
    const out = normalizeResendEvent({
      type: "email.complained",
      data: { to: ["x@y.invalid"] },
    });
    expect(out).toEqual({ kind: "complained", email: "x@y.invalid", reason: "complained" });
  });

  it("returns kind=null for delivered / opened / clicked / unknown", () => {
    expect(normalizeResendEvent({ type: "email.delivered", data: { to: ["x@y"] } }).kind).toBeNull();
    expect(normalizeResendEvent({ type: "email.opened", data: { to: ["x@y"] } }).kind).toBeNull();
    expect(normalizeResendEvent({ type: "future.event" }).kind).toBeNull();
    expect(normalizeResendEvent(null).kind).toBeNull();
  });

  it("lowercases the recipient email", () => {
    const out = normalizeResendEvent({
      type: "email.bounced",
      data: { to: ["Mason@Example.Invalid"] },
    });
    expect(out.email).toBe("mason@example.invalid");
  });

  it("handles a string recipient (some providers ship it that way)", () => {
    const out = normalizeResendEvent({
      type: "email.bounced",
      data: { to: "lone@example.invalid" },
    });
    expect(out.email).toBe("lone@example.invalid");
  });
});
