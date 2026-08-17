import { describe, it, expect } from "vitest";
import { APIClient, createAPIClient } from "../src/index";

describe("API Client", () => {
  describe("Construction", () => {
    it("should create client with config", () => {
      const client = createAPIClient({
        baseUrl: "http://localhost:80",
        deviceType: "web",
      });
      expect(client).toBeInstanceOf(APIClient);
      expect(client.getDeviceType()).toBe("web");
    });

    it("should create client with token", () => {
      const client = createAPIClient({
        baseUrl: "http://localhost:80",
        deviceType: "app",
        token: "test-token",
      });
      expect(client.getDeviceType()).toBe("app");
    });

    it("should create client for miniapp", () => {
      const client = createAPIClient({
        baseUrl: "http://localhost:80",
        deviceType: "miniapp",
      });
      expect(client.getDeviceType()).toBe("miniapp");
    });

    it("should create client for bot", () => {
      const client = createAPIClient({
        baseUrl: "http://localhost:80",
        deviceType: "bot",
      });
      expect(client.getDeviceType()).toBe("bot");
    });
  });

  describe("Token Management", () => {
    it("should update token", () => {
      const client = createAPIClient({
        baseUrl: "http://localhost:80",
        deviceType: "web",
      });
      client.updateToken("new-token");
    });
  });
});