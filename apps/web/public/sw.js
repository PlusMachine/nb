/*
 * BrewForge service worker — ТОЛЬКО web-push уведомления (Phase 6).
 * Не кэширует и не делает офлайн-PWA: единственная задача — показывать пуши о
 * промптах (засыпь/промывка) и авариях, когда вкладка свёрнута / телефон вне дома,
 * и по клику открывать нужный экран. Payload — JSON { title, body, tag, url }.
 */

// Немедленно берём контроль (без ожидания перезагрузки вкладок).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
