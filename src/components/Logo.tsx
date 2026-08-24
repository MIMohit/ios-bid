import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group flex items-center gap-2 ${className}`}>
      <span
        className="squircle grid size-7 place-items-center text-white shadow-sm transition group-hover:scale-105"
        style={{ background: "linear-gradient(145deg, var(--accent), var(--accent-2))" }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V6M6 12l6-6 6 6" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        iosbid<span className="text-faint">.lol</span>
      </span>
    </Link>
  );
}
