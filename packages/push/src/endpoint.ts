// Только домены push-сервисов браузеров, а не произвольный пользовательский URL.
// Пути и query непрозрачны: их формат задает сам push-сервис.
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);

export const isPushServiceHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return PUSH_HOSTS.has(host)
    || host.endsWith(".push.apple.com")
    || host.endsWith(".notify.windows.com");
};

export const parsePushEndpoint = (raw: string): URL => {
  if (raw.length > 1000 || /[\u0000-\u0020\u007f\\]/.test(raw)) {
    throw new Error("INVALID_PUSH_ENDPOINT");
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("INVALID_PUSH_ENDPOINT"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash
    || !isPushServiceHost(url.hostname)) {
    throw new Error("INVALID_PUSH_ENDPOINT");
  }
  return url;
};

export const isPushEndpointAllowed = (raw: string): boolean => {
  try { parsePushEndpoint(raw); return true; }
  catch { return false; }
};
