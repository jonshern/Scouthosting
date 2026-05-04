// GrapesJS site editor — bootstraps the editor surface, registers our
// block library (static + live), serializes to/from Page.customBlocks
// JSON, and POSTs save with CSRF.
//
// Loaded by /admin/site (server/admin.js renders the shell HTML and
// inlines the initial block tree as window.__INITIAL_BLOCKS__).
//
// Requires: window.grapesjs (loaded via /vendor/grapesjs/grapes.min.js)

(function () {
  const initial = Array.isArray(window.__INITIAL_BLOCKS__) ? window.__INITIAL_BLOCKS__ : [];
  const csrfToken = window.__CSRF_TOKEN__ || "";
  const orgDisplayName = window.__ORG_NAME__ || "your unit";

  // ---------------------------------------------------------------
  // Block specs — must match types in lib/blocks/*.js + the static
  // text/image/cta from lib/homepageSections.js. The renderInEditor()
  // function returns the HTML the canvas shows for the block; the
  // serialize() function reads attributes off the GrapesJS component
  // and returns a row to push into the customBlocks JSON array.
  // ---------------------------------------------------------------
  const SPECS = {
    text: {
      label: "Text",
      category: "Static",
      defaults: { title: "", body: "" },
      renderInEditor(b) {
        return `
          <section class="ed-block ed-block--text" data-block-type="text" data-block-id="${esc(b.id)}">
            <h2 contenteditable="true" data-attr="title">${esc(b.title || "Section heading")}</h2>
            <div contenteditable="true" data-attr="body">${esc(b.body || "Click to edit. Markdown supported on save.")}</div>
          </section>`;
      },
    },
    image: {
      label: "Image",
      category: "Static",
      defaults: { filename: "", caption: "", alt: "" },
      renderInEditor(b) {
        const src = b.filename ? `/uploads/${esc(b.filename)}` : placeholderSvg("Image · click to set filename");
        return `
          <section class="ed-block ed-block--image" data-block-type="image" data-block-id="${esc(b.id)}">
            <figure>
              <img src="${src}" alt="${esc(b.alt || "")}">
              ${b.caption ? `<figcaption contenteditable="true" data-attr="caption">${esc(b.caption)}</figcaption>` : `<figcaption contenteditable="true" data-attr="caption" data-empty="1">Add a caption…</figcaption>`}
            </figure>
          </section>`;
      },
    },
    cta: {
      label: "Call to action",
      category: "Static",
      defaults: { title: "", body: "", buttonLabel: "", buttonLink: "" },
      renderInEditor(b) {
        return `
          <section class="ed-block ed-block--cta" data-block-type="cta" data-block-id="${esc(b.id)}">
            <div class="ed-cta">
              <h2 contenteditable="true" data-attr="title">${esc(b.title || "Ready to join?")}</h2>
              <p contenteditable="true" data-attr="body">${esc(b.body || "Tell visitors what to do next.")}</p>
              <a class="ed-btn" data-attr="buttonLink" href="${esc(b.buttonLink || "#")}"><span contenteditable="true" data-attr="buttonLabel">${esc(b.buttonLabel || "Visit us")}</span></a>
            </div>
          </section>`;
      },
    },
    events: {
      label: "Upcoming events",
      category: "Live",
      defaults: { config: { limit: 5, layout: "list" } },
      renderInEditor(b) {
        const cfg = b.config || {};
        return `
          <section class="ed-block ed-block--live ed-block--events" data-block-type="events" data-block-id="${esc(b.id)}" data-config='${escAttr(JSON.stringify(cfg))}'>
            <div class="ed-live-header">
              <span class="ed-live-tag">Live</span>
              <h2>Upcoming events</h2>
              <span class="ed-live-meta">${esc(String(cfg.limit || 5))} most recent · ${esc(cfg.layout || "list")}</span>
            </div>
            <ul class="ed-live-sample">
              <li>Spring Camporee — May 15</li>
              <li>Court of Honor — May 28</li>
              <li>Service project — Jun 7</li>
            </ul>
            <p class="ed-live-note">Auto-updates from your calendar.</p>
          </section>`;
      },
    },
    photos: {
      label: "Photo feed",
      category: "Live",
      defaults: { config: { mode: "latest", limit: 8, layout: "grid", albumSlug: "" } },
      renderInEditor(b) {
        const cfg = b.config || {};
        return `
          <section class="ed-block ed-block--live ed-block--photos" data-block-type="photos" data-block-id="${esc(b.id)}" data-config='${escAttr(JSON.stringify(cfg))}'>
            <div class="ed-live-header">
              <span class="ed-live-tag">Live</span>
              <h2>Photo gallery</h2>
              <span class="ed-live-meta">${esc(String(cfg.limit || 8))} photos · ${esc(cfg.mode || "latest")} · ${esc(cfg.layout || "grid")}</span>
            </div>
            <div class="ed-photo-grid">
              ${[1,2,3,4,5,6].map(() => `<div class="ed-photo-tile"></div>`).join("")}
            </div>
            <p class="ed-live-note">Auto-updates from your album photos.</p>
          </section>`;
      },
    },
    posts: {
      label: "Latest posts",
      category: "Live",
      defaults: { config: { limit: 4, layout: "excerpt" } },
      renderInEditor(b) {
        const cfg = b.config || {};
        return `
          <section class="ed-block ed-block--live ed-block--posts" data-block-type="posts" data-block-id="${esc(b.id)}" data-config='${escAttr(JSON.stringify(cfg))}'>
            <div class="ed-live-header">
              <span class="ed-live-tag">Live</span>
              <h2>Latest from the troop</h2>
              <span class="ed-live-meta">${esc(String(cfg.limit || 4))} posts · ${esc(cfg.layout || "excerpt")}</span>
            </div>
            <p class="ed-live-note">Auto-updates as you publish posts in /admin/posts.</p>
          </section>`;
      },
    },
    contact: {
      label: "Contact card",
      category: "Live",
      defaults: { config: { layout: "card", showMap: true } },
      renderInEditor(b) {
        const cfg = b.config || {};
        return `
          <section class="ed-block ed-block--live ed-block--contact" data-block-type="contact" data-block-id="${esc(b.id)}" data-config='${escAttr(JSON.stringify(cfg))}'>
            <div class="ed-live-header">
              <span class="ed-live-tag">Live</span>
              <h2>Get in touch</h2>
              <span class="ed-live-meta">Auto-fills from settings · ${esc(cfg.layout || "card")}</span>
            </div>
            <p class="ed-live-note">Pulls meeting day/time, location, scoutmaster contact from your unit settings.</p>
          </section>`;
      },
    },
  };

  // ---------------------------------------------------------------
  // Initialize GrapesJS
  // ---------------------------------------------------------------
  const editor = grapesjs.init({
    container: "#gjs",
    height: "calc(100vh - 60px)",
    width: "auto",
    storageManager: false, // we handle persistence ourselves via Save button
    canvas: {
      styles: ["/tokens.css", "/styles.css"],
    },
    panels: { defaults: [] }, // we render our own toolbar in the shell
    deviceManager: {
      devices: [
        { name: "Desktop", width: "" },
        { name: "Tablet", width: "768px" },
        { name: "Mobile", width: "375px" },
      ],
    },
    blockManager: {
      appendTo: "#gjs-blocks",
      blocks: Object.entries(SPECS).map(([type, spec]) => ({
        id: `compass-${type}`,
        label: spec.label,
        category: spec.category,
        // When dragged from the palette into the canvas, generate a
        // fresh row with default config + a unique id, then render.
        content: () => {
          const fresh = { id: newId(type), type, ...deepClone(spec.defaults) };
          return spec.renderInEditor(fresh);
        },
      })),
    },
    // Editor styles for the placeholders + GrapesJS overrides.
    canvasCss: editorCanvasCss(),
  });

  // Inject our editor.css into the canvas after init (canvasCss option
  // isn't always honored across versions).
  editor.on("load", () => {
    try {
      const doc = editor.Canvas.getDocument();
      const style = doc.createElement("style");
      style.textContent = editorCanvasCss();
      doc.head.appendChild(style);
    } catch (e) { /* ignore */ }
  });

  // Hydrate canvas with the initial blocks.
  if (initial.length) {
    const html = initial
      .map((b) => SPECS[b.type]?.renderInEditor(b) || "")
      .filter(Boolean)
      .join("\n");
    editor.setComponents(html);
  } else {
    // Empty state — give them something to start from.
    editor.setComponents(`
      <section class="ed-empty">
        <h2>Drag a block from the left to start.</h2>
        <p>Or apply a <a href="/admin/site/template">starter template</a> if you want a populated layout to edit.</p>
      </section>`);
  }

  // ---------------------------------------------------------------
  // Save round-trip
  // ---------------------------------------------------------------
  document.getElementById("ed-save").addEventListener("click", async (ev) => {
    ev.preventDefault();
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const blocks = serializeCanvas();
      const r = await fetch("/admin/site", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ blocks }),
      });
      if (!r.ok) throw new Error(`save failed: HTTP ${r.status}`);
      btn.textContent = "Saved ✓";
      setTimeout(() => {
        btn.textContent = "Save";
        btn.disabled = false;
      }, 1500);
    } catch (err) {
      console.error(err);
      btn.textContent = "Save failed";
      btn.disabled = false;
      alert("Couldn't save: " + (err.message || err));
    }
  });

  // Walk the canvas DOM, pull every [data-block-type] section in order,
  // and reconstruct the customBlocks JSON. Supports edits via
  // contenteditable (text/title/body) and config-as-JSON in attribute
  // (live blocks).
  function serializeCanvas() {
    const doc = editor.Canvas.getDocument();
    const sections = doc.querySelectorAll("[data-block-type]");
    const blocks = [];
    sections.forEach((el) => {
      const type = el.getAttribute("data-block-type");
      const id = el.getAttribute("data-block-id") || newId(type);
      const block = { id, type };

      // Static-block attribute mirroring: every [data-attr] descendant
      // contributes its current text content to the matching field.
      el.querySelectorAll("[data-attr]").forEach((node) => {
        const attr = node.getAttribute("data-attr");
        if (!attr || node.getAttribute("data-empty") === "1") return;
        if (attr === "buttonLink") {
          block[attr] = node.getAttribute("href") || "";
        } else {
          block[attr] = (node.innerText || node.textContent || "").trim();
        }
      });

      // Live-block config (JSON in [data-config]).
      const cfg = el.getAttribute("data-config");
      if (cfg) {
        try { block.config = JSON.parse(cfg); } catch (e) { /* keep block, drop bad config */ }
      }

      blocks.push(block);
    });
    return blocks;
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function escAttr(s) { return esc(s); }
  function newId(type) {
    return `cb_${type.slice(0,3)}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o || {})); }
  function placeholderSvg(label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><rect fill="#e5e7eb" width="600" height="300"/><text x="300" y="155" font-family="sans-serif" font-size="22" fill="#6b7280" text-anchor="middle">${label}</text></svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function editorCanvasCss() {
    return `
      body { padding: 0; margin: 0; background: #fafafa; font-family: 'Inter Tight', system-ui, sans-serif; }
      .ed-empty { padding: 4rem 2rem; text-align: center; color: #6b7280; }
      .ed-empty h2 { font-family: 'Newsreader', Georgia, serif; font-size: 1.6rem; margin: 0 0 .5rem; color: #374151; font-weight: 500; }
      .ed-block { padding: 2.5rem 1.5rem; border-bottom: 1px dashed transparent; }
      .ed-block:hover { border-color: #d1d5db; }
      .ed-block h2 { font-family: 'Newsreader', Georgia, serif; font-size: 1.8rem; margin: 0 0 .8rem; color: #111; }
      .ed-block--text > div { line-height: 1.65; color: #374151; max-width: 640px; }
      .ed-block--image figure { margin: 0; max-width: 980px; }
      .ed-block--image img { width: 100%; height: auto; border-radius: 12px; display: block; }
      .ed-block--image figcaption { margin-top: .5rem; color: #6b7280; font-size: .9rem; text-align: center; }
      .ed-block--cta { display: flex; justify-content: center; }
      .ed-cta { background: #1d6b39; color: #fff; padding: 2rem 2.25rem; border-radius: 14px; max-width: 600px; text-align: center; }
      .ed-cta h2 { color: #fff; }
      .ed-cta p { color: rgba(255,255,255,.85); }
      .ed-btn { display: inline-block; background: #caa54a; color: #111; padding: .65rem 1.4rem; border-radius: 8px; font-weight: 600; text-decoration: none; }
      .ed-block--live { background: linear-gradient(180deg, #f9fafb 0%, #fff 100%); border: 1px solid #e5e7eb; border-radius: 12px; max-width: 900px; margin: 1.5rem auto; padding: 1.5rem 1.75rem; }
      .ed-live-header { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; margin-bottom: .8rem; }
      .ed-live-header h2 { margin: 0; font-size: 1.4rem; }
      .ed-live-tag { background: #1d6b39; color: #fff; font-size: .65rem; font-weight: 700; padding: .15rem .45rem; border-radius: 999px; letter-spacing: .04em; text-transform: uppercase; }
      .ed-live-meta { color: #6b7280; font-size: .8rem; }
      .ed-live-sample { color: #6b7280; padding-left: 1.25rem; }
      .ed-live-note { color: #9ca3af; font-size: .85rem; font-style: italic; margin: .8rem 0 0; }
      .ed-photo-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: .35rem; margin-top: .5rem; }
      .ed-photo-tile { aspect-ratio: 1 / 1; background: #e5e7eb; border-radius: 4px; }
      [contenteditable="true"] { outline: none; }
      [contenteditable="true"]:focus { box-shadow: 0 0 0 2px rgba(29,107,57,.25); border-radius: 4px; }
      [data-empty="1"] { opacity: .5; }
    `;
  }
})();
