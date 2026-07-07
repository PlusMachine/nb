"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@nb/ui";

import { createMasterProfileAction } from "./actions";
import {
  buildMasterProfileFormPayload,
  emptyMasterProfileFormValues,
  MasterProfileFormFields,
  type MasterProfileFormValues
} from "./master-profile-fields";

export function MasterOnboarding() {
  const router = useRouter();
  const [values, setValues] = useState<MasterProfileFormValues>(emptyMasterProfileFormValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await createMasterProfileAction(buildMasterProfileFormPayload(values));

    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    router.refresh();
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">Станьте мастером</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Бесплатная витрина ваших работ: страница с контактами, галереей и карточками изделий.
          Покупатели из комьюнити находят вас напрямую — без комиссий и посредников.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <MasterProfileFormFields values={values} onChange={setValues} disabled={busy} />

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Отправить заявку
          </Button>
        </div>
      </form>
    </main>
  );
}
