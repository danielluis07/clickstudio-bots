// A provider failure that is safe and worth retrying: the call certainly had
// no effect, and the same call may succeed later (a timeout before any effect,
// a rate limit, an overloaded or failing provider). Adapters throw it with the
// vendor error as its `cause`, which error records read; any other rejection
// may have had an effect, or will fail again.
export class RetryableError extends Error {
  override name = "RetryableError";
}
