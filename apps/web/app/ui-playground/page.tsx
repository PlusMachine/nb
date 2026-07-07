import { notFound } from "next/navigation";

import { UiPlaygroundContent } from "./content";

// Внутренний QA-стенд UI-примитивов — не для продакшена (и не для индекса,
// см. app/robots.ts).
export default function UiPlaygroundPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <UiPlaygroundContent />;
}
