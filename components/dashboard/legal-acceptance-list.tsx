import { formatDateTime } from "@/lib/format";

type LegalAcceptanceListProps = {
  acceptances: { memberName: string; termsVersion: string; acceptedAt: Date }[];
};

export function LegalAcceptanceList({ acceptances }: LegalAcceptanceListProps) {
  return (
    <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
      {acceptances.map((acceptance) => (
        <li key={`${acceptance.memberName}-${acceptance.acceptedAt.toISOString()}`}>
          Aceitos por {acceptance.memberName} em {formatDateTime(acceptance.acceptedAt)} (versão{" "}
          {acceptance.termsVersion}).
        </li>
      ))}
    </ul>
  );
}
