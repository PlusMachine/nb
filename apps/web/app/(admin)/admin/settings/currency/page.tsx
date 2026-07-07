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
        <h1 className="text-xl font-semibold">Курсы валют</h1>
        <p className="text-sm text-muted-foreground">Базовая валюта системы — RUB. Курсы используются для отображения конвертации и расчёта себестоимости склада.</p>
      </div>

      <form action={updateCurrencySettingsAction} className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          RUB (база)
          <input className="mt-1 w-full rounded border bg-muted p-2 text-muted-foreground" value="1.00" readOnly />
        </label>
        <label className="text-sm">
          USD → RUB
          <input
            name="usdRubRate"
            className="mt-1 w-full rounded border p-2"
            defaultValue={formatMoneyInputValueFromMinor(rates.USD)}
            inputMode="decimal"
          />
        </label>
        <label className="text-sm">
          EUR → RUB
          <input
            name="eurRubRate"
            className="mt-1 w-full rounded border p-2"
            defaultValue={formatMoneyInputValueFromMinor(rates.EUR)}
            inputMode="decimal"
          />
        </label>
        <div className="sm:col-span-3">
          <button className="rounded bg-foreground px-3 py-2 text-sm text-background" type="submit">Сохранить курсы</button>
        </div>
      </form>
    </section>
  );
}
