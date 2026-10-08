# Ingresso Impresso

Ingressos impressos, numerados e com QR code assinado, com check-in na porta pelo navegador do
celular, inclusive sem internet. Para bandas, festas de escola, igrejas e pequenos produtores que
vendem ingresso na mão.

**Status:** arquitetura aprovada; núcleo do ingresso (formato do QR, assinatura Ed25519, decisão
da portaria, build WASM) implementado. Comece por [`docs/arquitetura.md`](docs/arquitetura.md),
pelos [ADRs](docs/adr/README.md) e pelo [`CLAUDE.md`](CLAUDE.md) (comandos e convenções).

```sh
just        # roda tudo o que o CI roda
```
