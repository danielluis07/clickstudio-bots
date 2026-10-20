import Link from "next/link";
import { LegalDocument, LegalSection } from "@/components/public-site/legal-document";
import { PrivacyContact } from "@/components/public-site/privacy-contact";
import { privacyContact } from "@/modules/legal";

export function PrivacyPolicy() {
  return (
    <LegalDocument title="Política de Privacidade" description="Como a ClickStudio Bots trata dados, por quanto tempo e como exercer seus direitos.">
      <LegalSection title="Quem cuida dos dados">
        <p>
          A ClickStudio é controladora dos dados de membros da equipe, autenticação,
          cobrança, contatos comerciais e visitantes deste site. Para os dados que
          cada negócio contratante (Tenant) insere na plataforma, a ClickStudio é
          operadora e segue as instruções desse negócio, que é o controlador perante
          seus contatos. Membros são as pessoas com acesso ao painel; contatos são
          as pessoas que conversam com o negócio pelo WhatsApp.
        </p>
        <p>
          O encarregado pelo tratamento de dados é {privacyContact.name}. Para dúvidas, pedidos
          ou reclamações sobre privacidade, escreva para <PrivacyContact />.
        </p>
      </LegalSection>
      <LegalSection title="Quais dados são tratados e para quê">
        <ul>
          <li>Cadastro de membros: nome, e-mail, credenciais protegidas, sessões e vínculo com o negócio, para autenticar e controlar o acesso.</li>
          <li>Dados do contratante: identificação, contato comercial, informações de assinatura, cobrança e comprovantes, para executar o contrato e cumprir obrigações fiscais.</li>
          <li>Dados recebidos da Meta: identificadores de contas e canais, número de telefone, nome e identificadores dos contatos, mensagens, datas, estados de entrega, respostas da equipe e histórico importado autorizado, para conectar o WhatsApp e organizar o atendimento.</li>
          <li>Dados do atendimento: conversas, campos de contato definidos pelo negócio e base de conhecimento, para produzir respostas do Bot e permitir atendimento humano.</li>
          <li>Áudios de voz: processados temporariamente para transcrição. A plataforma não armazena o arquivo de áudio; a transcrição passa a compor a conversa.</li>
          <li>Dados técnicos: identificadores, endereço IP e registros estritamente necessários para segurança, funcionamento e diagnóstico do serviço.</li>
        </ul>
        <p>
          O Bot usa a base de conhecimento e o contexto necessário da conversa para
          responder. A Anthropic é a provedora de modelo prevista nesta minuta,
          sujeita à avaliação antes do lançamento; a Groq realiza a transcrição de
          voz. O número de telefone não é incluído como campo estruturado enviado ao
          modelo. Não usamos os dados do atendimento para publicidade nem para
          treinar modelos próprios. As APIs contratadas não usam o conteúdo para
          treinamento por padrão.
        </p>
        <p>
          O negócio deve informar seus contatos sobre o atendimento automatizado
          e definir a base legal aplicável. Não deve configurar perguntas para
          coletar dados pessoais sensíveis. Se um contato enviar esses dados por
          iniciativa própria, eles podem integrar a conversa; o MVP não oferece
          tratamento especializado para esse conteúdo.
        </p>
      </LegalSection>
      <LegalSection title="Bases legais">
        <p>
          Como controladora, a ClickStudio trata os dados necessários para executar
          o contrato e os procedimentos preliminares solicitados pelo titular
          (art. 7º, V, da LGPD), cumprir obrigações legais e fiscais (art. 7º, II)
          e proteger o serviço, quando cabível, com base em legítimo interesse
          avaliado para essa finalidade (art. 7º, IX). Como operadora, segue as
          instruções e a base legal definida pelo negócio controlador.
        </p>
      </LegalSection>
      <LegalSection title="Compartilhamento e transferências internacionais">
        <p>
          A infraestrutura prevista fica no leste dos Estados Unidos: Vercel
          (iad1) e Neon (us-east). O conteúdo dos contatos é processado por Vercel,
          Neon, Anthropic e Groq. QStash e Ably recebem apenas identificadores para
          tarefas e atualizações. Resend recebe os dados de membros necessários
          aos e-mails do serviço. Sentry recebe diagnósticos com conteúdo pessoal
          removido, em sua região da União Europeia.
        </p>
        <p>
          Consulte os fornecedores, categorias de dados e locais na página de
          <Link href="/subprocessadores"> subprocessadores</Link>. A Meta é
          contratada diretamente pelo negócio e não é subprocessadora da ClickStudio.
        </p>
        <p>
          A base prevista para as transferências necessárias à execução do contrato
          é o art. 33, IX, combinado com o art. 7º, V, da LGPD. Sua adequação depende
          de parecer jurídico brasileiro antes da ativação paga. Não declaramos
          que os fornecedores já assinaram as cláusulas-padrão da ANPD nem que os
          Estados Unidos possuem reconhecimento de adequação. Eventuais ajustes
          nas salvaguardas serão refletidos nesta política e no DPA antes do lançamento.
        </p>
      </LegalSection>
      <LegalSection title="Por quanto tempo os dados ficam na plataforma">
        <ul>
          <li>Durante a assinatura: contatos, conversas, campos capturados, histórico importado e transcrições ficam disponíveis sem expiração automática, salvo instrução de exclusão do negócio.</li>
          <li>Eventos brutos recebidos da Meta: até 30 dias, inclusive quando contêm textos e telefones.</li>
          <li>Cancelamento: o canal é desconectado e o Bot para na data do cancelamento. Há 30 dias para reativação ou solicitação de exportação. No 30º dia, a rotina diária exclui os dados do negócio, inclusive base de conhecimento, configurações e tokens da Meta.</li>
          <li>Exclusão solicitada pelo negócio: até 15 dias para os dados nos sistemas ativos. Eventos brutos remanescentes expiram em até 30 dias e cópias de recuperação seguem a janela de backup descrita abaixo.</li>
          <li>Membro removido: cadastro, autenticação e sessões são excluídos imediatamente, salvo vínculo com outro negócio. Suas respostas anteriores ficam atribuídas a “Membro removido”.</li>
          <li>Registros de cobrança e notas fiscais: 5 anos para obrigações fiscais. Registros de incidentes de segurança: 5 anos.</li>
        </ul>
      </LegalSection>
      <LegalSection title="Backups e retenção nos fornecedores">
        <p>
          Backups do Neon deixam de conter os dados excluídos conforme a janela de
          recuperação configurada. O padrão publicado é de 6 horas no plano Free
          e de 1 dia nos planos Launch e Scale; os limites configuráveis são,
          respectivamente, 6 horas, 7 dias e 30 dias. O plano e a janela efetiva
          da produção ainda serão confirmados nesta minuta antes de receber dados
          reais. Uma restauração deve reaplicar as exclusões pendentes.
        </p>
        <p>
          Logs de execução da Vercel contêm apenas identificadores. A retenção
          publicada é de 1 hora no Hobby, 1 dia no Pro e 3 dias no Enterprise,
          podendo chegar a 30 dias com Observability Plus. O plano de produção
          ainda será confirmado. No Sentry, os diagnósticos são enviados sem
          corpos de requisição, textos de mensagens ou telefones; o prazo efetivo
          depende do plano e também será confirmado antes do lançamento.
        </p>
        <p>
          A Anthropic informa retenção padrão de entradas e saídas da API por até
          30 dias, com exceções para cumprimento legal e investigação de abuso.
          A configuração prevista da Groq habilita retenção zero para o conteúdo
          das transcrições; metadados de uso continuam sujeitos às regras do
          fornecedor. O Resend informa retenção de e-mails e logs por 30 dias nos
          planos Free, Pro e Scale. O Ably mantém mensagens por 2 minutos por padrão,
          sem histórico persistente habilitado. A retenção de mensagens, logs e
          fila de falhas do QStash ainda está em confirmação; os payloads levam
          apenas identificadores. Consulte as fontes na lista de subprocessadores.
        </p>
      </LegalSection>
      <LegalSection title="Seus direitos e como solicitar">
        <p>
          Você pode solicitar confirmação do tratamento, acesso, correção,
          informação sobre compartilhamento, portabilidade quando aplicável,
          anonimização, bloqueio ou eliminação nas hipóteses legais, revisão de
          decisões automatizadas e informações sobre consentimento e sua revogação,
          quando essa for a base aplicável. Também pode recorrer à ANPD.
        </p>
        <p>
          Para dados de cadastro ou de cobrança tratados pela ClickStudio como
          controladora, escreva para <PrivacyContact />. Podemos solicitar apenas
          as informações necessárias para verificar a identidade e proteger os dados.
        </p>
        <p>
          Para dados de uma conversa, procure o negócio com quem conversou. Se o
          pedido chegar à ClickStudio, encaminharemos ao negócio controlador em até
          2 dias úteis e informaremos você. Exportações solicitadas pelo negócio
          são preparadas manualmente em JSON ou CSV em até 15 dias. Veja as
          <Link href="/exclusao-de-dados"> instruções de exclusão de dados</Link>.
        </p>
      </LegalSection>
      <LegalSection title="Segurança e incidentes">
        <p>
          O plano inclui acesso restrito por negócio, confidencialidade da equipe,
          tokens da Meta criptografados e redução de dados nos diagnósticos. Nenhum
          serviço é isento de risco. Em caso de incidente confirmado que afete os
          dados do negócio, a ClickStudio o avisará em até 24 horas da confirmação
          e colaborará com a avaliação e a resposta. O negócio, como controlador,
          avalia a comunicação à ANPD e aos titulares nos prazos legais aplicáveis.
        </p>
      </LegalSection>
      <LegalSection title="Cookies e alterações desta política">
        <p>
          Este site não inclui tags de anúncios, ferramentas de analytics ou
          cookies não essenciais, e não exibe banner de cookies. O painel usa
          somente cookies de sessão estritamente necessários. Qualquer inclusão
          futura de tags não essenciais depende de consentimento prévio.
        </p>
        <p>
          Atualizações serão publicadas nesta página com sua data. Mudanças na
          lista de subprocessadores serão comunicadas aos negócios por e-mail
          com antecedência de 15 dias, conforme o
          <Link href="/termos#dpa"> Acordo de Tratamento de Dados</Link>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
