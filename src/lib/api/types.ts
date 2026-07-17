// 前端统一使用 AppId 作为应用标识（与后端命令参数 `app` 一致）
export type AppId =
  | "claude"
  | "claude-desktop"
  | "codex"
  | "opencode"
  | "grok";

export const isAppId = (app: string): app is AppId =>
  app === "claude" ||
  app === "claude-desktop" ||
  app === "codex" ||
  app === "opencode" ||
  app === "grok";
