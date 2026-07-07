"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { clientEnv } from "@/lib/env";

/**
 * Невидимая Yandex SmartCaptcha для auth-форм.
 *
 * Скрипт грузится лениво при первой отправке формы, виджет рендерится один раз
 * в служебный контейнер (`captchaNode` — обязательно вставить в JSX). Каждый вызов
 * getToken() запускает проверку и резолвится свежим одноразовым токеном для поля
 * `captchaToken` auth-запроса. Большинству пользователей челлендж не показывается;
 * подозрительным SmartCaptcha открывает попап с заданием.
 *
 * Без настроенного NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY (dev) возвращает "dev-pass" —
 * серверный verifyCaptchaHook принимает его вне production.
 */

type SmartCaptchaApi = {
  render: (
    container: HTMLElement,
    params: {
      sitekey: string;
      invisible?: boolean;
      hideShield?: boolean;
      callback?: (token: string) => void;
    }
  ) => number;
  execute: (widgetId: number) => void;
  reset: (widgetId: number) => void;
  destroy: (widgetId: number) => void;
  subscribe: (widgetId: number, event: string, handler: () => void) => () => void;
};

declare global {
  interface Window {
    smartCaptcha?: SmartCaptchaApi;
    __nbSmartCaptchaOnLoad?: () => void;
  }
}

const SCRIPT_SRC = "https://smartcaptcha.yandexcloud.net/captcha.js?render=onload&onload=__nbSmartCaptchaOnLoad";

let scriptPromise: Promise<SmartCaptchaApi> | null = null;

const loadSmartCaptcha = (): Promise<SmartCaptchaApi> => {
  if (window.smartCaptcha) {
    return Promise.resolve(window.smartCaptcha);
  }
  scriptPromise ??= new Promise<SmartCaptchaApi>((resolve, reject) => {
    window.__nbSmartCaptchaOnLoad = () => {
      if (window.smartCaptcha) {
        resolve(window.smartCaptcha);
      } else {
        reject(new Error("captcha_load_failed"));
      }
    };
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("captcha_load_failed"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
};

export const useSmartCaptcha = (): { getToken: () => Promise<string>; captchaNode: ReactNode } => {
  const siteKey = clientEnv.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const unsubscribeRef = useRef<Array<() => void>>([]);
  const pendingRef = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | null>(null);

  useEffect(
    () => () => {
      pendingRef.current?.reject(new Error("captcha_cancelled"));
      pendingRef.current = null;
      unsubscribeRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribeRef.current = [];
      if (widgetIdRef.current !== null) {
        window.smartCaptcha?.destroy(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    },
    []
  );

  const getToken = useCallback(async (): Promise<string> => {
    if (!siteKey) {
      // Капча не настроена: в dev сервер принимает обходной токен, в production
      // сервер fail-closed — пустой токен просто получит captcha_required.
      return "dev-pass";
    }

    const api = await loadSmartCaptcha();
    const container = containerRef.current;
    if (!container) {
      throw new Error("captcha_load_failed");
    }

    if (widgetIdRef.current === null) {
      const widgetId = api.render(container, {
        sitekey: siteKey,
        invisible: true,
        // Шильдик «Обработка данных» оставляем видимым — это условие использования
        // SmartCaptcha без собственного уведомления об обработке данных Яндексом.
        hideShield: false,
        callback: (token) => {
          pendingRef.current?.resolve(token);
          pendingRef.current = null;
        }
      });
      widgetIdRef.current = widgetId;
      unsubscribeRef.current = [
        // Пользователь закрыл попап с заданием, не решив его: без reject форма
        // зависла бы в pending навсегда.
        api.subscribe(widgetId, "challenge-hidden", () => {
          pendingRef.current?.reject(new Error("captcha_cancelled"));
          pendingRef.current = null;
        }),
        api.subscribe(widgetId, "network-error", () => {
          pendingRef.current?.reject(new Error("captcha_network_error"));
          pendingRef.current = null;
        })
      ];
    } else {
      // Токены одноразовые: перед повторной проверкой сбрасываем предыдущее состояние.
      api.reset(widgetIdRef.current);
    }

    return new Promise<string>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      api.execute(widgetIdRef.current!);
    });
  }, [siteKey]);

  // Контейнер обязан быть в DOM до первого execute: сюда SmartCaptcha монтирует
  // шильдик и попап челленджа.
  const captchaNode = <div ref={containerRef} />;

  return { getToken, captchaNode };
};
