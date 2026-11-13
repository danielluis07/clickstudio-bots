import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCount } from "@/lib/format";
import type { BotSettingsLimits, BusinessProfile } from "@/modules/bot";

type BusinessProfileFieldsProps = {
  settings: BusinessProfile;
  limits: BotSettingsLimits;
};

export function BusinessProfileFields({ settings, limits }: BusinessProfileFieldsProps) {
  return (
    <FieldSet>
      <FieldLegend>Sobre o negócio</FieldLegend>
      <Field>
        <FieldLabel htmlFor="bot-business-name">Nome do negócio</FieldLabel>
        <Input
          id="bot-business-name"
          name="businessName"
          defaultValue={settings.businessName}
          maxLength={limits.businessName}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="bot-offer">O que o negócio oferece</FieldLabel>
        <Textarea
          id="bot-offer"
          name="offer"
          defaultValue={settings.offer}
          maxLength={limits.offer}
          aria-describedby="bot-offer-description"
        />
        <FieldDescription id="bot-offer-description">
          Um resumo, como “Cortes de cabelo e barba”. Até {formatCount(limits.offer)} caracteres;
          preços e detalhes vão na base de conhecimento.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="bot-address">Endereço</FieldLabel>
        <Input
          id="bot-address"
          name="address"
          defaultValue={settings.address}
          maxLength={limits.address}
        />
      </Field>
    </FieldSet>
  );
}
