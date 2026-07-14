import { describe, expect, it } from "vitest";

import {
  BREWFORGE_DEMO_PROVIDER_ID,
  BREWFORGE_PROVIDER_ID,
  STREAM_PROVIDER_ID,
  deviceSupportsRecipePush,
  getProvider,
  providerHasCapability
} from "./index";

describe("streamProvider", () => {
  it("зарегистрирован и включён, но без методов управления", () => {
    const provider = getProvider(STREAM_PROVIDER_ID);
    expect(provider).toBeDefined();
    expect(provider?.enabled).toBe(true);
    expect(provider?.capabilities).toEqual(["fermentation_logging"]);
    expect(provider?.pushRecipe).toBeUndefined();
    expect(provider?.sendCommand).toBeUndefined();
  });

  it("не поддерживает recipe_push/manual_control", () => {
    expect(providerHasCapability(STREAM_PROVIDER_ID, "recipe_push")).toBe(false);
    expect(providerHasCapability(STREAM_PROVIDER_ID, "manual_control")).toBe(false);
    expect(deviceSupportsRecipePush(STREAM_PROVIDER_ID)).toBe(false);
  });
});

describe("providerHasCapability / deviceSupportsRecipePush", () => {
  it("brewforge и brewforge-demo поддерживают recipe_push и manual_control", () => {
    expect(deviceSupportsRecipePush(BREWFORGE_PROVIDER_ID)).toBe(true);
    expect(providerHasCapability(BREWFORGE_PROVIDER_ID, "manual_control")).toBe(true);
    expect(deviceSupportsRecipePush(BREWFORGE_DEMO_PROVIDER_ID)).toBe(true);
    expect(providerHasCapability(BREWFORGE_DEMO_PROVIDER_ID, "manual_control")).toBe(true);
  });

  it("rapt-cloud (enabled:false) не даёт возможностей — даже те, что анонсирует", () => {
    expect(deviceSupportsRecipePush("rapt-cloud")).toBe(false);
    expect(providerHasCapability("rapt-cloud", "telemetry")).toBe(false);
  });

  it("неизвестный providerId → false", () => {
    expect(deviceSupportsRecipePush("unknown-provider")).toBe(false);
    expect(providerHasCapability("unknown-provider", "recipe_push")).toBe(false);
  });
});
