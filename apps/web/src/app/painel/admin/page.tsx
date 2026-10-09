"use client";

import { Building2, History, LayoutDashboard, Megaphone, ShieldAlert, Ticket, Wallet, type LucideIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AdminBatches, AdminOrganizations, AdminOverview } from "@/components/admin/admin-views";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

const t = texts.admin;
const TABS = ["overview", "finance", "organizations", "batches", "changelog", "audit"] as const;
type AdminTab = (typeof TABS)[number];
const SLUGS: Record<AdminTab, string> = {
  overview: "visao-geral",
  finance: "financeiro",
  organizations: "organizacoes",
  batches: "lotes",
  changelog: "novidades",
  audit: "auditoria",
};
const ICONS: Record<AdminTab, LucideIcon> = {
  overview: LayoutDashboard,
  finance: Wallet,
  organizations: Building2,
  batches: Ticket,
  changelog: Megaphone,
  audit: History,
};

const loading = () => <LoadingBlock rows={4} />;
const AdminFinance = dynamic(() => import("@/components/admin/finance").then((m) => m.AdminFinance), { loading });
const AdminChangelog = dynamic(() => import("@/components/admin/changelog-admin").then((m) => m.AdminChangelog), { loading });
const AdminAudit = dynamic(() => import("@/components/admin/changelog-admin").then((m) => m.AdminAudit), { loading });

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
  const tab = TABS.find((item) => SLUGS[item] === search.get("aba")) ?? "overview";
  if (session.status !== "signed-in" || !session.user.isAdmin) {
    return <EmptyState icon={ShieldAlert} title={t.forbiddenTitle} description={t.forbidden} />;
  }

  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title={t.title} description={t.subtitle} />
      <nav
        role="tablist"
        aria-label={t.title}
        className="-mb-px flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((item) => {
          const Icon = ICONS[item];
          const selected = tab === item;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                router.replace(`${pathname}?aba=${SLUGS[item]}`, { scroll: false });
              }}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition",
                selected ? "border-brand text-fg" : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              <Icon aria-hidden className={cn("size-4", selected ? "text-brand" : "text-fg-subtle")} />
              {t.tabs[item]}
            </button>
          );
        })}
      </nav>
      <div role="tabpanel" key={tab} className="animate-fade-in">
        {tab === "overview" && <AdminOverview />}
        {tab === "finance" && <AdminFinance />}
        {tab === "organizations" && <AdminOrganizations />}
        {tab === "batches" && <AdminBatches />}
        {tab === "changelog" && <AdminChangelog />}
        {tab === "audit" && <AdminAudit />}
      </div>
    </main>
  );
}
