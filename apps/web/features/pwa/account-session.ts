// Private browser data belongs to a signed-in session; public PWA assets survive logout.
export const SESSION_OWNER_KEY = "nb:session-owner";
export const GUEST_OWNER = "guest";
const privateKeys = new Set(["nb_device_local_urls", "nb:recipe-water:source-profiles", "nb:recipe-water:target-profiles", "nb:recipe-water:migrated"]);
const privatePrefixes = ["nb:brew-progress:v1:", "nb-home-note:", "nb_distill_column_sensor_"];

export function clearPrivateBrowserData(preserveQueueOwner?: string): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (preserveQueueOwner && key.startsWith(`nb:brew-progress:v1:${preserveQueueOwner}:`)) continue;
      if (privateKeys.has(key) || privatePrefixes.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
}

export function syncBrowserAccount(userId: string | null): void {
  try {
    const owner = userId ?? GUEST_OWNER;
    const previous = localStorage.getItem(SESSION_OWNER_KEY);
    if (previous !== owner) {
      // A passive session expiry must not discard unsent work. Keep only the
      // returning/current owner's scoped queue; another account cannot use it.
      const queueOwner = userId ?? (previous && previous !== GUEST_OWNER ? previous : undefined);
      clearPrivateBrowserData(queueOwner);
      localStorage.setItem(SESSION_OWNER_KEY, owner);
    }
  } catch { /* Account access is still enforced on the server. */ }
}

export async function logoutBrowserSession(destination: string): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok || !(await response.json()).ok) throw new Error("LOGOUT_FAILED");
  clearPrivateBrowserData();
  try { localStorage.setItem(SESSION_OWNER_KEY, GUEST_OWNER); } catch { /* Optional storage. */ }
  // A new document drops Next's in-memory authenticated router cache.
  window.location.assign(destination);
}
