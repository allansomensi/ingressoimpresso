# 0035. Rifas: imprimir números sim, sortear não

- **Status:** Aceito
- **Data:** 2026-10-09

## Contexto

O modelo de rifa (número grande e canhoto, 12 por folha) já existe. Surgiu a ideia de um recurso
de rifas completo: registrar compradores, sortear o número vencedor e publicar o resultado.

## Opções consideradas

1. **Recurso de sorteio.** No Brasil, rifa e sorteio com venda de bilhete dependem de autorização
   (Lei 5.768/1971 e regulamentação do Ministério da Fazenda); sem ela, é contravenção (art. 51 do
   Decreto-Lei 3.688/1941). Um sorteio feito pela plataforma a tornaria parte da operação, e o
   serviço é oferecido por pessoa física.
2. **Manter só a impressão de números**, deixando sorteio, prêmios e autorização com o
   organizador, por escrito nos Termos de Uso.

## Decisão

Opção 2. Não construímos sorteio, registro de apostadores nem publicação de resultado. O modelo de
rifa continua, e a landing deixa claro de quem é a responsabilidade.

## Consequências

- Revisitar se o serviço passar a ter CNPJ e assessoria jurídica para operar promoções
  autorizadas (por exemplo, sorteio de brinde entre presentes, sem venda de bilhete).
