import { cn } from "@/lib/utils";
import { contactInitials, type ContactNames } from "@/modules/conversations/hooks";

// WhatsApp's Cloud API sends no profile pictures, so the Contact's initials,
// tinted with the brand when the team answers.
export function ContactAvatar({
  contact,
  team,
  className,
}: {
  contact: ContactNames;
  team: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold select-none",
        team ? "bg-brand-tint text-foreground" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {contactInitials(contact)}
    </span>
  );
}
