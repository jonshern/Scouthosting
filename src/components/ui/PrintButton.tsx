"use client";

// Small client wrapper around window.print(). Keeps the rest of a page
// server-rendered while still giving the user a one-click "print this"
// affordance for pocket-list / report pages.

import type { ReactNode } from "react";

export function PrintButton({
  children = "Print",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "btn-primary print:hidden"
      }
    >
      {children}
    </button>
  );
}
