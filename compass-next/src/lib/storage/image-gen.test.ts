import { describe, expect, it } from "vitest";
import { gradientPng } from "./image-gen";

describe("storage/image-gen", () => {
  it("produces a valid PNG signature", () => {
    const png = gradientPng(8, 8, [255, 0, 0], [0, 0, 255]);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
    expect(png.length).toBeGreaterThan(20);
  });

  it("includes IHDR + IDAT + IEND chunks", () => {
    const png = gradientPng(4, 4, [10, 20, 30], [40, 50, 60]);
    const s = png.toString("binary");
    expect(s).toContain("IHDR");
    expect(s).toContain("IDAT");
    expect(s).toContain("IEND");
  });
});
