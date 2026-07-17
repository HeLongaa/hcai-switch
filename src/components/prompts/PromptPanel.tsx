import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import type { AppId } from "@/lib/api";
import { promptsApi, type Prompt } from "@/lib/api";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import PromptListItem from "./PromptListItem";
import PromptFormPanel from "./PromptFormPanel";
import { ConfirmDialog } from "../ConfirmDialog";
import { AppCountBar } from "@/components/common/AppCountBar";
import { AppToggleGroup } from "@/components/common/AppToggleGroup";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PROMPTS_APP_IDS } from "@/config/appConfig";

interface PromptPanelProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Leave space for app sidebar (px) */
  leftOffset?: number;
  /** Top content inset matching App dragBarHeight (0 on Windows) */
  topOffset?: number;
}

export interface PromptPanelHandle {
  openAdd: () => void;
}

const PromptPanel = React.forwardRef<PromptPanelHandle, PromptPanelProps>(
  ({ open, leftOffset = 0, topOffset }, ref) => {
    const { t } = useTranslation();
    const [allPrompts, setAllPrompts] = useState<
      Partial<Record<AppId, Record<string, Prompt>>>
    >({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Partial<Record<AppId, boolean>>>(
      Object.fromEntries(PROMPTS_APP_IDS.map((id) => [id, true])),
    );

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingApp, setEditingApp] = useState<AppId | null>(null);

    const [confirmDialog, setConfirmDialog] = useState<{
      isOpen: boolean;
      titleKey: string;
      messageKey: string;
      messageParams?: Record<string, unknown>;
      onConfirm: () => void;
    } | null>(null);

    const reload = useCallback(async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          PROMPTS_APP_IDS.map(async (app) => {
            try {
              const data = await promptsApi.getPrompts(app);
              return [app, data] as const;
            } catch {
              return [app, {} as Record<string, Prompt>] as const;
            }
          }),
        );
        const map: Partial<Record<AppId, Record<string, Prompt>>> = {};
        for (const [app, data] of results) {
          map[app] = data;
        }
        setAllPrompts(map);
      } catch (error) {
        toast.error(t("prompts.loadFailed"));
      } finally {
        setLoading(false);
      }
    }, [t]);

    useEffect(() => {
      if (open) reload();
    }, [open, reload]);

    // Listen for prompt import events from deep link
    useEffect(() => {
      const handlePromptImported = () => {
        reload();
      };

      window.addEventListener("prompt-imported", handlePromptImported);
      return () => {
        window.removeEventListener("prompt-imported", handlePromptImported);
      };
    }, [reload]);

    // 应用项目 Profile 会切换激活的 prompt（prompts 非 react-query，需主动 reload）
    useTauriEvent("profile-applied", reload);

    const handleAdd = () => {
      setEditingApp(null);
      setEditingId(null);
      setIsFormOpen(true);
    };

    React.useImperativeHandle(ref, () => ({
      openAdd: handleAdd,
    }));

    const handleEdit = (appId: AppId, id: string) => {
      setEditingApp(appId);
      setEditingId(id);
      setIsFormOpen(true);
    };

    const handleDelete = (appId: AppId, id: string) => {
      const prompt = allPrompts[appId]?.[id];
      setConfirmDialog({
        isOpen: true,
        titleKey: "prompts.confirm.deleteTitle",
        messageKey: "prompts.confirm.deleteMessage",
        messageParams: { name: prompt?.name },
        onConfirm: async () => {
          try {
            await promptsApi.deletePrompt(appId, id);
            await reload();
            setConfirmDialog(null);
          } catch (e) {
            toast.error(t("prompts.deleteFailed"));
          }
        },
      });
    };

    const handleToggle = async (
      appId: AppId,
      id: string,
      enabled: boolean,
    ) => {
      const previous = { ...allPrompts };
      try {
        if (enabled) {
          await promptsApi.enablePrompt(appId, id);
          toast.success(t("prompts.enableSuccess"), { closeButton: true });
        } else {
          const current = allPrompts[appId]?.[id];
          if (current) {
            await promptsApi.upsertPrompt(appId, id, {
              ...current,
              enabled: false,
            });
            toast.success(t("prompts.disableSuccess"), { closeButton: true });
          }
        }
        await reload();
      } catch (error) {
        setAllPrompts(previous);
        toast.error(
          enabled ? t("prompts.enableFailed") : t("prompts.disableFailed"),
        );
      }
    };

    const handleSave = async (
      targetApps: AppId[],
      id: string,
      prompt: Prompt,
    ) => {
      if (targetApps.length === 0) return;
      try {
        for (const app of targetApps) {
          await promptsApi.upsertPrompt(app, id, prompt);
        }
        await reload();
        toast.success(t("prompts.saveSuccess"), { closeButton: true });
      } catch (error) {
        toast.error(t("prompts.saveFailed"));
        throw error;
      }
    };

    const promptEntries = useMemo(() => {
      const list: Array<{
        key: string;
        id: string;
        prompt: Prompt;
        appId: AppId;
      }> = [];
      for (const app of PROMPTS_APP_IDS) {
        if (filter[app] === false) continue;
        const ps = allPrompts[app] || {};
        Object.entries(ps).forEach(([pid, p]) => {
          list.push({ key: `${app}:${pid}`, id: pid, prompt: p, appId: app });
        });
      }
      return list;
    }, [allPrompts, filter]);

    const totalCount = useMemo(() => {
      return PROMPTS_APP_IDS.reduce(
        (sum, app) => sum + Object.keys(allPrompts[app] || {}).length,
        0,
      );
    }, [allPrompts]);

    const enabledCounts = useMemo(() => {
      const counts: Partial<Record<AppId, number>> = {};
      for (const app of PROMPTS_APP_IDS) {
        counts[app] = Object.keys(allPrompts[app] || {}).length;
      }
      return counts;
    }, [allPrompts]);

    // For legacy "enabled" summary in empty state or whatever, pick first enabled if wanted, but we removed the old summary bar.

    return (
      <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        <AppCountBar
          totalLabel={t("prompts.count", { count: totalCount })}
          counts={enabledCounts}
          appIds={PROMPTS_APP_IDS}
        />

        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <span className="text-xs text-muted-foreground shrink-0">筛选:</span>
            <AppToggleGroup
              apps={filter}
              onToggle={(app, enabled) =>
                setFilter((prev) => ({ ...prev, [app]: enabled }))
              }
              appIds={PROMPTS_APP_IDS}
            />
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden pb-24 min-h-[200px]">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("prompts.loading")}
            </div>
          ) : promptEntries.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                <FileText size={24} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {t("prompts.empty")}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t("prompts.emptyDescription")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {promptEntries.map((entry) => (
                <PromptListItem
                  key={entry.key}
                  id={entry.id}
                  appId={entry.appId}
                  prompt={entry.prompt}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
        </TooltipProvider>

        {isFormOpen && (
          <PromptFormPanel
            editingAppId={editingApp || undefined}
            editingId={editingId || undefined}
            initialData={
              editingId && editingApp
                ? allPrompts[editingApp]?.[editingId]
                : undefined
            }
            onSave={handleSave}
            onClose={() => {
              setIsFormOpen(false);
              setEditingId(null);
              setEditingApp(null);
            }}
            leftOffset={leftOffset}
            topOffset={topOffset}
          />
        )}

        {confirmDialog && (
          <ConfirmDialog
            isOpen={confirmDialog.isOpen}
            title={t(confirmDialog.titleKey)}
            message={t(confirmDialog.messageKey, confirmDialog.messageParams)}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
          />
        )}
      </div>
    );
  },
);

PromptPanel.displayName = "PromptPanel";

export default PromptPanel;
