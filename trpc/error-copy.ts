import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@/server/trpc/router";

export const mutationErrorMessage = (error: Error): string | null => {
  if (error instanceof TRPCClientError) {
    const data = (error as TRPCClientError<AppRouter>).data;
    if (data?.zodError || data?.field) return null;
    if (data?.code === "UNAUTHORIZED") return "Sua sessão expirou. Entre novamente para continuar.";
    if (data?.code === "FORBIDDEN") return "Você não tem acesso a este negócio.";
    if (data?.code === "NOT_FOUND") return "O Contato ou a Conversa não está mais disponível.";
  }
  return "Não foi possível salvar as alterações. Tente novamente.";
};
