# 0103. Alertas e resumo diário dos admins

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0041](0041-registro-de-emails.md) (registro de e-mails) e
  [0043](0043-pagina-de-status.md) (status)

## Contexto

Os problemas que custam dinheiro ou um evento apareciam só quando alguém olhava o painel: o webhook
da Stripe recusado, um arquivo que falhou em todas as tentativas, a cota de e-mails no fim (e com
ela os códigos de acesso), um evento grande começando sem link da portaria, uma rajada de erros da
API. Os admins precisam saber disso na hora, no celular, sem abrir o painel.

## Decisão

- Tabela `admin_alerts` com tipo, chave, gravidade (`warning`/`critical`), título, detalhe, link,
  contagem e datas. Um alerta aberto por chave (índice único parcial): o mesmo problema de novo
  soma `count` e não avisa outra vez; resolvido, a próxima ocorrência abre outro.
- Avisos por e-mail (para `ADMIN_EMAILS`, tipo `alert` em `mail_sends`) e, quando
  `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` existem (os dois ou nenhum), por Telegram. Os canais
  ligam e desligam em `alert_settings`, linha única.
- Origens: assinatura do webhook recusada (`warning`) ou processamento com erro (`critical`);
  arquivo esgotou as tentativas; cota de e-mail em 80% e cheia (o próprio alerta não conta para
  disparar outro); 10 respostas 500 em 5 minutos (middleware `watch_errors`); evento que começa em
  até 2 horas com pelo menos `door_min_tickets` ingressos pagos e nenhum link da portaria
  (checado pelo worker a cada hora); contestação de pagamento (ADR 0104).
- Resumo diário na hora escolhida (horário de Brasília, padrão 8h): cadastros, lotes, receita,
  e-mails, leituras na porta, alertas e contestações abertas e os eventos grandes das próximas
  48 horas. `alert_digests` guarda o dia para não mandar duas vezes; o painel manda um agora.
- Seção **Alertas** no admin (visão geral), com marca de abertos, teste dos canais e resolver.

## Consequências

- Sem Telegram, só e-mail, que também gasta a cota; por isso os alertas são poucos (um por chave)
  e a cota cheia é avisada antes de acabar.
- O contador de erros vive na memória da instância (a API roda em uma só, ADR 0013).
