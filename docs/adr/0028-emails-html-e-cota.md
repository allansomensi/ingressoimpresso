# 0028. E-mails em HTML, cota diária e limite por endereço

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0012](0012-autenticacao-organizador.md) e [0013](0013-infraestrutura-render-neon.md)

## Contexto

O único e-mail do serviço era o código de login, em texto puro. O plano grátis da Resend envia
100 mensagens por dia. Qualquer pessoa podia pedir códigos para centenas de endereços e gastar a
cota inteira: dali em diante ninguém mais entrava. Faltava também avisar quem pagou um lote por
Pix, que confirma minutos depois de a pessoa sair da página.

## Opções consideradas

1. **Biblioteca de templates (MJML, Tera).** Mais uma dependência e um passo de build para dois
   e-mails.
2. **Um layout HTML em tabela, escrito à mão em `emails.rs`**, com texto alternativo, sem fonte
   ou script remoto, e todo texto do usuário escapado.
3. **Limite só por e-mail (o que já existia).** Não segura quem varia o e-mail.

## Decisão

Opção 2, mais limites:

- `emails.rs` monta assunto, texto e HTML do código de login e do "Pagamento confirmado" (lote pago
  pela Stripe, com botão para gerar os arquivos). O `Mailer` envia `text` e `html` à Resend.
- `AppState::send_mail` conta cada mensagem em `mail_sends` (só o tipo, sem endereço nem conteúdo)
  e para de enviar ao chegar a `MAIL_DAILY_LIMIT` em 24 horas (padrão 95; `0` desliga). A API
  responde `mail_quota`, e a tela de login oferece o Google (ADR 0029). Um 429 da Resend dá o mesmo
  código.
- Códigos para e-mails **sem conta** (`signup_code`) usam no máximo dois terços da cota. Quem
  inventa endereços esgota só essa parte; quem já tem conta continua recebendo o código.
- `POST /api/auth/code` aceita no máximo 10 códigos por hora vindos do mesmo IP. O IP é
  `CF-Connecting-IP` (o Render fica atrás da Cloudflare, que sobrescreve esse cabeçalho) ou, na
  falta dele, o primeiro valor de `X-Forwarded-For`. Em produção, um pedido sem nenhum dos dois
  entra num balde comum (`unknown`) em vez de escapar do limite. O IP fica só como HMAC com chave
  derivada da chave mestra (`login_codes.ip_hash`), apagado em menos de 24 horas pela limpeza do
  worker.
- O e-mail de pagamento é "melhor esforço": falha ou cota esgotada só vão para o log.

## Consequências

- Se a API um dia sair de trás da Cloudflare, um cliente pode forjar os cabeçalhos e fugir do
  limite por IP. A cota diária e a reserva para contas existentes continuam valendo, e o Google
  continua funcionando.
- Se o serviço crescer, a cota passa a limitar logins legítimos: trocar de plano na Resend e subir
  `MAIL_DAILY_LIMIT` é configuração, não código.
- Os textos dos e-mails ficam em `emails.rs`, não em `texts.rs`.
