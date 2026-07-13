import { assertRateLimit } from "@nb/auth";

import { getServerEnv } from "./env";

const SMARTCAPTCHA_VALIDATE_URL = "https://smartcaptcha.yandexcloud.net/validate";

/**
 * Серверная проверка токена Yandex SmartCaptcha.
 *
 * По рекомендации Яндекса недоступность сервиса валидации (сеть/не-200) трактуется
 * как успех (fail-open) — иначе сбой на их стороне полностью отрезал бы вход на сайт.
 * Явный ответ `status: "failed"` — всегда отказ.
 */
const verifySmartCaptchaToken = async (secret: string, token: string, ip?: string | null): Promise<boolean> => {
  try {
    const params = new URLSearchParams({ secret, token });
    if (ip) {
      params.set("ip", ip);
    }
    const response = await fetch(SMARTCAPTCHA_VALIDATE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params
    });
    if (!response.ok) {
      console.warn(`[anti-abuse] SmartCaptcha validate ответил ${response.status} — пропускаем (fail-open)`);
      return true;
    }
    const result = (await response.json()) as { status?: string };
    return result.status === "ok";
  } catch (error) {
    console.warn("[anti-abuse] SmartCaptcha validate недоступен — пропускаем (fail-open)", error);
    return true;
  }
};

/**
 * Проверка капчи перед auth-операциями.
 *
 * Поведение:
 * - секрет задан  -> реальная проверка SmartCaptcha (в dev/test допускается обходной
 *   токен "dev-pass", в production он не действует);
 * - секрет пуст + НЕ production -> пропускаем (капча не настроена в dev);
 * - секрет пуст + production -> fail-closed (false): отсутствие настроенной капчи
 *   в проде не должно превращаться в полное отключение защиты от ботов.
 */
export const verifyCaptchaHook = async (captchaToken?: string | null, ip?: string | null): Promise<boolean> => {
  const env = getServerEnv();
  const isProduction = process.env.NODE_ENV === "production";

  if (!env.AUTH_CAPTCHA_SECRET) {
    if (isProduction) {
      console.error(
        "[anti-abuse] AUTH_CAPTCHA_SECRET не задан в production — капча fail-closed (запросы отклоняются)"
      );
      return false;
    }
    return true;
  }

  if (!captchaToken) {
    return false;
  }

  if (!isProduction && captchaToken === "dev-pass") {
    return true;
  }

  return verifySmartCaptchaToken(env.AUTH_CAPTCHA_SECRET, captchaToken, ip);
};

/**
 * Клиентский IP для per-IP лимитов, устойчивый к подделке `X-Forwarded-For`.
 *
 * Клиент может прислать любой `X-Forwarded-For` — и бот шлёт случайный IP на
 * каждый запрос, чтобы каждый запрос считался «новым IP» и обходил лимит. Поэтому
 * первому элементу слева доверять нельзя. Доверенные прокси АППЕНДЯТ реальный
 * remote_addr в КОНЕЦ списка, значит настоящий клиент — на позиции `len - hops`
 * справа (hops = число доверенных прокси, `TRUSTED_PROXY_HOPS`). Всё, что клиент
 * подделал, оказывается левее этой позиции и игнорируется.
 *
 * hops = 0 (dev, прокси нет): заголовку доверять нельзя вообще → null (лимит
 * схлопывается в общий ключ, что для dev приемлемо). Заголовок короче числа
 * хопов — аномалия (запрос мимо прокси / прокси не проставил XFF) → null,
 * fail-safe: лучше не выдать поддельный ключ, чем принять его.
 */
export const clientIpFrom = (request: Request): string | null => {
  const hops = getServerEnv().TRUSTED_PROXY_HOPS;
  if (hops <= 0) {
    return null;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return null;
  }
  const chain = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
  const index = chain.length - hops;
  if (index < 0) {
    return null;
  }
  return chain[index] ?? null;
};

/**
 * Per-IP rate limit поверх per-адресных лимитов auth-флоу: капча отсекает ботов,
 * а этот слой ограничивает перебор адресатов (SMS-pumping — бот перебирает НОМЕРА,
 * поэтому лимита «5 на номер» недостаточно). Хранение — та же таблица
 * auth_rate_limits (PostgreSQL), работает без Redis. Бросает RATE_LIMITED.
 */
export const assertIpRateLimit = async (
  request: Request,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<void> => {
  const ip = clientIpFrom(request) ?? "unknown";
  await assertRateLimit(`ip:${ip}`, action, limit, windowSeconds);
};
