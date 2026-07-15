/**
 * Grok Build CLI 预设供应商
 *
 * Live 双文件：~/.grok/auth.json + ~/.grok/config.toml
 * settingsConfig 形状：{ auth: object, config: string (TOML), apiKey?: string }
 *
 * BYOK 正确形态（default 必须是 [model.xxx] 的表名，密钥写 api_key 而非 env_key）：
 * ```toml
 * [models]
 * default = "custom"
 *
 * [model.custom]
 * model = "grok-4.5"
 * base_url = "https://..."
 * name = "Custom"
 * api_key = "sk-..."
 * api_backend = "responses"
 * ```
 */
import type { ProviderCategory } from "../types";
import type { PresetTheme } from "./claudeProviderPresets";

export interface GrokProviderPreset {
  name: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  /** { auth, config } */
  settingsConfig: {
    auth: Record<string, unknown>;
    config: string;
  };
  isOfficial?: boolean;
  isPartner?: boolean;
  partnerPromotionKey?: string;
  category?: ProviderCategory;
  icon?: string;
  iconColor?: string;
  theme?: PresetTheme;
  /** BYOK template: fill api key via form → api_key in config */
  isByokTemplate?: boolean;
  /** 端点测速候选（与 Claude/Codex 一致） */
  endpointCandidates?: string[];
}

/** Official default model id used by Grok Build coding agent (OIDC) */
export const GROK_DEFAULT_MODEL = "grok-build";
export const GROK_OFFICIAL_BASE = "https://api.x.ai/v1";
/** BYOK / 自定义中转默认表名（须与 [model.custom] 一致） */
export const GROK_BYOK_MODEL_KEY = "custom";
export const GROK_BYOK_MODEL_ID = "grok-4.5";

/** Minimal official-style config when live is empty (OIDC / subscription) */
export function defaultGrokConfigToml(
  defaultModel = GROK_DEFAULT_MODEL,
): string {
  return `[models]
default = ${JSON.stringify(defaultModel)}

[cli]
installer = "internal"
`;
}

/**
 * BYOK / 中转 config.toml。
 * `key` 是 [model.<key>] 表名，也是 [models].default 的值（不是上游 model id）。
 */
export function byokGrokConfigToml(opts: {
  key?: string;
  modelId?: string;
  baseUrl: string;
  name?: string;
  apiKey?: string;
  apiBackend?: string;
}): string {
  const tableKey = opts.key?.trim() || GROK_BYOK_MODEL_KEY;
  const modelId = opts.modelId?.trim() || GROK_BYOK_MODEL_ID;
  const displayName = opts.name?.trim() || "Custom";
  const backend = opts.apiBackend ?? "responses";
  const baseUrl = opts.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = opts.apiKey?.trim() ?? "";

  const lines = [
    "[models]",
    `default = ${JSON.stringify(tableKey)}`,
    "",
    "[cli]",
    'installer = "internal"',
    "",
    "",
    `[model.${tableKey}]`,
    `model = ${JSON.stringify(modelId)}`,
    // 自定义时可为空，与其它应用「端点不预填」一致
    `base_url = ${JSON.stringify(baseUrl)}`,
    `name = ${JSON.stringify(displayName)}`,
  ];
  if (apiKey) {
    lines.push(`api_key = ${JSON.stringify(apiKey)}`);
  }
  lines.push(`api_backend = ${JSON.stringify(backend)}`, "");
  return lines.join("\n");
}

/** 从 Grok config.toml 提取首个 base_url */
export function extractGrokBaseUrl(
  configToml: string | undefined | null,
): string | undefined {
  if (!configToml) return undefined;
  const m =
    configToml.match(/^\s*base_url\s*=\s*"([^"]*)"/m) ||
    configToml.match(/^\s*base_url\s*=\s*'([^']*)'/m);
  const url = m?.[1]?.trim();
  return url || undefined;
}

/** 从 config 提取 api_key 字段（若有） */
export function extractGrokApiKeyFromToml(
  configToml: string | undefined | null,
): string | undefined {
  if (!configToml) return undefined;
  const m =
    configToml.match(/^\s*api_key\s*=\s*"([^"]*)"/m) ||
    configToml.match(/^\s*api_key\s*=\s*'([^']*)'/m);
  const key = m?.[1]?.trim();
  return key || undefined;
}

/** 提取 [model.xxx] 中第一个表名 xxx */
export function extractGrokFirstModelTableKey(
  configToml: string | undefined | null,
): string | undefined {
  if (!configToml) return undefined;
  const m = configToml.match(/^\[model\.([^\]]+)\]/m);
  return m?.[1]?.trim() || undefined;
}

/**
 * 确保 [models].default 指向已有 [model.xxx] 表名。
 * 避免 default = "grok-4.5" / "grok-build" 却只有 [model.custom] 导致走官方登录。
 */
export function ensureGrokDefaultModelKey(configToml: string): string {
  const tableKey =
    extractGrokFirstModelTableKey(configToml) || GROK_BYOK_MODEL_KEY;
  if (/^\s*\[models\]/m.test(configToml)) {
    if (/^\s*default\s*=/m.test(configToml)) {
      return configToml.replace(
        /^\s*default\s*=\s*(?:"[^"]*"|'[^']*'|[^\s#]+)/m,
        `default = ${JSON.stringify(tableKey)}`,
      );
    }
    return configToml.replace(
      /^(\s*\[models\]\s*\n)/m,
      `$1default = ${JSON.stringify(tableKey)}\n`,
    );
  }
  return `[models]\ndefault = ${JSON.stringify(tableKey)}\n\n${configToml.trimStart()}`;
}

/** 写入/更新所有 [model.*] 的 api_key，并去掉 env_key（改用明文 api_key） */
export function setGrokApiKeyInToml(
  configToml: string,
  apiKey: string,
): string {
  const key = apiKey.trim();
  let text = configToml || "";

  // 若还没有 model 段，生成完整 BYOK 骨架
  if (!/^\[model\./m.test(text)) {
    return byokGrokConfigToml({
      key: GROK_BYOK_MODEL_KEY,
      modelId: GROK_BYOK_MODEL_ID,
      baseUrl: extractGrokBaseUrl(text) || GROK_OFFICIAL_BASE,
      name: "Custom",
      apiKey: key,
    });
  }

  // 去掉 env_key 行（密钥应写在 api_key）
  text = text.replace(/^\s*env_key\s*=\s*.*\n?/gm, "");

  if (key) {
    if (/^\s*api_key\s*=/m.test(text)) {
      text = text.replace(
        /^\s*api_key\s*=\s*(?:"[^"]*"|'[^']*')/gm,
        `api_key = ${JSON.stringify(key)}`,
      );
    } else {
      // 紧跟每条 base_url 写入 api_key
      text = text.replace(
        /^(\s*base_url\s*=\s*(?:"[^"]*"|'[^']*')\s*)$/gm,
        `$1\napi_key = ${JSON.stringify(key)}`,
      );
      if (!/^\s*api_key\s*=/m.test(text)) {
        text = text.replace(
          /^(\[model\.[^\]]+\])/gm,
          `$1\napi_key = ${JSON.stringify(key)}`,
        );
      }
    }
  } else {
    text = text.replace(/^\s*api_key\s*=\s*.*\n?/gm, "");
  }

  text = text.replace(/\n{3,}/g, "\n\n");
  return ensureGrokDefaultModelKey(text);
}

/**
 * 更新 base_url；无 model 段时生成 [model.custom] 且 default=custom。
 * 可选同步 api_key。
 */
export function setGrokBaseUrl(
  configToml: string,
  url: string,
  apiKey?: string,
): string {
  const normalized = url.trim().replace(/\/+$/, "");
  if (!normalized) return configToml;
  const quoted = JSON.stringify(normalized);
  let text = configToml || "";

  if (/^\s*base_url\s*=/m.test(text)) {
    text = text.replace(
      /^\s*base_url\s*=\s*(?:"[^"]*"|'[^']*')/gm,
      `base_url = ${quoted}`,
    );
    text = ensureGrokDefaultModelKey(text);
    if (apiKey !== undefined) {
      text = setGrokApiKeyInToml(text, apiKey);
    }
    return text;
  }

  // 无 base_url：生成完整 BYOK 块
  return byokGrokConfigToml({
    key: GROK_BYOK_MODEL_KEY,
    modelId: GROK_BYOK_MODEL_ID,
    baseUrl: normalized,
    name: "Custom",
    apiKey: apiKey?.trim() || extractGrokApiKeyFromToml(text) || "",
  });
}

export const grokProviderPresets: GrokProviderPreset[] = [
  {
    name: "HCAI",
    websiteUrl: "https://ai.hctopup.com/",
    apiKeyUrl: "https://ai.hctopup.com/keys",
    category: "custom",
    icon: "hcai",
    iconColor: "#E53935",
    isByokTemplate: true,
    // 与 Codex HCAI 预设端点一致（OpenAI 兼容 /v1）
    endpointCandidates: [
      "https://ai.hctopup.com/v1",
      "https://ai-us.hctopup.com/v1",
      "https://ai-prod.hctopup.com/v1",
    ],
    settingsConfig: {
      auth: {},
      config: byokGrokConfigToml({
        key: GROK_BYOK_MODEL_KEY,
        modelId: GROK_BYOK_MODEL_ID,
        baseUrl: "https://ai.hctopup.com/v1",
        name: "HCAI",
        apiBackend: "responses",
      }),
    },
  },
  {
    name: "Xai Official",
    websiteUrl: "https://grok.com/",
    isOfficial: true,
    category: "official",
    icon: "grok",
    iconColor: "#000000",
    settingsConfig: {
      auth: {},
      // Live import will replace; this is fallback skeleton
      config: defaultGrokConfigToml(),
    },
  },
  {
    name: "Grok API Key",
    websiteUrl: "https://console.x.ai/",
    apiKeyUrl: "https://console.x.ai/team/default/api-keys",
    category: "custom",
    icon: "xai",
    iconColor: "#000000",
    isByokTemplate: true,
    endpointCandidates: [GROK_OFFICIAL_BASE],
    settingsConfig: {
      auth: {},
      config: byokGrokConfigToml({
        key: GROK_BYOK_MODEL_KEY,
        modelId: GROK_BYOK_MODEL_ID,
        baseUrl: GROK_OFFICIAL_BASE,
        name: "Custom",
        apiBackend: "responses",
      }),
    },
  },
];
