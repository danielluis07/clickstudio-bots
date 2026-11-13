// PROTOTYPE (throwaway): three Bot › Perfil designs plus the current one,
// switchable with ?variant=atual|a|b|c on /painel/bot/perfil. The variants
// read the real profile but never save it.
import { BotPageDescription } from "@/components/bot/bot-page-description";
import { BusinessProfileForm } from "@/components/bot/business-profile-form";
import { ProfileVariantA } from "@/components/bot/prototype/profile-variant-a";
import { ProfileVariantB } from "@/components/bot/prototype/profile-variant-b";
import { ProfileVariantC } from "@/components/bot/prototype/profile-variant-c";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { PrototypeVariants } from "@/components/prototype/prototype-variants";
import { botSettingsLimits, type BotSettingsLimits, type BusinessProfile } from "@/modules/bot";
import type { TenantScope } from "@/modules/tenancy";
import { botSettingsEditor } from "@/server/services";

export type ProfilePrototypeProps = {
  profile: BusinessProfile;
  savedAt: Date | null;
  savedBy: string | null;
  limits: BotSettingsLimits;
  canEdit: boolean;
};

export async function ProfilePrototype({ scope }: { scope: TenantScope }) {
  const { settings, profile } = await botSettingsEditor.getSettings(scope);
  const canEdit = scope.role === "owner";
  const props: ProfilePrototypeProps = {
    profile: {
      businessName: settings.businessName,
      offer: settings.offer,
      address: settings.address,
      hours: settings.hours,
    },
    savedAt: profile.updatedAt,
    savedBy: profile.updatedBy,
    limits: botSettingsLimits,
    canEdit,
  };

  return (
    <PrototypeVariants
      variants={[
        { key: "a", name: "Relatório", content: <ProfileVariantA {...props} /> },
        { key: "b", name: "Bento", content: <ProfileVariantB {...props} /> },
        { key: "c", name: "Bancada", content: <ProfileVariantC {...props} /> },
        {
          key: "atual",
          name: "Atual",
          content: (
            <DashboardPage
              title="Perfil do negócio"
              width="form"
              description={
                <BotPageDescription saved={profile} canEdit={canEdit}>
                  O que o Bot sabe sobre o negócio: nome, oferta, endereço e horário de
                  funcionamento.
                </BotPageDescription>
              }
            >
              <BusinessProfileForm
                profile={settings}
                savedAt={profile.updatedAt}
                limits={botSettingsLimits}
                canEdit={canEdit}
              />
            </DashboardPage>
          ),
        },
      ]}
    />
  );
}
