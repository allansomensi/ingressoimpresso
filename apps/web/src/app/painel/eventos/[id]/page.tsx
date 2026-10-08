"use client";

import type { EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { BatchesTab } from "@/components/event/batches";
import { DesignTab } from "@/components/event/design";
import { DoorTab } from "@/components/event/door";
import { FilesTab } from "@/components/event/files";
import { ReportTab } from "@/components/event/report";
import { SellersTab } from "@/components/event/sellers";
import { VoidsTab } from "@/components/event/voids";
import { ErrorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

const TABS = ["design", "batches", "sellers", "voids", "files", "door", "report"] as const;
type Tab = (typeof TABS)[number];

export default function EventPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const [tab, setTab] = useState<Tab>("design");
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => api<EventDto>(`/api/events/${eventId}`) });

  if (event.isPending) {
    return <p className="text-sm opacity-70">{texts.common.loading}</p>;
  }
  if (event.isError) {
    return <ErrorMessage error={event.error} />;
  }
  return (
    <main className="flex flex-col gap-4">
      <Link href="/painel" className="text-sm opacity-70 hover:underline">
        ← {texts.common.back}
      </Link>
      <h1 className="text-2xl font-bold">{event.data.name}</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-black/10 dark:border-white/15" role="tablist">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => {
              setTab(item);
            }}
            className={`whitespace-nowrap px-3 py-2 text-sm font-semibold ${tab === item ? "border-b-2 border-current" : "opacity-60"}`}
          >
            {texts.event.tabs[item]}
          </button>
        ))}
      </nav>
      {tab === "design" && <DesignTab eventId={eventId} />}
      {tab === "batches" && <BatchesTab eventId={eventId} />}
      {tab === "sellers" && <SellersTab eventId={eventId} />}
      {tab === "voids" && <VoidsTab eventId={eventId} />}
      {tab === "files" && <FilesTab eventId={eventId} />}
      {tab === "door" && <DoorTab eventId={eventId} />}
      {tab === "report" && <ReportTab eventId={eventId} />}
    </main>
  );
}
