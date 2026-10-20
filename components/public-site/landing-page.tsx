import { buttonVariants } from "@/components/ui/button";
import { PricingSection } from "@/components/public-site/pricing-section";
import { publicOffer } from "@/modules/legal";

function LandingHero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1.5fr_1fr] md:items-end md:py-28">
      <div className="flex flex-col items-start gap-7">
        <p className="text-sm font-medium text-primary">WhatsApp para pequenas equipes</p>
        <h1 className="max-w-3xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
          As dúvidas se repetem. Seu trabalho não precisa.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
          Um Bot responde com as informações do seu negócio. Sua equipe acompanha
          as conversas e assume quando precisar, mantendo o número e o aplicativo
          WhatsApp Business.
        </p>
        <a href="#plano" className={buttonVariants({ size: "lg" })}>Conhecer o plano</a>
      </div>
      <aside className="flex flex-col gap-5 rounded-2xl bg-secondary p-8">
        <h2 className="text-xl font-semibold">Simples de entender. Simples de acompanhar.</h2>
        <p className="leading-relaxed text-muted-foreground">
          Um plano mensal. {publicOffer.monthlyReplies} respostas do Bot.
          Até 10 pessoas na mesma caixa de entrada.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Em preparação para os primeiros negócios. A entrada é por convite,
          com configuração acompanhada de perto.
        </p>
      </aside>
    </section>
  );
}

function HowItWorks() {
  return (
    <section aria-labelledby="como-funciona" className="bg-secondary">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1fr_1.3fr] md:gap-20">
        <h2 id="como-funciona" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          O Bot cuida do que você já explicou. A equipe cuida do que vem depois.
        </h2>
        <dl className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <dt className="text-lg font-semibold">Respostas com a sua base de conhecimento</dt>
            <dd className="leading-relaxed text-muted-foreground">
              Cadastre perguntas frequentes, informações e regras do negócio.
              Quando faltar uma resposta, o Bot encaminha a conversa para a equipe.
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="text-lg font-semibold">Uma caixa de entrada para todos</dt>
            <dd className="leading-relaxed text-muted-foreground">
              Acompanhe o histórico e veja quem está atendendo: Bot ou equipe.
              Assuma uma conversa e deixe o Bot em silêncio até devolvê-la.
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="text-lg font-semibold">Seu WhatsApp Business continua com você</dt>
            <dd className="leading-relaxed text-muted-foreground">
              A proposta usa seu número atual junto com o aplicativo.
              A conexão depende da elegibilidade e das aprovações da Meta.
              O lançamento começa pelo WhatsApp; Instagram fica para uma etapa futura.
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function InvitationSection() {
  return (
    <section id="convites" aria-labelledby="invitation-title" className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-2 md:gap-20">
      <h2 id="invitation-title" className="text-3xl font-semibold tracking-tight">Começamos perto de cada negócio.</h2>
      <div className="flex flex-col gap-4 leading-relaxed text-muted-foreground">
        <p>
          O acesso é somente por convite. Os primeiros negócios recebem ajuda para
          conectar o WhatsApp, preparar a base de conhecimento e testar o Bot antes
          de ativá-lo. Não há cadastro público nem teste gratuito.
        </p>
        <p>
          Se você recebeu um convite, use o link enviado ao seu e-mail. A assinatura,
          a garantia e o prazo do preço de fundador começam na ativação efetiva do
          serviço. Nenhuma cobrança começa enquanto as aprovações necessárias estiverem pendentes.
        </p>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <>
      <LandingHero />
      <HowItWorks />
      <PricingSection />
      <InvitationSection />
    </>
  );
}
