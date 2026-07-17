import React from "react";
import { useTranslation } from "react-i18next";
import { Edit3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Prompt, AppId } from "@/lib/api";
import { APP_ICON_MAP } from "@/config/appConfig";
import PromptToggle from "./PromptToggle";

interface PromptListItemProps {
  id: string;
  appId: AppId;
  prompt: Prompt;
  onToggle: (appId: AppId, id: string, enabled: boolean) => void;
  onEdit: (appId: AppId, id: string) => void;
  onDelete: (appId: AppId, id: string) => void;
}

const PromptListItem: React.FC<PromptListItemProps> = ({
  id,
  appId,
  prompt,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();

  const enabled = prompt.enabled === true;
  const appConfig = APP_ICON_MAP[appId];

  return (
    <div className="group relative h-16 rounded-xl border border-border-default bg-muted/50 p-4 transition-all duration-300 hover:bg-muted hover:border-border-default/80 hover:shadow-sm">
      <div className="flex items-center gap-4 h-full">
        {/* Toggle 开关 */}
        <div className="flex-shrink-0">
          <PromptToggle
            enabled={enabled}
            onChange={(newEnabled) => onToggle(appId, id, newEnabled)}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {appConfig && (
              <span
                className="flex-shrink-0 opacity-75"
                title={appConfig.label}
              >
                {appConfig.icon}
              </span>
            )}
            <h3 className="font-medium text-foreground truncate">{prompt.name}</h3>
          </div>
          {prompt.description && (
            <p className="text-sm text-muted-foreground truncate">
              {prompt.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onEdit(appId, id)}
            title={t("common.edit")}
          >
            <Edit3 size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDelete(appId, id)}
            className="hover:text-red-500 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-500/10"
            title={t("common.delete")}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PromptListItem;
