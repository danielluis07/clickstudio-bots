import { BusinessProfileRow } from "@/components/bot/business-profile-row";
import { BusinessProfileSection } from "@/components/bot/business-profile-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCount } from "@/lib/format";
import type { BotSettingsLimits } from "@/modules/bot";
import type { BusinessProfileDraft } from "@/modules/bot/hooks";

type BusinessProfileFieldsProps = {
  draft: BusinessProfileDraft;
  limits: BotSettingsLimits;
  onField: (field: "businessName" | "offer" | "address", value: string) => void;
};

export function BusinessProfileFields({ draft, limits, onField }: BusinessProfileFieldsProps) {
  return (
    <BusinessProfileSection title="Sobre o negócio">
      <BusinessProfileRow label="Nome do negócio" htmlFor="bot-business-name">
        <Input
          id="bot-business-name"
          name="businessName"
          value={draft.businessName}
          onChange={(event) => onField("businessName", event.target.value)}
          maxLength={limits.businessName}
          required
        />
      </BusinessProfileRow>
      <BusinessProfileRow
        label="O que oferece"
        htmlFor="bot-offer"
        description={`Um resumo, como “Cortes de cabelo e barba”. ${formatCount(draft.offer.length)} de ${formatCount(limits.offer)} caracteres; preços e detalhes vão na base de conhecimento.`}
      >
        <Textarea
          id="bot-offer"
          name="offer"
          rows={3}
          value={draft.offer}
          onChange={(event) => onField("offer", event.target.value)}
          maxLength={limits.offer}
          aria-describedby="bot-offer-description"
        />
      </BusinessProfileRow>
      <BusinessProfileRow label="Endereço" htmlFor="bot-address">
        <Input
          id="bot-address"
          name="address"
          value={draft.address}
          onChange={(event) => onField("address", event.target.value)}
          maxLength={limits.address}
        />
      </BusinessProfileRow>
    </BusinessProfileSection>
  );
}
