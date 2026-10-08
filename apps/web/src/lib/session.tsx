"use client";

import type { MeUser, SessionResponse } from "@ingressoimpresso/api-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { api, readToken, subscribeToken, writeToken } from "@/lib/api";

type SessionState = { status: "loading" } | { status: "anonymous" } | { status: "signed-in"; user: MeUser };

/** `undefined` while rendering on the server (the token only exists in the browser). */
function useToken(): string | null | undefined {
  return useSyncExternalStore(subscribeToken, readToken, () => undefined);
}

export function useSession(): {
  session: SessionState;
  signIn: (response: SessionResponse) => void;
  signOut: () => Promise<void>;
} {
  const token = useToken();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ["me", token],
    queryFn: () => api<MeUser>("/api/me"),
    enabled: typeof token === "string",
    staleTime: 5 * 60_000,
  });

  let session: SessionState;
  if (token === undefined) {
    session = { status: "loading" };
  } else if (token === null || me.isError) {
    // A 401 also clears the token inside `api`, which re-renders this as anonymous.
    session = { status: "anonymous" };
  } else if (me.data === undefined) {
    session = { status: "loading" };
  } else {
    session = { status: "signed-in", user: me.data };
  }

  const signIn = useCallback(
    (response: SessionResponse) => {
      queryClient.setQueryData(["me", response.token], response.user);
      writeToken(response.token);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await api<undefined>("/api/auth/logout", { method: "POST" });
    } finally {
      writeToken(null);
      queryClient.clear();
    }
  }, [queryClient]);

  return { session, signIn, signOut };
}

/** Redirects to /entrar when not signed in; returns the user once known. */
export function useRequiredUser(): MeUser | null {
  const { session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.status === "anonymous") {
      router.replace("/entrar");
    }
  }, [session.status, router]);
  return session.status === "signed-in" ? session.user : null;
}
