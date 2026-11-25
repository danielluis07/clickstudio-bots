export function BackupCodeList({ codes }: { codes: string[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">2. Guarde os códigos de recuperação</h2>
      <p className="text-sm text-muted-foreground">
        Se perder o celular, cada código substitui o aplicativo uma única vez. Eles não serão
        mostrados de novo.
      </p>
      <ul
        aria-label="Códigos de recuperação"
        className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted px-3 py-2 font-mono text-sm select-all"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </section>
  );
}
