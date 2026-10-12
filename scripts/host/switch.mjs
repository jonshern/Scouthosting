// The blue-green switch for the host Mac: a small reverse proxy on
// SWITCH_PORT (3000) that sends every request to the live slot's port.
// The live slot is the second word of the state file ("blue 3001");
// scripts/host/deploy.sh and rollback.sh rewrite that file and the
// switch follows within a second, without dropping connections in
// flight. Plain Node, no dependencies, so it never needs a rebuild.
//
//   SWITCH_STATE=/path/to/active node scripts/host/switch.mjs

import http from "node:http";
import net from "node:net";
import { readFileSync, statSync } from "node:fs";

const PORT = Number(process.env.SWITCH_PORT || 3000);
const BIND = process.env.SWITCH_BIND || "0.0.0.0";
const STATE = process.env.SWITCH_STATE;
if (!STATE) {
  console.error("SWITCH_STATE (path to the active-slot file) is required");
  process.exit(1);
}

let cached = { mtimeMs: -1, slot: null, port: null };

/** Parse "blue 3001" → { slot, port }; null when unusable. */
function parseState(text) {
  const [slot, port] = String(text).trim().split(/\s+/);
  const n = Number(port);
  if (!slot || !Number.isInteger(n) || n <= 0 || n > 65535) return null;
  return { slot, port: n };
}

function target() {
  try {
    const st = statSync(STATE);
    if (st.mtimeMs !== cached.mtimeMs) {
      const parsed = parseState(readFileSync(STATE, "utf8"));
      cached = { mtimeMs: st.mtimeMs, ...(parsed ?? { slot: null, port: null }) };
      if (parsed) log("info", "live slot", parsed);
    }
  } catch {
    // Keep the last good target if the file is briefly missing mid-write.
  }
  return cached.port ? cached : null;
}

function log(level, msg, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, ns: "switch", msg, ...fields }));
}

function forwardedHeaders(req) {
  const headers = { ...req.headers };
  const remote = req.socket.remoteAddress || "";
  headers["x-forwarded-for"] = headers["x-forwarded-for"] ? `${headers["x-forwarded-for"]}, ${remote}` : remote;
  headers["x-forwarded-host"] ??= headers.host ?? "";
  headers["x-forwarded-proto"] ??= "http";
  return headers;
}

const server = http.createServer((req, res) => {
  if (req.url === "/__switch") {
    const t = target();
    res.writeHead(t ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(t ? { slot: t.slot, port: t.port } : { error: "no_live_slot" }));
    return;
  }
  const t = target();
  if (!t) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("Compass is starting up. Try again in a minute.\n");
    return;
  }
  const upstream = http.request(
    { host: "127.0.0.1", port: t.port, method: req.method, path: req.url, headers: forwardedHeaders(req) },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.rawHeaders);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    log("error", "upstream failed", { slot: t.slot, port: t.port, err: err.message });
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("Compass isn't answering right now. Try again in a minute.\n");
    } else {
      res.destroy();
    }
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
});

// WebSocket and other Upgrade requests: splice the raw sockets.
server.on("upgrade", (req, socket, head) => {
  const t = target();
  if (!t) return socket.destroy();
  const up = net.connect(t.port, "127.0.0.1", () => {
    const headers = forwardedHeaders(req);
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(headers)) {
      for (const value of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${value}`);
    }
    up.write(lines.join("\r\n") + "\r\n\r\n");
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

// Long responses (server-sent events) must not be cut by Node's defaults.
server.requestTimeout = 0;
server.headersTimeout = 60_000;
server.keepAliveTimeout = 65_000;

server.listen(PORT, BIND, () => {
  const t = target();
  log("info", "switch listening", { port: PORT, live: t ? `${t.slot}:${t.port}` : "none yet" });
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
