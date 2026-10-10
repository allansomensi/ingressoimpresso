# 0047. Blindagem da plataforma: admin com duas etapas, limites por endereço e checagens de produção

- **Status:** Aceito
- **Data:** 2026-10-10

## Contexto

Com dinheiro de verdade passando pela plataforma, uma auditoria de segurança de ponta a ponta
(API, painel, portaria, infraestrutura e CI) apontou brechas que, sozinhas, não derrubavam uma
invariante, mas juntas davam caminhos reais de abuso:

- O admin entra com um código de 6 dígitos por e-mail (ou o Google) e, com isso, marca lotes como
  pagos, estorna e ajusta crédito. Quem tomasse a caixa de e-mail do admin tomava o dinheiro.
- Um link do painel montado por alguém mal-intencionado (`?lote=../admin/batches/<id>/mark-paid?`)
  fazia o navegador do admin, ao abrir a página de lotes, chamar `mark-paid` do lote do atacante:
  o id vindo da URL era colado no caminho da API sem validação.
- Duplicar um evento copiava a arte **sem** a decisão da moderação: uma arte recusada voltava
  como "não verificada" e saía impressa (invariante 12). Excluir o evento ou a conta apagava a
  memória da recusa por hash.
- Os endpoints sem sessão (código de login, verificação, registro da portaria, ingresso digital)
  tinham limites por e-mail ou por conta, mas nenhum por endereço; a contagem de códigos errados
  do segundo passo vivia só em memória e zerava a cada deploy.
- Em produção, chaves de teste da Stripe eram aceitas com um aviso no log (um cartão `4242`
  compraria ingressos assinados), a chave mestra do CI seria aceita, o `PUBLIC_WEB_URL` só era
  conferido com a Stripe ligada e o TLS do banco dependia só da string de conexão.
- O site ia para a Vercel a cada push no `main`, sem esperar o CI; nenhum job vigiava avisos de
  segurança nas dependências.

## Decisão

- **Admin exige verificação em duas etapas (ADR 0045).** `AuthUser.is_admin` só é verdadeiro para
  um e-mail de `ADMIN_EMAILS` **com** `totp_enabled_at`. Sem o segundo passo a conta é um
  organizador comum: sem painel admin, sem modo suporte, sem `mark-paid`. `MeUser` ganha
  `adminPendingTwoFactor`, o painel mostra uma faixa com o atalho para ligar, e as rotas de admin
  respondem `403 admin_two_factor_required` em vez de `forbidden`. Excluir a conta também pede o
  segundo passo quando ele existe (`DeleteAccountBody.twoFactorCode`) e apaga a chave TOTP, os
  códigos de recuperação, notificações, recibos e participações.
- **Códigos errados do segundo passo ficam no banco** (`second_factor_attempts`, 10 em 15 minutos
  por conta), não em memória: um reinício não zera o bloqueio. A linha do usuário é travada com
  `for no key update`, para a contagem fora da transação não esperar o lock.
- **O painel nunca monta um caminho da API com um valor que não validou.** `safePath` em
  `lib/api.ts` recusa `..`, `.`, `//`, `#` e qualquer caminho fora de `/api/`; `isUuid` valida ids
  lidos da URL (`?lote=`, `[id]` das páginas), e o retorno da Stripe só sincroniza um lote que
  está na lista do evento.
- **Limites por endereço** (`ratelimit.rs`, em memória como os cupons, por ser uma instância só):
  código de login 30/15 min, verificação e Google 60/15 min, registro da portaria 60/15 min,
  ingresso digital 600/5 min (uma multidão no portão divide um endereço de operadora) e imagem do
  ingresso 120/5 min. Prévia do ingresso 30/min por pessoa, exportação da conta 5/h, fila de
  arquivos de um evento no máximo 6 pendentes.
- **Moderação acompanha a arte.** Copiar um evento copia `moderation_status` e `uploaded_by`;
  arte recusada não é copiada (`art_rejected`), arte em revisão leva a sinalização junto, arte não
  verificada entra na fila. A recusa fica em `rejected_art` por hash e vale para sempre, mesmo
  depois de apagar o upload, o evento ou a conta; os mesmos bytes em revisão em outro lugar
  respondem `art_under_review`. A faxina dos uploads antigos nunca apaga arte sinalizada ou
  recusada. A decodificação de imagens tem teto de memória (`image::Limits`, 256 MiB; artes até
  24 MP) e a da moderação passa pelos mesmos permits da renderização.
- **Produção recusa o que só serve a testes:** chave mestra do repositório, `sk_test_` sem
  `STRIPE_ALLOW_TEST_MODE=true` (o staging tem a variável no `render.yaml`), `PUBLIC_WEB_URL`
  sem `https://`; a conexão com o banco é forçada a `verify-full` seja qual for a string.
- **Cabeçalhos e tempo de resposta na API:** `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` quando o
  handler não disse outra coisa, HSTS (`includeSubDomains; preload`) em produção; tempo máximo de
  90 s por requisição (o corpo pode continuar sendo transmitido). O site também manda HSTS.
- **Entradas de uma linha:** nomes de evento, local, vendedor, telefone, rótulo de link da
  portaria, nome do celular, portador do ingresso e organização não aceitam caracteres de
  controle (quebras de linha incluídas). Números de ingresso digital respeitam
  `MAX_TICKET_NUMBER`. Mensagens do banco (nomes de constraints) não chegam ao cliente.
- **CI e deploy:** o **Deploy web** só roda depois de um **CI** verde no commit (`workflow_run`),
  como o Render já faz; o job **Dependency audit** roda `cargo audit` e `pnpm audit --prod`; o
  Dependabot propõe atualizações semanais de actions, Cargo, npm e Docker; `render.yaml` fixa
  `numInstances: 1` (as travas de pagamento e o worker vivem no processo).

## Alternativas

- **Passkeys para o admin:** mais fortes que TOTP, mas um ADR próprio (WebAuthn no painel e na
  API). O TOTP já existia (ADR 0045) e bastava torná-lo obrigatório para quem mexe no dinheiro.
- **Limites por endereço num serviço externo (Cloudflare rate limiting):** mais robusto a vários
  instâncias, mas depende de configuração fora do repositório. Como a API é uma instância só,
  a contagem em memória resolve e fica versionada com o código.
- **CSP com nonce no site:** tira o `'unsafe-inline'` e protege o token da sessão contra um XSS
  futuro. Exige `proxy.ts` e páginas dinâmicas; feito em seguida, na ADR 0048.
- **Pinar as actions por SHA:** recomendado; o Dependabot de `github-actions` mantém os pins.
  Fica para quando houver como conferir os SHAs com calma.

## Consequências

- Quem está em `ADMIN_EMAILS` precisa ligar a verificação em duas etapas antes de voltar a usar
  o admin (o painel avisa e o `docs/deploy.md` §8 explica). O e2e e o harness de testes ligam o
  segundo passo para o admin sozinhos.
- Novas variáveis: `STRIPE_ALLOW_TEST_MODE` (só no staging ou num ensaio de produção).
- O site deixa de publicar antes do CI: um push no `main` leva alguns minutos a mais para ir ao
  ar, e um CI vermelho segura o site e a API juntos.
- Ficam para o mantenedor (fora do repositório): rulesets de `main` e `staging`, Environments do
  GitHub para os secrets de deploy e backup, Dependabot alerts, uma chave da Resend separada para
  o staging e o `sslmode=verify-full` na URL do backup (`docs/deploy.md` §7, §9 e §11.4).
