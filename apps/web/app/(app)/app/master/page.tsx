import React from "react";

import { listOwnMasterImages } from "@/features/masters/images";
import { getOwnMasterProfile } from "@/features/masters/service";
import { requireUser } from "@/lib/auth";

import { MasterCabinet } from "./master-cabinet";
import { MasterOnboarding } from "./master-onboarding";

export const metadata = {
  title: "Моя витрина"
};

export default async function MasterCabinetPage() {
  const user = await requireUser();
  const own = await getOwnMasterProfile(user.id);

  if (!own) {
    return <MasterOnboarding />;
  }

  // Фото берём только из listOwnMasterImages — намеренно НЕ используем own.images
  // (не деструктурируем его вовсе): getOwnMasterProfile отдаёт только status="ready"
  // фото (см. её JSDoc в features/masters/service.ts), этого достаточно для превью
  // публикации, но кабинету нужны ещё uploading/failed слоты (иначе зависший
  // failed-аплоад после перезагрузки станет невидимым, хотя занимает место в
  // лимите 24). Профиль/изделия — из own; own.images нигде дальше не используется.
  const { profile, items } = own;
  const images = await listOwnMasterImages(user.id);

  return <MasterCabinet initialProfile={profile} initialItems={items} initialImages={images} />;
}
