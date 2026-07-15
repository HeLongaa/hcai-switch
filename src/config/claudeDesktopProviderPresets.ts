/**
 * Claude Desktop 预设供应商配置模板
 *
 * 形态与 Claude Code 预设不同：
 * - baseUrl 是顶级字段，而不是 settingsConfig.env.ANTHROPIC_BASE_URL
 * - 模型信息以"Desktop 可见模型 ID → 上游模型"表达，
 *   对应后端 ClaudeDesktopModelRoute 的 routeId / model
 *
 * 翻译来源：src/config/claudeProviderPresets.ts（排除 OAuth 与不兼容预设）
 */
import { ProviderCategory } from "../types";
import type { PresetTheme } from "./claudeProviderPresets";

export type ClaudeDesktopApiFormat =
  | "anthropic"
  | "openai_chat"
  | "openai_responses"
  | "gemini_native";

export interface ClaudeDesktopRoutePreset {
  routeId: string;
  upstreamModel: string;
  labelOverride?: string;
  supports1m: boolean;
}

/**
 * Claude Desktop 3P fail-all 校验接受的角色名。Desktop 1.12603.1+ 起白名单
 * 纳入 fable（app.asar 内 ["sonnet","opus","haiku","fable","mythos"]，实测
 * 2026-06-13）；此前 1.6259.1 仅接受 sonnet/opus/haiku。mythos 官方未公开
 * 发布，暂不暴露给用户。所有预设工厂、表单角色下拉、后端
 * `next_catalog_safe_route_id` 都从此映射派生 routeId，避免散落硬编码。
 */
export const CLAUDE_DESKTOP_ROLE_ROUTE_IDS = {
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-4-8",
  fable: "claude-fable-5",
  haiku: "claude-haiku-4-5",
} as const;

export type ClaudeDesktopRoleId = keyof typeof CLAUDE_DESKTOP_ROLE_ROUTE_IDS;

export interface ClaudeDesktopProviderPreset {
  name: string;
  nameKey?: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  category?: ProviderCategory;
  isPartner?: boolean;
  primePartner?: boolean; // 置顶合作伙伴（顶级）：徽章显示为心形
  /** 强制排在预设列表最前（优先于官方与 primePartner 分区） */
  pinToTop?: boolean;
  partnerPromotionKey?: string;

  baseUrl: string;
  apiKeyField?: "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY";

  mode: "direct" | "proxy";
  apiFormat?: ClaudeDesktopApiFormat;
  modelRoutes?: ClaudeDesktopRoutePreset[];
  providerType?: "github_copilot" | "codex_oauth";
  requiresOAuth?: boolean;

  endpointCandidates?: string[];
  theme?: PresetTheme;
  icon?: string;
  iconColor?: string;
}

const passthroughRoutes = (supports1m = false): ClaudeDesktopRoutePreset[] => [
  {
    routeId: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.sonnet,
    upstreamModel: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.sonnet,
    supports1m,
  },
  {
    routeId: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.opus,
    upstreamModel: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.opus,
    supports1m,
  },
  {
    routeId: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.haiku,
    upstreamModel: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.haiku,
    supports1m,
  },
];

/**
 * 非 Claude 上游模型用此工厂：route ID 使用 Claude Desktop 能通过校验的
 * Sonnet/Opus/Haiku 路由，真实品牌名只写入 labelOverride 和 upstreamModel。
 */
const brandedRoutes = (
  sonnet: string,
  opus: string,
  haiku: string,
  supports1m = false,
): ClaudeDesktopRoutePreset[] => {
  const seenUpstream = new Set<string>();
  return [
    { routeId: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.sonnet, upstreamModel: sonnet },
    { routeId: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.opus, upstreamModel: opus },
    { routeId: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.haiku, upstreamModel: haiku },
  ]
    .map(({ routeId, upstreamModel }) => ({
      routeId,
      upstreamModel,
      labelOverride: upstreamModel,
      supports1m,
    }))
    .filter((route) => {
      if (seenUpstream.has(route.upstreamModel)) {
        return false;
      }
      seenUpstream.add(route.upstreamModel);
      return true;
    });
};

export const claudeDesktopProviderPresets: ClaudeDesktopProviderPreset[] = [
  {
    name: "HCAI",
    websiteUrl: "https://ai.hctopup.com/",
    apiKeyUrl: "https://ai.hctopup.com/keys",
    category: "custom",
    baseUrl: "https://ai.hctopup.com",
    apiKeyField: "ANTHROPIC_API_KEY",
    mode: "proxy",
    apiFormat: "anthropic",
    // Fable 是否可用取决于 Key 分组；route 预留官方 fable 角色，上游可按实际模型名改
    modelRoutes: [
      ...brandedRoutes(
        "claude-sonnet-4-6",
        "claude-opus-4-8",
        "claude-haiku-4-5-20251001",
      ),
      {
        routeId: CLAUDE_DESKTOP_ROLE_ROUTE_IDS.fable,
        upstreamModel: "claude-fable-5",
        labelOverride: "claude-fable-5",
        supports1m: false,
      },
    ],
    endpointCandidates: [
      "https://ai.hctopup.com",
      "https://ai-us.hctopup.com",
      "https://ai-prod.hctopup.com",
    ],
    icon: "hcai",
    iconColor: "#E53935",
  },

  {
    name: "Claude Desktop Official",
    websiteUrl: "https://claude.ai/download",
    category: "official",
    baseUrl: "",
    mode: "direct",
    apiFormat: "anthropic",
    theme: {
      icon: "claude",
      backgroundColor: "#D97757",
      textColor: "#FFFFFF",
    },
    icon: "anthropic",
    iconColor: "#D4915D",
  },

  {
    name: "火山Agentplan",
    websiteUrl:
      "https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=6J6FV5N2&utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    apiKeyUrl:
      "https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=6J6FV5N2&utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    category: "cn_official",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "ark-code-latest",
      "ark-code-latest",
      "ark-code-latest",
    ),
    icon: "huoshan",
    iconColor: "#3370FF",
    isPartner: true,
    partnerPromotionKey: "volcengine_agentplan",
  },

  {
    name: "BytePlus",
    websiteUrl:
      "https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    apiKeyUrl:
      "https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    category: "cn_official",
    baseUrl: "https://ark.ap-southeast.bytepluses.com/api/coding",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "ark-code-latest",
      "ark-code-latest",
      "ark-code-latest",
    ),
    icon: "byteplus",
    iconColor: "#3370FF",
    isPartner: true,
    partnerPromotionKey: "byteplus",
  },

  {
    name: "DouBaoSeed",
    websiteUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D&utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    apiKeyUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D&utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    category: "cn_official",
    baseUrl: "https://ark.cn-beijing.volces.com/api/compatible",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "doubao-seed-2-1-pro-260628",
      "doubao-seed-2-1-pro-260628",
      "doubao-seed-2-1-pro-260628",
    ),
    isPartner: true,
    partnerPromotionKey: "doubaoseed",
    icon: "doubao",
    iconColor: "#3370FF",
  },

  {
    name: "DeepSeek",
    websiteUrl: "https://platform.deepseek.com",
    category: "cn_official",
    baseUrl: "https://api.deepseek.com/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "deepseek-v4-pro",
      "deepseek-v4-pro",
      "deepseek-v4-flash",
    ),
    icon: "deepseek",
    iconColor: "#1E88E5",
  },

  {
    name: "Zhipu GLM",
    websiteUrl: "https://open.bigmodel.cn",
    apiKeyUrl: "https://www.bigmodel.cn/claude-code?ic=RRVJPB5SII",
    category: "cn_official",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes("glm-5.1", "glm-5.1", "glm-5.1"),
    icon: "zhipu",
    iconColor: "#0F62FE",
  },

  {
    name: "Zhipu GLM en",
    websiteUrl: "https://z.ai",
    apiKeyUrl: "https://z.ai/subscribe?ic=8JVLJQFSKB",
    category: "cn_official",
    baseUrl: "https://api.z.ai/api/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes("glm-5.1", "glm-5.1", "glm-5.1"),
    icon: "zhipu",
    iconColor: "#0F62FE",
  },

  {
    name: "Baidu Qianfan Coding Plan",
    websiteUrl: "https://cloud.baidu.com/product/qianfan_modelbuilder",
    apiKeyUrl:
      "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application",
    category: "cn_official",
    baseUrl: "https://qianfan.baidubce.com/anthropic/coding",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "qianfan-code-latest",
      "qianfan-code-latest",
      "qianfan-code-latest",
    ),
    endpointCandidates: ["https://qianfan.baidubce.com/anthropic/coding"],
    icon: "baidu",
    iconColor: "#2932E1",
  },

  {
    name: "Bailian",
    websiteUrl: "https://bailian.console.aliyun.com",
    category: "cn_official",
    baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: passthroughRoutes(),
    icon: "bailian",
    iconColor: "#624AFF",
  },

  {
    name: "Bailian For Coding",
    websiteUrl: "https://bailian.console.aliyun.com",
    category: "cn_official",
    baseUrl: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: passthroughRoutes(),
    icon: "bailian",
    iconColor: "#624AFF",
  },

  {
    name: "Kimi",
    primePartner: true,
    websiteUrl: "https://platform.kimi.com?aff=cc-switch",
    category: "cn_official",
    baseUrl: "https://api.moonshot.cn/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "kimi-k2.7-code",
      "kimi-k2.7-code",
      "kimi-k2.7-code",
    ),
    icon: "kimi",
    iconColor: "#6366F1",
  },

  {
    name: "Kimi For Coding",
    primePartner: true,
    websiteUrl: "https://www.kimi.com/code/?aff=cc-switch",
    category: "cn_official",
    baseUrl: "https://api.kimi.com/coding/",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: passthroughRoutes(),
    icon: "kimi",
    iconColor: "#6366F1",
  },

  {
    name: "StepFun",
    websiteUrl: "https://platform.stepfun.com/step-plan",
    apiKeyUrl: "https://platform.stepfun.com/interface-key",
    category: "cn_official",
    baseUrl: "https://api.stepfun.com/step_plan",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "step-3.5-flash-2603",
      "step-3.5-flash-2603",
      "step-3.5-flash-2603",
    ),
    endpointCandidates: ["https://api.stepfun.com/step_plan"],
    icon: "stepfun",
    iconColor: "#16D6D2",
  },

  {
    name: "StepFun en",
    websiteUrl: "https://platform.stepfun.ai/step-plan",
    apiKeyUrl: "https://platform.stepfun.ai/interface-key",
    category: "cn_official",
    baseUrl: "https://api.stepfun.ai/step_plan",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "step-3.5-flash-2603",
      "step-3.5-flash-2603",
      "step-3.5-flash-2603",
    ),
    endpointCandidates: ["https://api.stepfun.ai/step_plan"],
    icon: "stepfun",
    iconColor: "#16D6D2",
  },

  {
    name: "Longcat",
    websiteUrl: "https://longcat.chat/platform",
    apiKeyUrl: "https://longcat.chat/platform/api_keys",
    category: "cn_official",
    baseUrl: "https://api.longcat.chat/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes("LongCat-2.0", "LongCat-2.0", "LongCat-2.0"),
    icon: "longcat",
    iconColor: "#29E154",
  },

  {
    name: "MiniMax",
    websiteUrl: "https://platform.minimaxi.com",
    apiKeyUrl: "https://platform.minimaxi.com/subscribe/coding-plan",
    category: "cn_official",
    baseUrl: "https://api.minimaxi.com/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes("MiniMax-M2.7", "MiniMax-M2.7", "MiniMax-M2.7"),
    partnerPromotionKey: "minimax_cn",
    theme: {
      backgroundColor: "#f64551",
      textColor: "#FFFFFF",
    },
    icon: "minimax",
    iconColor: "#FF6B6B",
  },

  {
    name: "MiniMax en",
    websiteUrl: "https://platform.minimax.io",
    apiKeyUrl: "https://platform.minimax.io/subscribe/coding-plan",
    category: "cn_official",
    baseUrl: "https://api.minimax.io/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes("MiniMax-M2.7", "MiniMax-M2.7", "MiniMax-M2.7"),
    partnerPromotionKey: "minimax_en",
    theme: {
      backgroundColor: "#f64551",
      textColor: "#FFFFFF",
    },
    icon: "minimax",
    iconColor: "#FF6B6B",
  },

  {
    name: "BaiLing",
    websiteUrl: "https://alipaytbox.yuque.com/sxs0ba/ling/get_started",
    category: "cn_official",
    baseUrl: "https://api.tbox.cn/api/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes("Ling-2.5-1T", "Ling-2.5-1T", "Ling-2.5-1T"),
  },

  {
    name: "Xiaomi MiMo",
    websiteUrl: "https://platform.xiaomimimo.com",
    apiKeyUrl: "https://platform.xiaomimimo.com/#/console/api-keys",
    category: "cn_official",
    baseUrl: "https://api.xiaomimimo.com/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "mimo-v2.5-pro",
      "mimo-v2.5-pro",
      "mimo-v2.5-pro",
    ),
    icon: "xiaomimimo",
    iconColor: "#000000",
  },

  {
    name: "Xiaomi MiMo Token Plan (China)",
    websiteUrl: "https://platform.xiaomimimo.com/#/token-plan",
    apiKeyUrl: "https://platform.xiaomimimo.com/#/console/plan-manage",
    category: "cn_official",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
    mode: "proxy",
    apiFormat: "anthropic",
    modelRoutes: brandedRoutes(
      "mimo-v2.5-pro",
      "mimo-v2.5-pro",
      "mimo-v2.5-pro",
    ),
    icon: "xiaomimimo",
    iconColor: "#000000",
  },
];
