"use client";

import type { FontChoice, NumberStyle, QrPlacement, TextAlign, TextBlock } from "@ingressoimpresso/api-types";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Copy, Trash2, type LucideIcon } from "lucide-react";
import { useRef } from "react";

import { Button, Field, Input, NumberInput, Select, Switch } from "@/components/ui";
import { cn } from "@/lib/cn";
import { FONTS_WITH_BOLD, MAX_PREFIX_CHARS, MAX_TEXT_CHARS, MAX_TEXT_LINES, MIN_QR_SIZE_MM } from "@/lib/design-rules";
import { FIELDS } from "@/lib/ticket-fields";
import { texts } from "@/texts/pt-BR";

const t = texts.event.design;
const ALIGNS: readonly { value: TextAlign; icon: LucideIcon }[] = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

/** Left / centre / right as a segmented control. */
function AlignPicker({ value, onChange }: { value: TextAlign; onChange: (value: TextAlign) => void }) {
  return (
    <div role="radiogroup" aria-label={t.align} className="flex h-11 items-center gap-0.5 rounded-xl border border-border-strong bg-surface-2 p-1">
      {ALIGNS.map(({ value: option, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={t.aligns[option]}
          title={t.aligns[option]}
          onClick={() => {
            onChange(option);
          }}
          className={cn(
            "flex h-full flex-1 items-center justify-center rounded-lg transition",
            value === option ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-subtle hover:text-fg",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}

function FontPicker({ value, onChange }: { value: FontChoice; onChange: (value: FontChoice) => void }) {
  return (
    <Select
      value={value}
      onChange={(e) => {
        onChange(e.target.value as FontChoice);
      }}
    >
      {(Object.keys(t.fonts) as FontChoice[]).map((font) => (
        <option key={font} value={font}>
          {t.fonts[font]}
        </option>
      ))}
    </Select>
  );
}

/** X, Y, width and height of a box, in millimetres. */
function BoxFields({
  x,
  y,
  width,
  height,
  onChange,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  onChange: (change: Partial<{ xMm: number; yMm: number; widthMm: number; heightMm: number }>) => void;
}) {
  return (
    <fieldset className="grid grid-cols-2 gap-3">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.position}</legend>
      <Field label={t.x}>
        <NumberInput value={x} onChange={(xMm) => { onChange({ xMm }); }} />
      </Field>
      <Field label={t.y}>
        <NumberInput value={y} onChange={(yMm) => { onChange({ yMm }); }} />
      </Field>
      <Field label={t.boxWidth}>
        <NumberInput value={width} onChange={(widthMm) => { onChange({ widthMm }); }} />
      </Field>
      <Field label={t.boxHeight}>
        <NumberInput value={height} onChange={(heightMm) => { onChange({ heightMm }); }} />
      </Field>
    </fieldset>
  );
}

/** Editor of a text block. `key` groups typing in one field into a single undo step. */
export function TextInspector({
  block,
  index,
  count,
  onChange,
  onDuplicate,
  onRemove,
  onReorder,
}: {
  block: TextBlock;
  index: number;
  count: number;
  onChange: (change: Partial<TextBlock>, key: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onReorder: (direction: -1 | 1) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hasBold = FONTS_WITH_BOLD.includes(block.font);

  const insert = (field: string) => {
    const element = input.current;
    const token = `{${field}}`;
    const start = element?.selectionStart ?? block.text.length;
    const end = element?.selectionEnd ?? block.text.length;
    const text = block.text.slice(0, start) + token + block.text.slice(end);
    onChange({ text }, `text-${String(index)}`);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Field label={t.text} hint={t.textHint}>
          <Input
            ref={input}
            value={block.text}
            maxLength={MAX_TEXT_CHARS}
            onChange={(e) => {
              onChange({ text: e.target.value }, `text-${String(index)}`);
            }}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">{t.insertField}</span>
          <div className="flex flex-wrap gap-1.5">
            {FIELDS.map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => {
                  insert(field);
                }}
                className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-muted transition hover:border-brand/50 hover:bg-brand-soft hover:text-brand-soft-fg"
              >
                {t.fields[field]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.font} className="sm:col-span-2">
          <FontPicker value={block.font} onChange={(font) => { onChange({ font }, "font"); }} />
        </Field>
        <Field label={t.fontSize}>
          <NumberInput value={block.sizePt} step={1} onChange={(sizePt) => { onChange({ sizePt }, `size-${String(index)}`); }} suffix={texts.common.pt} />
        </Field>
        <Field label={t.color}>
          <Input type="color" value={block.color} onChange={(e) => { onChange({ color: e.target.value }, `color-${String(index)}`); }} />
        </Field>
        <Field label={t.align}>
          <AlignPicker value={block.align} onChange={(align) => { onChange({ align }, "align"); }} />
        </Field>
        <Field label={t.lines}>
          <Select
            value={block.lines}
            onChange={(e) => {
              onChange({ lines: Number(e.target.value) }, "lines");
            }}
          >
            {Array.from({ length: MAX_TEXT_LINES }, (_, i) => i + 1).map((lines) => (
              <option key={lines} value={lines}>
                {t.linesOption(lines)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.letterSpacing}>
          <NumberInput
            value={block.letterSpacing}
            step={0.05}
            min={-0.1}
            max={1}
            onChange={(letterSpacing) => {
              onChange({ letterSpacing }, `spacing-${String(index)}`);
            }}
          />
        </Field>
        <div className="flex flex-col justify-end gap-3 pb-1">
          <Switch label={t.uppercase} checked={block.uppercase} onChange={(uppercase) => { onChange({ uppercase }, "uppercase"); }} />
        </div>
        <div className="sm:col-span-2">
          <Switch
            label={t.bold}
            {...(hasBold ? {} : { description: t.boldUnavailable })}
            checked={block.bold && hasBold}
            onChange={(bold) => {
              if (hasBold) {
                onChange({ bold }, "bold");
              }
            }}
          />
        </div>
      </div>

      <BoxFields
        x={block.xMm}
        y={block.yMm}
        width={block.widthMm}
        height={block.heightMm}
        onChange={(change) => {
          onChange(change, `box-${String(index)}`);
        }}
      />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="secondary" size="sm" icon={<Copy />} onClick={onDuplicate}>
          {t.duplicate}
        </Button>
        <Button variant="secondary" size="sm" icon={<ArrowUp />} disabled={index === count - 1} onClick={() => { onReorder(1); }}>
          {t.forward}
        </Button>
        <Button variant="secondary" size="sm" icon={<ArrowDown />} disabled={index === 0} onClick={() => { onReorder(-1); }}>
          {t.backward}
        </Button>
        <Button variant="danger-ghost" size="sm" icon={<Trash2 />} onClick={onRemove} className="ml-auto">
          {t.remove}
        </Button>
      </div>
    </div>
  );
}

export function NumberInspector({ number, onChange }: { number: NumberStyle; onChange: (change: Partial<NumberStyle>, key: string) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-muted">{t.numberHint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.font} className="sm:col-span-2">
          <FontPicker value={number.font} onChange={(font) => { onChange({ font }, "number-font"); }} />
        </Field>
        <Field label={t.fontSize}>
          <NumberInput value={number.sizePt} step={1} onChange={(sizePt) => { onChange({ sizePt }, "number-size"); }} suffix={texts.common.pt} />
        </Field>
        <Field label={t.color}>
          <Input type="color" value={number.color} onChange={(e) => { onChange({ color: e.target.value }, "number-color"); }} />
        </Field>
        <Field label={t.align}>
          <AlignPicker value={number.align} onChange={(align) => { onChange({ align }, "number-align"); }} />
        </Field>
        <Field label={t.prefix}>
          <Input value={number.prefix} maxLength={MAX_PREFIX_CHARS} onChange={(e) => { onChange({ prefix: e.target.value }, "number-prefix"); }} />
        </Field>
        <Field label={t.digits}>
          <NumberInput value={number.digits} step={1} min={1} max={10} onChange={(digits) => { onChange({ digits }, "number-digits"); }} />
        </Field>
      </div>
      <BoxFields
        x={number.xMm}
        y={number.yMm}
        width={number.widthMm}
        height={number.heightMm}
        onChange={(change) => {
          onChange(change, "number-box");
        }}
      />
    </div>
  );
}

export function QrInspector({ qr, onChange }: { qr: QrPlacement; onChange: (change: Partial<QrPlacement>, key: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t.qrHint}</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t.x}>
          <NumberInput value={qr.xMm} onChange={(xMm) => { onChange({ xMm }, "qr-box"); }} />
        </Field>
        <Field label={t.y}>
          <NumberInput value={qr.yMm} onChange={(yMm) => { onChange({ yMm }, "qr-box"); }} />
        </Field>
        <Field label={t.qrSize}>
          <NumberInput value={qr.sizeMm} min={MIN_QR_SIZE_MM} onChange={(sizeMm) => { onChange({ sizeMm }, "qr-box"); }} suffix={texts.common.mm} />
        </Field>
      </div>
    </div>
  );
}
