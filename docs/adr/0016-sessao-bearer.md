# 0016. Sessão do painel por token Bearer e links de download assinados

- **Status:** Aceito
- **Data:** 2026-10-08
- **Substitui:** a parte de cookie de [0009](0009-frontend-nextjs-vercel.md) e
  [0012](0012-autenticacao-organizador.md). O login por código de e-mail continua igual.

## Contexto

Os ADRs 0009 e 0012 previam cookie de sessão `HttpOnly; SameSite=Lax` com `ingressoimpresso.com.br`
e `api.ingressoimpresso.com.br` no mesmo *site*. A realidade dos testes é outra:

- o domínio ainda não foi comprado. O painel está em `ingressoimpresso.vercel.app` e a API ficará
  em `*.onrender.com`, que são **sites diferentes**;
- nesse cenário, um cookie `SameSite=Lax` não é enviado nas chamadas `fetch` do painel. Um cookie
  `SameSite=None` é um cookie de terceiro, bloqueado pelo Safari;
- previews de PR da Vercel (`*.vercel.app`) também são sites diferentes da API.

## Opções consideradas

1. **Rewrite da Vercel** (`/api/*` → Render). Tudo vira mesma origem e o cookie volta a
   funcionar. Mas põe a Vercel no caminho de uploads e downloads grandes (ZIP do WhatsApp com mais
   de 100 MB), com limites de proxy pouco documentados, e acrescenta um salto de latência.
2. **Cookie com `SameSite=None; Secure`.** Bloqueado no Safari como cookie de terceiro.
   Inviável.
3. **Token de sessão no cabeçalho `Authorization: Bearer`**, guardado pelo painel, com CORS por
   lista de origens. Funciona com qualquer combinação de domínios, inclusive nos previews, e é
   imune a CSRF. O custo é que o token fica acessível a JavaScript: um XSS poderia roubá-lo.
   Downloads por `<a href>` não enviam cabeçalho, então precisam de outra solução.

## Decisão

Opção 3.

- **Token:** 32 bytes aleatórios em base64url. No banco fica só o `sha256(token)`. Validade de 30
  dias, renovada com o uso, e revogável no logout.
- **Armazenamento no painel:** `localStorage`. Mitigações de XSS:
  - React escapa todo texto por padrão;
  - não renderizamos HTML de usuário;
  - CSP no Next com `connect-src` restrito à própria origem e à API, `img-src` sem domínios de
    terceiros e `frame-ancestors 'none'`. Assim, mesmo um script injetado não consegue enviar o
    token para outro domínio por `fetch` ou por imagem. Por enquanto o `script-src` ainda aceita
    `'unsafe-inline'` (o bootstrap do Next.js); a versão com nonce fica para a fase 8;
  - o token só dá acesso à conta do organizador. Não dá acesso a chaves privadas: a chave mestra
    nunca sai do servidor.
- **CORS:** origens permitidas configuráveis por lista exata (`ALLOWED_ORIGINS`). Sem
  `Allow-Credentials`, porque não há cookies. Previews da Vercel entram na lista só se e quando
  forem necessários.
- **Downloads:**
  1. o painel pede, autenticado, um **link assinado de uso curto**: `POST /api/exports/{id}/link`;
  2. a API responde `/api/downloads/{token}`, com token aleatório guardado como hash e válido por
     10 minutos;
  3. o navegador baixa direto da API, sem passar pela Vercel e sem precisar de cabeçalho.
- **Portaria:** inalterada. Já usava token Bearer de dispositivo (ADR 0007).

## Consequências

- Quando o domínio for comprado, nada muda: o mesmo modelo funciona em `ingressoimpresso.com.br`
  + `api.ingressoimpresso.com.br`.
- O guarda de rotas do painel é no cliente (`GET /api/me`), como já previsto no ADR 0009.
- A CSP do Next.js entra no painel desta fase, porque é a principal defesa do token. Endurecê-la
  com nonce é tarefa da fase 8.
