import { describe, expect, it } from "vitest";

import {
  anonymizeConfirmationValue,
  parseAdminUserFilters,
  resolveAdminUserStatus,
  buildAdminUsersHref
} from "../features/admin-users/contracts";
import {
  checkAnonymize,
  checkBlock,
  checkBlockReason,
  checkRoleChange,
  checkUnblock,
  type AdminUserTarget
} from "../features/admin-users/permissions";

const ACTOR = "actor-1";

const target = (overrides: Partial<AdminUserTarget> = {}): AdminUserTarget => ({
  id: "user-1",
  role: "user",
  status: "active",
  email: "brewer@mail.ru",
  phone: null,
  ...overrides
});

describe("смена роли", () => {
  it("разрешена для чужого активного аккаунта", () => {
    expect(checkRoleChange({ actorId: ACTOR, target: target(), nextRole: "editor", activeAdminCount: 2 })).toBeNull();
  });

  it("запрещена самому себе", () => {
    expect(
      checkRoleChange({ actorId: ACTOR, target: target({ id: ACTOR, role: "admin" }), nextRole: "user", activeAdminCount: 5 })
    ).toBe("ROLE_SELF");
  });

  it("не снимает последнего администратора", () => {
    expect(
      checkRoleChange({ actorId: ACTOR, target: target({ role: "admin" }), nextRole: "moderator", activeAdminCount: 1 })
    ).toBe("LAST_ADMIN");
  });

  it("понижает администратора, если он не последний", () => {
    expect(
      checkRoleChange({ actorId: ACTOR, target: target({ role: "admin" }), nextRole: "moderator", activeAdminCount: 2 })
    ).toBeNull();
  });

  it("назначить ещё одного администратора можно всегда", () => {
    expect(
      checkRoleChange({ actorId: ACTOR, target: target({ role: "admin" }), nextRole: "admin", activeAdminCount: 1 })
    ).toBe("ROLE_UNCHANGED");
    expect(
      checkRoleChange({ actorId: ACTOR, target: target({ role: "user" }), nextRole: "admin", activeAdminCount: 1 })
    ).toBeNull();
  });

  it("обезличенному аккаунту роль не меняют", () => {
    expect(
      checkRoleChange({ actorId: ACTOR, target: target({ status: "anonymized" }), nextRole: "editor", activeAdminCount: 2 })
    ).toBe("ALREADY_ANONYMIZED");
  });
});

describe("блокировка", () => {
  it("требует причину от 3 символов", () => {
    expect(checkBlockReason("  спам ")).toBeNull();
    expect(checkBlockReason(" aa ")).toBe("REASON_TOO_SHORT");
    expect(checkBlockReason("x".repeat(1001))).toBe("REASON_TOO_LONG");
  });

  it("запрещена самому себе", () => {
    expect(
      checkBlock({ actorId: ACTOR, target: target({ id: ACTOR }), reason: "спам", activeAdminCount: 2 })
    ).toBe("BLOCK_SELF");
  });

  it("не блокирует последнего администратора", () => {
    expect(
      checkBlock({ actorId: ACTOR, target: target({ role: "admin" }), reason: "спам", activeAdminCount: 1 })
    ).toBe("LAST_ADMIN");
  });

  it("повторная блокировка отбивается", () => {
    expect(
      checkBlock({ actorId: ACTOR, target: target({ status: "blocked" }), reason: "спам", activeAdminCount: 2 })
    ).toBe("ALREADY_BLOCKED");
  });

  it("снятие блокировки только с заблокированного", () => {
    expect(checkUnblock({ target: target({ status: "blocked" }) })).toBeNull();
    expect(checkUnblock({ target: target() })).toBe("NOT_BLOCKED");
    expect(checkUnblock({ target: target({ status: "anonymized" }) })).toBe("ALREADY_ANONYMIZED");
  });
});

describe("обезличивание", () => {
  it("требует точный ввод e-mail", () => {
    expect(
      checkAnonymize({ actorId: ACTOR, target: target(), confirmation: "  BREWER@mail.ru ", activeAdminCount: 2 })
    ).toBeNull();
    expect(
      checkAnonymize({ actorId: ACTOR, target: target(), confirmation: "другой@mail.ru", activeAdminCount: 2 })
    ).toBe("CONFIRMATION_MISMATCH");
  });

  it("для телефонного аккаунта подтверждается номером", () => {
    const phoneOnly = target({ email: null, phone: "+79990001122" });
    expect(anonymizeConfirmationValue(phoneOnly)).toBe("+79990001122");
    expect(
      checkAnonymize({ actorId: ACTOR, target: phoneOnly, confirmation: "+79990001122", activeAdminCount: 2 })
    ).toBeNull();
  });

  it("запрещено себе и последнему администратору", () => {
    expect(
      checkAnonymize({ actorId: ACTOR, target: target({ id: ACTOR }), confirmation: "brewer@mail.ru", activeAdminCount: 3 })
    ).toBe("ANONYMIZE_SELF");
    expect(
      checkAnonymize({ actorId: ACTOR, target: target({ role: "admin" }), confirmation: "brewer@mail.ru", activeAdminCount: 1 })
    ).toBe("LAST_ADMIN");
  });

  it("повторное обезличивание отбивается", () => {
    expect(
      checkAnonymize({
        actorId: ACTOR,
        target: target({ status: "anonymized", email: null }),
        confirmation: "",
        activeAdminCount: 2
      })
    ).toBe("ALREADY_ANONYMIZED");
  });
});

describe("модель списка", () => {
  it("статус выводится из флагов, обезличивание перекрывает блокировку", () => {
    expect(resolveAdminUserStatus({ blockedAt: null, anonymizedAt: null })).toBe("active");
    expect(resolveAdminUserStatus({ blockedAt: new Date(), anonymizedAt: null })).toBe("blocked");
    expect(resolveAdminUserStatus({ blockedAt: new Date(), anonymizedAt: new Date() })).toBe("anonymized");
  });

  it("мусор в query-параметрах откатывается к дефолтам", () => {
    const filters = parseAdminUserFilters({ role: "king", status: "burned", sort: "chaos", page: "-4", pageSize: "9999" });
    expect(filters.role).toBeUndefined();
    expect(filters.status).toBeUndefined();
    expect(filters.sort).toBe("recent");
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(100);
  });

  it("href тулбара не тащит дефолты", () => {
    expect(buildAdminUsersHref("/admin/users", {})).toBe("/admin/users");
    expect(buildAdminUsersHref("/admin/users", { q: " петя ", role: "admin", status: "blocked" })).toBe(
      "/admin/users?q=%D0%BF%D0%B5%D1%82%D1%8F&role=admin&status=blocked"
    );
  });
});
