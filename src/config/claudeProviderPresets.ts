/**
 * 预设供应商配置模板
 */
import { ProviderCategory } from "../types";

export interface TemplateValueConfig {
  label: string;
  placeholder: string;
  defaultValue?: string;
  editorValue: string;
}

/**
 * 预设供应商的视觉主题配置
 */
export interface PresetTheme {
  /** 图标类型：'claude' | 'codex' | 'gemini' | 'generic' */
  icon?: "claude" | "codex" | "gemini" | "generic";
  /** 背景色（选中状态），支持 Tailwind 类名或 hex 颜色 */
  backgroundColor?: string;
  /** 文字色（选中状态），支持 Tailwind 类名或 hex 颜色 */
  textColor?: string;
}

export interface ProviderPreset {
  name: string;
  nameKey?: string; // i18n key for localized display name
  websiteUrl: string;
  // 新增：第三方/聚合等可单独配置获取 API Key 的链接
  apiKeyUrl?: string;
  settingsConfig: object;
  isOfficial?: boolean; // 标识是否为官方预设
  isPartner?: boolean; // 标识是否为商业合作伙伴
  primePartner?: boolean; // 置顶合作伙伴（顶级）：徽章显示为心形
  /** 强制排在预设列表最前（优先于官方与 primePartner 分区） */
  pinToTop?: boolean;
  partnerPromotionKey?: string; // 合作伙伴促销信息的 i18n key
  category?: ProviderCategory; // 新增：分类
  // 新增：指定该预设所使用的 API Key 字段名（默认 ANTHROPIC_AUTH_TOKEN）
  apiKeyField?: "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY";
  // 新增：模板变量定义，用于动态替换配置中的值
  templateValues?: Record<string, TemplateValueConfig>; // editorValue 存储编辑器中的实时输入值
  // 新增：请求地址候选列表（用于地址管理/测速）
  endpointCandidates?: string[];
  // 新增：视觉主题配置
  theme?: PresetTheme;
  // 图标配置
  icon?: string; // 图标名称
  iconColor?: string; // 图标颜色

  // Claude API 格式（仅 Claude 供应商使用）
  // - "anthropic" (默认): Anthropic Messages API 格式，直接透传
  // - "openai_chat": OpenAI Chat Completions 格式，需要格式转换
  // - "openai_responses": OpenAI Responses API 格式，需要格式转换
  // - "gemini_native": Gemini Native generateContent API 格式，需要格式转换
  apiFormat?:
    "anthropic" | "openai_chat" | "openai_responses" | "gemini_native";

  // 供应商类型标识（用于特殊供应商检测）
  // - "github_copilot": GitHub Copilot 供应商（需要 OAuth 认证）
  // - "codex_oauth": OpenAI Codex via ChatGPT Plus/Pro 反代（需要 OAuth 认证）
  providerType?: "github_copilot" | "codex_oauth";

  // 是否需要 OAuth 认证（而非 API Key）
  requiresOAuth?: boolean;

  // 是否在 UI 中隐藏该预设（预设仍存在，仅不在列表中显示）
  hidden?: boolean;

  // 获取模型列表使用的完整 URL（覆写自动候选逻辑）
  // 缺省时后端基于 baseURL 自动尝试 /v1/models、/models 以及剥离已知兼容子路径后的变体。
  modelsUrl?: string;
}

export const providerPresets: ProviderPreset[] = [
  {
    name: "HCAI",
    websiteUrl: "https://ai.hctopup.com/",
    apiKeyUrl: "https://ai.hctopup.com/keys",
    // 网关使用 x-api-key（ANTHROPIC_API_KEY），与 Bearer 二选一
    apiKeyField: "ANTHROPIC_API_KEY",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://ai.hctopup.com",
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_MODEL: "claude-opus-4-8",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5-20251001",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-8",
      },
    },
    category: "custom",
    endpointCandidates: [
      "https://ai.hctopup.com",
      "https://ai-us.hctopup.com",
      "https://ai-prod.hctopup.com",
    ], // 主站优先；添加时会自动探测并保存可用节点
    // Fable 等模型随 Key 分组变化，不在预设里写死；用户可在配置中自行添加
    icon: "hcai",
    iconColor: "#E53935",
  },

  {
    name: "Claude Official",
    websiteUrl: "https://www.anthropic.com/claude-code",
    settingsConfig: {
      env: {},
    },
    isOfficial: true, // 明确标识为官方预设
    category: "official",
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
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://ark.cn-beijing.volces.com/api/coding",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "ark-code-latest",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "ark-code-latest",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "ark-code-latest",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "ark-code-latest",
      },
    },
    category: "cn_official",
    isPartner: true,
    partnerPromotionKey: "volcengine_agentplan",
    icon: "huoshan",
    iconColor: "#3370FF",
  },

  {
    name: "BytePlus",
    websiteUrl:
      "https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    apiKeyUrl:
      "https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL:
          "https://ark.ap-southeast.bytepluses.com/api/coding",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "ark-code-latest",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "ark-code-latest",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "ark-code-latest",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "ark-code-latest",
      },
    },
    category: "cn_official",
    isPartner: true,
    partnerPromotionKey: "byteplus",
    icon: "byteplus",
    iconColor: "#3370FF",
  },

  {
    name: "DouBaoSeed",
    websiteUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D&utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    apiKeyUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D&utm_campaign=hw&utm_content=ccswitch&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=ccswitch",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://ark.cn-beijing.volces.com/api/compatible",
        ANTHROPIC_AUTH_TOKEN: "",
        API_TIMEOUT_MS: "3000000",
        ANTHROPIC_MODEL: "doubao-seed-2-1-pro-260628",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "doubao-seed-2-1-pro-260628",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "doubao-seed-2-1-pro-260628",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "doubao-seed-2-1-pro-260628",
      },
    },
    category: "cn_official",
    isPartner: true,
    partnerPromotionKey: "doubaoseed",
    icon: "doubao",
    iconColor: "#3370FF",
  },

  {
    name: "DeepSeek",
    websiteUrl: "https://platform.deepseek.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "deepseek-v4-pro",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro",
      },
    },
    category: "cn_official",
    // Anthropic 兼容层挂在 /anthropic 子路径；/models 是根上独立端点
    modelsUrl: "https://api.deepseek.com/models",
    icon: "deepseek",
    iconColor: "#1E88E5",
  },

  {
    name: "Zhipu GLM",
    websiteUrl: "https://open.bigmodel.cn",
    apiKeyUrl: "https://www.bigmodel.cn/claude-code?ic=RRVJPB5SII",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "glm-5.1",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-5.1",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5.1",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.1",
      },
    },
    category: "cn_official",
    icon: "zhipu",
    iconColor: "#0F62FE",
  },

  {
    name: "Zhipu GLM en",
    websiteUrl: "https://z.ai",
    apiKeyUrl: "https://z.ai/subscribe?ic=8JVLJQFSKB",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "glm-5.1",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-5.1",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5.1",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.1",
      },
    },
    category: "cn_official",
    icon: "zhipu",
    iconColor: "#0F62FE",
  },

  {
    name: "Baidu Qianfan Coding Plan",
    websiteUrl: "https://cloud.baidu.com/product/qianfan_modelbuilder",
    apiKeyUrl:
      "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://qianfan.baidubce.com/anthropic/coding",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "qianfan-code-latest",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "qianfan-code-latest",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "qianfan-code-latest",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "qianfan-code-latest",
      },
    },
    category: "cn_official",
    endpointCandidates: ["https://qianfan.baidubce.com/anthropic/coding"],
    icon: "baidu",
    iconColor: "#2932E1",
  },

  {
    name: "Bailian",
    websiteUrl: "https://bailian.console.aliyun.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://dashscope.aliyuncs.com/apps/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "cn_official",
    icon: "bailian",
    iconColor: "#624AFF",
  },

  {
    name: "Bailian For Coding",
    websiteUrl: "https://bailian.console.aliyun.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL:
          "https://coding.dashscope.aliyuncs.com/apps/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "cn_official",
    icon: "bailian",
    iconColor: "#624AFF",
  },

  {
    name: "Kimi",
    primePartner: true,
    websiteUrl: "https://platform.kimi.com?aff=cc-switch",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.moonshot.cn/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "kimi-k2.7-code",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "kimi-k2.7-code",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "kimi-k2.7-code",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "kimi-k2.7-code",
      },
    },
    category: "cn_official",
    icon: "kimi",
    iconColor: "#6366F1",
  },

  {
    name: "Kimi For Coding",
    primePartner: true,
    websiteUrl: "https://www.kimi.com/code/?aff=cc-switch",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
        ANTHROPIC_AUTH_TOKEN: "",
        // CLAUDE_CODE_MAX_CONTEXT_TOKENS 只对非 claude- 前缀模型 id 生效，
        // 必须显式路由端点别名 kimi-for-coding（与 codex/hermes/opencode 预设一致）
        ANTHROPIC_MODEL: "kimi-for-coding",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "kimi-for-coding",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "kimi-for-coding",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "kimi-for-coding",
        // 双键钉 256K：压缩窗口=min(模型窗口,值)，与窗口同值时行为等价于不设，
        // 但显式钉住可屏蔽远程实验下发的更小压缩点；调整直接改 JSON，不出表单字段
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: "262144",
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: "262144",
      },
    },
    category: "cn_official",
    icon: "kimi",
    iconColor: "#6366F1",
  },

  {
    name: "StepFun",
    websiteUrl: "https://platform.stepfun.com/step-plan",
    apiKeyUrl: "https://platform.stepfun.com/interface-key",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.stepfun.com/step_plan",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "step-3.5-flash-2603",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "step-3.5-flash-2603",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "step-3.5-flash-2603",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "step-3.5-flash-2603",
      },
    },
    category: "cn_official",
    endpointCandidates: ["https://api.stepfun.com/step_plan"],
    icon: "stepfun",
    iconColor: "#16D6D2",
  },

  {
    name: "StepFun en",
    websiteUrl: "https://platform.stepfun.ai/step-plan",
    apiKeyUrl: "https://platform.stepfun.ai/interface-key",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.stepfun.ai/step_plan",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "step-3.5-flash-2603",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "step-3.5-flash-2603",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "step-3.5-flash-2603",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "step-3.5-flash-2603",
      },
    },
    category: "cn_official",
    endpointCandidates: ["https://api.stepfun.ai/step_plan"],
    icon: "stepfun",
    iconColor: "#16D6D2",
  },

  {
    name: "KAT-Coder",
    websiteUrl: "https://console.streamlake.ai",
    apiKeyUrl: "https://console.streamlake.ai/console/api-key",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL:
          "https://vanchin.streamlake.ai/api/gateway/v1/endpoints/${ENDPOINT_ID}/claude-code-proxy",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "KAT-Coder-Pro V1",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "KAT-Coder-Air V1",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "KAT-Coder-Pro V1",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "KAT-Coder-Pro V1",
      },
    },
    category: "cn_official",
    templateValues: {
      ENDPOINT_ID: {
        label: "Vanchin Endpoint ID",
        placeholder: "ep-xxx-xxx",
        defaultValue: "",
        editorValue: "",
      },
    },
    icon: "catcoder",
  },

  {
    name: "Longcat",
    websiteUrl: "https://longcat.chat/platform",
    apiKeyUrl: "https://longcat.chat/platform/api_keys",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.longcat.chat/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "LongCat-2.0",
        ANTHROPIC_SMALL_FAST_MODEL: "LongCat-2.0",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "LongCat-2.0",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "LongCat-2.0",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "LongCat-2.0",
        CLAUDE_CODE_MAX_OUTPUT_TOKENS: "131072",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
      },
    },
    category: "cn_official",
    icon: "longcat",
    iconColor: "#29E154",
  },

  {
    name: "MiniMax",
    websiteUrl: "https://platform.minimaxi.com",
    apiKeyUrl: "https://platform.minimaxi.com/subscribe/coding-plan",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.minimaxi.com/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        API_TIMEOUT_MS: "3000000",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
        ANTHROPIC_MODEL: "MiniMax-M2.7",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "MiniMax-M2.7",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "MiniMax-M2.7",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "MiniMax-M2.7",
      },
    },
    category: "cn_official",
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
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.minimax.io/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        API_TIMEOUT_MS: "3000000",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
        ANTHROPIC_MODEL: "MiniMax-M2.7",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "MiniMax-M2.7",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "MiniMax-M2.7",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "MiniMax-M2.7",
      },
    },
    category: "cn_official",
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
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.tbox.cn/api/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "Ling-2.5-1T",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "Ling-2.5-1T",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "Ling-2.5-1T",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "Ling-2.5-1T",
      },
    },
    category: "cn_official",
  },

  {
    name: "Xiaomi MiMo",
    websiteUrl: "https://platform.xiaomimimo.com",
    apiKeyUrl: "https://platform.xiaomimimo.com/#/console/api-keys",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.xiaomimimo.com/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "mimo-v2.5-pro",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "mimo-v2.5-pro",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "mimo-v2.5-pro",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "mimo-v2.5-pro",
      },
    },
    category: "cn_official",
    icon: "xiaomimimo",
    iconColor: "#000000",
  },

  {
    name: "Xiaomi MiMo Token Plan (China)",
    websiteUrl: "https://platform.xiaomimimo.com/#/token-plan",
    apiKeyUrl: "https://platform.xiaomimimo.com/#/console/plan-manage",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://token-plan-cn.xiaomimimo.com/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "mimo-v2.5-pro",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "mimo-v2.5-pro",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "mimo-v2.5-pro",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "mimo-v2.5-pro",
      },
    },
    category: "cn_official",
    icon: "xiaomimimo",
    iconColor: "#000000",
  },

  {
    name: "AWS Bedrock (AKSK)",
    websiteUrl: "https://aws.amazon.com/bedrock/",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL:
          "https://bedrock-runtime.${AWS_REGION}.amazonaws.com",
        AWS_ACCESS_KEY_ID: "${AWS_ACCESS_KEY_ID}",
        AWS_SECRET_ACCESS_KEY: "${AWS_SECRET_ACCESS_KEY}",
        AWS_REGION: "${AWS_REGION}",
        ANTHROPIC_MODEL: "global.anthropic.claude-opus-4-8",
        ANTHROPIC_DEFAULT_HAIKU_MODEL:
          "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "global.anthropic.claude-sonnet-5",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "global.anthropic.claude-opus-4-8",
        CLAUDE_CODE_USE_BEDROCK: "1",
      },
    },
    category: "cloud_provider",
    templateValues: {
      AWS_REGION: {
        label: "AWS Region",
        placeholder: "us-west-2",
        editorValue: "us-west-2",
      },
      AWS_ACCESS_KEY_ID: {
        label: "Access Key ID",
        placeholder: "AKIA...",
        editorValue: "",
      },
      AWS_SECRET_ACCESS_KEY: {
        label: "Secret Access Key",
        placeholder: "your-secret-key",
        editorValue: "",
      },
    },
    icon: "aws",
    iconColor: "#FF9900",
  },

  {
    name: "AWS Bedrock (API Key)",
    websiteUrl: "https://aws.amazon.com/bedrock/",
    settingsConfig: {
      apiKey: "",
      env: {
        ANTHROPIC_BASE_URL:
          "https://bedrock-runtime.${AWS_REGION}.amazonaws.com",
        AWS_REGION: "${AWS_REGION}",
        ANTHROPIC_MODEL: "global.anthropic.claude-opus-4-8",
        ANTHROPIC_DEFAULT_HAIKU_MODEL:
          "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "global.anthropic.claude-sonnet-5",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "global.anthropic.claude-opus-4-8",
        CLAUDE_CODE_USE_BEDROCK: "1",
      },
    },
    category: "cloud_provider",
    templateValues: {
      AWS_REGION: {
        label: "AWS Region",
        placeholder: "us-west-2",
        editorValue: "us-west-2",
      },
    },
    icon: "aws",
    iconColor: "#FF9900",
  },
];
