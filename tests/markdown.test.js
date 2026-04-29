import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../lib/markdown.js";

describe("renderMarkdown", () => {
  it("wraps plain paragraphs separated by blank lines", () => {
    expect(renderMarkdown("hi\n\nbye")).toBe("<p>hi</p><p>bye</p>");
  });

  it("treats single newlines inside a paragraph as <br>", () => {
    expect(renderMarkdown("a\nb")).toBe("<p>a<br>b</p>");
  });

  it("escapes raw HTML", () => {
    expect(renderMarkdown("<script>x</script>")).toContain("&lt;script&gt;");
  });

  it("renders headings up to ###", () => {
    expect(renderMarkdown("# H1")).toBe("<h1>H1</h1>");
    expect(renderMarkdown("## H2")).toBe("<h2>H2</h2>");
    expect(renderMarkdown("### H3")).toBe("<h3>H3</h3>");
  });

  it("bold and italic", () => {
    expect(renderMarkdown("**bold** and *em*")).toBe(
      "<p><strong>bold</strong> and <em>em</em></p>",
    );
  });

  it("safe links only — javascript: URLs strip", () => {
    const safe = renderMarkdown("[ok](https://example.com)");
    expect(safe).toContain('href="https://example.com"');
    const unsafe = renderMarkdown("[no](javascript:alert(1))");
    expect(unsafe).not.toContain("javascript:");
    expect(unsafe).toContain("no");
  });

  it("unordered list", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("ordered list", () => {
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("inline code does not get further markdown applied", () => {
    expect(renderMarkdown("`**not bold**`")).toBe(
      "<p><code>**not bold**</code></p>",
    );
  });

  it("code fence preserves contents and escapes html", () => {
    const out = renderMarkdown("```\n<x>\n```");
    expect(out).toBe("<pre><code>&lt;x&gt;</code></pre>");
  });

  it("blockquote", () => {
    expect(renderMarkdown("> hello")).toBe("<blockquote>hello</blockquote>");
  });

  it("link text containing inline-bold renders as bold", () => {
    expect(renderMarkdown("[**big**](https://x.test)")).toContain(
      "<strong>big</strong>",
    );
  });
});
