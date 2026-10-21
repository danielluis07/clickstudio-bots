import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/database";
import { knowledgeBaseEntry, member, organization, user } from "@/db/schema";
import { z } from "zod";
import { characterCount, entrySize, knowledgeBaseCharacterCap, knowledgeBaseSize } from "@/modules/knowledge-base/allowance";
import { knowledgeEntryKinds } from "@/modules/knowledge-base/kinds";
import type { TenantScope } from "@/modules/tenancy";
import type { Clock } from "@/platform/clock";

// The longest question or section title, so titles stay headings.
export const entryTitleMaxLength = 200;

// Browsers submit a textarea's line breaks as CRLF but count them as one
// character, as the counter does.
const entryTextSchema = (maxLength: number) => z.string()
  .transform((text) => text.replaceAll("\r\n", "\n").trim())
  .pipe(z.string().min(1).refine((text) => characterCount(text) <= maxLength));

const entryTextFields = z.object({
  title: entryTextSchema(entryTitleMaxLength),
  // Bounded only by the cap, which counts the whole Knowledge base.
  body: entryTextSchema(knowledgeBaseCharacterCap),
});

const newEntrySchema = entryTextFields.extend({ kind: z.enum(knowledgeEntryKinds) });

export type NewKnowledgeBaseEntry = z.input<typeof newEntrySchema>;

// One entry as the editor lists it. `updatedBy` is null once that Member was
// removed.
export type KnowledgeEntrySummary = Awaited<ReturnType<ReturnType<typeof createKnowledgeBaseEditor>["getKnowledgeBase"]>>["entries"][number];

type EntryText = z.input<typeof entryTextFields>;

const invalid = { ok: false as const, error: "invalid" as const };
const forbidden = { ok: false as const, error: "forbidden" as const };
const notFound = { ok: false as const, error: "not_found" as const };

// Only the owner edits; every Member may read what the Bot knows.
const isOwner = (scope: TenantScope) => scope.role === "owner";

export const createKnowledgeBaseEditor = ({ db, clock }: { db: Database; clock: Clock }) => {
  // Runs `save` only when the entry `replacing` is the Tenant's (otherwise
  // not_found) and the Knowledge base stays within the cap with `text` in its
  // place. Locking the Tenant row serialises saves, so two at once cannot
  // both fit under the cap.
  const saveWithinCap =<T>(scope: TenantScope, text: EntryText, replacing: string | null, save: (tx: Database) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.select({ id: organization.id }).from(organization)
        .where(eq(organization.id, scope.tenantId)).for("update");
      const entries = await tx.select({ id: knowledgeBaseEntry.id, title: knowledgeBaseEntry.title, body: knowledgeBaseEntry.body })
        .from(knowledgeBaseEntry)
        .where(eq(knowledgeBaseEntry.tenantId, scope.tenantId));
      if (replacing && !entries.some(({ id }) => id === replacing)) return notFound;
      const size = knowledgeBaseSize([...entries.filter(({ id }) => id !== replacing), text]);
      if (size > knowledgeBaseCharacterCap) return { ok: false as const, error: "over_cap" as const, size };
      return { ok: true as const, saved: await save(tx) };
    });

  return {
    async getKnowledgeBase(scope: TenantScope) {
      const entries = await db
        .select({
          id: knowledgeBaseEntry.id,
          kind: knowledgeBaseEntry.kind,
          title: knowledgeBaseEntry.title,
          body: knowledgeBaseEntry.body,
          updatedAt: knowledgeBaseEntry.updatedAt,
          updatedBy: user.name,
        })
        .from(knowledgeBaseEntry)
        .leftJoin(member, eq(member.id, knowledgeBaseEntry.updatedByMemberId))
        .leftJoin(user, eq(user.id, member.userId))
        .where(eq(knowledgeBaseEntry.tenantId, scope.tenantId))
        .orderBy(asc(knowledgeBaseEntry.createdAt), asc(knowledgeBaseEntry.id));
      return {
        entries:entries.map((entry) => ({ ...entry, size: entrySize(entry) })),
        used: knowledgeBaseSize(entries),
        cap: knowledgeBaseCharacterCap,
      };
    },

    async addEntry(scope: TenantScope, input: NewKnowledgeBaseEntry) {
      if (!isOwner(scope)) return forbidden;
      const parsed = newEntrySchema.safeParse(input);
      if (!parsed.success) return invalid;
      const now = clock.now();
      const result = await saveWithinCap(scope, parsed.data, null, async (tx) => {
        const [created] = await tx.insert(knowledgeBaseEntry).values({
          ...parsed.data,
          tenantId: scope.tenantId,
          updatedByMemberId: scope.memberId,
          createdAt: now,
          updatedAt: now,
        }).returning({ id: knowledgeBaseEntry.id });
        return created.id;
      });
      return result.ok ? { ok: true as const, entryId: result.saved } : result;
    },

    async editEntry(scope: TenantScope, entryId: string, input: EntryText) {
      if (!isOwner(scope)) return forbidden;
      const parsed = entryTextFields.safeParse(input);
      if (!parsed.success) return invalid;
      const result = await saveWithinCap(scope, parsed.data, entryId, (tx) => tx.update(knowledgeBaseEntry)
        .set({ ...parsed.data, updatedByMemberId: scope.memberId, updatedAt: clock.now() })
        .where(and(eq(knowledgeBaseEntry.id, entryId), eq(knowledgeBaseEntry.tenantId, scope.tenantId))));
      return result.ok ? { ok: true as const } : result;
    },

    async deleteEntry(scope: TenantScope, entryId: string) {
      if (!isOwner(scope)) return forbidden;
      const deleted = await db.delete(knowledgeBaseEntry)
        .where(and(eq(knowledgeBaseEntry.id, entryId), eq(knowledgeBaseEntry.tenantId, scope.tenantId)))
        .returning({ id: knowledgeBaseEntry.id });
      return deleted.length > 0 ? { ok: true as const } : notFound;
    },
  };
};
