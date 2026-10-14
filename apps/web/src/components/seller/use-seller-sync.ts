"use client";

/**
 * The data of the seller's page, with or without internet (ADR 0074): the last view saved on the
 * phone shows at once, every change goes to a local queue first (with an id created here) and is
 * sent when there is a connection; the server does each change once and answers what it could not
 * do. The link's token is read from the fragment and only travels in request bodies.
 */
import type { SellerOp, SellerSyncBody, SellerSyncDto, SellerViewDto } from "@ingressoimpresso/api-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api";
import {
  SYNC_BATCH,
  applyOps,
  queueOp,
  readNotices,
  readQueue,
  readSaved,
  storageKey,
  syncNotices,
  writeNotices,
  writeQueue,
  writeSaved,
  type QueuedOp,
  type SyncNotice,
} from "@/lib/seller-offline";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR";

const t = sellerPageTexts;

/** How often a waiting queue is tried again while the page is open. */
const RETRY_MS = 20_000;
/** How often the page re-reads the clock (reservations expire by themselves). */
const TICK_MS = 30_000;

export type Phase = "loading" | "no-token" | "not-found" | "error" | "ready";

/** Why the last attempt to send did not go through (the queue stays). */
export type SendProblem = "maintenance" | "failed" | null;

/** The link's token: everything after `#` (the fragment never reaches a server). */
function readToken(): string | null {
  const token = window.location.hash.replace(/^#/, "").trim();
  return token === "" ? null : token;
}

export function useSellerSync() {
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [server, setServer] = useState<{ view: SellerViewDto; savedAt: string } | null>(null);
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [notices, setNotices] = useState<SyncNotice[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [problem, setProblem] = useState<SendProblem>(null);
  const [now, setNow] = useState(() => new Date());

  // Async work reads the latest values through refs (a send may finish after more changes).
  const keyRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const queueRef = useRef<QueuedOp[]>([]);
  const serverRef = useRef<SellerViewDto | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  const wasOffline = useRef(false);

  const storeQueue = useCallback((next: QueuedOp[]) => {
    queueRef.current = next;
    setQueue(next);
    if (keyRef.current !== null) {
      writeQueue(keyRef.current, next);
    }
  }, []);

  const addNotices = useCallback((added: SyncNotice[]) => {
    if (added.length === 0 || keyRef.current === null) {
      return;
    }
    const key = keyRef.current;
    setNotices((current) => {
      const next = [...current, ...added];
      writeNotices(key, next);
      return next;
    });
  }, []);

  const keep = useCallback((view: SellerViewDto) => {
    const savedAt = new Date();
    serverRef.current = view;
    setServer({ view, savedAt: savedAt.toISOString() });
    if (keyRef.current !== null) {
      writeSaved(keyRef.current, view, savedAt);
    }
  }, []);

  /** Sends the queue (or just refreshes the page when it is empty). */
  const sync = useCallback(async () => {
    const current = tokenRef.current;
    if (current === null) {
      return;
    }
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setSyncing(true);
    let sent = 0;
    try {
      do {
        again.current = false;
        const batch = queueRef.current.slice(0, SYNC_BATCH);
        if (batch.length === 0) {
          keep(await api<SellerViewDto>("/api/seller", { method: "POST", body: { token: current } }));
        } else {
          const body: SellerSyncBody = { token: current, ops: batch.map(({ id, op }) => ({ id, op })) };
          const previous = serverRef.current;
          const answer = await api<SellerSyncDto>("/api/seller/sync", { method: "POST", body });
          const ids = new Set(batch.map((item) => item.id));
          storeQueue(queueRef.current.filter((item) => !ids.has(item.id)));
          keep(answer.view);
          addNotices(syncNotices(answer.results, batch, answer.view.numberDigits, previous?.reservations ?? []));
          sent += answer.results.filter((result) => result.outcome !== "rejected").length;
        }
      } while (queueRef.current.length > 0 || again.current);
      setOnline(true);
      setProblem(null);
      setPhase("ready");
      if (sent > 0 && wasOffline.current) {
        toast.success(t.offline.sentToast(sent));
      }
      wasOffline.current = false;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setPhase("not-found");
      } else if (error instanceof ApiError && error.status === 0) {
        setOnline(false);
        wasOffline.current = true;
        setPhase(serverRef.current === null ? "error" : "ready");
      } else {
        setProblem(error instanceof ApiError && error.code === "maintenance" ? "maintenance" : "failed");
        setPhase(serverRef.current === null ? "error" : "ready");
      }
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [addNotices, keep, storeQueue]);

  // Opens the link: the saved copy at once, then the server.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const current = readToken();
      tokenRef.current = current;
      setToken(current);
      if (current === null) {
        setPhase("no-token");
        return;
      }
      const key = await storageKey(current);
      if (cancelled) {
        return;
      }
      keyRef.current = key;
      const saved = readSaved(key);
      serverRef.current = saved?.view ?? null;
      setServer(saved);
      queueRef.current = readQueue(key);
      setQueue(queueRef.current);
      setNotices(readNotices(key));
      setPhase(saved === null ? "loading" : "ready");
      if (!navigator.onLine) {
        setOnline(false);
        wasOffline.current = true;
        setPhase(saved === null ? "error" : "ready");
        return;
      }
      await sync();
    };
    void read();
    const onHash = () => {
      void read();
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHash);
    };
  }, [sync]);

  // The connection comes back: send what waited. It goes away: say so at once.
  useEffect(() => {
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => {
      setOnline(false);
      wasOffline.current = true;
    };
    const visible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void sync();
      }
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [sync]);

  // A queue that could not go (a weak signal that says it is online) is tried again.
  useEffect(() => {
    if (queue.length === 0 || phase !== "ready") {
      return;
    }
    const timer = window.setInterval(() => {
      if (navigator.onLine) {
        void sync();
      }
    }, RETRY_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [queue.length, phase, sync]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /** Records a change (on the phone first) and sends it when it can. */
  const enqueue = useCallback(
    (op: SellerOp) => {
      storeQueue([...queueRef.current, queueOp(op)]);
      setNow(new Date());
      if (navigator.onLine) {
        void sync();
      } else {
        setOnline(false);
        wasOffline.current = true;
      }
    },
    [storeQueue, sync],
  );

  const dismissNotices = useCallback(() => {
    setNotices([]);
    if (keyRef.current !== null) {
      writeNotices(keyRef.current, []);
    }
  }, []);

  const view = useMemo(() => (server === null ? null : applyOps(server.view, queue, now)), [server, queue, now]);

  return {
    token,
    phase,
    view,
    /** The server's view, without the queue (what was already sent). */
    serverView: server?.view ?? null,
    savedAt: server?.savedAt ?? null,
    queue,
    notices,
    online,
    syncing,
    problem,
    now,
    enqueue,
    sync,
    /** A fresh view from an action that needs the server right away (the digital ticket). */
    replaceView: keep,
    dismissNotices,
  };
}
