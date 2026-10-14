"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Flashlight,
  FlashlightOff,
  History,
  MoreVertical,
  Pause,
  ScanLine,
  Store,
  UsersRound,
  Volume2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";

import { LogoMark } from "@/components/brand";
import { GuestList } from "@/components/portaria/guest-list";
import { RecentScans } from "@/components/portaria/recent-scans";

import { Scanner } from "@/portaria/camera";
import { clockNow, serverClockNow, subscribeClock } from "@/portaria/clock";
import { DoorApiError } from "@/portaria/client";
import { DoorEngine, type DoorState } from "@/portaria/engine";
import { announce, rehearseFeedback, unlockAudio } from "@/portaria/feedback";
import { accessTokenFromHash, clearHash, noAccessToken, subscribeHash } from "@/portaria/hash";
import { inkFor } from "@/lib/design-rules";
import { money } from "@/lib/format";
import { sessionLabel } from "@/lib/series";
import { HOLD_MS, OFFLINE_WARNING_MS, canRehearse, clockTime, dismissPolicy, type ResultView } from "@/portaria/logic";
import { cameraGranted, keepOffline, keepScreenOn, persistStorage } from "@/portaria/offline";
import { errors as errorsTexts, portaria as portariaTexts } from "@/texts/pt-BR";

const t = portariaTexts;

/** Each result object gets its own key, so a new (or repeated) result restarts its timer. */
const resultKeys = new WeakMap<ResultView, number>();
let nextResultKey = 0;
function resultKey(view: ResultView): number {
  let key = resultKeys.get(view);
  if (key === undefined) {
    nextResultKey += 1;
    key = nextResultKey;
    resultKeys.set(view, key);
  }
  return key;
}

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
      {state.phase === "failed" && <Centered>{errorsTexts.generic}</Centered>}
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
    const messages: Readonly<Record<string, string>> = errorsTexts;
    return error.offline ? errorsTexts.network : (messages[error.code] ?? errorsTexts.generic);
  }
  return errorsTexts.generic;
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
          autoComplete="off"
          enterKeyHint="go"
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
  const [showGuests, setShowGuests] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rehearsal, setRehearsal] = useState({ sound: false, torch: false });
  const now = useSyncExternalStore(subscribeClock, clockNow, serverClockNow);

  // Readiness checks that need no user gesture.
  useEffect(() => {
    void Promise.all([keepOffline().catch(() => false), cameraGranted(), persistStorage()]).then(
      ([app, camera, storage]) => {
        setChecks({ app, camera, storage });
      },
    );
  }, []);

  // Results: sound and vibration (the result screen itself decides when it leaves).
  useEffect(() => {
    const result = state.result;
    if (result !== null && result.repeat !== true) {
      announce(result.tone);
    }
  }, [state.result]);

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
  const hasGuests = (manifest?.guests?.length ?? 0) > 0;
  const rehearsing = state.rehearsing;

  const startRehearsal = () => {
    setMenuOpen(false);
    setRehearsal({ sound: false, torch: false });
    engine.startRehearsal();
  };
  const toggleTorch = () => {
    const next = !(torch ?? false);
    void scannerRef.current?.setTorch(next).then(() => {
      setTorch(next);
      setRehearsal((current) => ({ ...current, torch: true }));
    });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {rehearsing && (
        <div
          role="status"
          className="sticky top-0 z-20 bg-amber-400 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-center text-sm font-black tracking-wide text-black"
        >
          {t.rehearsal.banner}
        </div>
      )}
      <header
        className={`sticky z-10 flex flex-col gap-2 border-b border-white/10 bg-[#0b0a12]/85 px-4 pb-3 backdrop-blur-xl ${rehearsing ? "top-[calc(2.25rem+env(safe-area-inset-top))] pt-3" : "top-0 pt-[max(0.75rem,env(safe-area-inset-top))]"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="size-7" />
            <h1 className="truncate text-lg font-bold tracking-tight">{event?.name ?? t.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* This phone's latest scans, to look back at a result that went by. */}
            <button
              type="button"
              aria-label={t.entriesButton(t.entries(state.entryCount))}
              aria-haspopup="dialog"
              onClick={() => {
                setMenuOpen(false);
                setShowRecent(true);
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold whitespace-nowrap tabular-nums transition active:scale-[0.97] active:bg-white/20"
            >
              <History className="size-4 text-white/70" aria-hidden />
              {t.entries(state.entryCount)}
            </button>
            {!rehearsing && (
              <button
                type="button"
                aria-label={t.menu}
                aria-expanded={menuOpen}
                onClick={() => {
                  setMenuOpen(!menuOpen);
                }}
                className="-mr-2 flex size-11 items-center justify-center rounded-xl text-white/80 transition active:bg-white/10"
              >
                <MoreVertical className="size-5" aria-hidden />
              </button>
            )}
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/70" aria-live="polite">
          <span className={`inline-flex items-center gap-1.5 ${synced ? "text-emerald-300" : "text-amber-300"}`}>
            {synced ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
            {syncLabel(state, now)}
          </span>
          <span aria-hidden>·</span>
          <span>{state.device?.deviceName}</span>
          {/* One of several dates (ADR 0077): which session this phone lets in. */}
          {event?.inSeries === true && <span className="basis-full font-semibold text-white">{sessionLabel(event.startsAt)}</span>}
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
        {/* Canceled by the organizer (ADR 0065): the door keeps reading, the organizer decides. */}
        {event?.canceledAt != null && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.canceledBanner}
          </p>
        )}
        {state.boxOffice !== null && !rehearsing && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white/[0.06] px-3 py-2 text-sm">
            <Store className="size-4 shrink-0 text-emerald-300" aria-hidden />
            <span className="font-semibold">{t.boxOffice.title}</span>
            <span className="text-white/75 tabular-nums">{t.boxOffice.mine(state.boxOffice.mine.count, boxOfficeAmount(state.boxOffice.mine))}</span>
            <span className="text-white/50" aria-hidden>
              ·
            </span>
            <span className="text-white/75 tabular-nums">{t.boxOffice.all(state.boxOffice.all.count, boxOfficeAmount(state.boxOffice.all))}</span>
          </p>
        )}
      </header>

        {menuOpen && (
          <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => { setMenuOpen(false); }} />
          <div className="fixed top-[calc(3.75rem+env(safe-area-inset-top))] right-3 z-30 flex w-64 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17151f] py-1 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowGuests(true);
              }}
              className="flex min-h-12 items-center gap-3 px-4 text-left active:bg-white/10"
            >
              <UsersRound className="size-5 text-white/70" aria-hidden />
              <span className="font-semibold">{t.guests.title}</span>
            </button>
            {/* Rehearsal stays out of the way of the real work (ADR 0067): last, quiet, and gone
                once the first ticket entered. */}
            {canRehearse(state.entryCount, rehearsing) && (
              <button
                type="button"
                onClick={startRehearsal}
                className="mt-1 flex min-h-12 items-center gap-3 border-t border-white/10 px-4 py-2 text-left text-white/70 active:bg-white/10"
              >
                <ClipboardCheck className="size-5 shrink-0 text-white/45" aria-hidden />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{t.rehearsal.start}</span>
                  <span className="text-xs text-white/50">{t.rehearsal.startHint}</span>
                </span>
              </button>
            )}
          </div>
          </>
        )}
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
          <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white/85 drop-shadow">
            {rehearsing ? t.rehearsal.readHint : t.scanHint}
          </p>
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
            <button type="button" className={secondaryClass} onClick={toggleTorch}>
              {torch ? <FlashlightOff aria-hidden /> : <Flashlight aria-hidden />}
              {torch ? t.torchOff : t.torchOn}
            </button>
          )}
          {!rehearsing && hasGuests && (
            <button
              type="button"
              className={secondaryClass.replace("w-full", "w-auto shrink-0 px-5")}
              onClick={() => {
                setShowGuests(true);
              }}
            >
              <UsersRound aria-hidden />
              <span className={running && torch !== null ? "sr-only" : ""}>{t.guests.open}</span>
            </button>
          )}
        </div>
        {rehearsing ? (
          <RehearsalPanel
            checks={{ ...rehearsal, read: state.rehearsalRead }}
            torch={running ? torch !== null : null}
            onSound={() => {
              rehearseFeedback();
              setRehearsal((current) => ({ ...current, sound: true }));
            }}
            onTorch={toggleTorch}
            onFinish={(done) => {
              setRunning(false);
              void engine.finishRehearsal(done);
            }}
          />
        ) : (
          !running && (
            <Readiness
              app={checks.app}
              dataAt={manifest?.syncedAt ?? null}
              camera={checks.camera}
              storage={checks.storage}
              testScan={state.testScanDone}
            />
          )
        )}
      </div>

      {showRecent && (
        <RecentScans
          engine={engine}
          state={state}
          onClose={() => {
            setShowRecent(false);
          }}
        />
      )}
      {state.checking && state.result === null && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-neutral-800 text-4xl font-bold">
          <span className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-hidden />
          {t.checking}
        </div>
      )}
      {state.result !== null && (
        <Result
          key={resultKey(state.result)}
          view={state.result}
          onDismiss={(byUser) => {
            engine.dismissResult(byUser);
          }}
          onOverride={() => {
            void engine.admitAnyway();
          }}
        />
      )}
      {showGuests && (
        <GuestList
          engine={engine}
          state={state}
          now={now}
          onClose={() => {
            setShowGuests(false);
          }}
        />
      )}
    </div>
  );
}

function boxOfficeAmount(totals: { cents: number; unpriced: number }): string {
  return totals.unpriced > 0 && totals.cents === 0 ? t.boxOffice.unpriced : money(totals.cents);
}

/** Rehearsal (ADR 0067): read a sample, hear the sounds, try the torch, then finish. */
function RehearsalPanel(props: {
  checks: { read: boolean; sound: boolean; torch: boolean };
  /** Torch available (`null`: the camera is not on yet). */
  torch: boolean | null;
  onSound: () => void;
  onTorch: () => void;
  onFinish: (done: boolean) => void;
}) {
  const r = t.rehearsal;
  const items: [boolean, string][] = [
    [props.checks.read, r.readCheck],
    [props.checks.sound, r.sound],
    [props.checks.torch || props.torch === false, props.torch === false ? r.noTorch : props.torch === null ? r.torchNeedsCamera : r.torch],
  ];
  return (
    <section className="w-full max-w-md rounded-3xl border border-amber-300/30 bg-amber-300/[0.06] p-4" aria-label={r.title}>
      <h2 className="font-semibold">{r.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-white/70">{r.intro}</p>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
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
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className={`${secondaryClass} text-base`} onClick={props.onSound}>
          <Volume2 aria-hidden />
          {r.soundButton}
        </button>
        <button type="button" className={`${secondaryClass} text-base`} disabled={props.torch !== true} onClick={props.onTorch}>
          <Flashlight aria-hidden />
          {r.torchButton}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          className={buttonClass}
          disabled={!props.checks.read}
          onClick={() => {
            props.onFinish(true);
          }}
        >
          <CheckCircle2 aria-hidden />
          {r.finish}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-2xl px-4 font-semibold text-white/75 active:bg-white/10"
          onClick={() => {
            props.onFinish(false);
          }}
        >
          {r.cancel}
        </button>
      </div>
    </section>
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

function Readiness(props: {
  app: boolean;
  dataAt: number | null;
  camera: boolean;
  storage: boolean;
  testScan: boolean;
}) {
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
  ok: "bg-[#15803d] text-white",
  bad: "bg-[#c81e1e] text-white",
  warn: "bg-[#f5b70b] text-black",
} as const;

const TONE_ICON = { ok: CheckCircle2, bad: XCircle, warn: AlertTriangle } as const;

/** How often the countdown of a result that leaves by itself moves. */
const TICK_MS = 100;

/**
 * A result. A plain "enter" goes back to the camera by itself, with a visible countdown that
 * stops while the screen is held (and, after a long press, until the next tap); anything else
 * stays until tapped (`dismissPolicy`).
 */
function Result({ view, onDismiss, onOverride }: { view: ResultView; onDismiss: (byUser: boolean) => void; onOverride: () => void }) {
  const Icon = TONE_ICON[view.tone];
  const policy = dismissPolicy(view);
  const autoMs = policy.auto ? policy.ms : null;
  const [held, setHeld] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pressedAt = useRef<number | null>(null);
  const skipClick = useRef(false);
  const dismissed = useRef(false);
  const counting = autoMs !== null && !held && !pinned;

  useEffect(() => {
    if (!counting) {
      return;
    }
    const timer = setInterval(() => {
      setElapsed((current) => current + TICK_MS);
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [counting]);

  useEffect(() => {
    if (autoMs !== null && counting && elapsed >= autoMs && !dismissed.current) {
      dismissed.current = true;
      onDismiss(false);
    }
  }, [autoMs, counting, elapsed, onDismiss]);

  const release = () => {
    if (pressedAt.current !== null && performance.now() - pressedAt.current >= HOLD_MS && autoMs !== null) {
      // A long press means "let me read": keep it until the next tap.
      setPinned(true);
      skipClick.current = true;
    }
    pressedAt.current = null;
    setHeld(false);
  };
  const left = autoMs === null ? 0 : Math.max(0, 1 - elapsed / autoMs);
  const hint = autoMs === null ? t.tapToContinue : held || pinned ? t.result.held : t.result.autoHint;

  return (
    <div
      className={`fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 overflow-x-hidden overflow-y-auto p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center [&>*]:max-w-full ${TONE_CLASS[view.tone]}`}
      role="alert"
      data-tone={view.tone}
    >
      {/* The whole screen dismisses (holding it stops the countdown); the override button sits above it. */}
      <button
        type="button"
        onPointerDown={() => {
          pressedAt.current = performance.now();
          setHeld(true);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          dismissed.current = true;
          onDismiss(true);
        }}
        aria-label={t.tapToContinue}
        className="absolute inset-0 cursor-default touch-manipulation select-none [-webkit-touch-callout:none]"
      />
      {view.repeat === true && (
        <span className="pointer-events-none relative rounded-full bg-black/25 px-3 py-1 text-sm font-semibold">{t.result.repeat}</span>
      )}
      {view.rehearsal === true && (
        <span className="pointer-events-none relative rounded-full bg-black/80 px-4 py-1.5 text-sm font-black tracking-wide text-amber-300">
          {t.rehearsal.note}
        </span>
      )}
      <Icon className="pointer-events-none relative size-24 animate-pop" strokeWidth={2.25} aria-hidden />
      <span className="pointer-events-none relative text-[clamp(2.25rem,12vw,3rem)] leading-tight font-black tracking-tight text-balance">{view.title}</span>
      {view.number !== null && <span className="pointer-events-none relative font-mono text-4xl font-bold">{view.number}</span>}
      {view.charge !== undefined && view.charge !== null && (
        <span className="pointer-events-none relative rounded-2xl bg-white px-5 py-3 text-[clamp(1.5rem,7vw,1.875rem)] leading-tight font-black text-balance text-[#14532d] shadow-lg">
          {view.charge}
        </span>
      )}
      {view.detail !== null && <span className="pointer-events-none relative text-2xl text-balance">{view.detail}</span>}
      {(view.category !== null || view.seat !== null) && (
        <span className="pointer-events-none relative flex flex-wrap items-center justify-center gap-3">
          {view.category !== null && (
            <span
              className="rounded-2xl px-5 py-2 text-3xl font-black tracking-wide uppercase shadow-lg ring-4 ring-white/70"
              style={{ backgroundColor: view.category.color, color: inkFor(view.category.color) }}
            >
              {view.category.name}
            </span>
          )}
          {view.seat !== null && <span className="rounded-2xl bg-black/15 px-4 py-2 text-2xl font-bold">{view.seat}</span>}
        </span>
      )}
      {view.seller !== null && <span className="pointer-events-none relative text-xl opacity-90">{view.seller}</span>}
      {view.override === true && (
        <span className="relative mt-4 flex w-full max-w-sm flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onOverride}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-black px-4 text-lg font-bold text-white shadow-lg transition active:scale-[0.98]"
          >
            {t.result.letInAnyway}
          </button>
          <span className="text-sm font-medium opacity-80">{t.result.letInAnywayHint}</span>
        </span>
      )}
      <span
        className={`pointer-events-none relative mt-6 overflow-hidden rounded-full px-5 py-2 font-semibold ${autoMs === null ? "bg-black/25 text-base" : "bg-black/15 text-sm"}`}
      >
        {/* The countdown: the bar empties as the screen goes back to the camera. */}
        {autoMs !== null && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-black/25 transition-[width] duration-100 ease-linear"
            style={{ width: `${String(left * 100)}%` }}
          />
        )}
        <span className="relative">{hint}</span>
      </span>
    </div>
  );
}
