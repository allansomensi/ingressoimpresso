"use client";

import { AlertTriangle, CheckCircle2, Circle, Flashlight, FlashlightOff, Pause, ScanLine, Wifi, WifiOff, XCircle } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";

import { LogoMark } from "@/components/brand";

import { Scanner } from "@/portaria/camera";
import { clockNow, serverClockNow, subscribeClock } from "@/portaria/clock";
import { DoorApiError } from "@/portaria/client";
import { DoorEngine, type DoorState } from "@/portaria/engine";
import { announce, unlockAudio } from "@/portaria/feedback";
import { accessTokenFromHash, clearHash, noAccessToken, subscribeHash } from "@/portaria/hash";
import { OFFLINE_WARNING_MS, clockTime, type ResultView } from "@/portaria/logic";
import { cameraGranted, keepOffline, keepScreenOn, persistStorage } from "@/portaria/offline";
import { texts } from "@/texts/pt-BR";

const t = texts.portaria;

/** How long a result stays on screen: short for "enter", longer for anything to look at. */
const RESULT_MS = { ok: 1600, bad: 4000, warn: 4000 } as const;

export function DoorApp() {
  const [engine] = useState(() => new DoorEngine());
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const accessToken = useSyncExternalStore(subscribeHash, accessTokenFromHash, noAccessToken);

  useEffect(() => {
    void engine.start();
    return () => {
      engine.stop();
    };
  }, [engine]);

  return (
    <main className="flex min-h-dvh flex-col bg-[#0b0a12] bg-[radial-gradient(80%_50%_at_50%_0%,rgba(91,61,245,0.18),transparent)] text-neutral-50">
      {state.phase === "loading" && <Centered>{t.loading}</Centered>}
      {state.phase === "failed" && <Centered>{texts.errors.generic}</Centered>}
      {state.phase === "revoked" && <Revoked engine={engine} />}
      {state.phase === "unregistered" &&
        (accessToken === "" ? <Centered>{t.noAccess}</Centered> : <Register engine={engine} accessToken={accessToken} />)}
      {state.phase === "ready" &&
        (accessToken !== "" ? (
          <SwitchLink engine={engine} state={state} accessToken={accessToken} />
        ) : (
          <Door engine={engine} state={state} />
        ))}
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-5 p-6 text-center text-lg text-white/85">
      <LogoMark className="size-14" />
      {children}
    </div>
  );
}

const fieldClass =
  "w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-lg text-white placeholder:text-white/35 focus:border-[#7c66ff] focus:ring-4 focus:ring-[#7c66ff]/30 focus:outline-none";
const buttonClass =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-lg font-bold text-[#0b0a12] shadow-lg transition active:scale-[0.98] disabled:opacity-40 [&_svg]:size-5";
const secondaryClass =
  "flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-4 py-3.5 text-lg font-semibold transition active:scale-[0.98] disabled:opacity-40 [&_svg]:size-5";

function errorText(error: unknown): string {
  if (error instanceof DoorApiError) {
    if (error.revoked) {
      return t.revoked;
    }
    const messages: Readonly<Record<string, string>> = texts.errors;
    return error.offline ? texts.errors.network : (messages[error.code] ?? texts.errors.generic);
  }
  return texts.errors.generic;
}

function Register({ engine, accessToken }: { engine: DoorEngine; accessToken: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await engine.register(accessToken, name.trim());
      clearHash();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="m-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <LogoMark className="size-14" />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t.registerTitle}</h1>
        <p className="leading-relaxed text-white/70">{t.registerIntro}</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-white/80">{t.deviceName}</span>
        <input
          className={fieldClass}
          value={name}
          maxLength={40}
          placeholder={t.deviceNamePlaceholder}
          onChange={(event) => {
            setName(event.target.value);
          }}
          autoFocus
        />
      </label>
      <button type="submit" className={buttonClass} disabled={busy || name.trim() === ""}>
        {busy ? t.registering : t.register}
      </button>
      {error !== null && <p role="alert" className="rounded-xl bg-red-500/15 px-3 py-2 text-red-300">{error}</p>}
    </form>
  );
}

function SwitchLink({ engine, state, accessToken }: { engine: DoorEngine; state: DoorState; accessToken: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = state.pending > 0;

  const switchLink = async () => {
    setBusy(true);
    setError(null);
    try {
      await engine.register(accessToken, state.device?.deviceName ?? "");
      clearHash();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="m-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <LogoMark className="size-14" />
      <p className="text-xl font-semibold">{t.switchTitle(state.device?.deviceName ?? "")}</p>
      <button type="button" className={buttonClass} onClick={clearHash}>
        {t.keepDevice}
      </button>
      <button type="button" className={secondaryClass} disabled={busy || blocked} onClick={() => void switchLink()}>
        {t.useNewLink}
      </button>
      {blocked && <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-amber-200">{t.switchBlocked}</p>}
      {error !== null && <p role="alert" className="rounded-xl bg-red-500/15 px-3 py-2 text-red-300">{error}</p>}
    </div>
  );
}

function Revoked({ engine }: { engine: DoorEngine }) {
  return (
    <div className="m-auto flex w-full max-w-sm flex-col items-center gap-5 p-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-red-500/15 text-red-300">
        <XCircle className="size-8" aria-hidden />
      </span>
      <p className="text-lg text-white/85">{t.revoked}</p>
      <button
        type="button"
        className={secondaryClass}
        onClick={() => {
          if (window.confirm(t.forgetConfirm)) {
            void engine.forget();
          }
        }}
      >
        {t.forget}
      </button>
    </div>
  );
}

function Door({ engine, state }: { engine: DoorEngine; state: DoorState }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<Scanner | null>(null);
  const [running, setRunning] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [checks, setChecks] = useState({ app: false, camera: false, storage: false });
  const now = useSyncExternalStore(subscribeClock, clockNow, serverClockNow);

  // Readiness checks that need no user gesture.
  useEffect(() => {
    void Promise.all([keepOffline().catch(() => false), cameraGranted(), persistStorage()]).then(
      ([app, camera, storage]) => {
        setChecks({ app, camera, storage });
      },
    );
  }, []);

  // Results: sound, vibration and an automatic dismissal.
  useEffect(() => {
    const result = state.result;
    if (result === null) {
      return;
    }
    if (result.repeat !== true) {
      announce(result.tone);
    }
    const timer = setTimeout(() => {
      engine.dismissResult();
    }, RESULT_MS[result.tone]);
    return () => {
      clearTimeout(timer);
    };
  }, [engine, state.result]);

  // Camera and screen lock live as long as reading is on.
  useEffect(() => {
    const video = videoRef.current;
    if (!running || video === null) {
      return;
    }
    const scanner = new Scanner(video, (codes) => {
      void engine.scan(codes);
    });
    scannerRef.current = scanner;
    let release: () => void = () => undefined;
    let cancelled = false;
    void scanner
      .start()
      .then(async () => {
        if (cancelled) {
          return;
        }
        setTorch(scanner.torchSupported ? false : null);
        setCameraFailed(false);
        release = await keepScreenOn();
        // The scanner's own chunks are loaded now: keep them for offline use too.
        const app = await keepOffline().catch(() => false);
        setChecks((current) => ({ ...current, camera: true, app }));
      })
      .catch(() => {
        setCameraFailed(true);
        setRunning(false);
      });
    return () => {
      cancelled = true;
      scanner.stop();
      scannerRef.current = null;
      release();
    };
  }, [engine, running]);

  const manifest = state.manifest;
  const event = manifest?.event ?? state.device?.event;
  const offlineFor = state.offlineSince === null ? 0 : now - state.offlineSince;

  const synced = state.offlineSince === null && state.lastSyncOkAt !== null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-white/10 bg-[#0b0a12]/85 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="size-7" />
            <h1 className="truncate text-lg font-bold tracking-tight">{event?.name ?? t.title}</h1>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold whitespace-nowrap tabular-nums">
            {t.entries(state.entryCount)}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/70" aria-live="polite">
          <span className={`inline-flex items-center gap-1.5 ${synced ? "text-emerald-300" : "text-amber-300"}`}>
            {synced ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
            {syncLabel(state, now)}
          </span>
          <span aria-hidden>·</span>
          <span>{state.device?.deviceName}</span>
          {state.pending > 0 && (
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-200">{t.pending(state.pending)}</span>
          )}
        </p>
        {state.offlineSince !== null && offlineFor > OFFLINE_WARNING_MS && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-black">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.oneLineOffline}
          </p>
        )}
        {state.storageFailed && <p className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold">{t.storageError}</p>}
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className={`relative w-full max-w-md ${running ? "" : "hidden"}`}>
          <video ref={videoRef} className="aspect-square w-full rounded-3xl bg-black object-cover" muted playsInline />
          <div aria-hidden className="pointer-events-none absolute inset-[14%]">
            <span className="absolute top-0 left-0 size-10 rounded-tl-2xl border-t-4 border-l-4 border-white/90" />
            <span className="absolute top-0 right-0 size-10 rounded-tr-2xl border-t-4 border-r-4 border-white/90" />
            <span className="absolute bottom-0 left-0 size-10 rounded-bl-2xl border-b-4 border-l-4 border-white/90" />
            <span className="absolute right-0 bottom-0 size-10 rounded-br-2xl border-r-4 border-b-4 border-white/90" />
            <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-[#7c66ff] shadow-[0_0_16px_4px_rgba(124,102,255,0.6)]" />
          </div>
          <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white/85 drop-shadow">{t.scanHint}</p>
        </div>
        {cameraFailed && <p role="alert" className="w-full max-w-md rounded-xl bg-red-500/15 px-3 py-2 text-center text-red-300">{t.cameraError}</p>}
        <div className="flex w-full max-w-md gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={state.manifest === null}
            onClick={() => {
              if (!running) {
                unlockAudio();
              }
              setRunning(!running);
            }}
          >
            {running ? <Pause aria-hidden /> : <ScanLine aria-hidden />}
            {running ? t.stop : t.start}
          </button>
          {running && torch !== null && (
            <button
              type="button"
              className={secondaryClass}
              onClick={() => {
                const next = !torch;
                void scannerRef.current?.setTorch(next).then(() => {
                  setTorch(next);
                });
              }}
            >
              {torch ? <FlashlightOff aria-hidden /> : <Flashlight aria-hidden />}
              {torch ? t.torchOff : t.torchOn}
            </button>
          )}
        </div>
        {!running && (
          <Readiness
            app={checks.app}
            dataAt={manifest?.syncedAt ?? null}
            camera={checks.camera}
            storage={checks.storage}
            testScan={state.testScanDone}
          />
        )}
      </div>

      {state.checking && state.result === null && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-neutral-800 text-4xl font-bold">
          <span className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-hidden />
          {t.checking}
        </div>
      )}
      {state.result !== null && (
        <Result
          view={state.result}
          onDismiss={() => {
            engine.dismissResult();
          }}
        />
      )}
    </div>
  );
}

function syncLabel(state: DoorState, now: number): string {
  if (state.offlineSince !== null) {
    return t.offlineFor(Math.floor((now - state.offlineSince) / 60_000));
  }
  if (state.lastSyncOkAt === null) {
    return t.neverSynced;
  }
  return t.syncedAgo(Math.max(0, Math.floor((now - state.lastSyncOkAt) / 1000)));
}

function Readiness(props: { app: boolean; dataAt: number | null; camera: boolean; storage: boolean; testScan: boolean }) {
  const r = t.readiness;
  const items: [boolean, string][] = [
    [props.app, r.app],
    [props.dataAt !== null, props.dataAt === null ? r.noData : r.data(clockTime(props.dataAt))],
    [props.camera, r.camera],
    [props.storage, r.storage],
    [props.testScan, r.testScan],
  ];
  const done = items.filter(([ok]) => ok).length;
  return (
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-4" aria-label={r.title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{r.title}</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${done === items.length ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/70"}`}
        >
          {r.progress(done, items.length)}
        </span>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {items.map(([ok, label]) => (
          <li key={label} data-ok={ok} className="flex items-start gap-2.5">
            {ok ? (
              <CheckCircle2 className="mt-px size-[18px] shrink-0 text-emerald-400" aria-hidden />
            ) : (
              <Circle className="mt-px size-[18px] shrink-0 text-amber-300/80" aria-hidden />
            )}
            <span className={ok ? "text-white/90" : "text-white/60"}>{label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-white/55">{r.hint}</p>
    </section>
  );
}

const TONE_CLASS = {
  ok: "bg-[#16a34a] text-white",
  bad: "bg-[#c81e1e] text-white",
  warn: "bg-[#f5b70b] text-black",
} as const;

const TONE_ICON = { ok: CheckCircle2, bad: XCircle, warn: AlertTriangle } as const;

function Result({ view, onDismiss }: { view: ResultView; onDismiss: () => void }) {
  const Icon = TONE_ICON[view.tone];
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 p-6 text-center ${TONE_CLASS[view.tone]}`}
      role="alert"
      data-tone={view.tone}
    >
      <Icon className="size-24 animate-pop" strokeWidth={2.25} aria-hidden />
      <span className="text-5xl leading-tight font-black tracking-tight">{view.title}</span>
      {view.number !== null && <span className="font-mono text-4xl font-bold">{view.number}</span>}
      {view.detail !== null && <span className="text-2xl">{view.detail}</span>}
      {view.seller !== null && <span className="text-xl opacity-90">{view.seller}</span>}
      <span className="mt-8 rounded-full bg-black/15 px-4 py-1.5 text-sm font-medium opacity-90">{t.tapToContinue}</span>
    </button>
  );
}
