import Link from "next/link";
import { LegalDocument, LegalSection } from "@/components/public-site/legal-document";
import { PrivacyContact } from "@/components/public-site/privacy-contact";
import { privacyContact, publicOffer } from "@/modules/legal";

export function TermsOfUse() {
  return (
    <LegalDocument
      title="Termos de Uso"
      description="Condições da assinatura e, no anexo, o Acordo de Tratamento de Dados (DPA)."
    >
      <LegalSection title="O serviço e as partes">
        <p>
          Estes termos regulam a contratação da ClickStudio Bots pelo negócio assinante (Tenant),
          representado pelo proprietário que aceita o convite. Membros são as pessoas autorizadas
          pelo negócio a usar o painel. Contatos são as pessoas atendidas pelo negócio em seu canal
          de WhatsApp.
        </p>
        <p>
          O serviço reúne um Bot, configurado com a base de conhecimento do negócio, e uma caixa de
          entrada compartilhada para acompanhar conversas e assumir o atendimento. O MVP começa pelo
          WhatsApp, com um canal e um Bot por negócio, para até 10 membros. Instagram não está
          incluído nesta etapa.
        </p>
      </LegalSection>
      <LegalSection title="Convite, aceite e ativação">
        <p>
          O acesso é somente por convite, com configuração assistida. Ao aceitar o convite, o
          proprietário deverá aceitar estes termos e o DPA anexo em nome do negócio. Uma cópia
          assinada do DPA poderá ser solicitada. Não há cadastro público nem teste gratuito.
        </p>
        <p>
          A ativação paga depende das aprovações da Meta, da verificação da conexão com o WhatsApp
          Business, da avaliação do modelo e da revisão jurídica brasileira dos textos finais e das
          transferências internacionais. Atrasos nesses requisitos adiam a ativação, a cobrança, a
          garantia e o início do prazo do preço de fundador.
        </p>
      </LegalSection>
      <LegalSection title="Preço, fundador e pagamento">
        <p>
          Há um único plano, de {publicOffer.monthlyPrice} por mês, sem taxa de configuração. Os
          primeiros 10 negócios pagantes terão o preço de fundador de {publicOffer.foundingPrice}{" "}
          por mês fixo por 12 meses contados da ativação efetiva do serviço. Depois desse prazo, o
          preço aplicável à renovação será informado previamente. Não há contratação anual nem
          compromisso de permanência.
        </p>
        <p>
          Os negócios fundadores pagam mensalmente desde a ativação, por PIX ou boleto enviado
          manualmente.
        </p>
        <p>
          Tarifas do WhatsApp são contratadas e pagas diretamente pelo negócio à Meta, na própria
          conta. Não integram a assinatura. A ClickStudio não financia, repassa ou acrescenta margem
          a essas tarifas.
        </p>
      </LegalSection>
      <LegalSection title="Franquia de respostas">
        <p>
          O plano inclui {publicOffer.monthlyReplies} respostas do Bot por mês calendário, no fuso
          America/Sao_Paulo. Uma resposta é uma mensagem enviada pelo Bot ao contato e confirmada
          pela Meta. Mensagens de membros, modelos de mensagem, histórico importado, tentativas sem
          novo envio e testes no ambiente de simulação não consomem a franquia.
        </p>
        <p>
          Ao atingir 80%, o painel avisa e o proprietário recebe um e-mail no período. No limite, o
          Bot interrompe os envios e as novas mensagens são encaminhadas à equipe, sem cobrança
          automática por excedente. Conversas simultâneas podem produzir uma ou duas respostas além
          do limite, sem cobrança adicional. A renovação da franquia não devolve automaticamente ao
          Bot uma conversa assumida pela equipe.
        </p>
      </LegalSection>
      <LegalSection title="Garantia e cancelamento">
        <p>
          O fundador pode cancelar em até 30 dias da ativação efetiva e solicitar reembolso integral
          da assinatura paga à ClickStudio nesse período. Solicite pelo canal que enviou seu convite
          ou cobrança; pedidos de privacidade podem ser enviados para <PrivacyContact />. Tarifas
          pagas diretamente à Meta não são reembolsadas pela ClickStudio. A garantia não limita
          direitos previstos na legislação aplicável.
        </p>
        <p>
          É possível cancelar a qualquer momento, sem multa. Na data do cancelamento, o canal é
          desconectado e o Bot para. Os dados ficam disponíveis para reativação ou solicitação de
          exportação por 30 dias; no 30º dia, a rotina diária exclui os dados do negócio nos
          sistemas ativos. A retenção residual de eventos, backups e registros obrigatórios segue a
          <Link href="/privacidade"> Política de Privacidade</Link>.
        </p>
      </LegalSection>
      <LegalSection title="Responsabilidades e limites do serviço">
        <p>
          O negócio mantém sua conta Meta, autorizações, dados de cobrança e base de conhecimento
          atualizados; administra o acesso dos membros e informa seus contatos sobre o atendimento
          automatizado. Não pode usar o serviço para spam, campanhas não autorizadas ou atividades
          ilegais. A oferta não inclui disparos, campanhas ou respostas proativas.
        </p>
        <p>
          Respostas automatizadas podem conter erros. O negócio deve testar a configuração e manter
          pessoas disponíveis para assumir conversas. Dependências externas podem ficar
          indisponíveis. O serviço não promete disponibilidade ininterrupta, resultados comerciais
          ou decisões de terceiros. O uso do aplicativo WhatsApp Business continua sujeito às regras
          e limitações da Meta; respostas pelo Windows e WearOS podem não pausar o Bot. As
          limitações serão explicadas na configuração assistida.
        </p>
        <p>
          Alterações relevantes nas condições serão informadas antes da renovação. Aplicam-se as
          leis brasileiras e os direitos inderrogáveis das partes. Este texto não exclui
          responsabilidades que a lei não permita excluir.
        </p>
      </LegalSection>
      <LegalSection id="dpa" title="Anexo: Acordo de Tratamento de Dados (DPA)">
        <p>
          Este Acordo integra os Termos de Uso. O negócio é controlador dos dados de seus contatos;
          a ClickStudio é operadora dos contatos, conversas, histórico importado, transcrições,
          campos capturados e base de conhecimento inseridos pelo negócio. A ClickStudio continua
          controladora dos próprios dados de cadastro de membros, autenticação, cobrança e contato
          comercial.
        </p>
      </LegalSection>
      <LegalSection title="Objeto, duração e instruções">
        <p>
          O tratamento dura enquanto necessário à execução do contrato e às retenções descritas
          neste Acordo. Abrange receber, organizar, armazenar, consultar, transmitir, transcrever e
          excluir dados para prestar o atendimento configurado. As categorias incluem identificação
          e telefone de contatos, conteúdo e metadados das conversas, transcrições e dados inseridos
          pelo negócio. Os titulares são os contatos e as pessoas cujos dados o negócio insere na
          base de conhecimento ou nas conversas.
        </p>
        <p>
          A ClickStudio trata esses dados somente conforme instruções documentadas do negócio,
          inclusive suas configurações e solicitações, para as finalidades contratadas. Não os usa
          para publicidade ou treinamento de modelos próprios. Se uma obrigação legal exigir outro
          tratamento, informará o negócio quando a lei permitir. Instruções aparentemente contrárias
          à LGPD serão sinalizadas ao controlador.
        </p>
      </LegalSection>
      <LegalSection title="Compromissos do controlador">
        <p>
          O negócio declara possuir base legal para os dados dos contatos, prestar as informações de
          transparência necessárias e informar sobre o canal e o uso do Bot. Não configurará campos
          de captura para solicitar dados sensíveis definidos no art. 5º, II, da LGPD. Conteúdo
          sensível enviado espontaneamente pode ser processado como parte da conversa, sem
          tratamento especializado no MVP. Cabe ao negócio avaliar essa limitação e orientar seus
          contatos.
        </p>
      </LegalSection>
      <LegalSection title="Confidencialidade, segurança e assistência">
        <p>
          A ClickStudio restringe o acesso às pessoas que precisam dele e as vincula à
          confidencialidade. Adota medidas proporcionais ao risco, incluindo isolamento de dados por
          negócio, controle de acesso, criptografia de tokens da Meta e remoção de conteúdo pessoal
          dos diagnósticos. Ajuda o negócio a responder a solicitações de titulares, avaliar riscos
          e cumprir suas obrigações, fornecendo as informações disponíveis sobre o tratamento.
        </p>
        <p>
          Pedidos de contatos recebidos diretamente são encaminhados ao negócio em até 2 dias úteis,
          com informação ao solicitante. Exportações do negócio são preparadas manualmente em JSON
          ou CSV em até 15 dias da solicitação.
        </p>
      </LegalSection>
      <LegalSection title="Subprocessadores e aviso de mudanças">
        <p>
          O negócio autoriza os fornecedores da
          <Link href="/subprocessadores"> lista pública de subprocessadores</Link>, limitada às
          finalidades e categorias ali descritas. A ClickStudio exige compromissos de proteção de
          dados compatíveis com o serviço e permanece responsável pelas obrigações que assume como
          operadora.
        </p>
        <p>
          Inclusões ou substituições serão avisadas ao proprietário por e-mail com pelo menos 15
          dias de antecedência. Se discordar, o negócio pode apresentar objeção e cancelar antes da
          mudança, sem multa. A Meta é contratada diretamente pelo negócio e não integra essa
          autorização como subprocessadora da ClickStudio.
        </p>
      </LegalSection>
      <LegalSection title="Incidentes de segurança">
        <p>
          A ClickStudio notificará os negócios afetados em até 24 horas após confirmar um incidente
          de segurança com seus dados. Informará o que estiver disponível sobre natureza, dados e
          titulares afetados, riscos, medidas tomadas e ponto de contato, complementando as
          informações conforme a apuração. Cooperará com contenção e resposta e manterá o registro
          do incidente por 5 anos.
        </p>
        <p>
          O negócio, como controlador, avalia e realiza a comunicação à ANPD e aos titulares quando
          houver risco ou dano relevante, observando o prazo regulatório aplicável, em regra de 3
          dias úteis. O prazo contratual de 24 horas da ClickStudio não substitui essa obrigação do
          controlador.
        </p>
      </LegalSection>
      <LegalSection title="Exclusão, devolução e fim do contrato">
        <p>
          A ClickStudio executará instruções de exclusão do negócio em até 15 dias nos sistemas
          ativos, inclusive de contatos, conversas, transcrições e campos associados, e informará as
          retenções residuais aplicáveis. Eventos brutos expiram em até 30 dias; backups são
          eliminados pelo envelhecimento da janela de recuperação, sem uso para novas finalidades.
          Uma restauração deve reaplicar as exclusões.
        </p>
        <p>
          No cancelamento, o canal é desconectado e o Bot é interrompido. O negócio tem 30 dias para
          reativar ou pedir a devolução dos dados por exportação manual. No 30º dia, a rotina diária
          elimina os dados, configurações e tokens criptografados do negócio. Cadastros de membros
          são eliminados, salvo vínculo com outro negócio. Registros fiscais ficam por 5 anos, sob
          responsabilidade da ClickStudio como controladora.
        </p>
      </LegalSection>
      <LegalSection title="Transferências internacionais e contato">
        <p>
          O negócio autoriza as transferências necessárias às finalidades contratadas para os locais
          indicados na lista de subprocessadores, incluindo hospedagem no leste dos Estados Unidos e
          processamento por Anthropic e Groq. O fundamento previsto é o art. 33, IX, combinado com o
          art. 7º, V, da LGPD, condicionado ao parecer jurídico antes da ativação paga. Esta
          autorização não substitui as salvaguardas legais exigidas. Não se declara adoção de
          cláusulas-padrão da ANPD por fornecedores sem confirmação contratual.
        </p>
        <p>
          Consulte a <Link href="/privacidade">Política de Privacidade</Link> e as
          <Link href="/exclusao-de-dados"> instruções de exclusão</Link>. O encarregado é{" "}
          {privacyContact.name}; solicitações sobre este Acordo devem ser enviadas para{" "}
          <PrivacyContact />.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
