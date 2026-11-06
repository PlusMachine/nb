import { randomUUID } from "node:crypto";
import mqtt from "mqtt";
import { afterAll, beforeAll, expect, it } from "vitest";
import { brewBatches, brewDevices, brewTelemetry, db, eq, fermentReadings, fermentSessions, inArray, pool, users } from "@nb/db";
import { SimDevice } from "@nb/brewforge-sim";
import { startMqtt } from "../../bridge/src/mqtt";
import { cloudTransport } from "../features/brew-controller/cloud-transport";
import { readFreshTelemetry } from "../features/brew-controller/device-telemetry-cache";
import { ingestStreamPacket } from "../features/device-streams/ingest";
import { createStreamDevice } from "../features/device-streams/service";

const ownerIds: string[] = [];
const local = ["localhost", "127.0.0.1"];
const mqttUrl = process.env.BREWFORGE_MQTT_URL;
const owner = async () => {
  const [user] = await db.insert(users).values({ displayName: "QA telemetry" }).returning({ id: users.id });
  ownerIds.push(user!.id);
  return user!.id;
};

beforeAll(() => {
  const database = new URL(process.env.DATABASE_URL!);
  if (process.env.NODE_ENV === "production" || !local.includes(database.hostname)) throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
});
afterAll(async () => {
  if (ownerIds.length) await db.delete(users).where(inArray(users.id, ownerIds));
  await pool.end();
});

it("serializes concurrent packets and ignores legacy future readings", async () => {
  const { device, ingestUrl } = await createStreamDevice(await owner(), { name: "QA iSpindel", kind: "ispindel" });
  const rawToken = new URL(ingestUrl).pathname.split("/").at(-1)!;
  const now = Date.now();
  await db.insert(fermentReadings).values({ deviceId: device.id, ts: new Date(now + 3_600_000), payload: {} });

  const results = await Promise.all([0, 1, 2, 3].map(offset => ingestStreamPacket({
    rawToken,
    body: { name: "iSpindel", ID: 1, angle: 33, gravity: 1.048, temperature: 18, "gravity-unit": "G" },
    clientIp: null,
    receivedAt: new Date(now + offset)
  })));
  expect(results.map(result => result.kind).sort()).toEqual(["stored", "throttled", "throttled", "throttled"]);
  const readings = await db.select().from(fermentReadings).where(eq(fermentReadings.deviceId, device.id));
  expect(readings.filter(reading => reading.ts.getTime() <= now + 3)).toHaveLength(1);
  expect((await db.query.brewDevices.findFirst({ where: eq(brewDevices.id, device.id) }))?.lastSeenAt?.getTime()).toBe(now + 3);
});

it("keeps late readings outside the next batch and substitutes reception time for a future source clock", async () => {
  const userId = await owner();
  const { device, ingestUrl } = await createStreamDevice(userId, { name: "QA Tilt", kind: "tilt" });
  const rawToken = new URL(ingestUrl).pathname.split("/").at(-1)!;
  const now = Date.now();
  const [batch] = await db.insert(brewBatches).values({ userId, status: "fermenting", name: "QA new batch", brewNumber: 1 }).returning();
  const [session] = await db.insert(fermentSessions).values({
    userId, deviceId: device.id, brewBatchId: batch!.id, startedAt: new Date(now - 30 * 60_000)
  }).returning();

  const tilt = (ts: number) => ingestStreamPacket({
    rawToken,
    body: { Timepoint: ts / 86_400_000 + 25_569, Temp: 68, SG: 1.048, Beer: "QA", Color: "BLACK" },
    clientIp: null,
    receivedAt: new Date(now)
  });
  expect(await tilt(now - 3_600_000)).toEqual({ kind: "stored" });
  expect(await tilt(now + 3_600_000)).toEqual({ kind: "stored" });
  const readings = await db.select().from(fermentReadings).where(eq(fermentReadings.deviceId, device.id));
  readings.sort((left, right) => left.ts.getTime() - right.ts.getTime());
  expect(readings.map(reading => [reading.ts.getTime(), reading.sessionId])).toEqual([
    [now - 3_600_000, null], [now, session!.id]
  ]);
});

it.runIf(Boolean(mqttUrl))("keeps cloud telemetry live between history writes and clears it on disconnect", async () => {
  if (!local.includes(new URL(mqttUrl!).hostname)) throw new Error("LOCAL_TEST_BROKER_REQUIRED");
  const userId = await owner();
  const hardwareId = `bf-qa-${randomUUID()}`;
  const [device] = await db.insert(brewDevices).values({ userId, hardwareId, name: "QA BrewForge" }).returning();
  const transport = cloudTransport(device!);
  const statusTopic = `brewforge/${hardwareId}/status`;
  const telemetryTopic = `brewforge/${hardwareId}/telemetry`;
  const sim = new SimDevice({ deviceId: hardwareId, fw: "qa", tickMs: 1000, tickScale: 1, scenario: "ferment" });
  const frame = (seq: number) => JSON.stringify({ ...sim.snapshot(), seq, ts: Math.floor(Date.now() / 1000) });
  const bridge = startMqtt({ url: mqttUrl });
  const publisher = mqtt.connect(mqttUrl!);
  try {
    await expect.poll(() => bridge.isConnected() && publisher.connected).toBe(true);
    await publisher.publishAsync(telemetryTopic, frame(1), { qos: 1 });
    const history = () => db.select().from(brewTelemetry).where(eq(brewTelemetry.deviceId, device!.id));
    await expect.poll(async () => (await history()).length).toBe(1);
    await expect.poll(async () => (await transport.getTelemetry())?.seq).toBe(1);

    await publisher.publishAsync(telemetryTopic, frame(2), { qos: 1 });
    await expect.poll(async () => (await transport.getTelemetry())?.seq).toBe(2);
    expect((await history()).map(row => row.seq)).toEqual([1]);

    await publisher.publishAsync(statusTopic, "offline", { qos: 1 });
    const identity = { userId, deviceId: device!.id };
    await expect.poll(() => readFreshTelemetry(identity)).toBeNull();
    await publisher.publishAsync(statusTopic, "online", { qos: 1 });
    await expect.poll(async () => (await db.query.brewDevices.findFirst({ where: eq(brewDevices.id, device!.id) }))?.status).toBe("online");
    expect(await readFreshTelemetry(identity)).toBeNull();
    await publisher.publishAsync(telemetryTopic, frame(3), { qos: 1 });
    await expect.poll(async () => (await readFreshTelemetry(identity))?.seq).toBe(3);
  } finally {
    await publisher.endAsync(true);
    await bridge.close();
  }
});
