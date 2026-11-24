import { sql, type SQL } from "drizzle-orm";
import { message, messageChange } from "@/db/schema";

// SQL for a selected `message` row as its changes leave it. Edits and revokes
// are kept apart from the message and matched by the original's wamid and
// direction when read, so they apply whichever arrives first.

const changesOf = (
  kind: (typeof messageChange.kind.enumValues)[number],
) => sql`from ${messageChange}
  where ${messageChange.tenantId} = ${message.tenantId} and ${messageChange.originalWamid} = ${message.wamid}
    and ${messageChange.direction} = ${message.direction} and ${messageChange.kind} = ${kind}`;

const latestEditText = sql`(select ${messageChange.text} ${changesOf("edit")}
  order by ${messageChange.changedAt} desc, ${messageChange.wamid} desc limit 1)`;

// A subquery's timestamp, null when no change matches.
const nullableTime = (query: SQL) => query.mapWith(message.sentAt) as SQL<Date | null>;

export const editedAt = nullableTime(
  sql`(select max(${messageChange.changedAt}) ${changesOf("edit")})`,
);

export const revokedAt = nullableTime(
  sql`(select min(${messageChange.changedAt}) ${changesOf("revoke")})`,
);

// As last edited; a revoked message shows no text.
export const currentText = sql<
  string | null
>`case when ${revokedAt} is null then coalesce(${latestEditText}, ${message.text}) end`;
