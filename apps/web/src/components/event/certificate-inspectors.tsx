"use client";

import type {
  ArtDto,
  BrandStyle,
  CertificateDesign,
  CertificateElement,
  CertificateFrame,
  CertificatePage,
  FontChoice,
  FrameStyle,
  LineStyle,
  ParagraphAlign,
  VerticalAlign,
} from "@ingressoimpresso/api-types";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowUp,
  Copy,
  ImagePlus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useRef, type ReactNode } from "react";

import { CertificateBrand } from "@/components/certificate/certificate-view";
import { useEventTexts } from "@/components/event/access";
import { Badge, Button, Field, Input, NumberInput, Select, Switch, Textarea } from "@/components/ui";
import {
  FRAME_MARGIN_MM,
  FRAME_THICKNESS_MM,
  LETTER_SPACING_EM,
  LINE_HEIGHT,
  LINE_THICKNESS_MM,
  MAX_CERTIFICATE_IMAGES,
  MAX_SEAL_CENTER_CHARS,
  MAX_SEAL_TEXT_CHARS,
  MAX_SIGNER_NAME_CHARS,
  MAX_SIGNER_ROLE_CHARS,
  MAX_TEXT_CHARS,
  MAX_TITLE_CHARS,
  MIN_CERTIFICATE_QR_MM,
  OPACITY,
  SEAL_SIZE_MM,
  SHAPE_RADIUS_MM,
  SIGNATURE_SIZE_PT,
  TEXT_SIZE_PT,
  elementBox,
  isSquare,
} from "@/lib/certificate-design";
import { CERTIFICATE_FIELDS } from "@/lib/certificates";
import { cn } from "@/lib/cn";
import { FONTS_WITH_BOLD, FONTS_WITH_ITALIC } from "@/lib/design-rules";
import { certificateEditor as texts } from "@/texts/pt-BR/certificate-editor";
import { common as commonTexts } from "@/texts/pt-BR/common";

const t = texts.inspector;

/** A change to the element; `key` groups typing in one field into a single undo step. */
type Patch = (change: Partial<Record<string, unknown>>, key: string) => void;

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-11 items-center gap-0.5 rounded-xl border border-border-strong bg-surface-2 p-1">
      {options.map(({ value: option, label: name, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={name}
          title={name}
          onClick={() => {
            onChange(option);
          }}
          className={cn(
            "flex h-full min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-xs font-medium transition",
            value === option ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-subtle hover:text-fg active:text-fg",
          )}
        >
          {Icon === undefined ? <span className="truncate">{name}</span> : <Icon className="size-4" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/** The typefaces, named as in the ticket editor. */
function FontPicker({ value, onChange }: { value: FontChoice; onChange: (value: FontChoice) => void }) {
  const fonts = useEventTexts().design.fonts;
  return (
    <Select
      value={value}
      onChange={(change) => {
        onChange(change.target.value as FontChoice);
      }}
    >
      {(Object.keys(fonts) as FontChoice[]).map((font) => (
        <option key={font} value={font}>
          {fonts[font]}
        </option>
      ))}
    </Select>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Input
        type="color"
        value={value}
        onChange={(change) => {
          onChange(change.target.value);
        }}
      />
    </Field>
  );
}

/** Chips that put a field where the cursor is. */
function FieldChips({ onInsert }: { onInsert: (field: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{t.insertField}</span>
      <div className="flex flex-wrap gap-1.5">
        {CERTIFICATE_FIELDS.map((field) => (
          <button
            key={field}
            type="button"
            onClick={() => {
              onInsert(field);
            }}
            className="relative touch-target rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-muted transition hover:border-brand/50 hover:bg-brand-soft hover:text-brand-soft-fg active:bg-brand-soft"
          >
            {t.fields[field] ?? field}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Inserts `{field}` at the cursor of a text field and keeps the cursor after it. */
function insertField(element: HTMLInputElement | HTMLTextAreaElement | null, value: string, field: string, set: (value: string) => void) {
  const token = `{${field}}`;
  const start = element?.selectionStart ?? value.length;
  const end = element?.selectionEnd ?? value.length;
  set(value.slice(0, start) + token + value.slice(end));
  requestAnimationFrame(() => {
    element?.focus();
    element?.setSelectionRange(start + token.length, start + token.length);
  });
}

function BoxFields({ element, index, onChange }: { element: CertificateElement; index: number; onChange: Patch }) {
  const box = elementBox(element);
  const square = isSquare(element);
  const key = `box-${String(index)}`;
  return (
    <fieldset className="grid grid-cols-2 gap-3">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.position}</legend>
      <Field label={t.x}>
        <NumberInput value={box.x} suffix="mm" onChange={(xMm) => { onChange({ xMm }, key); }} />
      </Field>
      <Field label={t.y}>
        <NumberInput value={box.y} suffix="mm" onChange={(yMm) => { onChange({ yMm }, key); }} />
      </Field>
      {square ? (
        <Field label={t.size}>
          <NumberInput value={box.width} suffix="mm" onChange={(sizeMm) => { onChange({ sizeMm }, key); }} />
        </Field>
      ) : (
        <>
          <Field label={t.width}>
            <NumberInput value={box.width} suffix="mm" onChange={(widthMm) => { onChange({ widthMm }, key); }} />
          </Field>
          <Field label={t.height}>
            <NumberInput value={box.height} suffix="mm" onChange={(heightMm) => { onChange({ heightMm }, key); }} />
          </Field>
        </>
      )}
    </fieldset>
  );
}

const ALIGNS: readonly { value: ParagraphAlign; icon: LucideIcon }[] = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
  { value: "justify", icon: AlignJustify },
];
const VALIGNS: readonly { value: VerticalAlign; icon: LucideIcon }[] = [
  { value: "top", icon: AlignVerticalJustifyStart },
  { value: "middle", icon: AlignVerticalJustifyCenter },
  { value: "bottom", icon: AlignVerticalJustifyEnd },
];

/** The image an element shows: the organization's logo or one of the uploads. */
function ImageChoice({
  value,
  images,
  allowNone,
  allowLogo,
  hasLogo,
  onChange,
  onUpload,
  uploading,
}: {
  /** `"logo"`, an upload's index, or null for none. */
  value: "logo" | number | null;
  images: readonly ArtDto[];
  allowNone: boolean;
  allowLogo: boolean;
  hasLogo: boolean;
  onChange: (value: "logo" | number | null) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={value === null ? "" : String(value)}
        onChange={(change) => {
          const picked = change.target.value;
          onChange(picked === "" ? null : picked === "logo" ? "logo" : Number(picked));
        }}
      >
        {allowNone && <option value="">{t.signatureNoImage}</option>}
        {allowLogo && <option value="logo">{t.organizationLogo}</option>}
        {images.map((image, index) => (
          <option key={image.id} value={index}>
            {texts.imageElement(index)}
          </option>
        ))}
      </Select>
      {allowLogo && value === "logo" && !hasLogo && <p className="text-xs text-warning-fg">{t.noOrganizationLogo}</p>}
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(change) => {
          const picked = change.target.files?.[0];
          change.target.value = "";
          if (picked !== undefined) {
            onUpload(picked);
          }
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        icon={<ImagePlus />}
        className="self-start"
        loading={uploading}
        disabled={images.length >= MAX_CERTIFICATE_IMAGES}
        onClick={() => file.current?.click()}
      >
        {texts.images.upload}
      </Button>
    </div>
  );
}

/** The inspector of one element of the certificate. */
export function ElementInspector({
  element,
  index,
  count,
  images,
  hasLogo,
  uploading,
  onChange,
  onUpload,
  onDuplicate,
  onRemove,
  onReorder,
}: {
  element: CertificateElement;
  index: number;
  count: number;
  images: readonly ArtDto[];
  hasLogo: boolean;
  uploading: boolean;
  onChange: Patch;
  /** Uploads an image and then calls `then` with its index. */
  onUpload: (file: File, then: (index: number) => void) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onReorder: (direction: -1 | 1) => void;
}) {
  const boldUnavailable = useEventTexts().design.boldUnavailable;
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sealRef = useRef<HTMLInputElement>(null);
  const k = (name: string) => `${name}-${String(index)}`;

  let body: ReactNode = null;
  switch (element.kind) {
    case "text": {
      const hasBold = FONTS_WITH_BOLD.includes(element.font);
      const hasItalic = FONTS_WITH_ITALIC.includes(element.font);
      body = (
        <>
          <div className="flex flex-col gap-2">
            <Field label={t.text} hint={t.textHint}>
              <Textarea
                ref={textRef}
                rows={element.text.length > 80 ? 5 : 3}
                value={element.text}
                maxLength={MAX_TEXT_CHARS}
                onChange={(change) => {
                  onChange({ text: change.target.value }, k("text"));
                }}
              />
            </Field>
            <FieldChips
              onInsert={(field) => {
                insertField(textRef.current, element.text, field, (text) => {
                  onChange({ text }, k("text"));
                });
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.font} className="sm:col-span-2">
              <FontPicker value={element.font} onChange={(font) => { onChange({ font }, "font"); }} />
            </Field>
            <Field label={t.fontSize}>
              <NumberInput value={element.sizePt} step={1} min={TEXT_SIZE_PT[0]} max={TEXT_SIZE_PT[1]} suffix={commonTexts.pt} onChange={(sizePt) => { onChange({ sizePt }, k("size")); }} />
            </Field>
            <ColorField label={t.color} value={element.color} onChange={(color) => { onChange({ color }, k("color")); }} />
            <Field label={t.align}>
              <Segmented
                label={t.align}
                value={element.align}
                options={ALIGNS.map(({ value, icon }) => ({ value, icon, label: t.aligns[value] }))}
                onChange={(align) => { onChange({ align }, "align"); }}
              />
            </Field>
            <Field label={t.valign}>
              <Segmented
                label={t.valign}
                value={element.valign}
                options={VALIGNS.map(({ value, icon }) => ({ value, icon, label: t.valigns[value] }))}
                onChange={(valign) => { onChange({ valign }, "valign"); }}
              />
            </Field>
            <Field label={t.lineHeight}>
              <NumberInput value={element.lineHeight} step={0.05} min={LINE_HEIGHT[0]} max={LINE_HEIGHT[1]} onChange={(lineHeight) => { onChange({ lineHeight }, k("line-height")); }} />
            </Field>
            <Field label={t.letterSpacing}>
              <NumberInput value={element.letterSpacing} step={0.05} min={LETTER_SPACING_EM[0]} max={LETTER_SPACING_EM[1]} onChange={(letterSpacing) => { onChange({ letterSpacing }, k("spacing")); }} />
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            <Switch label={t.bold} checked={element.bold && hasBold} onChange={(bold) => { if (hasBold) { onChange({ bold }, "bold"); } }} {...(hasBold ? {} : { description: boldUnavailable })} />
            {hasItalic && <Switch label={t.italic} checked={element.italic} onChange={(italic) => { onChange({ italic }, "italic"); }} />}
            <Switch label={t.uppercase} checked={element.uppercase} onChange={(uppercase) => { onChange({ uppercase }, "uppercase"); }} />
            {element.text.includes("{nome}") && hasBold && (
              <Switch label={t.boldName} checked={element.boldName} onChange={(boldName) => { onChange({ boldName }, "bold-name"); }} />
            )}
          </div>
        </>
      );
      break;
    }
    case "image":
      body = (
        <Field label={t.imageSource}>
          <ImageChoice
            value={element.source.from === "organization" ? "logo" : element.source.index}
            images={images}
            allowNone={false}
            allowLogo
            hasLogo={hasLogo}
            uploading={uploading}
            onChange={(value) => {
              onChange({ source: value === "logo" || value === null ? { from: "organization" } : { from: "upload", index: value } }, "source");
            }}
            onUpload={(file) => {
              onUpload(file, (uploaded) => {
                onChange({ source: { from: "upload", index: uploaded } }, "source");
              });
            }}
          />
        </Field>
      );
      break;
    case "signature":
      body = (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.signatureName}>
              <Input value={element.name} maxLength={MAX_SIGNER_NAME_CHARS} placeholder={t.signatureNamePlaceholder} onChange={(change) => { onChange({ name: change.target.value }, k("name")); }} />
            </Field>
            <Field label={t.signatureRole}>
              <Input value={element.role} maxLength={MAX_SIGNER_ROLE_CHARS} placeholder={t.signatureRolePlaceholder} onChange={(change) => { onChange({ role: change.target.value }, k("role")); }} />
            </Field>
          </div>
          <Field label={t.signatureImage} hint={t.signatureImageHint}>
            <ImageChoice
              value={element.image ?? null}
              images={images}
              allowNone
              allowLogo={false}
              hasLogo={hasLogo}
              uploading={uploading}
              onChange={(value) => {
                onChange({ image: typeof value === "number" ? value : null }, "image");
              }}
              onUpload={(file) => {
                onUpload(file, (uploaded) => {
                  onChange({ image: uploaded }, "image");
                });
              }}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.font} className="sm:col-span-2">
              <FontPicker value={element.font} onChange={(font) => { onChange({ font }, "font"); }} />
            </Field>
            <Field label={t.fontSize}>
              <NumberInput value={element.sizePt} step={0.5} min={SIGNATURE_SIZE_PT[0]} max={SIGNATURE_SIZE_PT[1]} suffix={commonTexts.pt} onChange={(sizePt) => { onChange({ sizePt }, k("size")); }} />
            </Field>
            <ColorField label={t.color} value={element.color} onChange={(color) => { onChange({ color }, k("color")); }} />
            <ColorField label={t.lineColor} value={element.lineColor} onChange={(lineColor) => { onChange({ lineColor }, k("line-color")); }} />
          </div>
        </>
      );
      break;
    case "qr":
      body = <p className="text-sm text-fg-muted">{t.qrHint}</p>;
      break;
    case "line":
      body = (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.lineStyle} className="sm:col-span-2">
            <Select value={element.style} onChange={(change) => { onChange({ style: change.target.value as LineStyle }, "line-style"); }}>
              {(Object.keys(t.lineStyles) as LineStyle[]).map((style) => (
                <option key={style} value={style}>
                  {t.lineStyles[style]}
                </option>
              ))}
            </Select>
          </Field>
          <ColorField label={t.color} value={element.color} onChange={(color) => { onChange({ color }, k("color")); }} />
          <Field label={t.thickness}>
            <NumberInput value={element.thicknessMm} step={0.1} min={LINE_THICKNESS_MM[0]} max={LINE_THICKNESS_MM[1]} onChange={(thicknessMm) => { onChange({ thicknessMm }, k("thickness")); }} />
          </Field>
        </div>
      );
      break;
    case "shape":
      body = (
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField label={t.color} value={element.color} onChange={(color) => { onChange({ color }, k("color")); }} />
          <Field label={t.opacity}>
            <NumberInput value={element.opacity} step={0.05} min={OPACITY[0]} max={OPACITY[1]} onChange={(opacity) => { onChange({ opacity }, k("opacity")); }} />
          </Field>
          <Field label={t.radius}>
            <NumberInput value={element.radiusMm} step={0.5} min={SHAPE_RADIUS_MM[0]} max={SHAPE_RADIUS_MM[1]} onChange={(radiusMm) => { onChange({ radiusMm }, k("radius")); }} />
          </Field>
        </div>
      );
      break;
    case "seal":
      body = (
        <>
          <div className="flex flex-col gap-2">
            <Field label={t.sealText}>
              <Input ref={sealRef} value={element.text} maxLength={MAX_SEAL_TEXT_CHARS} onChange={(change) => { onChange({ text: change.target.value }, k("seal-text")); }} />
            </Field>
            <FieldChips
              onInsert={(field) => {
                insertField(sealRef.current, element.text, field, (text) => {
                  onChange({ text }, k("seal-text"));
                });
              }}
            />
          </div>
          <Field label={t.sealCenter}>
            <Input value={element.center} maxLength={MAX_SEAL_CENTER_CHARS} placeholder={t.sealCenterPlaceholder} onChange={(change) => { onChange({ center: change.target.value }, k("seal-center")); }} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField label={t.color} value={element.color} onChange={(color) => { onChange({ color }, k("color")); }} />
            <ColorField label={t.textColor} value={element.textColor} onChange={(textColor) => { onChange({ textColor }, k("text-color")); }} />
          </div>
        </>
      );
      break;
  }

  return (
    <div className="flex flex-col gap-5">
      {body}
      <BoxFields element={element} index={index} onChange={onChange} />
      {element.kind === "qr" && <p className="-mt-3 text-xs text-fg-muted">{texts.issues.qrTooSmall(MIN_CERTIFICATE_QR_MM)}</p>}
      {element.kind === "seal" && <p className="-mt-3 text-xs text-fg-muted">{texts.issues.seal(SEAL_SIZE_MM[0], SEAL_SIZE_MM[1])}</p>}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="secondary" size="sm" icon={<Copy />} onClick={onDuplicate}>
          {t.duplicate}
        </Button>
        <Button variant="secondary" size="sm" icon={<ArrowUp />} disabled={index === count - 1} onClick={() => { onReorder(1); }}>
          {texts.layers.up}
        </Button>
        <Button variant="secondary" size="sm" icon={<ArrowDown />} disabled={index === 0} onClick={() => { onReorder(-1); }}>
          {texts.layers.down}
        </Button>
        <Button variant="danger-ghost" size="sm" icon={<Trash2 />} onClick={onRemove} className="ml-auto">
          {t.remove}
        </Button>
      </div>
    </div>
  );
}

const FRAME_STYLES: readonly FrameStyle[] = ["simple", "double", "band", "classic", "corners", "geometric", "side"];

/** The settings of one side and of the certificate as a whole. */
export function PageInspector({
  design,
  page,
  side,
  workload,
  images,
  uploading,
  onDesign,
  onPage,
  onWorkload,
  onOrientation,
  onUpload,
}: {
  design: CertificateDesign;
  page: CertificatePage;
  side: "front" | "back";
  workload: string | null;
  images: readonly ArtDto[];
  uploading: boolean;
  onDesign: (change: Partial<CertificateDesign>, key: string) => void;
  onPage: (change: Partial<CertificatePage>, key: string) => void;
  onWorkload: (value: string | null) => void;
  onOrientation: (value: CertificateDesign["orientation"]) => void;
  onUpload: (file: File, then: (index: number) => void) => void;
}) {
  const p = texts.page;
  const frame = page.frame ?? null;
  const setFrame = (change: Partial<CertificateFrame>, key: string) => {
    if (frame !== null) {
      onPage({ frame: { ...frame, ...change } }, key);
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={p.name} hint={p.nameHint} className="sm:col-span-2">
          <Input value={design.title} maxLength={MAX_TITLE_CHARS} onChange={(change) => { onDesign({ title: change.target.value }, "title"); }} />
        </Field>
        <Field label={p.workload} hint={p.workloadHint} optional>
          <Input
            value={workload ?? ""}
            maxLength={30}
            placeholder={p.workloadPlaceholder}
            onChange={(change) => {
              onWorkload(change.target.value === "" ? null : change.target.value);
            }}
          />
        </Field>
        <Field label={p.orientation}>
          <Segmented
            label={p.orientation}
            value={design.orientation}
            options={(["landscape", "portrait"] as const).map((value) => ({ value, label: p.orientations[value] }))}
            onChange={onOrientation}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-3 border-t border-border pt-4">
        <legend className="sr-only">{texts.sides[side]}</legend>
        <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{texts.sides[side]}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField label={p.paper} value={page.backgroundColor} onChange={(backgroundColor) => { onPage({ backgroundColor }, `${side}-paper`); }} />
          <Field label={p.background} hint={p.backgroundHint}>
            <ImageChoice
              value={page.backgroundImage ?? null}
              images={images}
              allowNone
              allowLogo={false}
              hasLogo={false}
              uploading={uploading}
              onChange={(value) => {
                onPage({ backgroundImage: typeof value === "number" ? value : null }, `${side}-background`);
              }}
              onUpload={(file) => {
                onUpload(file, (index) => {
                  onPage({ backgroundImage: index }, `${side}-background`);
                });
              }}
            />
          </Field>
        </div>
        <Field label={p.frame}>
          <Select
            value={frame?.style ?? ""}
            onChange={(change) => {
              const style = change.target.value as FrameStyle | "";
              onPage(
                {
                  frame:
                    style === ""
                      ? null
                      : { style, color: frame?.color ?? "#1f3a5f", accent: frame?.accent ?? "#b8892b", marginMm: frame?.marginMm ?? 9, thicknessMm: frame?.thicknessMm ?? 1.2 },
                },
                `${side}-frame`,
              );
            }}
          >
            <option value="">{p.frames.none}</option>
            {FRAME_STYLES.map((style) => (
              <option key={style} value={style}>
                {p.frames[style]}
              </option>
            ))}
          </Select>
        </Field>
        {frame !== null && (
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField label={p.frameColor} value={frame.color} onChange={(color) => { setFrame({ color }, `${side}-frame-color`); }} />
            <ColorField label={p.frameAccent} value={frame.accent} onChange={(accent) => { setFrame({ accent }, `${side}-frame-accent`); }} />
            <Field label={p.frameMargin}>
              <NumberInput value={frame.marginMm} step={0.5} min={FRAME_MARGIN_MM[0]} max={FRAME_MARGIN_MM[1]} onChange={(marginMm) => { setFrame({ marginMm }, `${side}-frame-margin`); }} />
            </Field>
            <Field label={p.frameThickness}>
              <NumberInput value={frame.thicknessMm} step={0.1} min={FRAME_THICKNESS_MM[0]} max={FRAME_THICKNESS_MM[1]} onChange={(thicknessMm) => { setFrame({ thicknessMm }, `${side}-frame-thickness`); }} />
            </Field>
          </div>
        )}
      </fieldset>
      <div className="border-t border-border pt-4">
        <Switch label={p.brand} description={p.brandHint} checked={design.brand} onChange={(brand) => { onDesign({ brand }, "brand"); }} />
        {design.brand && (
          <>
            <BrandStylePicker
              value={design.brandStyle}
              onChange={(brandStyle) => {
                onDesign({ brandStyle }, "brand-style");
              }}
            />
            {/* The brand can be dragged off a frame (ADR 0118); one tap puts it back. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
              <span>{design.brandPosition == null ? p.brandMove : p.brandMoved}</span>
              {design.brandPosition != null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onDesign({ brandPosition: null }, "brand-position");
                  }}
                >
                  {p.brandReset}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The certificate's uploaded images, with their review state. */
export function ImagesPanel({
  images,
  imageUrls,
  used,
  uploading,
  onUpload,
  onRemove,
}: {
  images: readonly ArtDto[];
  imageUrls: readonly (string | null)[];
  used: readonly number[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: (index: number) => void;
}) {
  const i = texts.images;
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-1.5 rounded-xl border border-border p-2">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e5e5ea_0%_25%,#fff_0%_50%)] bg-[length:12px_12px]">
                {imageUrls[index] != null && (
                  // eslint-disable-next-line @next/next/no-img-element -- object URL of an uploaded image
                  <img src={imageUrls[index]} alt="" className="max-h-full max-w-full object-contain" />
                )}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-medium text-fg">{texts.imageElement(index)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={i.remove}
                  title={i.remove}
                  onClick={() => {
                    onRemove(index);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
              {image.moderation === "flagged" && <Badge tone="warning">{i.review}</Badge>}
              {image.moderation === "rejected" && <Badge tone="danger">{i.rejected}</Badge>}
              {!used.includes(index) && image.moderation !== "rejected" && <span className="text-xs text-fg-subtle">{i.unused}</span>}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(change) => {
          const picked = change.target.files?.[0];
          change.target.value = "";
          if (picked !== undefined) {
            onUpload(picked);
          }
        }}
      />
      <Button variant="secondary" size="sm" icon={<ImagePlus />} className="self-start" loading={uploading} disabled={images.length >= MAX_CERTIFICATE_IMAGES} onClick={() => file.current?.click()}>
        {i.upload}
      </Button>
      {images.length >= MAX_CERTIFICATE_IMAGES && <p className="text-xs text-fg-muted">{i.full}</p>}
    </div>
  );
}

/** Paper of the brand samples: they show the print, not the panel's theme. */
const SAMPLE_PAPER = "#fffdf7";

/** The two looks of "Emitido com Ingresso Impresso", each drawn as it prints (ADR 0116). */
function BrandStylePicker({ value, onChange }: { value: BrandStyle; onChange: (value: BrandStyle) => void }) {
  const p = texts.page;
  return (
    <fieldset className="mt-3 flex flex-col gap-2">
      <legend className="mb-1.5 text-xs font-medium text-fg-muted">{p.brandStyle}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["line", "mark"] as const).map((style) => {
          const checked = value === style;
          return (
            <label
              key={style}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-xl border p-2.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                checked ? "border-brand bg-brand-soft/60" : "border-border hover:border-border-strong hover:bg-surface-2 active:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="brand-style"
                className="sr-only"
                checked={checked}
                onChange={() => {
                  onChange(style);
                }}
              />
              {/* A slice of paper with the brand as it prints. */}
              <span aria-hidden className="@container relative block h-10 overflow-hidden rounded-md border border-border" style={{ background: SAMPLE_PAPER }}>
                {/* 75 mm of the paper's bottom edge across the card. */}
                <CertificateBrand style={style} paper={SAMPLE_PAPER} u={(mm) => `${String((mm / 75) * 100)}cqw`} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg">{p.brandStyles[style].label}</span>
                <span className="text-xs leading-snug text-fg-muted">{p.brandStyles[style].hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
