import Link from "next/link";
import { legalLinks } from "@/modules/legal";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 md:flex-row md:justify-between">
        <div className="flex flex-col gap-2">
          <Link href="/" className="font-semibold">ClickStudio Bots</Link>
          <p className="text-sm text-muted-foreground">Atendimento simples. Com a sua equipe no controle.</p>
        </div>
        <nav aria-label="Informações legais" className="flex flex-col gap-3 text-sm">
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href} className="site-link">{link.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
