import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, parseEncryptionKey } from "./crypto";

// =============================================================================
//  Юнит-тесты обратимого шифрования секрета (AES-256-GCM) — пакет 4-B (P4):
//  хранение device-token BrewForge на портале в форме, которую портал сам может
//  восстановить (нужно слать его как Bearer устройству), в отличие от hashToken.
// =============================================================================

describe("encryptSecret / decryptSecret", () => {
  const key = crypto.randomBytes(32);

  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const plaintext = "bfd_" + "a".repeat(64);
    const encoded = encryptSecret(plaintext, key);
    expect(decryptSecret(encoded, key)).toBe(plaintext);
  });

  it("формат — три hex-сегмента через ':' (iv:authTag:ciphertext)", () => {
    const encoded = encryptSecret("secret", key);
    const parts = encoded.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(24); // 12 байт iv → 24 hex-символа
    expect(parts[1]).toHaveLength(32); // 16 байт GCM authTag → 32 hex-символа
  });

  it("два шифрования одного значения дают РАЗНЫЙ ciphertext (случайный iv)", () => {
    const a = encryptSecret("same-value", key);
    const b = encryptSecret("same-value", key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe("same-value");
    expect(decryptSecret(b, key)).toBe("same-value");
  });

  it("decrypt с ДРУГИМ ключом бросает (аутентификация authTag)", () => {
    const encoded = encryptSecret("secret", key);
    const wrongKey = crypto.randomBytes(32);
    expect(() => decryptSecret(encoded, wrongKey)).toThrow();
  });

  it("decrypt повреждённой строки бросает, не возвращает мусор молча", () => {
    expect(() => decryptSecret("not-a-valid-encoded-value", key)).toThrow();
    expect(() => decryptSecret("aa:bb", key)).toThrow(); // не хватает сегмента
  });

  it("encryptSecret требует РОВНО 32-байтный ключ", () => {
    expect(() => encryptSecret("x", crypto.randomBytes(16))).toThrow();
    expect(() => decryptSecret("aa:bb:cc", crypto.randomBytes(31))).toThrow();
  });
});

describe("parseEncryptionKey", () => {
  it("разбирает 64-символьный hex", () => {
    const hex = crypto.randomBytes(32).toString("hex");
    expect(parseEncryptionKey(hex)).toHaveLength(32);
  });

  it("разбирает base64", () => {
    const b64 = crypto.randomBytes(32).toString("base64");
    expect(parseEncryptionKey(b64)).toHaveLength(32);
  });

  it("бросает при неверной длине", () => {
    expect(() => parseEncryptionKey("too-short")).toThrow();
    expect(() => parseEncryptionKey(Buffer.from("short").toString("base64"))).toThrow();
  });
});
