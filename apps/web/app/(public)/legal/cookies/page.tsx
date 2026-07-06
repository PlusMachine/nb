import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";
import { CookieSettingsButton } from "@/components/legal/cookie-settings-button";
import { getOperator } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Политика использования файлов cookie",
  description: "Какие файлы cookie использует сайт, зачем они нужны и как управлять их настройками."
};

type CookieRow = {
  name: string;
  purpose: string;
  category: "Необходимые" | "Функциональные" | "Аналитические";
  ttl: string;
};

const COOKIES: CookieRow[] = [
  { name: "nb_session", purpose: "Сессия входа: удерживает пользователя авторизованным.", category: "Необходимые", ttl: "до 30 дней" },
  { name: "nb_oauth_state_*", purpose: "Защита входа через VK ID / Яндекс ID от подделки запроса (CSRF).", category: "Необходимые", ttl: "15 минут" },
  { name: "nb_cookie_consent", purpose: "Запоминает ваш выбор по использованию cookie.", category: "Необходимые", ttl: "180 дней" },
  { name: "nb_age_ok", purpose: "Запоминает подтверждение совершеннолетия, чтобы не показывать уведомление повторно.", category: "Необходимые", ttl: "1 год" },
  { name: "nb_recipes_view", purpose: "Запоминает выбранный вид списка рецептов (сетка / список).", category: "Функциональные", ttl: "1 год" },
  { name: "nb_theme", purpose: "Запоминает выбранную тему оформления (светлая / тёмная / как в системе).", category: "Функциональные", ttl: "1 год" },
  { name: "nb_add_ingredient_last_category", purpose: "Запоминает последнюю категорию при добавлении ингредиента.", category: "Функциональные", ttl: "1 год" },
  { name: "ph_* (PostHog)", purpose: "Обезличенная веб-аналитика посещений для улучшения сервиса. Ставятся только при согласии.", category: "Аналитические", ttl: "до 1 года" }
];

export default function CookiePolicyPage() {
  const operator = getOperator();

  return (
    <LegalDocument
      title="Политика использования файлов cookie"
      lead={
        <>
          Сайт {operator.siteName} использует файлы cookie и аналогичные технологии. Ниже описано, какие именно, зачем
          они нужны и как управлять их настройками.
        </>
      }
    >
      <h2>1. Что такое cookie</h2>
      <p>
        Cookie — небольшие текстовые файлы, которые сохраняются в вашем браузере при посещении сайта. Они позволяют
        сайту работать корректно, запоминать ваши настройки и, с вашего согласия, собирать обезличенную статистику.
      </p>

      <h2>2. Категории cookie</h2>
      <ul>
        <li>
          <strong>Строго необходимые</strong> — обеспечивают базовую работу сайта: вход в аккаунт, безопасность,
          сохранение вашего выбора по cookie. Без них сайт не может работать, поэтому они используются всегда.
        </li>
        <li>
          <strong>Функциональные</strong> — запоминают ваши предпочтения (например, вид списка рецептов), чтобы сделать
          использование удобнее.
        </li>
        <li>
          <strong>Аналитические</strong> — помогают понять, как посетители пользуются сайтом, в обезличенном виде.
          Устанавливаются <strong>только после вашего согласия</strong>.
        </li>
      </ul>

      <h2>3. Какие cookie мы используем</h2>
      <div className="not-prose my-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Cookie</th>
              <th className="py-2 pr-4 font-medium">Назначение</th>
              <th className="py-2 pr-4 font-medium">Категория</th>
              <th className="py-2 font-medium">Срок</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((row) => (
              <tr key={row.name} className="border-b border-border/60 align-top text-foreground/80">
                <td className="py-2 pr-4 font-mono text-[13px] text-foreground">{row.name}</td>
                <td className="py-2 pr-4 leading-6">{row.purpose}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{row.category}</td>
                <td className="py-2 whitespace-nowrap">{row.ttl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Помимо cookie сайт использует локальное хранилище браузера (localStorage) для сохранения черновиков расчётов и
        недавних значений на вашем устройстве. Эти данные не передаются на сервер.
      </p>

      <h2>4. Управление cookie</h2>
      <p>
        При первом посещении сайт предлагает выбрать, какие cookie использовать. Изменить своё решение можно в любой
        момент:
      </p>
      <div className="not-prose my-3">
        <CookieSettingsButton />
      </div>
      <p>
        Вы также можете удалять и блокировать cookie средствами браузера. Отключение строго необходимых cookie может
        нарушить работу сайта, в том числе вход в аккаунт.
      </p>

      <h2>5. Изменения</h2>
      <p>
        Актуальная редакция настоящей Политики всегда доступна на этой странице. Порядок обработки персональных данных
        описан в <a href="/legal/privacy">Политике обработки персональных данных</a>.
      </p>
    </LegalDocument>
  );
}
