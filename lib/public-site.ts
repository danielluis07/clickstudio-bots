export const publicOffer = {
  monthlyPrice: "R$ 349",
  foundingPrice: "R$ 249",
  monthlyReplies: "5.000",
};

export const legalLinks = [
  { href: "/privacidade", label: "Política de Privacidade" },
  { href: "/termos", label: "Termos de Uso e DPA" },
  { href: "/exclusao-de-dados", label: "Exclusão de dados" },
  { href: "/subprocessadores", label: "Subprocessadores" },
] as const;

// Stored with each Terms/DPA acceptance; bump it when the legal texts change.
export const termsVersion = "2026-10-19";

export const legalVersion = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeZone: "UTC",
}).format(new Date(termsVersion));

export const privacyContact = {
  name: "Daniel Assunção",
  email: "bombdaniel@hotmail.com",
};
