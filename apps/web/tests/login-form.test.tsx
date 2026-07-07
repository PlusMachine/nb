import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginForm } from "../app/(public)/login/login-form";

type RenderProps = React.ComponentProps<typeof LoginForm>;

const defaultOAuth = { vk: true, yandex: true };

const renderLogin = (props: Partial<RenderProps> = {}) =>
  renderToStaticMarkup(<LoginForm oauth={defaultOAuth} {...props} />);

// Окружение тестов без DOM/событий (vitest environment: "node", без jsdom) не
// может провести реальный клик + сетевой раунд-трип requestSmsCode/requestEmailOtp.
// initialSmsRequested/initialEmailCodeRequested — тест-сид в самом LoginForm
// (см. login-form.tsx), который позволяет проверить рендер-контракт «шаг кода
// виден только после успешного запроса» без похода в сеть.
describe("LoginForm — прогрессивное раскрытие шага кода (F10)", () => {
  it("телефон: до запроса кода поля «Код из SMS» нет в разметке", () => {
    const html = renderLogin();
    expect(html).not.toContain("Код из SMS");
    expect(html).not.toContain("Изменить номер");
    expect(html).toContain("Получить код");
  });

  it("телефон: после успешного запроса код-форма появляется, а «Получить код» остаётся доступной для повторной отправки", () => {
    const html = renderLogin({ initialSmsRequested: true });
    expect(html).toContain("Код из SMS");
    expect(html).toContain("Отправить код ещё раз");
    expect(html).toContain("Изменить номер");
  });

  it("e-mail (шаг «Код на почту»): до запроса кода поля «Код из письма» нет в разметке", () => {
    const html = renderLogin({ initialMethod: "email" });
    expect(html).not.toContain("Код из письма");
    expect(html).not.toContain("Изменить e-mail");
  });

  it("e-mail: после успешного запроса код-форма появляется вместе с «Отправить ещё раз»/«Изменить e-mail»", () => {
    const html = renderLogin({ initialMethod: "email", initialEmailCodeRequested: true });
    expect(html).toContain("Код из письма");
    expect(html).toContain("Отправить код ещё раз");
    expect(html).toContain("Изменить e-mail");
  });
});

describe("LoginForm — соц-вход скрыт без ключей (F11)", () => {
  it("оба провайдера недоступны → блок соц-входа не рендерится вовсе", () => {
    const html = renderLogin({ oauth: { vk: false, yandex: false } });
    expect(html).not.toContain("VK ID");
    expect(html).not.toContain("Яндекс ID");
  });

  it("доступен только VK → рендерится только кнопка VK ID", () => {
    const html = renderLogin({ oauth: { vk: true, yandex: false } });
    expect(html).toContain("VK ID");
    expect(html).not.toContain("Яндекс ID");
  });

  it("доступен только Яндекс → рендерится только кнопка Яндекс ID", () => {
    const html = renderLogin({ oauth: { vk: false, yandex: true } });
    expect(html).not.toContain("VK ID");
    expect(html).toContain("Яндекс ID");
  });

  it("оба провайдера доступны → рендерятся обе кнопки", () => {
    const html = renderLogin({ oauth: { vk: true, yandex: true } });
    expect(html).toContain("VK ID");
    expect(html).toContain("Яндекс ID");
  });
});
