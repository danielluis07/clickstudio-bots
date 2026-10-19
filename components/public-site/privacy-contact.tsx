import { privacyContact } from "@/lib/public-site";

export function PrivacyContact({ subject }: { subject?: string }) {
  const href = `mailto:${privacyContact.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

  return <a href={href}>{privacyContact.email}</a>;
}
