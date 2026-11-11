import { BotUsage } from "@/components/bot/bot-usage";
import { db } from "@/db";
import { createTenantRepository } from "@/modules/tenancy";
import type { TenantScope } from "@/modules/tenancy";

export async function TenantOverview({ scope }: { scope: TenantScope }) {
  const profile = await createTenantRepository(db, scope).getTenant();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <h1 className="text-3xl font-semibold tracking-tight wrap-break-word">{profile?.name}</h1>
      {scope.role === "owner" && <BotUsage />}
    </div>
  );
}
