import { requireRole } from "@/lib/auth";
import { formatMoneyInputValueFromMinor } from "@/features/system/money";
import { listSystemCurrencyRates } from "@/features/system/currency-rates";

import { updateCurrencySettingsAction } from "./actions";

export default async function AdminCurrencySettingsPage() {
  await requireRole("admin");
  const rates = await listSystemCurrencyRates();

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Currency settings</h1>
        <p className="text-sm text-zinc-600">Базовая валюта системы: RUB. Эти константы используются только для display conversion и inventory cost foundation.</p>
      </div>

      <form action={updateCurrencySettingsAction} className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          RUB base
          <input className="mt-1 w-full rounded border bg-zinc-100 p-2 text-zinc-500" value="1.00" readOnly />
        </label>
        <label className="text-sm">
          USD to RUB
          <input
            name="usdRubRate"
            className="mt-1 w-full rounded border p-2"
            defaultValue={formatMoneyInputValueFromMinor(rates.USD)}
            inputMode="decimal"
          />
        </label>
        <label className="text-sm">
          EUR to RUB
          <input
            name="eurRubRate"
            className="mt-1 w-full rounded border p-2"
            defaultValue={formatMoneyInputValueFromMinor(rates.EUR)}
            inputMode="decimal"
          />
        </label>
        <div className="sm:col-span-3">
          <button className="rounded bg-black px-3 py-2 text-sm text-white" type="submit">Save rates</button>
        </div>
      </form>
    </section>
  );
}
