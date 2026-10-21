# 0108. Resumo semanal dos admins por e-mail

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0103](0103-alertas-e-resumo-diario-dos-admins.md) (alertas e resumo diário)

## Contexto

O resumo do ADR 0103 sai todo dia, pelos mesmos canais dos alertas (e-mail e Telegram). Para o
tamanho atual da plataforma, um resumo por dia é ruído: os alertas já avisam do que é urgente, e o
resumo serve para ver a semana. Também não havia como escolher a frequência nem separar o canal do
resumo do canal dos alertas.

## Decisão

- `alert_settings` ganha `summary_frequency` (`weekly`, o padrão, ou `daily`), `summary_weekday`
  (1 = segunda … 7 = domingo, padrão segunda) e `summary_telegram` (padrão desligado). A migração
  passa a configuração existente para semanal.
- O resumo vai **sempre por e-mail** para `ADMIN_EMAILS` e, só com `summary_telegram`, também para
  o Telegram. Os interruptores "Por e-mail" e "No Telegram" continuam valendo para os alertas.
- O semanal cobre os últimos 7 dias (cadastros, eventos, lotes, receita, reembolsos, leituras,
  e-mails) e os maiores eventos dos próximos 7 dias; o diário segue com 24 horas. O assunto diz
  "Resumo da semana 14/10/2026 a 21/10/2026".
- O worker continua de hora em hora: o resumo sai no dia da semana e na hora escolhidos (horário de
  Brasília), uma vez por dia no máximo (`alert_digests`). "Enviar resumo agora" manda o da
  frequência configurada.

## Consequências

- Um e-mail por semana para os admins, sem perder o diário para quem quiser.
- O Telegram fica para o que é urgente, salvo pedido.
