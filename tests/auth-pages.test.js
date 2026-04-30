// Smoke tests for the live signup.html + login.html pages, rebuilt on the
// Compass design tokens in alignment step 2. Zero deps beyond Vitest;
// reads each static file via node:fs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const signup = readFileSync(resolve(root, "signup.html"), "utf8");
const login = readFileSync(resolve(root, "login.html"), "utf8");
const script = readFileSync(resolve(root, "script.js"), "utf8");

describe("signup.html", () => {
  it("loads the shared apex stylesheet + Newsreader/Inter Tight fonts", () => {
    expect(signup).toMatch(/<link[^>]+href=["']\/styles\.css["']/);
    expect(signup).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(signup).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
  });

  it("posts to the existing /api/provision endpoint via the signup-form id", () => {
    // The form itself doesn't carry an action — the JS handler in script.js
    // intercepts submit and fetches /api/provision.
    expect(signup).toMatch(/id="signup-form"/);
    expect(script).toMatch(/getElementById\(["']signup-form["']\)/);
    expect(script).toContain("/api/provision");
  });

  it("offers the Continue-with-Google button wired to /auth/google/start", () => {
    expect(signup).toMatch(/class="btn btn--google btn--full"[^>]*href="\/auth\/google\/start\?next=\/signup\.html"/);
  });

  it("includes the seven required provisioning fields", () => {
    for (const name of [
      "unitType",
      "unitNumber",
      "charterOrg",
      "city",
      "state",
      "scoutmasterName",
      "scoutmasterEmail",
    ]) {
      expect(signup).toMatch(new RegExp(`name="${name}"`));
    }
  });

  it("uses the new Compass design tokens (form-card, form-title, btn--ink)", () => {
    expect(signup).toMatch(/class="form-card"/);
    expect(signup).toMatch(/class="form-title"/);
    expect(signup).toMatch(/btn btn--ink btn--full/);
  });

  it("links back to the apex marketing page", () => {
    expect(signup).toMatch(/<a href="\/"[^>]+class="wordmark/);
  });

  it("declares a viewport meta tag for mobile responsiveness", () => {
    expect(signup).toMatch(/<meta\s+name="viewport"/);
  });

  it("has a single <h1> as the page title", () => {
    const h1Matches = signup.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1Matches.length).toBe(1);
  });
});

describe("login.html", () => {
  it("loads the shared apex stylesheet + Newsreader/Inter Tight fonts", () => {
    expect(login).toMatch(/<link[^>]+href=["']\/styles\.css["']/);
    expect(login).toMatch(/fonts\.googleapis\.com[^"']*Newsreader/);
    expect(login).toMatch(/fonts\.googleapis\.com[^"']*Inter\+Tight/);
  });

  it("offers the Continue-with-Google button wired to /auth/google/start", () => {
    expect(login).toMatch(/class="btn btn--google btn--full"[^>]*href="\/auth\/google\/start\?next=\/"/);
  });

  it("has a slug-redirect form that dispatches to <slug>.compass.app/login via JS", () => {
    expect(login).toMatch(/id="login-slug-form"/);
    expect(login).toMatch(/name="slug"/);
    expect(login).toMatch(/class="form-suffix__addon">\.compass\.app</);
    expect(script).toMatch(/getElementById\(["']login-slug-form["']\)/);
    expect(script).toContain("/login");
  });

  it("links to /signup.html as the no-account-yet path", () => {
    expect(login).toMatch(/href="\/signup\.html"/);
  });

  it("declares a viewport meta tag for mobile responsiveness", () => {
    expect(login).toMatch(/<meta\s+name="viewport"/);
  });

  it("has a single <h1> as the page title", () => {
    const h1Matches = login.match(/<h1[\s>][^]*?<\/h1>/g) || [];
    expect(h1Matches.length).toBe(1);
  });
});

describe("script.js", () => {
  it("hides Continue-with-Google buttons when the server has no provider configured", () => {
    expect(script).toContain("/api/auth/providers");
    expect(script).toMatch(/btn--google/);
  });

  it("sets the footer year on any page with <span id=\"yr\">", () => {
    expect(script).toMatch(/getElementById\(["']yr["']\)/);
    expect(script).toContain("getFullYear()");
  });
});
