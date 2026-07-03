// =============================================================================
//  lib/device-token-crypto.ts
//  Обратимое шифрование per-device bearer-токена BrewForge «на диске» (P4).
//
//  ПОЧЕМУ обратимое, а не просто hashToken (как sessions.token_hash): токен
//  используется в ДВЕ стороны —
//   (а) устройство предъявляет его порталу/мосту (сверка по хэшу — см.
//       findDeviceByToken в features/devices/service.ts, hashToken достаточен);
//   (б) ПОРТАЛ САМ предъявляет тот же токен УСТРОЙСТВУ как `Authorization: Bearer`
//       при каждом LAN-запросе (features/brew-controller/transport.ts) — а из
//       одностороннего хэша plaintext восстановить нельзя в принципе.
//  Раньше (б) не работал вообще: resolveDeviceToken читал токен из env
//  (BREWFORGE_DEVICE_TOKEN[_<id>]), т.е. реальный токен, выданный claimDevice, был
//  порталу физически недоступен для повторного использования — см. TODO, который
//  этот пакет закрывает (notes/audit/comms-portal.md, P4).
//
//  Ключ шифрования — ОТДЕЛЬНЫЙ секрет сервера (BREWFORGE_DEVICE_TOKEN_ENC_KEY,
//  32 байта, hex ИЛИ base64), не AUTH_SECRET и не какой-либо секрет пользователя.
//  БЕЗ этого ключа шифрование недоступно: encryptDeviceToken/decryptDeviceToken
//  возвращают null (не бросают) — вызывающий откатывается на env-фолбэк
//  (BREWFORGE_DEVICE_TOKEN[_<id>], см. brewforge-provider.ts resolveDeviceToken)
//  — так dev-стенды без ключа продолжают работать, как раньше.
//
//  Модель угрозы: это защита БД «на диске» (утечка дампа/бэкапа без доступа к
//  серверному процессу/env не раскрывает токены устройств), НЕ zero-knowledge —
//  компрометация И БД, И env-ключа сервера раскрывает токены. Это неизбежное
//  следствие того, что порталу СОЗНАТЕЛЬНО нужен plaintext для LAN bearer-auth
//  (см. выше); альтернатива «хранить только хэш» технически исключает LAN-путь.
// =============================================================================
import { decryptSecret, encryptSecret, parseEncryptionKey } from "@nb/auth";

let cachedKey: Buffer | null | undefined; // undefined = ещё не резолвили, null = недоступен

function resolveKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.BREWFORGE_DEVICE_TOKEN_ENC_KEY;
  if (!raw) {
    cachedKey = null;
    return null;
  }
  try {
    cachedKey = parseEncryptionKey(raw);
  } catch (error) {
    console.error(
      "[device-token-crypto] BREWFORGE_DEVICE_TOKEN_ENC_KEY задан, но невалиден " +
        "(ожидается 32 байта в hex или base64) — шифрование токенов устройств отключено:",
      error,
    );
    cachedKey = null;
  }
  return cachedKey;
}

/** true, если ключ шифрования настроен (для диагностики/健康-чеков, не обязателен к вызову). */
export const isDeviceTokenEncryptionConfigured = (): boolean => resolveKey() !== null;

/** Зашифровать raw bearer-токен для хранения в brew_devices.token_encrypted. null — ключ не настроен. */
export function encryptDeviceToken(rawToken: string): string | null {
  const key = resolveKey();
  if (!key) return null;
  return encryptSecret(rawToken, key);
}

/**
 * Расшифровать сохранённый токен. null — ключ не настроен ИЛИ значение повреждено/
 * зашифровано другим (ротированным) ключом; вызывающий (resolveDeviceToken) в этом
 * случае откатывается на env-фолбэк, а не падает — устройство просто временно
 * недостижимо по LAN до повторного /pair, что безопаснее, чем бросать 500.
 */
export function decryptDeviceToken(encoded: string): string | null {
  const key = resolveKey();
  if (!key) return null;
  try {
    return decryptSecret(encoded, key);
  } catch (error) {
    console.error("[device-token-crypto] не удалось расшифровать device-token (битое значение/ключ сменился):", error);
    return null;
  }
}
