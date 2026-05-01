import { describe, it, expect, vi } from "vitest";
import { csrfMiddleware, csrfProtect, csrfField, csrfHtmlInjector } from "../lib/csrf.js";

function fakeReq(headers = {}, method = "GET", body = null) {
  return { headers, method, body };
}
function fakeRes() {
  const res = {
    statusCode: 200,
    body: "",
    headers: {},
    _ct: "",
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.type = () => res;
  res.send = (b) => { res.body = b; return res; };
  res.appendHeader = (n, v) => {
    res.headers[n] = (res.headers[n] || []).concat(v);
    return res;
  };
  res.get = (n) => (n.toLowerCase() === "content-type" ? res._ct : null);
  return res;
}

describe("csrfMiddleware", () => {
  it("issues a token cookie when missing and exposes req.csrfToken", () => {
    const req = fakeReq();
    const res = fakeRes();
    const next = vi.fn();
    csrfMiddleware(req, res, next);
    expect(req.csrfToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect((res.headers["Set-Cookie"] || []).join("")).toMatch(/compass_csrf=/);
    expect(next).toHaveBeenCalledOnce();
  });

  it("reuses a cookie when one already exists", () => {
    const tok = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const req = fakeReq({ cookie: `compass_csrf=${tok}` });
    const res = fakeRes();
    const next = vi.fn();
    csrfMiddleware(req, res, next);
    expect(req.csrfToken).toBe(tok);
    expect(res.headers["Set-Cookie"]).toBeUndefined();
  });
});

describe("csrfProtect", () => {
  const tok = "AAAAAAAAAAAAAAAAAAAAAAAAAA";

  it("passes through GET", () => {
    const req = fakeReq({ cookie: `compass_csrf=${tok}` }, "GET");
    const res = fakeRes();
    const next = vi.fn();
    csrfProtect(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects POST without a body or header token", () => {
    const req = fakeReq({ cookie: `compass_csrf=${tok}` }, "POST", {});
    const res = fakeRes();
    const next = vi.fn();
    csrfProtect(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects POST when cookie and body don't match", () => {
    const req = fakeReq({ cookie: `compass_csrf=${tok}` }, "POST", { csrf: "wrong-value-of-same-len" });
    const res = fakeRes();
    const next = vi.fn();
    csrfProtect(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts POST when body token matches the cookie", () => {
    const req = fakeReq({ cookie: `compass_csrf=${tok}` }, "POST", { csrf: tok });
    const res = fakeRes();
    const next = vi.fn();
    csrfProtect(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("accepts POST via X-CSRF-Token header instead of body", () => {
    const req = fakeReq({ cookie: `compass_csrf=${tok}`, "x-csrf-token": tok }, "POST", {});
    const res = fakeRes();
    const next = vi.fn();
    csrfProtect(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("csrfField", () => {
  it("emits a hidden input with the token", () => {
    const html = csrfField("abc-123_XY");
    expect(html).toBe('<input type="hidden" name="csrf" value="abc-123_XY">');
  });
  it("strips characters outside the base64url alphabet", () => {
    expect(csrfField("a<b>c\"d&e")).toBe('<input type="hidden" name="csrf" value="abcde">');
  });
});

describe("csrfHtmlInjector", () => {
  it("injects the hidden input after every <form method='post'>", () => {
    const req = { csrfToken: "TOK" };
    const res = fakeRes();
    res._ct = "text/html; charset=utf-8";
    const next = vi.fn();
    csrfHtmlInjector(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    res.send(`<form method="post" action="/x">hi</form><form action="/y">no</form>`);
    expect(res.body).toContain('<form method="post" action="/x"><input type="hidden" name="csrf" value="TOK">');
    // Form without method=post is left alone.
    const noPostMatches = res.body.match(/<form action="\/y">/g) || [];
    expect(noPostMatches.length).toBe(1);
  });

  it("does not modify non-HTML responses", () => {
    const req = { csrfToken: "TOK" };
    const res = fakeRes();
    res._ct = "application/json";
    const next = vi.fn();
    csrfHtmlInjector(req, res, next);
    res.send(`<form method="post"></form>`);
    expect(res.body).toBe(`<form method="post"></form>`);
  });
});
