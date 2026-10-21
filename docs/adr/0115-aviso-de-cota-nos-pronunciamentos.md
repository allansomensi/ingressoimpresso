# 0115. Aviso de cota antes de mandar um pronunciamento por e-mail

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0107](0107-pronunciamentos-por-email.md) (pronunciamentos por e-mail) e
  [0109](0109-canais-dos-pronunciamentos.md) (canais)

## Contexto

O envio de comunicados respeita a cota diária (`MAIL_DAILY_LIMIT`): usa só a parte que sobra
depois da reserva para códigos de acesso, convites e avisos de pagamento, e o resto espera os
próximos dias. O painel mostrava só "Leva cerca de N dias". Quem manda não via que, enquanto o envio
durar, a cota fica no limite todos os dias, e que um pico de logins pode esgotar a reserva.

## Decisão

- `AnnouncementAudienceDto` passa a dizer onde a cota está: `dailyLimit`, `reserve`,
  `sentLastDay` (e-mails das últimas 24 horas, de todo tipo) e `queued` (comunicados de outros
  envios ainda na fila, que saem antes). `GET /api/admin/mailings/estimate?audience=&tag=` dá os
  mesmos números para um pronunciamento ainda não salvo.
- `lib/mail-quota.ts` (`mailOutlook`, testado) calcula quantos saem nas próximas 24 horas, em
  quantos dias o resto sai e o que sobra para o resto dos e-mails, e classifica:
  - **cabe**: uma linha com o uso das últimas 24 horas e o que sobra;
  - **quase esgota** (passa de 80% da parte dos comunicados): aviso amarelo com o que sobra e o
    risco;
  - **passa da cota**: aviso vermelho com quantos saem hoje, em quantos dias termina, a reserva que
    sobra por dia e o que acontece se ela acabar (login por código só pelo Google, convites e avisos
    de pagamento esperando a cota voltar), e uma caixa "Entendi as consequências" que precisa ser
    marcada para enviar.
- O aviso aparece no envio manual (diálogo do e-mail) e no formulário do pronunciamento com o canal
  e-mail ligado (com a observação de que os números são de agora, e o e-mail sai quando o
  pronunciamento começa). Sem `MAIL_DAILY_LIMIT` não há aviso.

## Consequências

- Quem manda vê o custo antes de mandar; o servidor não muda o ritmo do envio nem a reserva.
