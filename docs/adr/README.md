# Architecture Decision Records

Cada decisão relevante fica registrada aqui: o contexto, as alternativas consideradas, a escolha
feita e as consequências.

- Numeração sequencial (`NNNN-titulo.md`). Um ADR aceito não é reescrito: uma decisão nova o
  **substitui** e os dois apontam um para o outro.
- Status possíveis: `Proposto`, `Aceito`, `Substituído por NNNN`, `Rejeitado`.
- Use o [modelo](0000-modelo.md).

| ADR | Título | Status |
|---|---|---|
| [0001](0001-monorepo.md) | Monorepo com Cargo + pnpm workspaces e `just` | Aceito |
| [0002](0002-nucleo-rust-wasm.md) | Núcleo do ingresso em Rust puro, compartilhado via WASM | Aceito |
| [0003](0003-formato-qr-v1.md) | Formato do QR v1: binário fixo + base45 alfanumérico | Aceito |
| [0004](0004-assinatura-ed25519.md) | Assinatura Ed25519 com chave por evento | Aceito |
| [0005](0005-custodia-chaves.md) | Custódia das chaves privadas | Aceito |
| [0006](0006-portaria-offline-sync.md) | Portaria offline-first e sincronização | Aceito |
| [0007](0007-acesso-portaria.md) | Acesso da portaria sem login | Aceito |
| [0008](0008-geracao-arquivos-typst.md) | Geração de arquivos com Typst embutido | Aceito |
| [0009](0009-frontend-nextjs-vercel.md) | Frontend Next.js na Vercel, API Rust em outro domínio | Aceito (cookie substituído por 0016) |
| [0010](0010-leitura-qr-navegador.md) | Leitura de QR no navegador com zxing-wasm | Aceito |
| [0011](0011-modelo-dados-faixas.md) | Modelo de dados baseado em faixas | Aceito |
| [0012](0012-autenticacao-organizador.md) | Login do organizador por código via e-mail | Aceito (sessão por cookie substituída por 0016) |
| [0013](0013-infraestrutura-render-neon.md) | Infraestrutura: Render + Neon + Resend | Aceito (deploy e backup substituídos por 0019) |
| [0014](0014-pagamento-pix-adiado.md) | Pagamento Pix adiado para depois do MVP | Substituído por 0020 |
| [0015](0015-renderizacao-em-blocos.md) | Renderização em blocos, sangria nativa e JPEG para WhatsApp | Aceito (junção e folha de controle substituídas por 0017) |
| [0016](0016-sessao-bearer.md) | Sessão do painel por token Bearer e links de download assinados | Aceito |
| [0017](0017-juncao-pdf-e-sangria.md) | Junção de PDFs com objetos compartilhados, BleedBox e folha de controle em blocos | Aceito |
| [0018](0018-portaria-pwa.md) | Portaria no navegador: service worker, WebAssembly e regras da leitura | Aceito |
| [0019](0019-deploy-dominio-proprio.md) | Deploy com domínio próprio: imagem no Render, banco que dorme e configuração explícita | Aceito |
| [0020](0020-pagamento-stripe.md) | Pagamento dos lotes com Stripe Checkout | Aceito |
| [0021](0021-interface-e-pwa.md) | Identidade visual, sistema de design e painel instalável (PWA) | Aceito |
