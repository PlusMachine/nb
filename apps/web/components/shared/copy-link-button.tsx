"use client";

import { Link2 } from "lucide-react";

import { useToast } from "@nb/ui";

// Кнопка «Скопировать ссылку»: собирает href в момент клика (никаких
// replaceState на лету — ссылка не пишется, пока не попросили явно) и копирует
// его в буфер. Вынесена из калькуляторов (CopyCalculationLinkButton) для
// переиспользования в студии наклеек.

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Фолбэк для браузеров/контекстов без Clipboard API (напр. без HTTPS) —
    // старый приём с выделением скрытого textarea и execCommand.
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      // execCommand возвращает boolean успеха — браузер может отказать и без
      // исключения (например, вне пользовательского жеста), тогда молча
      // показывать успех нельзя.
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
};

// Переиспользуется вне этого файла (П3 «Скопировать список» в /app/shopping) —
// копирование произвольного плоского текста тем же приёмом (Clipboard API +
// textarea/execCommand фолбэк), а не только href.
export const copyPlainText = copyText;

export type CopyLinkButtonProps = {
  /** Строит актуальный href в момент клика — читает состояние по требованию. */
  buildHref: () => string;
  /** Заголовок для нативной шторки шаринга (Web Share API). По умолчанию — successTitle. */
  shareTitle?: string;
  label?: string;
  successTitle?: string;
  className?: string;
};

export function CopyLinkButton({
  buildHref,
  shareTitle,
  label = "Скопировать ссылку",
  successTitle = "Ссылка скопирована",
  className
}: CopyLinkButtonProps) {
  const { show } = useToast();

  const handleClick = async () => {
    const href = buildHref();

    // На мобильных браузерах предпочитаем нативную шторку шаринга — она даёт больше
    // способов передать ссылку (мессенджеры, почта), чем просто буфер обмена.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle ?? successTitle, url: href });
        return;
      } catch (error) {
        // Пользователь закрыл шторку шаринга — это не ошибка, тост показывать не нужно.
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        // Другой сбой Web Share (напр. недоступен в текущем контексте) — падаем в
        // копирование в буфер как фолбэк, без ранней отбивки.
      }
    }

    const ok = await copyText(href);
    show(
      ok
        ? { title: successTitle }
        : { title: "Не удалось скопировать ссылку", tone: "danger" }
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
      }
    >
      <Link2 className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
