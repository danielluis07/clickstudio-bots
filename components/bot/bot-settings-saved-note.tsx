import { formatDateTime } from "@/lib/format";
import { settingsEditorLabel } from "@/modules/bot/hooks";

type BotSettingsSavedNoteProps = {
  updatedAt: Date;
  updatedBy: string | null;
};

export function BotSettingsSavedNote({ updatedAt, updatedBy }: BotSettingsSavedNoteProps) {
  return (
    <p className="text-xs text-muted-foreground">
      Salvo em {formatDateTime(updatedAt)} por {settingsEditorLabel(updatedBy)}
    </p>
  );
}
