import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  BookmarkPlus,
} from "lucide-react";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { providersApi } from "@/lib/api";
import { useAddProviderMutation } from "@/lib/query";
import { cn } from "@/lib/utils";
import { fetchHcaiModels, fetchHcaiUsage } from "@/lib/hcai/api";
import { buildHcaiProviders } from "@/lib/hcai/buildProviders";
import { resolveHcaiWorkingEndpoints } from "@/lib/hcai/resolveEndpoints";
import {
  appendLinkedProviders,
  getActiveHcaiKey,
  loadHcaiStore,
  maskApiKey,
  removeHcaiKey,
  saveHcaiStore,
  setActiveHcaiKey,
  upsertHcaiKey,
} from "@/lib/hcai/store";
import {
  HCAI_ICON,
  HCAI_KEYS_URL,
  HCAI_WEBSITE,
  isClaudeFamilyModel,
  isCodexFamilyModel,
  isFableModel,
  isGrokFamilyModel,
  pickModelByHint,
  type HcaiSavedKey,
  type HcaiStoreState,
  type HcaiUsageResponse,
} from "@/lib/hcai/types";
import { extractErrorMessage } from "@/utils/errorUtils";

interface HcaiPanelProps {
  onProvidersChanged?: () => void;
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

type HcaiPage = "hub" | "add";

export function HcaiPanel({ onProvidersChanged }: HcaiPanelProps) {
  const { t } = useTranslation();
  /** hub：密钥概览；add：添加配置 / 模型 / 写入应用 */
  const [page, setPage] = useState<HcaiPage>("hub");
  const [store, setStore] = useState<HcaiStoreState>(() => loadHcaiStore());
  const [draftKey, setDraftKey] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  /** 写入各应用时的供应商显示名称（可自定义） */
  const [providerName, setProviderName] = useState("HCAI");
  const providerNameTouchedRef = useRef(false);
  const [usage, setUsage] = useState<HcaiUsageResponse | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [applying, setApplying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HcaiSavedKey | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  /** Avoid duplicate auto-queries for the same key (Enter then blur). */
  const lastQueriedKeyRef = useRef<string>("");

  const activeKey = getActiveHcaiKey(store);

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

  const persist = useCallback((next: HcaiStoreState) => {
    setStore(next);
    saveHcaiStore(next);
  }, []);

  const applyModelDefaults = useCallback((ids: string[]) => {
    const claude = ids.filter(isClaudeFamilyModel);
    const codex = ids.filter(isCodexFamilyModel);
    const grok = ids.filter(isGrokFamilyModel);
    const hasClaude = claude.length > 0;
    const hasCodex = codex.length > 0;
    const hasGrok = grok.length > 0;
    // 仅勾选密钥实际支持的分组（Grok 密钥一键默认勾选 Grok Build）
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
    async (apiKey: string, opts?: { force?: boolean }) => {
      const key = apiKey.trim();
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
        // Allow retry on next blur/enter after failure
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

  const queryKeyIfReady = useCallback(() => {
    const key = draftKey.trim();
    if (!key) return;
    void refreshForKey(key);
  }, [draftKey, refreshForKey]);

  const openExternal = useCallback(
    async (url: string) => {
      try {
        await openUrl(url);
      } catch (err) {
        // Fallback for non-Tauri / restricted environments
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

  useEffect(() => {
    const s = loadHcaiStore();
    setStore(s);
    const active = getActiveHcaiKey(s);
    if (active) {
      setDraftKey(active.apiKey);
      setDraftLabel(active.label);
      void refreshForKey(active.apiKey);
    }
    // Mount-only: load saved keys when entering HCAI view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveKey = () => {
    if (!draftKey.trim()) {
      toast.error(t("hcai.needKey", { defaultValue: "请输入 API Key" }));
      return;
    }
    const next = upsertHcaiKey(store, {
      apiKey: draftKey,
      label: draftLabel || undefined,
    });
    persist(next);
    toast.success(t("hcai.keySaved", { defaultValue: "密钥已保存到本机" }));
    void refreshForKey(draftKey);
  };

  const handleSelectKey = (keyId: string) => {
    const next = setActiveHcaiKey(store, keyId);
    persist(next);
    const k = next.keys.find((x) => x.id === keyId);
    if (k) {
      setDraftKey(k.apiKey);
      setDraftLabel(k.label);
      void refreshForKey(k.apiKey);
    }
    // 选中密钥时回到概览页
    setPage("hub");
  };

  /** 打开添加配置页：可预填指定密钥，便于直接写入应用 */
  const openAddPage = useCallback(
    (opts?: { fresh?: boolean; key?: HcaiSavedKey }) => {
      if (opts?.fresh) {
        setDraftKey("");
        setDraftLabel("");
        setUsage(null);
        setModels([]);
        lastQueriedKeyRef.current = "";
        providerNameTouchedRef.current = false;
        setProviderName("HCAI");
      } else {
        const k = opts?.key ?? getActiveHcaiKey(loadHcaiStore());
        if (k) {
          setDraftKey(k.apiKey);
          setDraftLabel(k.label);
          void refreshForKey(k.apiKey);
        }
      }
      setPage("add");
    },
    [refreshForKey],
  );

  const handleDeleteKey = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const links = deleteTarget.linkedProviders ?? [];
      for (const link of links) {
        try {
          await providersApi.delete(link.providerId, link.appId);
        } catch (err) {
          console.error("[HCAI] delete linked provider failed", link, err);
        }
      }
      const { state: next } = removeHcaiKey(store, deleteTarget.id);
      persist(next);
      if (next.activeKeyId) {
        const k = next.keys.find((x) => x.id === next.activeKeyId);
        if (k) {
          setDraftKey(k.apiKey);
          setDraftLabel(k.label);
          void refreshForKey(k.apiKey);
        }
      } else {
        setDraftKey("");
        setDraftLabel("");
        setUsage(null);
        setModels([]);
      }
      toast.success(
        t("hcai.keyDeleted", {
          defaultValue: "密钥及关联供应商配置已删除",
        }),
      );
      onProvidersChanged?.();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const planName = usage?.planName?.trim();

  // 查询额度后：若用户未手改名称，用套餐名生成默认名
  useEffect(() => {
    if (providerNameTouchedRef.current) return;
    if (planName && planName !== "钱包余额") {
      setProviderName(`HCAI · ${planName}`);
    }
  }, [planName]);

  const displayName = providerName.trim() || "HCAI";

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

    // Ensure key is saved so we can attach links
    let nextStore = upsertHcaiKey(store, {
      apiKey,
      label: draftLabel || undefined,
    });
    const keyId = nextStore.activeKeyId!;
    persist(nextStore);

    setApplying(true);
    const links = [];
    try {
      // 主站不可达时自动切备用，并把可用节点写入各应用配置
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
      persist(nextStore);
      toast.success(
        t("hcai.applySuccess", {
          defaultValue: "已添加 {{count}} 个供应商配置",
          count: links.length,
        }),
      );
      onProvidersChanged?.();
      setPage("hub");
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

  const unit = usage?.unit || "USD";
  const isSubscription = Boolean(usage?.subscription);

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

  const usageBlock = (
    <>
      {loadingUsage && !usage ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("hcai.loadingUsage", { defaultValue: "正在查询额度…" })}
        </div>
      ) : usage ? (
        <div className="space-y-3">
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
              <StatCard
                label={t("hcai.todayRequests", { defaultValue: "今日请求" })}
                value={formatInt(usage.usage?.today?.requests)}
              />
              <StatCard
                label={t("hcai.todayTokens", { defaultValue: "今日 TOKEN" })}
                value={formatInt(usage.usage?.today?.total_tokens)}
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
              <StatCard
                label={t("hcai.todayTokens", { defaultValue: "今日 TOKEN" })}
                value={formatInt(usage.usage?.today?.total_tokens)}
              />
              <StatCard
                label={t("hcai.totalRequests", { defaultValue: "总请求" })}
                value={formatInt(usage.usage?.total?.requests)}
              />
              <StatCard
                label={t("hcai.totalTokens", { defaultValue: "总 TOKEN" })}
                value={formatInt(usage.usage?.total?.total_tokens)}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {activeKey
            ? t("hcai.usageLoadingHint", {
                defaultValue: "正在加载额度，或点击刷新重试",
              })
            : t("hcai.usageHintEmpty", {
                defaultValue: "请在右侧选择密钥，或点击「+」添加配置",
              })}
        </p>
      )}
    </>
  );

  const modelsChips = (
    <>
      {models.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("hcai.noModels", {
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
    </>
  );

  return (
    <>
      <div className="px-6 py-4 space-y-6 w-full">
        {/* Brand banner */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <ProviderIcon icon={HCAI_ICON} name="HCAI" size={28} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold">
                  {t("hcai.brandName", { defaultValue: "HCAI 中转站" })}
                </h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {t("hcai.badge", { defaultValue: "中转站" })}
                </span>
              </div>
              <p className="text-sm text-white/70 mt-1">
                {t("hcai.tagline", {
                  defaultValue: "全球 AI 算力分发平台 · 安全连接，智创未来",
                })}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0 relative z-10 bg-white text-slate-900 hover:bg-white/90 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90 shadow-sm border-0"
            onMouseDown={(e) => {
              e.preventDefault();
              void openExternal(HCAI_WEBSITE);
            }}
          >
            <ExternalLink className="h-4 w-4 mr-1.5" />
            {t("hcai.openSite", { defaultValue: "立即查看" })}
          </Button>
        </div>

        {page === "hub" ? (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            {/* Left: selected key usage + models */}
            <div className="xl:col-span-3 space-y-4">
              <section className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm">
                      {t("hcai.overview", { defaultValue: "额度与用量" })}
                    </h3>
                    {activeKey && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {activeKey.label}
                        <span className="font-mono ml-1.5 opacity-80">
                          {maskApiKey(activeKey.apiKey)}
                        </span>
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={
                      !activeKey?.apiKey || loadingUsage || loadingModels
                    }
                    onClick={() =>
                      activeKey &&
                      void refreshForKey(activeKey.apiKey, { force: true })
                    }
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
                {usageBlock}
              </section>

              <section className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">
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
                {modelsChips}
              </section>
            </div>

            {/* Right: key management + add */}
            <div className="xl:col-span-2 space-y-4">
              <section className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">
                    {t("hcai.savedKeys", { defaultValue: "密钥管理" })}
                  </h3>
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => openAddPage({ fresh: true })}
                    title={t("hcai.addConfig", {
                      defaultValue: "添加配置",
                    })}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("hcai.savedKeysHint", {
                    defaultValue:
                      "点击密钥查看额度与模型；右上角「+」添加密钥并写入应用。删除会移除本面板创建的关联供应商。",
                  })}
                </p>
                {store.keys.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-10 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t("hcai.noSavedKeys", {
                        defaultValue: "暂无保存的密钥。",
                      })}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => openAddPage({ fresh: true })}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      {t("hcai.addConfig", { defaultValue: "添加配置" })}
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {store.keys.map((k) => {
                      const active = activeKey?.id === k.id;
                      return (
                        <li
                          key={k.id}
                          className={cn(
                            "rounded-lg border p-3 flex items-center gap-2 transition-colors",
                            active
                              ? "border-primary/50 bg-primary/5"
                              : "border-border hover:bg-muted/40",
                          )}
                        >
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left"
                            onClick={() => handleSelectKey(k.id)}
                          >
                            <div className="font-medium text-sm truncate">
                              {k.label}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono truncate">
                              {maskApiKey(k.apiKey)}
                            </div>
                            {k.linkedProviders.length > 0 && (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                {t("hcai.linkedCount", {
                                  defaultValue: "关联 {{count}} 个配置",
                                  count: k.linkedProviders.length,
                                })}
                              </div>
                            )}
                          </button>
                          <div className="flex flex-row items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = setActiveHcaiKey(store, k.id);
                                persist(next);
                                openAddPage({ key: k });
                              }}
                              title={t("common.edit", {
                                defaultValue: "编辑",
                              })}
                              aria-label={t("common.edit", {
                                defaultValue: "编辑",
                              })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(k);
                              }}
                              title={t("common.delete", {
                                defaultValue: "删除",
                              })}
                              aria-label={t("common.delete", {
                                defaultValue: "删除",
                              })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : (
          /* —— 添加配置页 —— */
          <div className="space-y-4 max-w-4xl">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setPage("hub")}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                {t("common.back", { defaultValue: "返回" })}
              </Button>
              <h3 className="font-semibold text-sm">
                {t("hcai.addConfigPage", {
                  defaultValue: "添加配置",
                })}
              </h3>
            </div>

            {/* 密钥输入 */}
            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
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
                      (e.target as HTMLInputElement).blur();
                      queryKeyIfReady();
                    }
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      queryKeyIfReady();
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
                    className="shrink-0 h-9 relative z-10"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void openExternal(HCAI_KEYS_URL);
                    }}
                  >
                    {t("hcai.getKey", { defaultValue: "获取密钥" })}
                  </Button>
                </div>
              </div>

              {usage && (
                <div className="pt-2 border-t border-border/60">
                  {usageBlock}
                </div>
              )}
            </section>

            {/* 可用模型 */}
            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">
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
              {modelsChips}
              {fableInList && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t("hcai.fableHint", {
                    defaultValue:
                      "检测到 Fable 模型（{{model}}），Claude Code / Desktop 的 Fable 角色已默认选中，可按需修改。",
                    model: fableInList,
                  })}
                </p>
              )}
              {grokModels.length > 0 && (
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  {t("hcai.grokHint", {
                    defaultValue:
                      "检测到 Grok 模型（{{count}} 个），已默认勾选 Grok Build，可一键写入配置。",
                    count: grokModels.length,
                  })}
                </p>
              )}
            </section>

            {/* 添加到应用 */}
            <section className="rounded-xl border border-border bg-card p-4 space-y-4">
              <h3 className="font-semibold text-sm">
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
                <p className="text-[11px] text-muted-foreground">
                  {t("hcai.grokWriteHint", {
                    defaultValue:
                      "将写入 Grok Build：default=custom、api_key 与 HCAI /v1 端点",
                  })}
                </p>
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
                    {t("hcai.providerName", {
                      defaultValue: "配置名称",
                    })}
                  </Label>
                  <Input
                    value={providerName}
                    onChange={(e) => {
                      providerNameTouchedRef.current = true;
                      setProviderName(e.target.value);
                    }}
                    placeholder={t("hcai.providerNamePlaceholder", {
                      defaultValue: "例如：HCAI · 家庭版",
                    })}
                    className="h-9 max-w-md"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("hcai.writeHint", {
                      defaultValue: "将以副本形式添加配置；名称：{{name}}",
                      name: displayName,
                    })}
                  </p>
                </div>
                <Button
                  onClick={() => void handleApply()}
                  disabled={applying}
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
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={t("hcai.deleteTitle", { defaultValue: "删除 HCAI 密钥？" })}
        message={t("hcai.deleteMessage", {
          defaultValue:
            "将删除本机保存的密钥，并移除该密钥通过本面板创建的 {{count}} 个供应商配置。此操作不可撤销。",
          count: deleteTarget?.linkedProviders.length ?? 0,
        })}
        onConfirm={() => {
          void handleDeleteKey();
        }}
        onCancel={() => setDeleteTarget(null)}
        confirmText={deleting ? t("common.deleting") : t("common.delete")}
      />
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5 tabular-nums break-all">
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
  /** 允许清空（如可选的 Fable 角色） */
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  // Radix Select 不允许 value=""，用哨兵表示「不配置」
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
