"use client";

import { ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";

import { OrganizationDetail } from "@/components/admin/organization-detail";
import { EmptyState } from "@/components/ui";
import { isUuid } from "@/lib/api";
import { useSession } from "@/lib/session";
import { admin as adminTexts } from "@/texts/pt-BR";

export default function AdminOrganizationPage() {
  const { session } = useSession();
  const params = useParams<{ id: string }>();
  if (session.status !== "signed-in" || !session.user.isAdmin) {
    return <EmptyState icon={ShieldAlert} title={adminTexts.forbiddenTitle} description={adminTexts.forbidden} />;
  }
  if (!isUuid(params.id)) {
    return <EmptyState icon={ShieldAlert} title={adminTexts.forbiddenTitle} description={adminTexts.forbidden} />;
  }
  return <OrganizationDetail organizationId={params.id} />;
}
