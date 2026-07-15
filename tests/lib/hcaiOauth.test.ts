import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, listenMock, unlistenMock, eventHandler } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  unlistenMock: vi.fn(),
  eventHandler: {
    current: undefined as
      | ((event: { payload: { requestId: string } }) => void)
      | undefined,
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (_event: string, handler: typeof eventHandler.current) => {
    eventHandler.current = handler;
    listenMock(_event);
    return Promise.resolve(unlistenMock);
  },
}));

import { loginHcaiWithGithub, loginHcaiWithGoogle } from "@/lib/hcai/api";

describe("HCAI GitHub OAuth", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    unlistenMock.mockReset();
    eventHandler.current = undefined;
  });

  it("opens the system-browser flow and consumes the matching deep-link result", async () => {
    const requestId = "123e4567-e89b-42d3-a456-426614174000";
    let takeCalls = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "hcai_oauth_github_start") {
        queueMicrotask(() => {
          eventHandler.current?.({ payload: { requestId } });
        });
        return Promise.resolve(requestId);
      }
      if (command === "hcai_oauth_take_result") {
        takeCalls += 1;
        return Promise.resolve(
          takeCalls === 1
            ? null
            : {
                requestId,
                result: {
                  access_token: "access-token",
                  refresh_token: "refresh-token",
                  expires_in: 3600,
                  token_type: "Bearer",
                  user: { id: 1, email: "user@example.com" },
                },
              },
        );
      }
      if (command === "hcai_oauth_cancel") return Promise.resolve();
      throw new Error(`unexpected command: ${command}`);
    });

    const result = await loginHcaiWithGithub();

    expect(result.access_token).toBe("access-token");
    expect(listenMock).toHaveBeenCalledWith("hcai-oauth-result");
    expect(unlistenMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("hcai_oauth_cancel", {
      requestId,
    });
  });

  it("falls back to the existing WebView only when the browser cannot start", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "hcai_oauth_github_start") {
        return Promise.reject(new Error("no default browser"));
      }
      if (command === "hcai_oauth_github_webview_login") {
        return Promise.resolve({
          access_token: "fallback-token",
          expires_in: 3600,
          token_type: "Bearer",
          user: { id: 2, email: "fallback@example.com" },
        });
      }
      throw new Error(`unexpected command: ${command}`);
    });

    const result = await loginHcaiWithGithub();

    expect(result.access_token).toBe("fallback-token");
    expect(unlistenMock).toHaveBeenCalledTimes(1);
  });

  it("uses the Google system-browser flow and the shared deep-link result", async () => {
    const requestId = "223e4567-e89b-42d3-a456-426614174000";
    let takeCalls = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "hcai_oauth_google_start") {
        queueMicrotask(() => {
          eventHandler.current?.({ payload: { requestId } });
        });
        return Promise.resolve(requestId);
      }
      if (command === "hcai_oauth_take_result") {
        takeCalls += 1;
        return Promise.resolve(
          takeCalls === 1
            ? null
            : {
                requestId,
                result: {
                  access_token: "google-access-token",
                  expires_in: 3600,
                  token_type: "Bearer",
                  user: { id: 3, email: "google@example.com" },
                },
              },
        );
      }
      if (command === "hcai_oauth_cancel") return Promise.resolve();
      throw new Error(`unexpected command: ${command}`);
    });

    const result = await loginHcaiWithGoogle();

    expect(result.access_token).toBe("google-access-token");
    expect(invokeMock).toHaveBeenCalledWith("hcai_oauth_google_start");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "hcai_oauth_github_webview_login",
    );
  });
});
