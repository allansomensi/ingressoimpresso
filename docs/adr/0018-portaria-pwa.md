# 0018. Portaria no navegador: service worker, WebAssembly e regras da leitura

- **Status:** Aceito
- **Data:** 2026-10-08
- **Complementa:** [0006](0006-portaria-offline-sync.md), [0007](0007-acesso-portaria.md),
  [0009](0009-frontend-nextjs-vercel.md) e [0010](0010-leitura-qr-navegador.md). Registra como a
  fase 4 implementou o que esses ADRs deixaram em aberto.

## Contexto

Os ADRs da portaria fixaram o modelo (decisão local, log G-Set, confirmação online, acesso por
link), mas deixaram detalhes para a implementação:

- o ADR 0009 previa avaliar o Serwist ou escrever um service worker à mão, com a lista de
  precache gerada no build;
- faltava definir como os arquivos WebAssembly chegam à nossa origem (invariante 8);
- a releitura do mesmo QR e a espera pela confirmação online precisavam de regras exatas.


## Opções consideradas

**Service worker:**

1. **Serwist.** A integração com o Next usa um plugin de webpack, e o build do Next.js 16 é com
   Turbopack.
2. **SW à mão com lista de precache gerada no build.** Exige um passo extra que leia o manifesto
   de build do Next, cujo formato muda entre versões.
3. **SW à mão que guarda o que a página carregou.** Depois de abrir, a página manda ao SW a lista
   dos recursos da própria origem que usou (`performance.getEntriesByType("resource")`), e o SW
   guarda o que faltar. Não depende do formato interno do build.

**WebAssembly:**

1. **Copiar os `.wasm` para `public/`** com um script, mais um nome versionado à mão.
2. **`new URL("…wasm", import.meta.url)`.** O Turbopack emite o arquivo em
   `/_next/static/media/` com hash no nome. É a nossa origem, e o arquivo pode ficar em cache para
   sempre.

## Decisão

- **Service worker** escrito à mão em `/portaria-sw.js`, com escopo `/portaria` (sem barra, a rota
  do Next). Regras:
  - arquivos de `/_next/static/` (com hash): cache primeiro;
  - a página: rede primeiro, com 3 s de limite, e cache como reserva;
  - a lista de prontidão só marca "app salvo" quando o SW confirma que todos os recursos da página
    estão no cache. A página manda a lista de novo depois de abrir a câmera, quando o leitor já
    carregou;
  - a API fica em outra origem e nunca é guardada.
- **WebAssembly** do `ticket-core` e do zxing referenciados por `new URL(…, import.meta.url)`
  (opção 2). A CSP ganha `'wasm-unsafe-eval'`; `eval` continua bloqueado.
- **Link de acesso:** `/portaria#acesso=<token>`, sem barra antes do `#` para evitar o
  redirecionamento do Next. O token é removido da barra de endereço depois do registro.
- **Releitura:** o mesmo texto lido de novo em até 5 s **desde a última vez em que a câmera o viu**
  reexibe o resultado anterior, sem som e sem nova leitura. A janela desliza enquanto o QR fica na
  frente da câmera. Para conferir o mesmo ingresso de novo, tire-o da frente por 5 s.
- **Confirmação online:** só para uma entrada aceita localmente, com o último sync bem-sucedido há
  menos de 10 s. A tela mostra "Conferindo…" por no máximo 1,2 s. A resposta do servidor só pode
  endurecer o resultado (já entrou ou cancelado), nunca liberar o que a portaria negou. Três
  estouros seguidos suspendem a confirmação por 30 s.
- **Classificação no servidor:** mesma precedência da portaria (cancelado > já entrou > entra). A
  primeira entrada é a primeira a chegar ao servidor. Nos celulares, o `DoorCore` converge para a
  mais antiga pelo relógio corrigido; as duas só divergem em corridas offline, que o relatório
  marca como duplicadas.
- **Cursor do manifesto:** o `xmin` do snapshot é do cluster inteiro. Uma transação de escrita
  longa no banco atrasa a sincronização até terminar, e a API não abre nenhuma. O teste do cursor
  roda num binário próprio, porque segura uma transação aberta.

## Consequências

- O app abre sem rede depois de uma visita completa com sinal. A lista de prontidão mostra se
  isso já aconteceu.
- Arquivos com hash de deploys antigos se acumulam no cache até o SW mudar de versão (`CACHE` em
  `portaria-sw.js`). São poucos megabytes; uma limpeza por idade pode vir depois.
- O teste ponta a ponta (`just e2e`, também no CI) usa cinco Chromium com câmera falsa: detecção
  de cópia online, abertura e decisão offline, sincronização e convergência.
