import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Settings,
  Minus,
  Maximize2,
  Minimize2,
  X,
  Book,
  Wrench,
  History,
  BarChart2,
  Download,
  FolderArchive,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Monitor,
  Terminal,
  ChevronDown,
  Bot,
  Layers,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Provider, VisibleApps } from "@/types";
import type { EnvConflict } from "@/types/env";
import {
  useProvidersQuery,
  useSettingsQuery,
  useAddProviderMutation,
} from "@/lib/query";
import {
  providersApi,
  settingsApi,
  type AppId,
  type ProviderSwitchEvent,
} from "@/lib/api";
import { checkAllEnvConflicts, checkEnvConflicts } from "@/lib/api/env";
import { useProviderActions } from "@/hooks/useProviderActions";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { useUsageCacheBridge } from "@/hooks/useUsageCacheBridge";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useLastValidValue } from "@/hooks/useLastValidValue";
import { useScanUnmanagedSkills } from "@/hooks/useSkills";
import { extractErrorMessage } from "@/utils/errorUtils";
import { isTextEditableTarget } from "@/utils/domUtils";
import { deepClone } from "@/utils/deepClone";
import { cn } from "@/lib/utils";
import { injectCodingPlanUsageScript } from "@/config/codingPlanProviders";
import {
  isWindows,
  isLinux,
  DRAG_REGION_ATTR,
  DRAG_REGION_STYLE,
} from "@/lib/platform";
import { AppSwitcher } from "@/components/AppSwitcher";
import { ProfileSwitcher } from "@/components/profiles/ProfileSwitcher";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProviderList } from "@/components/providers/ProviderList";
import { AddProviderDialog } from "@/components/providers/AddProviderDialog";
import { EditProviderDialog } from "@/components/providers/EditProviderDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { UpdateBadge } from "@/components/UpdateBadge";
import { EnvWarningBanner } from "@/components/env/EnvWarningBanner";
import { ProxyToggle } from "@/components/proxy/ProxyToggle";
import { ClaudeDesktopRouteToggle } from "@/components/proxy/ClaudeDesktopRouteToggle";
import { FailoverToggle } from "@/components/proxy/FailoverToggle";
import UsageScriptModal from "@/components/UsageScriptModal";
import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";
import PromptPanel from "@/components/prompts/PromptPanel";
import {
  SkillsPage,
  getSkillsPageHeaderActions,
  type SkillsPageSource,
} from "@/components/skills/SkillsPage";
import UnifiedSkillsPanel from "@/components/skills/UnifiedSkillsPanel";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { FirstRunNoticeDialog } from "@/components/FirstRunNoticeDialog";
import { AgentsPanel } from "@/components/agents/AgentsPanel";
import { UniversalProviderPanel } from "@/components/universal";
import { McpIcon } from "@/components/BrandIcons";
import { Button } from "@/components/ui/button";
import { SessionManagerPage } from "@/components/sessions/SessionManagerPage";
import { UsagePage } from "@/components/usage/UsagePage";
import InstallToolsPage from "@/components/install/InstallToolsPage";
import {
  useDisableCurrentOmo,
  useDisableCurrentOmoSlim,
} from "@/lib/query/omo";
import appIcon from "@/assets/icons/app-icon.png";
import { HcaiPanel } from "@/components/hcai/HcaiPanel";
import { ProviderIcon } from "@/components/ProviderIcon";
type View =
  | "providers"
  | "settings"
  | "prompts"
  | "skills"
  | "skillsDiscovery"
  | "mcp"
  | "agents"
  | "universal"
  | "sessions"
  | "usage"
  | "install"
  | "hcai";

interface SyncStatusUpdatedPayload {
  source?: string;
  status?: string;
  error?: string;
}

const DEFAULT_DRAG_BAR_HEIGHT = isWindows() || isLinux() ? 0 : 28; // px
const HEADER_HEIGHT = 64; // px
const SIDEBAR_WIDTH_EXPANDED = 220; // px — icon + label + section titles
const SIDEBAR_WIDTH_COLLAPSED = 80; // px — icon only (slightly roomier than 68)
const SIDEBAR_EXPANDED_KEY = "cc-switch-sidebar-expanded";

const ADDABLE_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "opencode",
  "grok",
];

/** Header title for the app currently being configured */
const ACTIVE_APP_META: Record<
  AppId,
  { icon: string; name: string; badge?: typeof Terminal; beta?: boolean }
> = {
  claude: { icon: "claude", name: "Claude Code", badge: Terminal },
  "claude-desktop": {
    icon: "claude",
    name: "Claude Desktop",
    badge: Monitor,
  },
  codex: { icon: "openai", name: "Codex" },
  opencode: { icon: "opencode", name: "OpenCode" },
  grok: { icon: "grok", name: "Grok Build", beta: true },
};

/** Header icon (replaces back button) for non-provider views — colored */
const VIEW_HEADER_ICON: Partial<
  Record<
    View,
    { Icon: LucideIcon; className: string } | { kind: "mcp"; className: string }
  >
> = {
  usage: { Icon: BarChart2, className: "text-violet-500 dark:text-violet-400" },
  skills: { Icon: Wrench, className: "text-amber-500 dark:text-amber-400" },
  skillsDiscovery: {
    Icon: Search,
    className: "text-amber-500 dark:text-amber-400",
  },
  prompts: { Icon: Book, className: "text-emerald-500 dark:text-emerald-400" },
  sessions: {
    Icon: History,
    className: "text-fuchsia-500 dark:text-fuchsia-400",
  },
  mcp: { kind: "mcp", className: "text-cyan-500 dark:text-cyan-400" },
  settings: { Icon: Settings, className: "text-sky-500 dark:text-sky-400" },
  install: {
    Icon: Download,
    className: "text-emerald-500 dark:text-emerald-400",
  },
  agents: { Icon: Bot, className: "text-rose-500 dark:text-rose-400" },
  universal: {
    Icon: Layers,
    className: "text-indigo-500 dark:text-indigo-400",
  },
};

const STORAGE_KEY = "cc-switch-last-app";
const VALID_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "opencode",
  "grok",
];

const getInitialApp = (): AppId => {
  const saved = localStorage.getItem(STORAGE_KEY) as AppId | null;
  if (saved && VALID_APPS.includes(saved)) {
    return saved;
  }
  // Migrate away from removed apps (gemini/openclaw/hermes)
  if (saved) {
    localStorage.setItem(STORAGE_KEY, "claude");
  }
  return "claude";
};

const VIEW_STORAGE_KEY = "cc-switch-last-view";
const VALID_VIEWS: View[] = [
  "providers",
  "settings",
  "prompts",
  "skills",
  "skillsDiscovery",
  "mcp",
  "agents",
  "universal",
  "sessions",
  "usage",
  "hcai",
];

const getInitialView = (): View => {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY) as View | null;
  if (saved && VALID_VIEWS.includes(saved)) {
    return saved;
  }
  return "providers";
};

function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeApp, setActiveApp] = useState<AppId>(getInitialApp);
  const sharedFeatureApp: AppId =
    activeApp === "claude-desktop" ? "claude" : activeApp;
  const [currentView, setCurrentView] = useState<View>(getInitialView);
  const [skillsDiscoverySource, setSkillsDiscoverySource] =
    useState<SkillsPageSource>("repos");
  const [settingsDefaultTab, setSettingsDefaultTab] = useState("general");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddAppSelectorOpen, setIsAddAppSelectorOpen] = useState(false);
  const [addForAppId, setAddForAppId] = useState<AppId | null>(null);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_EXPANDED_KEY);
    // Default expanded; only collapse when user explicitly saved false
    return saved !== "false";
  });
  const sidebarMiddleRef = useRef<HTMLDivElement>(null);
  const [sidebarCanScrollDown, setSidebarCanScrollDown] = useState(false);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, currentView);
  }, [currentView]);

  // Leave add/edit when navigating away from the provider list (sidebar stays usable)
  useEffect(() => {
    if (currentView !== "providers") {
      setIsAddOpen(false);
      setIsAddAppSelectorOpen(false);
      setAddForAppId(null);
      setEditingProvider(null);
    }
  }, [currentView]);

  // Also clear overlays when the active app changes (e.g. user switches app
  // while a provider config edit dialog is open). This ensures we don't
  // remain on a stale editing page for the previous app.
  useEffect(() => {
    setIsAddOpen(false);
    setIsAddAppSelectorOpen(false);
    setAddForAppId(null);
    setEditingProvider(null);
    setConfirmAction(null);
    setUsageProvider(null);
  }, [activeApp]);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_EXPANDED_KEY,
      sidebarExpanded ? "true" : "false",
    );
  }, [sidebarExpanded]);

  const { data: settingsData } = useSettingsQuery();
  const useAppWindowControls =
    isLinux() && (settingsData?.useAppWindowControls ?? false);
  const dragBarHeight = useAppWindowControls ? 32 : DEFAULT_DRAG_BAR_HEIGHT;
  // Sidebar stays visible on all main views (apps, tools, settings)
  const showSidebar = true;
  const sidebarWidth = sidebarExpanded
    ? SIDEBAR_WIDTH_EXPANDED
    : SIDEBAR_WIDTH_COLLAPSED;
  const visibleApps: VisibleApps = settingsData?.visibleApps ?? {
    claude: true,
    "claude-desktop": true,
    codex: true,
    opencode: true,
    grok: true,
  };

  const getFirstVisibleApp = (): AppId => {
    if (visibleApps.claude) return "claude";
    if (visibleApps["claude-desktop"]) return "claude-desktop";
    if (visibleApps.codex) return "codex";
    if (visibleApps.opencode) return "opencode";
    if (visibleApps.grok) return "grok";
    return "claude"; // fallback
  };

  useEffect(() => {
    const isVisible =
      activeApp === "claude" ||
      activeApp === "claude-desktop" ||
      activeApp === "codex" ||
      activeApp === "opencode" ||
      activeApp === "grok"
        ? (visibleApps[activeApp] ?? true)
        : false;
    if (!isVisible) {
      setActiveApp(getFirstVisibleApp());
    }
  }, [visibleApps, activeApp]);

  // Fallback from sessions view when switching to an app without session support
  useEffect(() => {
    if (
      currentView === "sessions" &&
      sharedFeatureApp !== "claude" &&
      sharedFeatureApp !== "codex" &&
      sharedFeatureApp !== "opencode" &&
      sharedFeatureApp !== "grok"
    ) {
      setCurrentView("providers");
    }
  }, [sharedFeatureApp, currentView]);

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [usageProvider, setUsageProvider] = useState<Provider | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    provider: Provider;
    action: "remove" | "delete";
  } | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflict[]>([]);
  const [showEnvBanner, setShowEnvBanner] = useState(false);

  const effectiveEditingProvider = useLastValidValue(editingProvider);
  const effectiveUsageProvider = useLastValidValue(usageProvider);

  useUsageCacheBridge();

  const promptPanelRef = useRef<any>(null);
  const mcpPanelRef = useRef<any>(null);
  const skillsPageRef = useRef<any>(null);
  const unifiedSkillsPanelRef = useRef<any>(null);
  // 订阅未管理 Skill 的共享缓存（实际扫描由 UnifiedSkillsPanel 进入页面时触发）。
  // 这里 enabled 默认 false，仅用于「导入」按钮的绿点提示，不主动发起扫描。
  const { data: unmanagedSkills } = useScanUnmanagedSkills();
  const hasUnmanagedSkills = (unmanagedSkills?.length ?? 0) > 0;
  const addActionButtonClass =
    "bg-orange-500 hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 dark:shadow-orange-500/40 rounded-full w-8 h-8";

  const {
    isRunning: isProxyRunning,
    takeoverStatus,
    status: proxyStatus,
  } = useProxyStatus();
  const isCurrentAppTakeoverActive = takeoverStatus?.[activeApp] || false;
  const activeProviderId = useMemo(() => {
    const target = proxyStatus?.active_targets?.find(
      (t) => t.app_type === activeApp,
    );
    return target?.provider_id;
  }, [proxyStatus?.active_targets, activeApp]);

  // Down-arrow hint above the add button when middle content can scroll further
  useEffect(() => {
    if (!showSidebar) {
      setSidebarCanScrollDown(false);
      return;
    }

    const el = sidebarMiddleRef.current;
    if (!el) return;

    const update = () => {
      // 1px / 2px slack for sub-pixel rounding
      const canDown =
        el.scrollHeight > el.clientHeight + 1 &&
        el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      setSidebarCanScrollDown(canDown);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) {
      ro.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [showSidebar, sidebarExpanded, activeApp, isCurrentAppTakeoverActive]);

  const { data, isLoading, refetch } = useProvidersQuery(activeApp, {
    isProxyRunning,
  });
  const providers = useMemo(() => data?.providers ?? {}, [data]);
  const currentProviderId = data?.currentProviderId ?? "";
  const hasSkillsSupport = true;
  const hasSessionSupport =
    sharedFeatureApp === "claude" ||
    sharedFeatureApp === "codex" ||
    sharedFeatureApp === "opencode" ||
    sharedFeatureApp === "grok";

  const {
    addProvider,
    updateProvider,
    switchProvider,
    deleteProvider,
    saveUsageScript,
  } = useProviderActions(
    activeApp,
    isProxyRunning,
    isProxyRunning && isCurrentAppTakeoverActive,
  );

  // Mutations for adding to any specific app (used by the app selector popover on the add button)
  const addProviderMutationMap = {
    claude: useAddProviderMutation("claude"),
    "claude-desktop": useAddProviderMutation("claude-desktop"),
    codex: useAddProviderMutation("codex"),
    opencode: useAddProviderMutation("opencode"),
    grok: useAddProviderMutation("grok"),
  };

  const handleAddProvider = useCallback(
    async (
      provider: Omit<Provider, "id"> & {
        providerKey?: string;
        ensureClaudeDesktopOfficialSeed?: boolean;
        ensureCodexOfficialSeed?: boolean;
      },
      targetAppId?: AppId,
    ) => {
      const target = targetAppId || activeApp;
      const enhanced = injectCodingPlanUsageScript(target, provider);
      const mutation = addProviderMutationMap[target];
      await mutation.mutateAsync(enhanced);
    },
    [activeApp, addProviderMutationMap],
  );

  const disableOmoMutation = useDisableCurrentOmo();
  const handleDisableOmo = () => {
    disableOmoMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  const disableOmoSlimMutation = useDisableCurrentOmoSlim();
  const handleDisableOmoSlim = () => {
    disableOmoSlimMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const setupListener = async () => {
      try {
        const off = await providersApi.onSwitched(
          async (event: ProviderSwitchEvent) => {
            if (event.appType === activeApp) {
              await refetch();
            }
          },
        );
        if (!active) {
          off();
          return;
        }
        unsubscribe = off;
      } catch (error) {
        console.error("[App] Failed to subscribe provider switch event", error);
      }
    };

    void setupListener();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [activeApp, refetch]);

  useTauriEvent("universal-provider-synced", async () => {
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to update tray menu", error);
    }
  });

  // 应用项目后刷新相关缓存（providers 由既有 provider-switched 监听承接；
  // proxy 状态由后端直接改 DB，不走 mutation，必须显式刷新）
  useTauriEvent("profile-applied", async () => {
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    await queryClient.invalidateQueries({ queryKey: ["mcp", "all"] });
    await queryClient.invalidateQueries({ queryKey: ["skills"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyTakeoverStatus"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyStatus"] });
    await queryClient.invalidateQueries({
      queryKey: ["providers", "claude-desktop"],
    });
  });

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "webdav-sync-status-updated",
    async (payload) => {
      const statusPayload = payload ?? {};
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (statusPayload.source !== "auto" || statusPayload.status !== "error") {
        return;
      }
      toast.error(
        t("settings.webdavSync.autoSyncFailedToast", {
          error: statusPayload.error || t("common.unknown"),
        }),
      );
    },
  );

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "s3-sync-status-updated",
    async (payload) => {
      const statusPayload = payload ?? {};
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (statusPayload.source !== "auto" || statusPayload.status !== "error") {
        return;
      }
      toast.error(
        t("settings.s3Sync.autoSyncFailedToast", {
          error: statusPayload.error || t("common.unknown"),
        }),
      );
    },
  );

  useTauriEvent<{ appType: string; providerName: string }>(
    "proxy-official-warning",
    (payload) => {
      toast.warning(
        t("notifications.proxyOfficialWarning", {
          name: payload.providerName,
          defaultValue: `当前供应商 ${payload.providerName} 是官方供应商，建议切换到第三方供应商后再使用代理接管`,
        }),
        { duration: 8000 },
      );
    },
  );

  useEffect(() => {
    let active = true;
    let unlistenResize: (() => void) | undefined;

    const setupWindowStateSync = async () => {
      try {
        const currentWindow = getCurrentWindow();
        const syncWindowMaximizedState = async () => {
          const maximized = await currentWindow.isMaximized();
          if (active) {
            setIsWindowMaximized(maximized);
          }
        };

        await syncWindowMaximizedState();
        unlistenResize = await currentWindow.onResized(() => {
          void syncWindowMaximizedState();
        });
      } catch (error) {
        console.error("[App] Failed to sync window maximized state", error);
      }
    };

    void setupWindowStateSync();
    return () => {
      active = false;
      unlistenResize?.();
    };
  }, []);

  useEffect(() => {
    // settingsData 未加载时跳过，避免用 fallback false 覆盖 Rust 侧已设好的装饰状态
    if (!settingsData) return;

    const syncWindowDecorations = async () => {
      try {
        await getCurrentWindow().setDecorations(!useAppWindowControls);
      } catch (error) {
        console.error("[App] Failed to update window decorations", error);
      }
    };

    void syncWindowDecorations();
  }, [useAppWindowControls, settingsData]);

  useEffect(() => {
    const checkEnvOnStartup = async () => {
      try {
        const allConflicts = await checkAllEnvConflicts();
        const flatConflicts = Object.values(allConflicts).flat();

        if (flatConflicts.length > 0) {
          setEnvConflicts(flatConflicts);
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on startup:",
          error,
        );
      }
    };

    checkEnvOnStartup();
  }, []);

  useEffect(() => {
    const checkMigration = async () => {
      try {
        const migrated = await invoke<boolean>("get_migration_result");
        if (migrated) {
          toast.success(
            t("migration.success", { defaultValue: "配置迁移成功" }),
            { closeButton: true },
          );
        }
      } catch (error) {
        console.error("[App] Failed to check migration result:", error);
      }
    };

    checkMigration();
  }, [t]);

  useEffect(() => {
    const checkSkillsMigration = async () => {
      try {
        const result = await invoke<{ count: number; error?: string } | null>(
          "get_skills_migration_result",
        );
        if (result?.error) {
          toast.error(t("migration.skillsFailed"), {
            description: t("migration.skillsFailedDescription"),
            closeButton: true,
          });
          console.error("[App] Skills SSOT migration failed:", result.error);
          return;
        }
        if (result && result.count > 0) {
          toast.success(t("migration.skillsSuccess", { count: result.count }), {
            closeButton: true,
          });
          await queryClient.invalidateQueries({ queryKey: ["skills"] });
        }
      } catch (error) {
        console.error("[App] Failed to check skills migration result:", error);
      }
    };

    checkSkillsMigration();
  }, [t, queryClient]);

  useEffect(() => {
    const checkEnvOnSwitch = async () => {
      try {
        const conflicts = await checkEnvConflicts(activeApp);

        if (conflicts.length > 0) {
          setEnvConflicts((prev) => {
            const existingKeys = new Set(
              prev.map((c) => `${c.varName}:${c.sourcePath}`),
            );
            const newConflicts = conflicts.filter(
              (c) => !existingKeys.has(`${c.varName}:${c.sourcePath}`),
            );
            return [...prev, ...newConflicts];
          });
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on app switch:",
          error,
        );
      }
    };

    checkEnvOnSwitch();
  }, [activeApp]);

  const currentViewRef = useRef(currentView);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCurrentView("settings");
        return;
      }

      if (event.key !== "Escape" || event.defaultPrevented) return;

      if (document.body.style.overflow === "hidden") return;

      const view = currentViewRef.current;
      if (view === "providers") return;

      if (isTextEditableTarget(event.target)) return;

      event.preventDefault();
      setCurrentView(view === "skillsDiscovery" ? "skills" : "providers");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleOpenWebsite = async (url: string) => {
    try {
      await settingsApi.openExternal(url);
    } catch (error) {
      const detail =
        extractErrorMessage(error) ||
        t("notifications.openLinkFailed", {
          defaultValue: "链接打开失败",
        });
      toast.error(detail);
    }
  };

  const handleEditProvider = async ({
    provider,
    originalId,
  }: {
    provider: Provider;
    originalId?: string;
  }) => {
    await updateProvider(provider, originalId);
    setEditingProvider(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { provider, action } = confirmAction;

    if (action === "remove") {
      // Remove from live config only (for additive mode apps like OpenCode)
      // Does NOT delete from database - provider remains in the list
      await providersApi.removeFromLiveConfig(provider.id, activeApp);
      // Invalidate queries to refresh the isInConfig state
      if (activeApp === "opencode") {
        await queryClient.invalidateQueries({
          queryKey: ["opencodeLiveProviderIds"],
        });
      }
      toast.success(
        t("notifications.removeFromConfigSuccess", {
          defaultValue: "已从配置移除",
        }),
        { closeButton: true },
      );
    } else {
      await deleteProvider(provider.id);
    }
    setConfirmAction(null);
  };

  const generateUniqueProviderCopyKey = (
    originalKey: string,
    existingKeys: string[],
  ): string => {
    const baseKey = `${originalKey}-copy`;

    if (!existingKeys.includes(baseKey)) {
      return baseKey;
    }

    let counter = 2;
    while (existingKeys.includes(`${baseKey}-${counter}`)) {
      counter++;
    }
    return `${baseKey}-${counter}`;
  };

  const handleDuplicateProvider = async (provider: Provider) => {
    const newSortIndex =
      provider.sortIndex !== undefined ? provider.sortIndex + 1 : undefined;

    const duplicatedProvider: Omit<Provider, "id" | "createdAt"> & {
      providerKey?: string;
      addToLive?: boolean;
    } = {
      name: `${provider.name} copy`,
      settingsConfig: deepClone(provider.settingsConfig),
      websiteUrl: provider.websiteUrl,
      category: provider.category,
      sortIndex: newSortIndex, // 复制原 sortIndex + 1
      meta: provider.meta ? deepClone(provider.meta) : undefined,
      icon: provider.icon,
      iconColor: provider.iconColor,
    };

    if (activeApp === "opencode") {
      let liveProviderIds: string[] = [];
      try {
        liveProviderIds = await queryClient.ensureQueryData({
          queryKey: ["opencodeLiveProviderIds"],
          queryFn: () => providersApi.getOpenCodeLiveProviderIds(),
        });
      } catch (error) {
        console.error(
          "[App] Failed to load live provider IDs for duplication",
          error,
        );
        const errorMessage = extractErrorMessage(error);
        toast.error(
          t("provider.duplicateLiveIdsLoadFailed", {
            defaultValue: "读取配置中的供应商标识失败，请先修复配置后再试",
          }) + (errorMessage ? `: ${errorMessage}` : ""),
        );
        return;
      }
      const existingKeys = Array.from(
        new Set([...Object.keys(providers), ...liveProviderIds]),
      );
      duplicatedProvider.providerKey = generateUniqueProviderCopyKey(
        provider.id,
        existingKeys,
      );
      duplicatedProvider.addToLive = false;
    }

    if (provider.sortIndex !== undefined) {
      const updates = Object.values(providers)
        .filter(
          (p) =>
            p.sortIndex !== undefined &&
            p.sortIndex >= newSortIndex! &&
            p.id !== provider.id,
        )
        .map((p) => ({
          id: p.id,
          sortIndex: p.sortIndex! + 1,
        }));

      if (updates.length > 0) {
        try {
          await providersApi.updateSortOrder(updates, activeApp);
        } catch (error) {
          console.error("[App] Failed to update sort order", error);
          toast.error(
            t("provider.sortUpdateFailed", {
              defaultValue: "排序更新失败",
            }),
          );
          return; // 如果排序更新失败，不继续添加
        }
      }
    }

    await addProvider(duplicatedProvider);
  };

  const handleOpenTerminal = async (provider: Provider) => {
    try {
      const selectedDir = await settingsApi.pickDirectory();
      if (!selectedDir) {
        return;
      }

      await providersApi.openTerminal(provider.id, activeApp, {
        cwd: selectedDir,
      });
      toast.success(
        t("provider.terminalOpened", {
          defaultValue: "终端已打开",
        }),
      );
    } catch (error) {
      console.error("[App] Failed to open terminal", error);
      const errorMessage = extractErrorMessage(error);
      toast.error(
        t("provider.terminalOpenFailed", {
          defaultValue: "打开终端失败",
        }) + (errorMessage ? `: ${errorMessage}` : ""),
      );
    }
  };

  const handleLaunchCodexDesktop = async () => {
    try {
      await providersApi.launchCodexDesktop();
      toast.success(
        t("codex.launchDesktopSuccess", {
          defaultValue: "ChatGPT（Codex Desktop）已重启",
        }),
      );
    } catch (error: any) {
      const msg = extractErrorMessage(error) || String(error);
      const lower = msg.toLowerCase();
      if (
        lower.includes("未安装") ||
        lower.includes("not installed") ||
        lower.includes("no such") ||
        lower.includes("not found") ||
        lower.includes("找不到")
      ) {
        toast.error(
          t("codex.desktopNotInstalled", {
            defaultValue:
              "未检测到 ChatGPT / Codex Desktop，请先安装官方桌面应用后再尝试启动。",
          }),
        );
      } else {
        toast.error(
          t("codex.launchDesktopFailed", {
            defaultValue: "启动 ChatGPT（Codex Desktop）失败",
            error: msg,
          }) + (msg ? `: ${msg}` : ""),
        );
      }
    }
  };

  const handleImportSuccess = async () => {
    try {
      await queryClient.invalidateQueries({
        queryKey: ["providers"],
        refetchType: "all",
      });
      await queryClient.refetchQueries({
        queryKey: ["providers"],
        type: "all",
      });
    } catch (error) {
      console.error("[App] Failed to refresh providers after import", error);
      await refetch();
    }
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to refresh tray menu", error);
    }
  };

  const notifyWindowControlError = (error: unknown) => {
    toast.error(
      t("notifications.windowControlFailed", {
        defaultValue: "窗口控制失败：{{error}}",
        error: extractErrorMessage(error),
      }),
    );
  };

  const handleWindowMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("[App] Failed to minimize window", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowToggleMaximize = async () => {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.toggleMaximize();
      setIsWindowMaximized(await currentWindow.isMaximized());
    } catch (error) {
      console.error("[App] Failed to toggle maximize", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("[App] Failed to close window", error);
      notifyWindowControlError(error);
    }
  };

  const handleOpenSkillsDiscovery = () => {
    setSkillsDiscoverySource("repos");
    setCurrentView("skillsDiscovery");
  };

  const renderContent = () => {
    const content = (() => {
      switch (currentView) {
        case "settings":
          return (
            <SettingsPage
              open={true}
              onOpenChange={() => setCurrentView("providers")}
              onImportSuccess={handleImportSuccess}
              defaultTab={settingsDefaultTab}
            />
          );
        case "prompts":
          return (
            <PromptPanel
              ref={promptPanelRef}
              open={true}
              onOpenChange={() => setCurrentView("providers")}
              leftOffset={sidebarWidth}
              topOffset={dragBarHeight}
            />
          );
        case "skills":
          return (
            <UnifiedSkillsPanel
              ref={unifiedSkillsPanelRef}
              onOpenDiscovery={handleOpenSkillsDiscovery}
              currentApp={sharedFeatureApp}
              leftOffset={sidebarWidth}
              topOffset={dragBarHeight}
            />
          );
        case "skillsDiscovery":
          return (
            <SkillsPage
              ref={skillsPageRef}
              initialApp={sharedFeatureApp}
              onSourceChange={setSkillsDiscoverySource}
              leftOffset={sidebarWidth}
              topOffset={dragBarHeight}
            />
          );
        case "mcp":
          return (
            <UnifiedMcpPanel
              ref={mcpPanelRef}
              onOpenChange={() => setCurrentView("providers")}
              leftOffset={sidebarWidth}
              topOffset={dragBarHeight}
            />
          );
        case "agents":
          return (
            <AgentsPanel onOpenChange={() => setCurrentView("providers")} />
          );
        case "universal":
          return (
            <div className="px-6 pt-4">
              <UniversalProviderPanel />
            </div>
          );

        case "hcai":
          return (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <HcaiPanel
                onProvidersChanged={() => {
                  void refetch();
                }}
              />
            </div>
          );
        case "sessions":
          return (
            <SessionManagerPage
              key={sharedFeatureApp}
              appId={sharedFeatureApp}
            />
          );
        case "usage":
          return <UsagePage />;
        case "install":
          return <InstallToolsPage />;
        default:
          return (
            <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden pb-12 px-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeApp}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.06 }}
                    className="space-y-4"
                  >
                    <ProviderList
                      providers={providers}
                      currentProviderId={currentProviderId}
                      appId={activeApp}
                      isLoading={isLoading}
                      isProxyRunning={isProxyRunning}
                      isProxyTakeover={
                        isProxyRunning && isCurrentAppTakeoverActive
                      }
                      activeProviderId={activeProviderId}
                      onSwitch={switchProvider}
                      onEdit={(provider) => {
                        setEditingProvider(provider);
                      }}
                      onDelete={(provider) =>
                        setConfirmAction({ provider, action: "delete" })
                      }
                      onRemoveFromConfig={
                        activeApp === "opencode"
                          ? (provider) =>
                              setConfirmAction({ provider, action: "remove" })
                          : undefined
                      }
                      onDisableOmo={
                        activeApp === "opencode" ? handleDisableOmo : undefined
                      }
                      onDisableOmoSlim={
                        activeApp === "opencode"
                          ? handleDisableOmoSlim
                          : undefined
                      }
                      onDuplicate={handleDuplicateProvider}
                      onConfigureUsage={setUsageProvider}
                      onOpenWebsite={handleOpenWebsite}
                      onOpenTerminal={
                        activeApp === "claude" ? handleOpenTerminal : undefined
                      }
                      onCreate={() => {
                        setAddForAppId(null);
                        setIsAddOpen(true);
                      }}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          );
      }
    })();

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          className="flex flex-1 min-h-0 flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.08 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-background text-foreground selection:bg-primary/30 pb-4"
      style={{ overflowX: "hidden" }}
    >
      {(dragBarHeight > 0 || useAppWindowControls) && (
        <div
          className="fixed top-0 left-0 right-0 z-[70] flex items-center justify-end px-2"
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag", height: dragBarHeight } as any}
        >
          {useAppWindowControls && (
            <div
              className="flex items-center gap-1"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowMinimize()}
                title={t("header.windowMinimize")}
                className="h-7 w-7"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowToggleMaximize()}
                title={
                  isWindowMaximized
                    ? t("header.windowRestore")
                    : t("header.windowMaximize")
                }
                className="h-7 w-7"
              >
                {isWindowMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowClose()}
                title={t("header.windowClose")}
                className="h-7 w-7 hover:bg-red-500/15 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
      {showEnvBanner && envConflicts.length > 0 && (
        <EnvWarningBanner
          conflicts={envConflicts}
          onDismiss={() => {
            setShowEnvBanner(false);
            sessionStorage.setItem("env_banner_dismissed", "true");
          }}
          onDeleted={async () => {
            try {
              const allConflicts = await checkAllEnvConflicts();
              const flatConflicts = Object.values(allConflicts).flat();
              setEnvConflicts(flatConflicts);
              if (flatConflicts.length === 0) {
                setShowEnvBanner(false);
              }
            } catch (error) {
              console.error(
                "[App] Failed to re-check conflicts after deletion:",
                error,
              );
            }
          }}
        />
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: full window height so border-r reaches the top */}
        {showSidebar && (
          <aside
            className={cn(
              "flex h-full shrink-0 flex-col border-r border-border/60 pb-3 transition-[width] duration-200 ease-in-out overflow-hidden",
              sidebarExpanded ? "px-2.5 items-stretch" : "px-0 items-center",
            )}
            style={{
              width: sidebarWidth,
              // Content sits below the fixed title drag bar; border itself is full height
              paddingTop: dragBarHeight + 12,
            }}
          >
            {/* Brand — pinned top, never scrolls.
                Collapsed: logo acts as expand control.
                Expanded: logo+name link + separate collapse button. */}
            <div
              className={cn(
                "flex shrink-0 items-center min-w-0 mb-4",
                sidebarExpanded
                  ? "justify-between gap-1 px-1"
                  : "justify-center",
              )}
            >
              {sidebarExpanded ? (
                <>
                  <a
                    href="https://github.com/WangYa-Technology"
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "inline-flex items-center min-w-0 rounded-lg gap-2.5 py-1 pr-1 transition-colors",
                      isProxyRunning && isCurrentAppTakeoverActive
                        ? "text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                        : "text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300",
                    )}
                    title="HCAI Switch"
                  >
                    <img
                      src={appIcon}
                      alt="HCAI Switch"
                      className="h-8 w-8 shrink-0 object-contain"
                      draggable={false}
                    />
                    <span className="text-lg font-semibold tracking-tight truncate">
                      HCAI Switch
                    </span>
                  </a>
                  {/* Same hit target / hover as collapsed expand control */}
                  <button
                    type="button"
                    onClick={() => setSidebarExpanded(false)}
                    className="group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    title={t("sidebar.collapse")}
                    aria-label={t("sidebar.collapse")}
                  >
                    <PanelLeftClose className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSidebarExpanded(true)}
                  className="group relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  title={t("sidebar.expand")}
                  aria-label={t("sidebar.expand")}
                >
                  <img
                    src={appIcon}
                    alt="HCAI Switch"
                    className="h-8 w-8 shrink-0 object-contain transition-opacity duration-150 group-hover:opacity-0"
                    draggable={false}
                  />
                  <PanelLeftOpen className="pointer-events-none absolute h-5 w-5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:text-foreground" />
                </button>
              )}
            </div>

            {/* Middle — apps / tools / settings scroll independently */}
            <div
              ref={sidebarMiddleRef}
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden",
                sidebarExpanded ? "items-stretch" : "items-center",
              )}
            >
              {/* Apps section */}
              <div className="flex flex-col gap-1.5 min-w-0">
                {sidebarExpanded && (
                  <div className="flex items-center h-7 px-1">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                      {t("sidebar.apps")}
                    </span>
                  </div>
                )}

                {/* HCAI — own group, same selected style as apps */}
                <div
                  className={cn(
                    "bg-muted rounded-xl p-1",
                    sidebarExpanded ? "w-full" : "flex justify-center",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setCurrentView("hcai")}
                    className={cn(
                      "relative inline-flex items-center rounded-lg transition-all duration-200",
                      sidebarExpanded
                        ? "h-11 w-full justify-start gap-2.5 px-3"
                        : "h-10 w-10 justify-center",
                      currentView === "hcai"
                        ? "bg-blue-500 text-white shadow-sm hover:bg-blue-500 hover:text-white"
                        : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
                    )}
                    title={
                      sidebarExpanded
                        ? undefined
                        : t("hcai.title", { defaultValue: "HCAI 中转站" })
                    }
                  >
                    <span className="relative inline-flex shrink-0">
                      <ProviderIcon icon="hcai" name="HCAI" size={22} />
                    </span>
                    {sidebarExpanded && (
                      <span className="text-sm font-medium truncate text-left">
                        {t("hcai.brandName", {
                          defaultValue: "HCAI 中转站",
                        })}
                      </span>
                    )}
                  </button>
                </div>

                <div
                  className={cn(
                    "bg-muted rounded-xl p-1 gap-1",
                    sidebarExpanded
                      ? "flex w-full flex-col"
                      : "flex flex-col items-center",
                  )}
                >
                  <AppSwitcher
                    activeApp={activeApp}
                    onSwitch={(app) => {
                      setActiveApp(app);
                      // Always land on that app's provider list (also exits HCAI)
                      // Clear any open add/edit/confirm overlays so we don't stay on
                      // a stale editing page for the previous app's config.
                      setIsAddOpen(false);
                      setIsAddAppSelectorOpen(false);
                      setAddForAppId(null);
                      setEditingProvider(null);
                      setConfirmAction(null);
                      setCurrentView("providers");
                    }}
                    visibleApps={visibleApps}
                    orientation="vertical"
                    expanded={sidebarExpanded}
                    highlightActive={currentView === "providers"}
                    bare
                  />
                </div>
              </div>

              {/* Tools section */}
              <div className="flex flex-col gap-1.5 min-w-0">
                {sidebarExpanded && (
                  <div className="flex items-center h-7 px-1">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                      {t("sidebar.tools")}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "flex flex-col gap-1 p-1 bg-muted rounded-xl",
                    sidebarExpanded ? "w-full" : "items-center",
                  )}
                >
                  <Button
                    variant={currentView === "install" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentView("install")}
                    className={cn(
                      "h-11",
                      sidebarExpanded
                        ? "w-full justify-start gap-2.5 px-3"
                        : "w-10 p-0 justify-center",
                      currentView === "install"
                        ? "hover:bg-blue-500"
                        : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
                    )}
                    title={
                      sidebarExpanded
                        ? undefined
                        : t("sidebar.install", { defaultValue: "一键安装" })
                    }
                  >
                    <Download className="flex-shrink-0 w-4 h-4" />
                    {sidebarExpanded && (
                      <span className="text-sm font-medium truncate">
                        {t("sidebar.install", { defaultValue: "一键安装" })}
                      </span>
                    )}
                  </Button>
                  <Button
                    variant={currentView === "usage" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentView("usage")}
                    className={cn(
                      "h-11",
                      sidebarExpanded
                        ? "w-full justify-start gap-2.5 px-3"
                        : "w-10 p-0 justify-center",
                      currentView === "usage"
                        ? "hover:bg-blue-500"
                        : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
                    )}
                    title={sidebarExpanded ? undefined : t("sidebar.usage")}
                  >
                    <BarChart2 className="flex-shrink-0 w-4 h-4" />
                    {sidebarExpanded && (
                      <span className="text-sm font-medium truncate">
                        {t("sidebar.usage")}
                      </span>
                    )}
                  </Button>
                  {hasSkillsSupport && (
                    <Button
                      variant={
                        currentView === "skills" ||
                        currentView === "skillsDiscovery"
                          ? "default"
                          : "ghost"
                      }
                      size="sm"
                      onClick={() => setCurrentView("skills")}
                      className={cn(
                        "h-11",
                        sidebarExpanded
                          ? "w-full justify-start gap-2.5 px-3"
                          : "w-10 p-0 justify-center",
                        currentView === "skills" ||
                          currentView === "skillsDiscovery"
                          ? "hover:bg-blue-500"
                          : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
                      )}
                      title={sidebarExpanded ? undefined : t("sidebar.skills")}
                    >
                      <Wrench className="flex-shrink-0 w-4 h-4" />
                      {sidebarExpanded && (
                        <span className="text-sm font-medium truncate">
                          {t("sidebar.skills")}
                        </span>
                      )}
                    </Button>
                  )}
                  <Button
                    variant={currentView === "prompts" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentView("prompts")}
                    className={cn(
                      "h-11",
                      sidebarExpanded
                        ? "w-full justify-start gap-2.5 px-3"
                        : "w-10 p-0 justify-center",
                      currentView === "prompts"
                        ? "hover:bg-blue-500"
                        : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
                    )}
                    title={sidebarExpanded ? undefined : t("sidebar.prompts")}
                  >
                    <Book className="w-4 h-4 flex-shrink-0" />
                    {sidebarExpanded && (
                      <span className="text-sm font-medium truncate">
                        {t("sidebar.prompts")}
                      </span>
                    )}
                  </Button>
                  {hasSessionSupport && (
                    <Button
                      variant={currentView === "sessions" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCurrentView("sessions")}
                      className={cn(
                        "h-11",
                        sidebarExpanded
                          ? "w-full justify-start gap-2.5 px-3"
                          : "w-10 p-0 justify-center",
                        currentView === "sessions"
                          ? "hover:bg-blue-500"
                          : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
                      )}
                      title={
                        sidebarExpanded ? undefined : t("sidebar.sessions")
                      }
                    >
                      <History className="flex-shrink-0 w-4 h-4" />
                      {sidebarExpanded && (
                        <span className="text-sm font-medium truncate">
                          {t("sidebar.sessions")}
                        </span>
                      )}
                    </Button>
                  )}
                  <Button
                    variant={currentView === "mcp" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentView("mcp")}
                    className={cn(
                      "h-11",
                      sidebarExpanded
                        ? "w-full justify-start gap-2.5 px-3"
                        : "w-10 p-0 justify-center",
                      currentView === "mcp"
                        ? "hover:bg-blue-500"
                        : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
                    )}
                    title={sidebarExpanded ? undefined : t("sidebar.mcp")}
                  >
                    <span className="flex-shrink-0 inline-flex">
                      <McpIcon size={16} />
                    </span>
                    {sidebarExpanded && (
                      <span className="text-sm font-medium truncate">
                        {t("sidebar.mcp")}
                      </span>
                    )}
                  </Button>
                </div>
              </div>

              {/* Settings section */}
              <div className="flex flex-col gap-1.5 min-w-0">
                {sidebarExpanded && (
                  <div className="flex items-center h-7 px-1">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                      {t("sidebar.settings")}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "flex flex-col gap-1 p-1 bg-muted rounded-xl",
                    sidebarExpanded ? "w-full" : "items-center",
                  )}
                >
                  <Button
                    variant={
                      currentView === "settings" &&
                      settingsDefaultTab !== "about"
                        ? "default"
                        : "ghost"
                    }
                    size="sm"
                    onClick={() => {
                      setSettingsDefaultTab("general");
                      setCurrentView("settings");
                    }}
                    className={cn(
                      "h-11",
                      sidebarExpanded
                        ? "w-full justify-start gap-2.5 px-3"
                        : "w-10 p-0 justify-center",
                      currentView === "settings" &&
                        settingsDefaultTab !== "about"
                        ? "hover:bg-blue-500"
                        : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
                    )}
                    title={
                      sidebarExpanded ? undefined : t("sidebar.openSettings")
                    }
                  >
                    <Settings className="flex-shrink-0 w-4 h-4" />
                    {sidebarExpanded && (
                      <span className="text-sm font-medium truncate">
                        {t("sidebar.openSettings")}
                      </span>
                    )}
                  </Button>
                  <UpdateBadge
                    showLabel={sidebarExpanded}
                    onClick={() => {
                      setSettingsDefaultTab("about");
                      setCurrentView("settings");
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Scroll hint + Add provider — pinned bottom, never scrolls */}
            <div
              className={cn(
                "shrink-0 pt-1 pb-1 flex flex-col items-center gap-1",
                sidebarExpanded ? "w-full" : "",
              )}
            >
              <AnimatePresence>
                {sidebarCanScrollDown && (
                  <motion.button
                    type="button"
                    key="sidebar-scroll-hint"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => {
                      const el = sidebarMiddleRef.current;
                      if (!el) return;
                      el.scrollBy({ top: 80, behavior: "smooth" });
                    }}
                    className="flex h-6 w-full items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    title={t("sidebar.scrollMore", {
                      defaultValue: "向下滚动查看更多",
                    })}
                    aria-label={t("sidebar.scrollMore", {
                      defaultValue: "向下滚动查看更多",
                    })}
                  >
                    <ChevronDown className="h-4 w-4 animate-bounce" />
                  </motion.button>
                )}
              </AnimatePresence>
              <Popover
                open={isAddAppSelectorOpen}
                onOpenChange={setIsAddAppSelectorOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    size={sidebarExpanded ? "sm" : "icon"}
                    className={cn(
                      addActionButtonClass,
                      sidebarExpanded &&
                        "w-full rounded-full h-10 gap-1.5 px-3 shadow-lg shadow-orange-500/30",
                    )}
                    title={
                      sidebarExpanded ? undefined : t("sidebar.addProvider")
                    }
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" />
                    {sidebarExpanded && (
                      <span className="text-sm font-medium whitespace-nowrap">
                        {t("sidebar.addProvider")}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="w-52 p-1.5 z-[70]"
                >
                  <div className="text-[10px] font-semibold tracking-[0.5px] text-muted-foreground px-2 py-1">
                    {t("sidebar.addProviderSelectApp", {
                      defaultValue: "选择要添加供应商的应用",
                    })}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {ADDABLE_APPS.map((appId) => {
                      const meta = ACTIVE_APP_META[appId];
                      return (
                        <button
                          key={appId}
                          type="button"
                          onClick={() => {
                            setIsAddAppSelectorOpen(false);
                            setAddForAppId(appId);
                            setIsAddOpen(true);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <span className="relative inline-flex shrink-0">
                            <ProviderIcon
                              icon={meta.icon}
                              name={meta.name}
                              size={16}
                            />
                          </span>
                          <span className="truncate font-medium">
                            {meta.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </aside>
        )}

        {/* Right column: header + main content */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          style={{ paddingTop: dragBarHeight }}
        >
          {currentView !== "hcai" && (
            <header
              className="z-50 w-full shrink-0 transition-all duration-300 bg-background/80 backdrop-blur-md"
              {...DRAG_REGION_ATTR}
              style={
                {
                  ...DRAG_REGION_STYLE,
                  height: HEADER_HEIGHT,
                } as any
              }
            >
              <div
                className="flex h-full items-center justify-between gap-2 px-6"
                {...DRAG_REGION_ATTR}
                style={{ ...DRAG_REGION_STYLE } as any}
              >
                <div
                  className="flex items-center gap-1"
                  style={{ WebkitAppRegion: "no-drag" } as any}
                >
                  {currentView === "providers" ? (
                    (() => {
                      const meta = ACTIVE_APP_META[activeApp];
                      const BadgeIcon = meta.badge;
                      return (
                        <div className="flex items-center gap-2.5">
                          <span className="relative inline-flex shrink-0">
                            <ProviderIcon
                              icon={meta.icon}
                              name={meta.name}
                              size={22}
                            />
                            {BadgeIcon ? (
                              <span className="absolute -bottom-0.5 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background bg-muted">
                                <BadgeIcon className="h-2 w-2" />
                              </span>
                            ) : null}
                          </span>
                          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                            {meta.name}
                            {meta.beta ? (
                              <span className="beta-badge" aria-label="Beta">
                                Beta
                              </span>
                            ) : null}
                          </h1>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="flex items-center">
                      {currentView === "skillsDiscovery" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setCurrentView("skills")}
                          className="rounded-lg shrink-0 mr-2"
                          style={{ WebkitAppRegion: "no-drag" } as any}
                          title={t("common.back", { defaultValue: "返回" })}
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="flex items-center gap-2.5">
                        {(() => {
                          const meta = VIEW_HEADER_ICON[currentView];
                          if (!meta) return null;
                          if ("kind" in meta) {
                            return (
                              <span
                                className={cn(
                                  "inline-flex shrink-0 items-center justify-center",
                                  meta.className,
                                )}
                              >
                                <McpIcon size={22} />
                              </span>
                            );
                          }
                          const Icon = meta.Icon;
                          return (
                            <Icon
                              className={cn(
                                "h-[22px] w-[22px] shrink-0",
                                meta.className,
                              )}
                              strokeWidth={2}
                            />
                          );
                        })()}
                        <h1 className="text-lg font-semibold tracking-tight">
                          {currentView === "settings" && t("settings.title")}
                          {currentView === "usage" && t("usage.title")}
                          {currentView === "install" &&
                            t("sidebar.install", { defaultValue: "一键安装" })}
                          {currentView === "prompts" && t("sidebar.prompts")}
                          {currentView === "skills" && t("skills.title")}
                          {currentView === "skillsDiscovery" &&
                            t("skills.title")}
                          {currentView === "mcp" && t("mcp.unifiedPanel.title")}
                          {currentView === "agents" && t("agents.title")}
                          {currentView === "universal" &&
                            t("universalProvider.title", {
                              defaultValue: "统一供应商",
                            })}
                          {currentView === "sessions" &&
                            t("sessionManager.title")}
                        </h1>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 min-w-0 items-center justify-end gap-1.5">
                  {currentView === "providers" &&
                    activeApp !== "opencode" &&
                    activeApp !== "grok" && (
                      <div
                        className="flex shrink-0 items-center gap-1.5"
                        style={{ WebkitAppRegion: "no-drag" } as any}
                      >
                        {activeApp === "claude-desktop" ? (
                          <ClaudeDesktopRouteToggle />
                        ) : (
                          settingsData?.enableLocalProxy && (
                            <ProxyToggle activeApp={activeApp} />
                          )
                        )}
                        {activeApp !== "claude-desktop" &&
                          settingsData?.enableFailoverToggle && (
                            <FailoverToggle activeApp={activeApp} />
                          )}
                      </div>
                    )}
                  {/* ChatGPT / Codex Desktop 启动按钮：放在 codex 配置右上角 */}
                  {currentView === "providers" && activeApp === "codex" && (
                    <div
                      className="flex shrink-0 items-center"
                      style={{ WebkitAppRegion: "no-drag" } as any}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleLaunchCodexDesktop()}
                        className="hover:bg-black/5 dark:hover:bg-white/5 h-8 px-2.5"
                        title={t("codex.launchDesktopTitle", {
                          defaultValue:
                            "启动 ChatGPT（Codex Desktop）：若已安装则完全退出并重启（用于加载最新配置）",
                        })}
                      >
                        <Monitor className="w-4 h-4 mr-1.5" />
                        <span className="text-xs">
                          {t("codex.launchDesktopShort", {
                            defaultValue: "启动 Desktop",
                          })}
                        </span>
                      </Button>
                    </div>
                  )}
                  {currentView === "providers" &&
                    (settingsData?.showProfileSwitcher ?? true) && (
                      <div
                        className="flex shrink-0 items-center"
                        style={{ WebkitAppRegion: "no-drag" } as any}
                      >
                        <ProfileSwitcher activeApp={activeApp} />
                      </div>
                    )}
                  <div className="flex shrink-0 items-center gap-1.5 py-4 pr-2">
                    <div
                      className="flex shrink-0 items-center gap-1.5"
                      style={{ WebkitAppRegion: "no-drag" } as any}
                    >
                      {currentView === "prompts" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => promptPanelRef.current?.openAdd()}
                          className="hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          {t("prompts.add")}
                        </Button>
                      )}
                      {currentView === "mcp" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mcpPanelRef.current?.openImport()}
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            {t("mcp.importExisting")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mcpPanelRef.current?.openAdd()}
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            {t("mcp.addMcp")}
                          </Button>
                        </>
                      )}
                      {currentView === "skills" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              unifiedSkillsPanelRef.current?.openRestoreFromBackup()
                            }
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <History className="w-4 h-4 mr-2" />
                            {t("skills.restoreFromBackup.button")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              unifiedSkillsPanelRef.current?.openInstallFromZip()
                            }
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <FolderArchive className="w-4 h-4 mr-2" />
                            {t("skills.installFromZip.button")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              unifiedSkillsPanelRef.current?.openImport()
                            }
                            className="relative hover:bg-black/5 dark:hover:bg-white/5"
                            title={
                              hasUnmanagedSkills
                                ? t("skills.unmanagedAvailable")
                                : undefined
                            }
                          >
                            <Download className="w-4 h-4 mr-2" />
                            {t("skills.import")}
                            {hasUnmanagedSkills && (
                              <span
                                className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500"
                                aria-hidden="true"
                              />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleOpenSkillsDiscovery}
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <Search className="w-4 h-4 mr-2" />
                            {t("skills.discover")}
                          </Button>
                        </>
                      )}
                      {currentView === "skillsDiscovery" && (
                        <>
                          {getSkillsPageHeaderActions(
                            skillsDiscoverySource,
                          ).map(({ key, labelKey, Icon, execute }) => (
                            <Button
                              key={key}
                              variant="ghost"
                              size="sm"
                              onClick={() => execute(skillsPageRef.current)}
                              className="hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              <Icon className="w-4 h-4 mr-2" />
                              {t(labelKey)}
                            </Button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </header>
          )}

          <main className="flex flex-1 min-h-0 flex-col overflow-hidden animate-fade-in">
            {renderContent()}
          </main>
        </div>
      </div>

      <AddProviderDialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setAddForAppId(null);
          }
        }}
        appId={addForAppId || activeApp}
        onSubmit={async (data) => {
          await handleAddProvider(data, addForAppId || undefined);
        }}
        leftOffset={sidebarWidth}
        topOffset={dragBarHeight}
      />

      <EditProviderDialog
        open={Boolean(editingProvider)}
        provider={effectiveEditingProvider}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProvider(null);
          }
        }}
        onSubmit={handleEditProvider}
        appId={activeApp}
        isProxyTakeover={isCurrentAppTakeoverActive}
        leftOffset={sidebarWidth}
        topOffset={dragBarHeight}
      />

      {effectiveUsageProvider && (
        <UsageScriptModal
          key={effectiveUsageProvider.id}
          provider={effectiveUsageProvider}
          appId={activeApp}
          isOpen={Boolean(usageProvider)}
          onClose={() => setUsageProvider(null)}
          onSave={(script) => {
            if (usageProvider) {
              void saveUsageScript(usageProvider, script);
            }
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={
          confirmAction?.action === "remove"
            ? t("confirm.removeProvider")
            : t("confirm.deleteProvider")
        }
        message={
          confirmAction
            ? confirmAction.action === "remove"
              ? t("confirm.removeProviderMessage", {
                  name: confirmAction.provider.name,
                })
              : t("confirm.deleteProviderMessage", {
                  name: confirmAction.provider.name,
                })
            : ""
        }
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <DeepLinkImportDialog />
      <FirstRunNoticeDialog />
    </div>
  );
}

export default App;
