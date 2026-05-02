// Unit tests for the floating support widget (lib/supportWidget.js).

import { describe, it, expect } from "vitest";
import { supportWidget } from "../lib/supportWidget.js";

describe("supportWidget()", () => {
  it("renders a fixed bottom-right button + panel scoped under #cmp-support-root", () => {
    const html = supportWidget({ surface: "tenant" });
    expect(html).toContain('id="cmp-support-root"');
    expect(html).toContain('id="cmp-support-toggle"');
    expect(html).toContain('id="cmp-support-panel"');
    expect(html).toMatch(/position: fixed/);
    expect(html).toMatch(/right: 18px/);
    expect(html).toMatch(/bottom: 18px/);
  });

  it("posts to /help (the existing SupportTicket-creating endpoint)", () => {
    const html = supportWidget({ surface: "tenant" });
    expect(html).toMatch(/<form[^>]+action="\/help"/);
    expect(html).toMatch(/method="post"/);
  });

  it("includes hidden _surface and _path inputs so the operator sees context", () => {
    const html = supportWidget({ surface: "admin" });
    expect(html).toMatch(/<input[^>]+name="_surface"[^>]+value="admin"/);
    expect(html).toMatch(/<input[^>]+name="_path"/);
  });

  it("pre-fills the email/name when a logged-in user is passed in", () => {
    const html = supportWidget({
      surface: "admin",
      user: { email: "leader@troop12.test", displayName: "Jenna M." },
    });
    expect(html).toContain('value="leader@troop12.test"');
    expect(html).toContain('value="Jenna M."');
  });

  it("includes a CSRF token when supplied (so the form clears csrfProtect)", () => {
    const html = supportWidget({ surface: "admin", csrfToken: "abc123" });
    expect(html).toMatch(/<input[^>]+name="csrf"[^>]+value="abc123"/);
  });

  it("omits the CSRF input when no token is supplied (anonymous marketing)", () => {
    const html = supportWidget({ surface: "marketing" });
    expect(html).not.toMatch(/<input[^>]+name="csrf"/);
  });

  it("ships all six SupportTicket categories", () => {
    const html = supportWidget({ surface: "admin" });
    expect(html).toContain('value="question"');
    expect(html).toContain('value="bug"');
    expect(html).toContain('value="billing"');
    expect(html).toContain('value="feature"');
    expect(html).toContain('value="abuse"');
    expect(html).toContain('value="other"');
  });

  it("escapes user-supplied values so a poisoned displayName can't break out of the attribute", () => {
    const html = supportWidget({
      surface: "admin",
      user: { email: "x@y", displayName: '"><script>alert(1)</script>' },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;");
  });

  it("keeps subject/body within SupportTicket column limits", () => {
    const html = supportWidget({ surface: "admin" });
    expect(html).toMatch(/maxlength="200"/);   // subject
    expect(html).toMatch(/maxlength="5000"/);  // body
  });

  it("hides the panel by default (only opens on click)", () => {
    const html = supportWidget({ surface: "admin" });
    expect(html).toMatch(/<form[^>]+id="cmp-support-panel"[^>]+hidden/);
  });

  it("exits the panel on Escape (keyboard accessibility)", () => {
    const html = supportWidget({ surface: "admin" });
    expect(html).toMatch(/'Escape'/);
  });

  it("self-hides in print stylesheets (so it doesn't render in a PDF export)", () => {
    const html = supportWidget({ surface: "admin" });
    expect(html).toMatch(/@media print/);
  });
});
