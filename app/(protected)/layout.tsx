import { TooltipProvider } from "@/components/ui/tooltip";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return <TooltipProvider>{children}</TooltipProvider>;
}
