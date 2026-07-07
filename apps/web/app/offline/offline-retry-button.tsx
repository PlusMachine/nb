"use client";

// Кнопка «Повторить» офлайн-страницы (app/offline/page.tsx) — перезагружает
// страницу через обычный React-обработчик, без инлайн-скрипта (см. комментарий
// в offline-console-list.tsx о причине отказа от dangerouslySetInnerHTML).

export function OfflineRetryButton() {
  return (
    <button
      type="button"
      className="offline-button"
      onClick={() => window.location.reload()}
    >
      Повторить
    </button>
  );
}
