import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import {
  generateThirdPartyAuth,
  generateThirdPartyConfig,
} from "@/config/codexProviderPresets";
import { CLAUDE_DESKTOP_ROLE_ROUTE_IDS } from "@/config/claudeDesktopProviderPresets";
import { generateUUID } from "@/utils/uuid";
import {
  byokGrokConfigToml,
  GROK_BYOK_MODEL_KEY,
} from "@/config/grokProviderPresets";
import {
  HCAI_BASE_URL,
  HCAI_BASE_URL_V1,
  HCAI_ENDPOINT_ROOTS,
  HCAI_ENDPOINT_V1S,
  HCAI_ICON,
  HCAI_ICON_COLOR,
  HCAI_WEBSITE,
  isFableModel,
  pickModelByHint,
  toHcaiGatewayRoot,
  type HcaiLinkedApp,
  type HcaiLinkedProvider,
} from "./types";
import { createHcaiUsageScript } from "./usageScript";

export interface HcaiWriteSelection {
  displayName: string;
  apiKey: string;
  /**
   * 已探测到的可用网关根（如 https://ai-us.hctopup.com）。
   * 未传则使用主站；主站不可达时应由调用方先 resolve 再传入。
   */
  baseUrlRoot?: string;
  // Claude Code
  enableClaudeCode: boolean;
  claudeModel?: string;
  claudeSonnet?: string;
  claudeOpus?: string;
  claudeFable?: string;
  claudeHaiku?: string;
  // Claude Desktop
  enableClaudeDesktop: boolean;
  desktopSonnet?: string;
  desktopOpus?: string;
  desktopFable?: string;
  desktopHaiku?: string;
  // Codex
  enableCodex: boolean;
  codexModel?: string;
  // OpenCode
  enableOpencode: boolean;
  opencodeClaudeModels: string[];
  opencodeCodexModels: string[];
  // Grok Build
  enableGrok: boolean;
  grokModel?: string;
}

export interface BuiltHcaiProvider {
  link: HcaiLinkedProvider;
  payload: Omit<Provider, "id"> & {
    providerKey?: string;
    addToLive?: boolean;
  };
  appId: AppId;
}

function endpointMeta(urls: string[]) {
  const now = Date.now();
  const custom_endpoints: Record<string, { url: string; addedAt: number }> = {};
  for (const url of urls) {
    const normalized = url.trim().replace(/\/+$/, "");
    if (!normalized) continue;
    custom_endpoints[normalized] = { url: normalized, addedAt: now };
  }
  return custom_endpoints;
}

/** 根节点候选：可用节点置顶，其余官方备用紧随其后 */
function rootCandidates(selectedRoot: string): string[] {
  const selected = toHcaiGatewayRoot(selectedRoot) || HCAI_BASE_URL;
  const rest = HCAI_ENDPOINT_ROOTS.filter((r) => r !== selected);
  return [selected, ...rest];
}

function v1Candidates(selectedRoot: string): string[] {
  return rootCandidates(selectedRoot).map((r) => `${r}/v1`);
}

/** 每个经 HCAI 写入的供应商默认开启用量查询（HCAI 模板） */
function withHcaiUsageMeta(
  gatewayRoot: string,
  meta?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(meta ?? {}),
    usage_script: createHcaiUsageScript({
      // 用量接口固定走「网关根 + /v1/usage」，与 Claude/Codex base 路径风格解耦
      baseUrl: toHcaiGatewayRoot(gatewayRoot) || HCAI_BASE_URL,
    }),
  };
}

function modelDisplayName(id: string): string {
  return id
    .replace(/^claude-/, "Claude ")
    .replace(/^gpt-/, "GPT-")
    .replace(/-/g, " ");
}

export function buildHcaiProviders(
  sel: HcaiWriteSelection,
  allClaudeModels: string[],
): BuiltHcaiProvider[] {
  const out: BuiltHcaiProvider[] = [];
  const name = sel.displayName.trim() || "HCAI";
  const key = sel.apiKey.trim();
  const gatewayRoot =
    toHcaiGatewayRoot(sel.baseUrlRoot || HCAI_BASE_URL) || HCAI_BASE_URL;
  const gatewayV1 = `${gatewayRoot}/v1`;
  const rootEps = rootCandidates(gatewayRoot);
  const v1Eps = v1Candidates(gatewayRoot);

  const fableFromList = allClaudeModels.find(isFableModel);

  if (sel.enableClaudeCode) {
    const primary =
      sel.claudeModel ||
      pickModelByHint(allClaudeModels, ["opus", "sonnet", "haiku"]) ||
      "claude-opus-4-8";
    const sonnet =
      sel.claudeSonnet ||
      pickModelByHint(allClaudeModels, ["sonnet"]) ||
      primary;
    const opus =
      sel.claudeOpus || pickModelByHint(allClaudeModels, ["opus"]) || primary;
    const haiku =
      sel.claudeHaiku || pickModelByHint(allClaudeModels, ["haiku"]) || primary;
    // 面板传入 "" 表示「不配置」；未传字段时才回退到列表里的 fable
    const fable =
      sel.claudeFable !== undefined
        ? sel.claudeFable.trim() || undefined
        : fableFromList ||
          (sel.claudeModel && isFableModel(sel.claudeModel)
            ? sel.claudeModel
            : undefined);

    const env: Record<string, string> = {
      ANTHROPIC_BASE_URL: gatewayRoot,
      ANTHROPIC_API_KEY: key,
      ANTHROPIC_MODEL: primary,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: haiku,
      ANTHROPIC_DEFAULT_SONNET_MODEL: sonnet,
      ANTHROPIC_DEFAULT_OPUS_MODEL: opus,
    };
    // 与 Claude 供应商表单「模型映射」一致：有 Fable 时写入角色模型
    if (fable) {
      env.ANTHROPIC_DEFAULT_FABLE_MODEL = fable;
    }

    out.push({
      appId: "claude",
      link: {
        app: "claude",
        appId: "claude",
        providerId: "", // filled after create
        name,
      },
      payload: {
        name,
        websiteUrl: HCAI_WEBSITE,
        category: "custom",
        icon: HCAI_ICON,
        iconColor: HCAI_ICON_COLOR,
        settingsConfig: { env },
        meta: withHcaiUsageMeta(gatewayRoot, {
          apiKeyField: "ANTHROPIC_API_KEY",
          custom_endpoints: endpointMeta(rootEps),
        }),
      },
    });
  }

  if (sel.enableClaudeDesktop) {
    const sonnet =
      sel.desktopSonnet ||
      pickModelByHint(allClaudeModels, ["sonnet"]) ||
      "claude-sonnet-4-6";
    const opus =
      sel.desktopOpus ||
      pickModelByHint(allClaudeModels, ["opus"]) ||
      "claude-opus-4-8";
    const haiku =
      sel.desktopHaiku ||
      pickModelByHint(allClaudeModels, ["haiku"]) ||
      "claude-haiku-4-5-20251001";
    const desktopFable =
      sel.desktopFable !== undefined
        ? sel.desktopFable.trim() || undefined
        : fableFromList;

    const routes: Record<
      string,
      { model: string; labelOverride?: string; supports1m?: boolean }
    > = {
      [CLAUDE_DESKTOP_ROLE_ROUTE_IDS.sonnet]: {
        model: sonnet,
        labelOverride: sonnet,
      },
      [CLAUDE_DESKTOP_ROLE_ROUTE_IDS.opus]: {
        model: opus,
        labelOverride: opus,
      },
      [CLAUDE_DESKTOP_ROLE_ROUTE_IDS.haiku]: {
        model: haiku,
        labelOverride: haiku,
      },
    };
    if (desktopFable) {
      routes[CLAUDE_DESKTOP_ROLE_ROUTE_IDS.fable] = {
        model: desktopFable,
        labelOverride: desktopFable,
        supports1m: false,
      };
    }

    out.push({
      appId: "claude-desktop",
      link: {
        app: "claude-desktop",
        appId: "claude-desktop",
        providerId: "", // filled after create
        name,
      },
      payload: {
        name,
        websiteUrl: HCAI_WEBSITE,
        category: "custom",
        icon: HCAI_ICON,
        iconColor: HCAI_ICON_COLOR,
        settingsConfig: {
          env: {
            ANTHROPIC_BASE_URL: gatewayRoot,
            ANTHROPIC_API_KEY: key,
          },
        },
        meta: withHcaiUsageMeta(gatewayRoot, {
          apiKeyField: "ANTHROPIC_API_KEY",
          claudeDesktopMode: "proxy",
          apiFormat: "anthropic",
          claudeDesktopModelRoutes: routes,
          custom_endpoints: endpointMeta(rootEps),
        }),
      },
    });
  }

  if (sel.enableCodex && sel.codexModel) {
    const model = sel.codexModel;
    out.push({
      appId: "codex",
      link: {
        app: "codex",
        appId: "codex",
        providerId: "",
        name,
      },
      payload: {
        name,
        websiteUrl: HCAI_WEBSITE,
        category: "custom",
        icon: HCAI_ICON,
        iconColor: HCAI_ICON_COLOR,
        settingsConfig: {
          auth: generateThirdPartyAuth(key),
          config: generateThirdPartyConfig("hcai", gatewayV1, model),
          modelCatalog: {
            models: [{ model, displayName: modelDisplayName(model) }],
          },
        },
        meta: withHcaiUsageMeta(gatewayRoot, {
          apiFormat: "openai_responses",
          custom_endpoints: endpointMeta(v1Eps),
        }),
      },
    });
  }

  if (sel.enableOpencode) {
    if (sel.opencodeClaudeModels.length > 0) {
      const modelsMap: Record<string, { name: string }> = {};
      for (const id of sel.opencodeClaudeModels) {
        modelsMap[id] = { name: modelDisplayName(id) };
      }
      const providerKey = `hcai-claude-${generateUUID().slice(0, 8)}`;
      out.push({
        appId: "opencode",
        link: {
          app: "opencode-claude",
          appId: "opencode",
          providerId: providerKey,
          name: `${name} Claude`,
        },
        payload: {
          name: `${name} Claude`,
          websiteUrl: HCAI_WEBSITE,
          category: "custom",
          icon: HCAI_ICON,
          iconColor: HCAI_ICON_COLOR,
          providerKey,
          addToLive: true,
          settingsConfig: {
            npm: "@ai-sdk/anthropic",
            name: `${name} Claude`,
            options: {
              baseURL: gatewayRoot,
              apiKey: key,
              setCacheKey: true,
            },
            models: modelsMap,
          },
          meta: withHcaiUsageMeta(gatewayRoot, {
            custom_endpoints: endpointMeta(rootEps),
          }),
        },
      });
    }
    if (sel.opencodeCodexModels.length > 0) {
      const modelsMap: Record<string, { name: string }> = {};
      for (const id of sel.opencodeCodexModels) {
        modelsMap[id] = { name: modelDisplayName(id) };
      }
      const providerKey = `hcai-codex-${generateUUID().slice(0, 8)}`;
      out.push({
        appId: "opencode",
        link: {
          app: "opencode-codex",
          appId: "opencode",
          providerId: providerKey,
          name: `${name} Codex`,
        },
        payload: {
          name: `${name} Codex`,
          websiteUrl: HCAI_WEBSITE,
          category: "custom",
          icon: HCAI_ICON,
          iconColor: HCAI_ICON_COLOR,
          providerKey,
          addToLive: true,
          settingsConfig: {
            npm: "@ai-sdk/openai",
            name: `${name} Codex`,
            options: {
              baseURL: gatewayV1,
              apiKey: key,
              setCacheKey: true,
            },
            models: modelsMap,
          },
          meta: withHcaiUsageMeta(gatewayRoot, {
            custom_endpoints: endpointMeta(v1Eps),
          }),
        },
      });
    }
  }

  if (sel.enableGrok) {
    const grokModel = sel.grokModel?.trim() || "grok-4.5";
    const configToml = byokGrokConfigToml({
      key: GROK_BYOK_MODEL_KEY,
      modelId: grokModel,
      baseUrl: gatewayV1,
      name,
      apiKey: key,
      apiBackend: "responses",
    });

    out.push({
      appId: "grok",
      link: {
        app: "grok",
        appId: "grok",
        providerId: "",
        name,
      },
      payload: {
        name,
        websiteUrl: HCAI_WEBSITE,
        category: "custom",
        icon: HCAI_ICON,
        iconColor: HCAI_ICON_COLOR,
        settingsConfig: {
          auth: {},
          config: configToml,
          apiKey: key,
        },
        meta: withHcaiUsageMeta(gatewayRoot, {
          custom_endpoints: endpointMeta(v1Eps),
        }),
      },
    });
  }

  return out;
}

export type { HcaiLinkedApp };

// Re-export for callers that need the default lists
export {
  HCAI_BASE_URL,
  HCAI_BASE_URL_V1,
  HCAI_ENDPOINT_ROOTS,
  HCAI_ENDPOINT_V1S,
};
