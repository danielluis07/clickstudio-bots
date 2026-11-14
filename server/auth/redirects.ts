export const signInPath = "/entrar";
export const signedInHomePath = "/painel";
export const returnToParam = "voltar";

const parseBase = "http://app.invalid";

// Only same-origin paths survive, so the parameter cannot become an open redirect.
export const safeReturnPath = (value: string | null | undefined, role?: string | null) => {
  const homePath = role === "admin" ? "/admin" : signedInHomePath;
  if (!value?.startsWith("/")) return homePath;
  const url = new URL(value, parseBase);
  if (url.origin !== parseBase) return homePath;
  // Going through a Tenant page would stream its sidebar before the admin
  // redirect. Choose the administration area before rendering either shell.
  if (role === "admin" && (url.pathname === "/painel" || url.pathname.startsWith("/painel/"))) {
    return homePath;
  }
  return `${url.pathname}${url.search}`;
};
