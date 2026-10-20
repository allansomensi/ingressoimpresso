"use client";

import type { ModerationSummaryDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BadgePercent,
  BellRing,
  Building2,
  CalendarDays,
  Coins,
  Filter,
  Gift,
  History,
  LayoutDashboard,
  Mail,
  Megaphone,
  Radio,
  RadioTower,
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
import { useOpenAlerts } from "@/components/admin/alerts";
import { useLiveProblems } from "@/components/admin/insights";
import { SectionNav, type NavGroup } from "@/components/panel/section-nav";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { admin as adminTexts } from "@/texts/pt-BR/admin";

const t = adminTexts;

const loading = () => <LoadingBlock rows={4} />;
const load = (loader: () => Promise<ComponentType>) => dynamic(loader, { loading });
const SECTIONS = {
  overview: { slug: "visao-geral", icon: LayoutDashboard, view: AdminOverview },
  // What went wrong and reached the admins (ADR 0103).
  alerts: { slug: "alertas", icon: BellRing, view: load(() => import("@/components/admin/alerts").then((m) => m.AdminAlerts)) },
  // The events around now and the funnel (ADR 0099).
  live: { slug: "agora", icon: RadioTower, view: load(() => import("@/components/admin/insights").then((m) => m.AdminLive)) },
  funnel: { slug: "funil", icon: Filter, view: load(() => import("@/components/admin/insights").then((m) => m.AdminFunnel)) },
  finance: { slug: "financeiro", icon: Wallet, view: load(() => import("@/components/admin/finance").then((m) => m.AdminFinance)) },
  organizations: { slug: "organizacoes", icon: Building2, view: AdminOrganizations },
  // Any event of any organization, opened in support mode (ADR 0079).
  events: { slug: "eventos", icon: CalendarDays, view: load(() => import("@/components/admin/admin-events").then((m) => m.AdminEvents)) },
  batches: { slug: "lotes", icon: Ticket, view: AdminBatches },
  prices: { slug: "precos", icon: Coins, view: load(() => import("@/components/admin/billing").then((m) => m.AdminPrices)) },
  promotions: { slug: "promocoes", icon: BadgePercent, view: load(() => import("@/components/admin/billing").then((m) => m.AdminPromotions)) },
  codes: { slug: "codigos", icon: TicketPercent, view: load(() => import("@/components/admin/billing").then((m) => m.AdminCodes)) },
  // Refer and earn (ADR 0076).
  referrals: { slug: "indicacoes", icon: Gift, view: load(() => import("@/components/admin/referrals").then((m) => m.AdminReferrals)) },
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
  { key: "overview", sections: ["overview", "alerts", "live", "funnel", "finance"] },
  { key: "customers", sections: ["organizations", "events", "batches"] },
  { key: "sales", sections: ["prices", "promotions", "codes", "referrals"] },
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
  const troubled = useLiveProblems(isAdmin);
  const alerts = useOpenAlerts(isAdmin);
  if (!isAdmin) {
    return <EmptyState icon={ShieldAlert} title={t.forbiddenTitle} description={t.forbidden} />;
  }
  const open = moderation.data?.open ?? 0;
  const select = (next: Section) => {
    router.replace(`${pathname}?aba=${SECTIONS[next].slug}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const { view: View } = SECTIONS[section];
  const groups: NavGroup<Section>[] = GROUPS.map((group) => ({
    key: group.key,
    label: t.groups[group.key],
    items: group.sections.map((item) => ({
      key: item,
      label: t.tabs[item],
      icon: SECTIONS[item].icon,
      mark:
        item === "moderation" && open > 0
          ? { kind: "count", value: open, label: t.moderationPending(open) }
          : item === "alerts" && alerts > 0
            ? { kind: "count", value: alerts, label: t.alerts.open(alerts) }
            : item === "live" && troubled > 0
            ? { kind: "count", value: troubled, label: t.live.troubled(troubled) }
            : undefined,
    })),
  }));

  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title={t.title} description={t.subtitle} />
      {/* The sections down the side on larger screens, a bar that opens them on smaller ones. */}
      <div className="grid items-start gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-[calc(5rem+env(safe-area-inset-top))] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <SectionNav label={t.sections} groups={groups} current={section} onSelect={select} sticky />
        </div>
        <div key={section} className="min-w-0 animate-fade-in">
          <View />
        </div>
      </div>
    </main>
  );
}
