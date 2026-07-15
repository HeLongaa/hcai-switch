import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { HcaiConsoleSection } from "@/components/hcai/HcaiConsoleSection";
import { HCAI_ICON, HCAI_WEBSITE } from "@/lib/hcai/types";
import { extractErrorMessage } from "@/utils/errorUtils";

interface HcaiPanelProps {
  onProvidersChanged?: () => void;
}

/**
 * HCAI 入口：品牌区 + 登录后控制台。
 * 控制台撑满窗口剩余高度，内容超出时在控制台内滚动。
 * 添加配置走控制台 API 密钥列表的「使用密钥」。
 */
export function HcaiPanel({ onProvidersChanged }: HcaiPanelProps) {
  const { t } = useTranslation();

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

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 px-6 py-4">
      {/* Brand banner — 对齐应用内页面标题区节奏 */}
      <div className="shrink-0 rounded-xl border border-border/60 bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <ProviderIcon icon={HCAI_ICON} name="HCAI" size={26} />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-foreground">
                {t("hcai.brandName", { defaultValue: "HCAI 中转站" })}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                {t("hcai.badge", { defaultValue: "中转站" })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("hcai.tagline", {
                defaultValue: "全球 AI 算力分发平台 · 安全连接，智创未来",
              })}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 h-9"
          onMouseDown={(e) => {
            e.preventDefault();
            void openExternal(HCAI_WEBSITE);
          }}
        >
          <ExternalLink className="h-4 w-4 mr-1.5" />
          {t("hcai.openSite", { defaultValue: "立即查看" })}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <HcaiConsoleSection
          className="h-full"
          onProvidersChanged={onProvidersChanged}
        />
      </div>
    </div>
  );
}
