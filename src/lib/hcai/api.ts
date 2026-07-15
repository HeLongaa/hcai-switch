import { invoke } from "@tauri-apps/api/core";
import { fetchModelsForConfig } from "@/lib/api/model-fetch";
import type { FetchedModel } from "@/lib/api/model-fetch";
import { HCAI_ENDPOINT_ROOTS, type HcaiUsageResponse } from "./types";

function todayInShanghai(): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
