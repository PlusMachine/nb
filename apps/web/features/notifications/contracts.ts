import { z } from "zod";
import { isPushEndpointAllowed } from "@nb/push/endpoint";

// =============================================================================
//  features/notifications — контракты web-push подписок (Phase 6).
//  Клиент шлёт сериализованный PushSubscription (endpoint + ключи p256dh/auth).
//  Приватных секретов тут нет — эти данные и так известны браузеру/push-сервису.
// =============================================================================

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpointAllowed, "INVALID_PUSH_ENDPOINT"),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500)
  }),
  userAgent: z.string().max(500).optional()
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000)
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
