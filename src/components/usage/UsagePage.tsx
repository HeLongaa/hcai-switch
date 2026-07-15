import { useCallback } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { UsageDashboard } from "@/components/usage/UsageDashboard";
import { useSettings, type SettingsFormState } from "@/hooks/useSettings";

/**
 * Standalone usage stats page (sidebar tools entry).
 * Wires refresh-interval persistence the same way Settings used to.
 */
export function UsagePage() {
  const { t } = useTranslation();
  const { settings, updateSettings, autoSaveSettings } = useSettings();

  const handleRefreshIntervalChange = useCallback(
    async (usageDashboardRefreshIntervalMs: number): Promise<boolean> => {
      if (!settings) return false;
      const previous = settings.usageDashboardRefreshIntervalMs;
      updateSettings({ usageDashboardRefreshIntervalMs });
      try {
        await autoSaveSettings({ usageDashboardRefreshIntervalMs });
        return true;
      } catch (error) {
        console.error("[UsagePage] Failed to save refresh interval", error);
        updateSettings({
          usageDashboardRefreshIntervalMs: previous,
        } as Partial<SettingsFormState>);
        toast.error(
          t("settings.saveFailedGeneric", {
            defaultValue: "保存失败，请重试",
          }),
        );
        return false;
      }
    },
    [autoSaveSettings, settings, t, updateSettings],
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-2 pb-8">
      <UsageDashboard
        refreshIntervalMs={settings?.usageDashboardRefreshIntervalMs}
        onRefreshIntervalChange={handleRefreshIntervalChange}
      />
    </div>
  );
}
