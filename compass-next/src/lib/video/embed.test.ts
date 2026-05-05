import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "./embed";

describe("video/embed", () => {
  it("parses youtu.be short links", () => {
    const v = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(v?.kind).toBe("youtube");
    if (v?.kind === "youtube") {
      expect(v.id).toBe("dQw4w9WgXcQ");
      expect(v.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  });

  it("parses youtube.com/watch?v=...", () => {
    const v = parseVideoUrl("https://www.youtube.com/watch?v=abc123XYZ_-");
    expect(v?.kind).toBe("youtube");
  });

  it("parses youtube.com/shorts/...", () => {
    const v = parseVideoUrl("https://www.youtube.com/shorts/myShortId");
    expect(v?.kind).toBe("youtube");
  });

  it("parses vimeo.com/<id>", () => {
    const v = parseVideoUrl("https://vimeo.com/12345678");
    expect(v?.kind).toBe("vimeo");
    if (v?.kind === "vimeo") {
      expect(v.id).toBe("12345678");
    }
  });

  it("falls through to external for unknown hosts", () => {
    const v = parseVideoUrl("https://example.com/video.mp4");
    expect(v?.kind).toBe("external");
  });

  it("returns null for malformed input", () => {
    expect(parseVideoUrl("not-a-url")).toBeNull();
    expect(parseVideoUrl("")).toBeNull();
    expect(parseVideoUrl(null)).toBeNull();
  });

  it("rejects javascript: protocol", () => {
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects ids that don't match the pattern", () => {
    // youtu.be/<id> with disallowed character — falls through to external
    const v = parseVideoUrl("https://youtu.be/has space");
    expect(v?.kind).toBe("external");
  });
});
