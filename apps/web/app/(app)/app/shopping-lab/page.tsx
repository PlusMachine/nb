import React from "react";

import { ShoppingLabContent } from "./content";

// Лаборатория (черновик IA «Чего не хватает») — без Suspense/скелетона:
// страница не для продакшена, простой блокирующий рендер достаточен.
export const metadata = {
  title: "Черновик списка покупок"
};

export default function ShoppingLabPage() {
  return <ShoppingLabContent />;
}
