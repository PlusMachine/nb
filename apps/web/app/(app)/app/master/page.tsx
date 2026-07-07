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

  // getOwnMasterProfile отдаёт только status="ready" фото (см. её JSDoc в
  // features/masters/service.ts) — для превью публикации этого достаточно, но
  // кабинету нужны ещё uploading/failed слоты (иначе зависший failed-аплоад
  // после перезагрузки станет невидимым, хотя занимает место в лимите 24).
  const images = await listOwnMasterImages(user.id);

  return <MasterCabinet initialProfile={own.profile} initialItems={own.items} initialImages={images} />;
}
