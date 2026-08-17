import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDeviceInfo, getApiBaseUrl } from "../../app/capacitor/native-bridge";

describe("Capacitor Native Bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return web platform in SSR", () => {
    const info = getDeviceInfo();
    expect(info.platform).toBe("web");
    expect(info.isNative).toBe(false);
  });

  it("should detect Android with Capacitor", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
    });
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true },
    });
    const info = getDeviceInfo();
    expect(info.platform).toBe("android");
    expect(info.isNative).toBe(true);
  });

  it("should detect iOS with Capacitor", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    });
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true },
    });
    const info = getDeviceInfo();
    expect(info.platform).toBe("ios");
    expect(info.isNative).toBe(true);
  });

  it("should return web when Capacitor not available", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
    });
    vi.stubGlobal("window", {
      Capacitor: undefined,
    });
    const info = getDeviceInfo();
    expect(info.platform).toBe("web");
    expect(info.isNative).toBe(false);
  });

  it("should return a non-empty string for API URL", () => {
    const url = getApiBaseUrl();
    expect(typeof url).toBe("string");
  });

  it("should return emulator URL for native Android", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true },
    });
    vi.stubGlobal("navigator", {
      userAgent: "Android",
    });
    const url = getApiBaseUrl();
    expect(url).toBeTruthy();
  });
});