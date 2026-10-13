# 0080. Link da porta de novo, ensaio opcional, "todos os livres" e preço da categoria no papel

- **Status:** Aceito
- **Data:** 2026-10-13
- **Complementa:** [0007](0007-acesso-portaria.md) (link da portaria),
  [0056](0056-categorias-de-ingresso.md) (categorias), [0067](0067-modo-ensaio-da-portaria.md)
  (ensaio), [0069](0069-bilheteria-na-porta.md) (bilheteria) e [0078](0078-lista-do-que-falta.md)
  (o que falta)

## Contexto

O uso real trouxe quatro atritos:

1. O link da portaria aparece uma vez só. Quem cria links para várias portas (VIP, pista) e
   depois precisa passar um deles de novo não tem como.
2. O ensaio da portaria contava como pendência em **O que falta** e marcava "sem ensaio" em
   amarelo em cada celular, mas a porta funciona sem ele.
3. Para abastecer a bilheteria era preciso descobrir à mão quais números sobraram, muitas vezes
   espalhados.
4. A categoria tinha preço no acerto, mas o campo `{preco}` do ingresso impresso mostrava sempre o
   preço do evento: o VIP saía com o preço da inteira.

## Opções consideradas

1. Link: **guardar o token cifrado** para mostrar de novo, ou **gerar um token novo** para o mesmo
   link. Guardar fere o invariante 7 (só o hash no banco).
2. "Todos os livres": **calcular no navegador** com lotes, vendedores, cancelamentos e ingressos
   digitais (quatro consultas e regras repetidas), ou **no servidor**, com multiranges do Postgres.
3. Preço impresso: **um campo novo** (`{preco_categoria}`) ou **o mesmo `{preco}`** valendo o preço
   da categoria quando ela tem um.

## Decisão

- **`POST /api/door-accesses/{id}/link`** (parte `door` da equipe) troca o `token_hash` de um
  link ativo e devolve o token novo, com o mesmo nome, categorias e validade. Os celulares já
  registrados seguem (eles usam o próprio segredo); o link antigo deixa de registrar celulares.
  No painel, **Link e QR** confirma e mostra o cartão com QR, copiar e WhatsApp.
- O ensaio vira item **opcional** em `checklist::items` (nunca soma em "Faltam N"); o painel só
  mostra o selo quando o celular ensaiou, e a folha de ensaio fica num bloco recolhido.
- **`GET /api/events/{id}/available-numbers[?category=]`** devolve os números livres: dos lotes
  não cancelados, menos os que estão com vendedores, os cancelamentos ativos e os ingressos
  digitais ativos, opcionalmente só de uma categoria. **`POST /api/sellers/{id}/ranges/remaining`**
  entrega todos eles numa transação (no máximo 500 faixas; a restrição de exclusão segue valendo
  contra entregas simultâneas). A conta é feita com `range_agg` e diferença de multiranges.
- **`{preco}`** imprime o preço da categoria do número quando ela tem preço próprio
  (`TicketCategory.price_cents`); sem preço próprio, o do evento. Só os ingressos dessa categoria
  ganham textos próprios (`TemplateTicket.textValues`); a prévia do editor segue com o preço do
  evento.

## Consequências

- Gerar o link de novo invalida o anterior para celulares novos: o aviso da confirmação diz isso.
- Um `{preco}` impresso pode mudar entre reimpressões se o preço da categoria mudar, como já
  acontecia com o preço do evento.
- Bancos com Postgres anterior ao 14 não teriam multiranges; o Neon e o CI usam 16.
