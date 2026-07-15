import type { AppId } from "@/lib/api";

export const HCAI_BASE_URL = "https://ai.hctopup.com";
export const HCAI_BASE_URL_V1 = "https://ai.hctopup.com/v1";
export const HCAI_WEBSITE = "https://ai.hctopup.com/";
export const HCAI_KEYS_URL = "https://ai.hctopup.com/keys";
export const HCAI_ICON = "hcai";
export const HCAI_ICON_COLOR = "#E53935";

/**
 * HCAI 网关根节点（优先主站，其后为区域备用）。
 * 主站连不上时按顺序自动尝试备用，并把可用节点写入供应商配置。
 */
export const HCAI_ENDPOINT_ROOTS = [
  "https://ai.hctopup.com",
  "https://ai-us.hctopup.com",
  "https://ai-prod.hctopup.com",
] as const;

/** OpenAI 兼容路径（Codex / OpenCode Codex） */
export const HCAI_ENDPOINT_V1S = HCAI_ENDPOINT_ROOTS.map(
  (root) => `${root}/v1`,
);

export type HcaiEndpointRoot = (typeof HCAI_ENDPOINT_ROOTS)[number];

/** 去掉末尾斜杠与可选 `/v1`，得到网关根 */
export function toHcaiGatewayRoot(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

/** 是否为 HCAI 网关主机（含区域节点） */
export function isHcaiHost(url: string | undefined | null): boolean {
  if (!url) return false;
  return /hctopup\.com/i.test(url);
}

export interface HcaiDailyUsage {
  date: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  total_tokens: number;
  cost: number;
  actual_cost?: number;
}

export interface HcaiModelStat {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  actual_cost?: number;
  account_cost?: number;
}

export interface HcaiUsageBucket {
  actual_cost?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  cost?: number;
  input_tokens?: number;
  output_tokens?: number;
  requests?: number;
  total_tokens?: number;
}

export interface HcaiSubscription {
  daily_limit_usd?: number;
  daily_usage_usd?: number;
  expires_at?: string;
  monthly_limit_usd?: number;
  monthly_usage_usd?: number;
  weekly_limit_usd?: number;
  weekly_usage_usd?: number;
  weekly_window_start?: string | null;
}

export interface HcaiUsageResponse {
  balance?: number;
  remaining?: number;
  unit?: string;
  planName?: string;
  isValid?: boolean;
  mode?: string;
  daily_usage?: HcaiDailyUsage[];
  model_stats?: HcaiModelStat[];
  subscription?: HcaiSubscription;
  usage?: {
    average_duration_ms?: number;
    rpm?: number;
    tpm?: number;
    today?: HcaiUsageBucket;
    total?: HcaiUsageBucket;
  };
}

/** 登录协议文档（来自 public settings） */
export interface HcaiLoginAgreementDocument {
  id: string;
  title: string;
  content_md: string;
}

/** `/api/v1/settings/public` 中与登录相关的字段 */
export interface HcaiPublicSettings {
  login_agreement_enabled?: boolean;
  login_agreement_mode?: string;
  login_agreement_updated_at?: string;
  login_agreement_revision?: string;
  login_agreement_documents?: HcaiLoginAgreementDocument[];
  github_oauth_enabled?: boolean;
  google_oauth_enabled?: boolean;
  registration_enabled?: boolean;
  password_reset_enabled?: boolean;
}

/** 登录接口返回的用户信息 */
export interface HcaiAuthUser {
  id: number;
  email: string;
  username?: string;
  role?: string;
  balance?: number;
  frozen_balance?: number;
  concurrency?: number;
  status?: string;
  allowed_groups?: number[];
  last_active_at?: string;
  created_at?: string;
  updated_at?: string;
  total_recharged?: number;
  rpm_limit?: number;
}

/** `POST /api/v1/auth/login` 的 data 字段 */
export interface HcaiLoginResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: HcaiAuthUser;
}

/** 本地持久化的控制台登录会话 */
export interface HcaiAuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  /** access_token 过期时间戳（ms） */
  expiresAt: number;
  user: HcaiAuthUser;
  /** 登录成功时间 */
  loggedInAt: number;
}

/** `GET /api/v1/usage/dashboard/stats` data */
export interface HcaiDashboardStats {
  total_api_keys: number;
  active_api_keys: number;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens?: number;
  total_cache_read_tokens?: number;
  total_tokens: number;
  total_cost: number;
  total_actual_cost: number;
  today_requests: number;
  today_input_tokens: number;
  today_output_tokens: number;
  today_cache_creation_tokens?: number;
  today_cache_read_tokens?: number;
  today_tokens: number;
  today_cost: number;
  today_actual_cost: number;
  average_duration_ms: number;
  rpm: number;
  tpm: number;
  by_platform?: HcaiDashboardPlatformStat[];
}

export interface HcaiDashboardPlatformStat {
  platform: string;
  total_requests: number;
  total_tokens: number;
  total_actual_cost: number;
  today_requests: number;
  today_tokens: number;
  today_actual_cost: number;
}

/** `GET /api/v1/usage/dashboard/models` data */
export interface HcaiDashboardModels {
  start_date: string;
  end_date: string;
  models: HcaiDashboardModelStat[];
}

export interface HcaiDashboardModelStat {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
}

/** `GET /api/v1/usage/dashboard/trend` data */
export interface HcaiDashboardTrend {
  start_date: string;
  end_date: string;
  granularity: string;
  trend: HcaiDashboardTrendPoint[];
}

export interface HcaiDashboardTrendPoint {
  date: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
}

/** `GET /api/v1/usage/stats` data（使用记录汇总） */
export interface HcaiUsageStats {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_tokens?: number;
  total_cache_creation_tokens?: number;
  total_cache_read_tokens?: number;
  total_tokens: number;
  total_cost: number;
  total_actual_cost: number;
  average_duration_ms: number;
  endpoints?: HcaiUsageEndpointStat[];
}

export interface HcaiUsageEndpointStat {
  endpoint: string;
  requests: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
}

/** `GET /api/v1/usage/dashboard/snapshot-v2` data */
export interface HcaiUsageSnapshot {
  start_date: string;
  end_date: string;
  generated_at?: string;
  granularity: string;
  groups?: HcaiUsageGroupStat[];
  trend?: HcaiDashboardTrendPoint[];
  models?: HcaiDashboardModelStat[];
}

export interface HcaiUsageGroupStat {
  group_id: number;
  group_name: string;
  requests: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
}

/** `GET /api/v1/usage` 明细单项 */
export interface HcaiUsageRecord {
  id: number;
  user_id: number;
  api_key_id?: number | null;
  account_id?: number | null;
  request_id?: string | null;
  model: string;
  reasoning_effort?: string | null;
  inbound_endpoint?: string | null;
  group_id?: number | null;
  subscription_id?: number | null;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_5m_tokens?: number;
  cache_creation_1h_tokens?: number;
  input_cost?: number;
  output_cost?: number;
  cache_creation_cost?: number;
  cache_read_cost?: number;
  total_cost?: number;
  actual_cost?: number;
  /** 输入单价（每百万 Token，USD）；无则由 cost/tokens 推算 */
  input_price?: number;
  /** 输出单价（每百万 Token，USD） */
  output_price?: number;
  /** 缓存读取单价（每百万 Token，USD） */
  cache_read_price?: number;
  rate_multiplier?: number;
  long_context_billing_applied?: boolean;
  billing_type?: number;
  /** 服务档位，如 Standard / Priority */
  service_tier?: string | null;
  request_type?: string | null;
  stream?: boolean;
  openai_ws_mode?: boolean;
  duration_ms?: number | null;
  first_token_ms?: number | null;
  image_count?: number;
  user_agent?: string | null;
  ip_address?: string | null;
  billing_mode?: string | null;
  created_at: string;
  api_key?: Pick<
    HcaiApiKeyItem,
    "id" | "name" | "key" | "group_id" | "status"
  > | null;
  group?: HcaiGroup | null;
  user?: HcaiAuthUser | null;
}

/** `GET /api/v1/usage` 分页 data */
export interface HcaiUsageList {
  items: HcaiUsageRecord[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** `GET /api/v1/usage/errors` 错误请求单项 */
export interface HcaiUsageErrorRecord {
  id: number;
  created_at: string;
  model?: string;
  inbound_endpoint?: string;
  status_code: number;
  category?: string;
  platform?: string;
  message?: string;
  key_name?: string;
  key_deleted?: boolean;
  client_ip?: string;
  group_name?: string;
  stream?: boolean;
  /**
   * 上游响应内容。
   * 列表接口通常不带；详情 `GET /api/v1/usage/errors/:id` 返回 `error_body`。
   */
  error_body?: string | Record<string, unknown> | null;
  upstream_response?: string | Record<string, unknown> | null;
  response_body?: string | Record<string, unknown> | null;
  raw_response?: string | Record<string, unknown> | null;
  detail?: string | Record<string, unknown> | null;
}

/** `GET /api/v1/usage/errors` 分页 data */
export interface HcaiUsageErrorList {
  items: HcaiUsageErrorRecord[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** `GET /api/v1/user/platform-quotas` data */
export interface HcaiPlatformQuotas {
  platform_quotas: HcaiPlatformQuotaItem[];
}

export interface HcaiPlatformQuotaItem {
  platform: string;
  daily_limit_usd: number | null;
  daily_usage_usd: number;
  daily_window_resets_at: string | null;
  weekly_limit_usd: number | null;
  weekly_usage_usd: number;
  weekly_window_resets_at: string | null;
  monthly_limit_usd: number | null;
  monthly_usage_usd: number;
  monthly_window_resets_at: string | null;
}

/** 分组（订阅/密钥等接口嵌套） */
export interface HcaiGroup {
  id: number;
  name: string;
  description?: string;
  platform?: string;
  rate_multiplier?: number;
  is_exclusive?: boolean;
  status?: string;
  subscription_type?: string;
  daily_limit_usd?: number;
  weekly_limit_usd?: number;
  monthly_limit_usd?: number;
  allow_image_generation?: boolean;
  rpm_limit?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * 订阅单项（`GET /api/v1/subscriptions` 与 `/active` 同结构）。
 * status: active | expired | ...
 */
export interface HcaiActiveSubscription {
  id: number;
  user_id: number;
  group_id: number;
  starts_at: string;
  expires_at: string;
  status: string;
  daily_window_start?: string | null;
  weekly_window_start?: string | null;
  monthly_window_start?: string | null;
  daily_usage_usd?: number;
  weekly_usage_usd?: number;
  monthly_usage_usd?: number;
  created_at?: string;
  updated_at?: string;
  group?: HcaiGroup;
}

/** 与 active 同结构；全量列表含已过期 */
export type HcaiSubscriptionItem = HcaiActiveSubscription;

/** `GET /api/v1/redeem/history` / `POST /api/v1/redeem` 单项 */
export interface HcaiRedeemRecord {
  id: number;
  code: string;
  /** balance | admin_balance | subscription | admin_concurrency | ... */
  type: string;
  value: number;
  sale_price?: number;
  status: string;
  used_by?: number | null;
  used_at?: string | null;
  created_at?: string;
  expires_at?: string | null;
  group_id?: number | null;
  validity_days?: number;
  group?: HcaiGroup | null;
}

/** `GET /api/v1/announcements` 单项 */
export interface HcaiAnnouncement {
  id: number;
  title: string;
  content: string;
  notify_mode?: string;
  read_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** `GET /api/v1/keys` 列表项 */
export interface HcaiApiKeyItem {
  id: number;
  user_id: number;
  key: string;
  name: string;
  group_id?: number | null;
  status: string;
  ip_whitelist?: string[] | null;
  ip_blacklist?: string[] | null;
  last_used_at?: string | null;
  last_used_ip?: string | null;
  quota?: number;
  quota_used?: number;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
  current_concurrency?: number;
  rate_limit_5h?: number;
  rate_limit_1d?: number;
  rate_limit_7d?: number;
  usage_5h?: number;
  usage_1d?: number;
  usage_7d?: number;
  window_5h_start?: string | null;
  window_1d_start?: string | null;
  window_7d_start?: string | null;
  group?: HcaiGroup;
}

/** `GET /api/v1/keys` 分页 data */
export interface HcaiApiKeyList {
  items: HcaiApiKeyItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export type HcaiLinkedApp =
  | "claude"
  | "claude-desktop"
  | "codex"
  | "opencode-claude"
  | "opencode-codex"
  | "grok";

export interface HcaiLinkedProvider {
  app: HcaiLinkedApp;
  /** Maps to AppId for delete API (opencode-* → opencode) */
  appId: AppId;
  providerId: string;
  name: string;
}

export interface HcaiSavedKey {
  id: string;
  /** User-facing label */
  label: string;
  apiKey: string;
  createdAt: number;
  lastUsedAt?: number;
  /** Providers created from this key via the HCAI panel */
  linkedProviders: HcaiLinkedProvider[];
}

export interface HcaiStoreState {
  version: 1;
  keys: HcaiSavedKey[];
  activeKeyId: string | null;
}

export function isClaudeFamilyModel(id: string): boolean {
  const m = id.toLowerCase();
  return m.includes("claude") || m.includes("fable");
}

export function isCodexFamilyModel(id: string): boolean {
  const m = id.toLowerCase();
  return (
    m.startsWith("gpt-") ||
    m.includes("gpt-") ||
    m.includes("codex") ||
    m === "codex-auto-review"
  );
}

/** Grok Build / xAI 模型（含 grok-build、grok-imagine 等） */
export function isGrokFamilyModel(id: string): boolean {
  const m = id.toLowerCase();
  return m.includes("grok") || m.includes("grok-build");
}

export function isFableModel(id: string): boolean {
  return id.toLowerCase().includes("fable");
}

export function pickModelByHint(
  models: string[],
  hints: string[],
): string | undefined {
  for (const hint of hints) {
    const found = models.find((m) => m.toLowerCase().includes(hint));
    if (found) return found;
  }
  return models[0];
}
