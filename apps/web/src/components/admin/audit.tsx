"use client";

import type { AuditPageDto } from "@ingressoimpresso/api-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, History, Search, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { AuditLine } from "@/components/admin/organization-detail";
import { Button, EmptyState, ErrorMessage, Field, Input, Lead, List, LoadingBlock, Select, errorMessage } from "@/components/ui";
import { API_URL, ApiError, api, readToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.audit;
/** Action families (the server's `AUDIT_CATEGORIES`). */
const CATEGORIES = [
  "batch",
  "organization",
  "user",
  "support",
  "credits",
  "price",
  "promotion",
  "promo_code",
  "announcement",
  "changelog",
  "moderation",
  "settings",
  "incident",
  "email",
] as const;
type Period = "all" | "today" | "7d" | "30d" | "month" | "custom";
const PERIODS: readonly Period[] = ["all", "today", "7d", "30d", "month", "custom"];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** The instants of a period, in this device's time zone (`to` exclusive). */
function range(period: Period, from: string, to: string): { from: string | null; to: string | null } {
  const today = startOfDay(new Date());
  const days = (count: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - count);
  switch (period) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: today.toISOString(), to: null };
    case "7d":
      return { from: days(6).toISOString(), to: null };
    case "30d":
      return { from: days(29).toISOString(), to: null };
    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(), to: null };
    case "custom": {
      const start = from === "" ? null : new Date(`${from}T00:00:00`);
      const end = to === "" ? null : new Date(`${to}T00:00:00`);
      if (end !== null) {
        end.setDate(end.getDate() + 1);
      }
      return { from: start?.toISOString() ?? null, to: end?.toISOString() ?? null };
    }
  }
}

function categoryLabel(category: string): string {
  const labels: Readonly<Record<string, string>> = t.categories;
  return labels[category] ?? category;
}

/** The audit log (ADR 0032) with filters by period, family of action and text. */
export function AdminAudit() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [period, setPeriod] = useState<Period>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const search = useDeferredValue(query.trim());
  const instants = range(period, from, to);
  const params = new URLSearchParams();
  if (search !== "") {
    params.set("q", search);
  }
  if (category !== "") {
    params.set("category", category);
  }
  if (instants.from !== null) {
    params.set("from", instants.from);
  }
  if (instants.to !== null) {
    params.set("to", instants.to);
  }
  const filters = params.toString();
  const audit = useQuery({
    queryKey: ["admin", "audit", filters, page],
    queryFn: () => api<AuditPageDto>(`/api/admin/audit?${filters}&page=${String(page)}&perPage=25`),
    placeholderData: keepPreviousData,
  });
  const pages = audit.data === undefined ? 1 : Math.max(1, Math.ceil(audit.data.total / audit.data.perPage));
  const reset = () => {
    setPage(1);
  };
  const filtered = search !== "" || category !== "" || period !== "30d";

  const download = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/audit/export?${filters}`, {
        headers: { Authorization: `Bearer ${readToken() ?? ""}` },
      });
      if (!response.ok) {
        throw new ApiError(response.status, "generic");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = t.csvFile;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Lead>{t.intro}</Lead>
        <Button variant="secondary" icon={<Download />} loading={exporting} onClick={() => void download()}>
          {t.export}
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xs sm:p-4">
        <span className="relative flex">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            type="search"
            value={query}
            placeholder={t.search}
            aria-label={t.search}
            className="pl-10"
            onChange={(event) => {
              setQuery(event.target.value);
              reset();
            }}
          />
        </span>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            aria-label={t.category}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              reset();
            }}
          >
            <option value="">{t.allCategories}</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabel(item)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t.period}
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as Period);
              reset();
            }}
          >
            {PERIODS.map((item) => (
              <option key={item} value={item}>
                {t.periods[item]}
              </option>
            ))}
          </Select>
        </div>
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.from}>
              <Input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  reset();
                }}
              />
            </Field>
            <Field label={t.to}>
              <Input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  reset();
                }}
              />
            </Field>
          </div>
        )}
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            icon={<X />}
            className="w-fit"
            onClick={() => {
              setQuery("");
              setCategory("");
              setPeriod("30d");
              reset();
            }}
          >
            {t.clear}
          </Button>
        )}
      </div>
      {audit.isPending ? (
        <LoadingBlock rows={4} />
      ) : audit.isError ? (
        <ErrorMessage error={audit.error} />
      ) : audit.data.items.length === 0 ? (
        <EmptyState icon={History} title={filtered ? t.emptyFiltered : t.empty} />
      ) : (
        <>
          <List className={cn(audit.isPlaceholderData && "opacity-60")}>
            {audit.data.items.map((entry) => (
              <AuditLine key={entry.id} entry={entry} />
            ))}
          </List>
          <nav aria-label={t.pagination} className="flex items-center justify-between gap-3 text-sm text-fg-muted">
            <span>{t.total(audit.data.total)}</span>
            <span className="flex items-center gap-2">
              <Button variant="secondary" size="icon" aria-label={t.previous} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft />
              </Button>
              <span className="tabular">{t.page(page, pages)}</span>
              <Button variant="secondary" size="icon" aria-label={t.next} disabled={page >= pages} onClick={() => setPage(page + 1)}>
                <ChevronRight />
              </Button>
            </span>
          </nav>
        </>
      )}
    </div>
  );
}

