import Link from "next/link";
import { useId } from "react";

import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

/** The logo mark: a ticket with its tear-off line and a QR corner (ADR 0021). */
export function LogoMark({ className }: { className?: string | undefined }) {
  // Unique ids: several marks may share a page.
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B6CFF" />
          <stop offset="1" stopColor="#4A22D6" />
        </linearGradient>
        <mask id={`${id}m`}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="44" cy="12" r="5" fill="#000" />
          <circle cx="44" cy="52" r="5" fill="#000" />
        </mask>
      </defs>
      <rect x="3" y="12" width="58" height="40" rx="7" fill={`url(#${id}g)`} mask={`url(#${id}m)`} />
      <path
        d="M44 20.5v3M44 27.5v3M44 34.5v3M44 41.5v2.5"
        stroke="#fff"
        strokeOpacity=".7"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect x="11.5" y="20.5" width="15" height="15" rx="3.5" fill="none" stroke="#fff" strokeWidth="3" />
      <rect x="16.5" y="25.5" width="5" height="5" rx="1.2" fill="#fff" />
      <rect x="30" y="20.5" width="5" height="5" rx="1.2" fill="#FFC53D" />
      <rect x="30" y="38.5" width="5" height="5" rx="1.2" fill="#fff" />
      <rect x="11.5" y="38.5" width="15" height="5" rx="1.2" fill="#fff" fillOpacity=".55" />
    </svg>
  );
}

/** Mark + wordmark, linking home. */
export function Logo({ href = "/", className, inverse = false }: { href?: string; className?: string | undefined; inverse?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={texts.brand.home}
      className={cn("group inline-flex items-center gap-2.5 rounded-lg", className)}
    >
      <LogoMark className="size-8 transition-transform duration-300 group-hover:-rotate-6" />
      <span
        className={cn("text-[15px] leading-none font-semibold tracking-tight", inverse ? "text-white" : "text-fg")}
      >
        Ingresso<span className={inverse ? "text-white/70" : "text-brand"}> Impresso</span>
      </span>
    </Link>
  );
}
