"use client";

import { useParams } from "next/navigation";

import { SeriesView } from "@/components/series/series-view";
import { isUuid } from "@/lib/api";

/** The dates of an event side by side (ADR 0077). */
export default function SeriesPage() {
  const params = useParams<{ id: string }>();
  // Anything but an id never reaches the API (a crafted address could aim at another endpoint).
  return <SeriesView seriesId={isUuid(params.id) ? params.id : ""} />;
}
