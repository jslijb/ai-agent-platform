import { describe, it, expect, beforeEach } from "vitest";
import {
  getDeviceType,
  checkRateLimit,
  createGatewayContext,
  createGatewayHeaders,
  createGatewayResponse,
  RATE_LIMIT_MAX_REQUESTS,
} from "../api-gateway";
import type { NextRequest } from "next/server";

function mockRequest(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name] || null,
    },
  } as unknown as NextRequest;
}

describe("API Gateway", () => {
  describe("Device Type Detection", () => {
    it("should default to web", () => {
      expect(getDeviceType(mockRequest())).toBe("web");
    });

    it("should detect x-device-type header", () => {
      expect(getDeviceType(mockRequest({ "x-device-type": "miniapp" }))).toBe("miniapp");
      expect(getDeviceType(mockRequest({ "x-device-type": "app" }))).toBe("app");
      expect(getDeviceType(mockRequest({ "x-device-type": "bot" }))).toBe("bot");
    });

    it("should detect WeChat from User-Agent", () => {
      expect(getDeviceType(mockRequest({ "user-agent": "MicroMessenger/8.0" }))).toBe("miniapp");
    });

    it("should detect DingTalk from User-Agent", () => {
      expect(getDeviceType(mockRequest({ "user-agent": "DingTalk/7.0" }))).toBe("bot");
    });

    it("should detect Feishu from User-Agent", () => {
      expect(getDeviceType(mockRequest({ "user-agent": "Feishu/7.0" }))).toBe("bot");
    });

    it("should detect Capacitor from User-Agent", () => {
      expect(getDeviceType(mockRequest({ "user-agent": "Capacitor/5.0" }))).toBe("app");
    });

    it("should ignore invalid x-device-type", () => {
      expect(getDeviceType(mockRequest({ "x-device-type": "invalid" }))).toBe("web");
    });
  });

  describe("Rate Limiting", () => {
    beforeEach(() => {
      checkRateLimit("test-cleanup");
    });

    it("should allow requests under limit", () => {
      const result = checkRateLimit("test-client-1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(RATE_LIMIT_MAX_REQUESTS - 1);
    });

    it("should block requests over limit", () => {
      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
        checkRateLimit("test-client-2");
      }
      const result = checkRateLimit("test-client-2");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should separate clients", () => {
      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
        checkRateLimit("test-client-3");
      }
      const otherClient = checkRateLimit("test-client-4");
      expect(otherClient.allowed).toBe(true);
    });
  });

  describe("Gateway Context", () => {
    it("should create context from request", () => {
      const req = mockRequest({ "x-device-type": "app", "x-forwarded-for": "1.2.3.4" });
      const ctx = createGatewayContext(req);
      expect(ctx.deviceType).toBe("app");
      expect(ctx.clientId).toBe("1.2.3.4");
      expect(ctx.requestId).toMatch(/^gw-/);
    });
  });

  describe("Gateway Response", () => {
    it("should create success response with headers", () => {
      const ctx = createGatewayContext(mockRequest());
      const resp = createGatewayResponse({ status: "ok" }, ctx);
      expect(resp.status).toBe(200);
    });

    it("should create rate limit response", () => {
      const ctx = createGatewayContext(mockRequest());
      ctx.rateLimit.allowed = false;
      ctx.rateLimit.remaining = 0;
      const resp = createGatewayResponse({}, ctx);
      expect(resp.status).toBe(429);
    });
  });

  describe("Gateway Headers", () => {
    it("should include device type and request id", () => {
      const ctx = createGatewayContext(mockRequest({ "x-device-type": "bot" }));
      const headers = createGatewayHeaders(ctx);
      expect(headers["x-device-type"]).toBe("bot");
      expect(headers["x-request-id"]).toMatch(/^gw-/);
      expect(headers["x-rate-limit-remaining"]).toBeDefined();
    });
  });
});