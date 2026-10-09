"use client";

import { Building2, LayoutDashboard, ShieldAlert, Ticket, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { AdminBatches, AdminOrganizations, AdminOverview } from "@/components/admin/admin-views";
import { EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

const t = texts.admin;
const TABS = ["overview", "organizations", "batches"] as const;
type AdminTab = (typeof TABS)[number];
const ICONS: Record<AdminTab, LucideIcon> = { overview: LayoutDashboard, organizations: Building2, batches: Ticket };

export default function AdminPage() {
  const { session } = useSession();
  const [tab, setTab] = useState<AdminTab>("overview");
  if (session.status !== "signed-in" || !session.user.isAdmin) {
    return <EmptyState icon={ShieldAlert} title={t.forbiddenTitle} description={t.forbidden} />;
  }

  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <PageHeader title={t.title} description={t.subtitle} />
      <nav role="tablist" aria-label={t.title} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
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
                setTab(item);
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
      <div role="tabpanel">
        {tab === "overview" && <AdminOverview />}
        {tab === "organizations" && <AdminOrganizations />}
        {tab === "batches" && <AdminBatches />}
      </div>
    </main>
  );
}
