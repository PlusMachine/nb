/* Served at /sw.js with a build-specific NB_BUILD_ID. Only anonymous offline
 * HTML and immutable same-origin static files are cached. API/SSR/Flight and
 * mutations always use the network. */
const RELEASE = self.NB_BUILD_ID;
const OFFLINE_CACHE = `nb-pwa-offline-${RELEASE}`;
const STATIC_CACHE = `nb-pwa-static-${RELEASE}`;
const OFFLINE_URL = "/offline";
const MAX_STATIC_ENTRIES = 200;
let cacheWrites = Promise.resolve();

function isCacheableStaticPath(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/images/pwa/") || pathname === "/icon.svg";
}

async function precacheOffline() {
  const response = await fetch(OFFLINE_URL, { cache: "reload", credentials: "omit" });
  if (!response.ok) throw new Error(`precache /offline: HTTP ${response.status}`);
  const html = await response.clone().text();
  const normalized = html.replace(/\\\//g, "/");
  const urls = [...new Set(normalized.match(/\/_next\/static\/[^"'\s)<>]+\.(?:js|css)/g) || [])];
  if (!urls.length) throw new Error("Offline document has no application chunks");
  const cache = await caches.open(OFFLINE_CACHE);
  // Finish consuming each body before requesting the next mandatory asset.
  // A failed install never publishes its incomplete offline document.
  for (const url of urls) {
    const asset = await fetch(url, { cache: "reload", credentials: "omit" });
    if (!asset.ok) {
      await asset.body?.cancel();
      throw new Error(`precache ${url}: HTTP ${asset.status}`);
    }
    await cache.put(url, asset);
  }
  await cache.put(OFFLINE_URL, response);
}

self.addEventListener("install", event => {
  event.waitUntil(precacheOffline().then(() => self.skipWaiting()).catch(async error => {
    await caches.delete(OFFLINE_CACHE);
    throw error;
  }));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Keep one previous release for lazy chunks requested by already open tabs.
    const previous = keys.filter(key => key.startsWith("nb-pwa-offline-") && key !== OFFLINE_CACHE).at(-1);
    const previousRelease = previous?.slice("nb-pwa-offline-".length);
    const retained = new Set([OFFLINE_CACHE, STATIC_CACHE, previous, previousRelease ? `nb-pwa-static-${previousRelease}` : null]);
    await Promise.all(keys.filter(key => (key === "nb-v1" || key.startsWith("nb-pwa-")) && !retained.has(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function matchStatic(request) {
  const keys = await caches.keys();
  const candidates = [OFFLINE_CACHE, STATIC_CACHE, ...keys.filter(key => key.startsWith("nb-pwa-"))];
  for (const key of new Set(candidates)) {
    if (!keys.includes(key)) continue;
    const cached = await (await caches.open(key)).match(request);
    if (cached) return cached;
  }
}

self.addEventListener("message", event => {
  if (event.data?.type !== "NB_OFFLINE_BREW_READY" || !event.ports[0]) return;
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.match(OFFLINE_URL, { ignoreVary: true }))
    .then(response => event.ports[0].postMessage(Boolean(response))));
});

async function loadNavigation(request) {
  const { pathname } = new URL(request.url);
  const brewEntry = /^\/app(?:\/brew-batches(?:\/[^/]+)?)?\/?$/.test(pathname);
  const controller = brewEntry ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 5000) : null;
  try {
    const response = await fetch(request, controller ? { signal: controller.signal } : undefined);
    if (!brewEntry || response.status < 500) return response;
  } catch {
    // A network failure can still open the locally saved brew.
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
  return (await (await caches.open(OFFLINE_CACHE)).match(OFFLINE_URL, { ignoreVary: true })) ?? Response.error();
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(loadNavigation(request));
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isCacheableStaticPath(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await matchStatic(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      cacheWrites = cacheWrites.catch(() => {}).then(async () => {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, copy);
        const keys = await cache.keys();
        for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES))) await cache.delete(key);
      });
      event.waitUntil(cacheWrites.catch(() => {}));
    }
    return response;
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "BrewForge", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "BrewForge";
  const options = {
    body: payload.body || "",
    // tag + renotify: повторные события одного рода/устройства заменяют предыдущее
    // уведомление, но всё равно оповещают (не копятся молча).
    tag: payload.tag || "brewforge",
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/app/devices" }
    // icon/badge не задаём (ассетов пока нет) — браузер покажет дефолт без 404.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app/devices";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Уже открытая вкладка портала — фокус + навигация; иначе открываем новую.
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            try {
              client.navigate(url);
            } catch {
              /* кросс-origin/ограничения — просто оставляем сфокусированной */
            }
          }
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
