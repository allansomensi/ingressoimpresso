"use client";

import type { OrganizationProfileDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { ProfileEditor, type ProfileTarget } from "@/components/organization/profile-editor";
import { ErrorMessage, LoadingBlock, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

const t = texts.profile;
const KEY = ["organization-profile"];
const TARGET: ProfileTarget = { endpoint: "/api/account/profile", queryKey: KEY };

export default function OrganizationProfilePage() {
  const profile = useQuery({ queryKey: KEY, queryFn: () => api<OrganizationProfileDto>("/api/account/profile") });
  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <Link
        href="/painel/conta"
        className="-ml-1.5 inline-flex min-h-9 w-fit items-center gap-1 rounded-lg px-1.5 text-sm font-medium text-fg-muted transition hover:text-fg active:bg-surface-2 pointer-coarse:min-h-10"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {texts.panel.accountPage}
      </Link>
      <PageHeader title={t.title} description={t.description} />
      {profile.isPending ? (
        <LoadingBlock rows={5} />
      ) : profile.isError ? (
        <ErrorMessage error={profile.error} />
      ) : (
        <ProfileEditor key={profile.dataUpdatedAt} profile={profile.data} target={TARGET} />
      )}
    </main>
  );
}

