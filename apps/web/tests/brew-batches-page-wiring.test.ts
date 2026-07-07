import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const plannedBrew = {
  id: "bb-1",
  name: "Planned Brew",
  status: "planned" as const,
  recipeId: "r-1",
  recipeTitle: "Test Recipe",
  hasDevice: false,
  plannedFor: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-06-27T09:00:00Z"),
  updatedAt: new Date("2026-06-27T09:00:00Z")
};

const brewingBrew = {
  ...plannedBrew,
  id: "bb-2",
  name: "Brewing Brew",
  status: "brewing" as const,
  startedAt: new Date("2026-06-28T10:00:00Z"),
  createdAt: new Date("2026-06-28T09:00:00Z")
};

const completedBrew = {
  ...plannedBrew,
  id: "bb-3",
  name: "Completed Brew",
  status: "completed" as const,
  completedAt: new Date("2026-06-20T10:00:00Z"),
  createdAt: new Date("2026-06-19T09:00:00Z")
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "brewer@example.com", displayName: "Brewer", preferredGravityUnit: "plato" as const })),
  listBrewBatchesForUser: vi.fn(async (): Promise<unknown[]> => [])
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/brew-batches/service", () => ({
  listBrewBatchesForUser: mocks.listBrewBatchesForUser
}));

import BrewBatchesPage from "../app/(app)/app/brew-batches/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "u-1", email: "brewer@example.com", displayName: "Brewer", preferredGravityUnit: "plato" as const });
  mocks.listBrewBatchesForUser.mockResolvedValue([]);
});

describe("Brew batches page", () => {
  it("offers the primary Сварить entry and a clean empty state when there are no brews", async () => {
    const html = renderToStaticMarkup(await BrewBatchesPage());

    expect(mocks.listBrewBatchesForUser).toHaveBeenCalledWith("u-1");
    expect(html).toContain("Сварить");
    expect(html).toContain("Пока нет ни одной партии.");
  });

  it("lists brew batches with statuses and links when non-empty", async () => {
    mocks.listBrewBatchesForUser.mockResolvedValue([plannedBrew, brewingBrew, completedBrew]);

    const html = renderToStaticMarkup(await BrewBatchesPage());

    expect(html).toContain("Сварить");
    expect(html).toContain("Planned Brew");
    expect(html).toContain("Brewing Brew");
    expect(html).toContain("Completed Brew");
    expect(html).toContain("Запланирована");
    expect(html).toContain("Варится");
    expect(html).toContain("Завершена");
    expect(html).toContain('href="/app/brew-batches/bb-1"');
    expect(html).toContain('href="/app/brew-batches/bb-2"');
    expect(html).toContain('href="/app/brew-batches/bb-3"');
  });

  it("sorts active statuses before completed ones", async () => {
    mocks.listBrewBatchesForUser.mockResolvedValue([completedBrew, plannedBrew, brewingBrew]);

    const html = renderToStaticMarkup(await BrewBatchesPage());

    const brewingIndex = html.indexOf("Brewing Brew");
    const plannedIndex = html.indexOf("Planned Brew");
    const completedIndex = html.indexOf("Completed Brew");
    expect(brewingIndex).toBeGreaterThan(-1);
    expect(plannedIndex).toBeGreaterThan(-1);
    expect(completedIndex).toBeGreaterThan(-1);
    expect(brewingIndex).toBeLessThan(plannedIndex);
    expect(plannedIndex).toBeLessThan(completedIndex);
  });
});
