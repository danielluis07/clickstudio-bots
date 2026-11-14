import { auth } from "@/server/auth/auth";
import { safeReturnPath, signInPath } from "@/server/auth/redirects";

// The bare domain has no page of its own: it opens the dashboard for a valid
// session and the sign-in page for everyone else.
export const redirectFromRoot = async (request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  const path = session ? safeReturnPath(null, session.user.role) : signInPath;
  return Response.redirect(new URL(path, request.url), 307);
};
