import { SiteFooter } from "@/components/public-site/site-footer";
import { SiteHeader } from "@/components/public-site/site-header";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="public-site flex min-h-screen flex-col bg-background text-foreground">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <SiteHeader />
      <main id="conteudo" tabIndex={-1} className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
