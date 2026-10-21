import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/providers/confirm-provider";

export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return (
    <TooltipProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </TooltipProvider>
  );
}
