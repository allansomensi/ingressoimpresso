import { IS_STAGING } from "@/lib/site";
import { texts } from "@/texts/pt-BR";

/**
 * A pill on every page of the staging site (ADR 0046), so a test is never mistaken for the real
 * thing. Clicks pass through it; on phones it sits above the panel's tab bar.
 */
export function EnvironmentBadge() {
  if (!IS_STAGING) {
    return null;
  }
  return (
    <div
      role="status"
      className="pointer-events-none fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[70] rounded-full border border-warning/50 bg-warning-soft px-3 py-1 text-xs font-semibold tracking-wide text-warning-fg uppercase shadow-sm sm:bottom-4"
    >
      {texts.meta.staging}
    </div>
  );
}
