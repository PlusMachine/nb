"use client";

import { useEffect, useState } from "react";

import { loadViewerPreferredGravityUnit } from "./gravity-unit-actions";
import { defaultPreferredGravityUnit, type PreferredGravityUnit } from "./gravity-units";

/**
 * Единица плотности текущего посетителя для статически кэшируемых (SSG/ISR) страниц,
 * которые намеренно не читают сессию на сервере: первый рендер идёт в дефолтной
 * Plato, после гидратации подтягивается реальное предпочтение аккаунта.
 * `loaded` — ответ получен (или упал — тогда остаёмся на дефолте).
 */
export const useViewerGravityUnit = (): { unit: PreferredGravityUnit; loaded: boolean } => {
  const [unit, setUnit] = useState<PreferredGravityUnit>(defaultPreferredGravityUnit);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadViewerPreferredGravityUnit()
      .then((next) => {
        if (active) {
          setUnit(next);
        }
      })
      .catch(() => {
        // Сеть/сессия недоступны — остаёмся на дефолтной единице.
      })
      .finally(() => {
        if (active) {
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { unit, loaded };
};
