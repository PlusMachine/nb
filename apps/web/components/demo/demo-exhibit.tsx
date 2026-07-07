"use client";

import { useCallback, type ReactNode } from "react";

/**
 * Обёртка-«экспонат» демо-страницы: настоящие компоненты продукта внутри
 * показываются, но недоступны для взаимодействия. Одного pointer-events-none
 * мало — он глушит только мышь/тач: кнопки остаются в tab-порядке, активируются
 * Enter/Space, а их диалоги порталятся в document.body и снова кликабельны.
 * HTML-атрибут inert закрывает всё разом: фокус, клавиатуру и события.
 * Побочный эффект — поддерево уходит и из accessibility tree (как aria-hidden);
 * это осознанная цена (см. docs/demo-page.md §5): смысл экспоната дублируют
 * заголовок секции и строки-факты рядом, а вызов server actions с публичной
 * страницы недопустим ни с мыши, ни с клавиатуры.
 */
export function DemoExhibit({ className, children }: { className?: string; children: ReactNode }) {
  // React 18 не типизирует проп inert (появился в React 19) — ставим через ref.
  const setInert = useCallback((el: HTMLDivElement | null) => {
    if (el) el.inert = true;
  }, []);

  return (
    <div ref={setInert} className={`pointer-events-none select-none ${className ?? ""}`}>
      {children}
    </div>
  );
}
