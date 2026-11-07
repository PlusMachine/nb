/*
 * BrewForge service worker — две обязанности:
 *   1) web-push уведомления (Phase 6): показывать пуши о промптах (засыпь/промывка)
 *      и авариях, когда вкладка свёрнута / телефон вне дома, и по клику открывать
 *      нужный экран. Payload — JSON { title, body, tag, url }.
 *   2) оффлайн-слой (PWA refactor P3): честное поведение без сети — навигация
 *      при обрыве сети отдаёт страницу /offline, иммутабельные статические ассеты
 *      кэшируются cache-first. Сами SSR-страницы и API (в т.ч. /api/*, SSE) НЕ
 *      кэшируются — эти запросы должны идти в сеть напрямую.
 *
 * Правила fetch (и больше никаких):
 *   a. Не-GET — не перехватываем.
 *   b. Навигация (request.mode === "navigate") — network-first, при отказе сети
 *      отдаём закэшированный /offline.
 *   c. Свой источник, GET, путь начинается с "/_next/static/" или "/images/pwa/",
 *      либо равен "/icon.svg" — cache-first (иммутабельные хэш-чанки/иконки).
 *   d. Всё остальное — не перехватываем вообще, прозрачный проход в сеть
 *      (критично для /api/* и SSE-подписок на телеметрию).
 */

const CACHE = "nb-v1";
const OFFLINE_URL = "/offline";
// Кап на количество закэшированных иммутабельных статик-ассетов (правило c):
// без него между деплоями старые хэш-чанки копятся в кэше бесконечно.
const MAX_STATIC_ENTRIES = 200;

// Проверка "путь кэшируем по правилу (c)" — используется и в fetch-хендлере,
// и при подрезке кэша (чтобы не задеть отдельно живущую запись /offline).
function isCacheableStaticPath(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/images/pwa/") || pathname === "/icon.svg";
}

// Подрезаем кэш статик-ассетов до MAX_STATIC_ENTRIES, удаляя самые старые записи
// (cache.keys() отдаёт их в порядке вставки). Считаем и трогаем только записи,
// подпадающие под правило (c) — /offline в этом же кэше подрезкой не задевается.
async function trimStaticCache(cache) {
  const keys = await cache.keys();
  const staticKeys = keys.filter((req) => isCacheableStaticPath(new URL(req.url).pathname));
  const excess = staticKeys.length - MAX_STATIC_ENTRIES;
  if (excess <= 0) {
    return;
  }
  for (const key of staticKeys.slice(0, excess)) {
    await cache.delete(key);
  }
}

// Прекэшируем /offline вместе с её JS/CSS-чанками. Страница /offline — клиентский
// компонент (список пультов рендерится после гидратации), поэтому голого HTML
// недостаточно: без чанков первый же оффлайн-заход без предварительного
// онлайн-визита /offline отдаст нерабочую страницу без гидратации. Правило (c)
// само по себе не спасает — оно кэширует чанки только по факту визита страницы,
// а /offline может понадобиться до того, как пользователь её вообще открывал.
async function precacheOffline(cache) {
  const response = await fetch(OFFLINE_URL, { cache: "reload" });
  // Не кэшируем ошибочный ответ (500 в момент установки SW осел бы в кэше
  // навсегда) — бросаем, сработает общий catch «прекэш не случился».
  if (!response.ok) {
    throw new Error(`precache /offline: HTTP ${response.status}`);
  }
  // Читаем текст с клона — сам response уходит в кэш как есть.
  const html = await response.clone().text();
  await cache.put(OFFLINE_URL, response);

  // Next кладёт ссылки на чанки в <script src="...">, <link href="..."> и в
  // инлайновый JSON (self.__next_f), где слэши иногда экранированы (\/) —
  // нормализуем перед матчингом, иначе регулярка их не увидит.
  const normalized = html.replace(/\\\//g, "/");
  const matches = normalized.match(/\/_next\/static\/[^"'\s)<>]+\.(?:js|css)/g) || [];
  const urls = [...new Set(matches)];

  // Кэшируем по одной, best-effort: один битый/просроченный URL чанка не должен
  // ронять прекэш остальных (в отличие от cache.addAll, который упал бы целиком
  // из-за одной ошибки). Чанки кладутся в тот же кэш CACHE и подпадают под
  // isCacheableStaticPath — при активном сёрфинге между релизами их может
  // вытеснить кап MAX_STATIC_ENTRIES наравне с обычными статик-ассетами; для v1
  // это приемлемый компромисс (не отдельный неограниченный кэш под /offline).
  await Promise.all(
    urls.map((chunkUrl) =>
      fetch(chunkUrl, { cache: "reload" })
        .then((chunkResponse) => (chunkResponse.ok ? cache.put(chunkUrl, chunkResponse) : undefined))
        .catch(() => {
          /* один битый чанк — не повод терять прекэш остальных */
        })
    )
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => precacheOffline(cache))
      .catch(() => {
        /* нет сети при установке — прекэш просто не случится в этот раз */
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Чистим старые версии кэша (префикс "nb-"), кроме текущей.
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("nb-") && key !== CACHE).map((key) => caches.delete(key))
        )
      ),
      // Best-effort пере-кэширование /offline (+ её чанков), чтобы страница
      // обновлялась вместе с SW.
      caches
        .open(CACHE)
        .then((cache) => precacheOffline(cache))
        .catch(() => {
          /* игнорируем — старая версия /offline в кэше не хуже отсутствующей */
        })
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // (a) Не-GET — не перехватываем.
  if (request.method !== "GET") {
    return;
  }

  // (b) Навигация — network-first, при отказе сети отдаём /offline. Если /offline
  // тоже не оказалось в кэше (например, первая установка прошла без сети) —
  // caches.match отрезолвится в undefined, respondWith на undefined упадёт с
  // невнятным TypeError, поэтому явный фоллбек на "сетевая ошибка".
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableStatic = isSameOrigin && isCacheableStaticPath(url.pathname);

  // (c) Иммутабельные статические ассеты — cache-first.
  if (isCacheableStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            // put + подрезка кэша не должны задерживать ответ клиенту — уводим их
            // в waitUntil, а response отдаём сразу же после fetch.
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(request, copy).then(() => trimStaticCache(cache)))
            );
          }
          return response;
        });
      })
    );
    return;
  }

  // (d) Всё остальное (в т.ч. /api/*, SSE, manifest) — прозрачный проход, не трогаем.
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
