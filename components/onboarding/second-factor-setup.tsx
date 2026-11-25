"use client";

import { useActionState } from "react";
import { BackupCodeList } from "@/components/onboarding/backup-code-list";
import { SecondFactorConfirmForm } from "@/components/onboarding/second-factor-confirm-form";
import { SecondFactorKey } from "@/components/onboarding/second-factor-key";
import { SecondFactorPasswordForm } from "@/components/onboarding/second-factor-password-form";
import { idleFormState } from "@/server/actions/form-state";
import {
  startSecondFactorSetupAction,
  type SecondFactorSetupState,
} from "@/server/actions/second-factor";

export function SecondFactorSetup() {
  const [state, formAction, pending] = useActionState<SecondFactorSetupState, FormData>(
    startSecondFactorSetupAction,
    idleFormState,
  );

  if (state.status !== "ready") {
    return <SecondFactorPasswordForm action={formAction} state={state} pending={pending} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <SecondFactorKey totpUri={state.totpUri} setupKey={state.setupKey} />
      <BackupCodeList codes={state.backupCodes} />
      <SecondFactorConfirmForm />
    </div>
  );
}
