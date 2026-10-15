# 0086. As palavras das fichas em todo o produto

- **Status:** Aceito
- **Data:** 2026-10-15
- **Complementa:** [0084](0084-fichas-de-consumo.md)

## Contexto

O ADR 0084 trocou as palavras só onde importava mais (abas, portaria, ficha no celular) e deixou
o resto falando de "ingresso", com o argumento de que "uma ficha é um ingresso de consumo". No uso,
isso confunde: a aba Lotes pede a "quantidade de ingressos", o link do vendedor oferece "criar
ingresso no celular", o e-mail de pagamento diz "os ingressos estão liberados" e a folha de
controle conta "ingressos". Quem organiza uma quermesse não reconhece o próprio evento.

A troca de palavras do ADR 0084 também era rasa: `forKind` só sobrepunha o primeiro nível de um
objeto de textos, então cada tela listava à mão as chaves que mudavam.

## Opções consideradas

1. **Trocar "ingresso" por "ficha" automaticamente no texto.** Não funciona em português:
   "o ingresso" vira "a ficha", "vendidos" vira "vendidas", "entrou" vira "foi usada".
2. **Uma seção `tokens` em cada módulo de textos, no mesmo formato da seção dos ingressos.**
   Cada frase das fichas é escrita por gente, com a concordância certa, e só o que muda é listado.

## Decisão

Opção 2, em todo o produto.

- **Painel e páginas públicas:** cada módulo de textos tem uma seção `tokens` com a mesma forma
  dos textos dos ingressos. `forKind` (`lib/event-kind.ts`) põe uma sobre a outra em qualquer
  profundidade (listas são trocadas inteiras) e guarda o resultado, porque os textos são
  constantes. Na página do evento, `useEventTexts()` lê o tipo do contexto da página
  (`EventAccessProvider`); o link do vendedor tem `SellerKind`; o app da barraca, a ficha no
  celular e o `/conferir` usam o tipo que vem nos dados.
- **Conferido pelo compilador:** `Overrides<T>` e `Known<T, S>` fazem um texto das fichas sem
  texto correspondente dos ingressos, ou com outros parâmetros, não compilar. Um teste garante que
  nenhum texto das fichas da página do evento fale em "ingresso" ou "portaria".
- **Servidor:** o e-mail do lote pago, a descrição na Stripe, o convite da equipe, a prestação de
  contas (PDF e planilha) e a folha de controle (`RenderJob.tokens`) usam as palavras das fichas
  (`EventRow::tokens`).
- **Vocabulário:** ingresso → ficha; entrar → usar (dar baixa); portaria/porta → barraca;
  categoria → produto; quem vende continua "vendedor".
- **O que não faz sentido numa ficha deixa de existir, em vez de mudar de nome:** bilheteria
  (o que é vendido no caixa é usado depois, ou nunca), documento na porta, lugar na mesa e lista
  de nomes. Ao virar fichas, o evento perde a bilheteria e a conferência de documento; mesas e
  lista ficam guardadas, mas não saem na ficha nem vão para a barraca.
- **Desenho padrão:** um evento de fichas que nunca salvou o desenho começa da ficha padrão
  (`TicketDesign::default_tokens`, o modelo "Ficha de consumo" sem a arte, 63 × 38 mm), e não do
  ingresso de 150 × 55 mm.

## Consequências

- Uma tela nova que fala de ingresso precisa da frase das fichas na seção `tokens` do seu módulo;
  o compilador avisa se a chave não existir dos dois lados.
- Textos de nível de conta (Minha organização, preços, Novidades) continuam falando de ingresso:
  eles não pertencem a um evento.
- O formato do QR, os vetores e a decisão da portaria não mudam.
