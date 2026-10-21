"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock3,
  Flag,
  Flashlight,
  FlashlightOff,
  History,
  LogIn,
  LogOut,
  MoreVertical,
  Pause,
  ScanLine,
  SearchCheck,
  Store,
  UsersRound,
  Volume2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";

import { LogoMark } from "@/components/brand";
import { EndOfEvent } from "@/components/portaria/end-of-event";
import { GuestList } from "@/components/portaria/guest-list";
import { RecentScans } from "@/components/portaria/recent-scans";
import { Result } from "@/components/portaria/result-screen";

import { Scanner } from "@/portaria/camera";
import { useClock } from "@/portaria/clock";
import { DoorApiError } from "@/portaria/client";
import { DoorEngine, type DoorMode, type DoorState } from "@/portaria/engine";
import { announce, rehearseFeedback, unlockAudio } from "@/portaria/feedback";
import { accessTokenFromHash, clearHash, noAccessToken, subscribeHash } from "@/portaria/hash";
import { capacityState, doorOccupied } from "@/lib/capacity";
import { currentDay, dayLabel } from "@/lib/event-days";
import { money } from "@/lib/format";
import { sessionLabel } from "@/lib/series";
import { OFFLINE_WARNING_MS, canRehearse, clockTime, dismissPolicy, doorWords, type ResultView } from "@/portaria/logic";
import { cameraGranted, keepOffline, keepScreenOn, persistStorage, whenIdle } from "@/portaria/offline";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";
import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

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

  // A phone registered before knows the kind of its event while it loads (ADR 0086).
  const words = doorWords((state.manifest?.event ?? state.device?.event)?.kind);

  return (
    <main className="flex min-h-dvh flex-col bg-[#0c0c10] bg-[radial-gradient(90%_45%_at_50%_0%,rgba(255,255,255,0.06),transparent)] text-neutral-50">
      {state.phase === "loading" && <Centered>{words.loading}</Centered>}
      {state.phase === "failed" && <Centered>{errorsTexts.generic}</Centered>}
      {state.phase === "revoked" && <Revoked engine={engine} forgetConfirm={words.forgetConfirm} />}
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
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-lg font-bold text-[#0c0c10] shadow-lg transition active:scale-[0.98] disabled:opacity-40 [&_svg]:size-5";
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

function Revoked({ engine, forgetConfirm }: { engine: DoorEngine; forgetConfirm: string }) {
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
          if (window.confirm(forgetConfirm)) {
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
  const [showEnd, setShowEnd] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rehearsal, setRehearsal] = useState({ sound: false, torch: false });
  /** The worker reported every resource of the page cached (no need to ask again). */
  const appKept = useRef(false);
  const clock = useClock();

  // Readiness checks that need no user gesture. The worker's precache (invariant 8) waits for an
  // idle moment: it must happen before the phone goes offline, not before the first manifest.
  useEffect(() => {
    void Promise.all([cameraGranted(), persistStorage()]).then(([camera, storage]) => {
      setChecks((current) => ({ ...current, camera, storage }));
    });
    return whenIdle(() => {
      void keepOffline()
        .catch(() => false)
        .then((app) => {
          appKept.current = app;
          setChecks((current) => ({ ...current, app }));
        });
    });
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
        // The scanner's own chunks are loaded now: keep them for offline use too, unless the
        // worker already had everything.
        const app = appKept.current || (await keepOffline().catch(() => false));
        appKept.current = app;
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

  // A result that waits for a tap holds the screen: the camera reads at a slower pace meanwhile.
  const result = state.result;
  const idle = result !== null && !dismissPolicy(result).auto;
  useEffect(() => {
    scannerRef.current?.setIdle(idle);
  }, [idle, running]);

  const manifest = state.manifest;
  const event = manifest?.event ?? state.device?.event;
  // A checkpoint's phone (ADR 0092): no guest list, no exit, its own banner and counter.
  const checkpoint = engine.checkpoint;
  const hasGuests = (manifest?.guests?.length ?? 0) > 0 && checkpoint === null;
  const rehearsing = state.rehearsing;
  // Exit and return (ADR 0083): this phone may read the exit while the event allows it.
  const reentry = manifest?.event.reentry === true && checkpoint === null;
  const mode: DoorMode = engine.mode;
  const exitMode = mode === "exit";
  const checkMode = mode === "check";
  // Entrance (or the checkpoint), exit with re-entry, and check (ADR 0090) for tickets.
  const modes: DoorMode[] = ["entrance", ...(reentry ? (["exit"] as const) : []), ...(engine.canCheck ? (["check"] as const) : [])];
  const banner = rehearsing
    ? { text: t.rehearsal.banner, className: "bg-amber-400 text-black" }
    : checkMode
      ? { text: t.mode.checkBanner, className: "bg-[#0f766e] text-white" }
      : exitMode
        ? { text: t.mode.exitBanner, className: "bg-[#2563eb] text-white" }
        : checkpoint !== null
          ? { text: t.checkpoint.banner(checkpoint.name), className: "bg-[#6d28d9] text-white" }
          : null;
  // A stall that takes fichas, for consumption tokens (ADR 0084).
  const words = doorWords(event?.kind);
  // With re-entry, who is inside now says more than how many ever entered; in an event of several
  // days, today's (ADR 0091); at a checkpoint, its uses.
  const counter =
    checkpoint !== null
      ? state.todayCount === null
        ? t.checkpoint.uses(state.entryCount)
        : t.checkpoint.usesToday(state.todayCount)
      : reentry
        ? t.insideCount(state.insideCount)
        : state.todayCount === null
          ? words.entries(state.entryCount)
          : t.entriesToday(state.todayCount);
  const frame = checkMode ? "border-[#2dd4bf]" : exitMode ? "border-[#60a5fa]" : "border-white/90";
  const scanLine = checkMode
    ? "bg-[#2dd4bf] shadow-[0_0_16px_4px_rgba(45,212,191,0.6)]"
    : exitMode
      ? "bg-[#60a5fa] shadow-[0_0_16px_4px_rgba(96,165,250,0.6)]"
      : "bg-[#7c66ff] shadow-[0_0_16px_4px_rgba(124,102,255,0.6)]";
  const days = event?.days ?? [];
  // The venue's capacity (ADR 0110): the entrance shows how many places are left.
  const limit = checkpoint === null ? ((event?.capacity as number | null | undefined) ?? null) : null;
  const capacity =
    limit === null
      ? null
      : (() => {
          const occupied = doorOccupied(
            { reentry, entryCount: state.entryCount, todayCount: state.todayCount, insideCount: state.insideCount },
            state.arrivals,
            days,
            clock + (manifest?.offsetMs ?? 0),
          );
          return { occupied, limit, ...capacityState(occupied, limit, event?.capacityWarnPercent || 90) };
        })();

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
      {state.exitEnded && (
        <button
          type="button"
          role="alert"
          onClick={() => {
            engine.dismissExitEnded();
          }}
          className="relative z-30 bg-amber-400 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-center text-sm font-bold text-black"
        >
          {t.mode.exitEnded}
        </button>
      )}
      {banner !== null && (
        <div
          role="status"
          className={`sticky top-0 z-20 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-center text-sm font-black tracking-wide ${banner.className}`}
        >
          {banner.text}
        </div>
      )}
      <header
        className={`sticky z-10 flex flex-col gap-2 border-b border-white/10 bg-[#0c0c10]/85 px-4 pb-3 backdrop-blur-xl ${banner !== null ? "top-[calc(2.25rem+env(safe-area-inset-top))] pt-3" : "top-0 pt-[max(0.75rem,env(safe-area-inset-top))]"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="size-7" />
            <h1 className="truncate text-lg font-bold tracking-tight">{event?.name ?? words.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* This phone's latest scans, to look back at a result that went by. */}
            <button
              type="button"
              aria-label={t.entriesButton(counter)}
              aria-haspopup="dialog"
              onClick={() => {
                setMenuOpen(false);
                setShowRecent(true);
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold whitespace-nowrap tabular-nums transition active:scale-[0.97] active:bg-white/20"
            >
              <History className="size-4 text-white/70" aria-hidden />
              {counter}
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
          <SyncStatus offlineSince={state.offlineSince} lastSyncOkAt={state.lastSyncOkAt} />
          <span aria-hidden>·</span>
          <span>{state.device?.deviceName}</span>
          {/* One of several dates (ADR 0077): which session this phone lets in. */}
          {event?.inSeries === true && <span className="basis-full font-semibold text-white">{sessionLabel(event.startsAt)}</span>}
          {/* An event of several days (ADR 0091): the day the door is on. */}
          {days.length > 1 && <DayLine days={days} offsetMs={manifest?.offsetMs ?? 0} />}
          {state.pending > 0 && (
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-200">{t.pending(state.pending)}</span>
          )}
        </p>
        {modes.length > 1 && !rehearsing && (
          <ModeSwitch
            mode={mode}
            modes={modes}
            checkpoint={checkpoint !== null}
            onChange={(next) => {
              void engine.setMode(next);
            }}
          />
        )}
        {/* The door already uses the server's clock; a phone clock far off still confuses people. */}
        {days.length > 1 && manifest !== null && Math.abs(manifest.offsetMs) > CLOCK_SKEW_MS && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-100">
            <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.day.clockSkew(Math.round(Math.abs(manifest.offsetMs) / 60_000))}
          </p>
        )}
        {state.offlineSince !== null && <OfflineWarning text={words.oneLineOffline} offlineSince={state.offlineSince} />}
        {state.storageFailed && <p className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold">{t.storageError}</p>}
        {/* Canceled by the organizer (ADR 0065): the door keeps reading, the organizer decides. */}
        {event?.canceledAt != null && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.canceledBanner}
          </p>
        )}
        {capacity !== null && !rehearsing && (
          <p
            role="status"
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${capacity.level === "full" ? "bg-red-600 text-white" : capacity.level === "near" ? "bg-amber-400 text-black" : "bg-white/[0.06] text-white"}`}
          >
            <span className="flex items-center gap-2">
              <UsersRound className="size-4 shrink-0" aria-hidden />
              {capacity.level === "full" ? t.capacity.full : t.capacity.left(capacity.left)}
            </span>
            <span className="shrink-0 tabular-nums opacity-80">{t.capacity.of(capacity.occupied, capacity.limit)}</span>
          </p>
        )}
        {state.boxOffice !== null && !rehearsing && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white/[0.06] px-3 py-2 text-sm">
            <Store className="size-4 shrink-0 text-emerald-300" aria-hidden />
            <span className="font-semibold">{words.boxOffice.title}</span>
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
          <div className="fixed top-[calc(3.75rem+env(safe-area-inset-top))] right-3 z-30 flex w-64 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#18181d] py-1 shadow-2xl">
            {checkpoint === null && (
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
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowEnd(true);
              }}
              className="flex min-h-12 items-center gap-3 px-4 py-2 text-left active:bg-white/10"
            >
              <Flag className="size-5 shrink-0 text-white/70" aria-hidden />
              <span className="flex flex-col">
                <span className="font-semibold">{t.end.menu}</span>
                <span className="text-xs text-white/50">{t.end.menuHint}</span>
              </span>
            </button>
            {/* Rehearsal stays out of the way of the real work (ADR 0067): last, quiet, and gone
                once the first ticket entered. */}
            {canRehearse(state.entryCount, rehearsing) && !checkMode && (
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
      <div className="relative flex flex-1 flex-col items-center gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Not reading yet: one big target that opens the camera, where the camera will be. */}
        {!running && (
          <button
            type="button"
            aria-label={t.start}
            disabled={state.manifest === null}
            onClick={() => {
              unlockAudio();
              setRunning(true);
            }}
            className="flex w-full max-w-md flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-10 transition active:scale-[0.99] active:bg-white/[0.08] disabled:opacity-40"
          >
            <span className="flex size-20 items-center justify-center rounded-full bg-white text-[#0c0c10] shadow-lg">
              <ScanLine className="size-9" aria-hidden />
            </span>
            <span className="text-2xl font-bold tracking-tight">{t.start}</span>
            <span className="text-sm text-white/60">{rehearsing ? words.rehearsal.readHint : checkMode ? t.mode.checkHint : exitMode ? t.mode.exitHint : words.scanHint}</span>
          </button>
        )}
        <div className={`relative w-full max-w-md ${running ? "" : "hidden"}`}>
          <video ref={videoRef} className="aspect-square w-full rounded-3xl bg-black object-cover" muted playsInline />
          <div aria-hidden className="pointer-events-none absolute inset-[14%]">
            <span className={`absolute top-0 left-0 size-10 rounded-tl-2xl border-t-4 border-l-4 ${frame}`} />
            <span className={`absolute top-0 right-0 size-10 rounded-tr-2xl border-t-4 border-r-4 ${frame}`} />
            <span className={`absolute bottom-0 left-0 size-10 rounded-bl-2xl border-b-4 border-l-4 ${frame}`} />
            <span className={`absolute right-0 bottom-0 size-10 rounded-br-2xl border-r-4 border-b-4 ${frame}`} />
            <span className={`absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full ${scanLine}`} />
          </div>
          <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white/85 drop-shadow">
            {rehearsing ? words.rehearsal.readHint : checkMode ? t.mode.checkHint : exitMode ? t.mode.exitHint : words.scanHint}
          </p>
        </div>
        {cameraFailed && <p role="alert" className="w-full max-w-md rounded-xl bg-red-500/15 px-3 py-2 text-center text-red-300">{t.cameraError}</p>}
        {(running || (!rehearsing && hasGuests)) && (
          <div className="flex w-full max-w-md gap-2">
            {running && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setRunning(false);
                }}
              >
                <Pause aria-hidden />
                {t.stop}
              </button>
            )}
            {running && torch !== null && (
              <button type="button" className={secondaryClass} onClick={toggleTorch}>
                {torch ? <FlashlightOff aria-hidden /> : <Flashlight aria-hidden />}
                {torch ? t.torchOff : t.torchOn}
              </button>
            )}
            {!rehearsing && hasGuests && (
              <button
                type="button"
                className={running ? secondaryClass.replace("w-full", "w-auto shrink-0 px-5") : secondaryClass}
                onClick={() => {
                  setShowGuests(true);
                }}
              >
                <UsersRound aria-hidden />
                <span className={running && torch !== null ? "sr-only" : ""}>{t.guests.open}</span>
              </button>
            )}
          </div>
        )}
        {rehearsing ? (
          <RehearsalPanel
            texts={words.rehearsal}
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
            <>
              {checkpoint !== null && (
                <p className="flex w-full max-w-md items-start gap-2.5 rounded-2xl border border-[#a78bfa]/30 bg-[#6d28d9]/15 px-4 py-3 text-sm leading-relaxed text-white/85">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-[#c4b5fd]" aria-hidden />
                  {t.checkpoint.intro(checkpoint.name)}
                </p>
              )}
              {/* After the end (ADR 0101): the summary and what is left to send, one tap away. */}
              {event !== undefined && (
                <EndBanner
                  endsAt={event.endsAt}
                  pending={state.pending}
                  onOpen={() => {
                    setShowEnd(true);
                  }}
                />
              )}
              <Readiness
                texts={words.readiness}
                app={checks.app}
                dataAt={manifest?.syncedAt ?? null}
                camera={checks.camera}
                storage={checks.storage}
                testScan={state.testScanDone}
              />
            </>
          )
        )}
      </div>

      {showEnd && (
        <EndOfEvent
          engine={engine}
          state={state}
          onClose={() => {
            setShowEnd(false);
          }}
        />
      )}
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
          onAction={() => {
            void engine.act();
          }}
        />
      )}
      {showGuests && (
        <GuestList
          engine={engine}
          state={state}
          onClose={() => {
            setShowGuests(false);
          }}
        />
      )}
    </div>
  );
}

/** After the event's end (ADR 0101): the summary and what is left to send, one tap away. */
function EndBanner({ endsAt, pending, onOpen }: { endsAt: string; pending: number; onOpen: () => void }) {
  const now = useClock();
  if (now <= Date.parse(endsAt)) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left text-sm font-medium active:bg-white/10"
    >
      <Flag className="size-5 shrink-0 text-emerald-300" aria-hidden />
      <span className="flex-1">{t.end.banner}</span>
      {pending > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-black tabular-nums">{pending}</span>}
    </button>
  );
}

/** A phone clock this far from the server's gets a warning in an event of several days. */
const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Entrance (or the checkpoint), exit (ADR 0083) and check (ADR 0090): a switch big enough for a
 * thumb in the dark. The exit is blue and the check teal everywhere (switch, banner, camera frame)
 * so neither is ever mistaken for the entrance.
 */
function ModeSwitch(props: { mode: DoorMode; modes: readonly DoorMode[]; checkpoint: boolean; onChange: (mode: DoorMode) => void }) {
  const looks = {
    entrance: props.checkpoint
      ? { label: t.mode.use, Icon: BadgeCheck, on: "bg-white text-[#0c0c10] shadow" }
      : { label: t.mode.entrance, Icon: LogIn, on: "bg-white text-[#0c0c10] shadow" },
    exit: { label: t.mode.exit, Icon: LogOut, on: "bg-[#2563eb] text-white shadow" },
    check: { label: t.mode.check, Icon: SearchCheck, on: "bg-[#0f766e] text-white shadow" },
  } as const;
  return (
    <div
      role="radiogroup"
      aria-label={t.mode.label}
      className={`grid gap-1 rounded-2xl bg-white/[0.07] p-1 ${props.modes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
    >
      {props.modes.map((value) => {
        const { label, Icon, on } = looks[value];
        const active = value === props.mode;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              props.onChange(value);
            }}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-1 text-base font-bold transition active:scale-[0.98] ${active ? on : "text-white/70 active:bg-white/10"}`}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Sábado 21/11 · dia 1 de 2", by the server's clock: it turns at the border between days. */
function DayLine({ days, offsetMs }: { days: readonly { position: number; startsAt: string; endsAt: string }[]; offsetMs: number }) {
  // The clock ticks every second once mounted; until then the first day stands in.
  const now = useClock();
  const today = now === 0 ? (days[0]?.position ?? null) : currentDay(days, now + offsetMs);
  const day = days.find((item) => item.position === today);
  if (day === undefined) {
    return null;
  }
  const label = dayLabel(day.startsAt);
  return (
    <span className="flex basis-full items-center gap-1.5 font-semibold text-white" title={t.day.hint}>
      <CalendarDays className="size-4 shrink-0 text-white/70" aria-hidden />
      {t.day.header(label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1), day.position, days.length)}
    </span>
  );
}

function boxOfficeAmount(totals: { cents: number; unpriced: number }): string {
  return totals.unpriced > 0 && totals.cents === 0 ? t.boxOffice.unpriced : money(totals.cents);
}

/** Rehearsal (ADR 0067): read a sample, hear the sounds, try the torch, then finish. */
function RehearsalPanel(props: {
  texts: typeof t.rehearsal;
  checks: { read: boolean; sound: boolean; torch: boolean };
  /** Torch available (`null`: the camera is not on yet). */
  torch: boolean | null;
  onSound: () => void;
  onTorch: () => void;
  onFinish: (done: boolean) => void;
}) {
  const r = props.texts;
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

function syncLabel(state: Pick<DoorState, "offlineSince" | "lastSyncOkAt">, now: number): string {
  if (state.offlineSince !== null) {
    return t.offlineFor(Math.floor((now - state.offlineSince) / 60_000));
  }
  if (state.lastSyncOkAt === null) {
    return t.neverSynced;
  }
  return t.syncedAgo(Math.max(0, Math.floor((now - state.lastSyncOkAt) / 1000)));
}

/** "Synced 5 s ago": the only parts of the header that follow the clock, so only they re-render. */
function SyncStatus(props: Pick<DoorState, "offlineSince" | "lastSyncOkAt">) {
  const now = useClock();
  const synced = props.offlineSince === null && props.lastSyncOkAt !== null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${synced ? "text-emerald-300" : "text-amber-300"}`}>
      {synced ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
      {syncLabel(props, now)}
    </span>
  );
}

/** Offline for a while: one phone per line, so no copy slips through two phones. */
function OfflineWarning({ text, offlineSince }: { text: string; offlineSince: number }) {
  const now = useClock();
  if (now - offlineSince <= OFFLINE_WARNING_MS) {
    return null;
  }
  return (
    <p className="flex items-start gap-2 rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-black">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

function Readiness(props: {
  texts: typeof t.readiness;
  app: boolean;
  dataAt: number | null;
  camera: boolean;
  storage: boolean;
  testScan: boolean;
}) {
  const r = props.texts;
  const items: [boolean, string][] = [
    [props.app, r.app],
    [props.dataAt !== null, props.dataAt === null ? r.noData : r.data(clockTime(props.dataAt))],
    [props.camera, r.camera],
    [props.storage, r.storage],
    [props.testScan, r.testScan],
  ];
  const done = items.filter(([ok]) => ok).length;
  const ready = done === items.length;
  // Everything done: one quiet line that still opens the list.
  return (
    <details className="group w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03]" open={!ready} aria-label={r.title}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        {ready ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden />
        ) : (
          <span className="relative size-5 shrink-0 rounded-full border-2 border-white/25" aria-hidden />
        )}
        <span className="flex-1 text-sm font-semibold">{ready ? r.ready : r.title}</span>
        <span className="text-xs font-semibold text-white/55 tabular-nums">{r.progress(done, items.length)}</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3">
        <ul className="flex flex-col gap-2 text-sm">
          {items.map(([ok, label]) => (
            <li key={label} data-ok={ok} className="flex items-start gap-2.5">
              {ok ? (
                <CheckCircle2 className="mt-px size-[18px] shrink-0 text-emerald-400" aria-hidden />
              ) : (
                <Circle className="mt-px size-[18px] shrink-0 text-white/30" aria-hidden />
              )}
              <span className={ok ? "text-white/85" : "text-white/55"}>{label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-white/45">{r.hint}</p>
      </div>
    </details>
  );
}
