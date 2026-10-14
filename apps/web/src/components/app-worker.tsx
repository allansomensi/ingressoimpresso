"use client";

import { useEffect } from "react";

import { registerAppWorker } from "@/lib/pwa";

/** Registers the panel's service worker once the page has loaded (ADR 0021; only on the panel and offline pages, see `registerAppWorker`). */
export function AppWorker() {
  useEffect(() => {
    const register = () => {
      void registerAppWorker();
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
    };
  }, []);
  return null;
}
