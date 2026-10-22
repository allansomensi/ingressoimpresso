"use client";

import type { VerifyResultDto } from "@ingressoimpresso/api-types";
import { useMutation } from "@tanstack/react-query";
import { Camera, ClipboardPaste, Flashlight, FlashlightOff, ImageUp, Lock, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert, Button, ErrorMessage, Field, Spinner, Textarea, segmentTabIndex, segmentedKeys } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { MAX_QR_TEXT, classifyPasted, pastedQr, pickScanned } from "@/lib/verify";
import type { Scanner } from "@/portaria/camera";
import { verifyPage as verifyPageTexts } from "@/texts/pt-BR/verify-page";

import { VerifyResult } from "./verify-result";

const t = verifyPageTexts;
type Mode = "camera" | "photo" | "paste";
const MODES: readonly { mode: Mode; icon: typeof Camera }[] = [
  { mode: "camera", icon: Camera },
  { mode: "photo", icon: ImageUp },
  { mode: "paste", icon: ClipboardPaste },
];
const MODE_VALUES: readonly Mode[] = MODES.map((item) => item.mode);
const CORNERS = [
  "top-0 left-0 rounded-tl-2xl border-t-4 border-l-4",
  "top-0 right-0 rounded-tr-2xl border-t-4 border-r-4",
  "bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4",
  "right-0 bottom-0 rounded-br-2xl border-r-4 border-b-4",
] as const;

type CameraState = "idle" | "starting" | "on" | "denied" | "unsupported";

const overlayButton =
  "flex size-11 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70 active:bg-black/80";

/** The live camera: the door's reader (zxing-wasm from our origin), loaded only when opened. */
function CameraReader({ onRead }: { onRead: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<Scanner | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });

  const stop = () => {
    scanner.current?.stop();
    scanner.current = null;
    setTorch({ supported: false, on: false });
  };
  useEffect(
    () => () => {
      scanner.current?.stop();
      scanner.current = null;
    },
    [],
  );

  const start = async () => {
    if (video.current === null) {
      return;
    }
    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setState("unsupported");
      return;
    }
    setState("starting");
    try {
      const { Scanner } = await import("@/portaria/camera");
      const reader = new Scanner(video.current, (found) => {
        const text = pickScanned(found);
        if (text !== null && scanner.current === reader) {
          stop();
          setState("idle");
          onRead(text);
        }
      });
      scanner.current = reader;
      await reader.start();
      setState("on");
      setTorch({ supported: reader.torchSupported, on: false });
    } catch {
      stop();
      setState("denied");
    }
  };

  const toggleTorch = async () => {
    const next = !torch.on;
    try {
      await scanner.current?.setTorch(next);
      setTorch({ supported: true, on: next });
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  const live = state === "on" || state === "starting";
  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#0e0d14] ring-1 ring-border">
        <video ref={video} className={cn("size-full object-cover", !live && "invisible")} muted playsInline />
        {live ? (
          <>
            {/* The viewfinder: four corners around the middle of the picture. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative aspect-square h-[64%]">
                {CORNERS.map((corner) => (
                  <span key={corner} className={cn("absolute size-9 border-white/90", corner)} />
                ))}
              </div>
            </div>
            {state === "starting" && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-sm font-medium text-white">
                <Spinner />
                {t.cameraStarting}
              </div>
            )}
            <div className="absolute top-3 right-3 flex gap-2">
              {torch.supported && (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  aria-label={torch.on ? t.torchOff : t.torchOn}
                  aria-pressed={torch.on}
                  className={overlayButton}
                >
                  {torch.on ? <FlashlightOff className="size-5" aria-hidden /> : <Flashlight className="size-5" aria-hidden />}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  stop();
                  setState("idle");
                }}
                aria-label={t.closeCamera}
                className={overlayButton}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(70%_70%_at_50%_40%,rgba(91,61,245,0.38),transparent)] p-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15">
              <ScanLine className="size-8" aria-hidden />
            </span>
            <p className="max-w-64 text-sm leading-relaxed text-white/75">{t.cameraHint}</p>
          </div>
        )}
      </div>
      {live && <p className="text-center text-sm text-fg-muted">{t.cameraHint}</p>}
      {state === "denied" && <Alert tone="warning">{t.cameraDenied}</Alert>}
      {state === "unsupported" && <Alert tone="warning">{t.cameraUnsupported}</Alert>}
      {!live && (
        <Button size="lg" icon={<Camera />} onClick={() => void start()}>
          {t.openCamera}
        </Button>
      )}
    </div>
  );
}

/** A photo or screenshot of the QR, read on this device. */
function PhotoReader({ onRead }: { onRead: (text: string) => void }) {
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState(false);
  const read = async (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    setReading(true);
    setFailed(false);
    try {
      const { readQrImage } = await import("@/portaria/camera");
      const text = pickScanned(await readQrImage(file));
      if (text === null) {
        setFailed(true);
      } else {
        onRead(text);
      }
    } catch {
      setFailed(true);
    } finally {
      setReading(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <label
        className={cn(
          "relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-strong bg-surface-2 p-6 text-center transition",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand hover:border-brand/50 hover:bg-brand-soft/40 active:bg-brand-soft/60",
          reading && "pointer-events-none opacity-70",
        )}
      >
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            void read(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
          {reading ? <Spinner /> : <ImageUp className="size-7" aria-hidden />}
        </span>
        <span className="text-base font-semibold text-fg">{reading ? t.photoReading : t.choosePhoto}</span>
        <span className="max-w-72 text-sm leading-relaxed text-fg-muted">{t.photoHint}</span>
      </label>
      {failed && <Alert tone="warning">{t.photoNoQr}</Alert>}
    </div>
  );
}

/** The text a QR reader app showed, pasted. */
function PasteReader({ onRead, pending }: { onRead: (text: string) => void; pending: boolean }) {
  const [text, setText] = useState("");
  const kind = classifyPasted(text);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (kind === "qr") {
      onRead(pastedQr(text));
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t.pasteLabel} hint={t.pasteHint}>
        <Textarea
          value={text}
          maxLength={MAX_QR_TEXT}
          rows={4}
          placeholder={t.pastePlaceholder}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono break-all placeholder:font-sans"
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </Field>
      {kind === "ticket-link" && <Alert tone="brand">{t.ticketLink}</Alert>}
      {kind === "link" && <Alert tone="warning">{t.otherLink}</Alert>}
      <Button type="submit" size="lg" loading={pending} disabled={kind !== "qr"}>
        {pending ? t.checking : t.check}
      </Button>
    </form>
  );
}

/**
 * The public check (ADR 0075): camera, photo or pasted text → `POST /api/verify` → the answer,
 * with the honest note that a copy of an authentic QR is authentic too.
 */
export function TicketChecker() {
  const [mode, setMode] = useState<Mode>("camera");
  const box = useRef<HTMLDivElement>(null);
  const check = useMutation({
    mutationFn: (text: string) => api<VerifyResultDto>("/api/verify", { method: "POST", body: { text } }),
    onSuccess: () => {
      // The answer replaces the reader: bring its top into view when it is out of sight (phones).
      requestAnimationFrame(() => {
        const top = box.current?.getBoundingClientRect().top;
        if (top !== undefined && (top < 0 || top > window.innerHeight / 2)) {
          box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    },
  });
  const read = (text: string) => {
    check.mutate(text);
  };

  return (
    <div ref={box} className="flex scroll-mt-4 flex-col gap-5 rounded-3xl border border-border bg-surface p-4 shadow-lg shadow-black/5 sm:p-6">
      {check.data !== undefined ? (
        <VerifyResult
          result={check.data}
          onAgain={() => {
            check.reset();
            // The reader is back: the keyboard continues from the chosen mode.
            requestAnimationFrame(() => {
              box.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
            });
          }}
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t.modesLabel}
            onKeyDown={segmentedKeys(MODE_VALUES, mode, (next) => {
              setMode(next);
              check.reset();
            })}
            className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1"
          >
            {MODES.map(({ mode: item, icon: Icon }) => (
              <button
                key={item}
                type="button"
                role="tab"
                id={`modo-${item}`}
                aria-selected={mode === item}
                aria-controls={mode === item ? "leitor" : undefined}
                tabIndex={segmentTabIndex(MODE_VALUES, mode, item)}
                onClick={() => {
                  setMode(item);
                  check.reset();
                }}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition",
                  mode === item ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg active:bg-surface-3",
                )}
              >
                <Icon className="size-4 shrink-0 max-sm:hidden" aria-hidden />
                <span className="truncate">{t.modes[item]}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id="leitor" aria-labelledby={`modo-${mode}`} className="flex flex-col gap-4">
            {mode === "camera" && <CameraReader onRead={read} />}
            {mode === "photo" && <PhotoReader onRead={read} />}
            {mode === "paste" && <PasteReader onRead={read} pending={check.isPending} />}
            {check.isPending && mode !== "paste" && (
              <p role="status" className="flex items-center justify-center gap-2 text-sm font-medium text-fg-muted">
                <Spinner />
                {t.checking}
              </p>
            )}
            <ErrorMessage error={check.error} />
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
            <Lock aria-hidden className="mt-px size-3.5 shrink-0 text-fg-subtle" />
            {t.privacyNote}
          </p>
        </>
      )}
    </div>
  );
}
