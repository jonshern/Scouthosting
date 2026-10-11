import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, parseId, readJson, readQuery, IsoDate } from "./v1";

const post = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/v1/x", { method: "POST", body, headers });

describe("errorResponse", () => {
  it("shapes ApiError as { error, ...extra } with its status and headers", async () => {
    const res = errorResponse(new ApiError(429, "rate_limited", { retryAfter: 3 }, { "Retry-After": "3" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "rate_limited", retryAfter: 3 });
  });

  it("uses a schema's snake_case message as the code", async () => {
    const err = z.object({ token: z.string().min(1, "missing_token") }).safeParse({ token: "" }).error!;
    const res = errorResponse(err);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_token");
  });

  it("falls back to invalid_request with issue paths", async () => {
    const err = z.object({ n: z.number() }).safeParse({ n: "x" }).error!;
    const body = await errorResponse(err).json();
    expect(body.error).toBe("invalid_request");
    expect(body.issues[0].path).toBe("n");
  });

  it("never leaks internals for unexpected errors", async () => {
    const res = errorResponse(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});

describe("readJson", () => {
  const S = z.object({ a: z.string() });

  it("parses and validates", async () => {
    expect(await readJson(post('{"a":"x"}'), S)).toEqual({ a: "x" });
  });

  it("rejects malformed JSON and non-objects as bad_json", async () => {
    for (const body of ["{", "[1]", '"s"', "null"]) {
      await expect(readJson(post(body), S)).rejects.toMatchObject({ status: 400, code: "bad_json" });
    }
  });

  it("rejects oversized bodies", async () => {
    const big = JSON.stringify({ a: "x".repeat(70 * 1024) });
    await expect(readJson(post(big), S)).rejects.toMatchObject({ status: 413, code: "too_large" });
  });
});

describe("parseId / readQuery", () => {
  it("rejects ids with path or SQL-ish characters as not found", () => {
    expect(parseId("ckabc123")).toBe("ckabc123");
    for (const bad of ["", "../x", "a b", "x'--", "a".repeat(65)]) {
      expect(() => parseId(bad)).toThrow(ApiError);
    }
  });

  it("validates timestamps", () => {
    const S = z.object({ before: IsoDate.optional() });
    const ok = readQuery(new NextRequest("http://l/x?before=2026-01-01T00:00:00Z"), S);
    expect(ok.before).toBeInstanceOf(Date);
    expect(() => readQuery(new NextRequest("http://l/x?before=garbage"), S)).toThrow(z.ZodError);
  });
});
