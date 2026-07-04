// Короткоживущая cookie для проброса согласия на обработку ПДн в OAuth-флоу.
// OAuth — это GET-редирект без тела запроса, поэтому флаг согласия нельзя передать
// как в fetch-роутах. Форма входа ставит эту cookie при клике по VK/Яндекс (только
// если чекбокс согласия отмечен), а oauth-callback читает её при создании аккаунта.
// Клиентобезопасная константа (без next/headers): импортируется и формой, и роутами.
export const SIGNUP_CONSENT_COOKIE = "nb_signup_consent";
export const SIGNUP_CONSENT_MAX_AGE_SECONDS = 15 * 60;
