# Architecture Decision Records

Cada decisão relevante fica registrada aqui: o contexto, as alternativas consideradas, a escolha
feita e as consequências.

- Numeração sequencial (`NNNN-titulo.md`). Um ADR aceito não é reescrito: uma decisão nova o
  **substitui** e os dois apontam um para o outro.
- Status possíveis: `Proposto`, `Aceito`, `Substituído por NNNN`, `Rejeitado`.
- Use o [modelo](0000-modelo.md).

| ADR | Título | Status |
|---|---|---|
| [0001](0001-monorepo.md) | Monorepo com Cargo + npm workspaces e `just` | Proposto |
| [0002](0002-nucleo-rust-wasm.md) | Núcleo do ingresso em Rust puro, compartilhado via WASM | Proposto |
| [0003](0003-formato-qr-v1.md) | Formato do QR v1: binário fixo + base45 alfanumérico | Proposto |
| [0004](0004-assinatura-ed25519.md) | Assinatura Ed25519 com chave por evento | Proposto |
| [0005](0005-custodia-chaves.md) | Custódia das chaves privadas | Proposto |
| [0006](0006-portaria-offline-sync.md) | Portaria offline-first e sincronização | Proposto |
| [0007](0007-acesso-portaria.md) | Acesso da portaria sem login | Proposto |
| [0008](0008-geracao-arquivos-typst.md) | Geração de arquivos com Typst embutido | Proposto |
| [0009](0009-frontend-next-export-estatico.md) | Next.js em export estático servido pelo Axum | Proposto |
| [0010](0010-leitura-qr-navegador.md) | Leitura de QR no navegador com zxing-wasm | Proposto |
| [0011](0011-modelo-dados-faixas.md) | Modelo de dados baseado em faixas | Proposto |
| [0012](0012-autenticacao-organizador.md) | Login do organizador por código via e-mail | Proposto |
| [0013](0013-infraestrutura.md) | Infraestrutura: uma VPS | Proposto |
| [0014](0014-pagamento-pix-adiado.md) | Pagamento Pix adiado para depois do MVP | Proposto |
