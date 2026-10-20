type ContactNames = { name: string | null; profileName: string | null; phone: string };

// A Brazilian wa_id is 55, a two-digit area code, then 8 or 9 digits.
export const formatContactPhone = (phone: string) => {
  const brazilian = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return brazilian ? `+55 ${brazilian[1]} ${brazilian[2]}-${brazilian[3]}` : `+${phone}`;
};

// The name a Member gave wins over the WhatsApp profile name.
export const contactDisplayName = (contact: ContactNames) =>
  contact.name ?? contact.profileName ?? formatContactPhone(contact.phone);
