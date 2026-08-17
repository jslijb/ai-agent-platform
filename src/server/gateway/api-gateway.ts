import type { NextRequest } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

const DEVICE_HEADERS = ["x-device-type", "user-agent"] as const;
type DeviceType = "web" | "miniapp" | "app" | "bot" | "unknown";

function getDeviceType(request: NextRequest): DeviceType {
  const deviceHeader = request.headers.get("x-device-type");
  if (deviceHeader) {
    const valid: DeviceType[] = ["web", "miniapp", "app", "bot"];
    if (valid.includes(deviceHeader as DeviceType)) {
      return deviceHeader as DeviceType;
    }
  }

  const ua = request.headers.get("user-agent") || "";
  if (ua.includes("MicroMessenger")) return "miniapp";
  if (ua.includes("DingTalk")) return "bot";
  if (ua.includes("Feishu")) return "bot";
  if (ua.includes("Capacitor")) return "app";
  return "web";
}

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimits.get(clientId);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimits.set(clientId, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
}

export interface GatewayContext {
  deviceType: DeviceType;
  clientId: string;
  requestId: string;
  rateLimit: { allowed: boolean; remaining: number; resetAt: number };
}

export function createGatewayContext(request: NextRequest): GatewayContext {
  const clientId = getClientIp(request);
  const deviceType = getDeviceType(request);
  const rateLimit = checkRateLimit(clientId);
  const requestId = `gw-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return { deviceType, clientId, requestId, rateLimit };
}

export function createGatewayHeaders(context: GatewayContext): Record<string, string> {
  return {
    "x-device-type": context.deviceType,
    "x-request-id": context.requestId,
    "x-rate-limit-remaining": String(context.rateLimit.remaining),
    "x-rate-limit-reset": String(context.rateLimit.resetAt),
  };
}

export function createGatewayResponse(
  body: unknown,
  context: GatewayContext,
  status: number = 200
): Response {
  const headers = createGatewayHeaders(context);
  headers["Content-Type"] = "application/json";

  if (!context.rateLimit.allowed) {
    headers["Retry-After"] = String(Math.ceil((context.rateLimit.resetAt - Date.now()) / 1000));
    return Response.json({ error: "Rate limit exceeded", requestId: context.requestId }, { status: 429, headers });
  }

  return Response.json(body, { status, headers });
}

export { getDeviceType, checkRateLimit, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS };