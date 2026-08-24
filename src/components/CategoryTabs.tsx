"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";

const PRIMARY = 8;

export function CategoryTabs({
  active,
  window: win,
}: {
  active: string;
  window: "all" | "today";
}) {
  const [open, setOpen] = useState(false);
  const suffix = win === "today" ? "/today" : "";
  const shown = open ? CATEGORIES : CATEGORIES.slice(0, PRIMARY);

  const pill = (isActive: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
      isActive
        ? "bg-accent text-white shadow-sm"
        : "border border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
    }`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Link href={win === "today" ? "/today" : "/"} className={pill(active === "all")}>
        <span aria-hidden>◎</span> All
      </Link>
      {shown.map((c) => (
        <Link key={c.slug} href={`/category/${c.slug}${suffix}`} className={pill(active === c.slug)}>
          <span aria-hidden>{c.emoji}</span> {c.short}
        </Link>
      ))}
      <button type="button" onClick={() => setOpen((o) => !o)} className={pill(false)}>
        {open ? "Less" : "More"}
        <svg viewBox="0 0 24 24" className={`size-3 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
