import { NextResponse } from "next/server";

import { buildFermentHistory } from "@/components/demo/demo-data";

// GET /api/brew-batches/demo/telemetry/history — статичная история брожения для
// графика ферментации на демо-странице (`/demo`, docs/demo-page.md §2.4).
// Литеральный сегмент `demo` перекрывает динамический
// `/api/brew-batches/[id]/telemetry/history` — без БД и сессии, чистый генератор.
// `now` берётся на каждый запрос, чтобы ряд всегда заканчивался «сейчас».
export const dynamic = "force-dynamic";

export async function GET() {
  const points = buildFermentHistory(new Date());
  return NextResponse.json({ points });
}
