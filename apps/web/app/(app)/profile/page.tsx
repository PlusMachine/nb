import { requireUser } from "@/lib/auth";
import { systemCurrencies } from "@/features/system/currency";

import { updateSettingsAction } from "../settings/actions";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h1 className="text-xl font-semibold">Профиль</h1>
      <div className="space-y-1 text-sm text-zinc-700">
        <p>Email: {user.email}</p>
        <p>Role: {user.role}</p>
      </div>
      <form action={updateSettingsAction} className="space-y-2">
        <label className="block text-sm">Display name</label>
        <input name="displayName" className="w-full rounded border p-2" defaultValue={user.displayName} />
        <label className="block text-sm">Display currency</label>
        <select name="preferredCurrency" className="w-full rounded border p-2" defaultValue={user.preferredCurrency}>
          {systemCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </select>
        <button className="rounded bg-black px-3 py-2 text-white" type="submit">Сохранить</button>
      </form>
      <p className="text-xs text-zinc-400">Выйти из аккаунта можно через меню профиля в шапке.</p>
    </section>
  );
}
