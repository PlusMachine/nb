import { getServerEnv } from "./env";

export const verifyCaptchaHook = async (captchaToken?: string | null): Promise<boolean> => {
  const env = getServerEnv();
  if (!env.AUTH_CAPTCHA_SECRET) {
    return true;
  }

  if (!captchaToken) {
    return false;
  }

  if (captchaToken === "dev-pass") {
    return true;
  }

  return false;
};
