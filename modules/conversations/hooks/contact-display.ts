import {
  contactDetailFields,
  contactDetailLimits,
  type ContactDetailField,
} from "@/modules/conversations/contact-details";

type ContactNames = {
  name: string | null;
  appName: string | null;
  profileName: string | null;
  phone: string;
};

// A Brazilian wa_id is 55, a two-digit area code, then 8 or 9 digits.
export const formatContactPhone = (phone: string) => {
  const brazilian = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return brazilian ? `+55 ${brazilian[1]} ${brazilian[2]}-${brazilian[3]}` : `+${phone}`;
};

// The name a Member gave in the dashboard wins, then the one saved in the
// WhatsApp Business app, then the Contact's WhatsApp profile name.
export const contactDisplayName = (contact: ContactNames) =>
  contact.name ?? contact.appName ?? contact.profileName ?? formatContactPhone(contact.phone);

const detailLabels: Record<ContactDetailField, { label: string; placeholder: string }> = {
  name: { label: "Nome", placeholder: "Sem nome" },
  email: { label: "E-mail", placeholder: "Não informado" },
  city: { label: "Cidade", placeholder: "Não informada" },
  need: { label: "Necessidade", placeholder: "Não informada" },
};

// The Contact panel's detail inputs, in the order it shows them.
export const contactDetailInputs = contactDetailFields.map((field) => ({
  field,
  maxLength: contactDetailLimits[field],
  ...detailLabels[field],
}));
