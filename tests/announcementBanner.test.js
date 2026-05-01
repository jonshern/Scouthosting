// Announcement banner middleware tests.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma client before the module under test imports it.
const findFirstMock = vi.fn();
vi.mock("../lib/db.js", () => ({
  prisma: { announcement: { findFirst: (...args) => findFirstMock(...args) } },
}));

const { attachAnnouncementBanner } = await import("../lib/announcementBanner.js");

function fakeReq(org) {
  return { org };
}

function fakeRes() {
  let contentType = "";
  const sent = [];
  return {
    sent,
    get: (name) => (name.toLowerCase() === "content-type" ? contentType : ""),
    setContentType(t) { contentType = t; },
    send(body) {
      sent.push(body);
      return this;
    },
  };
}

beforeEach(() => {
  findFirstMock.mockReset();
});

describe("attachAnnouncementBanner", () => {
  it("passes through when no org is resolved (apex requests)", async () => {
    const mw = attachAnnouncementBanner();
    const req = fakeReq(null);
    const res = fakeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("passes through when no pinned announcement is found", async () => {
    findFirstMock.mockResolvedValue(null);
    const mw = attachAnnouncementBanner();
    const req = fakeReq({ id: "o1" });
    const res = fakeRes();
    res.setContentType("text/html");
    await new Promise((resolve) => mw(req, res, resolve));
    res.send("<html><body><h1>ok</h1></body></html>");
    expect(res.sent[0]).not.toContain("site-banner");
  });

  it("injects the banner just after <body> on HTML responses", async () => {
    findFirstMock.mockResolvedValue({ id: "a1", title: "Court of Honor moved", body: "Now Tuesday at 7pm." });
    const mw = attachAnnouncementBanner();
    const req = fakeReq({ id: "o1" });
    const res = fakeRes();
    res.setContentType("text/html; charset=utf-8");
    await new Promise((resolve) => mw(req, res, resolve));
    res.send('<!doctype html><html><body class="page"><h1>Hello</h1></body></html>');
    const out = res.sent[0];
    expect(out).toContain("site-banner");
    expect(out).toContain("Court of Honor moved");
    expect(out.indexOf("site-banner")).toBeLessThan(out.indexOf("<h1>Hello"));
  });

  it("does not inject into non-HTML responses (JSON, ICS, sitemaps)", async () => {
    findFirstMock.mockResolvedValue({ id: "a1", title: "X", body: "Y" });
    const mw = attachAnnouncementBanner();
    const req = fakeReq({ id: "o1" });
    const res = fakeRes();
    res.setContentType("application/json");
    await new Promise((resolve) => mw(req, res, resolve));
    res.send(JSON.stringify({ ok: true }));
    expect(res.sent[0]).not.toContain("site-banner");
  });

  it("treats DB errors as banner-not-available (best-effort, never blocks the page)", async () => {
    findFirstMock.mockRejectedValue(new Error("DB down"));
    const mw = attachAnnouncementBanner();
    const req = fakeReq({ id: "o1" });
    const res = fakeRes();
    res.setContentType("text/html");
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    res.send("<html><body><h1>still ok</h1></body></html>");
    expect(res.sent[0]).not.toContain("site-banner");
  });

  it("escapes HTML in the announcement title (XSS through pinned post)", async () => {
    findFirstMock.mockResolvedValue({
      id: "a1",
      title: '<script>alert(1)</script>',
      body: "ok",
    });
    const mw = attachAnnouncementBanner();
    const req = fakeReq({ id: "o1" });
    const res = fakeRes();
    res.setContentType("text/html");
    await new Promise((resolve) => mw(req, res, resolve));
    res.send("<html><body></body></html>");
    expect(res.sent[0]).not.toContain("<script>alert(1)</script>");
    expect(res.sent[0]).toContain("&lt;script&gt;");
  });
});
