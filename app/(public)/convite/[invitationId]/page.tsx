import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitationAcceptance } from "@/components/onboarding/invitation-acceptance";
import { InvitationSkeleton } from "@/components/onboarding/invitation-skeleton";

export const metadata: Metadata = {
  title: "Aceitar convite",
  robots: { index: false },
};

export default function InvitationPage({ params }: PageProps<"/convite/[invitationId]">) {
  return (
    <Suspense fallback={<InvitationSkeleton />}>
      <InvitationAcceptance params={params} />
    </Suspense>
  );
}
