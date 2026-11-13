import type { ReactNode } from "react";
import { BotSettingsSavedNote } from "@/components/bot/bot-settings-saved-note";

type BotPageDescriptionProps = {
  children: ReactNode;
  // When and by whom the page's settings were last saved, once they were.
  saved?: { updatedAt: Date | null; updatedBy: string | null };
  canEdit: boolean;
};

// The header text of a Bot sub-page whose settings the owner saves.
export function BotPageDescription({ children, saved, canEdit }: BotPageDescriptionProps) {
  return (
    <>
      <p>
        {children} As alterações salvas valem a partir da próxima resposta, inclusive nas conversas
        em andamento.
      </p>
      {saved?.updatedAt && (
        <BotSettingsSavedNote updatedAt={saved.updatedAt} updatedBy={saved.updatedBy} />
      )}
      {!canEdit && (
        <p className="text-sm">
          Apenas o responsável pelo negócio pode alterar estas configurações.
        </p>
      )}
    </>
  );
}
