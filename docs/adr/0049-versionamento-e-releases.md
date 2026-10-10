# 0049. Versionamento semântico, releases e branches

- **Status:** Aceito
- **Data:** 2026-10-10

## Contexto

O produto está em produção, mas nada tinha número: todos os manifestos diziam `0.1.0`, não havia
tags nem histórico de versões, e quem abria o site não tinha como saber se estava na versão mais
nova (o service worker do painel e da portaria guarda páginas). As Novidades (ADR 0031) contavam o
que mudou, mas soltas no tempo, sem dizer a qual entrega cada nota pertence. E o repositório
acumulava branches de trabalho já integrados, quando os únicos permanentes são `main` (produção) e
`staging` (testes, ADR 0046).

## Opções consideradas

1. **Versão por pacote** (API, site e crates com números próprios): cada parte evolui no seu
   ritmo, mas ninguém de fora sabe qual combinação está no ar, e o site e a API são publicados
   juntos pelo mesmo CI.
2. **Release automatizado pelos commits** (release-please, semantic-release): calcula a versão e
   escreve o changelog a partir dos Conventional Commits. Abre os PRs de release contra o `main`,
   o que obriga a trazer o `main` de volta para o `staging` a cada versão, e o texto sai técnico
   (assuntos de commit em inglês) para um changelog em português.
3. **Uma versão do produto, cortada à mão no `staging` com um script, e tag criada pelo CI quando
   chega ao `main`.**

## Decisão

Opção 3.

- **Uma versão para tudo**, em [Versionamento Semântico](https://semver.org/lang/pt-BR/)
  `MAJOR.MINOR.PATCH`: `[workspace.package]` do `Cargo.toml` (e o `Cargo.lock`) e todos os
  `package.json`. `scripts/release.mjs check` (em `just check` e no CI) recusa números diferentes.
  A primeira versão numerada é a **1.0.0**: o que já estava em produção.
- **O que cada parte significa** para um SaaS: MAJOR quando algo de que as pessoas dependem deixa
  de funcionar do jeito antigo (um novo formato de QR, a retirada de um recurso, uma mudança que
  exige ação do organizador); MINOR para recurso novo; PATCH para correções e ajustes sem recurso
  novo. A versão do formato do QR (`v1`, invariante 1) é independente.
- **`CHANGELOG.md`** na raiz, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
  em português, com as seções Adicionado, Alterado, Obsoleto, Removido, Corrigido e Segurança.
  Cada pull request com mudança perceptível acrescenta sua linha em **Não lançado**.
- **Cortar uma versão:** no `staging`, `just release <major|minor|patch>` move o que está em Não
  lançado para a versão nova com a data do dia e atualiza todos os manifestos; o commit é
  `chore(release): 🔖 vX.Y.Z`. Depois, o PR do `staging` para o `main`.
- **Tag e GitHub Release pelo CI:** no push do `main`, depois de todos os checks e do deploy do
  site, o job **Release** cria a tag `vX.Y.Z` no commit e a release com as notas daquela versão
  do `CHANGELOG.md`. Se a tag já existe, não faz nada: só um push que muda a versão gera release.
- **A versão aparece para quem usa:** no rodapé do site (com o commit no staging), no menu da conta
  do painel, na página de status (site e API, que responde `version` em `GET /api/status`) e no
  log de início da API. O número do site vem do `package.json` no build (`next.config.ts`).
- **Novidades por versão** (complementa o ADR 0031): `changelog_entries.version` (opcional, no
  formato `1.4.0`). A página `/novidades` agrupa as notas por versão, com âncora `#v1.4.0` (o link
  do rodapé leva às notas da versão em uso) e o selo "Versão atual"; notas sem versão continuam
  agrupadas por mês. O formulário do admin já sugere a versão em uso. As notas publicadas antes
  desta decisão ficam na 1.0.0. O `CHANGELOG.md` é o registro técnico completo; as Novidades são
  o resumo para o organizador, escrito pelo admin.
- **Branches:** só `main` e `staging` são permanentes. O workflow **Branches** apaga o branch de
  um PR assim que ele é integrado (nunca `main`, `staging` ou um branch com outro PR aberto) e,
  rodado à mão, lista ou apaga os branches já contidos no `main`.

## Consequências

- Toda versão em produção tem tag, release com notas e link de comparação com a anterior.
- Cortar a versão é um passo consciente de quem integra o `staging`; esquecer de cortar só adia a
  tag (o CI não cria release sem mudança de versão).
- Uma correção urgente direto no `main` (hotfix) corta um PATCH no próprio branch e precisa voltar
  para o `staging` depois (`docs/versionamento.md`).
- O `CHANGELOG.md` muda em quase todo PR: conflitos nessa seção se resolvem mantendo as duas
  linhas.
- Uma regra de tags no GitHub (ruleset) precisa liberar o GitHub Actions para criar `v*`.
