import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Loader2,
  RefreshCw,
  Check,
  Stethoscope,
  Terminal,
  Copy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsApi } from "@/lib/api";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import {
  ClaudeIcon,
  CodexIcon,
  ChatGPTIcon,
  GrokIcon,
  OpenCodeIcon,
} from "@/components/BrandIcons";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isWindows } from "@/lib/platform";

interface InstallableApp {
  key: string;
  label: string;
  subtitle?: string;
  category: "cli" | "desktop";
  hint?: string;
}

const INSTALLABLES: InstallableApp[] = [
  {
    key: "claude",
    label: "Claude Code",
    subtitle: "CLI",
    category: "cli",
    hint: "官方脚本优先；macOS/Linux brew，Windows npm 国内镜像",
  },
  {
    key: "claude-desktop",
    label: "Claude Desktop",
    subtitle: "桌面应用",
    category: "desktop",
    hint: "优先镜像源；失败回退官方（macOS / Windows）",
  },
  {
    key: "codex",
    label: "Codex CLI",
    subtitle: "CLI",
    category: "cli",
    hint: "macOS/Linux 优先 Homebrew；Windows npm 国内镜像",
  },
  {
    key: "codex-desktop",
    label: "ChatGPT",
    subtitle: "Codex Desktop",
    category: "desktop",
    hint: "镜像源提供完整安装包下载与更新",
  },
  {
    key: "grok",
    label: "Grok Build",
    subtitle: "CLI",
    category: "cli",
    hint: "官方脚本（Git Bash 推荐）",
  },
  {
    key: "opencode",
    label: "OpenCode",
    subtitle: "CLI",
    category: "cli",
    hint: "官方脚本优先；macOS/Linux brew tap，Windows npm 国内镜像",
  },
];

interface DesktopStatus {
  installed: boolean;
  version?: string;
  build?: number;
  latestVersion?: string;
  latestBuild?: number;
  latestNotes?: string;
  hasDeltas?: boolean;
  fullSize?: number;
  path?: string;
  loading?: boolean;
}

interface CliToolStatus {
  installed: boolean;
  version?: string;
  latestVersion?: string;
  loading?: boolean;
}

const posixScriptInstallCommand = (url: string) =>
  `bash -c 'tmp=$(mktemp) && curl -fsSL ${url} -o $tmp && bash $tmp; status=$?; rm -f $tmp; exit $status'`;

/** Manual install commands (moved from settings). */
const POSIX_INSTALL_COMMANDS = `# Claude Code
${posixScriptInstallCommand("https://claude.ai/install.sh")} || brew install claude-code || npm i -g @anthropic-ai/claude-code@latest

# Codex
brew install codex || npm i -g @openai/codex@latest

# OpenCode
${posixScriptInstallCommand("https://opencode.ai/install")} || brew install anomalyco/tap/opencode || npm i -g opencode-ai@latest

# Grok Build
${posixScriptInstallCommand("https://x.ai/cli/install.sh")}`;

const WINDOWS_INSTALL_COMMANDS = `# Claude Code
npm i -g @anthropic-ai/claude-code@latest

# Codex
npm i -g @openai/codex@latest

# OpenCode
npm i -g opencode-ai@latest

# Grok Build（官方脚本；建议在 Git Bash / MSYS 中执行）
${posixScriptInstallCommand("https://x.ai/cli/install.sh")}`;

type InstallCommandPlatform = "posix" | "windows";

const INSTALL_COMMAND_BLOCKS: {
  id: InstallCommandPlatform;
  commands: string;
}[] = [
  { id: "posix", commands: POSIX_INSTALL_COMMANDS },
  { id: "windows", commands: WINDOWS_INSTALL_COMMANDS },
];

// 工具版本探测代价高（--version 子进程 + 网络 latest）。
// 一键安装页可能随 Tab/导航反复挂载卸载。使用模块级缓存 + stale-while-revalidate，
// 避免重复开销。TTL 内返回缓存数据（无 loading 闪烁）；过期则先展示旧数据，
// 后台刷新。单卡片「刷新」只更新对应条目，不推进整体缓存时间戳。
const CLI_CACHE_TTL_MS = 5 * 60 * 1000;
const CLI_TOOLS = ["claude", "codex", "opencode", "grok"] as const;
type CliToolKey = (typeof CLI_TOOLS)[number];

let cliVersionsCache: {
  data: Array<{
    name: string;
    version: string | null;
    latest_version: string | null;
    error: string | null;
    installed_but_broken: boolean;
    env_type: string;
    wsl_distro: string | null;
  }>;
  at: number;
} | null = null;

const DESKTOP_CACHE_TTL_MS = 5 * 60 * 1000;
let codexDesktopCache: { status: any; latest: any; at: number } | null = null;
let claudeDesktopCache: { status: any; latest: any; at: number } | null = null;

export default function InstallToolsPage() {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [desktopStatuses, setDesktopStatuses] = useState<
    Record<string, DesktopStatus>
  >({});
  const [cliStatuses, setCliStatuses] = useState<Record<string, CliToolStatus>>(
    {},
  );
  // 来自后端的实时进度（用于进度条 + 状态消息）
  const [installProgress, setInstallProgress] = useState<
    Record<string, { percent?: number; message?: string; phase?: string }>
  >({});
  // 安装冲突诊断
  const [toolDiagnostics, setToolDiagnostics] = useState<Record<string, any[]>>(
    {},
  );
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  // 手动安装命令对话框（从设置页移动到此处）
  const [showManualCommands, setShowManualCommands] = useState(false);

  // 监听后端 install/update 过程的进度事件，驱动进度条和实时状态
  useTauriEvent<any>("tool-lifecycle-progress", (payload: any) => {
    if (!payload?.tool) return;
    const key = payload.tool;
    setInstallProgress((prev) => ({
      ...prev,
      [key]: {
        percent: payload.percent,
        message: payload.message,
        phase: payload.phase,
      },
    }));

    // 完成后稍后清理进度状态（按钮的 installing 由 finally 控制）
    if (payload.phase === "completed" || payload.phase === "failed") {
      setTimeout(() => {
        setInstallProgress((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, 1500);
    }
  });

  // Brand groups (Claude, Codex, Grok, OpenCode)
  const brandGroups = [
    {
      title: "Claude",
      apps: INSTALLABLES.filter((app) => app.key.startsWith("claude")),
    },
    {
      title: "Codex",
      apps: INSTALLABLES.filter((app) =>
        ["codex", "codex-desktop"].includes(app.key),
      ),
    },
    {
      title: "Grok",
      apps: INSTALLABLES.filter((app) => app.key === "grok"),
    },
    {
      title: "OpenCode",
      apps: INSTALLABLES.filter((app) => app.key === "opencode"),
    },
  ];

  // 统一的桌面应用状态获取（带独立模块缓存 + SWR）
  // force=true 用于手动刷新按钮；false 用于挂载时复用缓存
  const refreshDesktopStatus = async (
    key: "codex-desktop" | "claude-desktop",
    force = false,
  ) => {
    const isCodex = key === "codex-desktop";
    const cache = isCodex ? codexDesktopCache : claudeDesktopCache;
    const now = Date.now();
    const ttl = DESKTOP_CACHE_TTL_MS;

    const isFresh = !force && cache && now - cache.at < ttl;
    if (isFresh) {
      if (isCodex) {
        applyCodexDesktopToState(cache!.status, cache!.latest);
      } else {
        applyClaudeDesktopToState(cache!.status, cache!.latest);
      }
      return;
    }

    const hasStale = !force && cache != null;
    if (hasStale) {
      // 先展示旧数据（无 loading 闪烁）
      if (isCodex) {
        applyCodexDesktopToState(cache!.status, cache!.latest);
      } else {
        applyClaudeDesktopToState(cache!.status, cache!.latest);
      }
      // 后台静默刷新
      void (async () => {
        try {
          const [status, latest] = await Promise.all([
            isCodex
              ? settingsApi.getCodexDesktopInstallStatus()
              : settingsApi.getClaudeDesktopInstallStatus(),
            isCodex
              ? settingsApi.getCodexDesktopLatest()
              : settingsApi.getClaudeDesktopLatest(),
          ]);
          const newEntry = { status, latest, at: Date.now() };
          if (isCodex) codexDesktopCache = newEntry;
          else claudeDesktopCache = newEntry;
          if (isCodex) {
            applyCodexDesktopToState(status, latest);
          } else {
            applyClaudeDesktopToState(status, latest);
          }
        } catch {
          /* 静默后台刷新失败 */
        }
      })();
      return;
    }

    // 无缓存或强制刷新：显示 loading 并获取
    setDesktopStatuses((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { installed: false }), loading: true },
    }));
    try {
      const [status, latest] = await Promise.all([
        isCodex
          ? settingsApi.getCodexDesktopInstallStatus()
          : settingsApi.getClaudeDesktopInstallStatus(),
        isCodex
          ? settingsApi.getCodexDesktopLatest()
          : settingsApi.getClaudeDesktopLatest(),
      ]);
      const newEntry = { status, latest, at: Date.now() };
      if (isCodex) codexDesktopCache = newEntry;
      else claudeDesktopCache = newEntry;
      if (isCodex) {
        applyCodexDesktopToState(status, latest);
      } else {
        applyClaudeDesktopToState(status, latest);
      }
    } catch (e: any) {
      setDesktopStatuses((prev) => ({
        ...prev,
        [key]: { installed: false, loading: false },
      }));
    }
  };

  const refreshCodexDesktopStatus = async () => {
    await refreshDesktopStatus("codex-desktop", true);
  };
  const refreshClaudeDesktopStatus = async () => {
    await refreshDesktopStatus("claude-desktop", true);
  };

  const applyCliVersionToStatuses = (key: string, v: any) => {
    const hasLocal = !!v?.version;
    const broken = !!v?.installed_but_broken;
    setCliStatuses((prev) => ({
      ...prev,
      [key]: {
        installed: hasLocal || broken,
        version: v?.version || undefined,
        latestVersion: v?.latest_version || undefined,
        loading: false,
      },
    }));
  };

  const applyCodexDesktopToState = (status: any, latest: any) => {
    setDesktopStatuses((prev) => ({
      ...prev,
      "codex-desktop": {
        installed: !!status.installed,
        version: status.version,
        build: status.build,
        latestVersion: latest.version,
        latestBuild: latest.build,
        latestNotes: latest.notes,
        hasDeltas: latest.hasDeltas,
        fullSize: latest.fullSize,
        path: status.path,
        loading: false,
      },
    }));
  };

  const applyClaudeDesktopToState = (status: any, latest: any) => {
    setDesktopStatuses((prev) => ({
      ...prev,
      "claude-desktop": {
        installed: !!status.installed,
        version: status.version,
        // Claude Desktop 目前不使用 build 做更新判断，主要靠 version
        latestVersion: latest.version,
        latestNotes: latest.notes,
        path: status.path,
        loading: false,
      },
    }));
  };

  // 统一的 CLI 工具版本获取（带模块缓存）。
  // force=true 时总是打网络（手动刷新按钮、安装后刷新）；否则尊重缓存。
  const refreshCliTool = async (key: CliToolKey, force = false) => {
    const now = Date.now();

    // 命中缓存且不强制：立即应用，无 loading
    if (!force && cliVersionsCache) {
      const cached = cliVersionsCache.data.find((d: any) => d.name === key);
      if (cached) {
        applyCliVersionToStatuses(key, cached);
        return;
      }
    }

    // 标记该卡片 loading
    setCliStatuses((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { installed: false }), loading: true },
    }));

    try {
      const res = await settingsApi.getToolVersions([key]);
      const v = res?.[0];
      if (v) {
        // 合并进模块缓存（单条更新不推进 at，保持其他工具的时效判断）
        if (!cliVersionsCache) {
          cliVersionsCache = { data: [v], at: now };
        } else {
          const idx = cliVersionsCache.data.findIndex(
            (d: any) => d.name === key,
          );
          if (idx >= 0) {
            cliVersionsCache.data[idx] = v;
          } else {
            cliVersionsCache.data.push(v);
          }
          // 故意不改 at：单卡片刷新不应让整批缓存的 TTL 续命
        }
        applyCliVersionToStatuses(key, v);
      } else {
        setCliStatuses((prev) => ({
          ...prev,
          [key]: { installed: false, loading: false },
        }));
      }
    } catch (e: any) {
      setCliStatuses((prev) => ({
        ...prev,
        [key]: { installed: false, loading: false },
      }));
    }
  };

  // 初次/整批加载 CLI 工具（利用缓存做 stale-while-revalidate）
  const refreshAllCliTools = async (options?: { force?: boolean }) => {
    const force = options?.force ?? false;
    const now = Date.now();

    const hasFreshCache =
      !force &&
      cliVersionsCache &&
      now - cliVersionsCache.at < CLI_CACHE_TTL_MS;

    if (hasFreshCache) {
      // 直接用缓存数据渲染（无闪烁）
      CLI_TOOLS.forEach((k) => {
        const c = cliVersionsCache!.data.find((d: any) => d.name === k);
        if (c) applyCliVersionToStatuses(k, c);
      });
      return;
    }

    // 有缓存但过期：先渲染旧数据 + 后台刷新（SWR）
    const hasStaleCache = !force && cliVersionsCache;
    if (hasStaleCache) {
      CLI_TOOLS.forEach((k) => {
        const c = cliVersionsCache!.data.find((d: any) => d.name === k);
        if (c) applyCliVersionToStatuses(k, c);
      });
      // 后台静默更新，不显示 loading
      void (async () => {
        try {
          const vers = await settingsApi.getToolVersions([...CLI_TOOLS]);
          cliVersionsCache = { data: vers || [], at: Date.now() };
          (vers || []).forEach((v: any) =>
            applyCliVersionToStatuses(v.name, v),
          );
        } catch {
          /* 静默 */
        }
      })();
      return;
    }

    // 完全无缓存或强制：显示 loading 并批量获取
    CLI_TOOLS.forEach((k) => {
      setCliStatuses((prev) => ({
        ...prev,
        [k]: { ...(prev[k] || { installed: false }), loading: true },
      }));
    });

    try {
      const vers = await settingsApi.getToolVersions([...CLI_TOOLS]);
      cliVersionsCache = { data: vers || [], at: Date.now() };
      (vers || []).forEach((v: any) => applyCliVersionToStatuses(v.name, v));
    } catch {
      CLI_TOOLS.forEach((k) => {
        setCliStatuses((prev) => ({
          ...prev,
          [k]: { installed: false, loading: false },
        }));
      });
    }
  };

  // 保留原有命名，供按钮和 useEffect 调用（单卡片刷新走 force）
  const refreshCodexCliStatus = async () => {
    await refreshCliTool("codex", true);
  };
  const refreshClaudeCliStatus = async () => {
    await refreshCliTool("claude", true);
  };
  const refreshOpencodeCliStatus = async () => {
    await refreshCliTool("opencode", true);
  };
  const refreshGrokCliStatus = async () => {
    await refreshCliTool("grok", true);
  };

  const handleDiagnoseInstallConflicts = async () => {
    setIsDiagnosing(true);
    try {
      const cliTools = ["claude", "codex", "opencode", "grok"];
      const reports = await settingsApi.probeToolInstallations(cliTools);
      const next: Record<string, any[]> = {};
      let conflictCount = 0;
      for (const report of reports) {
        if (report.is_conflict && report.installs?.length) {
          next[report.tool] = report.installs;
          conflictCount++;
        }
      }
      setToolDiagnostics(next);
      if (conflictCount === 0) {
        toast.info(
          t("settings.toolDiagnoseNoConflict", {
            defaultValue: "未检测到安装冲突",
          }),
          { closeButton: true },
        );
      } else {
        toast.warning(
          t("settings.toolDiagnoseConflictsFound", {
            defaultValue: `检测到 ${conflictCount} 个工具存在多处安装冲突`,
          }),
          { closeButton: true },
        );
      }
    } catch (error) {
      console.error("[InstallToolsPage] Diagnose failed", error);
      toast.error(
        t("settings.toolDiagnoseFailed", { defaultValue: "诊断安装冲突失败" }),
      );
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleCopyInstallCommands = async (commands: string) => {
    try {
      await navigator.clipboard.writeText(commands);
      toast.success(
        t("settings.installCommandsCopied", { defaultValue: "安装命令已复制" }),
        {
          closeButton: true,
        },
      );
    } catch (error) {
      console.error(
        "[InstallToolsPage] Failed to copy install commands",
        error,
      );
      toast.error(
        t("settings.installCommandsCopyFailed", {
          defaultValue: "复制失败，请手动复制。",
        }),
      );
    }
  };

  const currentInstallPlatform: InstallCommandPlatform = isWindows()
    ? "windows"
    : "posix";

  // 初次加载：桌面和 CLI 都使用带缓存的加载（SWR，避免重复网络+状态探测）
  useEffect(() => {
    void refreshDesktopStatus("codex-desktop", false);
    void refreshDesktopStatus("claude-desktop", false);
    void refreshAllCliTools();
  }, []);

  const getActionLabel = (app: InstallableApp) => {
    const key = app.key;
    if (
      key === "codex-desktop" ||
      key === "claude-desktop" ||
      key === "codex" ||
      key === "claude" ||
      key === "opencode" ||
      key === "grok"
    ) {
      const st =
        key === "codex-desktop"
          ? desktopStatuses["codex-desktop"]
          : key === "claude-desktop"
            ? desktopStatuses["claude-desktop"]
            : key === "codex"
              ? cliStatuses["codex"]
              : key === "claude"
                ? cliStatuses["claude"]
                : key === "opencode"
                  ? cliStatuses["opencode"]
                  : key === "grok"
                    ? cliStatuses["grok"]
                    : undefined;
      const installed = !!st?.installed;
      const curVer = st?.version;
      const latVer = st?.latestVersion;
      const curB = (st as any)?.build;
      const latB = (st as any)?.latestBuild;

      const needsUpdate =
        installed &&
        ((latB != null && curB != null && latB > curB) ||
          (latVer && curVer && latVer !== curVer));

      if (needsUpdate) {
        return t("common.update", { defaultValue: "更新" });
      }
      if (installed) {
        return "已是最新";
      }
      return t("common.install", { defaultValue: "安装" });
    }
    return t("common.install", { defaultValue: "安装" });
  };

  const getSubtitleClass = (subtitle?: string) => {
    if (!subtitle) return "bg-muted text-muted-foreground";
    if (subtitle === "CLI") {
      return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
    }
    if (subtitle === "桌面应用") {
      return "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";
    }
    if (subtitle === "Codex Desktop") {
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    }
    return "bg-muted text-muted-foreground";
  };

  // Lively colored badges for status / meta info (used for codex-desktop)
  const getInstalledBadgeClass = () =>
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  const getNotInstalledBadgeClass = () =>
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  const getLatestBadgeClass = () =>
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
  const getDeltaBadgeClass = () =>
    "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";

  const getGroupAccentClass = (title: string) => {
    if (title === "Claude") return "text-violet-600 dark:text-violet-400";
    if (title === "Codex") return "text-amber-600 dark:text-amber-400";
    if (title === "Grok") return "text-sky-600 dark:text-sky-400";
    if (title === "OpenCode") return "text-teal-600 dark:text-teal-400";
    return "text-foreground";
  };

  const getAppIcon = (key: string) => {
    const iconProps = { size: 20, className: "shrink-0" };
    if (key === "claude" || key === "claude-desktop") {
      return <ClaudeIcon {...iconProps} />;
    }
    if (key === "codex") {
      return <CodexIcon {...iconProps} />;
    }
    if (key === "codex-desktop") {
      return <ChatGPTIcon {...iconProps} />;
    }
    if (key === "grok") {
      return <GrokIcon {...iconProps} />;
    }
    if (key === "opencode") {
      return <OpenCodeIcon {...iconProps} />;
    }
    return null;
  };

  const renderCard = (app: InstallableApp) => {
    const isInstalling = !!installing[app.key];
    const isCodexDesktop = app.key === "codex-desktop";
    const isClaudeDesktop = app.key === "claude-desktop";
    const isCodexCli = app.key === "codex";
    const isClaudeCli = app.key === "claude";
    const isOpencodeCli = app.key === "opencode";
    const isGrokCli = app.key === "grok";
    const isSpecialVersionTool =
      isCodexDesktop ||
      isClaudeDesktop ||
      isCodexCli ||
      isClaudeCli ||
      isOpencodeCli ||
      isGrokCli;
    const st = isCodexDesktop
      ? desktopStatuses["codex-desktop"]
      : isClaudeDesktop
        ? desktopStatuses["claude-desktop"]
        : isCodexCli
          ? cliStatuses["codex"]
          : isClaudeCli
            ? cliStatuses["claude"]
            : isOpencodeCli
              ? cliStatuses["opencode"]
              : isGrokCli
                ? cliStatuses["grok"]
                : undefined;
    const statusLoading = !!st?.loading;

    let needsUpdate = false;
    let isUpToDate = false;
    if (isSpecialVersionTool && st?.installed) {
      if (isCodexDesktop) {
        const curB = (st as any).build;
        const latB = (st as any).latestBuild;
        const curVer = st.version;
        const latVer = st.latestVersion;
        needsUpdate =
          (latB != null && curB != null && latB > curB) ||
          (latVer != null && curVer != null && latVer !== curVer);
      } else {
        // Codex / Claude / OpenCode / Grok CLI + Claude Desktop: 版本字符串比较
        const curVer = st.version;
        const latVer = st.latestVersion;
        needsUpdate = !!(latVer && curVer && latVer !== curVer);
      }
      isUpToDate = !needsUpdate;
    }

    return (
      <div
        key={app.key}
        className={cn(
          "glass-card rounded-xl border border-border/60 p-4 flex items-center gap-4",
          "transition-all hover:border-border hover:shadow-sm",
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="shrink-0">{getAppIcon(app.key)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-base">{app.label}</span>
              {app.subtitle && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${getSubtitleClass(app.subtitle)}`}
                >
                  {app.subtitle}
                </span>
              )}
              {isSpecialVersionTool && st && (
                <>
                  {st.installed ? (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${getInstalledBadgeClass()}`}
                    >
                      已安装 {st.version ? `v${st.version}` : ""}
                      {isCodexDesktop && (st as any).build
                        ? ` (b${(st as any).build})`
                        : ""}
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${getNotInstalledBadgeClass()}`}
                    >
                      未安装
                    </span>
                  )}
                  {st.latestVersion && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${getLatestBadgeClass()}`}
                    >
                      最新 v{st.latestVersion}
                      {isCodexDesktop && (st as any).latestBuild
                        ? ` (b${(st as any).latestBuild})`
                        : ""}
                      {isCodexDesktop && (st as any).fullSize
                        ? ` · ${((st as any).fullSize / 1024 / 1024).toFixed(0)}MB`
                        : ""}
                    </span>
                  )}
                  {isCodexDesktop && (st as any).hasDeltas && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${getDeltaBadgeClass()}`}
                      title="镜像源提供 Sparkle delta 增量包，Codex App Manager 可使用更小的增量"
                    >
                      delta
                    </span>
                  )}
                </>
              )}
            </div>

            {app.hint && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {app.hint}
              </p>
            )}
            {isCodexDesktop && desktopStatuses["codex-desktop"]?.path && (
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate font-mono">
                {desktopStatuses["codex-desktop"]?.path}
              </p>
            )}

            {/* 安装冲突诊断结果 */}
            {toolDiagnostics[app.key] &&
              toolDiagnostics[app.key].length > 0 && (
                <div className="mt-1.5 space-y-1 rounded-md border border-yellow-500/20 bg-yellow-500/5 p-2 text-[10px]">
                  <div className="font-medium text-yellow-600 dark:text-yellow-400">
                    {t("settings.toolConflictTitle", {
                      defaultValue: "检测到多处安装",
                    })}
                  </div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {toolDiagnostics[app.key]
                      .slice(0, 3)
                      .map((inst: any, idx: number) => (
                        <li key={idx} className="truncate font-mono">
                          {inst.path || inst.source || JSON.stringify(inst)}
                        </li>
                      ))}
                    {toolDiagnostics[app.key].length > 3 && (
                      <li className="text-muted-foreground/70">
                        ... 共 {toolDiagnostics[app.key].length} 处
                      </li>
                    )}
                  </ul>
                  <p className="text-[9px] text-muted-foreground/80">
                    {t("settings.toolConflictHint", {
                      defaultValue:
                        "多处安装可能导致版本不一致，建议保留一处并移除其它。",
                    })}
                  </p>
                </div>
              )}

            {/* 安装 / 更新进度条 + 实时消息 */}
            {isInstalling && (
              <div className="mt-2 pr-2">
                {(() => {
                  const prog = installProgress[app.key];
                  const pct = prog?.percent;
                  const msg = prog?.message;
                  const isIndeterminate = pct == null || pct <= 0;
                  return (
                    <>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full bg-primary transition-all duration-200 ${isIndeterminate ? "w-2/5 animate-pulse" : ""}`}
                          style={
                            isIndeterminate
                              ? undefined
                              : { width: `${Math.min(100, Math.max(5, pct))}%` }
                          }
                        />
                      </div>
                      {msg && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground truncate font-mono">
                          {msg}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isSpecialVersionTool && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void (isCodexDesktop
                  ? refreshCodexDesktopStatus()
                  : isClaudeDesktop
                    ? refreshClaudeDesktopStatus()
                    : isCodexCli
                      ? refreshCodexCliStatus()
                      : isClaudeCli
                        ? refreshClaudeCliStatus()
                        : isOpencodeCli
                          ? refreshOpencodeCliStatus()
                          : refreshGrokCliStatus())
              }
              disabled={statusLoading}
              className="h-8 w-8 p-0"
              title="刷新状态"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", statusLoading && "animate-spin")}
              />
            </Button>
          )}

          <Button
            size="sm"
            variant="default"
            disabled={
              isInstalling ||
              isUpToDate ||
              statusLoading ||
              (isSpecialVersionTool && !st)
            }
            onClick={() => void handleInstall(app)}
            className={cn(
              "gap-1.5 min-w-[92px]",
              needsUpdate &&
                "!bg-amber-500 hover:!bg-amber-600 dark:!bg-amber-500 dark:hover:!bg-amber-600 text-white",
            )}
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.installing", { defaultValue: "安装中..." })}
              </>
            ) : (
              <>
                {!isUpToDate && <Download className="h-4 w-4" />}
                {isUpToDate && <Check className="h-4 w-4" />}
                {getActionLabel(app)}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  const handleInstall = async (app: InstallableApp) => {
    const key = app.key;

    if (installing[key]) return;

    setInstalling((prev) => ({ ...prev, [key]: true }));
    // 初始进度提示
    setInstallProgress((prev) => ({
      ...prev,
      [key]: { percent: 8, message: "starting...", phase: "starting" },
    }));

    try {
      if (
        key === "codex" ||
        key === "claude" ||
        key === "opencode" ||
        key === "grok"
      ) {
        // Codex CLI / Claude Code CLI / OpenCode / Grok Build：机制完全一致。
        // 官方脚本优先；macOS/Linux brew（或 tap），Windows npm 国内镜像。
        // 支持 getToolVersions + needsUpdate 判断 + 传 "update" 或 "install"。
        const toolLabel =
          key === "codex"
            ? "Codex CLI"
            : key === "claude"
              ? "Claude Code"
              : key === "opencode"
                ? "OpenCode"
                : "Grok Build";
        try {
          const res = await settingsApi.getToolVersions([key]);
          const info = res?.[0] || ({} as any);
          if (info.name) {
            // 喂给缓存（读路径，不推进 TTL）
            if (!cliVersionsCache) {
              cliVersionsCache = { data: [info], at: Date.now() };
            } else {
              const i = cliVersionsCache.data.findIndex(
                (d: any) => d.name === info.name,
              );
              if (i >= 0) cliVersionsCache.data[i] = info;
              else cliVersionsCache.data.push(info);
            }
          }
          const isInstalled = !!info.version || !!info.installed_but_broken;
          const curVer = info.version;
          const newVer = info.latest_version;

          const needsUpdate =
            isInstalled && !!newVer && !!curVer && newVer !== curVer;

          if (isInstalled && !needsUpdate) {
            toast.info(`当前已是最新版本 ${curVer || newVer || ""}`);
          } else {
            if (isInstalled) {
              toast.info(
                `已安装 ${curVer || "?"} → ${newVer || "latest"}，开始更新 ${toolLabel}...`,
              );
            } else {
              toast.info(`开始安装 ${toolLabel}`);
            }

            await settingsApi.runToolLifecycleAction(
              [key],
              needsUpdate ? "update" : "install",
            );

            // 立即刷新版本以反映真实结果（类似设置页的 executeRun 后处理）
            const afterRes = await settingsApi.getToolVersions([key]);
            const afterInfo = afterRes?.[0] || ({} as any);
            if (afterInfo.name) {
              // 用刚拿到的结果更新缓存 + UI（安装后数据权威）
              if (!cliVersionsCache) {
                cliVersionsCache = { data: [afterInfo], at: Date.now() };
              } else {
                const i = cliVersionsCache.data.findIndex(
                  (d: any) => d.name === afterInfo.name,
                );
                if (i >= 0) cliVersionsCache.data[i] = afterInfo;
                else cliVersionsCache.data.push(afterInfo);
              }
              applyCliVersionToStatuses(afterInfo.name, afterInfo);
            }
            const afterVer = afterInfo.version;

            const versionUnchanged =
              needsUpdate && !!curVer && !!afterVer && afterVer === curVer;
            if (versionUnchanged) {
              toast.warning(
                `${toolLabel} 更新命令执行完成，但版本未变化（所用包管理器/源可能已是最新，或安装位置与版本来源不一致）`,
              );
            } else {
              toast.success(`${toolLabel} 安装/更新命令已完成`);
            }

            // 刷新卡片状态（带小延迟以确保文件系统/PATH 可见）
            setTimeout(() => {
              if (key === "codex") {
                void refreshCodexCliStatus();
              } else if (key === "claude") {
                void refreshClaudeCliStatus();
              } else if (key === "opencode") {
                void refreshOpencodeCliStatus();
              } else if (key === "grok") {
                void refreshGrokCliStatus();
              }
            }, 800);
          }
        } catch (e: any) {
          const msg = e?.message || String(e);
          setInstallProgress((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          toast.error(`${toolLabel} 操作失败：${msg}`);
        }
      } else if (app.category === "cli") {
        // Use existing one-click lifecycle for supported CLI tools
        await settingsApi.runToolLifecycleAction([key], "install");
        toast.success(
          t("install.startInstall", {
            defaultValue: `已开始安装 ${app.label}，请在终端查看进度...`,
            name: app.label,
          }),
        );
      } else if (key === "codex-desktop") {
        // 完整接入 Codex-App-Manager 的下载与更新流程（agentsmirror primary + lumocore mirror 兜底 + Sparkle appcast）
        // 主路径保留原有，内部已实现 mirror fallback
        setInstallProgress((prev) => ({
          ...prev,
          [key]: {
            percent: 10,
            message: "正在获取最新版本信息...",
            phase: "running",
          },
        }));
        try {
          const status = await settingsApi.getCodexDesktopInstallStatus();
          const latest = await settingsApi.getCodexDesktopLatest();

          // 喂给桌面缓存（本次探测结果权威）
          codexDesktopCache = { status, latest, at: Date.now() };
          applyCodexDesktopToState(status, latest);

          const isInstalled = status.installed;
          const curVer = status.version || "";
          const newVer = latest.version || "";
          const curB = status.build;
          const newB = latest.build;

          const needsUpdate =
            isInstalled &&
            ((newB != null && curB != null && newB > curB) ||
              (!!newVer && !!curVer && newVer !== curVer));

          if (isInstalled) {
            if (!needsUpdate) {
              toast.info(`当前已是最新版本 v${curVer || newVer}`);
            } else {
              const sizeMb = latest.fullSize
                ? (latest.fullSize / 1024 / 1024).toFixed(0)
                : "";
              const deltaHint = latest.hasDeltas ? " 支持增量更新" : "";
              toast.info(
                `已安装 v${curVer || "?"} (build ${curB ?? "?"}) → v${newVer}，下载完整包 ${sizeMb ? sizeMb + "MB " : ""}${deltaHint}`,
              );
            }
          } else {
            const sizeMb = latest.fullSize
              ? (latest.fullSize / 1024 / 1024).toFixed(0)
              : "";
            toast.info(
              `开始下载 ${app.label} v${newVer || "latest"} ${sizeMb ? sizeMb + "MB " : ""}`,
            );
          }

          if (!(isInstalled && !needsUpdate)) {
            const downloadedPath = await settingsApi.downloadCodexDesktop();
            const fileName = downloadedPath.split(/[\\/]/).pop() || "安装包";
            toast.success(`下载完成：${fileName}`);

            await settingsApi.openCodexDesktopInstaller(downloadedPath);

            // 下载打开后刷新一次状态提示
            setTimeout(() => {
              void refreshCodexDesktopStatus();
            }, 1500);
          }
        } catch (e: any) {
          const msg = e?.message || String(e);
          toast.error(`${app.label} 下载/打开失败：${msg}`);
        }
      } else if (key === "claude-desktop") {
        // Claude Desktop：优先国内镜像源，失败时 fallback 官方
        // 下载后使用 SHA256SUMS 校验（在后端实现）
        setInstallProgress((prev) => ({
          ...prev,
          [key]: {
            percent: 10,
            message: "正在从镜像源获取...",
            phase: "running",
          },
        }));
        try {
          const status = await settingsApi.getClaudeDesktopInstallStatus();
          const latest = await settingsApi.getClaudeDesktopLatest();

          // 喂给桌面缓存（本次探测结果权威）
          claudeDesktopCache = { status, latest, at: Date.now() };
          applyClaudeDesktopToState(status, latest);

          const isInstalled = status.installed;
          const curVer = status.version || "";
          const newVer = latest.version || "";

          const needsUpdate =
            isInstalled && !!newVer && !!curVer && newVer !== curVer;

          if (isInstalled) {
            if (!needsUpdate) {
              toast.info(`当前已是最新版本 v${curVer || newVer}`);
            } else {
              toast.info(
                `已安装 v${curVer || "?"} → v${newVer}，开始下载更新...`,
              );
            }
          } else {
            toast.info(
              `开始下载 ${app.label} v${newVer || "latest"}（优先国内镜像源）`,
            );
          }

          if (!(isInstalled && !needsUpdate)) {
            const downloadedPath = await settingsApi.downloadClaudeDesktop();
            const fileName = downloadedPath.split(/[\\/]/).pop() || "安装包";
            toast.success(`下载完成：${fileName}`);

            await settingsApi.openClaudeDesktopInstaller(downloadedPath);

            setTimeout(() => {
              void refreshClaudeDesktopStatus();
            }, 1500);
          }
        } catch (e: any) {
          const msg = e?.message || String(e);
          toast.error(`${app.label} 下载/打开失败：${msg}`);
        }
      } else {
        // 其他桌面应用保持引导
        toast.info(
          t("install.desktopInstallHint", {
            defaultValue: `${app.label} 为桌面应用，请前往官方网站下载安装。`,
          }),
        );
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      toast.error(
        t("install.installFailed", {
          defaultValue: `安装 ${app.label} 失败`,
          name: app.label,
          error: msg,
        }) + (msg ? `: ${msg}` : ""),
      );
    } finally {
      setInstalling((prev) => ({ ...prev, [key]: false }));
      // 清理残留进度（正常流程由事件处理器清理，这里兜底）
      setInstallProgress((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <div className="px-6 pt-2 pb-8 flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("install.description", {
              defaultValue: "一键安装常用 AI 编码工具",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowManualCommands(true)}
          >
            <Terminal className="h-3.5 w-3.5" />
            {t("settings.manualInstallCommands", {
              defaultValue: "手动安装命令",
            })}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void handleDiagnoseInstallConflicts()}
            disabled={isDiagnosing}
          >
            {isDiagnosing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Stethoscope className="h-3.5 w-3.5" />
            )}
            {isDiagnosing
              ? t("settings.toolDiagnosing", { defaultValue: "诊断中..." })
              : t("settings.toolDiagnose", { defaultValue: "诊断安装冲突" })}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-6">
        {brandGroups.map((group) => (
          <div key={group.title}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  group.title === "Claude"
                    ? "bg-violet-500"
                    : group.title === "Codex"
                      ? "bg-amber-500"
                      : group.title === "Grok"
                        ? "bg-sky-500"
                        : group.title === "OpenCode"
                          ? "bg-teal-500"
                          : "bg-sky-500"
                }`}
                aria-hidden
              />
              <span
                className={`text-sm font-semibold tracking-tight transition-colors ${getGroupAccentClass(group.title)}`}
              >
                {group.title}
              </span>
            </div>
            <div className="space-y-3">{group.apps.map(renderCard)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-[11px] text-muted-foreground">
        {t("install.note", {
          defaultValue:
            "提示：CLI 工具优先官方脚本（Codex 优先 Homebrew）；macOS/Linux 推荐 Homebrew，Windows 使用 npm 国内镜像。桌面应用使用镜像源提供完整安装包下载。",
        })}
      </div>

      {/* 手动安装命令对话框（位于一键安装页右上角） */}
      <Dialog open={showManualCommands} onOpenChange={setShowManualCommands}>
        <DialogContent
          className="max-w-3xl"
          zIndex="top"
          onInteractOutside={() => setShowManualCommands(false)}
          onEscapeKeyDown={() => setShowManualCommands(false)}
        >
          <DialogHeader className="relative border-b px-6 py-5">
            <DialogTitle>
              {t("settings.manualInstallCommands", {
                defaultValue: "手动安装命令",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("settings.oneClickInstallHint", {
                defaultValue:
                  "一键安装失败时，可按平台复制下方命令在终端手动安装 Claude Code、Codex、OpenCode、Grok Build。",
              })}
            </DialogDescription>

            <DialogClose
              className="absolute right-4 top-4 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("common.close", { defaultValue: "关闭" })}
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </DialogHeader>

          <div className="space-y-3 pt-4 px-6 pb-6">
            {INSTALL_COMMAND_BLOCKS.map((block) => {
              const isCurrent = block.id === currentInstallPlatform;
              const platformLabel =
                block.id === "posix"
                  ? t("settings.installCommandsPlatformPosix", {
                      defaultValue: "macOS / Linux",
                    })
                  : t("settings.installCommandsPlatformWindows", {
                      defaultValue: "Windows",
                    });
              const platformHint =
                block.id === "posix"
                  ? t("settings.installCommandsPlatformPosixHint", {
                      defaultValue:
                        "在终端（zsh/bash）执行；macOS/Linux 官方脚本优先或 Homebrew，失败回退 npm。",
                    })
                  : t("settings.installCommandsPlatformWindowsHint", {
                      defaultValue:
                        "在 PowerShell/cmd 执行 npm 命令（国内镜像）；Grok Build 官方脚本建议用 Git Bash。",
                    });

              return (
                <div
                  key={block.id}
                  className={cn(
                    "rounded-lg border bg-background/60 p-3 space-y-2",
                    isCurrent
                      ? "border-primary/40 ring-1 ring-primary/15"
                      : "border-border/70",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {platformLabel}
                      </span>
                      {isCurrent && (
                        <Badge
                          variant="secondary"
                          className="h-5 px-1.5 text-[10px] font-normal"
                        >
                          {t("settings.installCommandsPlatformCurrent", {
                            defaultValue: "当前系统",
                          })}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void handleCopyInstallCommands(block.commands)
                      }
                      className="h-7 gap-1.5 text-xs shrink-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {t("common.copy")}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {platformHint}
                  </p>
                  <pre className="text-xs font-mono bg-muted/40 px-3 py-2.5 rounded-md border border-border/50 overflow-x-auto whitespace-pre-wrap break-all">
                    {block.commands}
                  </pre>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
