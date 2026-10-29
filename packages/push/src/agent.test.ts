import type { LookupAddress, LookupAllOptions } from "node:dns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn<(hostname: string, options: LookupAllOptions, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void>()
}));
vi.mock("node:dns", () => ({ lookup: mocks.lookup }));
import { isPublicPushAddress, pushLookup } from "./agent";

const resolve = (hostname = "fcm.googleapis.com", all = true) => new Promise((accept, reject) => {
  pushLookup(hostname, { all }, (error, address, family) => {
    if (error) reject(error);
    else accept({ address, family });
  });
});

beforeEach(() => { mocks.lookup.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("public push IP addresses", () => {
  it.each(["142.250.74.10", "8.8.8.8", "1.1.1.1", "2001:4860:4860::8888", "2a00:1450:4001::200a"])("allows public address %s", address => {
    expect(isPublicPushAddress(address)).toBe(true);
  });
  it.each([
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1",
    "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fc00::1", "fd00::1", "::ffff:127.0.0.1",
    "::ffff:8.8.8.8", "64:ff9b::7f00:1", "2001:db8::1", "2002:7f00:1::1", "3fff::1", "bad"
  ])("blocks local, reserved or embedded addresses: %s", address => {
    expect(isPublicPushAddress(address)).toBe(false);
  });
});

describe("DNS checked at connection time", () => {
  it("passes only the addresses from the checked DNS response to the socket", async () => {
    const addresses = [{ address: "142.250.74.10", family: 4 }, { address: "2a00:1450:4001::200a", family: 6 }];
    mocks.lookup.mockImplementation((_host, _opts, callback) => callback(null, addresses));
    await expect(resolve()).resolves.toEqual({ address: addresses, family: undefined });
    await expect(resolve("fcm.googleapis.com", false)).resolves.toEqual({ address: addresses[0]!.address, family: 4 });
  });

  it("does not resolve unsupported hosts", async () => {
    await expect(resolve("localhost")).rejects.toThrow("PUSH_ADDRESS_BLOCKED");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("rejects the whole DNS response if any address is private", async () => {
    mocks.lookup.mockImplementation((_host, _opts, callback) => callback(null, [
      { address: "142.250.74.10", family: 4 }, { address: "127.0.0.1", family: 4 }
    ]));
    await expect(resolve()).rejects.toThrow("PUSH_ADDRESS_BLOCKED");
  });

  it("revalidates DNS on each new connection", async () => {
    mocks.lookup
      .mockImplementationOnce((_host, _opts, callback) => callback(null, [{ address: "142.250.74.10", family: 4 }]))
      .mockImplementationOnce((_host, _opts, callback) => callback(null, [{ address: "169.254.169.254", family: 4 }]));
    await expect(resolve()).resolves.toBeDefined();
    await expect(resolve()).rejects.toThrow("PUSH_ADDRESS_BLOCKED");
  });

  it("rejects empty DNS results and DNS failures", async () => {
    mocks.lookup.mockImplementationOnce((_host, _opts, callback) => callback(null, []));
    await expect(resolve()).rejects.toThrow("PUSH_ADDRESS_BLOCKED");
    mocks.lookup.mockImplementationOnce((_host, _opts, callback) => callback(new Error("ENOTFOUND"), []));
    await expect(resolve()).rejects.toThrow("PUSH_ADDRESS_BLOCKED");
  });

  it("times out DNS and ignores a late resolver callback", async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    pushLookup("fcm.googleapis.com", { all: true }, callback);
    await vi.advanceTimersByTimeAsync(5000);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]?.[0]).toMatchObject({ message: "PUSH_DNS_TIMEOUT" });
    const dnsCallback = mocks.lookup.mock.calls[0]![2];
    dnsCallback(null, [{ address: "142.250.74.10", family: 4 }]);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
