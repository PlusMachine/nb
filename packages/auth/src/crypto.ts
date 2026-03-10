import crypto from "node:crypto";

const hash = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");

export const createRandomToken = (size = 32): string => crypto.randomBytes(size).toString("hex");

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
