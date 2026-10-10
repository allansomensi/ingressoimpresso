# Versões, changelog e releases

Como o Ingresso Impresso numera as versões, registra o que mudou e publica uma release. A decisão
está no [ADR 0049](adr/0049-versionamento-e-releases.md).

## Resumo

- **Uma versão para o produto inteiro** (API, site, portaria e ferramentas), no formato
  `MAJOR.MINOR.PATCH` do [Versionamento Semântico](https://semver.org/lang/pt-BR/).
- **[`CHANGELOG.md`](../CHANGELOG.md)** registra tudo o que mudou, versão por versão.
- **Tags `vX.Y.Z`** e **GitHub Releases** são criadas pelo CI quando a versão chega ao `main`.
- **Branches:** só `main` (produção) e `staging` (testes) são permanentes.
- A versão em uso aparece no **rodapé do site**, no **menu da conta** do painel e na
  **[página de status](https://ingressoimpresso.com.br/status)** (site e API).

## Qual número subir

| Parte | Quando | Exemplos |
|---|---|---|
| **MAJOR** (`2.0.0`) | Algo de que as pessoas dependem deixa de funcionar como antes, ou exige ação delas | novo formato de QR (`v2`), retirada de um recurso, mudança que pede para reimprimir ou reconfigurar |
| **MINOR** (`1.5.0`) | Recurso novo, sem quebrar o que existe | nova aba no painel, novo modelo de ingresso, novo meio de pagamento |
| **PATCH** (`1.4.1`) | Correção ou ajuste, sem recurso novo | bug na portaria, texto errado, atualização de dependência com correção de segurança |

Na dúvida entre MINOR e PATCH, pergunte: "um organizador ganhou algo que não tinha?". Se sim, é
MINOR. A versão do **formato do QR** (`v1`) é outra coisa: só muda com um ADR (invariante 1) e,
quando mudar, o produto sobe de MAJOR.

## Escrevendo o changelog

Todo pull request com mudança que alguém percebe (organizador, público, portaria ou quem opera a
plataforma) acrescenta uma linha em **`## [Não lançado]`**, na seção certa:

| Seção | Para |
|---|---|
| `### Adicionado` | recursos novos |
| `### Alterado` | mudanças em algo que já existia |
| `### Obsoleto` | o que vai sair numa próxima versão |
| `### Removido` | o que saiu |
| `### Corrigido` | correções de problemas |
| `### Segurança` | correções e reforços de segurança |

Regras:

- Em português, do ponto de vista de quem usa: "A portaria mantém a lanterna acesa depois de uma
  leitura com erro", e não "fix torch state in camera.ts".
- Uma linha por mudança; cite o ADR quando houver.
- Refatoração, testes e CI sem efeito para ninguém não entram.
- Não edite as versões já lançadas, só **Não lançado**.

`just release-check` (parte de `just check`) confere o formato: seções conhecidas, versões em
ordem, datas e links no fim do arquivo. Se só os links estiverem fora de ordem,
`node scripts/release.mjs format` reescreve o arquivo no formato canônico.

## Lançando uma versão

O caminho de uma novidade continua sendo branch → `staging` → `main` (ADR 0046). A versão é
cortada no `staging`, depois de testada lá:

1. Atualize o `staging` local e confira **Não lançado** no `CHANGELOG.md`.
2. Corte a versão (escolha a parte pela tabela acima):

   ```sh
   just release minor        # ou major, patch, ou um número exato: just release 1.5.0
   ```

   O script move o que estava em Não lançado para `## [1.5.0] - <data de hoje>`, atualiza os links
   de comparação e sobe a versão em todos os manifestos (`Cargo.toml`, `Cargo.lock` e os
   `package.json`).
3. Revise o diff, rode `just` e faça o commit:

   ```sh
   git commit -am "chore(release): 🔖 v1.5.0"
   ```

4. Envie para o `staging` (por PR, como sempre) e espere o CI e o ambiente de testes.
5. Abra o PR do `staging` para o `main`, com o título `release: v1.5.0` e as notas da versão
   (`just release-notes`) na descrição.
6. Com o PR integrado, o CI do `main` roda os checks, publica o site e, no fim, o job **Release**
   cria a tag `v1.5.0` e a [GitHub Release](https://github.com/allansomensi/ingressoimpresso/releases)
   com as notas do `CHANGELOG.md`. A API sobe no Render com o mesmo commit.
7. No painel de admin, em **Novidades**, publique o resumo para os organizadores. O formulário já
   sugere a versão em uso; a página `/novidades` agrupa as notas por versão.

Nem todo push no `main` vira release: o job **Release** só age quando a tag da versão ainda não
existe. Para publicar, corte a versão.

### Correção urgente (hotfix)

Quando um problema em produção não pode esperar o que já está no `staging`:

1. Crie um branch a partir do `main` (`fix/...`), corrija, registre em **Não lançado** e rode
   `just release patch`.
2. Abra o PR direto para o `main`. Com ele integrado, o CI cria a tag do PATCH.
3. Traga a correção para o `staging` com um PR do `main` para o `staging`. No `CHANGELOG.md`,
   mantenha as duas coisas: a versão nova e o que já estava em Não lançado.

## Onde a versão aparece

| Lugar | O que mostra | De onde vem |
|---|---|---|
| Rodapé do site | `v1.5.0` (no staging, `v1.5.0 · <commit>`), com link para as notas da versão | `package.json` do site, no build (`next.config.ts`) |
| Menu da conta, no painel | `Ingresso Impresso v1.5.0` | o mesmo |
| `/status` | versão do site e da API | `GET /api/status` → `version` |
| `/novidades` | notas agrupadas por versão, âncora `#v1.5.0`, selo "Versão atual" | `changelog_entries.version` |
| Log da API | `listening ... version=1.5.0` | `CARGO_PKG_VERSION` |
| `ii --version` | a versão das ferramentas | `CARGO_PKG_VERSION` |

Se o rodapé mostra uma versão mais antiga que a última release, o navegador está com uma página
guardada: recarregar resolve.

## Branches

- **`main`**: produção. Só recebe PRs do `staging` (e hotfixes).
- **`staging`**: ambiente de testes. Recebe os PRs dos branches de trabalho.
- **Branches de trabalho** (`feat/...`, `fix/...`, os do Dependabot e os das sessões do Claude):
  vivem só enquanto o PR está aberto. O workflow **Branches** apaga o branch assim que o PR é
  integrado. Ele nunca toca em `main`, `staging`, num branch de fork ou num branch que ainda tem
  outro PR aberto.
- **Limpeza geral:** em **Actions** → **Branches** → **Run workflow**, sem marcar nada, o workflow
  só lista os branches já contidos no `main`; marcando **Delete the merged branches**, apaga
  esses. Branches com trabalho que não está no `main` nunca são apagados por ele.

No GitHub, mantenha `main` e `staging` protegidos contra exclusão (ruleset com **Restrict
deletions**). Se houver um ruleset de **tags**, libere o GitHub Actions para criar `v*`, senão o
job **Release** falha.
