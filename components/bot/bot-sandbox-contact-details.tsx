type BotSandboxContactDetailsProps = {
  details: { field: string; label: string; value: string }[];
};

export function BotSandboxContactDetails({ details }: BotSandboxContactDetailsProps) {
  if (!details.length) return null;
  return (
    <section aria-labelledby="sandbox-captured" className="flex flex-col gap-2 text-sm">
      <h3 id="sandbox-captured" className="font-medium">
        Dados capturados neste teste
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {details.map(({ field, label, value }) => (
          <div key={field} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground">
        Em uma conversa real, estes dados ficariam salvos no contato. Neste teste, nenhum contato é
        alterado.
      </p>
    </section>
  );
}
