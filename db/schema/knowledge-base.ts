import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "@/db/columns";
import { member, organization } from "@/db/schema/tenancy";

// One FAQ pair or titled text section of a Tenant's Knowledge base. An FAQ's
// title is its question and its body the answer. Saved edits are live: there
// are no drafts or versions.
export const knowledgeBaseEntry = pgTable("knowledge_base_entry", {
  id: id(),
  tenantId: text("tenant_id").notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["faq", "section"] }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // The Member who last saved it. Null once that Member is removed.
  updatedByMemberId: text("updated_by_member_id").references(() => member.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [index("knowledge_base_entry_tenant_id_created_at_idx").on(t.tenantId, t.createdAt, t.id)]);
