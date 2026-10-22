import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ClickStudio <span className="font-normal">Bots</span>
        </Link>
        <nav aria-label="Navegação principal" className="flex items-center gap-5 text-sm">
          <Link href="/#plano" className="site-link">
            Plano e preço
          </Link>
          <Link href="/#convites" className={buttonVariants({ variant: "outline" })}>
            Acesso por convite
          </Link>
        </nav>
      </div>
    </header>
  );
}
