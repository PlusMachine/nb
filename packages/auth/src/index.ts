export const authModule = {
  name: "@nb/auth",
  status: "custom-auth-foundation",
  betterAuthCompatible: true
} as const;

export * from "./service";
export * from "./types";
export * from "./providers";
