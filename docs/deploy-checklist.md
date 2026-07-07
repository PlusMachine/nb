# Чеклист перед продакшен-деплоем

Пункты, которые нельзя забыть при первом деплое или следующей сборке в prod. Проверять перед `NODE_ENV=production`.

## Антиспам (капча)

- [ ] Завести ресурс капчи в Yandex Cloud (SmartCaptcha, тип **«Невидимая»**), получить `site key` и `secret key`.
- [ ] Прописать в prod `.env`:
  - `AUTH_CAPTCHA_SECRET`
  - `NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY`
- [ ] Без `AUTH_CAPTCHA_SECRET` в `production` сервер **fail-closed** — отклоняет вообще все auth-запросы (`captcha_required`), т.е. никто не сможет ни войти, ни зарегистрироваться. Хостинг самого приложения на Yandex Cloud не требуется — сервис вызывается по HTTP независимо от того, где крутится сайт.
- [ ] Убедиться, что реверс-прокси перед приложением **проставляет/прокидывает `x-forwarded-for`** (nginx/Vercel/Cloudflare и т.п.) — на нём держатся per-IP rate limits (`assertIpRateLimit` в `apps/web/lib/anti-abuse.ts`); без корректного заголовка все IP схлопнутся в один ключ.

См. также [[anti-spam-captcha]] (память агента) и `apps/web/lib/anti-abuse.ts`.

## РФ-комплаенс (152-ФЗ)

- [ ] Заполнить реквизиты оператора ПДн в `.env`: `OPERATOR_NAME`, `OPERATOR_EMAIL` (для физлица достаточно этих двух); `OPERATOR_INN`/`OPERATOR_OGRN`/`OPERATOR_ADDRESS` — для самозанятого/ИП/ООО.
- [ ] Хостинг и обработка ПДн — на серверах в РФ.

## SMS/e-mail доставка

- [ ] `SMS_PROVIDER` переключить с `log` на `smsc`/`smsru` + реквизиты (`SMS_API_KEY`, `SMS_LOGIN`, `SMS_SENDER`) — иначе код входа по SMS не уйдёт реально, а останется только в логах.
- [ ] Настроить реальную отправку e-mail (OTP/magic-link/password-reset сейчас логируются в dev, `SMTP_*` в `.env.example`).

## Прочее из `.env.example`

- [ ] `AUTH_SECRET` — заменить dev-значение на случайный секрет ≥32 символов.
- [ ] `APP_URL` — реальный prod-домен (используется в magic-link/password-reset ссылках).
- [ ] Storage (`STORAGE_PROVIDER=s3` + реквизиты) — если используются загрузки фото рецептов.
- [ ] VAPID-ключи — если нужны web-push уведомления (требуют HTTPS).
