"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { GUEST_OWNER, SESSION_OWNER_KEY, syncBrowserAccount } from "./account-session";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AccountSessionBoundary({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [changed, setChanged] = useState(false);
  useClientLayoutEffect(() => {
    // The precached anonymous offline document must retain the last signed-in
    // user's local console links. It cannot establish an authentication state.
    const offlineShell = Boolean(document.querySelector("[data-nb-offline-shell]"));
    if (!offlineShell || userId) syncBrowserAccount(userId);
    let owner = userId ?? GUEST_OWNER;
    if (offlineShell) {
      try { owner = localStorage.getItem(SESSION_OWNER_KEY) ?? GUEST_OWNER; } catch { /* Optional storage. */ }
    }
    const check = () => {
      try { if (localStorage.getItem(SESSION_OWNER_KEY) !== owner) setChanged(true); } catch { /* Optional storage. */ }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === SESSION_OWNER_KEY || event.key === null) check(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) check(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("pageshow", onPageShow); };
  }, [userId]);

  if (changed) return (
    <main className="mx-auto max-w-lg space-y-4 p-8" role="status">
      <h1 className="text-xl font-semibold">Аккаунт изменён</h1>
      <p>Обновите страницу, чтобы продолжить с текущим аккаунтом.</p>
      <button type="button" className="rounded-lg border px-4 py-2" onClick={() => window.location.reload()}>Обновить страницу</button>
    </main>
  );
  return children;
}
