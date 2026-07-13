// Идентификатор из URL/query нельзя подставлять в условие по uuid-колонке без
// проверки формата: на мусор Postgres отвечает ошибкой 22P02 (invalid input
// syntax for type uuid), а не пустой выборкой — страница падает вместо 404.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
