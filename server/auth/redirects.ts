export const signInPath = "/entrar";
export const signedInHomePath = "/painel";
export const returnToParam = "voltar";

const parseBase = "http://app.invalid";

// Only same-origin paths survive, so the parameter cannot become an open redirect.
export const safeReturnPath = (value: string | null | undefined) => {
  if (!value?.startsWith("/")) return signedInHomePath;
  const url = new URL(value, parseBase);
  if (url.origin !== parseBase) return signedInHomePath;
  return `${url.pathname}${url.search}`;
};
