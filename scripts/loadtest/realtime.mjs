import mqtt from "mqtt";
import WebSocket from "ws";
import pg from "pg";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";

const output = path.resolve(process.env.LOADTEST_OUTPUT ?? ".local-artifacts/loadtest");
const fixtures = JSON.parse(await readFile(path.join(output, "fixtures.json"), "utf8"));
const deviceCount = Number(process.env.LOADTEST_DEVICES ?? 50);
const seconds = Number(process.env.LOADTEST_SECONDS ?? 60);
const runName = process.env.LOADTEST_NAME ?? `realtime-${deviceCount}-${Date.now()}`;
const mqttUrl = process.env.LOADTEST_MQTT_URL ?? "mqtt://127.0.0.1:51883";
const wsUrl = process.env.LOADTEST_WS_URL ?? "ws://127.0.0.1:58090";
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if ([mqttUrl, wsUrl, dbUrl.href].some(u => !["127.0.0.1", "localhost"].includes(new URL(u).hostname)) || dbUrl.pathname !== "/nb_loadtest") throw new Error("Only the isolated local test stack is allowed");
if (!Number.isInteger(deviceCount) || deviceCount < 1 || deviceCount > fixtures.length || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error("Invalid realtime settings");
const pool = new pg.Pool({ connectionString: dbUrl.href });
const before = (await pool.query("SELECT count(*)::int AS n FROM brew_telemetry")).rows[0].n;
const latencies = [];
const pending = new Map();
const errors = [];
const sockets = [];
let received = 0;
let duplicate = 0;
let acked = 0;
let sent = 0;
const selected = fixtures.slice(0, deviceCount);
const client = mqtt.connect(mqttUrl, { reconnectPeriod: 0 });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("MQTT connect timeout")), 10_000);
    client.once("connect", () => { clearTimeout(timeout); resolve(); });
    client.once("error", e => { clearTimeout(timeout); reject(e); });
  });
  await Promise.all(selected.map(f => new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, ["nb-bridge-v1", f.token]);
    sockets.push(ws);
    const timeout = setTimeout(() => reject(new Error("WS subscribe timeout")), 10_000);
    ws.on("message", data => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "ready") ws.send(JSON.stringify({ type: "subscribe", deviceId: f.hardwareId }));
      if (msg.type === "subscribed") { clearTimeout(timeout); resolve(); }
      if (msg.type === "error") { errors.push(msg.error); clearTimeout(timeout); reject(new Error(msg.error)); }
      if (msg.type === "telemetry") {
        const key = `${msg.deviceId}:${msg.data.seq}`;
        const timestamp = pending.get(key);
        if (timestamp === undefined) { duplicate++; return; }
        received++;
        latencies.push(performance.now() - timestamp);
        pending.delete(key);
      }
    });
    ws.on("error", e => { clearTimeout(timeout); reject(e); });
  })));
  const started = performance.now();
  const seqBase = Math.floor(Date.now() / 1000) % 1_000_000_000;
  for (let tick = 0; tick < seconds; tick++) {
    await Promise.all(selected.map(f => new Promise((resolve, reject) => {
      const frame = {
        schema: 1, deviceId: f.hardwareId, fw: "2.0.0", ts: Math.floor(Date.now() / 1000), seq: seqBase + tick,
        uptime: tick + 3600, stage: 5, stageName: "MASH_STEP", pausedFrom: 0,
        faultMask: 0, faults: [], heatingPermitted: true,
        sensors: [{ i: 0, c: 65.4, valid: true }], primary: { c: 65.4, valid: true }, setpointC: 67,
        heatMode: 1, heatDutyPct: 42, heatOn: true, spargeHeatOn: false, pumpOn: true, boilPct: 0,
        stageRemainingSec: 1200 - tick, stageElapsedSec: tick, mashStepIndex: 1, nMashSteps: 3,
        hopStandIndex: 0, prompt: 0, promptSeq: 7, nextHopAlert: false, activeRecipe: 6,
        recipeName: "Load test", statusLine: "Затирание",
      };
      pending.set(`${f.hardwareId}:${frame.seq}`, performance.now());
      sent++;
      client.publish(`brewforge/${f.hardwareId}/telemetry`, JSON.stringify(frame), { qos: 1 }, e => {
        if (e) reject(e); else { acked++; resolve(); }
      });
    })));
    await pause(Math.max(0, started + (tick + 1) * 1000 - performance.now()));
  }
  const drainStart = performance.now();
  while (pending.size && performance.now() - drainStart < 10_000) await pause(100);
  const after = (await pool.query("SELECT count(*)::int AS n FROM brew_telemetry")).rows[0].n;
  const storage = (await pool.query("SELECT pg_total_relation_size('brew_telemetry')::float AS total_bytes, pg_relation_size('brew_telemetry')::float AS heap_bytes, avg(pg_column_size(t))::float AS row_bytes FROM brew_telemetry t")).rows[0];
  const sorted = latencies.sort((a,b) => a-b);
  const p = f => Math.round((sorted[Math.max(0, Math.ceil(sorted.length*f)-1)] ?? 0)*100)/100;
  const result = { name: runName, devices: deviceCount, wsClients: sockets.length, durationSeconds: seconds, messagesPerSecond: deviceCount, sent, mqttAcked: acked, wsReceived: received, missing: pending.size, duplicate, failed: errors.length, errors, latencyP50Ms: p(.5), latencyP95Ms: p(.95), latencyP99Ms: p(.99), maxLatencyMs: p(1), persistedRows: after-before, storage };
  await writeFile(path.join(output, `${runName}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (result.missing || result.failed || sent !== acked) process.exitCode = 1;
} finally {
  for (const ws of sockets) ws.terminate();
  await new Promise(resolve => client.end(true, {}, resolve));
  await pool.end();
}
