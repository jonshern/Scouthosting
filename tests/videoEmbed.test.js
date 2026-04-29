import { describe, it, expect } from "vitest";
import { parseVideoUrl } from "../lib/videoEmbed.js";

describe("parseVideoUrl", () => {
  it("YouTube watch URL", () => {
    const v = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(v).toMatchObject({
      kind: "youtube",
      id: "dQw4w9WgXcQ",
    });
    expect(v.embedUrl).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("YouTube short link", () => {
    const v = parseVideoUrl("https://youtu.be/abc123XYZ-_");
    expect(v.kind).toBe("youtube");
    expect(v.id).toBe("abc123XYZ-_");
  });

  it("YouTube embed and shorts paths", () => {
    expect(parseVideoUrl("https://www.youtube.com/embed/abcDEF")?.id).toBe("abcDEF");
    expect(parseVideoUrl("https://www.youtube.com/shorts/abcDEF")?.id).toBe("abcDEF");
  });

  it("Vimeo URL", () => {
    const v = parseVideoUrl("https://vimeo.com/76979871");
    expect(v).toMatchObject({
      kind: "vimeo",
      id: "76979871",
    });
    expect(v.embedUrl).toContain("player.vimeo.com/video/76979871");
  });

  it("falls through to external for unsupported hosts", () => {
    const v = parseVideoUrl("https://example.com/video.mp4");
    expect(v.kind).toBe("external");
  });

  it("rejects unparseable + non-http URLs", () => {
    expect(parseVideoUrl("not a url")).toBeNull();
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVideoUrl("")).toBeNull();
    expect(parseVideoUrl(null)).toBeNull();
  });
});
