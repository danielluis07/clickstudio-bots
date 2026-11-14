import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitationAcceptance } from "@/components/onboarding/invitation-acceptance";
import { AuthCardSkeleton } from "@/components/onboarding/auth-card-skeleton";

export const metadata: Metadata = {
  title: "Aceitar convite",
  robots: { index: false },
};

export default function InvitationPage({ params }: PageProps<"/convite/[invitationId]">) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <InvitationAcceptance params={params} />
    </Suspense>
  );
}
