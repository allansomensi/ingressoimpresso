import { Compass } from "lucide-react";

import { ButtonLink, Card, CardHeader } from "@/components/ui";
import { TOUR_REPLAY } from "@/lib/tour";
import { tour as tourTexts } from "@/texts/pt-BR/tour";

const t = tourTexts.replay;

/** Starts the welcome tour of the panel again (ADR 0116). */
export function TourCard() {
  return (
    <Card>
      <CardHeader icon={Compass} title={t.title} description={t.hint} />
      <ButtonLink href={TOUR_REPLAY} variant="secondary" className="w-fit">
        {t.action}
      </ButtonLink>
    </Card>
  );
}
