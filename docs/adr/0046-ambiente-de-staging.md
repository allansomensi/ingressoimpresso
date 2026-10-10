# 0046. Ambiente de staging

- **Status:** Aceito
- **Data:** 2026-10-10

## Contexto

Até aqui só existia a produção: uma novidade ia direto do branch de trabalho para o `main`, e o
primeiro lugar onde rodava de verdade (com Neon, Render, Vercel, Resend, Stripe e Google) era o
site usado pelos organizadores. As migrações do banco também rodavam pela primeira vez lá.

## Decisão

- Um branch **`staging`** publica um ambiente completo e separado; o `main` continua sendo a
  produção. O caminho de uma novidade passa a ser: branch → `staging` → testes → `main`.
- **API:** um segundo serviço no mesmo Blueprint (`ingressoimpresso-api-staging`), a mesma imagem
  Docker, plano grátis do Render (dorme quando parado), `autoDeployTrigger: checksPass`. Endereço
  `api-staging.<domínio>`.
- **Banco:** um branch do Neon sem dados de produção (schema only) com um banco vazio, onde a API
  cria as tabelas. Nenhum dado pessoal real vai para os testes.
- **Site:** o mesmo projeto da Vercel. O **Deploy web** publica o `staging` como preview, com as
  variáveis de Preview do branch `staging` (`vercel pull --git-branch=staging`), e dá a ele o
  endereço fixo `staging.<domínio>`.
- **Chaves separadas:** chave mestra própria, Stripe em modo de teste, Turnstile e Google com o
  hostname de staging liberado. O `MAIL_DAILY_LIMIT` do staging é 15, e o da produção cai para 85
  para os dois caberem nos 100 e-mails por dia da Resend.
- **Sem confusão:** com `NEXT_PUBLIC_ENVIRONMENT=staging`, o site mostra o selo "Ambiente de
  testes" em toda página e pede para não ser indexado (`robots` e meta `noindex`).
- O CI roda nos pushes de `main` e de `staging`.

## Alternativas

- **Previews por pull request** (um ambiente por branch): cada um precisaria de banco e API
  próprios; caro e lento com a API em Rust.
- **Projeto separado na Vercel:** isola melhor as variáveis, mas duplica a configuração; as
  variáveis de Preview por branch resolvem com um projeto só.
- **Staging no plano pago do Render:** sem o atraso do primeiro acesso, por US$ 7 por mês. Dá para
  trocar depois mudando `plan` no `render.yaml`.

## Consequências

- Um ambiente a mais para manter: as variáveis novas da API precisam ir para os dois serviços.
- O staging não tem backup diário: os dados são de teste.
- A primeira requisição depois de um tempo parado demora cerca de um minuto (plano grátis).
