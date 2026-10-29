import { lookup } from "node:dns";
import { Agent, type AgentOptions } from "node:https";
import { BlockList, isIP } from "node:net";

import { isPushServiceHost } from "./endpoint.js";

const privateAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) privateAddresses.addSubnet(network, prefix, "ipv4");

const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [network, prefix] of [
  ["2001::", 32], ["2001:2::", 48], ["2001:10::", 28],
  ["2001:20::", 28], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]
] as const) privateAddresses.addSubnet(network, prefix, "ipv6");

export const isPublicPushAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 4) return !privateAddresses.check(address, "ipv4");
  // ULA/link-local/loopback/mapped IPv4/NAT64 не входят в 2000::/3.
  return family === 6 && globalV6.check(address, "ipv6") && !privateAddresses.check(address, "ipv6");
};

// Проверка происходит внутри lookup агента: сокет получает именно проверенные
// IP, без второго DNS-запроса между проверкой и подключением (DNS rebinding).
export const pushLookup: NonNullable<AgentOptions["lookup"]> = (hostname, options, callback) => {
  if (!isPushServiceHost(hostname)) {
    callback(new Error("PUSH_ADDRESS_BLOCKED"), "");
    return;
  }
  let settled = false;
  const timer = setTimeout(() => {
    settled = true;
    callback(new Error("PUSH_DNS_TIMEOUT"), "");
  }, 5000);
  timer.unref();
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error || !addresses.length || addresses.some(row => !isPublicPushAddress(row.address))) {
      callback(new Error("PUSH_ADDRESS_BLOCKED"), "");
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

export const pushAgent = new Agent({ lookup: pushLookup, keepAlive: true, maxSockets: 16 });
