/**
 * HCAI 仪表盘时间范围：预设快捷 + 自定义起止日期 + 应用（对齐 Web 控制台）。
 */
import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  dashboardDateRange,
  HCAI_DASHBOARD_RANGE_PRESETS,
  hcaiDashboardRangeLabel,
  type HcaiDashboardRangePreset,
} from "@/lib/hcai/api";

export interface DashboardDateSelection {
  preset: HcaiDashboardRangePreset;
  startDate: string;
  endDate: string;
}

interface DashboardDateRangePickerProps {
  value: DashboardDateSelection;
  onApply: (next: DashboardDateSelection) => void;
  className?: string;
}

function toSlash(iso: string): string {
  return iso.replace(/-/g, "/");
}

/** HTML date input uses YYYY-MM-DD */
function isoToInput(iso: string): string {
  return iso.slice(0, 10);
}

export function DashboardDateRangePicker({
  value,
  onApply,
  className,
}: DashboardDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] =
    useState<HcaiDashboardRangePreset>(value.preset);
  const [draftStart, setDraftStart] = useState(value.startDate);
  const [draftEnd, setDraftEnd] = useState(value.endDate);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftPreset(value.preset);
    setDraftStart(value.startDate);
    setDraftEnd(value.endDate);
    setLocalError(null);
  }, [open, value]);

  const pickPreset = (id: Exclude<HcaiDashboardRangePreset, "custom">) => {
    const r = dashboardDateRange(id);
    setDraftPreset(id);
    setDraftStart(r.startDate);
    setDraftEnd(r.endDate);
    setLocalError(null);
  };

  const onStartChange = (raw: string) => {
    setDraftStart(raw);
    setDraftPreset("custom");
    setLocalError(null);
  };

  const onEndChange = (raw: string) => {
    setDraftEnd(raw);
    setDraftPreset("custom");
    setLocalError(null);
  };

  const handleApply = () => {
    if (!draftStart || !draftEnd) {
      setLocalError("请选择开始与结束日期");
      return;
    }
    if (draftStart > draftEnd) {
      setLocalError("开始日期不能晚于结束日期");
      return;
    }
    onApply({
      preset: draftPreset,
      startDate: draftStart,
      endDate: draftEnd,
    });
    setOpen(false);
  };

  const triggerLabel = hcaiDashboardRangeLabel(
    value.preset,
    value.startDate,
    value.endDate,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 rounded-full px-3 text-xs font-normal border-primary/40 bg-background hover:bg-muted/50",
            open && "border-primary ring-1 ring-primary/30",
            className,
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="tabular-nums">{triggerLabel}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-3 space-y-3"
        sideOffset={6}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {HCAI_DASHBOARD_RANGE_PRESETS.map((p) => {
            const active = draftPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p.id)}
                className={cn(
                  "h-8 rounded-md text-xs transition-colors",
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1 min-w-0">
              <div className="text-xs text-muted-foreground">开始日期</div>
              <Input
                type="date"
                value={isoToInput(draftStart)}
                onChange={(e) => onStartChange(e.target.value)}
                className="h-9 text-xs tabular-nums"
              />
            </div>
            <span className="pb-2 text-muted-foreground text-sm">→</span>
            <div className="space-y-1 min-w-0">
              <div className="text-xs text-muted-foreground">结束日期</div>
              <Input
                type="date"
                value={isoToInput(draftEnd)}
                onChange={(e) => onEndChange(e.target.value)}
                className="h-9 text-xs tabular-nums"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums px-0.5">
            {toSlash(draftStart)} → {toSlash(draftEnd)}
          </div>
          {localError ? (
            <p className="text-xs text-destructive">{localError}</p>
          ) : null}
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              size="sm"
              className="h-8 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleApply}
            >
              应用
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 默认选中「近 30 天」 */
export function defaultDashboardDateSelection(): DashboardDateSelection {
  const r = dashboardDateRange("30d");
  return { preset: "30d", startDate: r.startDate, endDate: r.endDate };
}
