export function WhatsAppInstructions() {
  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>
        Conecte o número que você já usa no app WhatsApp Business. Você poderá continuar usando o
        app. Cada negócio pode conectar um único Canal.
      </p>
      <ol className="flex list-decimal flex-col gap-3 pl-5">
        <li>
          Tenha o celular por perto e acesso de administrador ao portfólio empresarial na Meta.
          Selecione a opção de conectar seu WhatsApp Business existente e confirme a conexão pelo
          celular.
        </li>
        <li>
          Autorize o gerenciamento da conta do WhatsApp Business e o envio e recebimento de
          mensagens. Esses acessos são necessários para conectar e operar seu Canal.
        </li>
        <li>
          Cadastre uma forma de pagamento na sua própria conta do WhatsApp Business, no Gerenciador
          do WhatsApp da Meta. As cobranças de uso da Meta são pagas diretamente por você,
          separadamente da assinatura do ClickStudio Bots.
        </li>
        <li>
          Desative as mensagens automáticas de saudação e de ausência no app WhatsApp Business para
          evitar respostas duplicadas.
        </li>
      </ol>
      <p>
        Respostas enviadas pelos apps para Windows ou WearOS não chegam à plataforma e não pausam o
        Bot. Use o painel ou o app no celular quando precisar assumir uma conversa.
      </p>
      <p>Após a conexão, o Bot permanece desligado até você concluir a configuração e ativá-lo.</p>
    </div>
  );
}
