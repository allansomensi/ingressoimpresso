import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";

/** The trail above a public page's title: links up to the current page, which is not a link. */
export function Breadcrumb({ items }: { items: readonly { label: string; href?: string }[] }) {
  return (
    <nav aria-label={eventPagesTexts.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-subtle">
        {items.map((item, index) => (
          <Fragment key={item.label}>
            {index > 0 && (
              <li aria-hidden>
                <ChevronRight className="size-3.5" />
              </li>
            )}
            {item.href === undefined ? (
              <li aria-current="page" className="text-fg-muted">
                {item.label}
              </li>
            ) : (
              <li>
                <Link href={item.href} className="relative transition touch-target hover:text-fg">
                  {item.label}
                </Link>
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
