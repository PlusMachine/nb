"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@nb/ui";
import type { EquipmentProfilePayload } from "@/features/equipment-profiles/contracts";
import { saveEquipmentProfileFormAction } from "@/app/(app)/app/equipment/actions";
import { EquipmentProfileFormFields } from "./equipment-profile-form-basic";

export function EquipmentProfileForm({ profile, mode, existingNames = [] }: {
  profile: EquipmentProfilePayload & { id?: string };
  mode: "create" | "edit";
  existingNames?: string[];
}) {
  const [state, setState] = useState<import("@/app/(app)/app/equipment/actions").EquipmentFormState>({});
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const router = useRouter();
  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      if (inFlight.current) return;
      const data = new FormData(event.currentTarget);
      inFlight.current = true;
      setPending(true);
      try {
        const result = await saveEquipmentProfileFormAction(mode === "edit" ? profile.id! : null, {}, data);
        if (result.saved) { router.push("/app/equipment"); router.refresh(); }
        else setState(result);
      }
      catch { setState({ message: "Не удалось сохранить профиль. Попробуйте ещё раз." }); }
      finally { inFlight.current = false; setPending(false); }
    }}>
      <EquipmentProfileFormFields profile={profile} showPresets={mode === "create"} existingNames={existingNames} fieldErrors={state.fieldErrors} />
      {state.message ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Сохраняем…" : mode === "edit" ? "Сохранить профиль" : "Создать профиль"}</Button>
        <Link href="/app/equipment" className="rounded-md border border-border px-3 py-2 text-sm">Отменить</Link>
      </div>
    </form>
  );
}
