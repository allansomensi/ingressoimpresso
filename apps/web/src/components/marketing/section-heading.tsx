/** The centered title of a section on the public pages: eyebrow, heading and lead. */
export function SectionHeading({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
      {eyebrow !== undefined && (
        <span className="text-sm font-semibold tracking-wide text-brand uppercase">{eyebrow}</span>
      )}
      <h2 className="text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">{title}</h2>
      {lead !== undefined && <p className="text-lg leading-relaxed text-pretty text-fg-muted">{lead}</p>}
    </div>
  );
}
