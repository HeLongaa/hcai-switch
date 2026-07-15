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
