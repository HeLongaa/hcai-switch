/**
 * 登录后 HCAI 控制台：侧栏导航 + 各业务板块（均接真实接口）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  Database,
  Gift,
  Info,
  KeyRound,
  LayoutGrid,
  Loader2,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { HcaiUseKeyPanel } from "@/components/hcai/HcaiUseKeyPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  createHcaiApiKey,
  dashboardDateRange,
  deleteHcaiApiKey,
  fetchHcaiActiveSubscriptions,
  fetchHcaiApiKeys,
  fetchHcaiAuthMe,
  fetchHcaiAvailableGroups,
  fetchHcaiDashboardModels,
  fetchHcaiDashboardStats,
  fetchHcaiDashboardTrend,
  fetchHcaiRedeemHistory,
  fetchHcaiSubscriptions,
  fetchHcaiUsageErrorDetail,
  fetchHcaiUsageErrors,
  fetchHcaiUsageList,
  fetchHcaiUsageSnapshot,
  fetchHcaiUsageStats,
  isHcaiUnauthorizedError,
  redeemHcaiCode,
  setHcaiApiKeyStatus,
  updateHcaiApiKey,
} from "@/lib/hcai/api";
import { displayNameFromSession, saveHcaiSession } from "@/lib/hcai/session";
import {
  HCAI_ENDPOINT_ROOTS,
  HCAI_WEBSITE,
  type HcaiApiKeyItem,
  type HcaiAuthSession,
  type HcaiAuthUser,
  type HcaiDashboardModelStat,
  type HcaiDashboardPlatformStat,
  type HcaiDashboardStats,
  type HcaiDashboardTrendPoint,
  type HcaiGroup,
  type HcaiActiveSubscription,
  type HcaiRedeemRecord,
  type HcaiUsageEndpointStat,
  type HcaiUsageErrorRecord,
  type HcaiUsageGroupStat,
  type HcaiUsageRecord,
  type HcaiUsageStats,
} from "@/lib/hcai/types";
import {
  DashboardDateRangePicker,
  defaultDashboardDateSelection,
  type DashboardDateSelection,
} from "./DashboardDateRangePicker";
import { GroupChip, groupRateLabel, HcaiGroupPicker } from "./HcaiGroupPicker";
import {
  CHART_COLORS,
  formatLatencySeconds,
  formatTokens,
  formatTokensDetail,
  platformLabel,
} from "./format";
export type HcaiConsoleTab =
  "dashboard" | "api-keys" | "usage" | "subscriptions" | "redeem";

const NAV: {
  id: HcaiConsoleTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "dashboard", label: "仪表盘", icon: LayoutGrid },
  { id: "api-keys", label: "API 密钥", icon: KeyRound },
  { id: "usage", label: "使用记录", icon: BarChart3 },
  { id: "subscriptions", label: "我的订阅", icon: CreditCard },
  { id: "redeem", label: "兑换", icon: Gift },
];

function money(n: number, digits = 4) {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function money2(n: number) {
  return money(n, 2);
}

function StatCard({
  icon,
  iconClass,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 flex items-start gap-3 min-w-0">
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          iconClass ?? "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={cn(
            "text-lg font-semibold tabular-nums truncate leading-tight",
            valueClass,
          )}
        >
          {value}
        </div>
        {sub ? (
          <div className="text-xs text-muted-foreground truncate">{sub}</div>
        ) : null}
      </div>
    </div>
  );
}

/** 与右侧 Token 趋势面板统一高度；左侧超出时内部滚动 */
const DASHBOARD_SPLIT_PANEL =
  "h-[300px] rounded-xl border border-border/80 bg-card p-4 min-w-0 flex flex-col";

function DistTable({
  title,
  rows,
  nameKey,
}: {
  title: string;
  nameKey: string;
  rows: {
    name: string;
    requests: number;
    token: string;
    actual: number;
    standard: number;
    color: string;
    value: number;
  }[];
}) {
  return (
    <div className={DASHBOARD_SPLIT_PANEL}>
      <div className="flex items-center justify-between gap-2 shrink-0 mb-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="px-2 py-0.5 rounded-md bg-muted text-xs font-medium text-muted-foreground">
          按 Token
        </span>
      </div>
      {/* 圆环在面板内垂直居中；表格单独滚动 */}
      <div className="flex-1 min-h-0 flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-[120px] shrink-0 flex items-center justify-center self-stretch">
          <div className="h-[128px] w-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={54}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {rows.map((r) => (
                    <Cell key={r.name} fill={r.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card z-[1]">
              <tr className="text-muted-foreground text-left">
                <th className="font-medium pb-2 pr-2">{nameKey}</th>
                <th className="font-medium pb-2 pr-2">请求</th>
                <th className="font-medium pb-2 pr-2">Token</th>
                <th className="font-medium pb-2 pr-2">实际</th>
                <th className="font-medium pb-2">标准</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-border/50">
                  <td className="py-1.5 pr-2 font-medium">{r.name}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {r.requests.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{r.token}</td>
                  <td className="py-1.5 pr-2 tabular-nums text-primary">
                    {money2(r.actual)}
                  </td>
                  <td className="py-1.5 tabular-nums text-muted-foreground">
                    {money2(r.standard)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type TrendChartPoint = {
  /** X 轴：MM-DD */
  date: string;
  /** tooltip 完整日期 YYYY-MM-DD */
  fullDate: string;
  /** 图表坐标：百万 token */
  input: number;
  output: number;
  /** 原始 token，供 tooltip */
  inputRaw: number;
  outputRaw: number;
  cacheCreateRaw: number;
  cacheReadRaw: number;
  hit: number;
  actual: number;
  standard: number;
};

/** 对齐 HCAI Web 的趋势图悬停卡片 */
function TokenTrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  const rows: { label: string; value: string; color: string }[] = [
    { label: "Input", value: formatTokensDetail(p.inputRaw), color: "#7dd3fc" },
    {
      label: "Output",
      value: formatTokensDetail(p.outputRaw),
      color: "#86efac",
    },
    {
      label: "Cache Creation",
      value: formatTokensDetail(p.cacheCreateRaw),
      color: "#fbbf24",
    },
    {
      label: "Cache Read",
      value: formatTokensDetail(p.cacheReadRaw),
      color: "#67e8f9",
    },
    {
      label: "Cache Hit Rate",
      value: `${p.hit}%`,
      color: "#c4b5fd",
    },
  ];

  return (
    <div className="rounded-lg border border-border/80 bg-popover/95 backdrop-blur-sm px-3 py-2.5 shadow-md text-xs min-w-[180px]">
      <div className="font-medium tabular-nums mb-1.5 text-foreground">
        {p.fullDate}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: r.color }}
            />
            <span className="text-muted-foreground">{r.label}:</span>
            <span className="tabular-nums font-medium ml-auto">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-border/60 tabular-nums text-xs text-muted-foreground">
        Actual:{" "}
        <span className="text-foreground font-medium">
          {money(p.actual, 2)}
        </span>
        <span className="mx-1 opacity-50">|</span>
        Standard:{" "}
        <span className="text-foreground font-medium">
          {money(p.standard, 2)}
        </span>
      </div>
    </div>
  );
}

function TokenTrend({ data }: { data: TrendChartPoint[] }) {
  return (
    <div className={DASHBOARD_SPLIT_PANEL}>
      <h4 className="text-sm font-semibold shrink-0 mb-2">Token 使用趋势</h4>
      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <RechartsTooltip
              content={<TokenTrendTooltip />}
              cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "3 3" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="input"
              name="Input"
              stroke="#0ea5e9"
              fill="#0ea5e9"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="output"
              name="Output"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.1}
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="hit"
              name="Cache Hit Rate"
              stroke="#a855f7"
              fill="transparent"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              yAxisId={0}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  used,
  limit,
  reset,
  danger,
}: {
  label: string;
  used: number;
  limit: number;
  reset?: string;
  danger?: boolean;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {money2(used)} / {money2(limit)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            danger || pct >= 95 ? "bg-red-500" : "bg-primary/70",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {reset ? (
        <div className="text-xs text-muted-foreground">{reset}</div>
      ) : null}
    </div>
  );
}

type DashboardGranularity = "day" | "hour";

function mapModelRows(models: HcaiDashboardModelStat[]) {
  const sorted = [...models].sort(
    (a, b) => (b.total_tokens || 0) - (a.total_tokens || 0),
  );
  const top = sorted.slice(0, 8);
  const maxTok = Math.max(...top.map((m) => m.total_tokens || 0), 1);
  return top.map((m, i) => ({
    name: m.model,
    requests: m.requests ?? 0,
    token: formatTokens(m.total_tokens),
    actual: m.actual_cost ?? 0,
    standard: m.cost ?? 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
    value: Math.max(1, Math.round(((m.total_tokens || 0) / maxTok) * 100)),
  }));
}

function mapTrendRows(points: HcaiDashboardTrendPoint[]): TrendChartPoint[] {
  return points.map((p) => {
    const inputRaw = p.input_tokens ?? 0;
    const outputRaw = p.output_tokens ?? 0;
    const cacheCreateRaw = p.cache_creation_tokens ?? 0;
    const cacheReadRaw = p.cache_read_tokens ?? 0;
    // 命中率：cache_read / (input + cache_read)，与 Web 一致
    const denom = inputRaw + cacheReadRaw;
    const hit = denom > 0 ? Math.round((cacheReadRaw / denom) * 1000) / 10 : 0;
    // 图表用百万 token，与命中率(0–100)同轴可读
    const toM = (n: number) => Math.round((n / 1e6) * 100) / 100;
    const fullDate = p.date.length >= 10 ? p.date.slice(0, 10) : p.date;
    const dateLabel = fullDate.length >= 10 ? fullDate.slice(5, 10) : fullDate;
    return {
      date: dateLabel,
      fullDate,
      input: toM(inputRaw),
      output: toM(outputRaw),
      inputRaw,
      outputRaw,
      cacheCreateRaw,
      cacheReadRaw,
      hit,
      actual: p.actual_cost ?? 0,
      standard: p.cost ?? 0,
    };
  });
}

function mapPlatformCards(platforms: HcaiDashboardPlatformStat[] | undefined) {
  return (platforms ?? []).map((p) => ({
    key: p.platform,
    name: platformLabel(p.platform),
    total: p.total_actual_cost ?? 0,
    today: p.today_actual_cost ?? 0,
    requests: p.total_requests ?? 0,
    tokenLabel: formatTokens(p.total_tokens),
  }));
}

function DashboardPage({
  accessToken,
  balance,
  onUserPatch,
  onUnauthorized,
}: {
  accessToken: string;
  balance: number;
  onUserPatch: (user: HcaiAuthUser) => void;
  onUnauthorized: () => void;
}) {
  const [dateSel, setDateSel] = useState<DashboardDateSelection>(() =>
    defaultDashboardDateSelection(),
  );
  const [granularity, setGranularity] = useState<DashboardGranularity>("day");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<HcaiDashboardStats | null>(null);
  const [models, setModels] = useState<HcaiDashboardModelStat[]>([]);
  const [trend, setTrend] = useState<HcaiDashboardTrendPoint[]>([]);
  const [liveBalance, setLiveBalance] = useState(balance);

  const load = useCallback(
    async (opts?: {
      soft?: boolean;
      range?: DashboardDateSelection;
      grain?: DashboardGranularity;
    }) => {
      const soft = opts?.soft ?? false;
      const range = opts?.range ?? dateSel;
      const grain = opts?.grain ?? granularity;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const { startDate, endDate } = range;
      // 近 24 小时默认按小时粒度更合理
      const effectiveGrain: DashboardGranularity =
        range.preset === "24h" ? "hour" : grain;

      try {
        const [me, s, m, t] = await Promise.all([
          fetchHcaiAuthMe(accessToken),
          fetchHcaiDashboardStats(accessToken),
          fetchHcaiDashboardModels(accessToken, { startDate, endDate }),
          fetchHcaiDashboardTrend(accessToken, {
            startDate,
            endDate,
            granularity: effectiveGrain,
          }),
        ]);

        setLiveBalance(me.balance ?? 0);
        onUserPatch(me);
        setStats(s);
        setModels(m.models ?? []);
        setTrend(t.trend ?? []);
        if (range.preset === "24h" && grain !== "hour") {
          setGranularity("hour");
        }
      } catch (err) {
        if (isHcaiUnauthorizedError(err)) {
          toast.error("登录已过期，请重新登录");
          onUnauthorized();
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "加载仪表盘失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, dateSel, granularity, onUserPatch, onUnauthorized],
  );

  useEffect(() => {
    void load();
    // 仅首屏 / token 变化自动拉；时间范围靠「应用」、粒度靠下方 Select
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const modelRows = useMemo(() => mapModelRows(models), [models]);
  const trendRows = useMemo(() => mapTrendRows(trend), [trend]);
  const platforms = useMemo(
    () => mapPlatformCards(stats?.by_platform),
    [stats],
  );

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">加载仪表盘…</span>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void load()}
        >
          重试
        </Button>
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span className="truncate">{error}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0"
            onClick={() => void load({ soft: true })}
          >
            重试
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          iconClass="bg-primary/15 text-primary"
          label="余额"
          value={money2(liveBalance)}
          sub="可用"
          valueClass="text-primary"
        />
        <StatCard
          icon={<KeyRound className="h-4 w-4" />}
          iconClass="bg-sky-500/15 text-sky-600"
          label="API 密钥"
          value={s.total_api_keys ?? 0}
          sub={`${s.active_api_keys ?? 0} 启用`}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          iconClass="bg-teal-500/15 text-teal-600"
          label="今日请求"
          value={(s.today_requests ?? 0).toLocaleString()}
          sub={`总计: ${(s.total_requests ?? 0).toLocaleString()}`}
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          iconClass="bg-violet-500/15 text-violet-600"
          label="今日消费"
          value={`${money(s.today_actual_cost ?? 0)} / ${money(s.today_cost ?? 0)}`}
          sub={`总计: ${money(s.total_actual_cost ?? 0)} / ${money(s.total_cost ?? 0)}`}
          valueClass="text-violet-600 dark:text-violet-400 text-sm"
        />
        <StatCard
          icon={<Database className="h-4 w-4" />}
          iconClass="bg-amber-500/15 text-amber-600"
          label="今日 Token"
          value={formatTokens(s.today_tokens)}
          sub={`输入: ${formatTokens(s.today_input_tokens)} / 输出: ${formatTokens(s.today_output_tokens)}`}
        />
        <StatCard
          icon={<Database className="h-4 w-4" />}
          iconClass="bg-indigo-500/15 text-indigo-600"
          label="累计 Token"
          value={formatTokens(s.total_tokens)}
          sub={`输入: ${formatTokens(s.total_input_tokens)} / 输出: ${formatTokens(s.total_output_tokens)}`}
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          iconClass="bg-purple-500/15 text-purple-600"
          label="性能指标"
          value={`${s.rpm ?? 0} RPM`}
          sub={`${s.tpm ?? 0} TPM`}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          iconClass="bg-rose-500/15 text-rose-600"
          label="平均响应"
          value={formatLatencySeconds(s.average_duration_ms)}
          sub="平均时间"
        />
      </div>

      <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">按平台拆分</h4>
          <span className="text-xs text-muted-foreground">
            {platforms.length} 个平台
          </span>
        </div>
        {platforms.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            暂无平台数据
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {platforms.map((p) => (
              <div
                key={p.key}
                className="rounded-lg border border-border/70 p-3 space-y-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-violet-600 dark:text-violet-400 font-medium tabular-nums">
                    {money(p.total)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>今日消费</span>
                  <span className="text-right tabular-nums text-foreground">
                    {money(p.today)}
                  </span>
                  <span>请求</span>
                  <span className="text-right tabular-nums text-foreground">
                    {p.requests.toLocaleString()}
                  </span>
                  <span>Token</span>
                  <span className="text-right tabular-nums text-foreground">
                    {p.tokenLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card px-3 py-2.5">
        <span className="text-xs text-muted-foreground">时间范围:</span>
        <DashboardDateRangePicker
          value={dateSel}
          onApply={(next) => {
            setDateSel(next);
            if (next.preset === "24h") setGranularity("hour");
            void load({ soft: true, range: next });
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full"
          disabled={refreshing || loading}
          onClick={() => void load({ soft: true })}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5 mr-1", refreshing && "animate-spin")}
          />
          刷新
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">粒度:</span>
        <Select
          value={granularity}
          onValueChange={(v) => {
            const g = v as DashboardGranularity;
            setGranularity(g);
            void load({ soft: true, grain: g });
          }}
        >
          <SelectTrigger className="h-8 w-[90px] text-xs rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">按天</SelectItem>
            <SelectItem value="hour">按小时</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
        {modelRows.length === 0 ? (
          <div
            className={cn(
              DASHBOARD_SPLIT_PANEL,
              "items-center justify-center text-xs text-muted-foreground",
            )}
          >
            所选范围内暂无模型数据
          </div>
        ) : (
          <DistTable title="模型分布" nameKey="模型" rows={modelRows} />
        )}
        {trendRows.length === 0 ? (
          <div
            className={cn(
              DASHBOARD_SPLIT_PANEL,
              "items-center justify-center text-xs text-muted-foreground",
            )}
          >
            所选范围内暂无趋势数据
          </div>
        ) : (
          <TokenTrend data={trendRows} />
        )}
      </div>
    </div>
  );
}

const HCAI_ENDPOINT_CHIPS: { name: string; tag?: string; url: string }[] = [
  { name: "API 端点", tag: "默认", url: `${HCAI_ENDPOINT_ROOTS[0]}/v1` },
  { name: "备用端点", url: `${HCAI_ENDPOINT_ROOTS[1]}/v1` },
  { name: "生图专用", url: `${HCAI_ENDPOINT_ROOTS[2]}/v1` },
  { name: "Anthropic端点", url: HCAI_ENDPOINT_ROOTS[0] },
];

function maskApiKey(key: string): string {
  const k = key.trim();
  if (k.length <= 12) return k;
  return `${k.slice(0, 6)}...${k.slice(-4)}`;
}

function formatHcaiDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function statusLabel(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "active") return "活跃";
  if (s === "disabled" || s === "inactive") return "禁用";
  return status?.trim() || "—";
}

function isKeyActive(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "active";
}

/** 仅当接口返回了嵌套 group 对象（或能在可用分组中解析到）才视为有分组 */
function resolveKeyGroup(
  item: HcaiApiKeyItem,
  available: HcaiGroup[],
): HcaiGroup | null {
  if (item.group?.id != null && item.group.name?.trim()) {
    return item.group;
  }
  const gid = item.group?.id ?? item.group_id;
  if (gid == null) return null;
  return available.find((g) => g.id === gid) ?? null;
}

async function copyText(text: string, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error("复制失败");
  }
}

function patchKeyInList(
  prev: HcaiApiKeyItem[],
  updated: HcaiApiKeyItem,
  statusFilter: string,
): HcaiApiKeyItem[] {
  const merged = prev.map((it) =>
    it.id === updated.id ? { ...it, ...updated } : it,
  );
  if (statusFilter === "active") {
    return merged.filter((it) => isKeyActive(it.status));
  }
  if (statusFilter === "inactive") {
    return merged.filter((it) => !isKeyActive(it.status));
  }
  return merged;
}

function ApiKeysPage({
  accessToken,
  onUnauthorized,
  onProvidersChanged,
}: {
  accessToken: string;
  onUnauthorized: () => void;
  onProvidersChanged?: () => void;
}) {
  const [items, setItems] = useState<HcaiApiKeyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // 可用分组（创建/编辑）
  const [availableGroups, setAvailableGroups] = useState<HcaiGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // 创建
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createGroupId, setCreateGroupId] = useState<string>("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<HcaiApiKeyItem | null>(null);

  // 编辑
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<HcaiApiKeyItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editGroupId, setEditGroupId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<HcaiApiKeyItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // 使用密钥 → 添加配置（密钥从列表带入，只读）
  const [useKeyTarget, setUseKeyTarget] = useState<HcaiApiKeyItem | null>(null);

  const openUseKey = (item: HcaiApiKeyItem) => {
    if (!item.key?.trim()) {
      toast.error("该密钥无可用内容");
      return;
    }
    if (!resolveKeyGroup(item, availableGroups)) {
      toast.error("请先为密钥选择分组后再使用");
      return;
    }
    if (!isKeyActive(item.status)) {
      toast.message("该密钥当前为禁用状态，可能无法正常拉取模型或写入配置");
    }
    setUseKeyTarget(item);
  };

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (isHcaiUnauthorizedError(err)) {
        toast.error("登录已过期，请重新登录");
        onUnauthorized();
        return true;
      }
      return false;
    },
    [onUnauthorized],
  );

  const load = useCallback(
    async (opts?: { soft?: boolean; page?: number; status?: string }) => {
      const soft = opts?.soft ?? false;
      const nextPage = opts?.page ?? page;
      const nextStatus = opts?.status ?? statusFilter;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchHcaiApiKeys(accessToken, {
          page: nextPage,
          pageSize: 100,
          status: nextStatus === "all" ? null : nextStatus,
        });
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? nextPage);
        setPages(data.pages ?? 1);
      } catch (err) {
        if (handleAuthError(err)) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, handleAuthError, page, statusFilter],
  );

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const list = await fetchHcaiAvailableGroups(accessToken);
      setAvailableGroups(Array.isArray(list) ? list : []);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error(err instanceof Error ? err.message : "加载可用分组失败");
    } finally {
      setGroupsLoading(false);
    }
  }, [accessToken, handleAuthError]);

  useEffect(() => {
    void load();
    void loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const openCreate = () => {
    setCreateName("");
    setCreateGroupId("");
    setCreatedKey(null);
    setCreateOpen(true);
    if (availableGroups.length === 0) void loadGroups();
  };

  const openEdit = (item: HcaiApiKeyItem) => {
    const g = resolveKeyGroup(item, availableGroups);
    setEditItem(item);
    setEditName(item.name ?? "");
    setEditGroupId(g ? String(g.id) : "");
    setEditStatus(isKeyActive(item.status) ? "active" : "inactive");
    setEditOpen(true);
    if (availableGroups.length === 0) void loadGroups();
  };

  const submitCreate = async () => {
    const name = createName.trim();
    const gid = Number(createGroupId);
    if (!name) {
      toast.error("请填写名称");
      return;
    }
    if (!Number.isFinite(gid) || gid <= 0) {
      toast.error("请选择分组");
      return;
    }
    setCreateSubmitting(true);
    try {
      const created = await createHcaiApiKey(accessToken, {
        name,
        group_id: gid,
      });
      setCreatedKey(created);
      toast.success("密钥已创建");
      void load({ soft: true, page: 1 });
      setPage(1);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const submitEdit = async () => {
    if (!editItem) return;
    const name = editName.trim();
    const gid = Number(editGroupId);
    if (!name) {
      toast.error("请填写名称");
      return;
    }
    if (!Number.isFinite(gid) || gid <= 0) {
      toast.error("请选择分组");
      return;
    }
    setEditSubmitting(true);
    try {
      // 对齐 Web PUT 字段；UI 不暴露的限制类字段置默认
      await updateHcaiApiKey(accessToken, editItem.id, {
        name,
        group_id: gid,
        status: editStatus,
        ip_whitelist: [],
        ip_blacklist: [],
        quota: 0,
        expires_at: "",
        rate_limit_5h: 0,
        rate_limit_1d: 0,
        rate_limit_7d: 0,
      });
      toast.success("密钥已更新");
      setEditOpen(false);
      // 用返回数据刷新行，确保状态/分组即时正确
      void load({ soft: true });
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setEditSubmitting(false);
    }
  };

  const toggleStatus = async (item: HcaiApiKeyItem) => {
    const active = isKeyActive(item.status);
    const next: "active" | "inactive" = active ? "inactive" : "active";
    setBusyId(item.id);
    try {
      const updated = await setHcaiApiKeyStatus(accessToken, item.id, next);
      // 以接口返回为准立刻更新行状态（避免仍显示「活跃」）
      const finalStatus = (updated?.status as string | undefined) ?? next;
      const patched: HcaiApiKeyItem = {
        ...item,
        ...updated,
        status: finalStatus,
      };
      setItems((prev) => patchKeyInList(prev, patched, statusFilter));
      toast.success(isKeyActive(finalStatus) ? "已启用" : "已禁用");
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  };

  const assignGroup = async (item: HcaiApiKeyItem, group: HcaiGroup) => {
    setBusyId(item.id);
    try {
      const updated = await updateHcaiApiKey(accessToken, item.id, {
        name: item.name || "API Key",
        group_id: group.id,
        status: isKeyActive(item.status) ? "active" : "inactive",
        ip_whitelist: [],
        ip_blacklist: [],
        quota: 0,
        expires_at: "",
        rate_limit_5h: 0,
        rate_limit_1d: 0,
        rate_limit_7d: 0,
      });
      const patched: HcaiApiKeyItem = {
        ...item,
        ...updated,
        group_id: group.id,
        group: updated.group ?? group,
      };
      setItems((prev) => patchKeyInList(prev, patched, statusFilter));
      toast.success("分组已更新");
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error(err instanceof Error ? err.message : "更新分组失败");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteSubmitting) return;
    const target = deleteTarget;
    setDeleteSubmitting(true);
    setBusyId(target.id);
    try {
      await deleteHcaiApiKey(accessToken, target.id);
      setItems((prev) => prev.filter((it) => it.id !== target.id));
      setTotal((t) => Math.max(0, t - 1));
      setDeleteTarget(null);
      toast.success("密钥已删除");
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleteSubmitting(false);
      setBusyId(null);
    }
  };

  const groupOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      const g = resolveKeyGroup(it, availableGroups);
      if (g) {
        map.set(String(g.id), g.name?.trim() || `分组 ${g.id}`);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh"));
  }, [items, availableGroups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const g = resolveKeyGroup(it, availableGroups);
      if (groupFilter === "none") {
        if (g) return false;
      } else if (groupFilter !== "all") {
        if (!g || String(g.id) !== groupFilter) return false;
      }
      if (!q) return true;
      const name = (it.name ?? "").toLowerCase();
      const key = (it.key ?? "").toLowerCase();
      const gname = (g?.name ?? "").toLowerCase();
      return name.includes(q) || key.includes(q) || gname.includes(q);
    });
  }, [items, search, groupFilter, availableGroups]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">API 密钥</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            管理您的 API 密钥和访问令牌
            {total > 0 ? (
              <span className="ml-1 tabular-nums">· 共 {total} 个</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={refreshing || loading}
            onClick={() => void load({ soft: true })}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={openCreate}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            创建密钥
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="搜索名称或 Key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="全部分组" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分组</SelectItem>
            <SelectItem value="none">无分组</SelectItem>
            {groupOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
            void load({ soft: true, page: 1, status: v });
          }}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">活跃</SelectItem>
            <SelectItem value="inactive">禁用</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {HCAI_ENDPOINT_CHIPS.map((ep) => (
          <button
            key={ep.url + ep.name}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted/70 transition-colors"
            title="点击复制端点"
            onClick={() => void copyText(ep.url, "端点已复制")}
          >
            <span className="text-muted-foreground">{ep.name}</span>
            {ep.tag ? <span className="text-primary">{ep.tag}</span> : null}
            <span className="font-mono text-foreground/80 truncate max-w-[180px]">
              {ep.url}
            </span>
            <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>

      {error && !loading ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center justify-between gap-2">
          <span className="truncate">{error}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0"
            onClick={() => void load({ soft: true })}
          >
            重试
          </Button>
        </div>
      ) : null}

      <div className="rounded-xl border border-border/80 overflow-x-auto bg-card">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            加载密钥列表…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            {search || groupFilter !== "all" ? "没有匹配的密钥" : "暂无密钥"}
          </div>
        ) : (
          <table className="w-full text-sm min-w-[1080px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                <th className="px-3 py-3 font-medium text-muted-foreground">
                  名称
                </th>
                <th className="px-3 py-3 font-medium text-muted-foreground">
                  API 密钥
                </th>
                <th className="px-3 py-3 font-medium text-muted-foreground">
                  分组
                </th>
                <th className="px-3 py-3 font-medium text-muted-foreground">
                  当前并发
                </th>
                <th className="px-3 py-3 font-medium text-muted-foreground">
                  用量
                </th>
                <th className="px-3 py-3 font-medium text-muted-foreground">
                  过期时间
                </th>
                <th className="px-3 py-3 font-medium text-muted-foreground">
                  状态
                </th>
                <th className="px-3 py-3 font-medium text-muted-foreground">
                  创建时间
                </th>
                <th className="px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((k) => {
                const group = resolveKeyGroup(k, availableGroups);
                const active = isKeyActive(k.status);
                const rowBusy = busyId === k.id;
                return (
                  <tr
                    key={k.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-3 py-3 font-medium text-muted-foreground">
                      {k.name || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-mono text-primary hover:text-primary/80 transition-colors"
                        title="点击复制完整密钥"
                        onClick={() =>
                          void copyText(k.key, "密钥已复制到剪贴板")
                        }
                      >
                        {maskApiKey(k.key)}
                        <Copy className="h-3 w-3 opacity-60" />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {group ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <HcaiGroupPicker
                            groups={availableGroups}
                            valueId={group.id}
                            loading={groupsLoading}
                            disabled={rowBusy}
                            compact
                            className="!h-auto !px-0"
                            onSelect={(g) => void assignGroup(k, g)}
                          />
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {groupRateLabel(group).replace(" 倍率", "")}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">
                            无分组
                          </span>
                          <HcaiGroupPicker
                            groups={availableGroups}
                            valueId={null}
                            loading={groupsLoading}
                            disabled={rowBusy}
                            compact
                            placeholder="选择分组"
                            onSelect={(g) => void assignGroup(k, g)}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {k.current_concurrency ?? 0}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {/* 列表接口自带 usage_1d / usage_7d / usage_5h */}
                      <div>
                        <span className="text-muted-foreground">今日: </span>
                        <span className="text-foreground">
                          {money(k.usage_1d ?? 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">近7天: </span>
                        <span className="text-foreground">
                          {money(k.usage_7d ?? 0)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {k.expires_at
                        ? formatHcaiDateTime(k.expires_at)
                        : "永久有效"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5",
                          active
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {statusLabel(k.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {formatHcaiDateTime(k.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-nowrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-7 px-2.5 shrink-0"
                          disabled={!group}
                          title={
                            group
                              ? "使用该密钥添加应用配置"
                              : "请先选择分组后再使用密钥"
                          }
                          onClick={() => openUseKey(k)}
                        >
                          使用密钥
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 shrink-0"
                          disabled={rowBusy}
                          onClick={() => void toggleStatus(k)}
                        >
                          {rowBusy ? "…" : active ? "禁用" : "启用"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 shrink-0"
                          onClick={() => openEdit(k)}
                        >
                          编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/40"
                          disabled={rowBusy || deleteSubmitting}
                          onClick={() => setDeleteTarget(k)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            第 {page} / {pages} 页
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={page <= 1 || loading}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              void load({ soft: true, page: p });
            }}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={page >= pages || loading}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              void load({ soft: true, page: p });
            }}
          >
            下一页
          </Button>
        </div>
      ) : null}

      {/* 创建密钥：仅名称 + 分组 */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          if (!createSubmitting) {
            setCreateOpen(o);
            if (!o) setCreatedKey(null);
          }
        }}
      >
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden sm:rounded-2xl">
          <DialogHeader className="flex-row items-center justify-between space-y-0 gap-3">
            <DialogTitle>创建密钥</DialogTitle>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 -mr-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => !createSubmitting && setCreateOpen(false)}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            {createdKey ? (
              <div className="space-y-3">
                <p className="text-sm text-primary">
                  创建成功，请复制保存密钥（仅此一次完整展示）：
                </p>
                <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs break-all">
                  {createdKey.key}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    void copyText(createdKey.key, "密钥已复制到剪贴板")
                  }
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  复制密钥
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">名称</Label>
                  <Input
                    className="h-9 text-sm"
                    placeholder="我的 API 密钥"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    disabled={createSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">分组</Label>
                  <HcaiGroupPicker
                    groups={availableGroups}
                    valueId={createGroupId ? Number(createGroupId) : null}
                    loading={groupsLoading}
                    disabled={createSubmitting}
                    placeholder="选择分组"
                    onSelect={(g) => setCreateGroupId(String(g.id))}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            {createdKey ? (
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  setCreateOpen(false);
                  setCreatedKey(null);
                }}
              >
                完成
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full"
                  disabled={createSubmitting}
                  onClick={() => setCreateOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={createSubmitting}
                  onClick={() => void submitCreate()}
                >
                  {createSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "创建"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="删除密钥"
        message={
          deleteTarget
            ? `确定删除密钥「${deleteTarget.name || "未命名"}」吗？\n\n密钥：${maskApiKey(deleteTarget.key)}\n删除后无法恢复，使用该密钥的应用将立即失效。`
            : ""
        }
        confirmText={deleteSubmitting ? "删除中…" : "确认删除"}
        cancelText="取消"
        variant="destructive"
        onCancel={() => {
          if (!deleteSubmitting) setDeleteTarget(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
      />

      {/* 编辑：名称 + 分组 + 状态 */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!editSubmitting) setEditOpen(o);
        }}
      >
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden sm:rounded-2xl">
          <DialogHeader className="flex-row items-center justify-between space-y-0 gap-3">
            <DialogTitle>编辑密钥</DialogTitle>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 -mr-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => !editSubmitting && setEditOpen(false)}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">名称</Label>
              <Input
                className="h-9 text-sm"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={editSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">分组</Label>
              <HcaiGroupPicker
                groups={availableGroups}
                valueId={editGroupId ? Number(editGroupId) : null}
                loading={groupsLoading}
                disabled={editSubmitting}
                placeholder="选择分组"
                onSelect={(g) => setEditGroupId(String(g.id))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">状态</Label>
              <Select
                value={editStatus}
                onValueChange={(v) => setEditStatus(v as "active" | "inactive")}
                disabled={editSubmitting}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="inactive">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full"
              disabled={editSubmitting}
              onClick={() => setEditOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={editSubmitting}
              onClick={() => void submitEdit()}
            >
              {editSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "更新"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 使用密钥：带入列表 sk，勾选应用并添加配置 */}
      <Dialog
        open={Boolean(useKeyTarget)}
        onOpenChange={(o) => {
          if (!o) setUseKeyTarget(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden sm:rounded-2xl">
          <DialogHeader className="flex-row items-center justify-between space-y-0 gap-3 border-b border-border/60">
            <DialogTitle>使用密钥 · 添加配置</DialogTitle>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 -mr-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => setUseKeyTarget(null)}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-4rem)]">
            {useKeyTarget ? (
              <HcaiUseKeyPanel
                key={useKeyTarget.id}
                apiKey={useKeyTarget.key}
                label={useKeyTarget.name || undefined}
                groupName={
                  resolveKeyGroup(useKeyTarget, availableGroups)?.name ||
                  undefined
                }
                locked
                onApplied={() => setUseKeyTarget(null)}
                onProvidersChanged={onProvidersChanged}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function mapEndpointRows(endpoints: HcaiUsageEndpointStat[] | undefined) {
  const list = [...(endpoints ?? [])].sort(
    (a, b) => (b.total_tokens || 0) - (a.total_tokens || 0),
  );
  const maxTok = Math.max(...list.map((e) => e.total_tokens || 0), 1);
  return list.map((e, i) => ({
    name: e.endpoint || "—",
    requests: e.requests ?? 0,
    token: formatTokens(e.total_tokens),
    actual: e.actual_cost ?? 0,
    standard: e.cost ?? 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
    value: Math.max(1, Math.round(((e.total_tokens || 0) / maxTok) * 100)),
  }));
}

function mapGroupRows(groups: HcaiUsageGroupStat[] | undefined) {
  const list = [...(groups ?? [])].sort(
    (a, b) => (b.total_tokens || 0) - (a.total_tokens || 0),
  );
  const maxTok = Math.max(...list.map((g) => g.total_tokens || 0), 1);
  return list.map((g, i) => ({
    name: g.group_name || `分组 ${g.group_id}`,
    requests: g.requests ?? 0,
    token: formatTokens(g.total_tokens),
    actual: g.actual_cost ?? 0,
    standard: g.cost ?? 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
    value: Math.max(1, Math.round(((g.total_tokens || 0) / maxTok) * 100)),
  }));
}

function formatUsageTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    // 接口已带时区偏移，用本地展示组件即可（用户环境多为 +08）
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

function capitalizeWord(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function requestTypeLabel(row: HcaiUsageRecord): string {
  if (row.stream || row.request_type === "stream") return "流式";
  if (row.request_type) return row.request_type;
  return "普通";
}

function billingModeLabel(mode: string | null | undefined): string {
  if (!mode) return "—";
  const m = mode.toLowerCase();
  if (m === "token") return "按量";
  if (m === "subscription") return "订阅";
  return mode;
}

/** 缓存 Token 图标（来自 cache.svg，颜色 text-sky-500） */
function CacheTokenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
      />
    </svg>
  );
}

const DETAIL_TIP_CLASS =
  "z-[100] max-w-none rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-xs text-slate-200 shadow-xl";

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-0.5">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className={cn("tabular-nums text-right", valueClass)}>{value}</span>
    </div>
  );
}

/** 由费用/Token 推算每百万单价 */
function pricePerMillion(
  explicit: number | undefined,
  cost: number | undefined,
  tokens: number | undefined,
): number | null {
  if (explicit != null && !Number.isNaN(explicit)) return explicit;
  if (cost == null || tokens == null || tokens <= 0 || Number.isNaN(cost))
    return null;
  return (cost / tokens) * 1_000_000;
}

function formatPricePerM(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toFixed(4)} / 1M Token`;
}

function serviceTierLabel(row: HcaiUsageRecord): string {
  if (row.service_tier) return capitalizeWord(row.service_tier);
  // 无明确档位时按倍率兜底：1x 视为 Standard
  const m = row.rate_multiplier ?? row.group?.rate_multiplier;
  if (m == null || m === 1) return "Standard";
  return "—";
}

function UsageTokenCell({ row }: { row: HcaiUsageRecord }) {
  const input = row.input_tokens ?? 0;
  const output = row.output_tokens ?? 0;
  const cacheRead = row.cache_read_tokens ?? 0;
  const cacheCreate = row.cache_creation_tokens ?? 0;
  // 列表展示缓存读取；写入并入 tooltip 若有
  const total = input + output + cacheRead + cacheCreate;

  return (
    <div className="flex items-start gap-1.5">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums leading-tight">
          <span className="inline-flex items-center gap-0.5 text-emerald-500">
            <ArrowDown className="h-3 w-3 shrink-0" strokeWidth={2.5} />
            {input.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-0.5 text-violet-400">
            <ArrowUp className="h-3 w-3 shrink-0" strokeWidth={2.5} />
            {output.toLocaleString()}
          </span>
        </div>
        {(cacheRead > 0 || cacheCreate > 0) && (
          <div className="inline-flex items-center gap-1 tabular-nums text-sky-500 leading-tight">
            <CacheTokenIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{formatTokens(cacheRead > 0 ? cacheRead : cacheCreate)}</span>
          </div>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="mt-0.5 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors"
            aria-label="Token 明细"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          align="start"
          className={DETAIL_TIP_CLASS}
          sideOffset={8}
        >
          <div className="mb-1.5 font-medium text-slate-100">Token 明细</div>
          <DetailRow label="输入 Token" value={input.toLocaleString()} />
          <DetailRow label="输出 Token" value={output.toLocaleString()} />
          <DetailRow
            label="缓存读取 Token"
            value={cacheRead.toLocaleString()}
          />
          {cacheCreate > 0 ? (
            <DetailRow
              label="缓存写入 Token"
              value={cacheCreate.toLocaleString()}
            />
          ) : null}
          <div className="my-1.5 border-t border-white/10" />
          <DetailRow
            label="总 Token"
            value={total.toLocaleString()}
            valueClass="font-medium text-sky-400"
          />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/** 延迟时长展示：≥60s 用 1m 1s，否则 4.02s */
function formatLatencyDisplay(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  const sec = ms / 1000;
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s}s`;
  }
  return `${sec.toFixed(2)}s`;
}

/**
 * 延迟标识：
 * - 首字 > 40s → 橙色
 * - 总耗时 > 60s → 浅黄
 * - 正常 → 绿色
 * 左侧色条取较严重一档（橙 > 黄 > 绿）
 */
function UsageLatencyCell({ row }: { row: HcaiUsageRecord }) {
  const firstMs = row.first_token_ms;
  const totalMs = row.duration_ms;
  const firstSlow = firstMs != null && firstMs > 40_000;
  const totalSlow = totalMs != null && totalMs > 60_000;

  const barClass = firstSlow
    ? "bg-orange-400"
    : totalSlow
      ? "bg-amber-300"
      : "bg-emerald-400";
  const firstClass = firstSlow ? "text-orange-500" : "text-emerald-500";
  const totalClass = totalSlow ? "text-amber-400" : "text-emerald-500";

  return (
    <div className="flex items-stretch gap-2 min-w-[7.5rem]">
      <div className={cn("w-1 shrink-0 rounded-full self-stretch", barClass)} />
      <div className="space-y-0.5 text-xs leading-tight tabular-nums">
        <div className={firstClass}>
          <span className="mr-1.5 opacity-80">首字</span>
          {formatLatencyDisplay(firstMs)}
        </div>
        <div className={totalClass}>
          <span className="mr-1.5 opacity-80">总耗时</span>
          {formatLatencyDisplay(totalMs)}
        </div>
      </div>
    </div>
  );
}

function UsageCostCell({ row }: { row: HcaiUsageRecord }) {
  const inputCost = row.input_cost ?? 0;
  const outputCost = row.output_cost ?? 0;
  const cacheReadCost = row.cache_read_cost ?? 0;
  const cacheCreateCost = row.cache_creation_cost ?? 0;
  const totalCost = row.total_cost ?? 0;
  const actual =
    row.actual_cost ??
    (totalCost || inputCost + outputCost + cacheReadCost + cacheCreateCost);
  const rate = row.rate_multiplier ?? row.group?.rate_multiplier ?? 1;

  const inputPrice = pricePerMillion(
    row.input_price,
    row.input_cost,
    row.input_tokens,
  );
  const outputPrice = pricePerMillion(
    row.output_price,
    row.output_cost,
    row.output_tokens,
  );

  return (
    <div className="flex items-center gap-1">
      <span className="tabular-nums text-emerald-500 font-medium">
        {money(actual, 6)}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded-full text-muted-foreground/70 hover:text-foreground transition-colors"
            aria-label="费用明细"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          align="start"
          className={DETAIL_TIP_CLASS}
          sideOffset={8}
        >
          <div className="mb-1.5 font-medium text-slate-100">费用明细</div>
          <DetailRow label="输入费用" value={money(inputCost, 6)} />
          <DetailRow label="输出费用" value={money(outputCost, 6)} />
          <DetailRow
            label="输入单价"
            value={formatPricePerM(inputPrice)}
            valueClass="text-sky-400"
          />
          <DetailRow
            label="输出单价"
            value={formatPricePerM(outputPrice)}
            valueClass="text-violet-400"
          />
          <DetailRow label="缓存读取费用" value={money(cacheReadCost, 6)} />
          {cacheCreateCost > 0 ? (
            <DetailRow label="缓存写入费用" value={money(cacheCreateCost, 6)} />
          ) : null}
          <div className="my-1.5 border-t border-white/10" />
          <DetailRow
            label="服务档位"
            value={serviceTierLabel(row)}
            valueClass="text-sky-400"
          />
          <DetailRow
            label="倍率"
            value={`${rate.toFixed(2)}x`}
            valueClass="text-sky-400"
          />
          <DetailRow label="原始" value={money(totalCost || actual, 6)} />
          <DetailRow
            label="用户扣费"
            value={money(actual, 6)}
            valueClass="text-emerald-400 font-medium"
          />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

const USAGE_PAGE_SIZE = 20;

function UsagePage({
  accessToken,
  onUnauthorized,
}: {
  accessToken: string;
  onUnauthorized: () => void;
}) {
  const [dateSel, setDateSel] = useState<DashboardDateSelection>(() => {
    // 使用记录默认「本月」，更贴近 Web 控制台
    const month = dashboardDateRange("month");
    return {
      preset: "month",
      startDate: month.startDate,
      endDate: month.endDate,
    };
  });
  const [listTab, setListTab] = useState<"detail" | "error">("detail");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [errorListLoading, setErrorListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<HcaiUsageStats | null>(null);
  const [models, setModels] = useState<HcaiDashboardModelStat[]>([]);
  const [groups, setGroups] = useState<HcaiUsageGroupStat[]>([]);
  const [trend, setTrend] = useState<HcaiDashboardTrendPoint[]>([]);
  const [items, setItems] = useState<HcaiUsageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [errorItems, setErrorItems] = useState<HcaiUsageErrorRecord[]>([]);
  const [errorPage, setErrorPage] = useState(1);
  const [errorTotal, setErrorTotal] = useState(0);
  const [errorPages, setErrorPages] = useState(0);
  const [errorDetail, setErrorDetail] = useState<HcaiUsageErrorRecord | null>(
    null,
  );

  const loadSummary = useCallback(
    async (opts?: { soft?: boolean; range?: DashboardDateSelection }) => {
      const soft = opts?.soft ?? false;
      const range = opts?.range ?? dateSel;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const { startDate, endDate } = range;
      try {
        const [s, m, snap] = await Promise.all([
          fetchHcaiUsageStats(accessToken, { startDate, endDate }),
          fetchHcaiDashboardModels(accessToken, {
            startDate,
            endDate,
            modelSource: "requested",
          }),
          fetchHcaiUsageSnapshot(accessToken, {
            startDate,
            endDate,
            granularity: "day",
            includeTrend: true,
            includeGroupStats: true,
            includeModelStats: false,
          }),
        ]);
        setStats(s);
        setModels(m.models ?? []);
        setGroups(snap.groups ?? []);
        setTrend(snap.trend ?? []);
      } catch (err) {
        if (isHcaiUnauthorizedError(err)) {
          toast.error("登录已过期，请重新登录");
          onUnauthorized();
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "加载使用记录失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, dateSel, onUnauthorized],
  );

  const loadList = useCallback(
    async (opts?: {
      range?: DashboardDateSelection;
      page?: number;
      soft?: boolean;
    }) => {
      const range = opts?.range ?? dateSel;
      const p = opts?.page ?? page;
      setListLoading(true);

      const { startDate, endDate } = range;
      try {
        const list = await fetchHcaiUsageList(accessToken, {
          startDate,
          endDate,
          page: p,
          pageSize: USAGE_PAGE_SIZE,
        });
        setItems(list.items ?? []);
        setTotal(list.total ?? 0);
        setPages(list.pages ?? 0);
        setPage(list.page ?? p);
      } catch (err) {
        if (isHcaiUnauthorizedError(err)) {
          toast.error("登录已过期，请重新登录");
          onUnauthorized();
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg || "加载用量明细失败");
      } finally {
        setListLoading(false);
      }
    },
    [accessToken, dateSel, page, onUnauthorized],
  );

  const loadErrorList = useCallback(
    async (opts?: { range?: DashboardDateSelection; page?: number }) => {
      const range = opts?.range ?? dateSel;
      const p = opts?.page ?? errorPage;
      setErrorListLoading(true);

      const { startDate, endDate } = range;
      try {
        const list = await fetchHcaiUsageErrors(accessToken, {
          startDate,
          endDate,
          page: p,
          pageSize: USAGE_PAGE_SIZE,
        });
        setErrorItems(list.items ?? []);
        setErrorTotal(list.total ?? 0);
        setErrorPages(list.pages ?? 0);
        setErrorPage(list.page ?? p);
      } catch (err) {
        if (isHcaiUnauthorizedError(err)) {
          toast.error("登录已过期，请重新登录");
          onUnauthorized();
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg || "加载错误请求失败");
      } finally {
        setErrorListLoading(false);
      }
    },
    [accessToken, dateSel, errorPage, onUnauthorized],
  );

  useEffect(() => {
    void loadSummary();
    void loadList({ page: 1 });
    // 仅首屏 / token 变化；时间范围靠「应用」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // 切到错误请求时再拉列表（避免首屏多一次请求）
  useEffect(() => {
    if (listTab === "error") {
      setErrorPage(1);
      void loadErrorList({ page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listTab]);

  const modelRows = useMemo(() => mapModelRows(models), [models]);
  const groupRows = useMemo(() => mapGroupRows(groups), [groups]);
  const endpointRows = useMemo(
    () => mapEndpointRows(stats?.endpoints),
    [stats],
  );
  const trendRows = useMemo(() => mapTrendRows(trend), [trend]);

  const applyRange = (next: DashboardDateSelection) => {
    setDateSel(next);
    setPage(1);
    setErrorPage(1);
    void loadSummary({ range: next });
    void loadList({ range: next, page: 1 });
    if (listTab === "error") {
      void loadErrorList({ range: next, page: 1 });
    }
  };

  const refreshAll = () => {
    void loadSummary({ soft: true });
    void loadList({ soft: true });
    if (listTab === "error") {
      void loadErrorList();
    }
  };

  const resetRange = () => {
    const month = dashboardDateRange("month");
    applyRange({
      preset: "month",
      startDate: month.startDate,
      endDate: month.endDate,
    });
  };

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">加载使用记录…</span>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void loadSummary()}
        >
          重试
        </Button>
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span className="truncate">{error}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0"
            onClick={() => void loadSummary({ soft: true })}
          >
            重试
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">使用记录</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            查看和分析您的 API 使用历史
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={refreshing || loading}
          onClick={refreshAll}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          iconClass="bg-sky-500/15 text-sky-600"
          label="总请求数"
          value={(s.total_requests ?? 0).toLocaleString()}
          sub="所选范围内"
        />
        <StatCard
          icon={<Database className="h-4 w-4" />}
          iconClass="bg-amber-500/15 text-amber-600"
          label="总 Token"
          value={formatTokens(s.total_tokens)}
          sub={`输入: ${formatTokens(s.total_input_tokens)} / 输出: ${formatTokens(s.total_output_tokens)} / 缓存: ${formatTokens(s.total_cache_read_tokens ?? s.total_cache_tokens)}`}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          iconClass="bg-primary/15 text-primary"
          label="总消费"
          value={money(s.total_actual_cost ?? 0)}
          sub={`标准 ${money(s.total_cost ?? 0)}`}
          valueClass="text-primary"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          iconClass="bg-violet-500/15 text-violet-600"
          label="平均耗时"
          value={formatLatencySeconds(s.average_duration_ms)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card px-3 py-2.5">
        <span className="text-xs text-muted-foreground">时间范围:</span>
        <DashboardDateRangePicker value={dateSel} onApply={applyRange} />
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">粒度:</span>
        <Select value="day" disabled>
          <SelectTrigger className="h-8 w-[90px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">按天</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {modelRows.length > 0 ? (
          <DistTable title="模型分布" nameKey="模型" rows={modelRows} />
        ) : (
          <div className={DASHBOARD_SPLIT_PANEL}>
            <h4 className="text-sm font-semibold mb-2">模型分布</h4>
            <p className="text-xs text-muted-foreground m-auto">暂无模型数据</p>
          </div>
        )}
        {groupRows.length > 0 ? (
          <DistTable title="分组使用分布" nameKey="分组" rows={groupRows} />
        ) : (
          <div className={DASHBOARD_SPLIT_PANEL}>
            <h4 className="text-sm font-semibold mb-2">分组使用分布</h4>
            <p className="text-xs text-muted-foreground m-auto">暂无分组数据</p>
          </div>
        )}
        {endpointRows.length > 0 ? (
          <DistTable title="端点分布" nameKey="端点" rows={endpointRows} />
        ) : (
          <div className={DASHBOARD_SPLIT_PANEL}>
            <h4 className="text-sm font-semibold mb-2">端点分布</h4>
            <p className="text-xs text-muted-foreground m-auto">暂无端点数据</p>
          </div>
        )}
        {trendRows.length > 0 ? (
          <TokenTrend data={trendRows} />
        ) : (
          <div className={DASHBOARD_SPLIT_PANEL}>
            <h4 className="text-sm font-semibold mb-2">Token 使用趋势</h4>
            <p className="text-xs text-muted-foreground m-auto">暂无趋势数据</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border/80 bg-card p-3">
        <span className="text-xs text-muted-foreground self-center">
          共 {total.toLocaleString()} 条明细
        </span>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={listLoading}
          onClick={() => void loadList({ soft: true })}
        >
          {listLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : null}
          刷新明细
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={resetRange}
        >
          重置
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => toast.message("导出 CSV：接口待接入")}
        >
          导出 CSV
        </Button>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["detail", "用量明细"],
            ["error", "错误请求"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              listTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setListTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {listTab === "detail" ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-border/80 overflow-x-auto bg-card relative">
            {listLoading ? (
              <div className="absolute inset-0 bg-background/40 z-10 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            <TooltipProvider delayDuration={200}>
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                    {[
                      "API 密钥",
                      "模型",
                      "推理强度",
                      "端点",
                      "IP",
                      "分组",
                      "类型",
                      "计费模式",
                      "TOKEN",
                      "费用",
                      "延迟",
                      "时间",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-2.5 py-2 font-medium whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-2.5 py-10 text-center text-muted-foreground"
                      >
                        暂无用量明细
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="px-2.5 py-2 font-medium">
                          {row.api_key?.name ?? "—"}
                        </td>
                        <td className="px-2.5 py-2">{row.model}</td>
                        <td className="px-2.5 py-2">
                          {capitalizeWord(row.reasoning_effort)}
                        </td>
                        <td className="px-2.5 py-2 text-muted-foreground">
                          {row.inbound_endpoint
                            ? `入站: ${row.inbound_endpoint}`
                            : "—"}
                        </td>
                        <td className="px-2.5 py-2">
                          <div className="font-mono">
                            {row.ip_address || "—"}
                          </div>
                        </td>
                        <td className="px-2.5 py-2">
                          <GroupChip
                            group={row.group}
                            name={
                              row.group?.name ??
                              (row.group_id != null
                                ? `分组 ${row.group_id}`
                                : null)
                            }
                            platform={row.group?.platform}
                          />
                        </td>
                        <td className="px-2.5 py-2">
                          <span className="rounded-md bg-muted px-1.5 py-0.5">
                            {requestTypeLabel(row)}
                          </span>
                        </td>
                        <td className="px-2.5 py-2">
                          <span className="rounded-md bg-muted px-1.5 py-0.5">
                            {billingModeLabel(row.billing_mode)}
                          </span>
                        </td>
                        <td className="px-2.5 py-2">
                          <UsageTokenCell row={row} />
                        </td>
                        <td className="px-2.5 py-2">
                          <UsageCostCell row={row} />
                        </td>
                        <td className="px-2.5 py-2">
                          <UsageLatencyCell row={row} />
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap text-muted-foreground">
                          {formatUsageTime(row.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TooltipProvider>
          </div>

          {pages > 1 || total > USAGE_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                第 {page} / {Math.max(pages, 1)} 页
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={page <= 1 || listLoading}
                  onClick={() => {
                    const next = page - 1;
                    setPage(next);
                    void loadList({ page: next, soft: true });
                  }}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={page >= pages || listLoading}
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    void loadList({ page: next, soft: true });
                  }}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl border border-border/80 overflow-x-auto bg-card relative">
            {errorListLoading ? (
              <div className="absolute inset-0 bg-background/40 z-10 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                  {[
                    "API 密钥",
                    "模型",
                    "端点",
                    "状态码",
                    "分类",
                    "平台",
                    "错误信息",
                    "IP",
                    "分组",
                    "类型",
                    "时间",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-2.5 py-2 font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {errorItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-2.5 py-10 text-center text-muted-foreground"
                    >
                      暂无错误请求
                    </td>
                  </tr>
                ) : (
                  errorItems.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="px-2.5 py-2 font-medium whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {row.key_name || "—"}
                          {row.key_deleted ? (
                            <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                              已删除
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {row.model || "—"}
                      </td>
                      <td className="px-2.5 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {row.inbound_endpoint || "—"}
                      </td>
                      <td className="px-2.5 py-2">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-1.5 py-0.5 tabular-nums font-medium",
                            row.status_code >= 500
                              ? "bg-destructive/15 text-destructive"
                              : row.status_code >= 400
                                ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {row.status_code}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <span className="rounded-md bg-muted px-1.5 py-0.5">
                          {errorCategoryLabel(row.category)}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {row.platform ? platformLabel(row.platform) : "—"}
                      </td>
                      <td className="px-2.5 py-2 max-w-[280px]">
                        {row.message ? (
                          <button
                            type="button"
                            className="block w-full truncate text-left text-foreground hover:text-primary cursor-pointer transition-colors"
                            title="查看错误详情"
                            onClick={() => setErrorDetail(row)}
                          >
                            {row.message}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 font-mono text-xs whitespace-nowrap">
                        {row.client_ip || "—"}
                      </td>
                      <td className="px-2.5 py-2">
                        <GroupChip
                          name={row.group_name}
                          platform={row.platform}
                          emptyLabel="—"
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <span className="rounded-md bg-muted px-1.5 py-0.5">
                          {row.stream ? "流式" : "普通"}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap text-muted-foreground">
                        {formatUsageTime(row.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {errorPages > 1 || errorTotal > USAGE_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                共 {errorTotal} 条 · 第 {errorPage} / {Math.max(errorPages, 1)}{" "}
                页
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={errorPage <= 1 || errorListLoading}
                  onClick={() => {
                    const next = errorPage - 1;
                    setErrorPage(next);
                    void loadErrorList({ page: next });
                  }}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={errorPage >= errorPages || errorListLoading}
                  onClick={() => {
                    const next = errorPage + 1;
                    setErrorPage(next);
                    void loadErrorList({ page: next });
                  }}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : errorTotal > 0 ? (
            <div className="text-xs text-muted-foreground">
              共 {errorTotal} 条
            </div>
          ) : null}

          <ErrorRequestDetailDialog
            item={errorDetail}
            accessToken={accessToken}
            onUnauthorized={onUnauthorized}
            onClose={() => setErrorDetail(null)}
          />
        </div>
      )}
    </div>
  );
}

function errorCategoryLabel(category: string | null | undefined): string {
  if (!category) return "—";
  const map: Record<string, string> = {
    auth: "认证失败",
    rate_limit: "限流",
    quota: "额度不足",
    billing: "计费",
    upstream: "上游错误",
    validation: "参数错误",
    timeout: "超时",
    internal: "内部错误",
    unknown: "未知",
  };
  return map[category.toLowerCase()] ?? category;
}

/** 解析上游响应字段，优先 error_body（详情接口） */
function formatUpstreamBody(row: HcaiUsageErrorRecord): string | null {
  const raw =
    row.error_body ??
    row.upstream_response ??
    row.response_body ??
    row.raw_response ??
    row.detail ??
    null;
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  const s = String(raw).trim();
  if (!s) return null;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function ErrorDetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  );
}

function ErrorRequestDetailDialog({
  item,
  accessToken,
  onUnauthorized,
  onClose,
}: {
  item: HcaiUsageErrorRecord | null;
  accessToken: string;
  onUnauthorized: () => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<HcaiUsageErrorRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setDetail(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    // 先用列表行数据占位，再拉详情补全 error_body
    setDetail(item);
    setLoadError(null);
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const full = await fetchHcaiUsageErrorDetail(accessToken, item.id);
        if (!cancelled) setDetail(full);
      } catch (err) {
        if (cancelled) return;
        if (isHcaiUnauthorizedError(err)) {
          toast.error("登录已过期，请重新登录");
          onUnauthorized();
          onClose();
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg || "加载错误详情失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item, accessToken, onUnauthorized, onClose]);

  const display = detail ?? item;
  const upstream = display ? formatUpstreamBody(display) : null;

  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden sm:rounded-2xl">
        <DialogHeader className="flex-row items-center justify-between space-y-0 gap-3">
          <DialogTitle>错误请求详情</DialogTitle>
          <button
            type="button"
            className="shrink-0 rounded-md p-1.5 -mr-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>
        {display ? (
          <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[70vh]">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <ErrorDetailField label="时间">
                {formatUsageTime(display.created_at)}
              </ErrorDetailField>
              <ErrorDetailField label="模型">
                {display.model || "—"}
              </ErrorDetailField>
              <ErrorDetailField label="端点">
                <span className="font-mono text-xs">
                  {display.inbound_endpoint || "—"}
                </span>
              </ErrorDetailField>
              <ErrorDetailField label="状态码">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-xs tabular-nums font-medium",
                    display.status_code >= 500
                      ? "bg-destructive/15 text-destructive"
                      : display.status_code >= 400
                        ? "bg-muted text-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {display.status_code}
                </span>
              </ErrorDetailField>
              <ErrorDetailField label="分类">
                {errorCategoryLabel(display.category)}
              </ErrorDetailField>
              <ErrorDetailField label="平台">
                {display.platform ? platformLabel(display.platform) : "—"}
              </ErrorDetailField>
            </div>

            <ErrorDetailField label="错误信息">
              {display.message || "—"}
            </ErrorDetailField>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>上游响应内容</span>
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              </div>
              {loadError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {loadError}
                </div>
              ) : (
                <pre className="rounded-xl border border-border/80 bg-muted/40 px-3 py-2.5 text-xs font-mono text-foreground/90 whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto">
                  {upstream || (loading ? "加载中…" : "—")}
                </pre>
              )}
            </div>

            {(display.key_name || display.group_name || display.client_ip) && (
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-1 border-t border-border/60">
                {display.key_name ? (
                  <ErrorDetailField label="API 密钥">
                    {display.key_name}
                    {display.key_deleted ? "（已删除）" : ""}
                  </ErrorDetailField>
                ) : null}
                {display.group_name ? (
                  <ErrorDetailField label="分组">
                    <GroupChip
                      name={display.group_name}
                      platform={display.platform}
                    />
                  </ErrorDetailField>
                ) : null}
                {display.client_ip ? (
                  <ErrorDetailField label="IP">
                    <span className="font-mono text-xs">
                      {display.client_ip}
                    </span>
                  </ErrorDetailField>
                ) : null}
                <ErrorDetailField label="类型">
                  {display.stream ? "流式" : "普通"}
                </ErrorDetailField>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function isSubscriptionActive(status: string): boolean {
  return status === "active" || status === "有效";
}

function subscriptionStatusLabel(status: string): string {
  if (isSubscriptionActive(status)) return "有效";
  if (status === "expired" || status === "已过期") return "已过期";
  return status || "—";
}

function formatExpireDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  } catch {
    return iso;
  }
}

/** 剩余 N 天 (YYYY/MM/DD) / 已过期 */
function formatSubscriptionExpireLabel(
  expiresAt: string,
  status: string,
): string {
  if (!isSubscriptionActive(status)) return "已过期";
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return formatExpireDate(expiresAt);
  const ms = exp.getTime() - Date.now();
  if (ms <= 0) return "已过期";
  const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  return `剩余 ${days} 天 (${formatExpireDate(expiresAt)})`;
}

/** 窗口开始 + 周期 →「Xd Xh 后重置」 */
function formatWindowReset(
  windowStart: string | null | undefined,
  period: "day" | "week" | "month",
): string | undefined {
  if (!windowStart) return undefined;
  const start = new Date(windowStart);
  if (Number.isNaN(start.getTime())) return undefined;
  const end = new Date(start.getTime());
  if (period === "day") end.setDate(end.getDate() + 1);
  else if (period === "week") end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return "即将重置";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && mins > 0) parts.push(`${mins}m`);
  if (parts.length === 0) parts.push("1m");
  return `${parts.join(" ")} 后重置`;
}

function SubscriptionsPage({
  accessToken,
  onUnauthorized,
}: {
  accessToken: string;
  onUnauthorized: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<HcaiActiveSubscription[]>([]);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = opts?.soft ?? false;
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const list = await fetchHcaiSubscriptions(accessToken);
        // 有效在前，其余按到期时间倒序
        const sorted = [...(list ?? [])].sort((a, b) => {
          const aActive = isSubscriptionActive(a.status) ? 0 : 1;
          const bActive = isSubscriptionActive(b.status) ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          return (
            new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime()
          );
        });
        setItems(sorted);
      } catch (err) {
        if (isHcaiUnauthorizedError(err)) {
          toast.error("登录已过期，请重新登录");
          onUnauthorized();
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "加载订阅失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, onUnauthorized],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">加载订阅…</span>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void load()}
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">我的订阅</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            查看您的订阅计划和用量
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={refreshing || loading}
          onClick={() => void load({ soft: true })}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          刷新
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span className="truncate">{error}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0"
            onClick={() => void load({ soft: true })}
          >
            重试
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          暂无订阅
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((s) => {
            const g = s.group;
            const active = isSubscriptionActive(s.status);
            const statusLabel = subscriptionStatusLabel(s.status);
            const dailyLimit = g?.daily_limit_usd ?? 0;
            const weeklyLimit = g?.weekly_limit_usd ?? 0;
            const monthlyLimit = g?.monthly_limit_usd ?? 0;
            const dailyUsed = s.daily_usage_usd ?? 0;
            const weeklyUsed = s.weekly_usage_usd ?? 0;
            const monthlyUsed = s.monthly_usage_usd ?? 0;
            return (
              <div
                key={s.id}
                className="rounded-xl border border-border/80 bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">
                        {(g?.name ?? `分组 ${s.group_id}`).trim()}
                      </span>
                      {g?.platform ? (
                        <span className="text-xs rounded-md bg-primary/10 text-primary px-1.5 py-0.5">
                          {platformLabel(g.platform)}
                        </span>
                      ) : null}
                    </div>
                    {g?.description ? (
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                        {g.description.trim()}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      倍率:{" "}
                      {g?.rate_multiplier != null
                        ? `x${g.rate_multiplier}`
                        : "—"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs rounded-full px-2 py-0.5 shrink-0",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-border/60 pt-2">
                  <span className="text-muted-foreground">到期时间</span>
                  <span className={cn(!active && "text-red-500 font-medium")}>
                    {formatSubscriptionExpireLabel(s.expires_at, s.status)}
                  </span>
                </div>
                <ProgressRow
                  label="每日"
                  used={dailyUsed}
                  limit={dailyLimit}
                  reset={
                    active
                      ? formatWindowReset(s.daily_window_start, "day")
                      : undefined
                  }
                />
                <ProgressRow
                  label="每周"
                  used={weeklyUsed}
                  limit={weeklyLimit}
                  reset={
                    active
                      ? formatWindowReset(s.weekly_window_start, "week")
                      : undefined
                  }
                />
                <ProgressRow
                  label="每月"
                  used={monthlyUsed}
                  limit={monthlyLimit}
                  reset={
                    active
                      ? formatWindowReset(s.monthly_window_start, "month")
                      : undefined
                  }
                  danger={monthlyLimit > 0 && monthlyUsed >= monthlyLimit}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function shortRedeemCode(code: string): string {
  if (!code) return "—";
  return code.length > 8 ? `${code.slice(0, 8)}...` : code;
}

function formatRedeemTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

type RedeemActivityView = {
  id: number;
  typeLabel: string;
  time: string;
  amount: string;
  note: string;
  tone: "green" | "purple" | "default";
};

function mapRedeemActivity(r: HcaiRedeemRecord): RedeemActivityView {
  const t = (r.type || "").toLowerCase();
  const time = formatRedeemTime(r.used_at ?? r.created_at);
  const codeNote = shortRedeemCode(r.code);

  if (t === "admin_balance") {
    return {
      id: r.id,
      typeLabel: "余额充值（管理员）",
      time,
      amount: `+$${Number(r.value ?? 0).toFixed(2)}`,
      note: "管理员调整",
      tone: "green",
    };
  }
  if (t === "balance") {
    return {
      id: r.id,
      typeLabel: "余额充值（兑换）",
      time,
      amount: `+$${Number(r.value ?? 0).toFixed(2)}`,
      note: codeNote,
      tone: "green",
    };
  }
  if (t === "subscription") {
    const days = r.validity_days ?? 0;
    const name = (r.group?.name ?? "订阅").trim();
    return {
      id: r.id,
      typeLabel: "订阅已分配",
      time,
      amount: days > 0 ? `${days}天 - ${name}` : name,
      note: codeNote,
      tone: "purple",
    };
  }
  if (t === "admin_concurrency" || t === "concurrency") {
    const admin = t.startsWith("admin");
    return {
      id: r.id,
      typeLabel: admin ? "并发数增加（管理员）" : "并发数增加",
      time,
      amount: `+${r.value ?? 0} 并发`,
      note: admin ? "管理员调整" : codeNote,
      tone: "purple",
    };
  }
  return {
    id: r.id,
    typeLabel: r.type || "兑换",
    time,
    amount: String(r.value ?? ""),
    note: codeNote,
    tone: "default",
  };
}

function redeemSuccessMessage(r: HcaiRedeemRecord): string {
  const t = (r.type || "").toLowerCase();
  if (t === "admin_balance" || t === "balance") {
    return `兑换成功，余额 +$${Number(r.value ?? 0).toFixed(2)}`;
  }
  if (t === "subscription") {
    const name = (r.group?.name ?? "订阅").trim();
    const days = r.validity_days ?? 0;
    return days > 0
      ? `兑换成功，已分配订阅：${name}（${days} 天）`
      : `兑换成功，已分配订阅：${name}`;
  }
  if (t === "admin_concurrency" || t === "concurrency") {
    return `兑换成功，并发 +${r.value ?? 0}`;
  }
  return "兑换成功";
}

function RedeemPage({
  accessToken,
  balance,
  concurrency,
  onUserPatch,
  onUnauthorized,
}: {
  accessToken: string;
  balance: number;
  concurrency?: number;
  onUserPatch: (user: HcaiAuthUser) => void;
  onUnauthorized: () => void;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<HcaiRedeemRecord[]>([]);
  const [liveBalance, setLiveBalance] = useState(balance);
  const [liveConcurrency, setLiveConcurrency] = useState(concurrency ?? 10);

  useEffect(() => {
    setLiveBalance(balance);
  }, [balance]);

  useEffect(() => {
    if (concurrency != null) setLiveConcurrency(concurrency);
  }, [concurrency]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const list = await fetchHcaiRedeemHistory(accessToken);
      setHistory(list ?? []);
    } catch (err) {
      if (isHcaiUnauthorizedError(err)) {
        toast.error("登录已过期，请重新登录");
        onUnauthorized();
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setHistoryError(msg || "加载兑换历史失败");
    } finally {
      setHistoryLoading(false);
    }
  }, [accessToken, onUnauthorized]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await fetchHcaiAuthMe(accessToken);
      setLiveBalance(me.balance ?? 0);
      if (me.concurrency != null) setLiveConcurrency(me.concurrency);
      onUserPatch(me);
    } catch {
      /* 兑换已成功，资料刷新失败不阻断 */
    }
  }, [accessToken, onUserPatch]);

  const onRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("请输入兑换码");
      return;
    }
    setSubmitting(true);
    try {
      const result = await redeemHcaiCode(accessToken, trimmed);
      toast.success(redeemSuccessMessage(result));
      setCode("");
      await refreshUser();
      await loadHistory();
    } catch (err) {
      if (isHcaiUnauthorizedError(err)) {
        toast.error("登录已过期，请重新登录");
        onUnauthorized();
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "兑换失败");
    } finally {
      setSubmitting(false);
    }
  };

  const activities = useMemo(() => history.map(mapRedeemActivity), [history]);

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="text-center sm:text-left">
        <h3 className="text-lg font-semibold">兑换码</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          输入兑换码以充值余额或增加并发数
        </p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
          <CreditCard className="h-6 w-6" />
        </div>
        <div className="text-sm opacity-90">当前余额</div>
        <div className="text-3xl font-semibold tabular-nums mt-1">
          {money2(liveBalance)}
        </div>
        <div className="text-xs opacity-80 mt-2">
          并发数: {liveConcurrency} 请求
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
        <Label className="text-sm">兑换码</Label>
        <div className="relative">
          <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-10"
            placeholder="请输入兑换码"
            value={code}
            disabled={submitting}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !submitting) void onRedeem();
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">兑换码区分大小写</p>
        <Button
          type="button"
          className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={submitting || !code.trim()}
          onClick={() => void onRedeem()}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              兑换中…
            </>
          ) : (
            "兑换"
          )}
        </Button>
      </div>

      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs space-y-2">
        <div className="font-medium text-sm flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs">
            i
          </span>
          关于兑换码
        </div>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          <li>每个兑换码只能使用一次</li>
          <li>兑换码可以增加余额、并发数或试用权限</li>
          <li>如有兑换问题，请联系客服</li>
          <li>余额和并发数即时更新</li>
        </ul>
      </div>

      <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">最近活动</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={historyLoading}
            onClick={() => void loadHistory()}
          >
            {historyLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {historyError ? (
          <div className="text-xs text-destructive flex items-center justify-between gap-2">
            <span className="truncate">{historyError}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0"
              onClick={() => void loadHistory()}
            >
              重试
            </Button>
          </div>
        ) : null}
        {historyLoading && activities.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : activities.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            暂无兑换记录
          </p>
        ) : (
          <ul className="space-y-2 max-h-[360px] overflow-y-auto">
            {activities.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {a.typeLabel}
                  </div>
                  <div className="text-xs text-muted-foreground">{a.time}</div>
                </div>
                <div className="text-right shrink-0 max-w-[50%]">
                  <div
                    className={cn(
                      "text-sm font-medium truncate",
                      a.tone === "green" && "text-primary",
                      a.tone === "purple" &&
                        "text-violet-600 dark:text-violet-400",
                    )}
                  >
                    {a.amount}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.note}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 对齐 HCAI Web 用户菜单中的客服说明（公开信息） */
const HCAI_SUPPORT_BLURB =
  "绿泡泡号: zcmz_mb QQ 群:1094254437，新用户联系客服领取 10 刀试用额度";

function userInitials(name: string, email?: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "HC";
}

export interface HcaiLoggedInConsoleProps {
  session: HcaiAuthSession;
  onLogout: () => void;
  onProvidersChanged?: () => void;
  className?: string;
}

export function HcaiLoggedInConsole({
  session,
  onLogout,
  onProvidersChanged,
  className,
}: HcaiLoggedInConsoleProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<HcaiConsoleTab>("dashboard");
  const [user, setUser] = useState(session.user);
  const [activeSubCount, setActiveSubCount] = useState(0);
  const balance = user.balance ?? 0;
  const displayName = displayNameFromSession({ ...session, user });
  const email = user.email ?? session.user.email ?? "";
  const roleLabel =
    user.role === "admin"
      ? "Admin"
      : user.role === "user"
        ? "User"
        : user.role || "User";
  const initials = userInitials(displayName, email);

  const title = useMemo(
    () => NAV.find((n) => n.id === tab)?.label ?? "仪表盘",
    [tab],
  );

  const handleUserPatch = useCallback(
    (next: HcaiAuthUser) => {
      setUser((prev) => {
        const merged = { ...prev, ...next };
        saveHcaiSession({ ...session, user: merged });
        return merged;
      });
    },
    [session],
  );

  // 会话切换时同步
  useEffect(() => {
    setUser(session.user);
  }, [session]);

  // 右上角有效订阅数量（对齐 Web 卡片角标）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchHcaiActiveSubscriptions(session.accessToken);
        if (!cancelled) {
          setActiveSubCount(
            (list ?? []).filter(
              (s) => s.status === "active" || s.status === "有效",
            ).length,
          );
        }
      } catch {
        if (!cancelled) setActiveSubCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.accessToken]);

  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* top bar — 对齐 HCAI Web 右上角：余额 / 订阅数 / 用户菜单 */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 sm:px-5 py-2.5 border-b border-border bg-muted/20">
        <div className="min-w-0 flex items-center gap-2">
          <h3 className="font-semibold text-base shrink-0">
            {t("hcai.console.title", { defaultValue: "HCAI 控制台" })}
          </h3>
          <span className="text-sm text-muted-foreground truncate hidden sm:inline">
            · {title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {activeSubCount > 0 ? (
            <button
              type="button"
              onClick={() => setTab("subscriptions")}
              className="inline-flex items-center gap-1.5 h-9 rounded-full px-3 sm:px-3.5 text-sm font-medium bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20 hover:bg-violet-500/15 transition-colors"
              title="我的订阅"
            >
              <CreditCard className="h-3.5 w-3.5 opacity-80" />
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="tabular-nums">{activeSubCount}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setTab("redeem")}
            className="inline-flex items-center gap-1.5 h-9 rounded-full px-3 sm:px-3.5 text-sm font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 transition-colors tabular-nums"
            title="余额"
          >
            <Wallet className="h-3.5 w-3.5 opacity-80" />
            <span>{money2(balance)}</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 h-9 rounded-full pl-1 pr-2 sm:pr-2.5 border border-border/80 bg-background hover:bg-muted/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white shrink-0">
                  {initials}
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight min-w-0 max-w-[7rem]">
                  <span className="text-xs font-medium truncate w-full text-left">
                    {displayName}
                  </span>
                  <span className="text-xs text-muted-foreground truncate w-full text-left">
                    {roleLabel}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-0">
              <div className="px-3.5 py-3">
                <div className="text-sm font-semibold truncate">
                  {displayName}
                </div>
                {email ? (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {email}
                  </div>
                ) : null}
              </div>
              <DropdownMenuSeparator className="my-0" />
              {/* 不展示「个人资料 / API 密钥」——侧栏已有密钥，资料页已移除 */}
              <div className="px-3.5 py-3 flex gap-2.5">
                <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    联系客服
                  </div>
                  <p className="text-xs leading-relaxed text-foreground/90">
                    {HCAI_SUPPORT_BLURB}
                  </p>
                  <a
                    href={HCAI_WEBSITE}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-primary hover:underline mt-1"
                  >
                    打开 HCAI 官网
                  </a>
                </div>
              </div>
              <DropdownMenuSeparator className="my-0" />
              <div className="p-1">
                <DropdownMenuItem
                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 cursor-pointer gap-2"
                  onSelect={() => onLogout()}
                >
                  <LogOut className="h-4 w-4" />
                  {t("hcai.console.logout", { defaultValue: "退出登录" })}
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* sidebar */}
        <nav className="md:w-48 shrink-0 border-b md:border-b-0 md:border-r border-border p-2.5 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap transition-colors text-left",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* content：撑满剩余高度，内容超出时内部滚动 */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-5">
          {tab === "dashboard" ? (
            <DashboardPage
              accessToken={session.accessToken}
              balance={balance}
              onUserPatch={handleUserPatch}
              onUnauthorized={onLogout}
            />
          ) : null}
          {tab === "api-keys" ? (
            <ApiKeysPage
              accessToken={session.accessToken}
              onUnauthorized={onLogout}
              onProvidersChanged={onProvidersChanged}
            />
          ) : null}
          {tab === "usage" ? (
            <UsagePage
              accessToken={session.accessToken}
              onUnauthorized={onLogout}
            />
          ) : null}
          {tab === "subscriptions" ? (
            <SubscriptionsPage
              accessToken={session.accessToken}
              onUnauthorized={onLogout}
            />
          ) : null}
          {tab === "redeem" ? (
            <RedeemPage
              accessToken={session.accessToken}
              balance={balance}
              concurrency={user.concurrency}
              onUserPatch={handleUserPatch}
              onUnauthorized={onLogout}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
