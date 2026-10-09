"use client";

import { Download, PlusSquare, Share } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { Button, Dialog } from "@/components/ui";
import { promptInstall, useInstallState } from "@/lib/pwa";
import { texts } from "@/texts/pt-BR";

const t = texts.pwa;
const IOS_ICONS = [Share, PlusSquare, Download] as const;

/** "Install app": the browser prompt on Android/desktop Chrome, instructions on iPhone. */
export function InstallButton({ className }: { className?: string | undefined }) {
  const state = useInstallState();
  const [iosHelp, setIosHelp] = useState(false);

  if (state === "unavailable" || state === "installed") {
    return null;
  }
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<Download />}
        className={className}
        onClick={() => {
          if (state === "ios") {
            setIosHelp(true);
          } else {
            void promptInstall().then((accepted) => {
              if (accepted) {
                toast.success(t.installed);
              }
            });
          }
        }}
      >
        {t.install}
      </Button>
      <Dialog
        open={iosHelp}
        onClose={() => {
          setIosHelp(false);
        }}
        title={t.installTitle}
        description={t.installBody}
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-center py-2">
            <Image src="/icons/icon-192.png" alt="" width={80} height={80} className="rounded-[22px] shadow-md" />
          </div>
          <ol className="flex flex-col gap-3">
            {t.iosSteps.map((step, index) => {
              const Icon = IOS_ICONS[index] ?? Share;
              return (
                <li key={step} className="flex items-center gap-3 text-[15px]">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-brand">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {step}
                </li>
              );
            })}
          </ol>
        </div>
      </Dialog>
    </>
  );
}
