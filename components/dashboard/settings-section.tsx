import type { ReactNode } from "react";

type SettingsSectionProps = {
  // Also the anchor, so other screens can link to /painel/configuracoes#<id>.
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
};

// One group of Configurações, split from the next by a rule.
export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  const headingId = `${id}-titulo`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex scroll-mt-6 flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-1"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={headingId} className="text-sm font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
