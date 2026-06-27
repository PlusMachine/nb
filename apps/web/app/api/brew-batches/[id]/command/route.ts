import { NextResponse } from "next/server";

import { CommandSchema } from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById } from "@/features/brew-batches/service";
import { getProvider } from "@/features/brew-controller";

// POST /api/brew-batches/:id/command — отправить команду на устройство партии.
// Тело: { command: Command } (валидируется CommandSchema). Резолвим партию
// (ownership) → её устройство → getProvider('brewforge').sendCommand(...).
// Возвращаем Ack (в т.ч. nack ok:false — это валидный ответ, не ошибка HTTP).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const batch = await getBrewBatchById(user.id, id);
    if (!batch) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (!batch.deviceId) {
      return NextResponse.json({ error: "BREW_BATCH_NO_DEVICE" }, { status: 409 });
    }

    const body = await request.json();
    const command = CommandSchema.parse(body?.command);

    const provider = getProvider("brewforge");
    if (!provider?.sendCommand) {
      return NextResponse.json({ error: "PROVIDER_UNAVAILABLE" }, { status: 503 });
    }

    const ack = await provider.sendCommand({
      userId: user.id,
      deviceId: batch.deviceId,
      brewBatchId: batch.id,
      command
    });

    return NextResponse.json({ ack });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
