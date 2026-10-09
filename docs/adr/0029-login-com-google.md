# 0029. Login com Google

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0012](0012-autenticacao-organizador.md) e [0016](0016-sessao-bearer.md)

## Contexto

Entrar só por código no e-mail depende da cota da Resend (ADR 0028) e de a mensagem não cair no
spam. A maioria dos organizadores tem conta Google no celular.

## Opções consideradas

1. **Fluxo de redirecionamento OAuth no servidor.** Exige segredo do cliente, `state` guardado e
   uma volta ao site com o token na URL; atrapalha o app instalado (PWA).
2. **Google Identity Services no navegador.** O botão do próprio Google devolve um ID token (JWT
   RS256); a API confere a assinatura com as chaves públicas do Google, o `aud` (nosso client id),
   o `iss`, a validade e o e-mail verificado. Sem segredo no servidor.
3. **Outro provedor de identidade (Auth0, Clerk).** Mais um fornecedor e mais custo para resolver
   um botão.

## Decisão

Opção 2.

- `GOOGLE_CLIENT_ID` liga o recurso; `GET /api/auth/options` conta ao site se o botão aparece.
- `POST /api/auth/google { credential }`: `google.rs` verifica o token com `ring` (já presente via
  rustls), com as chaves em cache pelo tempo que o Google indica e uma nova busca, no máximo por
  minuto, quando aparece uma chave desconhecida.
- A conta é achada pelo `sub` do Google (`users.google_sub`) e, se não houver, pelo e-mail
  verificado: uma conta criada por código passa a aceitar Google. Um e-mail já ligado a outra
  conta Google é recusado (`google_account_mismatch`). E-mail novo cria a conta e a organização,
  com o nome do perfil.
- A CSP libera só `accounts.google.com/gsi/` (script, estilo, iframe e conexão). O script só é
  carregado na página de login.

## Consequências

- Quem troca o e-mail da conta Google continua na mesma conta (o `sub` não muda).
- Bloqueadores que barram o domínio do Google escondem o botão; o código por e-mail continua lá.
- Os testes assinam tokens com uma chave RSA de teste (`tests/fixtures`, feature `test-util`).
