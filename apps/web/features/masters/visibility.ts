import { and, db, eq, inArray, isNotNull, isNull, masterProfiles, users } from "@nb/db";

// Единственное место, где живёт правило «витрина мастера видна публично»:
// профиль выставлен владельцем (is_listed), у него есть опубликованный снапшот
// И владелец аккаунта жив — не заблокирован и не обезличен.
//
// Владелец в предикате обязателен, потому что контакты мастера (телефон,
// телеграм, почта) физически лежат внутри published_json: снапшот про блокировку
// владельца сам не узнает, и без гейта витрина забаненного продолжает висеть в
// /market, на своей странице и в sitemap вместе со связью в обход площадки.
// Блокировка админом снимает is_listed отдельной записью, но это компенсирующая
// правка, а не инвариант: её можно откатить (модератор вернёт витрину через
// setMasterListed) и мимо неё можно приехать (строки, заблокированные раньше).
// Инвариант держит запрос.
//
// Гейт — только для публичных путей (витрина, /market, страница мастера,
// sitemap). Модератор обязан видеть витрину забаненного в админке, а владелец —
// свой черновик, поэтому модераторские и владельческие выборки его не зовут.

/** Владельцы, чьи витрины разрешено показывать публике. */
const publicMasterOwnerIds = () =>
  db
    .select({ id: users.id })
    .from(users)
    .where(and(isNull(users.blockedAt), isNull(users.anonymizedAt)));

/** То же правило в SQL — для публичных выборок: `and(...publiclyVisibleMasterConditions())`. */
export const publiclyVisibleMasterConditions = () => [
  eq(masterProfiles.isListed, true),
  isNotNull(masterProfiles.publishedJson),
  inArray(masterProfiles.userId, publicMasterOwnerIds())
];

/**
 * Тот же предикат, но для одной витрины — там, где публичной выборки нет, а решение
 * «показывать ли это публике» принимать надо: выдача файла по прямой ссылке
 * (/api/master-images/<id>/<variant>). Ссылка на фото живёт вне страницы мастера и
 * переживает уход витрины из паблика, поэтому гейт обязан быть и на ней.
 */
export const isMasterProfilePubliclyVisible = async (profileId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: masterProfiles.id })
    .from(masterProfiles)
    .where(and(eq(masterProfiles.id, profileId), ...publiclyVisibleMasterConditions()));

  return rows.length > 0;
};
