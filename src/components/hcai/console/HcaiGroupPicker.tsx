/**
 * HCAI 分组选择：可搜索列表，平台 Logo 与系统应用图标一致。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { HcaiGroup } from "@/lib/hcai/types";

/** 与系统应用 / ProviderIcon 一致的平台 → 图标名 */
export function platformIconName(platform?: string): string {
  const p = (platform ?? "").toLowerCase();
  if (p === "openai") return "openai";
  if (p === "anthropic") return "claude";
  if (p === "grok" || p === "xai") return "grok";
  if (p === "google" || p.includes("gemini")) return "gemini";
  return "openai";
}

export function platformDisplayName(platform?: string): string {
  const p = (platform ?? "").toLowerCase();
  if (p === "openai") return "OpenAI";
  if (p === "anthropic") return "Claude";
  if (p === "grok" || p === "xai") return "Grok";
  if (p === "google" || p.includes("gemini")) return "Gemini";
  return platform?.trim() || "HCAI";
}

function platformMeta(platform?: string) {
  const p = (platform ?? "").toLowerCase();
  if (p === "openai") {
    // 平台色（非主题色）：与 Claude 橙 / Grok 紫 并列区分
    return {
      name: "text-emerald-700 dark:text-emerald-300",
      rate: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 border-emerald-500/15",
      ring: "ring-emerald-500/20",
    };
  }
  if (p === "anthropic") {
    return {
      name: "text-orange-700 dark:text-orange-300",
      rate: "bg-orange-500/12 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200 border-orange-500/15",
      ring: "ring-orange-500/20",
    };
  }
  if (p === "grok" || p === "xai") {
    return {
      name: "text-violet-700 dark:text-violet-300",
      rate: "bg-violet-500/12 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200 border-violet-500/15",
      ring: "ring-violet-500/20",
    };
  }
  if (p === "google" || p.includes("gemini")) {
    return {
      name: "text-sky-700 dark:text-sky-300",
      rate: "bg-sky-500/12 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200 border-sky-500/15",
      ring: "ring-sky-500/20",
    };
  }
  return {
    name: "text-foreground",
    rate: "bg-muted text-muted-foreground border-border/60",
    ring: "ring-border/40",
  };
}

export function groupRateLabel(g: HcaiGroup): string {
  if (g.subscription_type === "subscription") return "订阅";
  const m = g.rate_multiplier ?? 1;
  return `${m}x 倍率`;
}

function PlatformLogo({
  platform,
  size = 16,
  className,
}: {
  platform?: string;
  size?: number;
  className?: string;
}) {
  const icon = platformIconName(platform);
  const name = platformDisplayName(platform);
  return (
    <ProviderIcon
      icon={icon}
      name={name}
      size={size}
      className={cn("rounded-sm", className)}
      showFallback
    />
  );
}

/**
 * 无 platform 字段时，从分组名启发式推断（用量/错误列表常用）。
 */
export function inferPlatform(
  platform?: string | null,
  name?: string | null,
): string | undefined {
  const p = platform?.trim();
  if (p) return p;
  const n = (name ?? "").toLowerCase();
  if (!n) return undefined;
  if (n.includes("claude") || n.includes("anthropic")) return "anthropic";
  if (n.includes("gemini") || n.includes("google")) return "google";
  if (n.includes("grok") || n.includes("xai")) return "xai";
  if (
    n.includes("gpt") ||
    n.includes("openai") ||
    n.includes("codex") ||
    n.includes("o1") ||
    n.includes("o3") ||
    n.includes("o4")
  ) {
    return "openai";
  }
  return undefined;
}

/** 分组徽章：平台色 + 对应图标（密钥列表 / 用量 / 错误请求共用） */
export function GroupChip({
  group,
  name,
  platform,
  emptyLabel = "无分组",
  className,
}: {
  group?: Pick<HcaiGroup, "id" | "name" | "platform"> | null;
  name?: string | null;
  platform?: string | null;
  emptyLabel?: string;
  className?: string;
}) {
  const label =
    group?.name?.trim() ||
    name?.trim() ||
    (group?.id != null ? `分组 ${group.id}` : "");
  if (!label) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        {emptyLabel}
      </span>
    );
  }
  const plat = inferPlatform(group?.platform ?? platform, label);
  const meta = platformMeta(plat);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium max-w-full",
        "bg-muted/70 ring-1 ring-inset",
        meta.ring,
        className,
      )}
    >
      <PlatformLogo platform={plat} size={14} />
      <span className={cn("truncate", meta.name)}>{label}</span>
    </span>
  );
}

interface HcaiGroupPickerProps {
  groups: HcaiGroup[];
  valueId?: number | null;
  onSelect: (group: HcaiGroup) => void;
  loading?: boolean;
  disabled?: boolean;
  /** 触发器文案（无选中时） */
  placeholder?: string;
  className?: string;
  /** 紧凑触发（表格内） */
  compact?: boolean;
}

export function HcaiGroupPicker({
  groups,
  valueId,
  onSelect,
  loading,
  disabled,
  placeholder = "选择分组",
  className,
  compact,
}: HcaiGroupPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => groups.find((g) => g.id === valueId) ?? null,
    [groups, valueId],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return groups;
    return groups.filter((g) => {
      const name = (g.name ?? "").toLowerCase();
      const desc = (g.description ?? "").toLowerCase();
      const plat = (g.platform ?? "").toLowerCase();
      const platLabel = platformDisplayName(g.platform).toLowerCase();
      return (
        name.includes(s) ||
        desc.includes(s) ||
        plat.includes(s) ||
        platLabel.includes(s)
      );
    });
  }, [groups, q]);

  // Dialog 的 RemoveScroll 在 document 捕获阶段 preventDefault 滚轮；
  // 在 document 上后置监听，对列表区域手动 scrollTop 兜底。
  useEffect(() => {
    if (!open) return;
    const onWheel = (e: WheelEvent) => {
      const el = listRef.current;
      if (!el) return;
      const t = e.target;
      if (!(t instanceof Node) || !el.contains(t)) return;
      if (el.scrollHeight <= el.clientHeight + 1) return;
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    document.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });
    return () => document.removeEventListener("wheel", onWheel, true);
  }, [open]);

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || loading}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md text-left transition-colors disabled:opacity-50",
            compact
              ? "h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60"
              : "h-9 w-full min-w-0 px-3 text-sm border border-border bg-background hover:bg-muted/40",
            className,
          )}
        >
          {selected ? (
            <span className="flex items-center gap-1.5 min-w-0 flex-1">
              <GroupChip group={selected} />
              {!compact ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-0.5 text-xs font-medium",
                    platformMeta(selected.platform).rate,
                  )}
                >
                  {groupRateLabel(selected)}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="flex-1 truncate text-muted-foreground">
              {loading ? "加载分组…" : placeholder}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[120] w-[min(400px,calc(100vw-2rem))] p-0 overflow-hidden rounded-xl shadow-lg"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* 搜索：无描边 + 去掉浏览器默认 focus 蓝框，避免双层丑框 */}
        <div className="px-2.5 pt-2.5 pb-2 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2 rounded-full bg-muted/60 px-3 h-9 transition-colors focus-within:bg-muted">
            <Search className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索分组..."
              className="h-full w-full min-w-0 bg-transparent text-sm border-0 shadow-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
        </div>

        <div
          ref={listRef}
          className="max-h-[min(300px,50vh)] overflow-y-auto overscroll-contain p-1.5"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-muted-foreground">
              {loading ? "加载中…" : "无匹配分组"}
            </div>
          ) : (
            filtered.map((g) => {
              const meta = platformMeta(g.platform);
              const active = g.id === valueId;
              const title = g.name?.trim() || `分组 ${g.id}`;
              const desc = g.description?.trim();
              return (
                <button
                  key={g.id}
                  type="button"
                  className={cn(
                    "w-full text-left rounded-lg px-2.5 py-2.5 transition-colors",
                    "hover:bg-muted/70",
                    active && "bg-muted ring-1 ring-border/80",
                  )}
                  onClick={() => {
                    onSelect(g);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card shadow-sm",
                      )}
                    >
                      <PlatformLogo platform={g.platform} size={18} />
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={cn(
                            "text-sm font-medium truncate",
                            meta.name,
                          )}
                        >
                          {title}
                        </span>
                        {active ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : null}
                      </div>
                      {desc ? (
                        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                          {desc}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/80">
                          {platformDisplayName(g.platform)}
                        </p>
                      )}
                    </div>

                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium mt-0.5",
                        meta.rate,
                      )}
                    >
                      {groupRateLabel(g)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
