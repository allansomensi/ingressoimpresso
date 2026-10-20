# 0101. Fim do evento na portaria e resumo final para compartilhar

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0018](0018-portaria-pwa.md) (portaria) e
  [0058](0058-prestacao-de-contas.md) (prestação de contas)

## Contexto

No fim da noite, o porteiro não sabia se podia fechar o app (havia leituras sem enviar?), e a
organização queria uma página só, bonita, para mandar à comissão ou postar: quanto entrou, quanto
saiu, quem vendeu mais.

## Decisão

- **Fim do evento:** no menu ⋮ da portaria e num aviso depois do horário de término, uma tela com o
  que aquele celular fez (entradas, cópias barradas, outros recusados) e as leituras ainda não
  enviadas, com um botão para enviar e o aviso de quando já dá para fechar. Tudo calculado das
  leituras guardadas no aparelho (`portaria/recent.ts`); nada novo vai ao servidor.
- **Resumo final:** `GET /api/events/{id}/summary/pdf` e `/summary/png` montam uma página (Typst,
  `summary_card.rs` + `templates/summary.typ`) com o público, as receitas e despesas da prestação
  de contas, o saldo e os vendedores que se destacaram, assinada com o logo e o endereço do
  Ingresso Impresso. O PDF é para imprimir; a imagem (1080 px) é para o WhatsApp e as redes.
  Lê quem vê o evento, como o relatório.

## Consequências

- O resumo usa só números que a organização já vê no relatório; quem recebe a imagem não vê nomes
  de compradores.
