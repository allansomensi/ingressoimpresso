"use client";

import type { NumberRangeDto, SeatDto, SeatTicketsBody, TableBody, TableDto, TableShape, TablesBulkBody, TablesLayoutBody } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Armchair, LayoutGrid, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import { ReadOnlyNotice } from "@/components/event/access";
import { Button, Card, Dialog, ErrorMessage, Field, Input, Lead, LoadingBlock, NumberInput, errorMessage, useConfirm } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { clampPosition, compareTables, findSeat } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { ticketNumber } from "@/lib/format";
import { formatRanges, parseNumberList } from "@/lib/number-list";
import { texts } from "@/texts/pt-BR";

const t = texts.event.tables;

/** Diameter (round) or width (long) of a table on the map, in % of the map's width. */
function tableSize(table: Pick<TableDto, "seats" | "shape">): { width: number; height: number } {
  if (table.shape === "rect") {
    return { width: Math.min(18, 7 + table.seats * 0.55), height: 5.5 };
  }
  const diameter = Math.min(11, 6 + table.seats * 0.32);
  return { width: diameter, height: diameter };
}

type Positions = Record<string, { x: number; y: number }>;

export function TablesSection({ eventId, editable }: { eventId: string; editable: boolean }) {
  const queryClient = useQueryClient();
  const key = ["tables", eventId];
  const tables = useQuery({ queryKey: key, queryFn: () => api<TableDto[]>(`/api/events/${eventId}/tables`) });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<"bulk" | "add" | null>(null);
  const [editing, setEditing] = useState<TableDto | null>(null);
  const [findText, setFindText] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
  };

  if (tables.isPending) {
    return <LoadingBlock rows={2} />;
  }
  if (tables.isError) {
    return <ErrorMessage error={tables.error} />;
  }
  const list = tables.data;
  const seats = list.reduce((sum, table) => sum + table.seats, 0);
  const seated = list.reduce((sum, table) => sum + table.guests.length, 0);
  const findNumber = Number.parseInt(findText.replace(/\D/g, ""), 10);
  const found = Number.isInteger(findNumber) && findNumber > 0 ? findSeat(list, findNumber) : null;
  const current = list.find((table) => table.id === open) ?? null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{t.title}</h2>
          <Lead>{t.intro}</Lead>
        </div>
        {editable && list.length > 0 && (
          <div className="flex w-full gap-2 sm:w-fit">
            <Button variant="secondary" icon={<LayoutGrid />} className="flex-1 sm:flex-none" onClick={() => { setForm("bulk"); }}>
              {t.createMany}
            </Button>
            <Button icon={<Plus />} className="flex-1 sm:flex-none" onClick={() => { setForm("add"); }}>
              {t.addOne}
            </Button>
          </div>
        )}
      </div>
      {!editable && <ReadOnlyNotice eventId={eventId} area="delivery" />}

      {list.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
            <Armchair className="size-6" aria-hidden />
          </span>
          <p className="text-base font-semibold text-fg">{t.emptyTitle}</p>
          <p className="max-w-md text-sm leading-relaxed text-fg-muted">{t.emptyBody}</p>
          {editable && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button icon={<LayoutGrid />} onClick={() => { setForm("bulk"); }}>
                {t.createMany}
              </Button>
              <Button variant="secondary" icon={<Plus />} onClick={() => { setForm("add"); }}>
                {t.addOne}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex flex-col">
              <h3 className="text-base font-semibold text-fg">{t.map}</h3>
              <p className="text-sm text-fg-muted tabular">{t.summary(list.length, seated, seats)}</p>
            </div>
            <label className="relative flex w-full items-center sm:w-56">
              <Search className="pointer-events-none absolute left-3 size-4 text-fg-subtle" aria-hidden />
              <Input
                aria-label={t.find}
                placeholder={t.find}
                value={findText}
                inputMode="numeric"
                className="pl-9"
                onChange={(changeEvent) => {
                  setFindText(changeEvent.target.value);
                }}
              />
            </label>
          </div>
          {findText.trim() !== "" && Number.isInteger(findNumber) && (
            <p role="status" className="border-b border-border bg-surface-2 px-5 py-2.5 text-sm text-fg sm:px-6">
              <span className="font-mono font-semibold tabular">{ticketNumber(findNumber)}</span>
              {" · "}
              {found === null ? <span className="text-fg-muted">{t.notFound}</span> : t.found(found.table.name, found.seat)}
            </p>
          )}
          <TableMap
            eventId={eventId}
            tables={list}
            editable={editable}
            highlight={found?.table.id ?? null}
            onOpen={setOpen}
            onSaved={refresh}
          />
          <div className="border-t border-border px-5 py-4 sm:px-6">
            <h3 className="mb-3 text-sm font-medium text-fg-muted">{t.list}</h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[...list].sort(compareTables).map((table) => {
                const full = table.guests.length >= table.seats;
                return (
                  <li key={table.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(table.id);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition hover:border-border-strong hover:bg-surface-2",
                        found?.table.id === table.id ? "border-brand ring-2 ring-brand/30" : "border-border",
                      )}
                    >
                      <span className="truncate font-medium text-fg">{table.name}</span>
                      <span className={cn("shrink-0 text-xs tabular", full ? "font-semibold text-success-fg" : "text-fg-muted")}>
                        {t.occupancy(table.guests.length, table.seats)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      )}

      {current !== null && (
        <TableDialog
          key={current.id}
          table={current}
          editable={editable}
          onClose={() => {
            setOpen(null);
          }}
          onEdit={() => {
            setEditing(current);
            setOpen(null);
          }}
          onChange={refresh}
        />
      )}
      {form === "bulk" && (
        <BulkDialog
          eventId={eventId}
          onClose={() => {
            setForm(null);
          }}
          onSaved={refresh}
        />
      )}
      {(form === "add" || editing !== null) && (
        <TableFormDialog
          key={editing?.id ?? "new"}
          eventId={eventId}
          table={editing}
          onClose={() => {
            setForm(null);
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
    </section>
  );
}

/** The room: tables at their positions, dragged to move (saved when dropped), tapped to open. */
function TableMap({
  eventId,
  tables,
  editable,
  highlight,
  onOpen,
  onSaved,
}: {
  eventId: string;
  tables: readonly TableDto[];
  editable: boolean;
  highlight: string | null;
  onOpen: (id: string) => void;
  onSaved: () => void;
}) {
  const map = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const [moving, setMoving] = useState<Positions>({});
  const save = useMutation({
    mutationFn: (positions: Positions) => {
      const body: TablesLayoutBody = { positions: Object.entries(positions).map(([id, { x, y }]) => ({ id, x, y })) };
      return api(`/api/events/${eventId}/tables/layout`, { method: "PUT", body });
    },
    onSuccess: () => {
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      setMoving({});
    },
  });

  const position = (event: ReactPointerEvent) => {
    const rect = map.current?.getBoundingClientRect();
    if (rect === undefined) {
      return null;
    }
    return { x: clampPosition((event.clientX - rect.left) / rect.width), y: clampPosition((event.clientY - rect.top) / rect.height) };
  };
  const down = (event: ReactPointerEvent, id: string) => {
    drag.current = { id, startX: event.clientX, startY: event.clientY, moved: false };
    if (editable) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const move = (event: ReactPointerEvent) => {
    const current = drag.current;
    if (current === null || !editable) {
      return;
    }
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 4) {
      return;
    }
    current.moved = true;
    const next = position(event);
    if (next !== null) {
      setMoving((positions) => ({ ...positions, [current.id]: next }));
    }
  };
  const up = (id: string) => {
    const current = drag.current;
    drag.current = null;
    if (current === null) {
      return;
    }
    const dropped = moving[id];
    if (current.moved && dropped !== undefined) {
      save.mutate({ [id]: dropped });
    } else {
      onOpen(id);
    }
  };

  return (
    <div className="p-3 sm:p-5">
      <div ref={map} className="@container relative aspect-[4/3] w-full touch-pan-y overflow-hidden rounded-xl border border-border bg-surface-2 bg-dots sm:aspect-[16/9]">
        {tables.map((table) => {
          const at = moving[table.id] ?? { x: table.x, y: table.y };
          const size = tableSize(table);
          const taken = table.guests.length;
          const full = taken >= table.seats;
          const style: CSSProperties = {
            left: `${String(at.x * 100)}%`,
            top: `${String(at.y * 100)}%`,
            width: `${String(size.width)}cqw`,
            height: `${String(size.height)}cqw`,
            minWidth: 44,
            minHeight: table.shape === "rect" ? 30 : 44,
          };
          return (
            <button
              key={table.id}
              type="button"
              aria-label={`${table.name}: ${t.seatsTaken(taken, table.seats)}`}
              onPointerDown={(event) => {
                down(event, table.id);
              }}
              onPointerMove={move}
              onPointerUp={() => {
                up(table.id);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setMoving({});
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(table.id);
                }
              }}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border-2 bg-surface text-center shadow-sm transition-[box-shadow,border-color] select-none focus-visible:outline-2 focus-visible:outline-brand",
                table.shape === "round" ? "rounded-full" : "rounded-lg",
                editable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer",
                full ? "border-success" : taken > 0 ? "border-brand" : "border-border-strong",
                highlight === table.id && "z-10 ring-4 ring-brand/40",
                moving[table.id] !== undefined && "z-20 shadow-lg",
              )}
              style={style}
            >
              <Chairs table={table} />
              <span className="max-w-full truncate px-1 text-[max(10px,1.35cqw)] leading-tight font-semibold text-fg">{table.name}</span>
              <span className={cn("text-[max(9px,1.15cqw)] leading-tight tabular", full ? "font-semibold text-success-fg" : "text-fg-muted")}>
                {t.occupancy(taken, table.seats)}
              </span>
            </button>
          );
        })}
      </div>
      {editable && <p className="mt-2 text-xs text-fg-muted">{t.mapHint}</p>}
    </div>
  );
}

/** Chairs around a table on the map: filled when the seat has a ticket. */
function Chairs({ table }: { table: TableDto }) {
  if (table.seats > 24) {
    return null;
  }
  const taken = new Set(table.guests.map((guest) => guest.seat));
  const chairs = Array.from({ length: table.seats }, (_, index) => index + 1);
  const place = (seat: number): CSSProperties => {
    if (table.shape === "round") {
      const angle = ((seat - 1) / table.seats) * 2 * Math.PI - Math.PI / 2;
      return { left: `${String(50 + 64 * Math.cos(angle))}%`, top: `${String(50 + 64 * Math.sin(angle))}%` };
    }
    // Long table: half the chairs on each side.
    const perSide = Math.ceil(table.seats / 2);
    const side = seat <= perSide ? 0 : 1;
    const index = side === 0 ? seat - 1 : seat - 1 - perSide;
    return { left: `${String(((index + 0.5) / perSide) * 100)}%`, top: side === 0 ? "-22%" : "122%" };
  };
  return (
    <>
      {chairs.map((seat) => (
        <span
          key={seat}
          aria-hidden
          className={cn(
            "absolute size-[max(6px,0.9cqw)] -translate-x-1/2 -translate-y-1/2 rounded-full border",
            taken.has(seat) ? "border-brand bg-brand" : "border-border-strong bg-surface",
          )}
          style={place(seat)}
        />
      ))}
    </>
  );
}

function TableDialog({
  table,
  editable,
  onClose,
  onEdit,
  onChange,
}: {
  table: TableDto;
  editable: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const parsed = parseNumberList(text);
  const seat = useMutation({
    mutationFn: (moveSeated: boolean) => {
      const ranges: NumberRangeDto[] = parsed.ok ? parsed.ranges : [];
      const body: SeatTicketsBody = { ranges, moveSeated };
      return api<SeatDto[]>(`/api/tables/${table.id}/tickets`, { method: "POST", body });
    },
    onSuccess: (_, moveSeated) => {
      toast.success(t.seated(parsed.ok ? parsed.count : 0));
      setText("");
      onChange();
      if (moveSeated) {
        seat.reset();
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "already_seated") {
        void confirm({ title: t.moveTitle, description: t.moveBody, confirmLabel: t.move, danger: false }).then((ok) => {
          if (ok) {
            seat.mutate(true);
          }
        });
      }
    },
  });
  const unseat = useMutation({
    mutationFn: (number: number) => api(`/api/tables/${table.id}/tickets/remove`, { method: "POST", body: { number } }),
    onSuccess: () => {
      toast.success(t.unseated);
      onChange();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/tables/${table.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.removed);
      onClose();
      onChange();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const bySeat = new Map(table.guests.map((guest) => [guest.seat, guest.number]));
  const free = table.seats - table.guests.length;
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (parsed.ok) {
      seat.mutate(false);
    }
  };
  const showError = seat.error instanceof ApiError && seat.error.code === "already_seated" ? null : seat.error;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t.seatTitle(table.name)}
      description={`${t.seatsTaken(table.guests.length, table.seats)} · ${t.shapes[table.shape]}`}
      footer={
        editable ? (
          <>
            <Button
              variant="ghost"
              icon={<Trash2 />}
              className="text-danger-fg sm:mr-auto"
              loading={remove.isPending}
              onClick={() => {
                void confirm({ title: t.removeTitle(table.name), description: t.removeBody, confirmLabel: t.remove }).then((ok) => {
                  if (ok) {
                    remove.mutate();
                  }
                });
              }}
            >
              {t.remove}
            </Button>
            <Button variant="secondary" icon={<Pencil />} onClick={onEdit}>
              {t.edit}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {editable && free > 0 && (
          <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
            <Field label={t.seatAdd} hint={t.seatHint}>
              <div className="flex gap-2">
                <Input
                  value={text}
                  inputMode="numeric"
                  placeholder={t.seatPlaceholder}
                  onChange={(changeEvent) => {
                    setText(changeEvent.target.value);
                  }}
                />
                <Button type="submit" loading={seat.isPending} disabled={!parsed.ok}>
                  {t.seatSubmit}
                </Button>
              </div>
            </Field>
            <ErrorMessage error={showError} />
          </form>
        )}
        {free === 0 && <p className="rounded-xl bg-success-soft px-3 py-2 text-sm font-medium text-success-fg">{t.full}</p>}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: table.seats }, (_, index) => index + 1).map((number) => {
            const ticket = bySeat.get(number);
            return (
              <li
                key={number}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm",
                  ticket === undefined ? "border-dashed border-border text-fg-subtle" : "border-border bg-surface",
                )}
              >
                <span className="flex flex-col">
                  <span className="text-[11px] text-fg-muted">{t.seat(number)}</span>
                  <span className={cn("font-mono tabular", ticket === undefined ? "" : "font-semibold text-fg")}>
                    {ticket === undefined ? t.free : ticketNumber(ticket)}
                  </span>
                </span>
                {editable && ticket !== undefined && (
                  <button
                    type="button"
                    aria-label={t.unseat(formatRanges([{ first: ticket, last: ticket }]))}
                    className="flex size-7 items-center justify-center rounded-md text-fg-subtle transition hover:bg-danger-soft hover:text-danger-fg"
                    onClick={() => {
                      unseat.mutate(ticket);
                    }}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}

function ShapePicker({ value, onChange }: { value: TableShape; onChange: (shape: TableShape) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-fg">{t.shape}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["round", "rect"] as const).map((shape) => (
          <label
            key={shape}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
              value === shape ? "border-brand bg-brand-soft/60 font-medium text-fg" : "border-border text-fg-muted hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name="shape"
              className="sr-only"
              checked={value === shape}
              onChange={() => {
                onChange(shape);
              }}
            />
            <span aria-hidden className={cn("size-5 border-2 border-current", shape === "round" ? "rounded-full" : "h-3.5 w-7 rounded-sm")} />
            {t.shapes[shape]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function BulkDialog({ eventId, onClose, onSaved }: { eventId: string; onClose: () => void; onSaved: () => void }) {
  const [count, setCount] = useState(10);
  const [seats, setSeats] = useState(8);
  const [shape, setShape] = useState<TableShape>("round");
  const [prefix, setPrefix] = useState("Mesa");
  const valid = Number.isInteger(count) && count >= 1 && count <= 200 && Number.isInteger(seats) && seats >= 1 && seats <= 50 && prefix.trim() !== "";
  const save = useMutation({
    mutationFn: () => {
      const body: TablesBulkBody = { count, seats, shape, prefix: prefix.trim() };
      return api(`/api/events/${eventId}/tables/bulk`, { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(t.created);
      onSaved();
      onClose();
    },
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (valid) {
      save.mutate();
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.bulkTitle}
      description={t.bulkBody}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button type="submit" form="tables-bulk" loading={save.isPending} disabled={!valid}>
            {t.create(count)}
          </Button>
        </>
      }
    >
      <form id="tables-bulk" onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.count}>
            <NumberInput value={count} step={1} min={1} max={200} onChange={setCount} />
          </Field>
          <Field label={t.seats}>
            <NumberInput value={seats} step={1} min={1} max={50} onChange={setSeats} />
          </Field>
        </div>
        <Field label={t.prefix} hint={t.prefixHint(`${prefix.trim() || "Mesa"} 1, ${prefix.trim() || "Mesa"} 2`)}>
          <Input
            value={prefix}
            maxLength={20}
            onChange={(changeEvent) => {
              setPrefix(changeEvent.target.value);
            }}
          />
        </Field>
        <ShapePicker value={shape} onChange={setShape} />
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

function TableFormDialog({ eventId, table, onClose, onSaved }: { eventId: string; table: TableDto | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(table?.name ?? "");
  const [seats, setSeats] = useState(table?.seats ?? 8);
  const [shape, setShape] = useState<TableShape>(table?.shape ?? "round");
  const valid = name.trim() !== "" && Number.isInteger(seats) && seats >= 1 && seats <= 50;
  const save = useMutation({
    mutationFn: () => {
      const body: TableBody = { name: name.trim(), seats, shape, x: null, y: null };
      return table === null
        ? api<TableDto>(`/api/events/${eventId}/tables`, { method: "POST", body })
        : api(`/api/tables/${table.id}`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(t.saved);
      onSaved();
      onClose();
    },
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (valid) {
      save.mutate();
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={table === null ? t.tableTitle : t.edit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button type="submit" form="table-form" loading={save.isPending} disabled={!valid}>
            {t.save}
          </Button>
        </>
      }
    >
      <form id="table-form" onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <Field label={t.name}>
            <Input
              value={name}
              maxLength={30}
              required
              placeholder={t.namePlaceholder}
              onChange={(changeEvent) => {
                setName(changeEvent.target.value);
              }}
            />
          </Field>
          <Field label={t.seats} className="w-32">
            <NumberInput value={seats} step={1} min={1} max={50} onChange={setSeats} />
          </Field>
        </div>
        <ShapePicker value={shape} onChange={setShape} />
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}
