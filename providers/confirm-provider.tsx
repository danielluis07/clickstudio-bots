"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * What a caller hands over: the copy to show, and the act to run once the user
 * says yes. The provider owns everything after that — the pending state while
 * `action` is in flight, and the closing when it settles — so a call site is
 * one call and no local `isConfirmOpen`/`isPending` bookkeeping.
 */
export type ConfirmOptions = {
  title: string;
  message: string;
  action: () => void | Promise<void>;
};

type ConfirmContextType = {
  confirm: (options: ConfirmOptions) => void;
};

const ConfirmContext = createContext<ConfirmContextType>({
  confirm: () => {},
});

export const ConfirmProvider = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [isPending, setIsPending] = useState(false);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    setIsPending(false);
  }, []);

  const handleCancel = useCallback(() => {
    setOptions(null);
    setIsPending(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!options) return;

    setIsPending(true);

    try {
      await options.action();
    } catch (error) {
      // Closing on rejection is not a swallowed error: ADR-0013's global tier
      // toasts every failed mutation. The log is for the actions that are not
      // tRPC mutations and so have no toast behind them.
      console.error(error);
    } finally {
      setOptions(null);
      setIsPending(false);
    }
  }, [options]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            // A dismissal mid-action would leave the act running behind a
            // closed dialog, so the dialog only closes on its own terms.
            if (!open && !isPending) handleCancel();
          }}>
          <DialogContent className={cn(className, "font-admin")}>
            <DialogHeader>
              <DialogTitle className="font-admin">{options.title}</DialogTitle>
              <DialogDescription className="font-admin">
                {options.message}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-2">
              <Button
                onClick={handleCancel}
                variant="outline"
                disabled={isPending}
                className="font-admin">
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                variant="destructive"
                disabled={isPending}
                className="font-admin">
                {isPending ? <Spinner className="mx-7" /> : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext);
