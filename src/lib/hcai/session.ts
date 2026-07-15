/**
 * HCAI 控制台登录会话：localStorage 持久化与校验。
 */
import type { HcaiAuthSession, HcaiLoginResult } from "./types";

export const HCAI_SESSION_KEY = "hcai-console-session";
/** 旧版占位会话，加载时清理 */
const LEGACY_SESSION_KEY = "hcai-console-session-placeholder";

/** 提前 60s 视为过期，避免边界请求失败 */
const EXPIRY_SKEW_MS = 60_000;

export function sessionFromLoginResult(data: HcaiLoginResult): HcaiAuthSession {
  const expiresIn = Number(data.expires_in) || 86400;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type || "Bearer",
    expiresAt: Date.now() + expiresIn * 1000,
    user: data.user,
    loggedInAt: Date.now(),
  };
}

export function isHcaiSessionValid(
  session: HcaiAuthSession | null | undefined,
): session is HcaiAuthSession {
  if (!session?.accessToken || !session.user?.email) return false;
  if (!Number.isFinite(session.expiresAt)) return false;
  return session.expiresAt - EXPIRY_SKEW_MS > Date.now();
}

export function loadHcaiSession(): HcaiAuthSession | null {
  try {
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }

  try {
    const raw = localStorage.getItem(HCAI_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HcaiAuthSession;
    if (!isHcaiSessionValid(parsed)) {
      localStorage.removeItem(HCAI_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveHcaiSession(session: HcaiAuthSession | null): void {
  try {
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }

  if (!session) {
    localStorage.removeItem(HCAI_SESSION_KEY);
    return;
  }
  localStorage.setItem(HCAI_SESSION_KEY, JSON.stringify(session));
}

export function clearHcaiSession(): void {
  saveHcaiSession(null);
}

export function displayNameFromSession(session: HcaiAuthSession): string {
  const name = session.user.username?.trim();
  if (name) return name;
  return session.user.email;
}
