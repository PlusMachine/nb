"use client";

import { useRouter } from "next/navigation";
import { Select } from "@nb/ui";

import { UrlSearchField } from "@/components/shared/url-search-field";
import { FIRMWARE_UNKNOWN_KEY, type FirmwareVersionOption } from "@/features/devices/contracts";

const BASE_PATH = "/admin/devices";

/** Поиск по владельцу/имени прибора + фильтр по версии прошивки (видно, кто не обновился). */
export function DevicesFilters({
  query,
  fw,
  presence,
  fwOptions
}: {
  query: string;
  fw: string;
  presence: string | undefined;
  fwOptions: FirmwareVersionOption[];
}) {
  const router = useRouter();

  const handleFwChange = (nextFw: string) => {
    const params = new URLSearchParams();
    if (presence) {
      params.set("presence", presence);
    }
    if (query) {
      params.set("q", query);
    }
    if (nextFw) {
      params.set("fw", nextFw);
    }
    // Смена фильтра всегда возвращает на первую страницу.
    const search = params.toString();
    router.push(search ? `${BASE_PATH}?${search}` : BASE_PATH);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <UrlSearchField
        id="devices-search"
        label="Поиск"
        value={query}
        basePath={BASE_PATH}
        params={{ presence, fw: fw || undefined }}
        placeholder="Владелец, e-mail, имя прибора"
        className="min-w-[240px] flex-1"
      />

      <Select
        label="Прошивка"
        containerClassName="min-w-[200px]"
        value={fw}
        onChange={(event) => handleFwChange(event.target.value)}
      >
        <option value="">Все версии</option>
        {fwOptions.map((option) => (
          <option key={option.key} value={option.key}>
            {option.key === FIRMWARE_UNKNOWN_KEY ? option.label : `v${option.label}`} ({option.count})
          </option>
        ))}
      </Select>
    </div>
  );
}
