import Link from "next/link";
import type { ReactNode } from "react";

import { RICH_TEXT_LINK } from "@/lib/rich-text";

/** A content string with its `[label](/path)` links turned into site links. */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(RICH_TEXT_LINK)) {
    const [whole, label, href] = match;
    if (label === undefined || href === undefined) {
      continue;
    }
    parts.push(text.slice(last, match.index));
    parts.push(
      <Link key={match.index} href={href} className="font-medium text-brand underline underline-offset-2 hover:text-brand-hover">
        {label}
      </Link>,
    );
    last = match.index + whole.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
