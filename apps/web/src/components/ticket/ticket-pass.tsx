"use client";

import type { TicketPassDto } from "@ingressoimpresso/api-types";
import {
  Armchair,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Download,
  ExternalLink,
  ImageIcon,
  MapPin,
  Navigation,
  RefreshCw,
  Sun,
  Ticket,
  WifiOff,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";

import { LogoMark } from "@/components/brand";
import { EventChangeNotice, OrganizationContact, OrganizationLogo } from "@/components/organization/organization";
import { QrCode } from "@/components/qr";
import { SeatMap } from "@/components/ticket/seat-map";
import { Button, Dialog, Spinner, buttonClass } from "@/components/ui";
import { ApiError, api, fetchBlobUrl } from "@/lib/api";
import {
  calendarSequence,
  downloadIcs,
  googleCalendarUrl,
  icsFile,
  icsFileName,
  isApplePhone,
  mapsUrl,
  placeLine,
  type CalendarEntry,
} from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { inkFor } from "@/lib/design-rules";
import { changeKind } from "@/lib/event-change";
import { shortDateTime } from "@/lib/format";
import { sessionLabel } from "@/lib/series";
import { SITE_URL } from "@/lib/site";
import { forgetPass, normalizePass, passBand, passDate, passImage, saveImage, storePass, storedPass, textOn } from "@/lib/ticket-pass";
import { useWakeLock } from "@/lib/wake-lock";
import { texts } from "@/texts/pt-BR";

const t = texts.ticket;

type State =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "ready"; pass: TicketPassDto; offline: boolean };

/** The link's token: everything after `#` (the fragment never reaches a server, ADR 0030). */
function readToken(): string | null {
  const token = window.location.hash.replace(/^#/, "").trim();
  return token === "" ? null : token;
}

/** The phone's maker never changes while the page is open. */
function subscribeNothing(): () => void {
  return () => undefined;
}

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Whether the browser says it is online (the Google Calendar link needs the internet). */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** The calendar entry of a ticket: same `UID` after a postponement, so it updates the old one. */
function calendarEntry(pass: TicketPassDto): CalendarEntry {
  const place = placeLine(pass.event.venue, pass.event.address);
  return {
    uid: `${pass.event.id === "" ? pass.event.name : pass.event.id}-${String(pass.number)}@ingressoimpresso.com.br`,
    title: pass.event.name,
    startsAt: pass.event.startsAt,
    endsAt: pass.event.endsAt,
    location: place,
    description: t.calendarDescription(pass.numberLabel, pass.seat, pass.organization.name),
    sequence: calendarSequence(pass.event.change.postponedAt),
    alarmMinutes: 120,
    alarmText: t.calendarAlarm(pass.event.name),
  };
}

/** "Para o dia": add to the calendar (works offline) and directions to the venue. */
function DayPlan({ pass }: { pass: TicketPassDto }) {
  const online = useOnline();
  const apple = useSyncExternalStore(
    subscribeNothing,
    () => isApplePhone(navigator.userAgent, navigator.maxTouchPoints),
    () => false,
  );
  const place = placeLine(pass.event.venue, pass.event.address);
  const entry = calendarEntry(pass);
  const row = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 active:bg-surface-2";
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold text-fg">{t.plan}</h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        <button
          type="button"
          className={row}
          onClick={() => {
            downloadIcs(icsFile(entry), icsFileName(pass.event.name, t.calendarFile));
            toast.success(t.calendarSaved);
          }}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
            <CalendarPlus aria-hidden className="size-[18px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-fg">{t.calendar}</span>
            <span className="text-xs text-fg-muted">{t.calendarHint}</span>
          </span>
        </button>
        {online && (
          <a href={googleCalendarUrl(entry)} target="_blank" rel="noopener noreferrer" className={cn(row, "min-h-12 py-2.5")}>
            <span aria-hidden className="size-9 shrink-0" />
            <span className="flex-1 text-sm font-medium text-fg-muted">{t.googleCalendar}</span>
            <ExternalLink aria-hidden className="size-4 text-fg-subtle" />
          </a>
        )}
        {place !== null && (
          <a href={mapsUrl(place, apple)} target="_blank" rel="noopener noreferrer" className={row}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success-fg">
              <Navigation aria-hidden className="size-[18px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-fg">{t.directions}</span>
              <span className="truncate text-xs text-fg-muted">{place}</span>
            </span>
            <ExternalLink aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          </a>
        )}
      </div>
    </section>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="m-auto flex max-w-sm flex-col items-center gap-4 px-6 py-16 text-center animate-rise">{children}</div>;
}

export function TicketPass() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [art, setArt] = useState<{ status: "closed" } | { status: "loading" } | { status: "ready"; url: string } | { status: "error" }>({
    status: "closed",
  });

  const load = useCallback(async (current: string) => {
    const cached = storedPass(current);
    if (cached !== null) {
      setState({ status: "ready", pass: cached, offline: false });
    }
    try {
      const pass = normalizePass(await api<TicketPassDto>("/api/ticket", { method: "POST", body: { token: current } }));
      storePass(current, pass);
      setState({ status: "ready", pass, offline: false });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        forgetPass(current);
        setState({ status: "not-found" });
      } else if (cached !== null) {
        setState({ status: "ready", pass: cached, offline: true });
      } else {
        setState({ status: "error" });
      }
    }
  }, []);

  useEffect(() => {
    const read = () => {
      const current = readToken();
      setToken(current);
      if (current === null) {
        setState({ status: "no-token" });
      } else {
        void load(current);
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      window.removeEventListener("hashchange", read);
    };
  }, [load]);

  const ready = state.status === "ready" ? state : null;
  useWakeLock(ready !== null && ready.pass.state !== "voided");

  useEffect(() => {
    if (ready !== null) {
      document.title = `${t.metaTitle} · ${ready.pass.event.name}`;
    }
  }, [ready]);

  if (state.status === "loading") {
    return (
      <Centered>
        <Spinner />
        <p className="text-sm text-fg-muted">{t.loading}</p>
      </Centered>
    );
  }
  if (state.status === "no-token" || state.status === "not-found" || state.status === "error") {
    const title = state.status === "no-token" ? t.metaTitle : state.status === "not-found" ? t.notFoundTitle : t.errorTitle;
    const body = state.status === "no-token" ? t.noToken : state.status === "not-found" ? t.notFound : t.error;
    return (
      <Centered>
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
          {state.status === "error" ? <WifiOff className="size-7" aria-hidden /> : <Ticket className="size-7" aria-hidden />}
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="leading-relaxed text-fg-muted">{body}</p>
        {state.status === "error" && token !== null && (
          <Button variant="secondary" icon={<RefreshCw />} onClick={() => void load(token)}>
            {t.retry}
          </Button>
        )}
      </Centered>
    );
  }

  const pass = state.pass;
  const band = passBand(pass.backgroundColor, pass.organization.brandColor);
  const canceled = changeKind(pass.event.change, pass.event.startsAt) === "canceled";
  const ink = textOn(band);
  const prefix = pass.numberPrefix.trim() === "" ? "Nº" : pass.numberPrefix.trim();
  const fileName = `ingresso-${pass.numberLabel}.png`;
  // Passes saved on the phone before categories and seats existed have neither (ADR 0056).
  const category = pass.category ?? null;
  const seat = pass.seat ?? null;

  const save = async () => {
    setSaving(true);
    try {
      const blob = await passImage(pass, { ticket: t.image.ticket, show: t.image.show, site: SITE_URL.replace(/^https?:\/\//, "") });
      await saveImage(blob, fileName);
      toast.success(t.saved);
    } catch {
      toast.error(texts.errors.generic);
    } finally {
      setSaving(false);
    }
  };
  const openArt = async () => {
    if (token === null) {
      return;
    }
    setArt({ status: "loading" });
    try {
      setArt({ status: "ready", url: await fetchBlobUrl("/api/ticket/image", { token }) });
    } catch {
      setArt({ status: "error" });
    }
  };
  const closeArt = () => {
    if (art.status === "ready") {
      URL.revokeObjectURL(art.url);
    }
    setArt({ status: "closed" });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] animate-rise">
      {state.offline && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-fg">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          {t.offline}
        </p>
      )}

      <EventChangeNotice change={pass.event.change} startsAt={pass.event.startsAt} />

      <article className="overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-lg">
        <header className="flex flex-col gap-2 px-6 pt-6 pb-7" style={{ backgroundColor: band, color: ink }}>
          <span className="flex items-center gap-3">
            <OrganizationLogo organization={pass.organization} className="size-10" />
            <span className="text-xs font-semibold tracking-[0.18em] uppercase opacity-90">{t.by(pass.organization.name)}</span>
          </span>
          <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance">{pass.event.name}</h1>
          {/* One of several dates (ADR 0077): this ticket is for this session only. */}
          {pass.event.inSeries && (
            <span className="w-fit rounded-full border border-current/35 px-2.5 py-0.5 text-xs font-semibold tracking-wide">
              {sessionLabel(pass.event.startsAt)}
            </span>
          )}
          <p className="flex items-start gap-2 text-sm opacity-90">
            <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className={cn("first-letter:uppercase", canceled && "line-through")}>{passDate(pass.event.startsAt)}</span>
          </p>
          {(pass.event.venue !== null || pass.event.address !== null) && (
            <p className="flex items-start gap-2 text-sm opacity-90">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex flex-col">
                {pass.event.venue !== null && <span>{pass.event.venue}</span>}
                {pass.event.address !== null && <span className="text-[13px] opacity-85">{pass.event.address}</span>}
              </span>
            </p>
          )}
        </header>

        {/* Tear line between the stub and the body, like a paper ticket. */}
        <div aria-hidden className="relative h-0 border-t-2 border-dashed border-border">
          <span className="absolute -top-3 -left-3 size-6 rounded-full border border-border bg-bg" />
          <span className="absolute -top-3 -right-3 size-6 rounded-full border border-border bg-bg" />
        </div>

        <div className="flex flex-col items-center gap-5 px-6 pt-7 pb-6">
          {pass.qrText === null ? (
            <div className="flex aspect-square w-full max-w-[18rem] flex-col items-center justify-center gap-3 rounded-2xl bg-danger-soft p-6 text-center text-danger-fg">
              <XCircle className="size-12" aria-hidden />
              <p className="font-semibold">{t.voided}</p>
            </div>
          ) : (
            <div className={cn("w-full max-w-[18rem] rounded-2xl bg-white p-2 ring-1 ring-black/10", pass.state === "entered" && "opacity-60")}>
              <QrCode text={pass.qrText} size={512} label={t.show} className="h-auto w-full bg-white" />
            </div>
          )}

          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-xs font-medium tracking-wide text-fg-subtle uppercase">{t.number}</span>
            <span className="font-mono text-3xl font-bold tracking-tight text-fg tabular">
              {prefix} {pass.numberLabel}
            </span>
            {pass.holderName !== null && <span className="text-sm text-fg-muted">{pass.holderName}</span>}
          </div>

          {(category !== null || seat !== null) && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {category !== null && (
                <span
                  className="rounded-full px-3 py-1 text-sm font-bold tracking-wide uppercase"
                  style={{ backgroundColor: category.color, color: inkFor(category.color) }}
                >
                  {category.name}
                </span>
              )}
              {seat !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm font-semibold text-fg">
                  <Armchair className="size-4 text-fg-muted" aria-hidden />
                  {seat}
                </span>
              )}
            </div>
          )}

          {pass.state === "valid" && !canceled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success-fg">
              <CheckCircle2 className="size-4" aria-hidden />
              {t.valid}
            </span>
          )}
          {pass.state === "entered" && pass.enteredAt !== null && (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning-fg">
                <CheckCircle2 className="size-4" aria-hidden />
                {t.entered(shortDateTime(pass.enteredAt))}
              </span>
              <p className="text-xs leading-relaxed text-fg-muted">{t.enteredNote}</p>
            </div>
          )}
          {pass.state === "voided" && <p className="text-center text-sm leading-relaxed text-fg-muted">{t.voidedNote}</p>}

          {pass.qrText !== null && pass.state === "valid" && !canceled && (
            <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
              <Sun className="size-4 text-warning" aria-hidden />
              {t.brightness}
            </p>
          )}
        </div>
      </article>

      {pass.qrText !== null && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Download />} loading={saving} onClick={() => void save()}>
            {t.save}
          </Button>
          <Button variant="secondary" icon={<ImageIcon />} loading={art.status === "loading"} onClick={() => void openArt()}>
            {t.art}
          </Button>
        </div>
      )}

      {!canceled && <DayPlan pass={pass} />}

      {pass.tableMap !== null && <SeatMap map={pass.tableMap} />}

      {(pass.organization.whatsapp !== null ||
        pass.organization.email !== null ||
        pass.organization.website !== null ||
        pass.organization.instagram !== null) && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-3 text-sm font-semibold text-fg">
            <OrganizationLogo organization={pass.organization} className="size-9 rounded-lg" />
            {pass.organization.name}
          </h2>
          <OrganizationContact organization={pass.organization} message={t.contactMessage(pass.event.name, pass.numberLabel)} />
        </section>
      )}

      {!canceled && (
        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">{t.tipsTitle}</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-fg-muted marker:text-fg-subtle">
            {t.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/" className="mx-auto flex items-center gap-2 text-xs text-fg-subtle transition hover:text-fg pointer-coarse:min-h-11">
        {t.poweredBy}
        <LogoMark className="size-4" />
        <span className="font-semibold">{texts.brand.name}</span>
      </Link>

      <Dialog open={art.status === "ready" || art.status === "error"} onClose={closeArt} size="md" title={t.artTitle}>
        {art.status === "ready" ? (
          <div className="flex flex-col gap-4">
            {/* A blob URL from our own API: next/image cannot optimize it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art.url} alt={t.artAlt(pass.numberLabel)} className="w-full rounded-xl border border-border" />
            <a href={art.url} download={`ingresso-${pass.numberLabel}-arte.jpg`} className={buttonClass({ variant: "secondary" })}>
              <Download />
              {t.artDownload}
            </a>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{t.artError}</p>
        )}
      </Dialog>
    </div>
  );
}
