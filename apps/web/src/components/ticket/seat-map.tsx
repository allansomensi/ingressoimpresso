"use client";

import type { PassTableMapDto } from "@ingressoimpresso/api-types";
import { Armchair } from "lucide-react";
import { useMemo } from "react";

import { MAP_HEIGHT, MAP_WIDTH, chairPositions, seatMapLayout, tableLabels } from "@/lib/seat-map";
import { texts } from "@/texts/pt-BR";

const t = texts.ticket;
/** With more tables than this, only the holder's table is named (the others would be unreadable). */
const MAX_NAMED = 24;

/** "Onde fica a sua mesa": the room with the holder's table and seat highlighted (ADR 0066). */
export function SeatMap({ map }: { map: PassTableMapDto }) {
  const tables = useMemo(() => seatMapLayout(map.tables, map.table), [map]);
  const labels = useMemo(() => tableLabels(tables.map((table) => table.name)), [tables]);
  const mine = tables.find((table) => table.mine) ?? null;
  const chairs = mine === null ? [] : chairPositions(mine);
  const named = tables.length <= MAX_NAMED;
  const mineIndex = tables.findIndex((table) => table.mine);
  const mineLabel = labels[mineIndex] ?? map.table;
  // Labels keep a readable size whatever the zoom.
  const font = Math.max(11, Math.min(18, (mine?.width ?? 30) / (mineLabel.length > 3 ? 3.6 : 2.4)));

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-fg">{t.tableTitle}</h2>
          <p className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-fg">
            <Armchair aria-hidden className="size-5 text-brand" />
            {t.tableYours(map.table, map.seat)}
          </p>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${String(MAP_WIDTH)} ${String(MAP_HEIGHT)}`}
        role="img"
        aria-label={t.tableMapLabel(map.table)}
        className="w-full rounded-xl border border-border bg-surface-2"
      >
        {tables.map((table, index) => {
          const label = labels[index] ?? table.name;
          const common = {
            className: table.mine ? "fill-brand-solid stroke-brand" : "fill-surface stroke-border-strong",
            strokeWidth: table.mine ? 2 : 1.25,
          };
          return (
            <g key={table.name}>
              {table.shape === "round" ? (
                <ellipse cx={table.cx} cy={table.cy} rx={table.width / 2} ry={table.height / 2} {...common} />
              ) : (
                <rect
                  x={table.cx - table.width / 2}
                  y={table.cy - table.height / 2}
                  width={table.width}
                  height={table.height}
                  rx={3}
                  {...common}
                />
              )}
              {named && !table.mine && (
                <text
                  x={table.cx}
                  y={table.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-fg-muted font-semibold"
                  style={{ fontSize: Math.max(10, Math.min(15, table.width / (label.length > 3 ? 4 : 2.6))) }}
                >
                  {label.length > 8 ? `${label.slice(0, 7)}…` : label}
                </text>
              )}
            </g>
          );
        })}
        {mine !== null && (
          <g>
            {chairs.map((chair) => {
              const yours = chair.seat === map.seat;
              return (
                <circle
                  key={chair.seat}
                  cx={chair.x}
                  cy={chair.y}
                  r={yours ? Math.max(6, mine.width / 7.5) : Math.max(2.5, mine.width / 16)}
                  className={yours ? "fill-warning stroke-white" : "fill-surface stroke-brand"}
                  strokeWidth={yours ? 2 : 1}
                />
              );
            })}
            <text
              x={mine.cx}
              y={mine.cy}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-white font-bold"
              style={{ fontSize: font }}
            >
              {mineLabel.length > 8 ? `${mineLabel.slice(0, 7)}…` : mineLabel}
            </text>
          </g>
        )}
      </svg>
      <p className="flex items-center gap-2 text-xs text-fg-muted">
        <span aria-hidden className="size-2.5 rounded-full bg-warning ring-2 ring-white" />
        {t.tableYou}
        <span aria-hidden className="text-fg-subtle">·</span>
        <span className="text-fg-subtle">{t.tableHint}</span>
      </p>
    </section>
  );
}
