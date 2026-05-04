// Site editor — bootstraps the editor surface, registers our block
// library (static + live), serializes to/from Page.customBlocks JSON,
// and POSTs save with CSRF.
//
// Design choices:
// - GrapesJS provides the canvas (iframe with our real CSS), selection,
//   drag-to-reorder. We bypass its BlockManager UI because mounting
//   to a custom appendTo doesn't render reliably with default panels
//   disabled. Instead we render the blocks rail ourselves with
//   click-to-add and drag-from-rail handlers.
// - Each block stores its data shape (title, body, config, etc.) on
//   the rendered DOM via data-attr / data-config attributes; the
//   canvas IS the source of truth between page loads.
// - Save: walk the canvas DOM, reconstruct the customBlocks JSON, POST.

(function () {
  const initial = Array.isArray(window.__INITIAL_BLOCKS__) ? window.__INITIAL_BLOCKS__ : [];
  const csrfToken = window.__CSRF_TOKEN__ || "";
  // Editor is reused by /admin/site and /admin/pages/:id/edit; the
  // server inlines the right URLs as window globals so the same code
  // works for both. Default to the homepage URLs for backwards compat.
  const saveUrl = window.__SAVE_URL__ || "/admin/site";
  const settingsUrl = window.__SETTINGS_URL__ || "";

  // ---------------------------------------------------------------
  // Block specs — must match types in lib/blocks/*.js + the static
  // text/image/cta from lib/homepageSections.js.
  // ---------------------------------------------------------------
  const SPECS = {
    text: {
      label: "Text",
      hint: "Heading + paragraph",
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
      hint: "Photo + caption",
      category: "Static",
      defaults: { filename: "", caption: "", alt: "" },
      renderInEditor(b) {
        const src = b.filename ? `/uploads/${esc(b.filename)}` : placeholderSvg("Image · paste filename below");
        return `
          <section class="ed-block ed-block--image" data-block-type="image" data-block-id="${esc(b.id)}">
            <figure>
              <img src="${src}" alt="${esc(b.alt || "")}">
              <figcaption contenteditable="true" data-attr="caption">${esc(b.caption || "Add a caption…")}</figcaption>
              <p class="ed-block__hint">Filename: <input type="text" data-attr="filename" value="${esc(b.filename || "")}" placeholder="e.g. spring-camporee.jpg" style="width:60%"></p>
            </figure>
          </section>`;
      },
    },
    cta: {
      label: "Call to action",
      hint: "Banner with button",
      category: "Static",
      defaults: { title: "", body: "", buttonLabel: "", buttonLink: "" },
      renderInEditor(b) {
        return `
          <section class="ed-block ed-block--cta" data-block-type="cta" data-block-id="${esc(b.id)}">
            <div class="ed-cta">
              <h2 contenteditable="true" data-attr="title">${esc(b.title || "Ready to join?")}</h2>
              <p contenteditable="true" data-attr="body">${esc(b.body || "Tell visitors what to do next.")}</p>
              <a class="ed-btn"><span contenteditable="true" data-attr="buttonLabel">${esc(b.buttonLabel || "Visit us")}</span></a>
              <p class="ed-block__hint">Button link: <input type="text" data-attr="buttonLink" value="${esc(b.buttonLink || "")}" placeholder="/join or https://…" style="width:60%"></p>
            </div>
          </section>`;
      },
    },
    events: {
      label: "Upcoming events",
      hint: "Live calendar feed",
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
      hint: "Live album grid",
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
      hint: "Live activity feed",
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
            <p class="ed-live-note">Auto-updates as you publish posts.</p>
          </section>`;
      },
    },
    contact: {
      label: "Contact card",
      hint: "Meeting + email info",
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
            <p class="ed-live-note">Pulls meeting day/time, location, contact from your unit settings.</p>
          </section>`;
      },
    },
  };

  // ---------------------------------------------------------------
  // Render the blocks rail (left side of the editor)
  // ---------------------------------------------------------------
  const railEl = document.getElementById("gjs-blocks");
  if (railEl) {
    const cats = {};
    for (const [type, spec] of Object.entries(SPECS)) {
      (cats[spec.category] ||= []).push([type, spec]);
    }
    railEl.innerHTML = Object.entries(cats)
      .map(([cat, items]) => `
        <div class="ed-rail-category">${esc(cat)}</div>
        <div class="ed-rail-blocks">
          ${items.map(([type, spec]) => `
            <button class="ed-rail-block" type="button" data-add-type="${esc(type)}" title="${esc(spec.hint)}">
              <span class="ed-rail-block__label">${esc(spec.label)}</span>
              <span class="ed-rail-block__hint">${esc(spec.hint)}</span>
            </button>
          `).join("")}
        </div>
      `).join("");
    railEl.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-add-type]");
      if (!btn) return;
      const type = btn.getAttribute("data-add-type");
      const spec = SPECS[type];
      if (!spec) return;
      addBlock(type, spec);
    });
  }

  // ---------------------------------------------------------------
  // Initialize GrapesJS
  // ---------------------------------------------------------------
  const editor = grapesjs.init({
    container: "#gjs",
    height: "100%",
    width: "auto",
    storageManager: false,
    canvas: {
      styles: ["/tokens.css", "/styles.css"],
    },
    panels: { defaults: [] },
    blockManager: { blocks: [] }, // we render our own rail
    deviceManager: {
      devices: [{ name: "Desktop", width: "" }],
    },
  });

  // Inject editor-canvas styles into the iframe once it loads.
  editor.on("load", () => {
    try {
      const doc = editor.Canvas.getDocument();
      const style = doc.createElement("style");
      style.textContent = editorCanvasCss();
      doc.head.appendChild(style);
    } catch (e) { /* ignore */ }
  });

  // Hydrate canvas with the initial blocks (or an empty-state pointer).
  if (initial.length) {
    const html = initial
      .map((b) => SPECS[b.type]?.renderInEditor(b) || "")
      .filter(Boolean)
      .join("\n");
    editor.setComponents(html);
  } else {
    editor.setComponents(`
      <section class="ed-empty">
        <h1>Your homepage is empty.</h1>
        <p>Pick a block on the left to add it here. You can drag blocks up and down to reorder.</p>
        <p>Want a head-start? <a href="/admin/site/template">Apply a starter template →</a></p>
      </section>
    `);
  }

  // ---------------------------------------------------------------
  // Add a block to the end of the canvas
  // ---------------------------------------------------------------
  function addBlock(type, spec) {
    // Strip the "ed-empty" placeholder if it's the only thing in the
    // canvas. Once a real block lands, the empty hint goes away.
    const doc = editor.Canvas.getDocument();
    const empty = doc?.querySelector(".ed-empty");
    if (empty) empty.parentNode.removeChild(empty);

    const fresh = { id: newId(type), type, ...deepClone(spec.defaults) };
    const html = spec.renderInEditor(fresh);
    editor.addComponents(html);
  }

  // ---------------------------------------------------------------
  // Save round-trip
  // ---------------------------------------------------------------
  const saveBtn = document.getElementById("ed-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      try {
        const blocks = serializeCanvas();
        const r = await fetch(saveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ blocks }),
          credentials: "same-origin",
        });
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}${text ? ": " + text.slice(0, 200) : ""}`);
        }
        saveBtn.textContent = "Saved ✓";
        setTimeout(() => {
          saveBtn.textContent = "Save";
          saveBtn.disabled = false;
        }, 1500);
      } catch (err) {
        saveBtn.textContent = "Save failed";
        saveBtn.disabled = false;
        alert("Couldn't save: " + (err.message || err));
      }
    });
  }

  // Walk the canvas DOM, pull every [data-block-type] section in order,
  // and reconstruct the customBlocks JSON.
  function serializeCanvas() {
    const doc = editor.Canvas.getDocument();
    if (!doc) return [];
    const sections = doc.querySelectorAll("[data-block-type]");
    const blocks = [];
    sections.forEach((el) => {
      const type = el.getAttribute("data-block-type");
      const id = el.getAttribute("data-block-id") || newId(type);
      const block = { id, type };

      // Static-block attribute mirroring: every [data-attr] descendant
      // contributes its current value. <input> goes to .value;
      // contenteditable nodes use .innerText.
      el.querySelectorAll("[data-attr]").forEach((node) => {
        const attr = node.getAttribute("data-attr");
        if (!attr) return;
        if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
          block[attr] = (node.value || "").trim();
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
  // Site settings form (right rail) — POSTs JSON to /admin/site/settings.
  // ---------------------------------------------------------------
  const settingsForm = document.getElementById("ed-settings-form");
  const settingsStatus = document.getElementById("ed-settings-status");
  if (settingsForm && settingsUrl) {
    settingsForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const submit = document.getElementById("ed-settings-submit");
      if (submit) submit.disabled = true;
      if (settingsStatus) settingsStatus.textContent = "Saving…";
      try {
        const fd = new FormData(settingsForm);
        const body = {};
        // Collapse repeated/checkbox values: checkbox sends value="1"
        // when checked, nothing when unchecked. The server normalises.
        fd.forEach((v, k) => { body[k] = v; });
        const r = await fetch(settingsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(body),
          credentials: "same-origin",
        });
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}${text ? ": " + text.slice(0, 160) : ""}`);
        }
        if (settingsStatus) {
          settingsStatus.textContent = "Saved ✓";
          setTimeout(() => { settingsStatus.textContent = ""; }, 1500);
        }
      } catch (err) {
        if (settingsStatus) settingsStatus.textContent = "Save failed";
        alert("Couldn't save settings: " + (err.message || err));
      } finally {
        if (submit) submit.disabled = false;
      }
    });
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
      body { padding: 0; margin: 0; background: #fafafa; font-family: 'Inter Tight', system-ui, sans-serif; color: #111; }
      .ed-empty { padding: 5rem 2rem; text-align: center; color: #6b7280; max-width: 560px; margin: 4rem auto; }
      .ed-empty h1 { font-family: 'Newsreader', Georgia, serif; font-size: 2rem; font-weight: 500; margin: 0 0 .75rem; color: #111; }
      .ed-empty p { line-height: 1.55; margin: .5rem 0; }
      .ed-empty a { color: #1d6b39; font-weight: 500; }
      .ed-block { padding: 2.5rem 1.5rem; border-bottom: 1px dashed transparent; max-width: 980px; margin: 0 auto; position: relative; }
      .ed-block:hover { border-color: #d1d5db; }
      .ed-block.gjs-selected { outline: 2px solid #1d6b39; outline-offset: 4px; border-radius: 4px; }
      .ed-block h2 { font-family: 'Newsreader', Georgia, serif; font-size: 1.8rem; margin: 0 0 .8rem; color: #111; }
      .ed-block--text > div { line-height: 1.65; color: #374151; max-width: 640px; }
      .ed-block--image figure { margin: 0; }
      .ed-block--image img { width: 100%; height: auto; max-height: 480px; object-fit: cover; border-radius: 12px; display: block; }
      .ed-block--image figcaption { margin-top: .5rem; color: #6b7280; font-size: .9rem; text-align: center; }
      .ed-block__hint { margin-top: .65rem; color: #9ca3af; font-size: .82rem; font-style: italic; }
      .ed-block__hint input { font-family: ui-monospace, Menlo, Consolas, monospace; padding: .2rem .4rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem; }
      .ed-block--cta { display: flex; justify-content: center; }
      .ed-cta { background: #1d6b39; color: #fff; padding: 2rem 2.25rem; border-radius: 14px; max-width: 600px; text-align: center; }
      .ed-cta h2 { color: #fff; }
      .ed-cta p { color: rgba(255,255,255,.85); }
      .ed-btn { display: inline-block; background: #caa54a; color: #111; padding: .65rem 1.4rem; border-radius: 8px; font-weight: 600; text-decoration: none; }
      .ed-block--live { background: linear-gradient(180deg, #f9fafb 0%, #fff 100%); border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.5rem 1.75rem; }
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
    `;
  }
})();
