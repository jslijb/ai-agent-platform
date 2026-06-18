import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// Mock fetch for code2Session tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment variables
process.env.WECHAT_APP_ID = "test-app-id";
process.env.WECHAT_APP_SECRET = "test-app-secret";
process.env.AUTH_SECRET = "test-jwt-secret";

// Import after mocks are set up
import { code2Session, signJwt, verifyJwt } from "../wechat";

describe("wechat auth", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("code2Session", () => {
    it("应成功调用微信 API 并返回 openid 和 session_key", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          openid: "test-openid-123",
          session_key: "test-session-key",
        }),
      });

      const result = await code2Session("test-code");
      expect(result.openid).toBe("test-openid-123");
      expect(result.session_key).toBe("test-session-key");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("appid=test-app-id");
      expect(calledUrl).toContain("secret=test-app-secret");
      expect(calledUrl).toContain("js_code=test-code");
      expect(calledUrl).toContain("grant_type=authorization_code");
    });

    it("应返回 unionid（如果微信返回）", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          openid: "test-openid-123",
          unionid: "test-unionid-456",
          session_key: "test-session-key",
        }),
      });

      const result = await code2Session("test-code");
      expect(result.unionid).toBe("test-unionid-456");
    });

    it("应在微信 API 返回错误时抛出异常", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          errcode: 40029,
          errmsg: "invalid code",
        }),
      });

      await expect(code2Session("bad-code")).rejects.toThrow("微信登录失败: invalid code");
    });
  });

  describe("signJwt / verifyJwt", () => {
    it("应正确签发和验证 JWT", () => {
      const payload = { userId: "user-123", openid: "openid-456" };
      const token = signJwt(payload);

      expect(typeof token).toBe("string");

      const decoded = verifyJwt(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe("user-123");
      expect(decoded!.openid).toBe("openid-456");
    });

    it("应在 token 无效时返回 null", () => {
      const result = verifyJwt("invalid-token");
      expect(result).toBeNull();
    });

    it("应在 token 过期时返回 null", () => {
      // 签发一个立即过期的 token
      const expiredToken = jwt.sign(
        { userId: "user-123", openid: "openid-456" },
        process.env.AUTH_SECRET!,
        { expiresIn: "0s" }
      );

      // 等一小段时间确保过期
      const result = verifyJwt(expiredToken);
      expect(result).toBeNull();
    });
  });
});
