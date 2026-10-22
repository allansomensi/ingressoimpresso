"use client";

import type { GoogleWalletDto, TicketPassDto, TransferTicketDto } from "@ingressoimpresso/api-types";
import { Check, Copy, MessageCircle, Repeat, Wallet } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button, Dialog, ErrorMessage, Field, Input, buttonClass } from "@/components/ui";
import { api, fetchBlob } from "@/lib/api";
import { isApplePhone } from "@/lib/calendar";
import { forKind } from "@/lib/event-kind";
import { copyText, whatsappUrl } from "@/lib/share";
import { ticket as ticketTexts } from "@/texts/pt-BR/ticket";

function subscribeNothing(): () => void {
  return () => undefined;
}

/**
 * "Adicionar à Apple Wallet" on Apple phones, "Salvar no Google Wallet" elsewhere (ADR 0097): the
 * same QR, in the wallet, that opens without internet and shows up by itself at the event.
 */
export function WalletButtons({ pass, token }: { pass: TicketPassDto; token: string }) {
  const t = ticketTexts.wallet;
  const apple = useSyncExternalStore(
    subscribeNothing,
    () => isApplePhone(navigator.userAgent, navigator.maxTouchPoints) || /Macintosh/.test(navigator.userAgent),
    () => false,
  );
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);
  const showApple = pass.wallets.apple && (apple || !pass.wallets.google);
  const showGoogle = pass.wallets.google && (!apple || !pass.wallets.apple);
  if (!showApple && !showGoogle) {
    return null;
  }
  const addApple = async () => {
    setBusy("apple");
    try {
      const blob = await fetchBlob("/api/ticket/wallet/apple", { token });
      // Safari hands a .pkpass to Wallet when the page opens it.
      const url = URL.createObjectURL(new Blob([blob], { type: "application/vnd.apple.pkpass" }));
      window.location.href = url;
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };
  const addGoogle = async () => {
    setBusy("google");
    try {
      const { url } = await api<GoogleWalletDto>("/api/ticket/wallet/google", { method: "POST", body: { token } });
      window.location.href = url;
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {showApple && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void addApple()}
          className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-black px-4 text-[15px] font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60 dark:ring-1 dark:ring-white/20"
        >
          <Wallet className="size-5" aria-hidden />
          {busy === "apple" ? t.adding : t.apple}
        </button>
      )}
      {showGoogle && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void addGoogle()}
          className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-black px-4 text-[15px] font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60 dark:ring-1 dark:ring-white/20"
        >
          <Wallet className="size-5" aria-hidden />
          {busy === "google" ? t.adding : t.google}
        </button>
      )}
      <p className="text-center text-xs text-fg-subtle">{t.hint}</p>
    </div>
  );
}

/**
 * Passing the ticket on (ADR 0097): the holder types who receives it and sends the new link. This
 * phone stops opening it; the number and its QR stay the same.
 */
export function TransferSection({ pass, token, onTransferred }: { pass: TicketPassDto; token: string; onTransferred: () => void }) {
  const words = forKind(ticketTexts, ticketTexts.tokens, pass.event.kind);
  const t = words.transfer;
  const [open, setOpen] = useState(false);
  // The transfer that was made: closing the dialog in any way (Escape, the backdrop, a swipe)
  // then counts as done, so the page shows the ticket as transferred instead of forgetting it.
  const [done, setDone] = useState<TransferTicketDto | null>(null);
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
        <Repeat className="size-[18px]" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold text-fg">{t.title}</span>
        <span className="text-xs text-fg-muted">{t.hint(pass.transfersLeft)}</span>
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t.action}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (done === null) {
            setOpen(false);
          } else {
            onTransferred();
          }
        }}
        title={t.title}
        description={t.description}
      >
        {open && <TransferForm pass={pass} token={token} done={done} onDone={setDone} onTransferred={onTransferred} />}
      </Dialog>
    </section>
  );
}

function TransferForm({
  pass,
  token,
  done,
  onDone,
  onTransferred,
}: {
  pass: TicketPassDto;
  token: string;
  done: TransferTicketDto | null;
  onDone: (done: TransferTicketDto) => void;
  onTransferred: () => void;
}) {
  const words = forKind(ticketTexts, ticketTexts.tokens, pass.event.kind);
  const t = words.transfer;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const result = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (done !== null) {
      result.current?.focus({ preventScroll: true });
    }
  }, [done]);

  if (done !== null) {
    const message = t.message(done.holderName, pass.event.name, done.url);
    return (
      <div className="flex flex-col gap-4">
        <p
          ref={result}
          role="status"
          tabIndex={-1}
          className="flex items-start gap-2 rounded-xl bg-success-soft px-3.5 py-3 text-sm font-medium text-success-fg outline-none"
        >
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t.done(done.holderName)}
        </p>
        <a href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer" className={buttonClass({ className: "w-full" })}>
          <MessageCircle />
          {t.sendWhatsapp}
        </a>
        <Button
          variant="secondary"
          icon={<Copy />}
          onClick={() => {
            void copyText(done.url).then((ok) => {
              toast[ok ? "success" : "error"](ok ? t.copied : t.copyFailed);
            });
          }}
        >
          {t.copy}
        </Button>
        <Button variant="ghost" onClick={onTransferred}>
          {t.close}
        </Button>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api<TransferTicketDto>("/api/ticket/transfer", { method: "POST", body: { token, holderName: name.trim() } }));
    } catch (failure) {
      setError(failure);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (confirming) {
          void submit();
        } else {
          setConfirming(true);
        }
      }}
    >
      <Field label={t.name}>
        <Input
          value={name}
          maxLength={80}
          data-autofocus
          autoComplete="name"
          placeholder={t.namePlaceholder}
          onChange={(event) => {
            setName(event.target.value);
            setConfirming(false);
          }}
        />
      </Field>
      {confirming && (
        <p role="alert" className="rounded-xl bg-warning-soft px-3.5 py-3 text-sm leading-relaxed text-warning-fg">
          {t.warning(name.trim())}
        </p>
      )}
      {error !== null && <ErrorMessage error={error} />}
      <Button type="submit" loading={busy} disabled={name.trim() === ""} className="w-full">
        {confirming ? t.confirm : t.next}
      </Button>
      <p className="text-xs leading-relaxed text-fg-subtle">{t.note}</p>
    </form>
  );
}
