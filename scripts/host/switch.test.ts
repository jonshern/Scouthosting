// Drives switch.mjs as a real process: routes to the live slot, follows
// the state file when it flips, and fails soft when a slot is down.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

function upstream(name: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ name, url: req.url, host: req.headers.host, xff: req.headers["x-forwarded-for"] }));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
const portOf = (s: http.Server) => (s.address() as AddressInfo).port;

// http.request, not fetch: fetch won't send a custom Host header.
function get(port: number, p = "/", host = "troop100.localhost"): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, headers: { host } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 50; i++) {
    try {
      const v = await fn();
      if (ok(v)) return v;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out");
}

describe("blue-green switch", () => {
  let blue: http.Server;
  let green: http.Server;
  let proc: ChildProcess;
  let state: string;
  const switchPort = 30000 + Math.floor(Math.random() * 5000);

  const setLive = (slot: string, port: number) => {
    writeFileSync(`${state}.tmp`, `${slot} ${port}\n`);
    renameSync(`${state}.tmp`, state);
  };

  beforeAll(async () => {
    blue = await upstream("blue");
    green = await upstream("green");
    state = path.join(mkdtempSync(path.join(tmpdir(), "switch-")), "active");
    proc = spawn(process.execPath, [path.join(__dirname, "switch.mjs")], {
      env: { ...process.env, SWITCH_PORT: String(switchPort), SWITCH_BIND: "127.0.0.1", SWITCH_STATE: state },
      stdio: "ignore",
    });
  });

  afterAll(() => {
    proc?.kill();
    blue?.close();
    green?.close();
  });

  it("answers 503 until a slot is live", async () => {
    const r = await until(() => get(switchPort), (r) => r.status === 503);
    expect(r.text).toMatch(/starting up/);
  });

  it("proxies to the live slot, keeping the Host header and adding X-Forwarded-For", async () => {
    setLive("blue", portOf(blue));
    const r = await until(() => get(switchPort, "/o/x?y=1"), (r) => r.status === 200);
    expect(JSON.parse(r.text)).toEqual({ name: "blue", url: "/o/x?y=1", host: "troop100.localhost", xff: "127.0.0.1" });
  });

  it("follows a flip", async () => {
    setLive("green", portOf(green));
    const r = await until(() => get(switchPort), (r) => r.text.includes("green"));
    expect(JSON.parse(r.text).name).toBe("green");
    const s = await get(switchPort, "/__switch");
    expect(JSON.parse(s.text)).toEqual({ slot: "green", port: portOf(green) });
  });

  it("returns 502 when the live slot is down", async () => {
    await new Promise((r) => green.close(r));
    const r = await get(switchPort);
    expect(r.status).toBe(502);
  });
});
