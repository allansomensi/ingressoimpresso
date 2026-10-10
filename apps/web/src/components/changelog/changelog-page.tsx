"use client";

import type { ChangelogEntryDto, ChangelogKind } from "@ingressoimpresso/api-types";
import { ArrowRight, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";

import { KindBadge } from "@/components/changelog/kind-badge";
import { Badge, ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { CHANGELOG_KINDS, type ChangelogGroup, groupChangelog, markSeen, paragraphs, useChangelog } from "@/lib/changelog";
import { cn } from "@/lib/cn";
import { APP_VERSION, VERSION_LABEL, versionAnchor } from "@/lib/version";
import { texts } from "@/texts/pt-BR";

const t = texts.changelog;

type Filter = ChangelogKind | "all";

function monthLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
}

/** One note: kind, date, title and text (and its release, in the compact list of the bell). */
export function ChangelogEntry({ entry, compact = false }: { entry: ChangelogEntryDto; compact?: boolean }) {
  const date = entry.publishedAt ?? entry.createdAt;
  return (
    <article className={cn("flex flex-col gap-3", !compact && "rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-6")}>
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={entry.kind} />
        <time dateTime={date} className="text-xs text-fg-subtle">
          {dayLabel(date)}
        </time>
        {compact && entry.version !== null && <span className="text-xs text-fg-subtle tabular">v{entry.version}</span>}
      </div>
      <h3 className={cn("font-semibold tracking-tight text-fg", compact ? "text-sm" : "text-lg")}>{entry.title}</h3>
      {paragraphs(entry.body).map((paragraph, index) => (
        <p key={index} className={cn("leading-relaxed whitespace-pre-line text-fg-muted", compact ? "line-clamp-3 text-sm" : "text-[15px]")}>
          {paragraph}
        </p>
      ))}
    </article>
  );
}

/** Heading of a group: the release (with its anchor, `#v1.4.0`) or the month. */
function GroupHeading({ group }: { group: ChangelogGroup }) {
  if (group.kind === "month") {
    return <h2 className="sticky top-16 z-10 -mx-1 bg-bg/90 px-1 py-2 text-sm font-semibold text-fg-subtle backdrop-blur">{monthLabel(group.since)}</h2>;
  }
  return (
    <h2
      id={versionAnchor(group.version)}
      className="sticky top-16 z-10 -mx-1 flex scroll-mt-20 flex-wrap items-baseline gap-x-2 gap-y-1 bg-bg/90 px-1 py-2 backdrop-blur"
    >
      <a href={`#${versionAnchor(group.version)}`} className="text-base font-semibold text-fg tabular hover:underline">
        {t.release(group.version)}
      </a>
      <span className="text-sm text-fg-subtle">{monthLabel(group.since)}</span>
      {group.version === APP_VERSION && <Badge tone="brand">{t.currentRelease}</Badge>}
    </h2>
  );
}

/**
 * The public changelog as release notes (ADR 0049): filter by kind, notes by version. Opening it
 * marks every note as seen; a link to a release (`/novidades#v1.4.0`) scrolls to it once the notes
 * load.
 */
export function ChangelogPage() {
  const changelog = useChangelog();
  const [filter, setFilter] = useState<Filter>("all");
  const newest = changelog.data?.[0]?.publishedAt ?? null;
  const loaded = changelog.data !== undefined;

  useEffect(() => {
    if (newest !== null) {
      markSeen(newest);
    }
  }, [newest]);

  useEffect(() => {
    // Release anchors are plain ASCII (`v1.4.0`): no decoding needed.
    const anchor = window.location.hash.slice(1);
    if (loaded && anchor !== "") {
      document.getElementById(anchor)?.scrollIntoView();
    }
  }, [loaded]);

  const shown = (changelog.data ?? []).filter((entry) => filter === "all" || entry.kind === filter);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 lg:py-16">
      <div className="flex flex-col gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
          <Megaphone className="size-6" aria-hidden />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{t.title}</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-fg-muted">{t.subtitle}</p>
        <p className="text-sm text-fg-subtle tabular">{t.currentVersion(VERSION_LABEL)}</p>
      </div>

      <div role="radiogroup" aria-label={t.title} className="flex flex-wrap gap-2">
        {(["all", ...CHANGELOG_KINDS] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={filter === option}
            onClick={() => {
              setFilter(option);
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              filter === option
                ? "border-brand bg-brand-soft text-brand-soft-fg"
                : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {option === "all" ? t.all : t.kinds[option]}
          </button>
        ))}
      </div>

      {changelog.isPending ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : changelog.isError ? (
        <EmptyState icon={Megaphone} title={t.unavailable} />
      ) : shown.length === 0 ? (
        <EmptyState icon={Megaphone} title={filter === "all" ? t.empty : t.emptyFiltered} />
      ) : (
        <div className="flex flex-col gap-10">
          {groupChangelog(shown).map((group) => (
            <section key={group.kind === "release" ? group.version : group.since} className="flex flex-col gap-4">
              <GroupHeading group={group} />
              {group.entries.map((entry) => (
                <ChangelogEntry key={entry.id} entry={entry} />
              ))}
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-muted">{t.cta}</p>
        <ButtonLink href="/entrar" size="sm" icon={<ArrowRight />} className="flex-row-reverse">
          {t.ctaButton}
        </ButtonLink>
      </div>
    </div>
  );
}
