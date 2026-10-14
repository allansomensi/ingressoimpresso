"use client";

import type { PricingDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Ban, CheckCheck, CheckCircle2, GraduationCap, Guitar, Printer, Ticket, Users, WifiOff, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { QrCode } from "@/components/qr";
import { ButtonLink } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { initials, money } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { eventPages as eventPagesTexts, landing as landingTexts, templateGallery as templateGalleryTexts } from "@/texts/pt-BR";

const c = landingTexts.cases;
const [band, raffle, graduation] = c.items;
// Decorative QR codes: these are drawings, not tickets.
const SAMPLE_QR = "AMOSTRA-INGRESSO-IMPRESSO";

type Palette = "violet" | "sunset" | "gold";

const PALETTES: Record<Palette, { art: string; glow: string; text: string; accent: string }> = {
  violet: {
    art: "bg-[radial-gradient(120%_90%_at_0%_0%,#8b6cff_0%,#5b3df5_40%,#2a1584_100%)]",
    glow: "bg-[#ffb224]/70",
    text: "text-white",
    accent: "text-[#5b3df5]",
  },
  sunset: {
    art: "bg-[radial-gradient(120%_90%_at_0%_0%,#ffb36b_0%,#ff6a4d_45%,#c81e5b_100%)]",
    glow: "bg-[#fff1a8]/60",
    text: "text-white",
    accent: "text-[#c81e5b]",
  },
  gold: {
    art: "bg-[radial-gradient(120%_90%_at_0%_0%,#3b352c_0%,#1c1917_55%,#0c0a09_100%)]",
    glow: "bg-[#e8c26a]/40",
    text: "text-[#f3d488]",
    accent: "text-[#a8812f]",
  },
};

/** A small printed ticket: art, name, number, QR and (optionally) the stub. */
function MiniTicket({
  title,
  subtitle,
  number,
  palette,
  className,
  stub = true,
}: {
  title: string;
  subtitle: string;
  number: string;
  palette: Palette;
  className?: string;
  stub?: boolean;
}) {
  const p = PALETTES[palette];
  return (
    <div className={cn("flex w-[210px] overflow-hidden rounded-[14px] bg-white text-[#0e0d14] shadow-md ring-1 ring-black/5", className)}>
      <div className={cn("relative flex flex-1 flex-col justify-between gap-3 overflow-hidden p-3", p.text)}>
        <div aria-hidden className={cn("absolute inset-0", p.art)} />
        <div aria-hidden className={cn("absolute -right-8 -bottom-10 size-28 rounded-full blur-2xl", p.glow)} />
        <div className="relative flex flex-col leading-tight">
          <span className="text-[8px] font-semibold tracking-[0.2em] uppercase opacity-80">{palette === "sunset" ? "Rifa" : "Ingresso"}</span>
          <span className="text-[13px] font-bold tracking-tight">{title}</span>
          <span className="text-[9px] opacity-80">{subtitle}</span>
        </div>
        <div className="relative flex items-end justify-between gap-2">
          <span className="font-mono text-sm font-bold">{number}</span>
          <QrCode text={SAMPLE_QR} size={40} label={number} className="rounded bg-white p-0.5" />
        </div>
      </div>
      {stub && (
        <div className="relative flex w-10 items-center justify-center border-l-2 border-dashed border-black/15 bg-[#faf9ff]">
          <span className={cn("rotate-90 font-mono text-[10px] font-bold whitespace-nowrap", p.accent)}>{number}</span>
        </div>
      )}
    </div>
  );
}

/** The frame every illustration sits in. */
function Scene({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex h-44 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-2",
        "bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:14px_14px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SceneTicket({ title, subtitle, number, palette }: { title: string; subtitle: string; number: string; palette: Palette }) {
  return (
    <Scene>
      <MiniTicket title={title} subtitle={subtitle} number={number} palette={palette} className="-rotate-3" />
    </Scene>
  );
}

/** A stack of printed tickets with the numbering. */
function ScenePrint({ title, subtitle, label, palette }: { title: string; subtitle: string; label: string; palette: Palette }) {
  return (
    <Scene>
      <div className="relative h-28 w-[230px] scale-90">
        <MiniTicket title={title} subtitle={subtitle} number="Nº 0200" palette={palette} className="absolute top-0 left-5 rotate-6 opacity-60" />
        <MiniTicket title={title} subtitle={subtitle} number="Nº 0002" palette={palette} className="absolute top-1 left-2.5 rotate-2 opacity-80" />
        <MiniTicket title={title} subtitle={subtitle} number="Nº 0001" palette={palette} className="absolute top-2 left-0 -rotate-2" />
      </div>
      <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-mono text-[11px] font-semibold text-fg shadow-sm ring-1 ring-border">
        <Printer className="size-3.5 text-brand" />
        {label}
      </span>
    </Scene>
  );
}

/** A sheet of 12 raffle tickets, as printed at home. */
function SceneSheet({ label }: { label: string }) {
  return (
    <Scene>
      <div className="grid w-32 -rotate-3 grid-cols-3 gap-1 rounded-md bg-white p-2 shadow-md ring-1 ring-black/5">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} className="flex h-5 items-center justify-center rounded-[3px] bg-gradient-to-br from-[#ff8a5b] to-[#d6336c] font-mono text-[7px] font-bold text-white">
            {String(index + 1).padStart(3, "0")}
          </span>
        ))}
      </div>
      <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-fg shadow-sm ring-1 ring-border">
        <Printer className="size-3.5 text-brand" />
        {label}
      </span>
    </Scene>
  );
}

/** Sellers with their numbers and where each one stands. */
function SceneSellers({ sellers, more }: { sellers: readonly { name: string; range: string; status: string }[]; more: string }) {
  return (
    <Scene className="items-stretch p-3">
      <ul className="flex w-full flex-col gap-1.5">
        {sellers.map((seller) => {
          const settled = seller.status === "Quitado";
          return (
            <li key={seller.name} className="flex items-center gap-2 rounded-xl bg-surface px-2.5 py-1.5 shadow-xs ring-1 ring-border">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand-soft-fg">
                {initials(seller.name)}
              </span>
              <span className="shrink-0 text-xs font-medium text-fg">{seller.name}</span>
              <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-fg-muted">{seller.range}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap",
                  settled ? "bg-success-soft text-success-fg" : "bg-warning-soft text-warning-fg",
                )}
              >
                {seller.status}
              </span>
            </li>
          );
        })}
        <li className="flex items-center gap-1.5 px-1 text-[11px] text-fg-subtle">
          <Users className="size-3.5" />
          {more}
        </li>
      </ul>
    </Scene>
  );
}

/** A phone at the door: green "can enter", and a copy stopped. */
function SceneDoor({ admit, number, tag, tone }: { admit: string; number: string; tag: string; tone: "danger" | "success" }) {
  return (
    <Scene>
      <div className="w-[96px] -translate-x-14 rotate-2 rounded-[20px] bg-[#0e0d14] p-1.5 shadow-lg">
        <div className="flex h-[132px] flex-col items-center justify-center gap-1 rounded-[15px] bg-[#15803d] text-white">
          <CheckCircle2 className="size-8" strokeWidth={2.5} />
          <span className="text-[10px] font-black">{admit}</span>
          <span className="font-mono text-[10px] font-bold">{number}</span>
          <span className="mt-1 flex items-center gap-0.5 text-[7px]">
            <WifiOff className="size-2.5" />
            offline
          </span>
        </div>
      </div>
      <span
        className={cn(
          "absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white shadow-md",
          tone === "danger" ? "bg-danger-solid" : "bg-brand-solid",
        )}
      >
        {tone === "danger" ? <Ban className="size-3.5" /> : <Users className="size-3.5" />}
        {tag}
      </span>
    </Scene>
  );
}

/** A raffle stub: who bought each number. */
function SceneStub({ number, name, phone }: { number: string; name: string; phone: string }) {
  return (
    <Scene>
      <div className="flex -rotate-2 overflow-hidden rounded-xl bg-white text-[#0e0d14] shadow-md ring-1 ring-black/5">
        <div className="flex w-36 flex-col gap-1.5 border-r-2 border-dashed border-black/15 p-3">
          <span className="font-mono text-base font-bold text-[#c81e5b]">{number}</span>
          <span className="border-b border-black/20 pb-0.5 font-[cursive] text-[11px]">{name}</span>
          <span className="border-b border-black/20 pb-0.5 font-[cursive] text-[11px]">{phone}</span>
        </div>
        <div className="flex w-16 items-center justify-center bg-gradient-to-br from-[#ff8a5b] to-[#d6336c] font-mono text-xs font-bold text-white">
          {number.replace("Nº ", "")}
        </div>
      </div>
      <span className="absolute right-4 bottom-4 flex size-8 items-center justify-center rounded-full bg-success-solid text-white shadow-md">
        <CheckCheck className="size-4" />
      </span>
    </Scene>
  );
}

/** A WhatsApp conversation delivering a digital ticket. */
function SceneChat({ name, message, title, subtitle }: { name: string; message: string; title: string; subtitle: string }) {
  return (
    <Scene className="items-end p-0">
      <div className="flex h-full w-full flex-col bg-[#efeae2] dark:bg-[#0b141a]">
        <div className="flex items-center gap-2 bg-[#008069] px-3 py-1.5 text-white">
          <span className="flex size-5 items-center justify-center rounded-full bg-white/25 text-[9px] font-semibold">{initials(name)}</span>
          <span className="text-[11px] font-semibold">{name}</span>
        </div>
        <div className="flex flex-1 items-center justify-end px-3">
          <div className="flex flex-col gap-1 rounded-xl rounded-tr-sm bg-[#d9fdd3] p-1.5 shadow-sm dark:bg-[#005c4b]">
            <MiniTicket title={title} subtitle={subtitle} number="Nº 0218" palette="gold" stub={false} className="w-[150px] shadow-none" />
            <span className="flex items-center justify-between gap-2 px-1 text-[10px] text-[#111b21] dark:text-white">
              {message}
              <CheckCheck className="size-3 text-[#53bdeb]" />
            </span>
          </div>
        </div>
      </div>
    </Scene>
  );
}

type Case = {
  key: string;
  icon: LucideIcon;
  tab: string;
  title: string;
  facts: readonly string[];
  quantity: number;
  outcome: string;
  steps: readonly { title: string; body: string }[];
  scenes: readonly ReactNode[];
  /** The public page that tells more about this kind of event. */
  more: { href: string; label: string };
};

const CASES: readonly Case[] = [
  {
    ...band,
    icon: Guitar,
    more: { href: "/ingresso-para/show-de-banda", label: eventPagesTexts.eyebrow("Show de banda") },
    scenes: [
      <SceneTicket key="1" title={band.scene.event} subtitle={band.scene.venue} number={band.scene.number} palette="violet" />,
      <ScenePrint key="2" title={band.scene.event} subtitle={band.scene.venue} label={band.scene.print} palette="violet" />,
      <SceneSellers key="3" sellers={band.scene.sellers} more={band.scene.more} />,
      <SceneDoor key="4" admit={band.scene.admit} number={band.scene.number} tag={band.scene.blocked} tone="danger" />,
    ],
  },
  {
    ...raffle,
    icon: Ticket,
    more: { href: "/modelos/rifa", label: templateGalleryTexts.raffleLink },
    scenes: [
      <SceneTicket key="1" title={raffle.scene.event} subtitle={raffle.scene.venue} number={raffle.scene.number} palette="sunset" />,
      <SceneSheet key="2" label={raffle.scene.print} />,
      <SceneSellers key="3" sellers={raffle.scene.sellers} more={raffle.scene.more} />,
      <SceneStub key="4" number={raffle.scene.number} name={raffle.scene.stubName} phone={raffle.scene.stubPhone} />,
    ],
  },
  {
    ...graduation,
    icon: GraduationCap,
    more: { href: "/ingresso-para/formatura", label: eventPagesTexts.eyebrow("Formatura") },
    scenes: [
      <SceneTicket key="1" title={graduation.scene.event} subtitle={graduation.scene.venue} number={graduation.scene.number} palette="gold" />,
      <SceneChat key="2" name={graduation.scene.chatName} message={graduation.scene.chat} title={graduation.scene.event} subtitle={graduation.scene.venue} />,
      <SceneSellers key="3" sellers={graduation.scene.sellers} more={graduation.scene.more} />,
      <SceneDoor key="4" admit={graduation.scene.admit} number={graduation.scene.number} tag={graduation.scene.entered} tone="success" />,
    ],
  },
];

/** Three events told step by step, each step with a drawing of what happens (landing page). */
export function UseCases() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => api<PricingDto>("/api/pricing"), staleTime: 60 * 60_000 });
  const current = CASES[selected] ?? CASES[0];

  const keyDown = (event: KeyboardEvent, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % CASES.length : event.key === "ArrowLeft" ? (index - 1 + CASES.length) % CASES.length : null;
    if (next !== null) {
      event.preventDefault();
      setSelected(next);
      tabs.current[next]?.focus();
    }
  };

  if (current === undefined) {
    return null;
  }
  const cost = pricing.data === undefined ? null : quote(pricing.data, current.quantity);

  return (
    <div className="flex flex-col gap-8">
      <div
        role="tablist"
        aria-label={c.eyebrow}
        className="mx-auto grid w-full max-w-xl grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1 shadow-xs sm:flex sm:w-auto"
      >
        {CASES.map((item, index) => {
          const Icon = item.icon;
          const active = index === selected;
          return (
            <button
              key={item.key}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`caso-${item.key}`}
              aria-selected={active}
              aria-controls={`painel-caso-${item.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                setSelected(index);
              }}
              onKeyDown={(event) => {
                keyDown(event, index);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[13px] leading-tight font-semibold transition sm:flex-auto sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm sm:whitespace-nowrap",
                active ? "bg-brand-solid text-brand-fg shadow-sm shadow-brand/25" : "text-fg-muted hover:bg-surface-2 active:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {item.tab}
            </button>
          );
        })}
      </div>

      <div
        key={current.key}
        role="tabpanel"
        id={`painel-caso-${current.key}`}
        aria-labelledby={`caso-${current.key}`}
        className="flex flex-col gap-8 animate-fade-in"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <h3 className="text-2xl font-semibold tracking-tight text-fg">{current.title}</h3>
          <ul className="flex flex-wrap justify-center gap-2">
            {current.facts.map((fact) => (
              <li key={fact} className="rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium text-fg-muted">
                {fact}
              </li>
            ))}
            {cost !== null && (
              <li className="rounded-full border border-success/25 bg-success-soft px-3 py-1 text-sm font-medium text-success-fg">
                {c.cost(money(cost))}
              </li>
            )}
          </ul>
        </div>

        {/* Phones swipe through the steps; wider screens see them side by side. */}
        {/* Focusable, so the keyboard can scroll it too. */}
        <ol
          tabIndex={0}
          aria-label={current.title}
          className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 scrollbar-none focus-visible:outline-offset-[-2px] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4"
        >
          {current.steps.map((step, index) => (
            <li
              key={step.title}
              className="relative flex w-[82%] shrink-0 snap-center flex-col gap-4 rounded-3xl border border-border bg-surface p-4 shadow-xs sm:w-auto"
            >
              {current.scenes[index]}
              <div className="flex flex-col gap-1.5 px-1 pb-1">
                <span className="flex items-start gap-2">
                  <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-solid text-xs font-bold text-brand-fg">{index + 1}</span>
                  <h4 className="text-base font-semibold tracking-tight text-fg">{step.title}</h4>
                </span>
                <p className="text-sm leading-relaxed text-fg-muted">{step.body}</p>
              </div>
              {index < current.steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-24 -right-3.5 z-10 hidden size-7 items-center justify-center rounded-full border border-border bg-surface text-fg-subtle shadow-xs lg:flex"
                >
                  <ArrowRight className="size-3.5" />
                </span>
              )}
            </li>
          ))}
        </ol>

        <div className="flex flex-col items-stretch justify-between gap-4 rounded-3xl bg-brand-soft px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <p className="flex items-start gap-3 text-[15px] font-medium text-brand-soft-fg sm:items-center">
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 sm:mt-0" />
            {current.outcome}
          </p>
          <ButtonLink href="/entrar" size="md" icon={<ArrowRight />} className="shrink-0 flex-row-reverse">
            {c.cta}
          </ButtonLink>
        </div>
        <Link
          href={current.more.href}
          className="relative inline-flex w-fit items-center gap-1.5 self-center text-sm font-medium text-brand-soft-fg touch-target hover:underline"
        >
          {current.more.label}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
