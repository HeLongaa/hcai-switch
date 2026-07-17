import React from "react";
import type { AppId } from "@/lib/api/types";
import { ClaudeIcon, CodexIcon } from "@/components/BrandIcons";
import { ProviderIcon } from "@/components/ProviderIcon";

export interface AppConfig {
  label: string;
  icon: React.ReactNode;
  activeClass: string;
  badgeClass: string;
}

/** 主界面 / 设置中可切换的应用 */
export const APP_IDS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "opencode",
  "grok",
];

/** App IDs shown in Skills panels */
export const SKILLS_APP_IDS: AppId[] = ["claude", "codex", "opencode", "grok"];

/** App IDs shown in MCP panels (Grok MCP is managed via ~/.grok/config.toml, not here) */
export const MCP_APP_IDS: AppId[] = ["claude", "codex", "opencode"];

/** App IDs shown in Prompts panels (Claude Desktop does not support prompts) */
export const PROMPTS_APP_IDS: AppId[] = ["claude", "codex", "opencode", "grok"];

export const APP_ICON_MAP: Record<AppId, AppConfig> = {
  claude: {
    label: "Claude",
    icon: <ClaudeIcon size={14} />,
    activeClass:
      "bg-orange-500/10 ring-1 ring-orange-500/20 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400",
    badgeClass:
      "bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20 border-0 gap-1.5",
  },
  "claude-desktop": {
    label: "Claude Desktop",
    icon: <ClaudeIcon size={14} />,
    activeClass:
      "bg-amber-500/10 ring-1 ring-amber-500/20 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300",
    badgeClass:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border-0 gap-1.5",
  },
  codex: {
    label: "Codex",
    icon: <CodexIcon size={14} />,
    activeClass:
      "bg-green-500/10 ring-1 ring-green-500/20 hover:bg-green-500/20 text-green-600 dark:text-green-400",
    badgeClass:
      "bg-green-500/10 text-green-700 dark:text-green-300 hover:bg-green-500/20 border-0 gap-1.5",
  },
  opencode: {
    label: "OpenCode",
    icon: (
      <ProviderIcon
        icon="opencode"
        name="OpenCode"
        size={14}
        showFallback={false}
      />
    ),
    activeClass:
      "bg-indigo-500/10 ring-1 ring-indigo-500/20 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
    badgeClass:
      "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 border-0 gap-1.5",
  },
  grok: {
    label: "Grok Build",
    icon: (
      <ProviderIcon
        icon="grok"
        name="Grok Build"
        size={14}
        showFallback={false}
      />
    ),
    activeClass:
      "bg-zinc-500/10 ring-1 ring-zinc-500/20 hover:bg-zinc-500/20 text-zinc-800 dark:text-zinc-200",
    badgeClass:
      "bg-zinc-500/10 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-500/20 border-0 gap-1.5",
  },
};
