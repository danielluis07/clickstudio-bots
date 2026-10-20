import { escapeHtml, type Email } from "@/platform/mailer";

export const passwordResetPath = "/redefinir-senha";
// Better Auth's default lifetime for a reset token.
export const passwordResetLifetimeMinutes = 60;

type PasswordReset = {
  to: string;
  name: string;
  appUrl: string;
  token: string;
};

export const passwordResetUrl = (appUrl: string, token: string) => {
  const url = new URL(passwordResetPath, appUrl);
  url.searchParams.set("token", token);
  return url.href;
};

export const passwordResetEmail = ({
  to,
  name,
  appUrl,
  token,
}: PasswordReset): Email => {
  const resetUrl = passwordResetUrl(appUrl, token);
  const url = escapeHtml(resetUrl);

  return {
    to,
    subject: "Redefina sua senha do ClickStudio Bots",
    text: [
      `Olá, ${name}!`,
      "",
      "Recebemos um pedido para redefinir a senha da sua conta no ClickStudio Bots. Para criar uma nova senha, abra o link abaixo:",
      "",
      resetUrl,
      "",
      `O link vale por ${passwordResetLifetimeMinutes} minutos e pode ser usado uma única vez. Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.`,
      "",
      "Equipe ClickStudio Bots",
    ].join("\n"),
    html: [
      `<p>Olá, ${escapeHtml(name)}!</p>`,
      "<p>Recebemos um pedido para redefinir a senha da sua conta no ClickStudio Bots. Para criar uma nova senha, abra o link abaixo:</p>",
      `<p><a href="${url}">Redefinir senha</a></p>`,
      `<p>Ou copie este endereço no navegador: ${url}</p>`,
      `<p>O link vale por ${passwordResetLifetimeMinutes} minutos e pode ser usado uma única vez. Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.</p>`,
      "<p>Equipe ClickStudio Bots</p>",
    ].join("\n"),
  };
};
