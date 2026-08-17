export interface DeviceInfo {
  platform: "web" | "android" | "ios";
  isNative: boolean;
  userAgent: string;
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    return { platform: "web", isNative: false, userAgent: "SSR" };
  }

  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isCapacitor = (window as any).Capacitor?.isNativePlatform?.() ?? false;

  let platform: DeviceInfo["platform"] = "web";
  if (isCapacitor && isAndroid) platform = "android";
  else if (isCapacitor && isIOS) platform = "ios";

  return {
    platform,
    isNative: isCapacitor,
    userAgent: ua,
  };
}

export async function getNativeToken(): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: "auth_token" });
    return value;
  } catch {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("auth_token");
    }
    return null;
  }
}

export async function setNativeToken(token: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: "auth_token", value: token });
  } catch {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("auth_token", token);
    }
  }
}

export async function clearNativeToken(): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: "auth_token" });
  } catch {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("auth_token");
    }
  }
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_API_URL || "http://localhost";
  const device = getDeviceInfo();
  if (device.isNative) {
    return process.env.NEXT_PUBLIC_API_URL || "http://10.0.2.2";
  }
  return process.env.NEXT_PUBLIC_API_URL || (typeof location !== "undefined" ? location.origin : "http://localhost");
}