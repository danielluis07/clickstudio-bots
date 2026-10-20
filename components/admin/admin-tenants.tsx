import { CreateTenantForm } from "@/components/admin/create-tenant-form";
import { requirePlatformAdmin } from "@/lib/session";

// Everything on the admin surface renders after the server-side check.
export async function AdminTenants() {
  await requirePlatformAdmin();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold tracking-tight">Administração</h1>
      <section aria-labelledby="novo-negocio" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="novo-negocio" className="text-xl font-semibold">Novo negócio</h2>
          <p className="text-muted-foreground">
            Crie o negócio e convide a pessoa responsável. O acesso só começa quando o convite é aceito.
          </p>
        </div>
        <CreateTenantForm />
      </section>
    </div>
  );
}
