import type { Transaction } from "@/db/database";
import { memberActivity, type memberActivityActions } from "@/db/schema";
import type { TenantScope } from "@/modules/tenancy/scope";

export type MemberActivityAction = (typeof memberActivityActions)[number];

type ActivityEntry = {
  action: MemberActivityAction;
  // The records acted on: one entry each, or a single entry with none.
  subjectIds?: readonly string[];
  at: Date;
};

// The one write of the activity log (#155). It takes a transaction: call it
// in the one that makes the change, after its writes, so the entry commits
// with the change or not at all. Ids only: never message text, names or phone
// numbers. The insert takes no lock that can wait (docs/locking.md).
export const recordActivity = async (
  tx: Transaction,
  actor: { tenantId: string; actorUserId: string },
  { action, subjectIds, at }: ActivityEntry,
) => {
  const subjects = subjectIds?.length ? [...new Set(subjectIds)] : [null];
  await tx.insert(memberActivity).values(
    subjects.map((subjectId) => ({
      tenantId: actor.tenantId,
      actorUserId: actor.actorUserId,
      action,
      subjectId,
      occurredAt: at,
    })),
  );
};

// What a signed-in Member did. Other modules record through this one.
export const recordMemberActivity = (tx: Transaction, scope: TenantScope, entry: ActivityEntry) =>
  recordActivity(tx, { tenantId: scope.tenantId, actorUserId: scope.userId }, entry);
