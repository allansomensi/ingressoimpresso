# 0082. Documento na portaria

- **Status:** Aceito
- **Data:** 2026-10-15
- **Complementa:** [0056](0056-categorias-de-ingresso.md) e [0068](0068-porta-por-categoria.md).

## Contexto

A meia-entrada (Lei 12.933/2013) só vale com comprovação na entrada: carteira de estudante,
documento de idoso, de pessoa com deficiência ou ID Jovem. Até aqui a categoria "Meia" era só uma
faixa colorida (ADR 0056): a tela verde da portaria mostrava "MEIA" e voltava sozinha para a
câmera em dois segundos, sem lembrar o porteiro de pedir nada. Na fila, o porteiro esquece.

## Opções consideradas

1. **Só a cor da faixa.** É o que existia; não lembra ninguém de nada.
2. **Bloquear até digitar o documento.** Lento na fila, e a plataforma passaria a guardar dados
   pessoais que não precisa ter.
3. **Marca na categoria + aviso em destaque que espera o toque.**

## Decisão

Opção 3.

- **Dados:** `ticket_categories.check_document` (padrão `false`) e `document_note` (até 80
  caracteres, uma linha), que diz quais documentos valem. Sem a marca, a nota é descartada.
  Duplicar o evento leva as duas.
- **Painel:** "Pedir documento na portaria" no diálogo da categoria, com a nota opcional; o cartão
  da categoria mostra o selo "Pede documento". As categorias sugeridas já trazem a Meia marcada.
- **Manifesto:** cada faixa de categoria ganha `checkDocument` e `documentNote` (opcionais para o
  app antigo, que ignora os campos).
- **Na portaria:** um ingresso que **entra** (primeira entrada) numa categoria marcada mostra,
  dentro da tela verde, a caixa "MEIA: PEÇA O DOCUMENTO" com a nota e "Sem documento, cobre a
  diferença ou chame a organização". A tela **não volta sozinha**: espera o toque, como a
  cobrança da bilheteria (ADR 0069). A decisão do `DoorCore` não muda: o ingresso é válido; o
  documento é conferência humana. A volta de quem saiu (ADR 0083) não pede de novo.
- **Ingresso digital e `/conferir`:** avisam "Meia: leve um documento" com a nota, para quem vai
  entrar se preparar e para quem vai comprar saber antes.
- **Nada é registrado** sobre o documento: a plataforma não guarda tipo nem número.

## Consequências

- O formato v1, os vetores e a deduplicação não mudam: é regra de tela.
- A fila fica um toque mais lenta só nos ingressos da categoria marcada.
- Recusar a entrada por falta de documento continua sendo decisão de quem está na porta.
