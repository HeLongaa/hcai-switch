import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MarkdownEditor from "@/components/MarkdownEditor";
import { FullScreenPanel } from "@/components/common/FullScreenPanel";
import { AppToggleGroup } from "@/components/common/AppToggleGroup";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PROMPTS_APP_IDS } from "@/config/appConfig";
import type { Prompt, AppId } from "@/lib/api";

interface PromptFormPanelProps {
  editingAppId?: AppId;
  editingId?: string;
  initialData?: Prompt;
  onSave: (appIds: AppId[], id: string, prompt: Prompt) => Promise<void>;
  onClose: () => void;
  /** Leave space for app sidebar (px) */
  leftOffset?: number;
  /** Top content inset matching App dragBarHeight */
  topOffset?: number;
}

const PromptFormPanel: React.FC<PromptFormPanelProps> = ({
  editingAppId,
  editingId,
  initialData,
  onSave,
  onClose,
  leftOffset = 0,
  topOffset,
}) => {
  const { t } = useTranslation();
  const isEditing = !!editingId;
  const appName = editingAppId ? t(`apps.${editingAppId}`) : "";
  const filenameMap: Record<string, string> = {
    claude: "CLAUDE.md",
    "claude-desktop": "CLAUDE.md",
    codex: "AGENTS.md",
    opencode: "AGENTS.md",
    grok: "AGENTS.md",
  };
  const filename = filenameMap[editingAppId || "claude"] || "AGENTS.md";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [targetApps, setTargetApps] = useState<Partial<Record<AppId, boolean>>>(
    () => Object.fromEntries(PROMPTS_APP_IDS.map((a) => [a, true])),
  );

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description || "");
      setContent(initialData.content);
    }
  }, [initialData]);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setSaving(true);
    try {
      const id = editingId || `prompt-${Date.now()}`;
      const timestamp = Math.floor(Date.now() / 1000);
      const prompt: Prompt = {
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        enabled: initialData?.enabled || false,
        createdAt: initialData?.createdAt || timestamp,
        updatedAt: timestamp,
      };

      const appsToSave: AppId[] =
        isEditing && editingAppId
          ? [editingAppId]
          : PROMPTS_APP_IDS.filter((a) => targetApps[a]);

      await onSave(appsToSave, id, prompt);
      onClose();
    } catch (error) {
      // Error handled by caller
    } finally {
      setSaving(false);
    }
  };

  const title = isEditing
    ? t("prompts.editTitle", { appName })
    : t("prompts.add");

  const selectedTargetCount = isEditing
    ? 1
    : PROMPTS_APP_IDS.filter((a) => targetApps[a]).length;

  return (
    <FullScreenPanel
      isOpen={true}
      title={title}
      onClose={onClose}
      leftOffset={leftOffset}
      topOffset={topOffset}
      footer={
        <Button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || saving || selectedTargetCount === 0}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      }
    >
      <div className="glass rounded-xl p-6 border border-white/10 space-y-6">
        <div>
          <Label htmlFor="name" className="text-foreground">
            {t("prompts.name")}
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("prompts.namePlaceholder")}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="description" className="text-foreground">
            {t("prompts.description")}
          </Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("prompts.descriptionPlaceholder")}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="content" className="block mb-2 text-foreground">
            {t("prompts.content")}
          </Label>
          <MarkdownEditor
            value={content}
            onChange={setContent}
            placeholder={t("prompts.contentPlaceholder", { filename })}
            darkMode={isDarkMode}
            minHeight="167px"
          />
        </div>

        {!isEditing && (
          <TooltipProvider delayDuration={300}>
            <div>
              <Label className="text-foreground">添加到应用</Label>
              <div className="mt-2">
                <AppToggleGroup
                  apps={targetApps}
                  onToggle={(app, enabled) =>
                    setTargetApps((prev) => ({ ...prev, [app]: enabled }))
                  }
                  appIds={PROMPTS_APP_IDS}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                提示词内容将被复制添加到选中的应用。
              </p>
            </div>
          </TooltipProvider>
        )}
      </div>
    </FullScreenPanel>
  );
};

export default PromptFormPanel;
