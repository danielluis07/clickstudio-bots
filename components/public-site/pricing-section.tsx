import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { publicOffer } from "@/lib/public-site";

export function PricingSection() {
  return (
    <section id="plano" aria-labelledby="pricing-title" className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:gap-20">
      <div className="flex flex-col gap-6">
        <h2 id="pricing-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">Um plano. A conta às claras.</h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {publicOffer.monthlyPrice} por mês. Um número de WhatsApp, um Bot e até
          10 membros da equipe. Sem taxa de configuração. Cancele quando quiser.
        </p>
        <dl className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <dt className="font-semibold">{publicOffer.monthlyReplies} respostas do Bot por mês</dt>
            <dd className="leading-relaxed text-muted-foreground">
              Uma resposta é uma mensagem enviada pelo Bot. Mensagens da equipe e
              modelos de mensagem não consomem essa franquia. A contagem renova no
              início de cada mês, no horário de São Paulo.
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="font-semibold">Sem cobrança automática por excedente</dt>
            <dd className="leading-relaxed text-muted-foreground">
              Avisamos ao atingir 80%. No limite, o Bot para de responder e as
              novas mensagens ficam com a equipe. O atendimento humano continua.
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="font-semibold">As tarifas da Meta são separadas</dt>
            <dd className="leading-relaxed text-muted-foreground">
              Quando houver tarifas do WhatsApp, seu negócio paga diretamente à
              Meta, pela própria conta. Elas não estão incluídas na assinatura.
              A ClickStudio não antecipa, repassa nem acrescenta margem a esses valores.
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-col items-start gap-6 rounded-2xl bg-primary p-8 text-primary-foreground sm:p-10">
        <h3 className="text-xl font-medium">Para os primeiros 10 negócios pagantes</h3>
        <p><span className="text-6xl font-semibold tracking-tight">{publicOffer.foundingPrice}</span><span className="text-lg"> / mês</span></p>
        <p className="text-lg leading-relaxed">
          Preço de fundador fixo por 12 meses a partir da ativação efetiva.
          Depois desse período, vale o preço informado para a renovação.
        </p>
        <p className="leading-relaxed">
          Garantia de 30 dias a partir da ativação: solicite o cancelamento nesse
          prazo e devolvemos integralmente o valor da assinatura pago à ClickStudio.
          Tarifas pagas diretamente à Meta não entram no reembolso.
        </p>
        <p className="text-sm leading-relaxed">
          Pagamento mensal desde a ativação, por PIX ou boleto enviado manualmente.
          Entrada somente por convite.
        </p>
        <a href="#convites" className={buttonVariants({ variant: "secondary", size: "lg" })}>Entender o acesso por convite</a>
        <Link href="/termos" className="underline underline-offset-4">Leia as condições completas</Link>
      </div>
    </section>
  );
}
