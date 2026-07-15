/** HCAI 控制台展示格式化 */

const PLATFORM_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Google",
  xai: "xAI",
};

export function platformLabel(platform: string): string {
  const key = platform.toLowerCase();
  return PLATFORM_LABELS[key] ?? platform;
}

export function formatUsd(n: number | null | undefined, digits = 4): string {
  if (n == null || Number.isNaN(n)) return "--";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatUsd2(n: number | null | undefined): string {
  return formatUsd(n, 2);
}

export function formatInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "--";
  return n.toLocaleString();
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "--";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

/** 趋势图 tooltip 等：两位小数 + 单位，对齐 HCAI Web（14.72M / 812.15K） */
export function formatTokensDetail(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return String(Math.round(n));
}

export function formatLatencySeconds(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "--";
  return `${(ms / 1000).toFixed(2)}s`;
}

export const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#64748b",
  "#06b6d4",
  "#ef4444",
  "#8b5cf6",
];
