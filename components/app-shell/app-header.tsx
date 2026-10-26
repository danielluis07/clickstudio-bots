import Link from "next/link";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";

export function AppHeader({ homeHref }: { homeHref: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href={homeHref} className="text-lg font-semibold tracking-tight">
          ClickStudio <span className="font-normal">Bots</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
