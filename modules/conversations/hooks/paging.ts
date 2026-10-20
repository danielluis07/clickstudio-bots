// Shared by the server prefetch and the browser hooks, so both build the same
// infinite query.
export const nextPageCursor = <Cursor>(page: { nextCursor: Cursor | null }) => page.nextCursor;

// A missing or foreign Conversation stays missing; retrying only delays the
// message.
export const retryUnlessNotFound = (failures: number, error: { data?: { code?: string } | null }) =>
  error.data?.code !== "NOT_FOUND" && failures < 3;
