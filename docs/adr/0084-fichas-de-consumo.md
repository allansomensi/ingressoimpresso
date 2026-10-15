# 0084. Fichas de consumo

- **Status:** Aceito
- **Data:** 2026-10-15
- **Complementa:** [0056](0056-categorias-de-ingresso.md), [0062](0062-paginas-publicas-para-busca.md)
  e [0068](0068-porta-por-categoria.md).

## Contexto

Festa junina de escola e de igreja vive de ficha de bar e de comida. Hoje ela é um papelzinho
carimbado: dá para copiar na impressora de casa e não há como saber, no fim da noite, quantas
fichas de pastel foram vendidas e quantas foram usadas. Tudo o que uma ficha precisa já existe na
plataforma: numeração, QR assinado, categorias com cor e preço, lotes, caixas (vendedores e
bilheteria) e leitura offline que barra a segunda passagem.

## Opções consideradas

1. **Um produto à parte (outro formato, outra tela).** Duplicaria impressão, portaria e acerto.
2. **Usar um evento comum e chamar o ingresso de ficha.** Funciona, mas o painel e a portaria
   falariam de "ingresso", "porta" e "entrou", o que confunde quem está na barraca.
3. **Um tipo de evento: ingressos ou fichas.** Mesma mecânica, outras palavras onde importa.

## Decisão

Opção 3.

- **Dados:** `events.kind` (`tickets`, padrão, ou `tokens`). Escolhido no formulário do evento
  (dois cartões, "Ingressos" e "Fichas de consumo") e mudável depois; duplicar leva o tipo.
  `EventBody.kind` é opcional (o painel antigo cria ingressos e não muda o tipo ao editar).
- **Uma ficha vale uma vez:** a decisão do `DoorCore` é a de sempre (a primeira leitura vale, a
  cópia é barrada). Saída e volta (ADR 0083) não existe para fichas: `door-settings` recusa
  (`reentry_tokens`), mudar um evento para fichas desliga a opção e o banco garante
  (`events_tokens_no_reentry_check`).
- **Produtos são categorias:** a aba Categorias vira "Produtos" (Bebida, Comida, Doce,
  Brincadeira sugeridos), sem mesas e sem documento. Cada produto tem cor, faixa de números e
  preço, que o acerto dos caixas já usa.
- **Campo `{categoria}`:** imprime o nome da categoria do número (o produto, em letras grandes).
  É resolvido por ingresso, como o `{preco}` da categoria (ADR 0080), nos dois lados
  (`fields.rs` e `lib/ticket-fields.ts`); sem categoria, o bloco não sai.
- **Modelos:** "Ficha de consumo" e "Ficha de festa junina", 63 × 38 mm (21 por folha A4), com o
  produto, o preço, o QR e a faixa do produto na borda esquerda. A galeria abre nos modelos de
  ficha num evento de fichas; cada modelo tem a sua página em `/modelos` (ADR 0062).
- **Palavras:** `lib/event-kind.ts` (`forKind`) põe as palavras das fichas sobre as dos
  ingressos. Mudam as abas (Ficha, Produtos, Barracas; sem Lista), o selo "Fichas de consumo",
  a aba da portaria (links de barraca), o app ("FICHA VÁLIDA", "FICHA JÁ USADA às 20:15 em
  Barraca 2", "OUTRA BARRACA", contador de usadas) e a ficha no celular. Textos secundários que
  falam de "ingresso" continuam valendo: uma ficha é um ingresso de consumo.
- **Preço da plataforma:** o mesmo da tabela de lotes (ADR 0039); o administrador pode criar
  promoções se quiser um preço diferente para fichas.

## Consequências

- Formato do QR, vetores, deduplicação e decisão não mudam.
- A barraca usa o app da portaria; a porta por categoria (ADR 0068) vira "barraca por produto".
- O manifesto, o ingresso digital, a página do vendedor e o `/conferir` levam `kind` (opcional
  para o app e as páginas salvas antes).
