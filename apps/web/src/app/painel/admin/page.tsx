"use client";

import type { ModerationSummaryDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BadgePercent,
  Building2,
  ChevronDown,
  Coins,
  History,
  LayoutDashboard,
  Mail,
  Megaphone,
  Radio,
  Settings2,
  ShieldAlert,
  Ticket,
  TicketPercent,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ComponentType } from "react";

import { AdminBatches, AdminOrganizations, AdminOverview } from "@/components/admin/admin-views";
import { EmptyState, LoadingBlock, PageHeader, Popover } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

const t = texts.admin;

const loading = () => <LoadingBlock rows={4} />;
const load = (loader: () => Promise<ComponentType>) => dynamic(loader, { loading });
const SECTIONS = {
  overview: { slug: "visao-geral", icon: LayoutDashboard, view: AdminOverview },
  finance: { slug: "financeiro", icon: Wallet, view: load(() => import("@/components/admin/finance").then((m) => m.AdminFinance)) },
  organizations: { slug: "organizacoes", icon: Building2, view: AdminOrganizations },
  batches: { slug: "lotes", icon: Ticket, view: AdminBatches },
  prices: { slug: "precos", icon: Coins, view: load(() => import("@/components/admin/billing").then((m) => m.AdminPrices)) },
  promotions: { slug: "promocoes", icon: BadgePercent, view: load(() => import("@/components/admin/billing").then((m) => m.AdminPromotions)) },
  codes: { slug: "codigos", icon: TicketPercent, view: load(() => import("@/components/admin/billing").then((m) => m.AdminCodes)) },
  announcements: {
    slug: "pronunciamentos",
    icon: Radio,
    view: load(() => import("@/components/admin/announcements").then((m) => m.AdminAnnouncements)),
  },
  changelog: { slug: "novidades", icon: Megaphone, view: load(() => import("@/components/admin/changelog-admin").then((m) => m.AdminChangelog)) },
  emails: { slug: "emails", icon: Mail, view: load(() => import("@/components/admin/emails").then((m) => m.AdminEmails)) },
  moderation: { slug: "moderacao", icon: ShieldAlert, view: load(() => import("@/components/admin/moderation").then((m) => m.AdminModeration)) },
  audit: { slug: "auditoria", icon: History, view: load(() => import("@/components/admin/audit").then((m) => m.AdminAudit)) },
  settings: { slug: "plataforma", icon: Settings2, view: load(() => import("@/components/admin/settings").then((m) => m.AdminSettings)) },
  status: { slug: "status", icon: Activity, view: load(() => import("@/components/admin/incidents").then((m) => m.AdminIncidents)) },
} satisfies Record<string, { slug: string; icon: LucideIcon; view: ComponentType }>;
type Section = keyof typeof SECTIONS;

const GROUPS: readonly { key: keyof typeof t.groups; sections: readonly Section[] }[] = [
  { key: "overview", sections: ["overview", "finance"] },
  { key: "customers", sections: ["organizations", "batches"] },
  { key: "sales", sections: ["prices", "promotions", "codes"] },
  { key: "communication", sections: ["announcements", "changelog", "emails"] },
  { key: "safety", sections: ["moderation", "audit"] },
  { key: "platform", sections: ["settings", "status"] },
];

const ALL = Object.keys(SECTIONS) as Section[];

export default function AdminPage() {
  return (
    <Suspense fallback={<LoadingBlock rows={4} />}>
      <AdminView />
    </Suspense>
  );
}

function SectionLinks({ current, onSelect, open }: { current: Section; onSelect: (section: Section) => void; open: number }) {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{t.groups[group.key]}</p>
          {group.sections.map((section) => {
            const { icon: Icon } = SECTIONS[section];
            const selected = section === current;
            return (
              <button
                key={section}
                type="button"
                aria-current={selected ? "page" : undefined}
                data-dismiss
                onClick={() => {
                  onSelect(section);
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition max-sm:py-3 max-sm:text-[15px]",
                  selected ? "bg-brand-soft text-brand-soft-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="flex-1">{t.tabs[section]}</span>
                {section === "moderation" && open > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-solid px-1.5 text-[11px] font-semibold text-white">
                    {open > 99 ? "99+" : open}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function AdminView() {
  const { session } = useSession();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = session.status === "signed-in" && session.user.isAdmin;
  const moderation = useQuery({
    queryKey: ["admin", "moderation", "summary"],
    queryFn: () => api<ModerationSummaryDto>("/api/admin/moderation/summary"),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });
  const section = ALL.find((item) => SECTIONS[item].slug === search.get("aba")) ?? "overview";
  if (!isAdmin) {
    return <EmptyState icon={ShieldAlert} title={t.forbiddenTitle} description={t.forbidden} />;
  }
  const open = moderation.data?.open ?? 0;
  const select = (next: Section) => {
    router.replace(`${pathname}?aba=${SECTIONS[next].slug}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const { view: View, icon: CurrentIcon } = SECTIONS[section];

  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title={t.title} description={t.subtitle} />
      {/* Phones: the current section opens a sheet with all of them. */}
      <div className="sm:hidden">
        <Popover
          label={t.sections}
          align="start"
          triggerClassName="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left shadow-xs"
          trigger={
            <>
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
                <CurrentIcon className="size-[18px]" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs text-fg-subtle">{t.sections}</span>
                <span className="font-semibold text-fg">{t.tabs[section]}</span>
              </span>
              {open > 0 && section !== "moderation" && <span className="size-2 rounded-full bg-danger" aria-label={t.moderationPending(open)} />}
              <ChevronDown className="size-5 text-fg-muted" aria-hidden />
            </>
          }
        >
          <div className="px-1 pb-2">
            <SectionLinks current={section} onSelect={select} open={open} />
          </div>
        </Popover>
      </div>
      <div className="grid items-start gap-8 sm:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label={t.sections} className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto pb-6 sm:block">
          <SectionLinks current={section} onSelect={select} open={open} />
        </nav>
        <div key={section} className="min-w-0 animate-fade-in">
          <View />
        </div>
      </div>
    </main>
  );
}
