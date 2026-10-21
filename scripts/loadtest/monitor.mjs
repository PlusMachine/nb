import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import path from "node:path";

const exec = promisify(execFile);
const names = (process.env.LOADTEST_CONTAINERS ?? "nb-loadtest-web-20261013,nb-loadtest-postgres-20261013,nb-loadtest-bridge-20261013,nb-loadtest-mqtt-20261013").split(",");
if (names.some(n => !/^nb-loadtest-[a-z]+-\d+$/.test(n))) throw new Error("Only load-test containers can be sampled");
const seconds = Number(process.env.LOADTEST_SECONDS ?? 65);
const output = path.resolve(process.env.LOADTEST_OUTPUT ?? ".local-artifacts/loadtest");
const runName = process.env.LOADTEST_NAME ?? `resources-${Date.now()}`;
const samples = [];
const deadline = Date.now() + seconds*1000;
while (Date.now() < deadline) {
  const { stdout } = await exec("docker", ["stats", "--no-stream", "--format", "{{json .}}", ...names], { timeout: 10_000 });
  for (const line of stdout.trim().split("\n")) if (line) samples.push({ timestamp: new Date().toISOString(), ...JSON.parse(line) });
  await pause(1000);
}
await writeFile(path.join(output, `${runName}.json`), JSON.stringify(samples, null, 2));
console.log(JSON.stringify({ name: runName, samples: samples.length }));
