import Link from "next/link";
import { LegalDocument, LegalSection } from "@/components/public-site/legal-document";
import { PrivacyContact } from "@/components/public-site/privacy-contact";
import { privacyContact } from "@/lib/public-site";

export function DataDeletion() {
  return (
    <LegalDocument title="Exclusão de dados" description="Como pedir a exclusão de dados tratados pelo ClickStudio Bots, inclusive dados recebidos do WhatsApp e da Meta.">
      <LegalSection title="Envie sua solicitação por e-mail">
        <p>
          Escreva para <PrivacyContact subject="Solicitação de exclusão de dados" />,
          com o assunto “Solicitação de exclusão de dados”. O encarregado é {privacyContact.name}.
          Você pode usar este canal mesmo sem acesso ao painel.
        </p>
        <ol>
          <li>Informe se você faz parte da equipe de um negócio, é proprietário ou conversou com um negócio que usa a plataforma.</li>
          <li>Identifique o negócio e informe o e-mail de cadastro ou, para uma conversa, o número de WhatsApp utilizado, com código do país e DDD.</li>
          <li>Descreva o que deseja excluir. Não envie senhas, tokens da Meta, documentos completos ou o histórico inteiro da conversa.</li>
        </ol>
        <p>
          Podemos solicitar confirmação proporcional de identidade ou da autoridade
          para representar o negócio antes de executar a exclusão. Informaremos o
          andamento pelo mesmo canal e explicaremos eventual retenção legal.
        </p>
      </LegalSection>
      <LegalSection title="Se você conversou com um negócio">
        <p>
          O negócio é o controlador da conversa. Você pode pedir a exclusão
          diretamente a ele. Se escrever à ClickStudio, encaminharemos o pedido ao
          negócio em até 2 dias úteis e avisaremos você. Após a instrução do
          controlador, a exclusão nos sistemas ativos ocorre em até 15 dias.
        </p>
        <p>
          A exclusão abrange o contato, suas conversas, transcrições de voz e
          campos capturados. Eventos brutos recebidos da Meta ainda podem conter
          texto e telefone por até 30 dias. Backups deixam de conter os dados
          conforme a janela de recuperação divulgada na Política de Privacidade.
          Se você enviar uma nova mensagem depois, será criado um novo contato.
        </p>
        <p>
          A exclusão na ClickStudio não apaga a conversa no aplicativo WhatsApp
          Business do negócio nem nos sistemas da Meta. Solicite ao negócio que
          também exclua o chat do aplicativo no telefone; para dados mantidos pela
          Meta, utilize os canais e controles disponibilizados por ela.
        </p>
      </LegalSection>
      <LegalSection title="Se você é proprietário ou membro da equipe">
        <p>
          O proprietário pode solicitar a exclusão de um contato ou dos dados do
          negócio por este e-mail. Pedidos de exportação são atendidos manualmente
          em JSON ou CSV em até 15 dias. Combine o pedido de exportação antes da
          exclusão, pois os dados excluídos não ficam disponíveis no painel.
        </p>
        <p>
          No cancelamento da assinatura, desconectamos o canal e interrompemos o
          Bot na data do cancelamento. Há 30 dias para reativar ou pedir uma
          exportação; no 30º dia, a rotina diária elimina contatos, conversas,
          base de conhecimento, configurações e tokens criptografados da Meta.
        </p>
        <p>
          Ao remover um membro, excluímos imediatamente seu cadastro, autenticação
          e sessões, salvo se ele também pertencer a outro negócio. As respostas
          anteriores ficam identificadas como “Membro removido”. Registros fiscais
          e de cobrança permanecem por 5 anos quando exigidos para essa finalidade.
        </p>
      </LegalSection>
      <LegalSection title="Saiba mais">
        <p>
          Consulte a <Link href="/privacidade">Política de Privacidade</Link>, o
          <Link href="/termos#dpa"> Acordo de Tratamento de Dados</Link> e a lista de
          <Link href="/subprocessadores"> subprocessadores</Link> para conhecer os
          prazos de retenção, as responsabilidades e os fornecedores envolvidos.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
