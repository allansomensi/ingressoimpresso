"use client";

import type { DoorGuestDto } from "@ingressoimpresso/api-types";
import { ArrowLeft, Check, CloudOff, RotateCcw, Search, UserRound, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { inkFor } from "@/lib/design-rules";
import type { DoorEngine, DoorState } from "@/portaria/engine";
import { canUndoArrival, clockTime, guestState, searchGuests, type GuestState } from "@/portaria/logic";
import { portaria as portariaTexts } from "@/texts/pt-BR";

const t = portariaTexts.guests;
/** Results drawn at once; the search narrows the rest. */
const MAX_SHOWN = 80;
/** How long the "recorded · undo" bar stays. */
const SNACK_MS = 8_000;

/**
 * The guest list on the door phone (ADR 0070): offline search by name, "arrived" with how many
 * people, undo by mistake on this phone for 2 minutes. Every tap is saved on the phone before
 * the screen changes, then sent like the scans.
 */
export function GuestList({ engine, state, now, onClose }: { engine: DoorEngine; state: DoorState; now: number; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [choosing, setChoosing] = useState<{ guest: DoorGuestDto; missing: number } | null>(null);
  const [snack, setSnack] = useState<{ id: string; name: string } | null>(null);
  const guests = useMemo(() => state.manifest?.guests ?? [], [state.manifest?.guests]);
  const offset = state.manifest?.offsetMs ?? 0;
  const serverNow = now + offset;

  const states = useMemo(() => {
    const map = new Map<string, GuestState>();
    for (const guest of guests) {
      map.set(guest.id, guestState(guest, state.arrivals));
    }
    return map;
  }, [guests, state.arrivals]);
  const arrived = [...states.values()].filter((item) => item.people > 0).length;
  const found = useMemo(() => searchGuests(guests, deferred), [guests, deferred]);
  const unsynced = new Set(state.arrivals.filter((arrival) => arrival.synced === 0).map((arrival) => arrival.id));

  useEffect(() => {
    if (snack === null) {
      return;
    }
    const timer = setTimeout(() => {
      setSnack(null);
    }, SNACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [snack]);

  const record = async (guest: DoorGuestDto, people: number) => {
    setChoosing(null);
    const arrival = await engine.arrive(guest.id, people);
    if (arrival !== null) {
      setSnack({ id: arrival.id, name: guest.name });
    }
  };

  const tapArrive = (guest: DoorGuestDto, state: GuestState) => {
    const missing = state.party - state.people;
    if (missing === 1) {
      void record(guest, 1);
    } else {
      setChoosing({ guest, missing });
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-[#0b0a12] text-neutral-50" role="dialog" aria-modal="true" aria-label={t.title}>
      <header className="flex flex-col gap-3 border-b border-white/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-2xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-white/85 transition active:bg-white/10"
          >
            <ArrowLeft className="size-6" aria-hidden />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">{t.title}</h1>
          {guests.length > 0 && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold whitespace-nowrap tabular-nums">
              {t.count(arrived, guests.length)}
            </span>
          )}
        </div>
        <label className="relative block">
          <span className="sr-only">{t.search}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-white/45" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder={t.searchPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="w-full rounded-2xl border border-white/15 bg-white/5 py-3.5 pr-11 pl-11 text-lg text-white placeholder:text-white/35 focus:border-[#7c66ff] focus:ring-4 focus:ring-[#7c66ff]/30 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query !== "" && (
            <button
              type="button"
              aria-label={t.clearSearch}
              onClick={() => {
                setQuery("");
              }}
              className="absolute top-1/2 right-1.5 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-white/60 active:bg-white/10"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </label>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(6rem,calc(env(safe-area-inset-bottom)+6rem))]">
        {state.manifest?.guests === undefined ? (
          <p className="mt-10 text-center text-white/70">{t.noList}</p>
        ) : guests.length === 0 ? (
          <p className="mt-10 text-center text-white/70">{t.empty}</p>
        ) : found.length === 0 ? (
          <p className="mt-10 text-center text-white/70">{t.noMatch(query.trim())}</p>
        ) : (
          <ul className="mx-auto flex max-w-2xl flex-col gap-2">
            {found.slice(0, MAX_SHOWN).map((guest) => {
              const status = states.get(guest.id) ?? guestState(guest, []);
              const missing = status.party - status.people;
              const undoable = [...status.arrivals].reverse().find((arrival) => canUndoArrival(arrival, state.ownArrivalIds, serverNow));
              return (
                <li
                  key={guest.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-3.5 ${status.people > 0 ? "border-emerald-400/25 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.04]"}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${status.people > 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/70"}`}
                      aria-hidden
                    >
                      {status.people > 0 ? <Check className="size-5" strokeWidth={3} /> : <UserRound className="size-5" />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-lg leading-snug font-semibold break-words">{guest.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/65">
                        <span>{t.party(guest.companions)}</span>
                        {guest.category !== null && (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-xs font-bold tracking-wide uppercase"
                            style={{ backgroundColor: guest.category.color, color: inkFor(guest.category.color) }}
                          >
                            {guest.category.name}
                          </span>
                        )}
                      </span>
                      {guest.note !== null && <span className="text-sm text-amber-200/90">{guest.note}</span>}
                      {status.first !== null && (
                        <span className="flex flex-col gap-0.5 text-sm">
                          <span className="font-medium text-emerald-300">{t.arrivedAt(clockTime(status.first.atUnixMs), status.first.deviceName)}</span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-white/70">
                            {status.party > 1 && <span>{t.inside(status.people, status.party)}</span>}
                            {status.arrivals.some((arrival) => unsynced.has(arrival.id)) && (
                              <span className="inline-flex items-center gap-1 text-amber-200/90">
                                <CloudOff className="size-3.5" aria-hidden />
                                {t.notSynced}
                              </span>
                            )}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {missing > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          tapArrive(guest, status);
                        }}
                        className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 text-lg font-bold text-[#0b0a12] transition active:scale-[0.98]"
                      >
                        <Check className="size-5" strokeWidth={3} aria-hidden />
                        {status.people === 0 ? t.arrive : t.arriveMore(missing)}
                      </button>
                    ) : (
                      <span className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-emerald-400/10 px-4 font-semibold text-emerald-200">
                        {t.allIn}
                      </span>
                    )}
                    {undoable !== undefined && (
                      <button
                        type="button"
                        onClick={() => {
                          void engine.undoArrival(undoable.id);
                        }}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 font-semibold text-white/90 transition active:bg-white/10"
                      >
                        <RotateCcw className="size-4" aria-hidden />
                        {t.undo}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {snack !== null && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div role="status" className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-white px-4 py-2.5 text-[#0b0a12] shadow-2xl">
            <Check className="size-5 shrink-0 text-emerald-600" strokeWidth={3} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate font-semibold">{snack.name}</span>
              <span className="text-sm text-black/60">{t.recorded}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                void engine.undoArrival(snack.id);
                setSnack(null);
              }}
              className="min-h-11 rounded-xl px-3 font-bold text-[#5b3df5] active:bg-black/5"
            >
              {t.undo}
            </button>
          </div>
        </div>
      )}

      {choosing !== null && (
        <PeopleSheet
          guest={choosing.guest}
          missing={choosing.missing}
          onCancel={() => {
            setChoosing(null);
          }}
          onConfirm={(people) => {
            void record(choosing.guest, people);
          }}
        />
      )}
    </div>
  );
}

/** How many of the party came in: big buttons, the whole party preselected. */
function PeopleSheet({
  guest,
  missing,
  onCancel,
  onConfirm,
}: {
  guest: DoorGuestDto;
  missing: number;
  onCancel: () => void;
  onConfirm: (people: number) => void;
}) {
  const [people, setPeople] = useState(missing);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.howMany}
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#17151f] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />
        <h2 className="text-xl font-bold">{t.howMany}</h2>
        <p className="mt-1 truncate text-white/65">{t.howManyHint(guest.name)}</p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {Array.from({ length: missing }, (_, index) => index + 1).map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={people === count}
              onClick={() => {
                setPeople(count);
              }}
              className={`flex h-14 items-center justify-center rounded-2xl text-2xl font-bold tabular-nums transition active:scale-95 ${people === count ? "bg-white text-[#0b0a12]" : "border border-white/15 bg-white/5 text-white"}`}
            >
              {count}
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onConfirm(people);
            }}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-lg font-bold text-black transition active:scale-[0.98]"
          >
            <Check className="size-5" strokeWidth={3} aria-hidden />
            {t.confirm(people)}
          </button>
          <button type="button" onClick={onCancel} className="min-h-12 rounded-2xl px-4 font-semibold text-white/80 active:bg-white/10">
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
