import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import * as googleSheets from "./googleSheets";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(): { ctx: TrpcContext; cookies: Map<string, string> } {
  const cookies = new Map<string, string>();

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => {
        cookies.set(name, value);
      },
      clearCookie: (name: string) => {
        cookies.delete(name);
      },
    } as TrpcContext["res"],
  };

  return { ctx, cookies };
}

function createAuthContext(): { ctx: TrpcContext; cookies: Map<string, string> } {
  const { ctx, cookies } = createMockContext();

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sheet-bccsflatv@gmail.com",
    email: "bccsflatv@gmail.com",
    name: "bccsflatv",
    loginMethod: "google-sheets",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  ctx.user = user;

  return { ctx, cookies };
}

describe("auth.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully login with valid credentials", async () => {
    const { ctx, cookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Mock validateCredentials to return valid with role
    vi.spyOn(googleSheets, "validateCredentials").mockResolvedValue({ valid: true, role: 'user' });

    const result = await caller.auth.login({
      email: "bccsflatv@gmail.com",
      password: "BCCS123!",
    });

    expect(result.success).toBe(true);
    expect(result.user.email).toBe("bccsflatv@gmail.com");
    expect(cookies.has(COOKIE_NAME)).toBe(true);
  });

  it("should reject login with invalid credentials", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Mock validateCredentials to return invalid
    vi.spyOn(googleSheets, "validateCredentials").mockResolvedValue({ valid: false });

    await expect(
      caller.auth.login({
        email: "wrong@email.com",
        password: "wrongpassword",
      })
    ).rejects.toThrow("Invalid email or password");
  });
});

describe("auth.logout", () => {
  it("should clear session cookie and report success", async () => {
    const { ctx, cookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Set a cookie first
    cookies.set(COOKIE_NAME, "test-token");

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(cookies.has(COOKIE_NAME)).toBe(false);
  });
});

describe("auth.me", () => {
  it("should return user when authenticated", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeDefined();
    expect(result?.email).toBe("bccsflatv@gmail.com");
  });

  it("should return null when not authenticated", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });
});
