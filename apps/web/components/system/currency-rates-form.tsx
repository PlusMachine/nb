"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@nb/ui";

import { updateCurrencySettingsAction } from "@/app/(admin)/admin/settings/currency/actions";
import { NumericInput } from "@/components/shared/numeric-input";

const fieldClassName =
  "mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:text-sm";

export function CurrencyRatesForm({
  initialUsdRate,
  initialEurRate
}: {
  initialUsdRate: string;
  initialEurRate: string;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [usdRate, setUsdRate] = useState(initialUsdRate);
  const [eurRate, setEurRate] = useState(initialEurRate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateCurrencySettingsAction({ usdRubRate: usdRate, eurRubRate: eurRate });

      if (!result.ok) {
        setError(result.error);
        show({ title: "Не удалось сохранить курсы", description: result.error, tone: "danger" });
        return;
      }

      show({ title: "Курсы сохранены", tone: "success" });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          RUB (база)
          <Input className="mt-1 bg-muted text-muted-foreground" value="1" readOnly />
        </label>
        <label className="text-sm">
          USD → RUB
          <NumericInput
            className={fieldClassName}
            value={usdRate}
            onChange={(event) => setUsdRate(event.target.value)}
            disabled={isPending}
            min={0}
          />
        </label>
        <label className="text-sm">
          EUR → RUB
          <NumericInput
            className={fieldClassName}
            value={eurRate}
            onChange={(event) => setEurRate(event.target.value)}
            disabled={isPending}
            min={0}
          />
        </label>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground ring-1 ring-inset ring-destructive-border"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="sm" disabled={isPending}>
        {isPending ? "Сохраняем…" : "Сохранить курсы"}
      </Button>
    </form>
  );
}
