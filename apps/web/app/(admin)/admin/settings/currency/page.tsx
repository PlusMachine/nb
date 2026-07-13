import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CurrencyRatesForm } from "@/components/system/currency-rates-form";
import { requireRole } from "@/lib/auth";
import { formatMoneyInputValueFromMinor } from "@/features/system/money";
import { listSystemCurrencyRates } from "@/features/system/currency-rates";

export default async function AdminCurrencySettingsPage() {
  await requireRole("admin");
  const rates = await listSystemCurrencyRates();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Курсы валют"
        description="Базовая валюта системы — RUB. Курсы используются для конвертации и расчёта себестоимости склада."
      />

      <CurrencyRatesForm
        initialUsdRate={formatMoneyInputValueFromMinor(rates.USD)}
        initialEurRate={formatMoneyInputValueFromMinor(rates.EUR)}
      />
    </div>
  );
}
