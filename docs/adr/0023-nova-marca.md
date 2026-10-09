# 0023. Nova marca: ingresso com "check"

- **Status:** Aceito
- **Data:** 2026-10-09
- **Substitui:** a parte de marca do [0021](0021-interface-e-pwa.md) (o resto do 0021 continua valendo)

## Contexto

A primeira marca (um ingresso com o canto de um QR code e quadradinhos) foi lida como uma câmera.
Para vender, a marca precisa ser reconhecível em 16 px, na tela inicial do celular e no WhatsApp.

## Opções consideradas

1. **Monograma "ii"** dentro de um ingresso: original, mas em tamanho pequeno lê como "!!" ou
   como o ícone de pausa.
2. **Ingresso reto com "check"**: limpo, mas genérico.
3. **Ingresso inclinado com picote e "check"**: o formato clássico de ingresso (meias-luas nas
   laterais) diz "ingresso"; o "check" diz "conferido na porta". O picote e a inclinação dão
   personalidade sem detalhes que somem em 16 px.

## Decisão

Opção 3, no mesmo violeta (`#7B5CFF` → `#4A22D6`). Ícone do app: ingresso branco com "check"
violeta; ícone da portaria: fundo escuro e "check" verde (entrada liberada). Os SVGs ficam em
`apps/web/public/brand/` e `src/app/icon.svg`; o componente `LogoMark` desenha o mesmo traçado.

## Consequências

- Todos os PNGs (192, 512, maskable, Apple, portaria) e a imagem de compartilhamento foram
  regerados a partir dos SVGs.
