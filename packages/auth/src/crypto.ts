import crypto from "node:crypto";

const hash = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

export const createRandomToken = (size = 32): string => crypto.randomBytes(size).toString("hex");

// =============================================================================
//  Обратимое шифрование секрета (AES-256-GCM) — отдельная примитива от hashToken.
//
//  hashToken/verifyPassword — ОДНОСТОРОННИЕ: годятся, когда сервер лишь СВЕРЯЕТ
//  предъявленный секрет (сессии, пароли — сервер никогда не должен уметь достать
//  plaintext обратно). encryptSecret/decryptSecret — для случаев, когда сервер сам
//  ДОЛЖЕН впоследствии предъявить тот же секрет третьей стороне (пример: BrewForge
//  device-token — портал не только принимает его от устройства, но и АКТИВНО шлёт
//  его же устройству как Authorization: Bearer при каждом LAN-запросе; односторонний
//  хэш этого не позволяет в принципе). Это защита «на диске» (at rest) — не
//  zero-knowledge: компрометация И БД, И серверного ключа шифрования раскрывает
//  секрет. Ключ передаётся вызывающим (не читается отсюда из env) — эта примитива
//  сознательно не знает про конкретные ENV-переменные конкретных фич.
// =============================================================================
const ENC_ALGO = "aes-256-gcm";
const ENC_KEY_BYTES = 32; // AES-256
const ENC_IV_BYTES = 12; // 96 бит — рекомендация NIST SP 800-38D для GCM

/**
 * Зашифровать secret ключом key (ровно 32 байта). Формат:
 * "<iv-hex>:<authTag-hex>:<ciphertext-hex>" — самодостаточная строка для хранения
 * в одной текстовой колонке БД.
 */
export const encryptSecret = (plaintext: string, key: Buffer): string => {
  if (key.length !== ENC_KEY_BYTES) {
    throw new Error(`encryptSecret: key must be ${ENC_KEY_BYTES} bytes, got ${key.length}`);
  }
  const iv = crypto.randomBytes(ENC_IV_BYTES);
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
};

/** Обратная операция encryptSecret. Бросает при повреждённом формате/неверном ключе/authTag. */
export const decryptSecret = (encoded: string, key: Buffer): string => {
  if (key.length !== ENC_KEY_BYTES) {
    throw new Error(`decryptSecret: key must be ${ENC_KEY_BYTES} bytes, got ${key.length}`);
  }
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("decryptSecret: malformed encoded value (expected iv:authTag:ciphertext)");
  }
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];
  const decipher = crypto.createDecipheriv(ENC_ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
};

/**
 * Разобрать 32-байтный ключ шифрования из строки env (hex — 64 символа — или
 * base64). Бросает, если итоговая длина не 32 байта — вызывающий решает, как
 * реагировать (обычно: считать шифрование недоступным, не падать целиком).
 */
export const parseEncryptionKey = (value: string): Buffer => {
  const buf = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (buf.length !== ENC_KEY_BYTES) {
    throw new Error(`parseEncryptionKey: key must decode to ${ENC_KEY_BYTES} bytes, got ${buf.length}`);
  }
  return buf;
};

export const createOtpCode = (): string => String(crypto.randomInt(100000, 999999));

export const hashToken = (value: string): string => hash(value);

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key as Buffer);
    });
  });
  return `${salt}:${derivedKey.toString("hex")}`;
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) {
    return false;
  }

  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key as Buffer);
    });
  });

  return crypto.timingSafeEqual(Buffer.from(keyHex, "hex"), derivedKey);
};
