import { requireUser } from "@/lib/auth";
import { systemCurrencies } from "@/features/system/currency";

import { updateSettingsAction } from "./actions";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h1 className="text-xl font-semibold">Настройки</h1>
      <form action={updateSettingsAction} className="space-y-2">
        <label className="block text-sm">Display name</label>
        <input name="displayName" className="w-full rounded border p-2" defaultValue={user.displayName} />
        <label className="block text-sm">Display currency</label>
        <select name="preferredCurrency" className="w-full rounded border p-2" defaultValue={user.preferredCurrency}>
          {systemCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </select>
        <button className="rounded bg-black px-3 py-2 text-white" type="submit">Сохранить</button>
      </form>
      <form action="/api/auth/logout" method="post">
        <button className="rounded border px-3 py-2" type="submit">Выйти</button>
      </form>
    </section>
  );
}
