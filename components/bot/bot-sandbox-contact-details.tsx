import { DashboardRailSection } from "@/components/dashboard/dashboard-rail-section";

type BotSandboxContactDetailsProps = {
  details: { field: string; label: string; value: string }[];
};

// What the Bot captured about the test contact so far.
export function BotSandboxContactDetails({ details }: BotSandboxContactDetailsProps) {
  return (
    <DashboardRailSection title="Dados capturados">
      {details.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {details.map(({ field, label, value }) => (
            <div key={field} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum dado capturado neste teste.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Em uma conversa real, estes dados ficariam salvos no contato. Neste teste, nenhum contato é
        alterado.
      </p>
    </DashboardRailSection>
  );
}
