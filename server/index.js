import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionTenant, validateProvisionInput } from "./provision.js";
import { renderSite } from "./render.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TENANTS_FILE = path.join(__dirname, "tenants.json");

/* ------------------------------------------------------------------ */
/* Tenant store                                                        */
/* ------------------------------------------------------------------ */

function loadTenants() {
  return JSON.parse(fs.readFileSync(TENANTS_FILE, "utf8"));
}

function saveTenants(data) {
  fs.writeFileSync(TENANTS_FILE, JSON.stringify(data, null, 2));
}

/* ------------------------------------------------------------------ */
/* Hostname → tenant resolution                                        */
/* ------------------------------------------------------------------ */

const APEX_DOMAINS = new Set([
  "scouthosting.com",
  "www.scouthosting.com",
  "scouthosting.local",
  "localhost",
]);

function tenantSlugFromHost(host) {
  if (!host) return null;
  const bare = host.split(":")[0].toLowerCase();
  if (APEX_DOMAINS.has(bare)) return null;

  // <slug>.scouthosting.com or <slug>.localhost
  const parts = bare.split(".");
  if (parts.length < 2) return null;
  const candidate = parts[0];
  if (!candidate || candidate === "www") return null;
  return candidate;
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Tenant resolver — runs on every request
app.use((req, res, next) => {
  const slug = tenantSlugFromHost(req.headers.host);
  if (!slug) {
    req.tenant = null;
    return next();
  }
  const data = loadTenants();
  const tenant = data.tenants[slug];
  if (!tenant) {
    return res.status(404).send(notFoundPage(slug));
  }
  req.tenant = tenant;
  next();
});

/* ------------------ Marketing site (apex / www) ------------------- */

app.use((req, res, next) => {
  if (req.tenant) return next();
  // Serve marketing/demo from repo root
  return express.static(ROOT, { extensions: ["html"] })(req, res, next);
});

/* ------------------ Tenant site (subdomain) ----------------------- */

app.get("*", (req, res, next) => {
  if (!req.tenant) return next();

  // Static assets (css, js, images) for the tenant site come from the demo dir
  const ext = path.extname(req.path);
  if (ext && ext !== ".html") {
    const file = path.join(ROOT, "demo", req.path);
    if (fs.existsSync(file)) return res.sendFile(file);
    return res.status(404).send("Not found");
  }

  // Render the templated site for this tenant
  const html = renderSite(req.tenant);
  res.set("Content-Type", "text/html; charset=utf-8").send(html);
});

/* ------------------ Provisioning API ------------------------------ */

app.post("/api/provision", (req, res) => {
  const errors = validateProvisionInput(req.body);
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }
  const data = loadTenants();
  try {
    const tenant = provisionTenant(req.body, data);
    saveTenants(data);
    const subdomain = `${tenant.slug}.scouthosting.com`;
    res.status(201).json({
      ok: true,
      tenant,
      url: `https://${subdomain}`,
      message: `Site provisioned for ${tenant.displayName}.`,
    });
  } catch (err) {
    res.status(409).json({ ok: false, errors: [err.message] });
  }
});

app.get("/api/tenants", (_req, res) => {
  const data = loadTenants();
  const list = Object.values(data.tenants).map((t) => ({
    slug: t.slug,
    displayName: t.displayName,
    plan: t.plan,
    isDemo: !!t.isDemo,
  }));
  res.json({ ok: true, tenants: list });
});

/* ------------------ 404 fallback ---------------------------------- */

function notFoundPage(slug) {
  return `<!doctype html><meta charset="utf-8"><title>Site not found</title>
<style>body{font-family:system-ui;max-width:560px;margin:6rem auto;padding:0 1.5rem;color:#15181c}
a{color:#1d6b39}</style>
<h1>No Scouthosting site at <code>${escapeHtml(slug)}</code></h1>
<p>This subdomain isn't registered. If this is your unit's site, it may not have
been provisioned yet — or it may have been moved or deleted.</p>
<p><a href="https://scouthosting.com/">← Back to scouthosting.com</a> ·
<a href="https://scouthosting.com/signup.html">Start a new site</a></p>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ------------------ Boot ------------------------------------------ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Scouthosting running on http://localhost:${PORT}`);
  console.log(`Marketing:  http://localhost:${PORT}/`);
  console.log(`Demo site:  http://troop100.localhost:${PORT}/`);
  console.log(`(Add 'troop100.localhost' to /etc/hosts pointing to 127.0.0.1)`);
});
