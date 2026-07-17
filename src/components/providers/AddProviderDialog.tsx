import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import type { Provider, CustomEndpoint, UniversalProvider } from "@/types";
import type { AppId } from "@/lib/api";
import { universalProvidersApi } from "@/lib/api";
import {
  ProviderForm,
  type ProviderFormValues,
} from "@/components/providers/forms/ProviderForm";
import { UniversalProviderFormModal } from "@/components/universal/UniversalProviderFormModal";
import { UniversalProviderPanel } from "@/components/universal";
import { providerPresets } from "@/config/claudeProviderPresets";
import { codexProviderPresets } from "@/config/codexProviderPresets";
import { claudeDesktopProviderPresets } from "@/config/claudeDesktopProviderPresets";
import {
  extractCodexBaseUrl,
  setCodexBaseUrl,
} from "@/utils/providerConfigUtils";
import type { UniversalProviderPreset } from "@/config/universalProviderPresets";
import { resolveHcaiBaseAmongCandidates } from "@/lib/hcai/resolveEndpoints";
import { isHcaiHost } from "@/lib/hcai/types";
import { createHcaiUsageScript } from "@/lib/hcai/usageScript";

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: AppId;
  onSubmit: (
    provider: Omit<Provider, "id"> & {
      providerKey?: string;
      ensureClaudeDesktopOfficialSeed?: boolean;
      ensureCodexOfficialSeed?: boolean;
    },
  ) => Promise<void> | void;
  /** Leave space for app sidebar (px) */
  leftOffset?: number;
  /** Top content inset matching App dragBarHeight (0 on Windows) */
  topOffset?: number;
}

export function AddProviderDialog({
  open,
  onOpenChange,
  appId,
  onSubmit,
  leftOffset = 0,
  topOffset,
}: AddProviderDialogProps) {
  const { t } = useTranslation();

  const addTitle = useMemo(() => {
    switch (appId) {
      case "claude":
        return t("provider.addClaudeProvider");
      case "codex":
        return t("provider.addCodexProvider");
      case "claude-desktop":
        return t("provider.addClaudeDesktopProvider");
      case "opencode":
        return t("provider.addOpenCodeProvider");
      case "grok":
        return t("provider.addGrokProvider");
      default:
        return t("provider.addNewProvider");
    }
  }, [appId, t]);

  // OpenCode and Claude Desktop don't support universal providers
  const showUniversalTab =
    appId !== "opencode" && appId !== "claude-desktop";
  const [activeTab, setActiveTab] = useState<"app-specific" | "universal">(
    "app-specific",
  );
  const [universalFormOpen, setUniversalFormOpen] = useState(false);
  const [selectedUniversalPreset, setSelectedUniversalPreset] =
    useState<UniversalProviderPreset | null>(null);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  const handleUniversalProviderSave = useCallback(
    async (provider: UniversalProvider) => {
      try {
        await universalProvidersApi.upsert(provider);
      } catch (error) {
        console.error(
          "[AddProviderDialog] Failed to save universal provider",
          error,
        );
        toast.error(
          t("universalProvider.addFailed", {
            defaultValue: "统一供应商添加失败",
          }),
        );
        return;
      }

      try {
        await universalProvidersApi.sync(provider.id);
        toast.success(
          t("universalProvider.addedAndSynced", {
            defaultValue: "统一供应商已添加并同步",
          }),
        );
      } catch (error) {
        console.error(
          "[AddProviderDialog] Provider saved but sync failed",
          error,
        );
        toast.warning(
          t("universalProvider.addedButSyncFailed", {
            defaultValue: "统一供应商已添加，但同步失败",
          }),
        );
      }

      setUniversalFormOpen(false);
      setSelectedUniversalPreset(null);
      onOpenChange(false);
    },
    [t, onOpenChange],
  );

  const handleUniversalFormClose = useCallback(() => {
    setUniversalFormOpen(false);
    setSelectedUniversalPreset(null);
  }, []);

  const handleSubmit = useCallback(
    async (values: ProviderFormValues) => {
      const parsedConfig = JSON.parse(values.settingsConfig) as Record<
        string,
        unknown
      >;

      // 构造基础提交数据
      const providerData: Omit<Provider, "id"> & {
        providerKey?: string;
        ensureClaudeDesktopOfficialSeed?: boolean;
        ensureCodexOfficialSeed?: boolean;
      } = {
        name: values.name.trim(),
        notes: values.notes?.trim() || undefined,
        websiteUrl: values.websiteUrl?.trim() || undefined,
        settingsConfig: parsedConfig,
        icon: values.icon?.trim() || undefined,
        iconColor: values.iconColor?.trim() || undefined,
        ...(values.presetCategory ? { category: values.presetCategory } : {}),
        ...(values.meta ? { meta: values.meta } : {}),
      };

      if (appId === "claude-desktop" && values.presetId) {
        const presetIndex = parseInt(
          values.presetId.replace("claude-desktop-", ""),
        );
        const preset = claudeDesktopProviderPresets[presetIndex];
        providerData.ensureClaudeDesktopOfficialSeed =
          values.presetCategory === "official" &&
          preset?.category === "official";
      }

      if (appId === "codex" && values.presetId) {
        const presetIndex = parseInt(values.presetId.replace("codex-", ""));
        const preset = codexProviderPresets[presetIndex];
        providerData.ensureCodexOfficialSeed =
          values.presetCategory === "official" &&
          preset?.category === "official";
      }

      // OpenCode: pass providerKey for ID generation
      if (appId === "opencode" && values.providerKey) {
        providerData.providerKey = values.providerKey;
      }

      const hasCustomEndpoints =
        providerData.meta?.custom_endpoints &&
        Object.keys(providerData.meta.custom_endpoints).length > 0;

      const urlSet = new Set<string>();
      const addUrl = (rawUrl?: string) => {
        const url = (rawUrl || "").trim().replace(/\/+$/, "");
        if (url && url.startsWith("http")) {
          urlSet.add(url);
        }
      };

      // 已有 custom_endpoints / 表单当前 base / 预设候选 一并收集
      if (providerData.meta?.custom_endpoints) {
        Object.keys(providerData.meta.custom_endpoints).forEach(addUrl);
      }

      if (values.presetId) {
        if (appId === "claude") {
          const presets = providerPresets;
          const presetIndex = parseInt(values.presetId.replace("claude-", ""));
          if (
            !isNaN(presetIndex) &&
            presetIndex >= 0 &&
            presetIndex < presets.length
          ) {
            const preset = presets[presetIndex];
            if (preset?.endpointCandidates) {
              preset.endpointCandidates.forEach(addUrl);
            }
          }
        } else if (appId === "codex") {
          const presets = codexProviderPresets;
          const presetIndex = parseInt(values.presetId.replace("codex-", ""));
          if (
            !isNaN(presetIndex) &&
            presetIndex >= 0 &&
            presetIndex < presets.length
          ) {
            const preset = presets[presetIndex];
            if (Array.isArray(preset.endpointCandidates)) {
              preset.endpointCandidates.forEach(addUrl);
            }
          }
        } else if (appId === "claude-desktop") {
          const presets = claudeDesktopProviderPresets;
          const presetIndex = parseInt(
            values.presetId.replace("claude-desktop-", ""),
          );
          if (
            !isNaN(presetIndex) &&
            presetIndex >= 0 &&
            presetIndex < presets.length
          ) {
            const preset = presets[presetIndex];
            if (Array.isArray(preset.endpointCandidates)) {
              preset.endpointCandidates.forEach(addUrl);
            }
            addUrl(preset.baseUrl);
          }
        }
      }

      if (appId === "claude" || appId === "claude-desktop") {
        const env = parsedConfig.env as Record<string, any> | undefined;
        if (env?.ANTHROPIC_BASE_URL) addUrl(env.ANTHROPIC_BASE_URL);
      } else if (appId === "codex") {
        const config = parsedConfig.config as string | undefined;
        if (config) {
          const extractedBaseUrl = extractCodexBaseUrl(config);
          if (extractedBaseUrl) addUrl(extractedBaseUrl);
        }
      } else if (appId === "opencode") {
        const options = parsedConfig.options as Record<string, any> | undefined;
        if (options?.baseURL) addUrl(options.baseURL);
      }

      const urls = Array.from(urlSet);

      if (
        !hasCustomEndpoints &&
        values.presetCategory !== "omo" &&
        urls.length > 0
      ) {
        const now = Date.now();
        const customEndpoints: Record<string, CustomEndpoint> = {};
        urls.forEach((url) => {
          customEndpoints[url] = {
            url,
            addedAt: now,
            lastUsed: undefined,
          };
        });
        providerData.meta = {
          ...(providerData.meta ?? {}),
          custom_endpoints: customEndpoints,
        };
      }

      // HCAI：主端点不可达时自动尝试备用，并把可用端点写入配置
      const hcaiCandidates = urls.filter(isHcaiHost);
      if (hcaiCandidates.length > 0) {
        try {
          const style =
            appId === "codex" ||
            (appId === "opencode" &&
              isHcaiHost(
                (parsedConfig.options as Record<string, any> | undefined)
                  ?.baseURL,
              ) &&
              /\/v1$/i.test(
                String(
                  (parsedConfig.options as Record<string, any>)?.baseURL || "",
                ),
              ))
              ? "v1"
              : "root";

          let preferred = hcaiCandidates[0];
          if (appId === "claude" || appId === "claude-desktop") {
            preferred =
              (parsedConfig.env as Record<string, any> | undefined)
                ?.ANTHROPIC_BASE_URL || preferred;
          } else if (appId === "codex") {
            preferred =
              extractCodexBaseUrl(
                (parsedConfig.config as string | undefined) || "",
              ) || preferred;
          } else if (appId === "opencode") {
            preferred =
              (parsedConfig.options as Record<string, any> | undefined)
                ?.baseURL || preferred;
          }

          const { baseUrl, fellBack } = await resolveHcaiBaseAmongCandidates(
            hcaiCandidates,
            preferred,
            style,
          );

          if (fellBack || baseUrl !== preferred.replace(/\/+$/, "")) {
            if (appId === "claude" || appId === "claude-desktop") {
              const env = {
                ...((parsedConfig.env as Record<string, any>) || {}),
                ANTHROPIC_BASE_URL: baseUrl,
              };
              providerData.settingsConfig = { ...parsedConfig, env };
            } else if (appId === "codex") {
              const configToml =
                (parsedConfig.config as string | undefined) || "";
              providerData.settingsConfig = {
                ...parsedConfig,
                config: setCodexBaseUrl(configToml, baseUrl),
              };
            } else if (appId === "opencode") {
              const options = {
                ...((parsedConfig.options as Record<string, any>) || {}),
                baseURL: baseUrl,
              };
              providerData.settingsConfig = { ...parsedConfig, options };
            }

            if (fellBack) {
              toast.message(
                t("hcai.endpointFallback", {
                  defaultValue: "主端点不可用，已切换并保存备用端点：{{url}}",
                  url: baseUrl,
                }),
              );
            }
          }

          // 确保 HCAI 预设默认启用用量查询，并绑定当前可用网关根
          if (!providerData.meta?.usage_script) {
            providerData.meta = {
              ...(providerData.meta ?? {}),
              usage_script: createHcaiUsageScript({ baseUrl }),
            };
          } else {
            providerData.meta = {
              ...providerData.meta,
              usage_script: createHcaiUsageScript({
                ...providerData.meta.usage_script,
                baseUrl,
              }),
            };
          }
        } catch (err) {
          console.warn("HCAI endpoint resolve failed, keeping primary", err);
        }
      }

      await onSubmit(providerData);
      onOpenChange(false);
    },
    [appId, onSubmit, onOpenChange, t],
  );

  const footer =
    !showUniversalTab || activeTab === "app-specific" ? (
      <>
        <span className="mr-auto min-w-0 text-xs text-muted-foreground truncate">
          {t("provider.addFooterHint")}
        </span>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="border-border/20 hover:bg-accent hover:text-accent-foreground"
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          form="provider-form"
          disabled={isFormSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("common.add")}
        </Button>
      </>
    ) : (
      <>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="border-border/20 hover:bg-accent hover:text-accent-foreground"
        >
          {t("common.cancel")}
        </Button>
        <Button
          onClick={() => setUniversalFormOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("universalProvider.add")}
        </Button>
      </>
    );

  return (
    <FullScreenPanel
      isOpen={open}
      title={addTitle}
      onClose={() => onOpenChange(false)}
      footer={footer}
      contentClassName="pt-3"
      leftOffset={leftOffset}
      topOffset={topOffset}
    >
      {showUniversalTab ? (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "app-specific" | "universal")}
        >
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="app-specific">
              {t(`apps.${appId}`)} {t("provider.tabProvider")}
            </TabsTrigger>
            <TabsTrigger value="universal">
              {t("provider.tabUniversal")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="app-specific" className="mt-0">
            <ProviderForm
              appId={appId}
              submitLabel={t("common.add")}
              onSubmit={handleSubmit}
              onCancel={() => onOpenChange(false)}
              onSubmittingChange={setIsFormSubmitting}
              showButtons={false}
            />
          </TabsContent>

          <TabsContent value="universal" className="mt-0">
            <UniversalProviderPanel />
          </TabsContent>
        </Tabs>
      ) : (
        // OpenCode / Claude Desktop: directly show form without tabs
        <ProviderForm
          appId={appId}
          submitLabel={t("common.add")}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          onSubmittingChange={setIsFormSubmitting}
          showButtons={false}
        />
      )}

      {showUniversalTab && (
        <UniversalProviderFormModal
          isOpen={universalFormOpen}
          onClose={handleUniversalFormClose}
          onSave={handleUniversalProviderSave}
          initialPreset={selectedUniversalPreset}
        />
      )}
    </FullScreenPanel>
  );
}
