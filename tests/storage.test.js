import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scouthosting-storage-"));
  process.env.STORAGE_DRIVER = "fs";
  process.env.UPLOAD_ROOT = tmp;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function loadStorage() {
  // Re-import each test so UPLOAD_ROOT is picked up freshly.
  const moduleId = `../lib/storage.js?_t=${Date.now()}_${Math.random()}`;
  return await import(moduleId);
}

describe("storage fs driver", () => {
  it("save + readStream round-trip", async () => {
    const storage = await loadStorage();
    await storage.save("org123", "abc.png", Buffer.from([1, 2, 3, 4]));
    expect(await storage.exists("org123", "abc.png")).toBe(true);
    const buf = await new Promise((resolve, reject) => {
      const chunks = [];
      const s = storage.readStream("org123", "abc.png");
      s.on("data", (c) => chunks.push(c));
      s.on("end", () => resolve(Buffer.concat(chunks)));
      s.on("error", reject);
    });
    expect([...buf]).toEqual([1, 2, 3, 4]);
  });

  it("remove deletes the file and is safe to call twice", async () => {
    const storage = await loadStorage();
    await storage.save("org123", "x.bin", Buffer.from([5, 6]));
    await storage.remove("org123", "x.bin");
    expect(await storage.exists("org123", "x.bin")).toBe(false);
    await expect(storage.remove("org123", "x.bin")).resolves.toBeUndefined();
  });

  it("rejects path traversal attempts in orgId or filename", async () => {
    const storage = await loadStorage();
    await expect(storage.save("../etc", "passwd", Buffer.from([0]))).rejects.toThrow();
    await expect(storage.save("org123", "../escape.png", Buffer.from([0]))).rejects.toThrow();
  });

  it("moveFromTemp moves the temp file into place", async () => {
    const storage = await loadStorage();
    const tmpFile = path.join(os.tmpdir(), `scouthosting-test-${Date.now()}.bin`);
    fs.writeFileSync(tmpFile, Buffer.from("hello"));
    await storage.moveFromTemp("org123", "moved.bin", tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(false);
    expect(await storage.exists("org123", "moved.bin")).toBe(true);
  });
});
