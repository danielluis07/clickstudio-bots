import Link from "next/link";
import { legalLinks } from "@/modules/legal";

export function LegalLinks() {
  return (
    <nav
      aria-label="Informações legais"
      className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
    >
      {legalLinks.map((link) => (
        <Link key={link.href} href={link.href} className="underline-offset-4 hover:underline">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
