import { describe, expect, it } from "vitest";

import { parseAuditLogQuery } from "../features/audit/page-model";

const ACTOR_ID = "3b7c2f10-8d4e-4a61-9f03-5c8a1b2d7e64";

describe("разбор фильтров журнала", () => {
  it("берёт actorUserId, экшен и постранично", () => {
    const query = parseAuditLogQuery({ actorUserId: ACTOR_ID, action: "user.block", page: "2" });

    expect(query.actorUserId).toBe(ACTOR_ID);
    expect(query.action).toBe("user.block");
    expect(query.page).toBe(2);
  });

  // systemEvents.actorUserId — колонка uuid: мусор из адресной строки уронил бы
  // весь журнал ошибкой 22P02, поэтому фильтр просто отбрасывается.
  it("битый actorUserId отбрасывается, а не уходит в запрос", () => {
    expect(parseAuditLogQuery({ actorUserId: "abc" }).actorUserId).toBeUndefined();
  });

  // entityId — varchar(64), там любые строки законны.
  it("entityId не uuid-колонка и произвольную строку сохраняет", () => {
    expect(parseAuditLogQuery({ entityId: "malt-pilsner" }).entityId).toBe("malt-pilsner");
  });
});
