"use client";

import { BellIcon } from "lucide-react";
import { useState } from "react";
import { AlertCountBadge } from "@/components/alerts/alert-count-badge";
import { AlertList } from "@/components/alerts/alert-list";
import { ClearAlertsButton } from "@/components/alerts/clear-alerts-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { alertBellLabel, useAlerts, useAlertsRealtime } from "@/modules/conversations/hooks";

// The dashboard header's bell, live on every /painel page: the Member's own
// Alerts, newest first.
export function AlertBell() {
  useAlertsRealtime();
  const { data, isError } = useAlerts();
  const [open, setOpen] = useState(false);
  const unread = data?.unread ?? 0;

  if (isError) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative shrink-0"
            aria-label={alertBellLabel(unread)}
          />
        }
      >
        <BellIcon aria-hidden="true" />
        {unread > 0 && <AlertCountBadge unread={unread} />}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={0}
        className="w-screen max-w-screen gap-0 rounded-none p-0 sm:w-96 sm:rounded-lg"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <PopoverTitle className="text-sm">Alertas</PopoverTitle>
          {data && data.alerts.length > 0 && <ClearAlertsButton />}
        </div>
        <AlertList alerts={data?.alerts} onOpen={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
