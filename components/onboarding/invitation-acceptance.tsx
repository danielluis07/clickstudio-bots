import { connection } from "next/server";
import { AuthCard } from "@/components/onboarding/auth-card";
import { ExistingAccountFields } from "@/components/onboarding/existing-account-fields";
import { InvitationAcceptanceForm } from "@/components/onboarding/invitation-acceptance-form";
import { LegalAcceptanceField } from "@/components/onboarding/legal-acceptance-field";
import { NewAccountFields } from "@/components/onboarding/new-account-fields";
import { tenantOnboarding } from "@/server/services";

type InvitationAcceptanceProps = {
  params: Promise<{ invitationId: string }>;
};

export async function InvitationAcceptance({ params }: InvitationAcceptanceProps) {
  const { invitationId } = await params;
  // Whether the invitation is still open depends on the current time.
  await connection();
  const invitation = await tenantOnboarding.findInvitation(invitationId);

  if (!invitation?.canAccept) {
    return (
      <AuthCard
        title="Convite indisponível"
        description="Este convite expirou, já foi usado ou não existe. Peça um novo convite a quem convidou você."
      />
    );
  }

  // Only the owner assents to the Terms and DPA, on the business's behalf.
  const isOwner = invitation.role === "owner";

  return (
    <AuthCard
      title={`Convite para ${invitation.tenantName}`}
      description={
        isOwner ? (
          <>
            Você vai administrar este negócio no ClickStudio Bots com o e-mail{" "}
            <strong>{invitation.email}</strong>.
          </>
        ) : (
          <>
            Você vai fazer parte da equipe deste negócio no ClickStudio Bots com o e-mail{" "}
            <strong>{invitation.email}</strong>.
          </>
        )
      }
    >
      <InvitationAcceptanceForm invitationId={invitation.id}>
        {invitation.hasAccount ? <ExistingAccountFields /> : <NewAccountFields />}
        {isOwner && <LegalAcceptanceField />}
      </InvitationAcceptanceForm>
    </AuthCard>
  );
}
