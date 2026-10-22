import type { ReactNode } from "react";
import { legalVersion } from "@/modules/legal";

type LegalDocumentProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function LegalDocument({ title, description, children }: LegalDocumentProps) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
      <header className="mb-10 flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">Versão de {legalVersion}</p>
        <h1 className="text-3xl font-semibold tracking-tight wrap-break-word sm:text-5xl">
          {title}
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
        <p className="rounded-lg border border-border bg-secondary p-5 text-sm leading-relaxed">
          Minuta em revisão jurídica. Este texto descreve as condições e o tratamento de dados
          previstos para o lançamento. A versão final será revisada por assessoria jurídica
          brasileira antes da ativação do primeiro negócio pagante.
        </p>
      </header>
      <div className="legal-copy flex flex-col gap-9">{children}</div>
    </article>
  );
}

export function LegalSection({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
