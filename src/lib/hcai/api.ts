import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetchModelsForConfig } from "@/lib/api/model-fetch";
import type { FetchedModel } from "@/lib/api/model-fetch";
import {
  HCAI_ENDPOINT_ROOTS,
  type HcaiActiveSubscription,
  type HcaiAnnouncement,
  type HcaiApiKeyItem,
  type HcaiApiKeyList,
  type HcaiAuthUser,
  type HcaiDashboardModels,
  type HcaiDashboardStats,
  type HcaiDashboardTrend,
  type HcaiGroup,
  type HcaiLoginResult,
  type HcaiPlatformQuotas,
  type HcaiPublicSettings,
  type HcaiRedeemRecord,
  type HcaiUsageErrorList,
  type HcaiUsageErrorRecord,
  type HcaiUsageList,
  type HcaiUsageResponse,
  type HcaiUsageSnapshot,
  type HcaiUsageStats,
} from "./types";

const DEFAULT_TZ = "Asia/Shanghai";

function todayInShanghai(): string {
  return formatDateInTimezone(new Date(), DEFAULT_TZ);
}

/** YYYY-MM-DD in given IANA timezone */
export function formatDateInTimezone(
  date: Date,
  timeZone = DEFAULT_TZ,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Calendar day offset in Asia/Shanghai (approximate via noon UTC shift) */
export function shanghaiDateOffset(daysAgo: number): string {
  const now = new Date();
  // Use local ms offset then format in Shanghai to avoid DST edge for CN
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return formatDateInTimezone(d, DEFAULT_TZ);
}

function toQueryPairs(
  query?: Record<string, string | number | undefined | null>,
): [string, string][] | null {
  if (!query) return null;
  const pairs: [string, string][] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    pairs.push([k, String(v)]);
  }
  return pairs.length > 0 ? pairs : null;
}

/**
 * 已登录 GET：`path` 如 `/api/v1/usage/dashboard/stats`。
 * 经 Rust 侧携带 Bearer token 请求，返回 envelope.data。
 */
export async function hcaiAuthedGet<T>(
  path: string,
  accessToken: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  return invoke<T>("hcai_api_get", {
    path,
    accessToken,
    query: toQueryPairs(query),
  });
}

/** 已登录 POST JSON */
export async function hcaiAuthedPost<T>(
  path: string,
  accessToken: string,
  body?: unknown,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  return invoke<T>("hcai_api_post", {
    path,
    accessToken,
    body: body ?? null,
    query: toQueryPairs(query),
  });
}

/** 已登录 PUT JSON */
export async function hcaiAuthedPut<T>(
  path: string,
  accessToken: string,
  body?: unknown,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  return invoke<T>("hcai_api_put", {
    path,
    accessToken,
    body: body ?? null,
    query: toQueryPairs(query),
  });
}

/** 已登录 DELETE */
export async function hcaiAuthedDelete<T = unknown>(
  path: string,
  accessToken: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  return invoke<T>("hcai_api_delete", {
    path,
    accessToken,
    query: toQueryPairs(query),
  });
}

export async function fetchHcaiAuthMe(
  accessToken: string,
  timezone = DEFAULT_TZ,
): Promise<HcaiAuthUser> {
  return hcaiAuthedGet<HcaiAuthUser>("/api/v1/auth/me", accessToken, {
    timezone,
  });
}

export async function fetchHcaiDashboardStats(
  accessToken: string,
  timezone = DEFAULT_TZ,
): Promise<HcaiDashboardStats> {
  return hcaiAuthedGet<HcaiDashboardStats>(
    "/api/v1/usage/dashboard/stats",
    accessToken,
    { timezone },
  );
}

export async function fetchHcaiDashboardModels(
  accessToken: string,
  opts: {
    startDate: string;
    endDate: string;
    timezone?: string;
    /** 使用记录页传 requested，对齐 Web */
    modelSource?: string;
  },
): Promise<HcaiDashboardModels> {
  return hcaiAuthedGet<HcaiDashboardModels>(
    "/api/v1/usage/dashboard/models",
    accessToken,
    {
      start_date: opts.startDate,
      end_date: opts.endDate,
      model_source: opts.modelSource,
      timezone: opts.timezone ?? DEFAULT_TZ,
    },
  );
}

/** 使用记录汇总：请求/Token/费用/端点分布 */
export async function fetchHcaiUsageStats(
  accessToken: string,
  opts: { startDate: string; endDate: string; timezone?: string },
): Promise<HcaiUsageStats> {
  return hcaiAuthedGet<HcaiUsageStats>("/api/v1/usage/stats", accessToken, {
    start_date: opts.startDate,
    end_date: opts.endDate,
    timezone: opts.timezone ?? DEFAULT_TZ,
  });
}

/**
 * 使用记录快照 v2：趋势 + 分组（可选模型）。
 * 对齐 Web：`include_trend=true&include_group_stats=true&include_model_stats=false`
 */
export async function fetchHcaiUsageSnapshot(
  accessToken: string,
  opts: {
    startDate: string;
    endDate: string;
    granularity?: string;
    includeTrend?: boolean;
    includeModelStats?: boolean;
    includeGroupStats?: boolean;
    timezone?: string;
  },
): Promise<HcaiUsageSnapshot> {
  return hcaiAuthedGet<HcaiUsageSnapshot>(
    "/api/v1/usage/dashboard/snapshot-v2",
    accessToken,
    {
      start_date: opts.startDate,
      end_date: opts.endDate,
      granularity: opts.granularity ?? "day",
      include_trend: opts.includeTrend === false ? "false" : "true",
      include_model_stats: opts.includeModelStats ? "true" : "false",
      include_group_stats: opts.includeGroupStats === false ? "false" : "true",
      timezone: opts.timezone ?? DEFAULT_TZ,
    },
  );
}

/** 使用明细分页列表 */
export async function fetchHcaiUsageList(
  accessToken: string,
  opts: {
    startDate: string;
    endDate: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
    timezone?: string;
  },
): Promise<HcaiUsageList> {
  return hcaiAuthedGet<HcaiUsageList>("/api/v1/usage", accessToken, {
    page: opts.page ?? 1,
    page_size: opts.pageSize ?? 20,
    start_date: opts.startDate,
    end_date: opts.endDate,
    sort_by: opts.sortBy ?? "created_at",
    sort_order: opts.sortOrder ?? "desc",
    timezone: opts.timezone ?? DEFAULT_TZ,
  });
}

/** 错误请求分页列表 `GET /api/v1/usage/errors` */
export async function fetchHcaiUsageErrors(
  accessToken: string,
  opts: {
    startDate: string;
    endDate: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: string;
    timezone?: string;
  },
): Promise<HcaiUsageErrorList> {
  return hcaiAuthedGet<HcaiUsageErrorList>(
    "/api/v1/usage/errors",
    accessToken,
    {
      page: opts.page ?? 1,
      page_size: opts.pageSize ?? 20,
      start_date: opts.startDate,
      end_date: opts.endDate,
      sort_by: opts.sortBy ?? "created_at",
      sort_order: opts.sortOrder ?? "desc",
      timezone: opts.timezone ?? DEFAULT_TZ,
    },
  );
}

/** 错误请求详情 `GET /api/v1/usage/errors/:id`（含 error_body） */
export async function fetchHcaiUsageErrorDetail(
  accessToken: string,
  id: number,
  timezone = DEFAULT_TZ,
): Promise<HcaiUsageErrorRecord> {
  return hcaiAuthedGet<HcaiUsageErrorRecord>(
    `/api/v1/usage/errors/${id}`,
    accessToken,
    { timezone },
  );
}

export async function fetchHcaiDashboardTrend(
  accessToken: string,
  opts: {
    startDate: string;
    endDate: string;
    granularity?: string;
    timezone?: string;
  },
): Promise<HcaiDashboardTrend> {
  return hcaiAuthedGet<HcaiDashboardTrend>(
    "/api/v1/usage/dashboard/trend",
    accessToken,
    {
      start_date: opts.startDate,
      end_date: opts.endDate,
      granularity: opts.granularity ?? "day",
      timezone: opts.timezone ?? DEFAULT_TZ,
    },
  );
}

export async function fetchHcaiPlatformQuotas(
  accessToken: string,
  timezone = DEFAULT_TZ,
): Promise<HcaiPlatformQuotas> {
  return hcaiAuthedGet<HcaiPlatformQuotas>(
    "/api/v1/user/platform-quotas",
    accessToken,
    { timezone },
  );
}

/** 当前生效的订阅列表 */
export async function fetchHcaiActiveSubscriptions(
  accessToken: string,
  timezone = DEFAULT_TZ,
): Promise<HcaiActiveSubscription[]> {
  return hcaiAuthedGet<HcaiActiveSubscription[]>(
    "/api/v1/subscriptions/active",
    accessToken,
    { timezone },
  );
}

/** 全部订阅（含已过期）`GET /api/v1/subscriptions` */
export async function fetchHcaiSubscriptions(
  accessToken: string,
  timezone = DEFAULT_TZ,
): Promise<HcaiActiveSubscription[]> {
  return hcaiAuthedGet<HcaiActiveSubscription[]>(
    "/api/v1/subscriptions",
    accessToken,
    { timezone },
  );
}

/** 兑换历史 `GET /api/v1/redeem/history` */
export async function fetchHcaiRedeemHistory(
  accessToken: string,
  timezone = DEFAULT_TZ,
): Promise<HcaiRedeemRecord[]> {
  return hcaiAuthedGet<HcaiRedeemRecord[]>(
    "/api/v1/redeem/history",
    accessToken,
    { timezone },
  );
}

/** 兑换码 `POST /api/v1/redeem` body: { code } */
export async function redeemHcaiCode(
  accessToken: string,
  code: string,
): Promise<HcaiRedeemRecord> {
  return hcaiAuthedPost<HcaiRedeemRecord>("/api/v1/redeem", accessToken, {
    code: code.trim(),
  });
}

/** 公告列表 */
export async function fetchHcaiAnnouncements(
  accessToken: string,
  timezone = DEFAULT_TZ,
): Promise<HcaiAnnouncement[]> {
  return hcaiAuthedGet<HcaiAnnouncement[]>(
    "/api/v1/announcements",
    accessToken,
    { timezone },
  );
}

/** API 密钥分页列表。`status` 传空字符串/undefined 表示不按状态过滤。 */
export async function fetchHcaiApiKeys(
  accessToken: string,
  opts?: {
    page?: number;
    pageSize?: number;
    /** active / inactive 等；省略则不过滤 */
    status?: string | null;
    sortBy?: string;
    sortOrder?: string;
    timezone?: string;
  },
): Promise<HcaiApiKeyList> {
  const status =
    opts?.status === null || opts?.status === undefined || opts?.status === ""
      ? undefined
      : opts.status === "all"
        ? undefined
        : opts.status;
  return hcaiAuthedGet<HcaiApiKeyList>("/api/v1/keys", accessToken, {
    page: opts?.page ?? 1,
    page_size: opts?.pageSize ?? 100,
    status,
    sort_by: opts?.sortBy ?? "created_at",
    sort_order: opts?.sortOrder ?? "desc",
    timezone: opts?.timezone ?? DEFAULT_TZ,
  });
}

/** 当前用户有权限的分组（创建/编辑密钥用） */
export async function fetchHcaiAvailableGroups(
  accessToken: string,
  timezone = DEFAULT_TZ,
): Promise<HcaiGroup[]> {
  return hcaiAuthedGet<HcaiGroup[]>("/api/v1/groups/available", accessToken, {
    timezone,
  });
}

/** 创建密钥：仅 name + group_id */
export async function createHcaiApiKey(
  accessToken: string,
  body: { name: string; group_id: number },
): Promise<HcaiApiKeyItem> {
  return hcaiAuthedPost<HcaiApiKeyItem>("/api/v1/keys", accessToken, {
    name: body.name.trim(),
    group_id: body.group_id,
  });
}

export interface HcaiUpdateApiKeyBody {
  name: string;
  group_id: number;
  status: "active" | "inactive";
  /** 以下字段 UI 不暴露，提交时用默认值对齐 Web */
  ip_whitelist?: string[];
  ip_blacklist?: string[];
  quota?: number;
  expires_at?: string;
  rate_limit_5h?: number;
  rate_limit_1d?: number;
  rate_limit_7d?: number;
}

/** 更新密钥（编辑 / 改状态） */
export async function updateHcaiApiKey(
  accessToken: string,
  keyId: number,
  body: Partial<HcaiUpdateApiKeyBody> & Record<string, unknown>,
): Promise<HcaiApiKeyItem> {
  return hcaiAuthedPut<HcaiApiKeyItem>(
    `/api/v1/keys/${keyId}`,
    accessToken,
    body,
  );
}

/** 仅切换启用/禁用 */
export async function setHcaiApiKeyStatus(
  accessToken: string,
  keyId: number,
  status: "active" | "inactive",
): Promise<HcaiApiKeyItem> {
  return updateHcaiApiKey(accessToken, keyId, { status });
}

/** 删除密钥 `DELETE /api/v1/keys/{id}` */
export async function deleteHcaiApiKey(
  accessToken: string,
  keyId: number,
): Promise<{ message?: string } | null> {
  return hcaiAuthedDelete<{ message?: string } | null>(
    `/api/v1/keys/${keyId}`,
    accessToken,
  );
}

/** 仪表盘时间范围预设（对齐 HCAI Web） */
export type HcaiDashboardRangePreset =
  | "today"
  | "yesterday"
  | "24h"
  | "7d"
  | "14d"
  | "30d"
  | "month"
  | "last_month"
  | "custom";

export const HCAI_DASHBOARD_RANGE_PRESETS: {
  id: Exclude<HcaiDashboardRangePreset, "custom">;
  label: string;
}[] = [
  { id: "today", label: "今天" },
  { id: "yesterday", label: "昨天" },
  { id: "24h", label: "近24小时" },
  { id: "7d", label: "近 7 天" },
  { id: "14d", label: "近 14 天" },
  { id: "30d", label: "近 30 天" },
  { id: "month", label: "本月" },
  { id: "last_month", label: "上月" },
];

export function hcaiDashboardRangeLabel(
  preset: HcaiDashboardRangePreset,
  startDate?: string,
  endDate?: string,
): string {
  if (preset === "custom" && startDate && endDate) {
    return `${startDate.replace(/-/g, "/")} – ${endDate.replace(/-/g, "/")}`;
  }
  return (
    HCAI_DASHBOARD_RANGE_PRESETS.find((p) => p.id === preset)?.label ?? "自定义"
  );
}

/**
 * 仪表盘时间范围：返回 [startDate, endDate]（Asia/Shanghai YYYY-MM-DD）。
 * 含今天在内的「近 N 天」= 今天往前 N-1 天。
 */
export function dashboardDateRange(
  range: HcaiDashboardRangePreset,
  custom?: { startDate: string; endDate: string },
): { startDate: string; endDate: string } {
  if (range === "custom" && custom?.startDate && custom?.endDate) {
    return { startDate: custom.startDate, endDate: custom.endDate };
  }

  const endDate = formatDateInTimezone(new Date(), DEFAULT_TZ);
  const [y, m] = endDate.split("-").map(Number);

  switch (range) {
    case "today":
      return { startDate: endDate, endDate };
    case "24h":
      // 按日历日覆盖近两天，配合 hour 粒度近似「近 24 小时」
      return { startDate: shanghaiDateOffset(1), endDate };
    case "yesterday": {
      const yday = shanghaiDateOffset(1);
      return { startDate: yday, endDate: yday };
    }
    case "7d":
      return { startDate: shanghaiDateOffset(6), endDate };
    case "14d":
      return { startDate: shanghaiDateOffset(13), endDate };
    case "30d":
      return { startDate: shanghaiDateOffset(29), endDate };
    case "month":
      return { startDate: `${endDate.slice(0, 8)}01`, endDate };
    case "last_month": {
      let ly = y;
      let lm = m - 1;
      if (lm < 1) {
        lm = 12;
        ly -= 1;
      }
      const pad = (n: number) => String(n).padStart(2, "0");
      const lastDay = new Date(ly, lm, 0).getDate();
      return {
        startDate: `${ly}-${pad(lm)}-01`,
        endDate: `${ly}-${pad(lm)}-${pad(lastDay)}`,
      };
    }
    default:
      return { startDate: shanghaiDateOffset(29), endDate };
  }
}

export function isHcaiUnauthorizedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /401|unauthorized|login again/i.test(msg);
}

/**
 * 拉取 HCAI 公开站点设置（登录协议文档等，无需鉴权）。
 * 经 Rust 侧请求，避免 WebView 网络限制导致失败。
 */
export async function fetchHcaiPublicSettings(
  timezone = "Asia/Shanghai",
): Promise<HcaiPublicSettings> {
  return invoke<HcaiPublicSettings>("fetch_hcai_public_settings", {
    timezone,
  });
}

/**
 * 邮箱密码登录 HCAI 账户。
 * 经 Rust 侧请求，返回 login data（token + user）。
 */
export async function loginHcaiAccount(
  email: string,
  password: string,
): Promise<HcaiLoginResult> {
  return invoke<HcaiLoginResult>("hcai_login", {
    email: email.trim(),
    password,
  });
}

interface HcaiOAuthCompletion {
  requestId: string;
  result?: HcaiLoginResult | null;
  error?: string | null;
}

interface HcaiOAuthResultSignal {
  requestId: string;
}

const HCAI_OAUTH_RESULT_EVENT = "hcai-oauth-result";
const HCAI_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
let hcaiOauthActive = false;

function unwrapHcaiOAuthCompletion(
  completion: HcaiOAuthCompletion,
): HcaiLoginResult {
  if (completion.error) throw new Error(completion.error);
  if (!completion.result?.access_token) {
    throw new Error("HCAI OAuth 登录结果无效");
  }
  return completion.result;
}

async function takeHcaiOAuthCompletion(
  requestId?: string,
): Promise<HcaiOAuthCompletion | null> {
  return invoke<HcaiOAuthCompletion | null>("hcai_oauth_take_result", {
    requestId: requestId ?? null,
  });
}

export function isHcaiOauthLoginActive(): boolean {
  return hcaiOauthActive;
}

/** 取走由 deep link 冷启动带回、但尚未被登录按钮流程消费的结果。 */
export async function takePendingHcaiOauthResult(): Promise<HcaiLoginResult | null> {
  if (hcaiOauthActive) return null;
  const completion = await takeHcaiOAuthCompletion();
  return completion ? unwrapHcaiOAuthCompletion(completion) : null;
}

async function loginHcaiWithBrowserOAuth(
  startCommand: "hcai_oauth_github_start" | "hcai_oauth_google_start",
  fallbackCommand?: "hcai_oauth_github_webview_login",
): Promise<HcaiLoginResult> {
  let requestId = "";
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let signalResolve: ((requestId: string) => void) | undefined;
  const signalPromise = new Promise<string>((resolve) => {
    signalResolve = resolve;
  });
  const unlisten = await listen<HcaiOAuthResultSignal>(
    HCAI_OAUTH_RESULT_EVENT,
    (event) => signalResolve?.(event.payload.requestId),
  );
  hcaiOauthActive = true;

  try {
    try {
      requestId = await invoke<string>(startCommand);
    } catch (error) {
      if (!fallbackCommand) throw error;
      // 极少数系统禁用默认浏览器/协议启动时，GitHub 保持旧 WebView 能力可用。
      return await invoke<HcaiLoginResult>(fallbackCommand);
    }

    const immediate = await takeHcaiOAuthCompletion(requestId);
    if (immediate) return unwrapHcaiOAuthCompletion(immediate);

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("登录超时，请重试")),
        HCAI_OAUTH_TIMEOUT_MS,
      );
    });
    const signaledRequestId = await Promise.race([
      signalPromise,
      timeoutPromise,
    ]);
    if (signaledRequestId !== requestId) {
      throw new Error("收到不匹配的 HCAI OAuth 回调");
    }

    const completion = await takeHcaiOAuthCompletion(requestId);
    if (!completion) throw new Error("HCAI OAuth 登录结果已失效");
    return unwrapHcaiOAuthCompletion(completion);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    unlisten();
    if (requestId) {
      void invoke("hcai_oauth_cancel", { requestId });
    }
    hcaiOauthActive = false;
  }
}

/** GitHub OAuth 登录；系统浏览器无法启动时回退到原有独立 WebView。 */
export function loginHcaiWithGithub(): Promise<HcaiLoginResult> {
  return loginHcaiWithBrowserOAuth(
    "hcai_oauth_github_start",
    "hcai_oauth_github_webview_login",
  );
}

/** Google OAuth 登录：复用系统浏览器会话并通过 HCAI deep link 回到应用。 */
export function loginHcaiWithGoogle(): Promise<HcaiLoginResult> {
  return loginHcaiWithBrowserOAuth("hcai_oauth_google_start");
}

/**
 * 查询 HCAI 密钥额度。后端按主站 → 备用节点顺序自动重试。
 */
export async function fetchHcaiUsage(
  apiKey: string,
  opts?: { days?: number },
): Promise<HcaiUsageResponse> {
  const day = todayInShanghai();
  return invoke<HcaiUsageResponse>("fetch_hcai_usage", {
    apiKey: apiKey.trim(),
    startDate: day,
    endDate: day,
    days: opts?.days ?? 30,
    timezone: "Asia/Shanghai",
  });
}

/**
 * 拉取 HCAI 模型列表：主站失败时依次尝试备用根节点。
 */
export async function fetchHcaiModels(apiKey: string): Promise<FetchedModel[]> {
  const key = apiKey.trim();
  let lastError: unknown;
  for (const root of HCAI_ENDPOINT_ROOTS) {
    try {
      return await fetchModelsForConfig(root, key, false);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Failed to fetch HCAI models"));
}
