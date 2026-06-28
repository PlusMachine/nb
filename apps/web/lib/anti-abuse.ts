import { getServerEnv } from "./env";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Реальная серверная проверка токена капчи через Cloudflare Turnstile.
 * Любая ошибка сети/парсинга трактуется как провал проверки (fail-closed).
 */
const verifyTurnstileToken = async (secret: string, token: string): Promise<boolean> => {
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token })
    });
    if (!response.ok) {
      return false;
    }
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
};

/**
 * Проверка капчи перед auth-операциями.
 *
 * Поведение:
 * - секрет задан  -> реальная проверка Turnstile (в dev/test допускается обходной
 *   токен "dev-pass", в production он не действует);
 * - секрет пуст + НЕ production -> пропускаем (капча не настроена в dev);
 * - секрет пуст + production -> fail-closed (false): отсутствие настроенной капчи
 *   в проде не должно превращаться в полное отключение защиты от ботов.
 */
export const verifyCaptchaHook = async (captchaToken?: string | null): Promise<boolean> => {
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

  return verifyTurnstileToken(env.AUTH_CAPTCHA_SECRET, captchaToken);
};
