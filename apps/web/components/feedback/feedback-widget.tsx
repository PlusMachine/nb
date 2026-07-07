"use client";

import { useEffect, useState } from "react";
import { Button, Sheet, Textarea, useToast } from "@nb/ui";

import { feedbackKindLabels, feedbackKinds, type FeedbackKind } from "@/features/feedback/contracts";

import type { FeedbackPrefill } from "./feedback-context";

type FeedbackWidgetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: FeedbackPrefill;
  isAuthenticated: boolean;
};

export function FeedbackWidget({ open, onOpenChange, prefill, isAuthenticated }: FeedbackWidgetProps) {
  const { show } = useToast();
  const [kind, setKind] = useState<FeedbackKind>("inaccuracy");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // На каждое открытие — сбросить тип к предзаполненному и очистить ошибку.
  useEffect(() => {
    if (open) {
      setKind(prefill?.kind ?? "inaccuracy");
      setError(null);
    }
  }, [open, prefill]);

  const contextLabel = prefill?.entityLabel ?? (typeof window !== "undefined" ? window.location.pathname : null);

  const submit = async () => {
    if (message.trim().length < 5) {
      setError("Опишите чуть подробнее — минимум 5 символов.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const context = {
      pageUrl: window.location.href,
      pagePath: window.location.pathname,
      referrer: document.referrer || undefined,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      entityType: prefill?.entityType,
      entityId: prefill?.entityId,
      entityLabel: prefill?.entityLabel
    };

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          message: message.trim(),
          contactEmail: email.trim() || undefined,
          website,
          context
        })
      });
      const data = (await response.json()) as { ok?: boolean; message?: string; error?: string };

      if (!response.ok) {
        setError(
          data.error === "RATE_LIMITED"
            ? "Слишком много сообщений подряд. Попробуйте позже."
            : data.error ?? "Не удалось отправить. Попробуйте ещё раз."
        );
        setSubmitting(false);
        return;
      }

      onOpenChange(false);
      setMessage("");
      setEmail("");
      show({ title: data.message ?? "Спасибо! Мы получили ваше сообщение." });
    } catch {
      setError("Не удалось отправить. Проверьте соединение.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Обратная связь" side="right">
      <div className="space-y-5">
        <div>
          <span className="mb-2 block text-sm font-medium text-foreground">Что хотите сообщить?</span>
          <div className="flex flex-wrap gap-2">
            {feedbackKinds.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                aria-pressed={kind === option}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  kind === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {feedbackKindLabels[option]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="feedback-message" className="mb-2 block text-sm font-medium text-foreground">
            Сообщение
          </label>
          <Textarea
            id="feedback-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            placeholder="Что не так или что можно улучшить?"
            className="min-h-32"
            autoFocus
          />
        </div>

        {!isAuthenticated ? (
          <div>
            <label htmlFor="feedback-email" className="mb-2 block text-sm font-medium text-foreground">
              E-mail для ответа <span className="font-normal text-muted-foreground">— по желанию</span>
            </label>
            <input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ) : null}

        {/* honeypot — скрыт от людей, видим ботам */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          aria-hidden
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        {contextLabel ? (
          <p className="truncate rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" title={contextLabel}>
            Страница: {contextLabel}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground ring-1 ring-inset ring-destructive-border"
          >
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button type="button" variant="primary" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Отправляем..." : "Отправить"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
