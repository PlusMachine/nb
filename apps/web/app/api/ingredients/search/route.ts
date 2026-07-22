import { assertRateLimit } from "@nb/auth";
import { normalizeSearchText } from "@nb/search";
import { NextResponse } from "next/server";

import { searchUserCatalogIngredients } from "@/features/ingredients/catalog-service";
import { clientIpFrom } from "@/lib/anti-abuse";
import { getSessionUser } from "@/lib/auth";

// Пустая выдача в форме ответа сервиса — чтобы клиент (normalizeIngredientSearchResponse)
// не спотыкался на недостающих полях.
const emptyIngredientSearchResult = {
  items: [],
  refinements: [],
  total: 0,
  isBroadMatch: false,
  hasMore: false,
  appliedManufacturer: null,
  appliedGroup: null,
  appliedFamily: null,
  appliedFavoritesOnly: false,
  appliedCustomOnly: false
};

// Каталог ингредиентов — публичная зона (см. /catalog): анонимный посетитель получает
// системный каталог без избранного/кастомных ингредиентов. Нужно калькуляторам
// (напр. brewhouse-efficiency), которые используют пикер вне залогиненной зоны.
export async function GET(request: Request) {
  const user = await getSessionUser();
  const { searchParams } = new URL(request.url);

  // Каждый запрос грузит каталог и ранжирует в памяти (CPU). Анонимный вход —
  // ключ по IP, залогиненный — по юзеру (не мешаем пикеру). Окно щедрое: пикер
  // дёргает поиск на ввод с дебаунсом.
  try {
    await assertRateLimit(user ? `user:${user.id}` : `ip:${clientIpFrom(request) ?? "unknown"}`, "ingredient_search", 120, 60);
  } catch {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // Гейт длины запроса: короткий "хвост" (1 символ без раскладки) грузит и ранжирует
  // весь каталог впустую при каждом нажатии клавиши. Скоуп-параметры снимают гейт —
  // сценарии вроде подбора солей воды шлют q="" + group=<...> и должны продолжать искать.
  const rawQuery = searchParams.get("q") ?? "";
  const trimmedQuery = rawQuery.trim();
  const hasSearchScope = Boolean(
    searchParams.get("family")
    || searchParams.get("group")
    || searchParams.get("manufacturer")
    || searchParams.get("favoritesOnly") === "true"
    || searchParams.get("customOnly") === "true"
  );
  if (trimmedQuery.length > 0 && normalizeSearchText(trimmedQuery).length < 2 && !hasSearchScope) {
    return NextResponse.json(emptyIngredientSearchResult);
  }

  try {
    const result = await searchUserCatalogIngredients(user?.id ?? null, {
      q: searchParams.get("q") ?? "",
      type: searchParams.get("type") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      subtype: searchParams.get("subtype") ?? undefined,
      family: searchParams.get("family") ?? undefined,
      group: searchParams.get("group") ?? undefined,
      manufacturer: searchParams.get("manufacturer") ?? undefined,
      favoritesOnly: searchParams.get("favoritesOnly") === "true",
      customOnly: searchParams.get("customOnly") === "true",
      limit: Number(searchParams.get("limit") ?? "10"),
      includeCustom: searchParams.get("includeCustom") !== "false"
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
