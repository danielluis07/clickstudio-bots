import type { Email } from "@/platform/mailer";

type TenantOwnerInvitation = {
  to: string;
  tenantName: string;
  invitationUrl: string;
  expiresInDays: number;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const tenantOwnerInvitationEmail = ({
  to,
  tenantName,
  invitationUrl,
  expiresInDays,
}: TenantOwnerInvitation): Email => {
  const name = escapeHtml(tenantName);
  const url = escapeHtml(invitationUrl);

  return {
    to,
    subject: `Convite para o ClickStudio Bots: ${tenantName}`,
    text: [
      "Olá!",
      "",
      `Você foi convidado(a) para administrar ${tenantName} no ClickStudio Bots.`,
      "Para aceitar, abra o link abaixo, leia os Termos de Uso e o Acordo de Tratamento de Dados (DPA) e crie sua senha:",
      "",
      invitationUrl,
      "",
      `O convite vale por ${expiresInDays} dias. Se você não esperava este e-mail, pode ignorá-lo.`,
      "",
      "Equipe ClickStudio Bots",
    ].join("\n"),
    html: [
      "<p>Olá!</p>",
      `<p>Você foi convidado(a) para administrar <strong>${name}</strong> no ClickStudio Bots.</p>`,
      "<p>Para aceitar, abra o link abaixo, leia os Termos de Uso e o Acordo de Tratamento de Dados (DPA) e crie sua senha:</p>",
      `<p><a href="${url}">Aceitar convite</a></p>`,
      `<p>Ou copie este endereço no navegador: ${url}</p>`,
      `<p>O convite vale por ${expiresInDays} dias. Se você não esperava este e-mail, pode ignorá-lo.</p>`,
      "<p>Equipe ClickStudio Bots</p>",
    ].join("\n"),
  };
};
