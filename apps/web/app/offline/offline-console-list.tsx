"use client";

// =============================================================================
//  Список локальных пультов приборов на офлайн-странице (app/offline/page.tsx).
//
//  Читает localStorage-контракт из features/pwa/device-local-console.ts через
//  обычный импорт — никаких инлайн-скриптов и dangerouslySetInnerHTML: страница
//  гидрируется React'ом (общий root layout), а мутация DOM инлайн-скриптом до
//  гидратации ловила hydration mismatch (React выбрасывал добавленные узлы).
//
//  SSR и первый клиентский рендер всегда отдают fallback (state пуст) — список
//  заполняется только в useEffect, после гидратации, поэтому markup сервера и
//  клиента совпадает by design.
// =============================================================================

import { useEffect, useState } from "react";

import {
  DEVICE_LOCAL_URLS_STORAGE_KEY,
  localConsoleUrl,
  type DeviceLocalConsoleEntry
} from "@/features/pwa/device-local-console";

function isDeviceLocalConsoleEntry(value: unknown): value is DeviceLocalConsoleEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { url?: unknown }).url === "string" &&
    (value as { url: string }).url.length > 0
  );
}

export function OfflineConsoleList() {
  const [entries, setEntries] = useState<DeviceLocalConsoleEntry[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DEVICE_LOCAL_URLS_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setEntries(parsed.filter(isDeviceLocalConsoleEntry));
    } catch {
      // битый localStorage / приватный режим — остаёмся на общем тексте с адресом
    }
  }, []);

  if (entries.length === 0) {
    return (
      <p className="offline-text offline-device-fallback">
        Адрес вида <code>http://&lt;ip-прибора&gt;/ui</code>
      </p>
    );
  }

  return (
    <ul className="offline-device-list">
      {entries.map((entry) => (
        <li key={entry.id || entry.url}>
          <a href={localConsoleUrl(entry.url)} className="offline-device-link">
            {entry.name || entry.url}
          </a>
        </li>
      ))}
    </ul>
  );
}
