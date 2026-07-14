"use client";

// =============================================================================
//  features/device-streams/components/just-fermenting-prompt.tsx
//  Вход №1 (§5 F2): необязательный шаг «Ареометр уже в сусле?» сразу после
//  перевода партии в «Брожение». Технически — тот же приём, что brew-stock-
//  notice.tsx: BrewTransitionButton дописывает в URL `?just-fermenting=1` после
//  успешного перехода (appendQueryOnSuccess), а этот клиентский компонент —
//  СМОНТИРОВАННЫЙ УЖЕ В АКТЕ «БРОЖЕНИЕ» (страница переключает акт тем же
//  рендером, без полной навигации, поэтому query-параметр — единственный
//  надёжный носитель «просто перешли» через смену дерева компонентов) — читает
//  флаг, тянет свободные устройства и показывает диалог; «Пропустить» и клик
//  вне — не блокируют, один тап. Устройств нет → тихо убираем флаг, диалог не
//  мелькает пустым.
// =============================================================================
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { listAvailableStreamDevicesAction } from "@/features/device-streams/actions";
import type { AvailableStreamDeviceDto } from "@/features/device-streams/contracts";

import { ConnectDeviceDialog } from "./connect-device-dialog";

export function JustFermentingPrompt({ brewBatchId }: { brewBatchId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const flag = searchParams.get("just-fermenting");

  const [devices, setDevices] = useState<AvailableStreamDeviceDto[]>([]);
  const [open, setOpen] = useState(false);

  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("just-fermenting");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!flag) return;
    let cancelled = false;
    void listAvailableStreamDevicesAction().then((result) => {
      if (cancelled) return;
      const list = result.ok ? result.devices : [];
      if (list.length === 0) {
        clearQuery();
        return;
      }
      setDevices(list);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag]);

  const dismiss = () => {
    setOpen(false);
    clearQuery();
  };

  if (!open) {
    return null;
  }

  return (
    <ConnectDeviceDialog
      open={open}
      title="Ареометр уже в сусле?"
      brewBatchId={brewBatchId}
      devices={devices}
      cancelLabel="Пропустить"
      onClose={dismiss}
      onAttached={dismiss}
    />
  );
}
