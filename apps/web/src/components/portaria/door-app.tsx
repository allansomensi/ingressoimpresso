"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

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
    <main className="flex min-h-dvh flex-col bg-neutral-950 text-neutral-50">
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

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="m-auto max-w-sm p-6 text-center text-lg">{children}</div>;
}

const fieldClass = "w-full rounded-md border border-white/30 bg-black px-3 py-3 text-lg text-white";
const buttonClass = "w-full rounded-md bg-white px-4 py-3 text-lg font-bold text-black disabled:opacity-50";
const secondaryClass = "w-full rounded-md border border-white/50 px-4 py-3 text-lg font-semibold disabled:opacity-50";

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
    <form onSubmit={(event) => void submit(event)} className="m-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{t.registerTitle}</h1>
      <p className="opacity-80">{t.registerIntro}</p>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t.deviceName}</span>
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
      {error !== null && <p role="alert" className="text-red-400">{error}</p>}
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
      <p className="text-lg">{t.switchTitle(state.device?.deviceName ?? "")}</p>
      <button type="button" className={buttonClass} onClick={clearHash}>
        {t.keepDevice}
      </button>
      <button type="button" className={secondaryClass} disabled={busy || blocked} onClick={() => void switchLink()}>
        {t.useNewLink}
      </button>
      {blocked && <p className="text-amber-300">{t.switchBlocked}</p>}
      {error !== null && <p role="alert" className="text-red-400">{error}</p>}
    </div>
  );
}

function Revoked({ engine }: { engine: DoorEngine }) {
  return (
    <div className="m-auto flex w-full max-w-sm flex-col gap-4 p-6 text-center">
      <p className="text-lg">{t.revoked}</p>
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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-col gap-1 border-b border-white/15 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="truncate text-lg font-bold">{event?.name ?? t.title}</h1>
          <span className="whitespace-nowrap text-sm opacity-80">{t.entries(state.entryCount)}</span>
        </div>
        <p className="text-sm opacity-80" aria-live="polite">
          {state.device?.deviceName} · {syncLabel(state, now)}
          {state.pending > 0 && ` · ${t.pending(state.pending)}`}
        </p>
        {state.offlineSince !== null && offlineFor > OFFLINE_WARNING_MS && (
          <p className="rounded bg-amber-500 px-2 py-1 text-sm font-semibold text-black">{t.oneLineOffline}</p>
        )}
        {state.storageFailed && <p className="rounded bg-red-600 px-2 py-1 text-sm font-semibold">{t.storageError}</p>}
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-3 p-3">
        <video
          ref={videoRef}
          className={`aspect-square w-full max-w-md rounded-lg bg-black object-cover ${running ? "" : "hidden"}`}
          muted
          playsInline
        />
        {cameraFailed && <p role="alert" className="text-center text-red-400">{t.cameraError}</p>}
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
        <div className="fixed inset-0 flex items-center justify-center bg-neutral-700 text-4xl font-bold">
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
  return (
    <section className="w-full max-w-md rounded-lg border border-white/15 p-3" aria-label={r.title}>
      <h2 className="mb-2 font-semibold">{r.title}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map(([ok, label]) => (
          <li key={label} className="flex gap-2">
            <span aria-hidden className={ok ? "text-green-400" : "text-amber-300"}>
              {ok ? "✔" : "•"}
            </span>
            <span className={ok ? "" : "opacity-80"}>{label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs opacity-70">{r.hint}</p>
    </section>
  );
}

const TONE_CLASS = {
  ok: "bg-green-600 text-white",
  bad: "bg-red-700 text-white",
  warn: "bg-amber-400 text-black",
} as const;

function Result({ view, onDismiss }: { view: ResultView; onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`fixed inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center ${TONE_CLASS[view.tone]}`}
      role="alert"
      data-tone={view.tone}
    >
      <span className="text-5xl font-black leading-tight">{view.title}</span>
      {view.number !== null && <span className="font-mono text-4xl font-bold">{view.number}</span>}
      {view.detail !== null && <span className="text-2xl">{view.detail}</span>}
      {view.seller !== null && <span className="text-xl opacity-90">{view.seller}</span>}
      <span className="mt-6 text-sm opacity-80">{t.tapToContinue}</span>
    </button>
  );
}
