# 0044. Verificação anti-robô antes do código por e-mail

- **Status:** Aceito
- **Data:** 2026-10-10

## Contexto

O plano grátis da Resend envia 100 e-mails por dia, e `MAIL_DAILY_LIMIT` (ADR 0028) para em 95.
Pedir um código não exige conta, então um script com vários IPs pode gastar a cota do dia em
minutos. Quem já tem conta ainda entra com o Google, mas quem só usa o código fica sem entrar até o
dia virar. O limite por IP (10 por hora) e a reserva de um terço da cota para contas existentes
reduzem o estrago, mas não o evitam.

## Decisão

- Antes de enviar o código, a API exige um token do **Cloudflare Turnstile** e o confere em
  `siteverify`. O Turnstile é gratuito, sem limite de verificações, e na maioria das vezes não pede
  nada à pessoa: o widget fica invisível (`appearance: interaction-only`) e só aparece quando o
  Cloudflare quer um clique.
- Só `POST /api/auth/code` passa pela verificação: é o único pedido sem login que envia e-mail.
  Conferir o código e entrar com o Google não mandam e-mail.
- Ligado por `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` (as duas ou nenhuma).
  `GET /api/auth/options` entrega a chave pública ao site. Sem as variáveis, nada muda.
- Cada token vale uma vez. O site pede um novo depois de cada envio, para o "Reenviar código".
- Um token ausente, vencido, repetido ou forjado recebe `403 captcha_failed`. Se o Cloudflare não
  responder, ou recusar a nossa chave secreta, o código é enviado mesmo assim e o erro vai para o
  log: os limites por IP e diário continuam valendo, e uma queda do Cloudflare não tranca o login.
- A CSP libera `challenges.cloudflare.com` em `script-src` e `frame-src`, só para isso.

## Alternativas

- **reCAPTCHA (Google) ou hCaptcha:** pedem mais cliques e, no caso do reCAPTCHA, enviam mais dados
  de navegação ao Google.
- **Só limites por IP:** já existem; um atacante com muitos IPs passa por eles.
- **Exigir o Google para criar conta:** afasta quem não tem conta Google.

## Consequências

- O Cloudflare passa a tratar o IP e sinais do navegador de quem pede um código. A Política de
  Privacidade cita o Cloudflare, e `TERMS_VERSION` mudou.
- Um bloqueador de anúncios que barre o Cloudflare impede o código por e-mail. A página avisa e
  sugere o Google.
- Na portaria e no ingresso digital nada muda.
