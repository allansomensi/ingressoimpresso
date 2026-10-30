"use client";

import type { EventKind, JoinWaitlistBody, JoinedWaitlistDto, PublicCategoryDto } from "@ingressoimpresso/api-types";
import { BellRing, Check, Minus, Plus, UserPlus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button, Field, Input, Select } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { normalizePhone } from "@/lib/digital-tickets";
import { forKind } from "@/lib/event-kind";
import { accentInk } from "@/lib/page-design";
import { publicEvent as publicEventTexts } from "@/texts/pt-BR/public-event";

const MAX_QUANTITY = 10;

/**
 * The waiting list of a sold-out event (ADR 0124): a name, a WhatsApp, the sold-out category and
 * how many. The organization sees it in Digitais and calls when a place opens.
 */
export function WaitlistCard({
  slug,
  kind,
  eventSoldOut,
  categories,
  accent,
}: {
  slug: string;
  kind: EventKind;
  /** The whole event is sold out: every category takes names. */
  eventSoldOut: boolean;
  categories: readonly PublicCategoryDto[];
  /** The page's accent colour, for the icon. */
  accent?: string | undefined;
}) {
  const t = forKind(publicEventTexts, publicEventTexts.tokens, kind).waitlist;
  const options = categories.filter((category) => eventSoldOut || category.soldOut);
  const [categoryId, setCategoryId] = useState<string | null>(options[0]?.id ?? null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" } | { kind: "done"; position: number } | { kind: "error"; message: string }>({ kind: "idle" });
  const headingId = useId();
  const digits = normalizePhone(phone);
  const phoneInvalid = phone.trim() !== "" && digits === false;
  const ready = name.trim() !== "" && typeof digits === "string" && (options.length === 0 || categoryId !== null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || state.kind === "sending") {
      return;
    }
    setState({ kind: "sending" });
    try {
      const body: JoinWaitlistBody = { categoryId: options.length === 0 ? null : categoryId, name: name.trim(), phone, quantity, website };
      const joined = await api<JoinedWaitlistDto>(`/api/public/events/${encodeURIComponent(slug)}/waitlist`, { method: "POST", body });
      setState({ kind: "done", position: joined.position });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setState({
        kind: "error",
        message:
          code === "invalid_whatsapp"
            ? t.invalidPhone
            : code === "waitlist_closed"
              ? t.closed
              : code === "waitlist_not_sold_out"
                ? t.notSoldOut
                : error instanceof ApiError
                  ? error.userMessage
                  : t.error,
      });
    }
  };

  const chosen = options.find((category) => category.id === categoryId) ?? null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xs">
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg"
          style={accent === undefined ? undefined : { backgroundColor: accent, color: accentInk(accent) }}
        >
          <BellRing className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id={headingId} className="text-lg font-semibold tracking-tight text-fg">
            {t.title}
          </h2>
          <p className="text-sm leading-relaxed text-fg-muted">{eventSoldOut || options.length === 0 ? t.lead : t.leadCategories}</p>
        </div>
      </div>

      {state.kind === "done" ? (
        <div role="status" className="flex flex-col gap-3 rounded-xl bg-success-soft px-4 py-4 text-success-fg">
          <p className="flex items-center gap-2 text-base font-semibold">
            <Check className="size-5 shrink-0" aria-hidden />
            {t.doneTitle}
          </p>
          <p className="text-sm leading-relaxed">{t.done(state.position, chosen?.name ?? null)}</p>
          <Button
            variant="secondary"
            size="sm"
            icon={<UserPlus />}
            className="w-fit"
            onClick={() => {
              setName("");
              setPhone("");
              setQuantity(1);
              setState({ kind: "idle" });
            }}
          >
            {t.again}
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
          {options.length > 1 && (
            <Field label={t.category}>
              <Select
                value={categoryId ?? ""}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                }}
              >
                {options.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.name}>
              <Input
                value={name}
                maxLength={80}
                autoComplete="name"
                placeholder={t.namePlaceholder}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>
            <Field label={t.phone} hint={phoneInvalid ? <span className="text-danger-fg">{t.invalidPhone}</span> : undefined}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                aria-invalid={phoneInvalid || undefined}
                placeholder={t.phonePlaceholder}
                onChange={(event) => {
                  setPhone(event.target.value);
                }}
              />
            </Field>
          </div>
          <Field label={t.quantity}>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon"
                aria-label={`${t.quantity} −1`}
                disabled={quantity <= 1}
                onClick={() => {
                  setQuantity(quantity - 1);
                }}
              >
                <Minus />
              </Button>
              <span className="w-12 text-center text-lg font-semibold text-fg tabular" aria-live="polite">
                {quantity}
              </span>
              <Button
                variant="secondary"
                size="icon"
                aria-label={`${t.quantity} +1`}
                disabled={quantity >= MAX_QUANTITY}
                onClick={() => {
                  setQuantity(quantity + 1);
                }}
              >
                <Plus />
              </Button>
            </div>
          </Field>
          {/* People never see this field; robots fill it, and the server ignores them. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={website}
            onChange={(event) => {
              setWebsite(event.target.value);
            }}
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />
          {state.kind === "error" && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-fg">
              {state.message}
            </p>
          )}
          <Button type="submit" size="lg" icon={<BellRing />} loading={state.kind === "sending"} disabled={!ready} className="w-full sm:w-fit">
            {t.submit}
          </Button>
          <p className="text-xs leading-relaxed text-fg-subtle">{t.privacy}</p>
        </form>
      )}
    </section>
  );
}
