"use client";

import { AlertPreferenceSwitch } from "@/components/alerts/alert-preference-switch";
import { alertPreferenceOptions, useAlertPreferences } from "@/modules/conversations/hooks";

// The signed-in Member's own Alert preferences. Each switch saves at once.
export function AlertPreferences() {
  const { query, update, change, notificationsBlocked } = useAlertPreferences();

  if (query.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar suas notificações.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {alertPreferenceOptions.map(({ key, label, description }) => (
        <AlertPreferenceSwitch
          key={key}
          id={`alerta-${key}`}
          label={label}
          description={description}
          checked={query.data?.[key] ?? false}
          disabled={!query.data}
          onCheckedChange={(checked) => void change(key, checked)}
        />
      ))}
      {notificationsBlocked && (
        <p role="alert" className="text-sm text-destructive">
          O navegador não permitiu notificações. Libere nas configurações do site e tente de novo.
        </p>
      )}
      {update.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível salvar. Tente de novo.
        </p>
      )}
    </div>
  );
}
