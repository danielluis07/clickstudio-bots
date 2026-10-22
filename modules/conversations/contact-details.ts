import { z } from "zod";

// What a Tenant may learn about a Contact beyond the phone: a name, an email,
// a city and, in their own words, what they need. The Bot captures them when
// the Tenant enables it; Members see and edit them in the Contact panel. The
// name is the same one a Member gives the Contact. Browser-safe, so the
// Contact panel shows the same bounds.
export const contactDetailFields = ["name", "email", "city", "need"] as const;

export type ContactDetailField = (typeof contactDetailFields)[number];

export type ContactDetails = Record<ContactDetailField, string | null>;

// The longest each detail may be, in characters.
export const contactDetailLimits: Record<ContactDetailField, number> = {
  name: 100,
  email: 254,
  city: 100,
  need: 500,
};

const bounded = (field: ContactDetailField) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((text) => [...text].length <= contactDetailLimits[field]);

// One present detail's value, trimmed. An email must look like one.
export const contactDetailSchemas = {
  name: bounded("name"),
  email: bounded("email").pipe(z.email()),
  city: bounded("city"),
  need: bounded("need"),
} satisfies Record<ContactDetailField, z.ZodType<string>>;
