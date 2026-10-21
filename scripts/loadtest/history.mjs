import pg from "pg";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/nb_loadtest") throw new Error("Only the isolated local test database is allowed");
const pool = new pg.Pool({ connectionString: url.href });
try {
  // Valid protocol frames sampled from the preceding MQTT test, with consistent
  // timestamps and sequences. Only this synthetic sequence range is replaced.
  await pool.query("DELETE FROM brew_telemetry WHERE seq BETWEEN 1999998000 AND 1999999999 AND device_id IN (SELECT id FROM brew_devices WHERE hardware_id LIKE 'bf-loadtest-%')");
  const result = await pool.query(`
    INSERT INTO brew_telemetry (device_id,ts,seq,stage,primary_c,setpoint_c,heat_duty_pct,payload)
    SELECT d.id,now()-g.n*interval '10 seconds',2000000000-g.n,5,65.4,67,42,
      src.payload || jsonb_build_object('seq',2000000000-g.n,'ts',floor(extract(epoch FROM now()-g.n*interval '10 seconds')))
    FROM brew_devices d
    CROSS JOIN generate_series(1,2000) AS g(n)
    CROSS JOIN LATERAL (SELECT payload FROM brew_telemetry t WHERE t.device_id=d.id AND t.seq < 1900000000 ORDER BY ts DESC LIMIT 1) src
    WHERE d.hardware_id LIKE 'bf-loadtest-%'
  `);
  if (result.rowCount !== 100_000) throw new Error(`Expected 100000 frames, got ${result.rowCount}; run the 50-device MQTT test first`);
  await pool.query("ANALYZE brew_telemetry");
  const snapshot = (await pool.query("SELECT count(*)::int AS rows, pg_total_relation_size('brew_telemetry')::float AS relation_bytes, pg_database_size(current_database())::float AS database_bytes, avg(pg_column_size(t))::float AS row_bytes FROM brew_telemetry t")).rows[0];
  const output = path.resolve(process.env.LOADTEST_OUTPUT ?? ".local-artifacts/loadtest");
  await writeFile(path.join(output, "history-dataset.json"), JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify(snapshot));
} finally {
  await pool.end();
}
