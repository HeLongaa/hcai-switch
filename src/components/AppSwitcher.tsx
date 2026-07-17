import { Fragment } from "react";
import type { AppId } from "@/lib/api";
import type { VisibleApps } from "@/types";
import { APP_IDS } from "@/config/appConfig";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Monitor, Terminal } from "lucide-react";

const APP_BADGE_ICON: Partial<
  Record<AppId, { icon: typeof Terminal; offsetY?: number }>
> = {
  claude: { icon: Terminal },
  "claude-desktop": { icon: Monitor, offsetY: 0.5 },
};

interface AppSwitcherProps {
  activeApp: AppId;
  onSwitch: (app: AppId) => void;
  visibleApps?: VisibleApps;
  /** @deprecated Prefer orientation="vertical" in the sidebar layout */
  compact?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Vertical sidebar: show icon + label when true (default). */
  expanded?: boolean;
  /** When false, no app appears selected (e.g. HCAI hub is active). */
  highlightActive?: boolean;
  /**
   * Skip the outer muted container — parent provides shared chrome
   * (e.g. HCAI + apps in one switcher group).
   */
  bare?: boolean;
}

const STORAGE_KEY = "cc-switch-last-app";

export function AppSwitcher({
  activeApp,
  onSwitch,
  visibleApps,
  compact,
  orientation = "horizontal",
  expanded = true,
  highlightActive = true,
  bare = false,
}: AppSwitcherProps) {
  const handleSwitch = (app: AppId) => {
    // Always notify parent so callers can leave HCAI / other hubs even when
    // the app id is unchanged (previously early-return blocked that path).
    if (app !== activeApp) {
      localStorage.setItem(STORAGE_KEY, app);
    }
    onSwitch(app);
  };
  const iconSize = orientation === "vertical" ? 22 : 20;
  const appIconName: Record<(typeof APP_IDS)[number], string> = {
    claude: "claude",
    "claude-desktop": "claude",
    codex: "openai",
    opencode: "opencode",
    grok: "grok",
  };
  const appDisplayName: Record<(typeof APP_IDS)[number], string> = {
    claude: "Claude Code",
    "claude-desktop": "Claude Desktop",
    codex: "Codex",
    opencode: "OpenCode",
    grok: "Grok Build",
  };

  // Filter apps based on visibility settings (default all managed apps visible)
  const appsToShow = APP_IDS.filter((app) => {
    if (!visibleApps) return true;
    return visibleApps[app] ?? true;
  });

  const isVertical = orientation === "vertical";
  // Vertical expanded: always show labels. Horizontal: show labels unless compact.
  const showLabel = isVertical ? expanded : !compact;
  // Only use tooltips when labels are hidden in vertical mode
  const useTooltip = isVertical && !expanded;

  const buttons = appsToShow.map((app) => {
    const badgeConfig = APP_BADGE_ICON[app];
    const BadgeIcon = badgeConfig?.icon;
    const isActive = highlightActive && activeApp === app;
    const button = (
      <button
        type="button"
        onClick={() => handleSwitch(app)}
        className={cn(
          "relative inline-flex items-center rounded-lg transition-all duration-200",
          isVertical
            ? expanded
              ? "h-11 w-full justify-start gap-2.5 px-3"
              : "h-10 w-10 justify-center"
            : compact
              ? "h-9 w-9 justify-center"
              : "h-9 justify-center px-3 gap-2",
          isActive
            ? "bg-blue-500 text-white shadow-sm hover:bg-blue-500 hover:text-white"
            : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10",
        )}
        title={useTooltip || !isVertical ? appDisplayName[app] : undefined}
      >
        <span className="relative inline-flex shrink-0">
          <ProviderIcon
            icon={appIconName[app]}
            name={appDisplayName[app]}
            size={iconSize}
          />
          {BadgeIcon ? (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background bg-muted",
                isActive && "border-white/30 bg-blue-600",
              )}
              style={
                badgeConfig?.offsetY
                  ? { transform: `translateY(${badgeConfig.offsetY}px)` }
                  : undefined
              }
            >
              <BadgeIcon className="h-2 w-2" />
            </span>
          ) : null}
        </span>
        {showLabel ? (
          <span
            className={cn(
              "font-medium truncate",
              isVertical ? "text-sm text-left" : "text-xs",
            )}
          >
            {appDisplayName[app]}
          </span>
        ) : null}
        {/* Grok Build：右上角灵动 Beta 角标 */}
        {app === "grok" ? (
          <span
            className={cn(
              "beta-badge",
              isVertical && expanded
                ? "absolute top-1 right-1.5"
                : "beta-badge-corner scale-[0.85]",
            )}
            aria-label="Beta"
          >
            Beta
          </span>
        ) : null}
      </button>
    );

    if (!useTooltip) {
      return <Fragment key={app}>{button}</Fragment>;
    }

    return (
      <Tooltip key={app}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {appDisplayName[app]}
        </TooltipContent>
      </Tooltip>
    );
  });

  const container = bare ? (
    <>{buttons}</>
  ) : (
    <div
      className={cn(
        "bg-muted rounded-xl p-1 gap-1",
        isVertical
          ? cn("flex flex-col", expanded ? "w-full" : "items-center")
          : "inline-flex",
      )}
    >
      {buttons}
    </div>
  );

  if (useTooltip) {
    return <TooltipProvider delayDuration={200}>{container}</TooltipProvider>;
  }

  return container;
}
