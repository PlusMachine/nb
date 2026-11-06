import { and, brewDevices, db, desc, eq, fermentReadings, fermentSessions, isNull, lte, sql } from "@nb/db";

import { INGEST_PERSIST_GATE_SECONDS } from "./contracts";
import type { NormalizedReading } from "./normalize-core";

type StreamTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function touchStreamDeviceOnline(deviceId: string, receivedAt: Date, client: typeof db | StreamTransaction = db) {
  return client.update(brewDevices).set({
    lastSeenAt: sql`greatest(${brewDevices.lastSeenAt}, ${receivedAt.toISOString()}::timestamptz)`,
    status: "online",
    updatedAt: new Date()
  }).where(eq(brewDevices.id, deviceId)).returning({ lastSeenAt: brewDevices.lastSeenAt });
}

const MAX_SOURCE_AGE_MS = 48 * 60 * 60 * 1000;

export function resolveStreamReadingTs(sourceTs: Date | null, receivedAt: Date): Date {
  if (!sourceTs) return receivedAt;
  const ageMs = receivedAt.getTime() - sourceTs.getTime();
  return ageMs >= 0 && ageMs <= MAX_SOURCE_AGE_MS ? sourceTs : receivedAt;
}

type PersistResult =
  | { kind: "not_found" | "throttled" }
  | { kind: "stored"; sessionId: string | null; firstReading: boolean };

export function persistStreamReading(input: {
  deviceId: string;
  receivedAt: Date;
  ts: Date;
  reading: NormalizedReading;
  payload: Record<string, unknown>;
}): Promise<PersistResult> {
  const { deviceId, receivedAt, ts, reading, payload } = input;
  return db.transaction(async tx => {
    // UPDATE locks the device row through the gate and insert. Concurrent
    // deliveries see the previous commit before deciding to store a point.
    const [device] = await touchStreamDeviceOnline(deviceId, receivedAt, tx);
    if (!device) return { kind: "not_found" };

    const [latest] = await tx.select({ ts: fermentReadings.ts }).from(fermentReadings)
      .where(and(eq(fermentReadings.deviceId, deviceId), lte(fermentReadings.ts, device.lastSeenAt ?? receivedAt)))
      .orderBy(desc(fermentReadings.ts)).limit(1);
    if (latest && ts.getTime() - latest.ts.getTime() < INGEST_PERSIST_GATE_SECONDS * 1000) {
      return { kind: "throttled" };
    }

    const [session] = await tx.select({ id: fermentSessions.id }).from(fermentSessions)
      .where(and(eq(fermentSessions.deviceId, deviceId), isNull(fermentSessions.endedAt), lte(fermentSessions.startedAt, ts)))
      .limit(1);
    const sessionId = session?.id ?? null;
    const [stored] = await tx.insert(fermentReadings)
      .values({ deviceId, sessionId, ts, ...reading, payload })
      .onConflictDoNothing({ target: [fermentReadings.deviceId, fermentReadings.ts] })
      .returning({ id: fermentReadings.id });
    return stored ? { kind: "stored", sessionId, firstReading: !latest } : { kind: "throttled" };
  });
}
