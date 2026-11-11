import type { ReactNode } from "react";

type SettingsSectionProps = {
  // Also the anchor, so other screens can link to /painel/configuracoes#<id>.
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  const headingId = `${id}-titulo`;

  return (
    <section id={id} aria-labelledby={headingId} className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold">
          {title}
        </h2>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
