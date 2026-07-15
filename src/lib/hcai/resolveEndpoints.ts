/**
 * HCAI 端点探测：主站优先，不可达时按顺序尝试备用，返回第一个可用节点。
 */
import { vscodeApi, type EndpointLatencyResult } from "@/lib/api/vscode";
import {
  HCAI_BASE_URL,
  HCAI_ENDPOINT_ROOTS,
  HCAI_ENDPOINT_V1S,
  isHcaiHost,
  toHcaiGatewayRoot,
} from "./types";

export interface HcaiResolvedEndpoints {
  /** 网关根，如 https://ai-us.hctopup.com */
  root: string;
  /** OpenAI 兼容 base，如 https://ai-us.hctopup.com/v1 */
  v1: string;
  /** 是否从主站落到了备用节点 */
  fellBack: boolean;
  /** 原始主站根（常量） */
  primaryRoot: string;
  results: EndpointLatencyResult[];
}

function isReachable(r: EndpointLatencyResult): boolean {
  // 有延迟即建立了 TCP/TLS 并拿到响应（含 4xx/5xx）；连接失败 latency 为 null
  return typeof r.latency === "number" && r.latency !== null;
}

/**
 * 按候选顺序探测，返回第一个可达 URL；全挂则回退到列表首项。
 */
export async function pickFirstReachableEndpoint(
  candidates: string[],
  timeoutSecs = 6,
): Promise<{
  url: string;
  fellBack: boolean;
  results: EndpointLatencyResult[];
}> {
  const urls = [
    ...new Set(
      candidates
        .map((u) => u.trim().replace(/\/+$/, ""))
        .filter((u) => u.startsWith("http")),
    ),
  ];
  if (urls.length === 0) {
    return {
      url: HCAI_BASE_URL,
      fellBack: false,
      results: [],
    };
  }

  let results: EndpointLatencyResult[] = [];
  try {
    results = await vscodeApi.testApiEndpoints(urls, { timeoutSecs });
  } catch {
    // 测速失败时保守使用主站，避免阻断添加流程
    return { url: urls[0], fellBack: false, results: [] };
  }

  const byUrl = new Map(
    results.map((r) => [r.url.trim().replace(/\/+$/, ""), r]),
  );

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const match =
      byUrl.get(url) ||
      results.find((r) => r.url.trim().replace(/\/+$/, "") === url);
    if (match && isReachable(match)) {
      return {
        url,
        fellBack: i > 0,
        results,
      };
    }
  }

  // 全部不可达：仍返回主站，由后续真实请求暴露错误
  return { url: urls[0], fellBack: false, results };
}

/** 探测 HCAI 根节点列表，得到当前可用 root + v1 */
export async function resolveHcaiWorkingEndpoints(
  timeoutSecs = 6,
): Promise<HcaiResolvedEndpoints> {
  const primaryRoot = HCAI_ENDPOINT_ROOTS[0];
  const { url, fellBack, results } = await pickFirstReachableEndpoint(
    [...HCAI_ENDPOINT_ROOTS],
    timeoutSecs,
  );
  const root = toHcaiGatewayRoot(url) || primaryRoot;
  return {
    root,
    v1: `${root}/v1`,
    fellBack,
    primaryRoot,
    results,
  };
}

/**
 * 给定一组端点 URL（可能混有 /v1），若属于 HCAI 则按主→备顺序探测并返回应写入的 base。
 * 非 HCAI 列表原样返回 preferred。
 */
export async function resolveHcaiBaseAmongCandidates(
  candidates: string[],
  preferred: string,
  style: "root" | "v1" = "root",
): Promise<{ baseUrl: string; fellBack: boolean }> {
  const hcaiUrls = candidates.filter(isHcaiHost);
  if (hcaiUrls.length === 0 && !isHcaiHost(preferred)) {
    return { baseUrl: preferred, fellBack: false };
  }

  // 统一成 root 再探测（测速打网关首页即可）
  const roots = [
    ...new Set(
      [...hcaiUrls, preferred]
        .filter(isHcaiHost)
        .map(toHcaiGatewayRoot)
        .filter(Boolean),
    ),
  ];
  // 保证官方顺序：主站优先
  const official = HCAI_ENDPOINT_ROOTS as readonly string[];
  const ordered = [
    ...official.filter((r) => roots.includes(r)),
    ...roots.filter((r) => !official.includes(r)),
  ];

  const { url, fellBack } = await pickFirstReachableEndpoint(ordered);
  const root = toHcaiGatewayRoot(url);
  const baseUrl = style === "v1" ? `${root}/v1` : root;
  return { baseUrl, fellBack };
}

export { HCAI_ENDPOINT_ROOTS, HCAI_ENDPOINT_V1S };
