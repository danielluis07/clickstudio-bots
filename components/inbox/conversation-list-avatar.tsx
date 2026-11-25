import { ContactAvatar } from "@/components/inbox/contact-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { contactDisplayName, type ContactNames } from "@/modules/conversations/hooks";

// A team Conversation's avatar turns into its bulk-selection checkbox on hover
// or focus, on touch screens, and while any Conversation is selected.
export function ConversationListAvatar({
  contact,
  selectable,
  selecting,
  checked,
  disabled,
  onCheck,
}: {
  contact: ContactNames;
  selectable: boolean;
  selecting: boolean;
  checked: boolean;
  disabled: boolean;
  onCheck: (checked: boolean) => void;
}) {
  if (!selectable) return <ContactAvatar contact={contact} team={false} />;

  const revealed = selecting || checked;
  return (
    <span className="group/avatar relative z-10 shrink-0">
      <ContactAvatar
        contact={contact}
        team
        className={cn(
          "transition-opacity group-hover/row:opacity-0 group-has-[:focus-visible]/avatar:opacity-0 pointer-coarse:opacity-0",
          revealed && "opacity-0",
        )}
      />
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/row:opacity-100 group-has-[:focus-visible]/avatar:opacity-100 pointer-coarse:opacity-100",
          revealed && "opacity-100",
        )}
      >
        <Checkbox
          aria-label={`Selecionar conversa com ${contactDisplayName(contact)}`}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheck}
        />
      </span>
    </span>
  );
}
