import {
  contactDetailFields,
  contactDetailLimits,
  type ContactDetailField,
} from "@/modules/conversations/contact-details";

export type ContactNames = {
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

// The avatar's letters: the first and last word of the shown name, or "#"
// when the name has no letters (a phone number, emoji).
export const contactInitials = (contact: ContactNames) => {
  const words = contactDisplayName(contact)
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word));
  if (words.length === 0) return "#";
  const first = words[0][0];
  return (words.length > 1 ? first + words[words.length - 1][0] : first).toUpperCase();
};

type DetailInput = {
  label: string;
  placeholder: string;
  type: "text" | "email";
  // Free text the Contact wrote, shown on several lines.
  multiline: boolean;
  description: string | null;
};

const detailInputs: Record<ContactDetailField, DetailInput> = {
  name: {
    label: "Nome",
    placeholder: "Sem nome",
    type: "text",
    multiline: false,
    description: "Deixe em branco para usar o nome do WhatsApp.",
  },
  email: {
    label: "E-mail",
    placeholder: "Não informado",
    type: "email",
    multiline: false,
    description: null,
  },
  city: {
    label: "Cidade",
    placeholder: "Não informada",
    type: "text",
    multiline: false,
    description: null,
  },
  need: {
    label: "Necessidade",
    placeholder: "Não informada",
    type: "text",
    multiline: true,
    description: null,
  },
};

// The Contact panel's detail inputs, in the order it shows them. A blank name
// shows the WhatsApp name it falls back to.
export const contactDetailInputs = (contact: Omit<ContactNames, "phone" | "name">) =>
  contactDetailFields.map((field) => {
    const input = detailInputs[field];
    return {
      field,
      maxLength: contactDetailLimits[field],
      ...input,
      placeholder:
        field === "name"
          ? (contact.appName ?? contact.profileName ?? input.placeholder)
          : input.placeholder,
    };
  });
