import Link from "next/link";
import { useId } from "react";

import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

/** The logo mark: an admission ticket, tilted, with its tear-off line and a check (ADR 0021). */
export function LogoMark({ className }: { className?: string | undefined }) {
  // Unique ids: several marks may share a page.
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7B5CFF" />
          <stop offset="1" stopColor="#4A22D6" />
        </linearGradient>
      </defs>
      <g transform="rotate(-12 32 32)">
        <path d={TICKET_PATH} fill={`url(#${id}g)`} />
        <path
          d="M45 20v3.2M45 26.9v3.2M45 33.8v3.2M45 40.7v3.2"
          stroke="#fff"
          strokeOpacity=".55"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M18 32.5l5.5 5.5 12-12" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Ticket outline with a half-round notch on each side. */
const TICKET_PATH =
  "M10 14h44a6 6 0 0 1 6 6v6.5a5.5 5.5 0 0 0 0 11V44a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-6.5a5.5 5.5 0 0 0 0-11V20a6 6 0 0 1 6-6z";

/** Mark + wordmark, linking home. */
export function Logo({ href = "/", className, inverse = false }: { href?: string; className?: string | undefined; inverse?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={texts.brand.home}
      className={cn("group inline-flex items-center gap-2.5 rounded-lg", className)}
    >
      <LogoMark className="size-8 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
      <span
        className={cn("text-[15px] leading-none font-semibold tracking-tight", inverse ? "text-white" : "text-fg")}
      >
        Ingresso<span className={inverse ? "text-white/70" : "text-brand"}> Impresso</span>
      </span>
    </Link>
  );
}
