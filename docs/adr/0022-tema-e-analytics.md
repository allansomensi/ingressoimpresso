# 0022. Tema escolhido pelo usuário e Vercel Web Analytics

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0021](0021-interface-e-pwa.md)

## Contexto

O ADR 0021 fez o modo escuro seguir só o sistema operacional, e os toasts ficavam sempre claros.
Quem usa o painel à noite, na porta, quer escolher o tema. Para lançar, também precisamos saber
de onde vêm e por onde andam os visitantes, sem ferir a privacidade nem a portaria offline.

## Opções consideradas

1. **Tema:** `next-themes` (mais uma dependência, faz o mesmo que ~80 linhas nossas) ou um script
   nosso que aplica `data-theme` no `<html>` antes da primeira pintura.
2. **Métricas:** Vercel Web Analytics (sem cookies, agregado, já incluso no plano Pro, servido pela
   nossa origem em `/_vercel/insights`), Google Analytics (cookies, banner de consentimento e
   script de terceiros na CSP) ou Plausible (outro fornecedor e outro custo).

## Decisão

- **Tema:** claro, escuro ou sistema, guardado no `localStorage` (`ingressoimpresso.theme`). Um
  script inline em `<head>` (`src/lib/theme-script.ts`) aplica `data-theme` antes da pintura, sem
  piscar; `useTheme` (`src/lib/theme.ts`) troca e acompanha o sistema e as outras abas. Os tokens
  escuros ficam em `[data-theme="dark"]`, a variante `dark:` do Tailwind segue o mesmo atributo,
  e os toasts recebem o tema atual. A portaria é sempre escura.
- **Métricas:** `@vercel/analytics` no layout raiz, **fora da portaria** (ela precisa abrir offline
  e guarda no cache tudo o que a página carrega). Cada evento sai só com a origem e o caminho: sem
  query string (ids de lote) e sem fragmento (o token da portaria, invariante 7).

## Consequências

- O seletor de tema aparece no cabeçalho do site, no login e no menu da conta.
- Sem JavaScript, o site fica no tema claro.
- As métricas só funcionam no deploy da Vercel com Web Analytics ligado no projeto. Fora dela
  (`next start` local, e2e), o script não existe e nada é enviado.
