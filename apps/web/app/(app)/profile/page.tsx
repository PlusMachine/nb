import { Button } from "@nb/ui";

import { NotificationOptIn } from "@/features/notifications/components/notification-opt-in";
import { requireUser } from "@/lib/auth";
import { systemCurrencies } from "@/features/system/currency";
import { gravityUnitLabels, preferredGravityUnits } from "@/features/system/gravity-units";

import { updateSettingsAction } from "../settings/actions";

const inputClassName = "mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          Профиль
        </h1>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="space-y-1 text-sm text-zinc-600">
          {user.email ? <p>{user.email}</p> : null}
          {user.phone ? <p>{user.phone}</p> : null}
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Роль: {user.role}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Настройки</h2>
        <form action={updateSettingsAction} className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Имя</span>
            <input name="displayName" defaultValue={user.displayName} className={inputClassName} />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Валюта</span>
            <select name="preferredCurrency" defaultValue={user.preferredCurrency} className={inputClassName}>
              {systemCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Единица плотности</span>
            <select name="preferredGravityUnit" defaultValue={user.preferredGravityUnit} className={inputClassName}>
              {preferredGravityUnits.map((unit) => (
                <option key={unit} value={unit}>{gravityUnitLabels[unit]}</option>
              ))}
            </select>
          </label>

          <Button type="submit">Сохранить</Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Уведомления</h2>
        <NotificationOptIn />
      </section>
    </div>
  );
}
