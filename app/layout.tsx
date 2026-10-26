import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { inter } from "@/fonts";
import { ThemeProvider } from "@/providers/theme-provider";

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
      className={cn("h-full font-sans antialiased", inter.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
