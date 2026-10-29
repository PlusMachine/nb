import { describe, expect, it } from "vitest";
import { isPushEndpointAllowed, parsePushEndpoint } from "./endpoint";

describe("push endpoint policy", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://web.push.apple.com/token",
    "https://another.push.apple.com/token?opaque=value",
    "https://wns2-example.notify.windows.com/w/?token=value",
    "https://FCM.GOOGLEAPIS.COM:443/fcm/send/token"
  ])("accepts supported push services: %s", endpoint => {
    expect(isPushEndpointAllowed(endpoint)).toBe(true);
  });

  it.each([
    "https://127.0.0.1/push", "https://2130706433/push", "https://[::1]/push",
    "https://[::ffff:127.0.0.1]/push", "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/push", "https://localhost/push", "https://attacker.example/push",
    "https://fcm.googleapis.com.attacker.example/push", "https://evilpush.apple.com/push",
    "https://evilnotify.windows.com/push", "https://web.push.apple.com.attacker.example/push",
    "https://fcm.googleapis.com@127.0.0.1/push", "https://user:password@fcm.googleapis.com/push",
    "https://fcm.googleapis.com:8443/push", "http://fcm.googleapis.com/push",
    "https://fcm.googleapis.com/push#secret", "https://fcm.googleapis.com./push",
    "https://fcm.googleapis.com\\@127.0.0.1/push", "https://fcm.google\napis.com/push",
    " https://fcm.googleapis.com/push", "file:///etc/passwd", "invalid"
  ])("rejects unsupported or ambiguous endpoint: %s", endpoint => {
    expect(isPushEndpointAllowed(endpoint)).toBe(false);
  });

  it("canonicalizes encoded hostnames before the legacy HTTP parser sees them", () => {
    expect(parsePushEndpoint("https://%66cm%2Egoogleapis.com/fcm/send/token").href)
      .toBe("https://fcm.googleapis.com/fcm/send/token");
  });
});
