"use client";

// Advanced (3-column) canvas editor per design_handoff_compass_cms.
//   Palette (left)   — block types you can add
//   Canvas  (middle) — ordered block list, click a row to select
//   Inspector (right) — fields for the selected block, plus reorder
//                       and delete
// Save/Publish/Revert use the same server actions as the simple
// editor.

import { useMemo, useState } from "react";
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
type BlockType = Block["type"];

type Props = {
  orgSlug: string;
  blocks: Block[];
  csrf: React.ReactNode;
};

function mintId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

function newBlock(type: BlockType): Block {
  const id = mintId();
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

function blockSummary(b: Block): string {
  if (b.type === "text") return b.title || b.body.slice(0, 60) || "(empty text)";
  if (b.type === "image") return b.filename || b.alt || "(empty image)";
  return b.title || b.buttonLabel || "(empty CTA)";
}

const PALETTE: { type: BlockType; label: string; description: string }[] = [
  {
    type: "text",
    label: "Text",
    description: "Headline + markdown body — anchor copy.",
  },
  {
    type: "image",
    label: "Image",
    description: "Photo from /admin/photos with alt + caption.",
  },
  {
    type: "cta",
    label: "CTA",
    description: "Headline + body + a single action button.",
  },
];

export function AdvancedCanvasEditor({
  orgSlug,
  blocks: initial,
  csrf,
}: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initial ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial?.[0]?.id ?? null,
  );
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selected = useMemo(
    () => blocks.find((b) => b.id === selectedId) ?? null,
    [blocks, selectedId],
  );

  function update<T extends Block>(id: string, patch: Partial<T>) {
    setBlocks((bs) =>
      bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
    );
    setDirty(true);
  }
  function remove(id: string) {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const next = bs.filter((b) => b.id !== id);
      if (selectedId === id) {
        const fallback = next[i] ?? next[i - 1] ?? null;
        setSelectedId(fallback ? fallback.id : null);
      }
      return next;
    });
    setDirty(true);
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
    setDirty(true);
  }
  function add(type: BlockType) {
    const b = newBlock(type);
    setBlocks((bs) => [...bs, b]);
    setSelectedId(b.id);
    setDirty(true);
  }

  async function callAction(action: (fd: FormData) => Promise<void>) {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("orgSlug", orgSlug);
      fd.set("blocks", JSON.stringify(blocks));
      const tok = document.querySelector<HTMLInputElement>(
        'input[name="_csrf"]',
      )?.value;
      if (tok) fd.set("_csrf", tok);
      await action(fd);
      setDirty(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="hidden">{csrf}</div>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr_320px]">
        {/* PALETTE */}
        <aside className="rounded-xl border border-line bg-surface p-3 space-y-2 self-start">
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted px-1">
            Palette
          </div>
          {PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => add(p.type)}
              className="w-full text-left rounded-md border border-line bg-bg hover:border-accent hover:bg-surface-alt transition-colors px-3 py-2"
            >
              <div className="font-semibold text-ink text-sm">+ {p.label}</div>
              <div className="text-xs text-slate-muted">{p.description}</div>
            </button>
          ))}
        </aside>

        {/* CANVAS */}
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2 min-h-[280px]">
          <div className="flex items-baseline justify-between px-1">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Canvas
            </div>
            <div className="text-xs text-slate-muted">
              {blocks.length} block{blocks.length === 1 ? "" : "s"}
            </div>
          </div>
          {blocks.length === 0 ? (
            <p className="text-sm text-slate-muted px-1 py-6 text-center">
              No blocks yet — pick one from the palette to start.
            </p>
          ) : (
            <ul className="space-y-2">
              {blocks.map((b, i) => {
                const isSelected = b.id === selectedId;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(b.id)}
                      className={
                        "w-full text-left rounded-md border px-3 py-2 transition-colors " +
                        (isSelected
                          ? "border-accent bg-surface-alt"
                          : "border-line bg-bg hover:bg-surface-alt")
                      }
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-muted">
                          {b.type}
                        </span>
                        <span className="text-[11px] text-slate-muted font-mono">
                          #{i + 1}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-ink truncate">
                        {blockSummary(b)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* INSPECTOR */}
        <aside className="rounded-xl border border-line bg-surface p-3 space-y-3 self-start">
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted px-1">
            Inspector
          </div>
          {!selected ? (
            <p className="text-sm text-slate-muted px-1 py-6 text-center">
              Select a block to edit.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                  {selected.type}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(selected.id, -1)}
                    disabled={blocks.findIndex((b) => b.id === selected.id) === 0}
                    className="btn-secondary text-xs"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(selected.id, 1)}
                    disabled={
                      blocks.findIndex((b) => b.id === selected.id) ===
                      blocks.length - 1
                    }
                    className="btn-secondary text-xs"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(selected.id)}
                    className="btn-secondary text-xs text-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {selected.type === "text" && (
                <div className="space-y-2">
                  <label className="label">Title</label>
                  <input
                    value={selected.title}
                    onChange={(e) =>
                      update<TextBlock>(selected.id, { title: e.target.value })
                    }
                    className="field"
                  />
                  <label className="label">Body (markdown)</label>
                  <textarea
                    value={selected.body}
                    onChange={(e) =>
                      update<TextBlock>(selected.id, { body: e.target.value })
                    }
                    rows={6}
                    className="field"
                  />
                </div>
              )}

              {selected.type === "image" && (
                <div className="space-y-2">
                  <label className="label">Filename</label>
                  <input
                    value={selected.filename}
                    onChange={(e) =>
                      update<ImageBlock>(selected.id, {
                        filename: e.target.value,
                      })
                    }
                    className="field"
                  />
                  <label className="label">Alt text</label>
                  <input
                    value={selected.alt}
                    onChange={(e) =>
                      update<ImageBlock>(selected.id, { alt: e.target.value })
                    }
                    className="field"
                  />
                  <label className="label">Caption</label>
                  <input
                    value={selected.caption}
                    onChange={(e) =>
                      update<ImageBlock>(selected.id, {
                        caption: e.target.value,
                      })
                    }
                    className="field"
                  />
                </div>
              )}

              {selected.type === "cta" && (
                <div className="space-y-2">
                  <label className="label">Headline</label>
                  <input
                    value={selected.title}
                    onChange={(e) =>
                      update<CtaBlock>(selected.id, { title: e.target.value })
                    }
                    className="field"
                  />
                  <label className="label">Body</label>
                  <textarea
                    value={selected.body}
                    onChange={(e) =>
                      update<CtaBlock>(selected.id, { body: e.target.value })
                    }
                    rows={3}
                    className="field"
                  />
                  <label className="label">Button label</label>
                  <input
                    value={selected.buttonLabel}
                    onChange={(e) =>
                      update<CtaBlock>(selected.id, {
                        buttonLabel: e.target.value,
                      })
                    }
                    className="field"
                  />
                  <label className="label">Button link</label>
                  <input
                    value={selected.buttonLink}
                    onChange={(e) =>
                      update<CtaBlock>(selected.id, {
                        buttonLink: e.target.value,
                      })
                    }
                    className="field"
                  />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-line">
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
        {dirty ? (
          <span className="text-xs text-warn ml-2">Unsaved changes</span>
        ) : null}
      </div>
    </div>
  );
}
