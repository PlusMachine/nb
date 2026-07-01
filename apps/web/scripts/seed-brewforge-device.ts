/**
 * Dev-only: засеять строку brew_devices для физической платы BrewForge,
 * подключённой по LAN, чтобы портал/модалка «Варить на устройстве» её видели.
 *
 * Идемпотентно по уникальному hardwareId. Привязывает к dev-пользователю
 * (DEV_AUTH_EMAIL). tokenHash остаётся NULL — для LAN при пустом токене прошивки
 * аутентификация не требуется (bench-режим). Это M0 (см. план интеграции);
 * человеческий пайринг по claim-коду — задача M1.
 *
 * Запуск:  pnpm -F @nb/web exec tsx scripts/seed-brewforge-device.ts \
 *            [-- --hardware-id bf-e9f8 --local-url http://192.168.1.81]
 */
import { brewDevices, db, eq, pool, users } from "@nb/db";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const email = arg("email", process.env.DEV_AUTH_EMAIL || "qa.admin@localhost");
  const hardwareId = arg("hardware-id", "bf-e9f8");
  const localUrl = arg("local-url", "http://192.168.1.81");
  const fw = arg("fw", "2.0.0");
  const name = arg("name", `BrewForge ${hardwareId}`);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(
      `Пользователь ${email} не найден. Сначала: pnpm seed:qa (или seed:dev-user).`,
    );
  }

  const [row] = await db
    .insert(brewDevices)
    .values({
      userId: user.id,
      name,
      hardwareId,
      localUrl,
      fw,
      status: "online",
      capabilities: ["brew_control", "telemetry"],
    })
    .onConflictDoUpdate({
      target: brewDevices.hardwareId,
      set: { userId: user.id, name, localUrl, fw, status: "online" },
    })
    .returning();

  console.log(
    `OK: устройство ${row.hardwareId} (id=${row.id}) → ${row.localUrl} ` +
      `привязано к ${email} (userId=${user.id})`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
