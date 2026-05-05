import { describe, expect, it } from "vitest";
import { renderMarkdownLite } from "./markdown";

describe("renderMarkdownLite", () => {
  it("escapes HTML special characters", () => {
    const html = renderMarkdownLite('A <script>alert("x")</script> & friends');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("splits paragraphs on blank lines", () => {
    const html = renderMarkdownLite("First line\n\nSecond para");
    expect(html).toBe("<p>First line</p>\n<p>Second para</p>");
  });

  it("preserves single newlines as <br/>", () => {
    const html = renderMarkdownLite("Line 1\nLine 2");
    expect(html).toBe("<p>Line 1<br/>Line 2</p>");
  });

  it("autolinks bare URLs", () => {
    const html = renderMarkdownLite("Visit https://example.com today");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("escapes raw HTML even when user wraps a URL in angle brackets", () => {
    const html = renderMarkdownLite("<https://example.com>");
    // Both wrapping brackets are HTML-escaped, so the user can't sneak
    // a raw <a> tag in. URL autolinking still happens on the escaped
    // text, which is harmless — no script execution, no formatting break.
    expect(html).toContain("&lt;");
    expect(html).not.toMatch(/<script\b/i);
  });

  it("returns empty string for empty input", () => {
    expect(renderMarkdownLite("")).toBe("");
    expect(renderMarkdownLite("   \n   ")).toBe("");
  });
});
