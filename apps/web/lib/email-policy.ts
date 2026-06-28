// Ограничение регистрации/входа по e-mail российскими доменами (поправки 2025 г.: на
// российских сайтах допускается регистрация e-mail только в национальной доменной зоне).
// В dev/test ограничение отключено, чтобы не мешать локальной работе и тестам.

const isProduction = process.env.NODE_ENV === "production";

const ALLOWED_TLDS = [".ru", ".рф", ".su"];

// Российские провайдеры с не-.ru доменами, которые тоже разрешаем явно.
const ALLOWED_DOMAINS = new Set([
  "yandex.ru",
  "ya.ru",
  "yandex.com",
  "mail.ru",
  "bk.ru",
  "list.ru",
  "inbox.ru",
  "internet.ru",
  "vk.com",
  "rambler.ru",
  "lenta.ru",
  "myrambler.ru",
  "autorambler.ru",
  "ro.ru"
]);

export const isRussianEmailDomain = (email: string): boolean => {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) {
    return false;
  }
  if (ALLOWED_DOMAINS.has(domain)) {
    return true;
  }
  return ALLOWED_TLDS.some((tld) => domain.endsWith(tld));
};

export const assertRussianEmailDomain = (email: string): void => {
  if (!isProduction) {
    return;
  }
  if (!isRussianEmailDomain(email)) {
    throw new Error("EMAIL_DOMAIN_NOT_ALLOWED");
  }
};
