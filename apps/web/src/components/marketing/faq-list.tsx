import { ChevronDown } from "lucide-react";

/** Questions and answers as an accordion (`<details>`: works without JavaScript). */
export function FaqList({ items }: { items: readonly { question: string; answer: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <details key={item.question} className="group rounded-2xl border border-border bg-bg px-5 open:bg-surface open:shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium text-fg [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronDown className="size-5 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="pb-5 text-[15px] leading-relaxed text-fg-muted">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
