"use client";

import { useState } from "react";
import {
  saveDraftBlocks,
  publishBlocks,
  revertDraftBlocks,
} from "@/server-actions/site-canvas";

type TextBlock = { id: string; type: "text"; title: string; body: string };
type ImageBlock = {
  id: string;
  type: "image";
  filename: string;
  caption: string;
  alt: string;
};
type CtaBlock = {
  id: string;
  type: "cta";
  title: string;
  body: string;
  buttonLabel: string;
  buttonLink: string;
};

type Block = TextBlock | ImageBlock | CtaBlock;

type Props = {
  orgSlug: string;
  blocks: Block[];
  csrf: React.ReactNode;
};

function newBlock(type: "text" | "image" | "cta"): Block {
  const id = `b_${Math.random().toString(36).slice(2, 10)}`;
  if (type === "text") return { id, type: "text", title: "", body: "" };
  if (type === "image")
    return { id, type: "image", filename: "", caption: "", alt: "" };
  return {
    id,
    type: "cta",
    title: "",
    body: "",
    buttonLabel: "",
    buttonLink: "",
  };
}

export function CanvasEditor({ orgSlug, blocks: initial, csrf }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initial ?? []);
  const [pending, setPending] = useState(false);

  function update<T extends Block>(id: string, patch: Partial<T>) {
    setBlocks((bs) =>
      bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
    );
  }
  function remove(id: string) {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
  }
  function move(id: string, delta: number) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      if (i < 0) return bs;
      const j = i + delta;
      if (j < 0 || j >= bs.length) return bs;
      const next = bs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function add(type: "text" | "image" | "cta") {
    setBlocks((bs) => [...bs, newBlock(type)]);
  }

  async function callAction(
    action: (fd: FormData) => Promise<void>,
  ): Promise<void> {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("orgSlug", orgSlug);
      fd.set("blocks", JSON.stringify(blocks));
      // Capture the CSRF token rendered in the hidden input so the
      // server action sees it.
      const tok = document.querySelector<HTMLInputElement>(
        'input[name="_csrf"]',
      )?.value;
      if (tok) fd.set("_csrf", tok);
      await action(fd);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="hidden">{csrf}</div>

      {blocks.length === 0 ? (
        <p className="text-sm text-ink-muted">No blocks yet — add one below.</p>
      ) : (
        <ul className="space-y-3">
          {blocks.map((b, i) => (
            <li key={b.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-ink-muted">
                  {b.type}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(b.id, -1)}
                    disabled={i === 0}
                    className="btn-secondary text-xs"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(b.id, 1)}
                    disabled={i === blocks.length - 1}
                    className="btn-secondary text-xs"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(b.id)}
                    className="btn-secondary text-xs text-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {b.type === "text" && (
                <div className="space-y-2">
                  <input
                    placeholder="Title"
                    value={b.title}
                    onChange={(e) => update<TextBlock>(b.id, { title: e.target.value })}
                    className="input"
                  />
                  <textarea
                    placeholder="Body (markdown supported)"
                    value={b.body}
                    onChange={(e) => update<TextBlock>(b.id, { body: e.target.value })}
                    rows={4}
                    className="input"
                  />
                </div>
              )}

              {b.type === "image" && (
                <div className="space-y-2">
                  <input
                    placeholder="Filename (uploaded via /admin/photos)"
                    value={b.filename}
                    onChange={(e) =>
                      update<ImageBlock>(b.id, { filename: e.target.value })
                    }
                    className="input"
                  />
                  <input
                    placeholder="Alt text"
                    value={b.alt}
                    onChange={(e) => update<ImageBlock>(b.id, { alt: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="Caption"
                    value={b.caption}
                    onChange={(e) =>
                      update<ImageBlock>(b.id, { caption: e.target.value })
                    }
                    className="input"
                  />
                </div>
              )}

              {b.type === "cta" && (
                <div className="space-y-2">
                  <input
                    placeholder="Headline"
                    value={b.title}
                    onChange={(e) => update<CtaBlock>(b.id, { title: e.target.value })}
                    className="input"
                  />
                  <textarea
                    placeholder="Body"
                    value={b.body}
                    onChange={(e) => update<CtaBlock>(b.id, { body: e.target.value })}
                    rows={2}
                    className="input"
                  />
                  <input
                    placeholder="Button label"
                    value={b.buttonLabel}
                    onChange={(e) =>
                      update<CtaBlock>(b.id, { buttonLabel: e.target.value })
                    }
                    className="input"
                  />
                  <input
                    placeholder="Button link"
                    value={b.buttonLink}
                    onChange={(e) =>
                      update<CtaBlock>(b.id, { buttonLink: e.target.value })
                    }
                    className="input"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => add("text")}
          className="btn-secondary text-sm"
        >
          + Text
        </button>
        <button
          type="button"
          onClick={() => add("image")}
          className="btn-secondary text-sm"
        >
          + Image
        </button>
        <button
          type="button"
          onClick={() => add("cta")}
          className="btn-secondary text-sm"
        >
          + CTA
        </button>
      </div>

      <div className="flex gap-2 pt-4 border-t border-ink-muted/15">
        <button
          type="button"
          disabled={pending}
          onClick={() => callAction(saveDraftBlocks)}
          className="btn-secondary"
        >
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => callAction(publishBlocks)}
          className="btn-primary"
        >
          Publish
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => callAction(revertDraftBlocks)}
          className="btn-secondary text-danger"
        >
          Revert draft
        </button>
      </div>
    </div>
  );
}
