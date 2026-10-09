"use client";

import type { TicketPassDto } from "@ingressoimpresso/api-types";
import { CalendarDays, CheckCircle2, Download, ImageIcon, MapPin, RefreshCw, Sun, Ticket, WifiOff, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { LogoMark } from "@/components/brand";
import { QrCode } from "@/components/qr";
import { Button, Dialog, Spinner, buttonClass } from "@/components/ui";
import { ApiError, api, fetchBlobUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { forgetPass, passBand, passDate, passImage, saveImage, storePass, storedPass, textOn } from "@/lib/ticket-pass";
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

/** Keeps the screen on while the ticket is shown (Screen Wake Lock, where supported). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) {
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const request = async () => {
      if (document.visibilityState !== "visible" || released) {
        return;
      }
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Battery saver or no permission: the screen just follows the phone's settings.
      }
    };
    void request();
    const onVisible = () => {
      void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
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
      const pass = await api<TicketPassDto>("/api/ticket", { method: "POST", body: { token: current } });
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
  const band = passBand(pass.backgroundColor);
  const ink = textOn(band);
  const prefix = pass.numberPrefix.trim() === "" ? "Nº" : pass.numberPrefix.trim();
  const fileName = `ingresso-${pass.numberLabel}.png`;

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

      <article className="overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-lg">
        <header className="flex flex-col gap-2 px-6 pt-6 pb-7" style={{ backgroundColor: band, color: ink }}>
          <span className="text-xs font-semibold tracking-[0.18em] uppercase opacity-75">{t.by(pass.event.organizer)}</span>
          <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance">{pass.event.name}</h1>
          <p className="flex items-start gap-2 text-sm opacity-90">
            <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="first-letter:uppercase">{passDate(pass.event.startsAt)}</span>
          </p>
          {pass.event.venue !== null && (
            <p className="flex items-start gap-2 text-sm opacity-90">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              {pass.event.venue}
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

          {pass.state === "valid" && (
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

          {pass.qrText !== null && pass.state === "valid" && (
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

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg">{t.tipsTitle}</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-fg-muted marker:text-fg-subtle">
          {t.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>

      <Link href="/" className="mx-auto flex items-center gap-2 text-xs text-fg-subtle transition hover:text-fg">
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
