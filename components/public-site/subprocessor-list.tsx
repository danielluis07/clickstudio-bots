import Link from "next/link";
import { LegalDocument, LegalSection } from "@/components/public-site/legal-document";
import { PrivacyContact } from "@/components/public-site/privacy-contact";
import { retentionSources, subprocessors } from "@/modules/legal";

function SubprocessorTable() {
  return (
    <div role="region" aria-label="Tabela de subprocessadores, role horizontalmente para ler todas as colunas" tabIndex={0} className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full min-w-180 border-collapse text-left text-sm">
        <caption className="bg-secondary p-4 text-left font-medium">Fornecedores previstos e limites de acesso aos dados</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="p-4">Fornecedor</th>
            <th scope="col" className="p-4">Finalidade</th>
            <th scope="col" className="p-4">Categorias de dados</th>
            <th scope="col" className="p-4">Local de tratamento</th>
          </tr>
        </thead>
        <tbody>
          {subprocessors.map((provider) => (
            <tr key={provider.name} className="border-b border-border last:border-0">
              <th scope="row" className="p-4 align-top font-medium"><a href={provider.source}>{provider.name}</a></th>
              <td className="p-4 align-top text-muted-foreground">{provider.purpose}</td>
              <td className="p-4 align-top text-muted-foreground">{provider.categories}</td>
              <td className="p-4 align-top text-muted-foreground">{provider.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SubprocessorList() {
  return (
    <LegalDocument title="Subprocessadores" description="Quem apoia o serviço, para qual finalidade, com quais dados e em quais locais.">
      <LegalSection title="Fornecedores previstos para o lançamento">
        <p>
          Esta lista cobre fornecedores que operam dados em apoio à ClickStudio,
          tanto no atendimento dos negócios quanto no funcionamento de contas de
          membros. A ClickStudio é operadora dos dados dos contatos e controladora
          dos próprios dados de cadastro, autenticação e cobrança.
        </p>
        <p>
          Apenas Vercel, Neon, Anthropic e Groq recebem conteúdo dos contatos.
          QStash e Ably recebem identificadores nos payloads, Resend recebe os
          dados necessários para e-mails de membros e Sentry recebe diagnósticos
          sem corpos, textos de mensagens ou telefones. Esses serviços também
          podem tratar metadados técnicos necessários à conexão e à segurança.
        </p>
        <SubprocessorTable />
      </LegalSection>
      <LegalSection title="Meta: contratada diretamente pelo negócio">
        <p>
          A Meta fornece WhatsApp Business e Cloud API ao negócio, que mantém sua
          própria conta, termos e forma de pagamento. A Meta não é subprocessadora
          da ClickStudio. Ela trata dados de conta e canal, números e identificadores
          de contatos, mensagens e estados de entrega conforme seus próprios termos
          e infraestrutura internacional. Tarifas são pagas diretamente à Meta.
          Consulte os <a href="https://www.whatsapp.com/legal/business-terms">termos do WhatsApp Business</a>.
        </p>
      </LegalSection>
      <LegalSection title="Retenção e fontes dos fornecedores">
        <p>
          A <Link href="/privacidade">Política de Privacidade</Link> detalha a
          retenção dos dados da plataforma e os padrões publicados pelos
          fornecedores. Os nomes na tabela levam à documentação ou aos termos
          oficiais. Para infraestrutura, consulte também:
        </p>
        <ul>
          {retentionSources.map((source) => (
            <li key={source.href}><a href={source.href}>{source.label}</a></li>
          ))}
        </ul>
        <p>
          Plano e janela efetiva de backup do Neon, retenção de logs de Vercel e
          Sentry e prazos de mensagens, logs e fila de falhas do QStash ainda serão
          confirmados antes do uso de dados reais. Não prometemos exclusão imediata
          de cópias residuais fora dos prazos declarados. A configuração de retenção
          zero da Groq será verificada antes da ativação da transcrição.
        </p>
      </LegalSection>
      <LegalSection title="Transferências e aviso de mudanças">
        <p>
          Há transferência internacional para prestar o serviço. O fundamento e
          as salvaguardas previstos estão no
          <Link href="/termos#dpa"> Acordo de Tratamento de Dados</Link> e dependem
          de revisão jurídica brasileira antes da ativação paga. Esta lista não
          declara que os fornecedores já adotaram as cláusulas-padrão da ANPD.
        </p>
        <p>
          A Anthropic é a provedora de modelo prevista; se a avaliação selecionar
          outra provedora, esta lista, a política e o DPA serão atualizados antes
          de enviar dados a ela. Não há troca automática de provedora durante uma
          conversa. Inclusões ou substituições serão avisadas por e-mail com pelo
          menos 15 dias de antecedência. O negócio pode apresentar objeção e
          cancelar sem multa antes da mudança. Para dúvidas, escreva para
          {" "}<PrivacyContact />.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
