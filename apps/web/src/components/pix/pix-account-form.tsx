"use client";

import type { PixAccountBody, PixAccountDto, PixKeyType } from "@ingressoimpresso/api-types";
import { Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button, ErrorMessage, Field, Input, Select } from "@/components/ui";
import { pixText } from "@/lib/pix";
import { pix as pixTexts } from "@/texts/pt-BR/pix";

const t = pixTexts;
const KEY_TYPES = ["cpf", "cnpj", "phone", "email", "random"] as const satisfies readonly PixKeyType[];

/** The keyboard each key needs: digits for CPF and phone, a full one for CNPJ (letters from 2026). */
const INPUT_MODE: Record<PixKeyType, "numeric" | "tel" | "email" | "text"> = {
  cpf: "numeric",
  cnpj: "text",
  phone: "tel",
  email: "email",
  random: "text",
};

/**
 * A Pix key with who receives and the city (ADR 0085): the organization's or a seller's. The
 * preview shows the receiver as the payer's bank does (plain letters, cut to 25 and 15).
 */
export function PixAccountForm({
  initial,
  defaultName = "",
  saving,
  removing = false,
  error,
  onSave,
  onRemove,
}: {
  initial: PixAccountDto | null;
  /** Suggested receiver for a new key (the organization's or the seller's name). */
  defaultName?: string;
  saving: boolean;
  removing?: boolean;
  error: unknown;
  onSave: (body: PixAccountBody) => void;
  /** Shown when there is a key to remove. */
  onRemove?: (() => void) | undefined;
}) {
  const [keyType, setKeyType] = useState<PixKeyType>(initial?.keyType ?? "cpf");
  const [key, setKey] = useState(initial?.key ?? "");
  const [name, setName] = useState(initial?.name ?? defaultName.slice(0, 25));
  const [city, setCity] = useState(initial?.city ?? "");
  const valid = key.trim() !== "" && name.trim() !== "" && city.trim() !== "";
  const preview = `${pixText(name, 25) || "—"} · ${pixText(city, 15) || "—"}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) {
      onSave({ keyType, key: key.trim(), name: name.trim(), city: city.trim() });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <Field label={t.keyType}>
          <Select
            value={keyType}
            onChange={(event) => {
              setKeyType(event.target.value as PixKeyType);
            }}
          >
            {KEY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.keyTypes[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.key}>
          <Input
            value={key}
            inputMode={INPUT_MODE[keyType]}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={77}
            placeholder={t.keyPlaceholders[keyType]}
            onChange={(event) => {
              setKey(event.target.value);
            }}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
        <Field label={t.name} hint={t.nameHint}>
          <Input
            value={name}
            maxLength={25}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
        <Field label={t.city} hint={t.cityHint}>
          <Input
            value={city}
            maxLength={15}
            autoComplete="address-level2"
            onChange={(event) => {
              setCity(event.target.value);
            }}
          />
        </Field>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
        <span className="text-fg-muted">{t.preview}</span>
        <span className="font-mono text-xs font-semibold text-fg uppercase">{preview}</span>
      </p>
      <ErrorMessage error={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {initial !== null && onRemove !== undefined && (
          <Button type="button" variant="danger-ghost" icon={<Trash2 />} loading={removing} onClick={onRemove}>
            {t.remove}
          </Button>
        )}
        <Button type="submit" icon={<Save />} loading={saving} disabled={!valid}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
