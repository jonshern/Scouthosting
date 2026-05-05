import { describe, expect, it } from "vitest";
import { trackEmail, trackSmsBody } from "./tracked-message";

const BASE = {
  baseUrl: "https://compass.app",
  mailLogId: "ml_1",
  recipient: "x@y.com",
};

describe("comms/tracked-message", () => {
  it("rewrites raw URLs in plain-text body", () => {
    const out = trackEmail({
      ...BASE,
      to: "x@y.com",
      text: "See https://news.example.com/a for details",
    });
    expect(out.text).toMatch(/https:\/\/compass\.app\/t\/c\//);
    expect(out.text).toContain("?to=https%3A%2F%2Fnews.example.com%2Fa");
  });

  it("skips unsubscribe / rsvp / /t/ URLs", () => {
    const out = trackEmail({
      ...BASE,
      to: "x@y.com",
      text:
        "Unsub: https://compass.app/unsubscribe/abc · RSVP: https://compass.app/rsvp/xyz · Other: https://news.example.com/",
    });
    expect(out.text).toContain("https://compass.app/unsubscribe/abc"); // untouched
    expect(out.text).toContain("https://compass.app/rsvp/xyz");
    expect(out.text).toMatch(/news\.example\.com.*via t\/c|t\/c\//); // tracked
  });

  it("rewrites href= in HTML and appends the open pixel", () => {
    const out = trackEmail({
      ...BASE,
      to: "x@y.com",
      html: '<a href="https://news.example.com/a">click</a>',
    });
    expect(out.html).toMatch(/href="https:\/\/compass\.app\/t\/c\//);
    expect(out.html).toMatch(/<img src="https:\/\/compass\.app\/t\/o\//);
  });

  it("trackSmsBody rewrites text URLs", () => {
    const body = trackSmsBody({
      ...BASE,
      body: "Pack meeting moved: https://compass.app/o/troop100/calendar",
    });
    expect(body).toMatch(/\/t\/c\//);
  });

  it("text-only email synthesises an HTML wrapper with linkified URLs", () => {
    const out = trackEmail({
      ...BASE,
      to: "x@y.com",
      text: "Visit https://news.example.com/a today",
    });
    expect(out.html).toContain("<a href=\"https://compass.app/t/c/");
    expect(out.html).toContain("<img src=\"https://compass.app/t/o/");
  });
});
