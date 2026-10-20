# 0107. Pronunciamentos também por e-mail

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0038](0038-pronunciamentos-e-notificacoes.md) (pronunciamentos) e
  [0028](0028-emails-html-e-cota.md) (cota diária)

## Contexto

Os pronunciamentos aparecem só para quem abre o painel. Mudança de preço, manutenção e novidades
importantes precisam chegar também a quem não entra há semanas. O plano grátis da Resend manda 100
e-mails por dia, e os códigos de acesso não podem ficar sem cota.

## Decisão

- Um pronunciamento **publicado** pode ser enviado por e-mail a um público: todas as contas,
  responsáveis pelas organizações, clientes que já pagaram, quem entrou nos últimos 90 dias ou
  organizações com uma etiqueta (ADR 0105). O painel mostra antes quantas pessoas recebem, quantas
  pararam de receber e quantas já receberam, e o tempo estimado; há um envio de teste só para o
  admin.
- Cada envio é uma linha em `announcement_mailings` e cada destinatário uma linha em
  `announcement_mail_recipients`, com `unique (announcement_id, user_id)`: ninguém recebe o mesmo
  pronunciamento duas vezes, seja qual for o público escolhido. Um envio por pronunciamento de cada
  vez; o admin pode parar (quem não recebeu fica de fora).
- Um remetente em segundo plano (`mailings::wake`) pega um destinatário por vez com
  `for update skip locked`, manda (tipo `announcement` em `mail_sends`), espera 600 ms e segue. Usa
  só a cota menos uma reserva (um quarto de `MAIL_DAILY_LIMIT`, pelo menos 10) para códigos,
  pagamentos e convites; sem cota, para e o worker o acorda de hora em hora. Um destinatário
  "enviando" há mais de 10 minutos (reinício no meio) vira falha, nunca é reenviado.
- Parar de receber: `users.announcement_emails`. Em **Minha conta** (cartão E-mails), pelo link do
  e-mail (`/descadastrar#token`, sem login) e pelo botão do cliente de e-mail
  (`List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058, em
  `POST /api/email/unsubscribe/{token}`). O token é o id da conta com uma assinatura HMAC derivada
  da chave mestra: só liga e desliga esses e-mails. Códigos, pagamentos e convites chegam sempre.

## Consequências

- Com a cota do plano grátis (95 por dia, 72 para comunicados), mandar para todo mundo pode levar
  dias; o painel mostra o progresso e a estimativa. Aumentar `MAIL_DAILY_LIMIT` com o plano pago
  acelera sem mudar nada no código.
- O link de descadastro leva o token no fragmento, como os outros links privados; o botão de um
  clique leva no caminho, que os logs mascaram (só serve para desligar comunicados).
