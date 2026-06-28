/**
 * Maintenance job: удаляет израсходованные/просроченные записи `verifications`,
 * чтобы таблица не росла бесконечно. Функция cleanupExpiredVerifications есть в
 * @nb/auth, но раньше нигде не вызывалась.
 *
 * Запуск:  npm run cleanup:verifications   (из корня)
 *
 * В отличие от seed-скриптов это НЕ dev-only: безопасно (и нужно) запускать в
 * production по расписанию (cron / scheduled job).
 */
import { cleanupExpiredVerifications } from "@nb/auth";

const main = async () => {
  await cleanupExpiredVerifications();
  console.log("[cleanup] expired/used verifications removed");
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[cleanup] failed", error);
    process.exit(1);
  });
