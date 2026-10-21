import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";

const origin = new URL(process.env.LOADTEST_URL ?? "http://127.0.0.1:3300");
if (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname)) {
  throw new Error("Only a local HTTP test server is allowed");
}
const output = path.resolve(process.env.LOADTEST_OUTPUT ?? ".local-artifacts/loadtest");
const fixtures = JSON.parse(await readFile(path.join(output, "fixtures.json"), "utf8"));
const concurrency = Number(process.env.LOADTEST_USERS ?? 10);
const seconds = Number(process.env.LOADTEST_SECONDS ?? 60);
const thinkMs = Number(process.env.LOADTEST_THINK_MS ?? 0);
const mode = process.env.LOADTEST_MODE ?? "mixed";
const runName = process.env.LOADTEST_NAME ?? `${mode}-${concurrency}-${Date.now()}`;
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > fixtures.length || seconds <= 0 || seconds > 3600 || thinkMs < 0) throw new Error("Invalid load settings");
const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
const scenarios = {
  mixed: [
    { path: "/", authenticated: false },
    { path: "/recipes", authenticated: false },
    { path: "/catalog", authenticated: false },
    { path: "/catalog/malts", authenticated: false },
    { path: "/app", authenticated: true },
    { path: "/app/ingredients", authenticated: true },
    { path: "/app/recipes", authenticated: true },
    { path: "/api/ingredients/search?q=citra&limit=10", authenticated: true, json: true, nonempty: true },
    { path: "/api/inventory/suggestions?q=pilsner&limit=10", authenticated: true, json: true, nonempty: true },
    { path: "/api/recipes/by-style?style=18B&limit=6", authenticated: false, json: true, nonempty: true },
  ],
  search: ["citra", "pilsner", "cascade", "солод", "us-05"].map(q => ({ path: `/api/ingredients/search?q=${encodeURIComponent(q)}&limit=10`, authenticated: false, json: true, nonempty: true })),
  pages: ["/", "/recipes", "/catalog", "/catalog/malts"].map(p => ({ path: p, authenticated: false })),
  api: [{ path: "/api/recipes/by-style?style=18B&limit=6", authenticated: false, json: true, nonempty: true }],
  workspace: [
    { path: "/app/recipes/{recipeId}", authenticated: true },
    { path: "/app/recipes/{recipeId}/edit", authenticated: true },
    { path: "/api/labels/{recipeId}?format=png&preview=1", authenticated: true, binary: "png" },
    { path: "/api/labels/{recipeId}?format=pdf&sheet=1", authenticated: true, binary: "pdf" },
    { path: "/api/devices/{deviceId}/telemetry/history", authenticated: true, json: true, field: "points", nonempty: true },
  ],
  history: [
    { path: "/api/devices/{deviceId}/telemetry/history", authenticated: true, json: true, field: "points", nonempty: true },
    { path: "/api/devices/{deviceId}/telemetry/history?windowDays=30", authenticated: true, json: true, field: "points", nonempty: true },
  ],
};
if (!scenarios[mode]) throw new Error(`Unknown mode: ${mode}`);
const results = [];
const errors = [];
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

async function request(scenario, index) {
  const start = performance.now();
  return new Promise(resolve => {
    const headers = { "x-forwarded-for": `192.0.2.${index + 1}`, "accept-encoding": "gzip", "user-agent": "nb-local-loadtest" };
    if (scenario.authenticated) headers.cookie = `nb_session=${fixtures[index].token}`;
    const requestPath = scenario.path.replace("{recipeId}", fixtures[index].recipeIds[0]).replace("{deviceId}", fixtures[index].deviceId);
    const req = http.get(new URL(requestPath, origin), { agent, headers }, res => {
      const chunks = [];
      const ttfbMs = performance.now() - start;
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", async () => {
        let body = Buffer.concat(chunks);
        let issue;
        try {
          if (res.headers["content-encoding"] === "gzip") {
            const { gunzipSync } = await import("node:zlib");
            body = gunzipSync(body);
          }
          if (res.statusCode !== 200) issue = `HTTP ${res.statusCode}`;
          else if (scenario.json) {
            const parsed = JSON.parse(body.toString());
            const items = parsed[scenario.field ?? "items"];
            if (!Array.isArray(items) || (scenario.nonempty && items.length === 0)) issue = "Invalid or empty JSON collection";
          } else if (scenario.binary) {
            const valid = scenario.binary === "png"
              ? body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
              : body.subarray(0, 5).equals(Buffer.from("%PDF-"));
            if (!valid) issue = "Invalid binary response";
          } else if (!body.includes(Buffer.from("</html>")) || /data-dgst="\d+"/.test(body.toString())) {
            issue = "Incomplete HTML or streamed server error";
          }
        } catch (error) { issue = error.message; }
        resolve({ path: scenario.path, ms: performance.now() - start, ttfbMs, status: res.statusCode, bytes: Buffer.concat(chunks).length, issue });
      });
      res.on("error", error => resolve({ path: scenario.path, ms: performance.now() - start, status: 0, issue: error.message, bytes: 0 }));
    });
    req.setTimeout(15_000, () => req.destroy(new Error("Request timeout")));
    req.on("error", error => resolve({ path: scenario.path, ms: performance.now() - start, status: 0, issue: error.message, bytes: 0 }));
  });
}

// Smoke checks validate every scenario, including real sessions, before timing.
for (const scenario of scenarios[mode]) {
  const sample = await request(scenario, 0);
  if (sample.issue) throw new Error(`Preflight ${scenario.path}: ${sample.issue}`);
}
const started = performance.now();
const deadline = started + seconds * 1000;
await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
  // Deterministic stagger avoids an artificial simultaneous burst in paced runs.
  if (thinkMs) await pause(index * thinkMs / concurrency);
  let step = index;
  while (performance.now() < deadline) {
    const scenario = scenarios[mode][step++ % scenarios[mode].length];
    const result = await request(scenario, index);
    results.push(result);
    if (result.issue && errors.length < 20) errors.push({ path: result.path, status: result.status, issue: result.issue });
    if (thinkMs) await pause(Math.max(0, Math.min(deadline - performance.now(), thinkMs * (0.8 + ((step + index) % 5) / 10))));
  }
}));
const elapsed = (performance.now() - started) / 1000;
loop.disable();
agent.destroy();
const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] * 100) / 100;
};
const summarize = rows => ({
  count: rows.length,
  failed: rows.filter(r => r.issue).length,
  statuses: rows.reduce((s, r) => ({ ...s, [r.status]: (s[r.status] ?? 0) + 1 }), {}),
  p50Ms: percentile(rows.map(r => r.ms), .5),
  p95Ms: percentile(rows.map(r => r.ms), .95),
  p99Ms: percentile(rows.map(r => r.ms), .99),
  maxMs: percentile(rows.map(r => r.ms), 1),
  ttfbP95Ms: percentile(rows.map(r => r.ttfbMs ?? r.ms), .95),
});
const grouped = Object.fromEntries([...new Set(results.map(r => r.path))].map(p => [p, summarize(results.filter(r => r.path === p))]));
const summary = {
  name: runName, startedAt: new Date(Date.now() - elapsed * 1000).toISOString(),
  mode, concurrency, thinkMs, durationRequestedSeconds: seconds,
  elapsedSeconds: Math.round(elapsed * 100) / 100,
  requestsPerSecond: Math.round(results.length / elapsed * 100) / 100,
  ...summarize(results),
  bytesReceived: results.reduce((sum, r) => sum + r.bytes, 0),
  generatorCpu: process.cpuUsage(),
  generatorEventLoopP99Ms: Math.round(loop.percentile(99) / 1e6 * 100) / 100,
  routes: grouped, errors,
};
await mkdir(output, { recursive: true });
await writeFile(path.join(output, `${runName}.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
if (summary.failed) process.exitCode = 1;
