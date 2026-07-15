/**
 * HCAI「使用密钥 / 添加配置」面板：拉模型、勾选应用、写入供应商。
 * - locked：密钥来自控制台列表，只读，无「保存密钥」
 * - 非 locked：可粘贴密钥（HcaiPanel 添加配置页）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  BookmarkPlus,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAddProviderMutation } from "@/lib/query";
import { cn } from "@/lib/utils";
import { fetchHcaiModels, fetchHcaiUsage } from "@/lib/hcai/api";
import { buildHcaiProviders } from "@/lib/hcai/buildProviders";
import { resolveHcaiWorkingEndpoints } from "@/lib/hcai/resolveEndpoints";
import {
  appendLinkedProviders,
  loadHcaiStore,
  maskApiKey,
  saveHcaiStore,
  upsertHcaiKey,
} from "@/lib/hcai/store";
import {
  HCAI_KEYS_URL,
  isClaudeFamilyModel,
  isCodexFamilyModel,
  isFableModel,
  isGrokFamilyModel,
  pickModelByHint,
  type HcaiUsageResponse,
} from "@/lib/hcai/types";
import { extractErrorMessage } from "@/utils/errorUtils";

export interface HcaiUseKeyPanelProps {
  /** 初始 / 锁定密钥 */
  apiKey: string;
  /** 备注名（列表密钥 name；非 locked 时可编辑） */
  label?: string;
  /** 分组名称（列表 group.name，用于默认配置名） */
  groupName?: string;
  /** true：密钥只读，隐藏保存/获取密钥 */
  locked?: boolean;
  /** 显示返回按钮（HcaiPanel 内页） */
  showBack?: boolean;
  onBack?: () => void;
  /** 写入成功后（关闭弹层 / 回 hub） */
  onApplied?: () => void;
  onProvidersChanged?: () => void;
  className?: string;
}

function formatMoney(n: number | undefined, unit = "USD"): string {
  if (n == null || Number.isNaN(n)) return "--";
  return `${n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} ${unit}`;
}

function formatInt(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "--";
  return n.toLocaleString();
}

function formatExpiry(iso?: string): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * 配置名称默认值：hcai:密钥名称（分组名称）
 * 无分组时仅 hcai:密钥名称
 */
function defaultConfigName(label?: string, groupName?: string): string {
  const name = label?.trim() || "未命名";
  const group = groupName?.trim();
  return group ? `hcai:${name}（${group}）` : `hcai:${name}`;
}

export function HcaiUseKeyPanel({
  apiKey: initialApiKey,
  label: initialLabel = "",
  groupName: initialGroupName = "",
  locked = false,
  showBack = false,
  onBack,
  onApplied,
  onProvidersChanged,
  className,
}: HcaiUseKeyPanelProps) {
  const { t } = useTranslation();
  const [draftKey, setDraftKey] = useState(initialApiKey);
  const [draftLabel, setDraftLabel] = useState(initialLabel);
  /** 默认：hcai:密钥名称（分组名称）；用户改过后不再自动覆盖 */
  const [providerName, setProviderName] = useState(() =>
    defaultConfigName(initialLabel, initialGroupName),
  );
  const providerNameTouchedRef = useRef(false);
  const lastQueriedKeyRef = useRef("");
  const [usage, setUsage] = useState<HcaiUsageResponse | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [applying, setApplying] = useState(false);

  const [enableClaudeCode, setEnableClaudeCode] = useState(false);
  const [enableClaudeDesktop, setEnableClaudeDesktop] = useState(false);
  const [enableCodex, setEnableCodex] = useState(false);
  const [enableOpencode, setEnableOpencode] = useState(false);
  const [enableGrok, setEnableGrok] = useState(false);

  const [claudeModel, setClaudeModel] = useState("");
  const [claudeSonnet, setClaudeSonnet] = useState("");
  const [claudeOpus, setClaudeOpus] = useState("");
  const [claudeFable, setClaudeFable] = useState("");
  const [claudeHaiku, setClaudeHaiku] = useState("");
  const [desktopSonnet, setDesktopSonnet] = useState("");
  const [desktopOpus, setDesktopOpus] = useState("");
  const [desktopFable, setDesktopFable] = useState("");
  const [desktopHaiku, setDesktopHaiku] = useState("");
  const [codexModel, setCodexModel] = useState("");
  const [grokModel, setGrokModel] = useState("");
  const [opencodeClaudeModels, setOpencodeClaudeModels] = useState<string[]>(
    [],
  );
  const [opencodeCodexModels, setOpencodeCodexModels] = useState<string[]>([]);

  const addClaude = useAddProviderMutation("claude");
  const addDesktop = useAddProviderMutation("claude-desktop");
  const addCodex = useAddProviderMutation("codex");
  const addOpencode = useAddProviderMutation("opencode");
  const addGrok = useAddProviderMutation("grok");

  const claudeModels = useMemo(
    () => models.filter(isClaudeFamilyModel),
    [models],
  );
  const codexModels = useMemo(
    () => models.filter(isCodexFamilyModel),
    [models],
  );
  const grokModels = useMemo(() => models.filter(isGrokFamilyModel), [models]);
  const fableInList = useMemo(
    () => claudeModels.find(isFableModel),
    [claudeModels],
  );

  const applyModelDefaults = useCallback((ids: string[]) => {
    const claude = ids.filter(isClaudeFamilyModel);
    const codex = ids.filter(isCodexFamilyModel);
    const grok = ids.filter(isGrokFamilyModel);
    const hasClaude = claude.length > 0;
    const hasCodex = codex.length > 0;
    const hasGrok = grok.length > 0;
    setEnableClaudeCode(hasClaude);
    setEnableCodex(hasCodex);
    setEnableGrok(hasGrok);
    if (!hasClaude) setEnableClaudeDesktop(false);
    if (!hasClaude && !hasCodex) setEnableOpencode(false);

    const primary =
      pickModelByHint(claude, ["opus", "sonnet", "haiku"]) || claude[0] || "";
    const sonnet = pickModelByHint(claude, ["sonnet"]) || primary;
    const opus = pickModelByHint(claude, ["opus"]) || primary;
    const haiku = pickModelByHint(claude, ["haiku"]) || primary;
    const fable = claude.find(isFableModel) || "";
    setClaudeModel(primary);
    setClaudeSonnet(sonnet);
    setClaudeOpus(opus);
    setClaudeFable(fable);
    setClaudeHaiku(haiku);
    setDesktopSonnet(sonnet);
    setDesktopOpus(opus);
    setDesktopFable(fable);
    setDesktopHaiku(haiku);
    setCodexModel(
      pickModelByHint(codex, ["gpt-5.6-sol", "gpt-5.5", "gpt-5.4", "gpt"]) ||
        codex[0] ||
        "",
    );
    setGrokModel(
      pickModelByHint(grok, [
        "grok-build",
        "grok-4.5",
        "grok-4.3",
        "grok-4.20",
        "grok",
      ]) ||
        grok[0] ||
        "",
    );
    setOpencodeClaudeModels(claude.slice(0, 6));
    setOpencodeCodexModels(codex.slice(0, 8));
  }, []);

  const refreshForKey = useCallback(
    async (keyRaw: string, opts?: { force?: boolean }) => {
      const key = keyRaw.trim();
      if (!key) return;
      if (!opts?.force && lastQueriedKeyRef.current === key) return;
      lastQueriedKeyRef.current = key;

      setLoadingUsage(true);
      setLoadingModels(true);
      setUsage(null);
      try {
        const u = await fetchHcaiUsage(key);
        setUsage(u);
        if (u.isValid === false) {
          toast.error(
            t("hcai.invalidKey", { defaultValue: "密钥无效或已失效" }),
          );
        }
      } catch (err) {
        lastQueriedKeyRef.current = "";
        toast.error(
          t("hcai.usageFailed", {
            defaultValue: "额度查询失败：{{error}}",
            error: extractErrorMessage(err),
          }),
        );
      } finally {
        setLoadingUsage(false);
      }

      try {
        const list = await fetchHcaiModels(key);
        const ids = list.map((m) => m.id).filter(Boolean);
        setModels(ids);
        applyModelDefaults(ids);
      } catch (err) {
        lastQueriedKeyRef.current = "";
        toast.error(
          t("hcai.modelsFailed", {
            defaultValue: "模型列表获取失败：{{error}}",
            error: extractErrorMessage(err),
          }),
        );
        setModels([]);
        applyModelDefaults([]);
      } finally {
        setLoadingModels(false);
      }
    },
    [applyModelDefaults, t],
  );

  // 打开时带入密钥并自动查询；未手改时同步默认配置名
  useEffect(() => {
    setDraftKey(initialApiKey);
    setDraftLabel(initialLabel);
    lastQueriedKeyRef.current = "";
    providerNameTouchedRef.current = false;
    setProviderName(defaultConfigName(initialLabel, initialGroupName));
    if (initialApiKey.trim()) {
      void refreshForKey(initialApiKey, { force: true });
    }
    // 仅随外部密钥变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialApiKey, initialLabel, initialGroupName]);

  // 非 locked 时用户改备注名：若配置名未手改，跟着更新默认值
  useEffect(() => {
    if (locked || providerNameTouchedRef.current) return;
    setProviderName(defaultConfigName(draftLabel, initialGroupName));
  }, [draftLabel, locked, initialGroupName]);

  const planName = usage?.planName?.trim();
  const displayName =
    providerName.trim() || defaultConfigName(draftLabel, initialGroupName);
  const unit = usage?.unit || "USD";
  const isSubscription = Boolean(usage?.subscription);

  const openExternal = useCallback(
    async (url: string) => {
      try {
        await openUrl(url);
      } catch (err) {
        try {
          window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          toast.error(
            t("hcai.openLinkFailed", {
              defaultValue: "无法打开链接：{{error}}",
              error: extractErrorMessage(err),
            }),
          );
        }
      }
    },
    [t],
  );

  const handleSaveKey = () => {
    if (!draftKey.trim()) {
      toast.error(t("hcai.needKey", { defaultValue: "请输入 API Key" }));
      return;
    }
    const next = upsertHcaiKey(loadHcaiStore(), {
      apiKey: draftKey,
      label: draftLabel || undefined,
    });
    saveHcaiStore(next);
    toast.success(t("hcai.keySaved", { defaultValue: "密钥已保存到本机" }));
    void refreshForKey(draftKey, { force: true });
  };

  const handleApply = async () => {
    const apiKey = draftKey.trim();
    if (!apiKey) {
      toast.error(t("hcai.needKey", { defaultValue: "请输入 API Key" }));
      return;
    }
    if (
      !enableClaudeCode &&
      !enableClaudeDesktop &&
      !enableCodex &&
      !enableOpencode &&
      !enableGrok
    ) {
      toast.error(
        t("hcai.needTarget", { defaultValue: "请至少选择一个目标应用" }),
      );
      return;
    }

    let nextStore = upsertHcaiKey(loadHcaiStore(), {
      apiKey,
      label: draftLabel || undefined,
    });
    const keyId = nextStore.activeKeyId!;
    saveHcaiStore(nextStore);

    setApplying(true);
    const links = [];
    try {
      const resolved = await resolveHcaiWorkingEndpoints();
      if (resolved.fellBack) {
        toast.message(
          t("hcai.endpointFallback", {
            defaultValue: "主端点不可用，已切换并保存备用端点：{{url}}",
            url: resolved.root,
          }),
        );
      }

      const built = buildHcaiProviders(
        {
          displayName,
          apiKey,
          baseUrlRoot: resolved.root,
          enableClaudeCode,
          claudeModel,
          claudeSonnet,
          claudeOpus,
          claudeFable,
          claudeHaiku,
          enableClaudeDesktop,
          desktopSonnet,
          desktopOpus,
          desktopFable,
          desktopHaiku,
          enableCodex,
          codexModel,
          enableOpencode,
          opencodeClaudeModels,
          opencodeCodexModels,
          enableGrok,
          grokModel,
        },
        claudeModels,
      );

      if (built.length === 0) {
        toast.error(
          t("hcai.nothingToWrite", {
            defaultValue: "没有可写入的配置，请检查模型选择",
          }),
        );
        return;
      }

      for (const item of built) {
        const mut =
          item.appId === "claude"
            ? addClaude
            : item.appId === "claude-desktop"
              ? addDesktop
              : item.appId === "codex"
                ? addCodex
                : item.appId === "grok"
                  ? addGrok
                  : addOpencode;
        const created = await mut.mutateAsync(item.payload);
        links.push({
          ...item.link,
          providerId: created.id,
          name: created.name,
        });
      }
      nextStore = appendLinkedProviders(nextStore, keyId, links);
      saveHcaiStore(nextStore);
      toast.success(
        t("hcai.applySuccess", {
          defaultValue: "已添加 {{count}} 个供应商配置",
          count: links.length,
        }),
      );
      onProvidersChanged?.();
      onApplied?.();
    } catch (err) {
      toast.error(
        t("hcai.applyFailed", {
          defaultValue: "写入失败：{{error}}",
          error: extractErrorMessage(err),
        }),
      );
    } finally {
      setApplying(false);
    }
  };

  const toggleOpencodeClaude = (id: string) => {
    setOpencodeClaudeModels((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const toggleOpencodeCodex = (id: string) => {
    setOpencodeCodexModels((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {showBack ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("common.back", { defaultValue: "返回" })}
          </Button>
          <h3 className="font-semibold text-base">
            {t("hcai.addConfigPage", { defaultValue: "添加配置" })}
          </h3>
        </div>
      ) : null}

      {/* 密钥 */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t("hcai.keySection", { defaultValue: "API 密钥" })}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={!draftKey.trim() || loadingUsage || loadingModels}
            onClick={() => void refreshForKey(draftKey, { force: true })}
          >
            {loadingUsage || loadingModels ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5">
              {t("hcai.refresh", { defaultValue: "刷新" })}
            </span>
          </Button>
        </div>

        {locked ? (
          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 flex flex-wrap items-center gap-2">
            {draftLabel ? (
              <span className="text-sm font-medium">{draftLabel}</span>
            ) : null}
            <span className="font-mono text-xs text-muted-foreground">
              {maskApiKey(draftKey)}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>{t("hcai.apiKey", { defaultValue: "API 密钥" })}</Label>
            <Input
              type="password"
              autoComplete="off"
              placeholder={t("hcai.apiKeyPlaceholder", {
                defaultValue: "粘贴 HCAI 控制台创建的 API Key (sk-...)",
              })}
              value={draftKey}
              onChange={(e) => {
                const v = e.target.value;
                setDraftKey(v);
                if (v.trim() !== lastQueriedKeyRef.current) {
                  lastQueriedKeyRef.current = "";
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void refreshForKey(draftKey);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  if (draftKey.trim()) void refreshForKey(draftKey);
                }, 0);
              }}
            />
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <Input
                placeholder={t("hcai.labelPlaceholder", {
                  defaultValue: "备注名（可选）",
                })}
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                className="sm:max-w-[200px]"
              />
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveKey}
                className="shrink-0 h-9"
              >
                <BookmarkPlus className="h-4 w-4 mr-1.5" />
                {t("hcai.saveKey", { defaultValue: "保存密钥" })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-9"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void openExternal(HCAI_KEYS_URL);
                }}
              >
                {t("hcai.getKey", { defaultValue: "获取密钥" })}
              </Button>
            </div>
          </div>
        )}

        {usage ? (
          <div className="pt-2 border-t border-border/60 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">
                {planName || t("hcai.wallet", { defaultValue: "钱包余额" })}
              </span>
              {usage.isValid === false && (
                <span className="text-xs text-destructive">
                  {t("hcai.invalid", { defaultValue: "无效" })}
                </span>
              )}
            </div>
            {isSubscription && usage.subscription ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <StatCard
                  label={t("hcai.dailyLimit", { defaultValue: "今日额度" })}
                  value={`${formatMoney(usage.subscription.daily_usage_usd, unit)} / ${formatMoney(usage.subscription.daily_limit_usd, unit)}`}
                />
                <StatCard
                  label={t("hcai.weeklyLimit", { defaultValue: "本周额度" })}
                  value={`${formatMoney(usage.subscription.weekly_usage_usd, unit)} / ${formatMoney(usage.subscription.weekly_limit_usd, unit)}`}
                />
                <StatCard
                  label={t("hcai.monthlyLimit", { defaultValue: "本月额度" })}
                  value={`${formatMoney(usage.subscription.monthly_usage_usd, unit)} / ${formatMoney(usage.subscription.monthly_limit_usd, unit)}`}
                />
                <StatCard
                  label={t("hcai.expiresAt", { defaultValue: "到期时间" })}
                  value={formatExpiry(usage.subscription.expires_at)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <StatCard
                  label={t("hcai.remaining", { defaultValue: "剩余额度" })}
                  value={formatMoney(usage.remaining ?? usage.balance, unit)}
                />
                <StatCard
                  label={t("hcai.todayCost", { defaultValue: "今日消耗" })}
                  value={formatMoney(usage.usage?.today?.cost, unit)}
                />
                <StatCard
                  label={t("hcai.todayRequests", { defaultValue: "今日请求" })}
                  value={formatInt(usage.usage?.today?.requests)}
                />
              </div>
            )}
          </div>
        ) : loadingUsage ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("hcai.loadingUsage", { defaultValue: "正在查询额度…" })}
          </div>
        ) : null}
      </section>

      {/* 可用模型 */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">
            {t("hcai.models", { defaultValue: "可用模型" })}
          </h3>
          <span className="text-xs text-muted-foreground">
            {loadingModels
              ? t("common.loading")
              : t("hcai.modelCount", {
                  defaultValue: "{{count}} 个模型",
                  count: models.length,
                })}
          </span>
        </div>
        {models.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {locked
              ? t("hcai.noModelsLocked", {
                  defaultValue: "正在读取可用模型，或点击刷新重试。",
                })
              : t("hcai.noModels", {
                  defaultValue: "输入 API Key 后读取可用模型。",
                })}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {models.map((id) => (
              <span
                key={id}
                className={cn(
                  "text-xs px-2 py-1 rounded-md border",
                  isFableModel(id)
                    ? "border-amber-400/50 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                    : isClaudeFamilyModel(id)
                      ? "border-orange-400/40 bg-orange-500/10"
                      : isGrokFamilyModel(id)
                        ? "border-zinc-400/50 bg-zinc-500/10 text-zinc-800 dark:text-zinc-200"
                        : "border-border bg-muted/50",
                )}
              >
                {id}
              </span>
            ))}
          </div>
        )}
        {fableInList ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("hcai.fableHint", {
              defaultValue:
                "检测到 Fable 模型（{{model}}），Claude Code / Desktop 的 Fable 角色已默认选中，可按需修改。",
              model: fableInList,
            })}
          </p>
        ) : null}
        {grokModels.length > 0 ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            {t("hcai.grokHint", {
              defaultValue:
                "检测到 Grok 模型（{{count}} 个），已默认勾选 Grok Build，可一键写入配置。",
              count: grokModels.length,
            })}
          </p>
        ) : null}
      </section>

      {/* 添加到应用 */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h3 className="font-semibold text-base">
          {t("hcai.targets", { defaultValue: "添加到应用" })}
        </h3>

        <TargetBlock
          checked={enableClaudeCode}
          onCheckedChange={setEnableClaudeCode}
          title="Claude Code"
          disabled={claudeModels.length === 0}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ModelSelect
              label="Default"
              value={claudeModel}
              options={claudeModels}
              onChange={setClaudeModel}
            />
            <ModelSelect
              label="Sonnet"
              value={claudeSonnet}
              options={claudeModels}
              onChange={setClaudeSonnet}
            />
            <ModelSelect
              label="Opus"
              value={claudeOpus}
              options={claudeModels}
              onChange={setClaudeOpus}
            />
            <ModelSelect
              label="Fable"
              value={claudeFable}
              options={claudeModels}
              onChange={setClaudeFable}
              allowEmpty
              emptyLabel={t("hcai.fableNone", {
                defaultValue: "不配置 Fable",
              })}
            />
            <ModelSelect
              label="Haiku"
              value={claudeHaiku}
              options={claudeModels}
              onChange={setClaudeHaiku}
            />
          </div>
        </TargetBlock>

        <TargetBlock
          checked={enableClaudeDesktop}
          onCheckedChange={setEnableClaudeDesktop}
          title="Claude Desktop"
          disabled={claudeModels.length === 0}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ModelSelect
              label="Sonnet"
              value={desktopSonnet}
              options={claudeModels}
              onChange={setDesktopSonnet}
            />
            <ModelSelect
              label="Opus"
              value={desktopOpus}
              options={claudeModels}
              onChange={setDesktopOpus}
            />
            <ModelSelect
              label="Fable"
              value={desktopFable}
              options={claudeModels}
              onChange={setDesktopFable}
              allowEmpty
              emptyLabel={t("hcai.fableNone", {
                defaultValue: "不配置 Fable",
              })}
            />
            <ModelSelect
              label="Haiku"
              value={desktopHaiku}
              options={claudeModels}
              onChange={setDesktopHaiku}
            />
          </div>
        </TargetBlock>

        <TargetBlock
          checked={enableCodex}
          onCheckedChange={setEnableCodex}
          title="Codex"
          disabled={codexModels.length === 0}
        >
          <ModelSelect
            label={t("hcai.defaultModel", { defaultValue: "默认模型" })}
            value={codexModel}
            options={codexModels}
            onChange={setCodexModel}
          />
        </TargetBlock>

        <TargetBlock
          checked={enableGrok}
          onCheckedChange={setEnableGrok}
          title="Grok Build"
          disabled={grokModels.length === 0}
        >
          <ModelSelect
            label={t("hcai.defaultModel", { defaultValue: "默认模型" })}
            value={grokModel}
            options={grokModels}
            onChange={setGrokModel}
          />
        </TargetBlock>

        <TargetBlock
          checked={enableOpencode}
          onCheckedChange={setEnableOpencode}
          title="OpenCode"
          disabled={
            claudeModels.length === 0 &&
            codexModels.length === 0 &&
            grokModels.length === 0
          }
        >
          <div className="space-y-3">
            {claudeModels.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Claude 线（claude-*）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {claudeModels.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleOpencodeClaude(id)}
                      className={cn(
                        "text-xs px-2 py-1 rounded-md border transition-colors",
                        opencodeClaudeModels.includes(id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 border-border hover:bg-muted",
                      )}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {codexModels.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Codex 线（gpt-*）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {codexModels.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleOpencodeCodex(id)}
                      className={cn(
                        "text-xs px-2 py-1 rounded-md border transition-colors",
                        opencodeCodexModels.includes(id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 border-border hover:bg-muted",
                      )}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TargetBlock>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-1">
          <div className="flex-1 min-w-0 space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("hcai.providerName", { defaultValue: "配置名称" })}
            </Label>
            <Input
              value={providerName}
              onChange={(e) => {
                providerNameTouchedRef.current = true;
                setProviderName(e.target.value);
              }}
              placeholder={t("hcai.providerNamePlaceholder", {
                defaultValue: "例如：hcai:openAI（grok）",
              })}
              className="h-9 max-w-md"
            />
            <p className="text-xs text-muted-foreground">
              {t("hcai.writeHint", {
                defaultValue: "将以副本形式添加配置；名称：{{name}}",
                name: displayName,
              })}
            </p>
          </div>
          <Button
            onClick={() => void handleApply()}
            disabled={applying || !draftKey.trim()}
            className="shrink-0"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Plus className="h-4 w-4 mr-1.5" />
            )}
            {t("hcai.apply", { defaultValue: "添加配置" })}
          </Button>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold mt-0.5 tabular-nums break-all">
        {value}
      </div>
    </div>
  );
}

function TargetBlock({
  checked,
  onCheckedChange,
  title,
  disabled,
  children,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-3",
        checked ? "border-border" : "border-border/60 opacity-80",
        disabled && "opacity-50",
      )}
    >
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
        <span className="text-sm font-medium">{title}</span>
      </label>
      {checked && !disabled && children}
    </div>
  );
}

function ModelSelect({
  label,
  value,
  options,
  onChange,
  allowEmpty,
  emptyLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const EMPTY = "__none__";
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value ? value : allowEmpty ? EMPTY : undefined}
        onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && (
            <SelectItem value={EMPTY}>{emptyLabel || "—"}</SelectItem>
          )}
          {options.map((id) => (
            <SelectItem key={id} value={id}>
              {id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
