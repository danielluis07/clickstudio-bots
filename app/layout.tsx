import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { inter } from "@/fonts";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: {
    default: "ClickStudio Bots | Atendimento no WhatsApp para pequenas equipes",
    template: "%s | ClickStudio Bots",
  },
  description:
    "Um Bot com as informações do seu negócio e uma caixa de entrada para sua equipe. Conheça o plano, os preços e o acesso por convite do ClickStudio Bots.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={cn("h-full antialiased font-sans", inter.variable)}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
