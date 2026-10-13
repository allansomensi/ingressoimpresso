"use client";

import type { OrganizationProfileDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, LifeBuoy, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ProfileEditor } from "@/components/organization/profile-editor";
import { EmptyState, ErrorMessage, LoadingBlock, PageHeader } from "@/components/ui";
import { api, isUuid } from "@/lib/api";
import { useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

/** Any organization's public profile, with the organizer's own editor, in support mode (ADR 0079). */
export default function AdminOrganizationProfilePage() {
  const { session } = useSession();
  const params = useParams<{ id: string }>();
  const allowed = session.status === "signed-in" && session.user.isAdmin && isUuid(params.id);
  if (!allowed) {
    return <EmptyState icon={ShieldAlert} title={texts.admin.forbiddenTitle} description={texts.admin.forbidden} />;
  }
  return <SupportProfile organizationId={params.id} />;
}

function SupportProfile({ organizationId }: { organizationId: string }) {
  const endpoint = `/api/admin/organizations/${organizationId}/profile`;
  const queryKey = ["admin", "organization-profile", organizationId];
  const profile = useQuery({ queryKey, queryFn: () => api<OrganizationProfileDto>(endpoint) });
  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <Link
        href={`/painel/admin/organizacoes/${organizationId}`}
        className="-ml-1.5 inline-flex min-h-9 w-fit items-center gap-1 rounded-lg px-1.5 text-sm font-medium text-fg-muted transition hover:text-fg active:bg-surface-2 pointer-coarse:min-h-10"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {texts.admin.support.backToOrganization}
      </Link>
      {profile.data !== undefined && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-fg">
          <LifeBuoy className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{texts.admin.support.profileBanner(profile.data.organizationName)}</span>
        </div>
      )}
      <PageHeader title={texts.profile.title} description={texts.profile.description} />
      {profile.isPending ? (
        <LoadingBlock rows={5} />
      ) : profile.isError ? (
        <ErrorMessage error={profile.error} />
      ) : (
        <ProfileEditor key={profile.dataUpdatedAt} profile={profile.data} target={{ endpoint, queryKey, support: true }} />
      )}
    </main>
  );
}
