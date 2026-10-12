# 0069. Bilheteria na porta

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0050](0050-acerto-com-vendedores.md) e [0053](0053-link-do-vendedor.md).

## Contexto

Muitos eventos vendem na entrada: a pessoa paga, recebe um ingresso da pilha e entra. No acerto
de hoje, um vendedor responde por tudo o que levou menos o que devolveu; para a bilheteria isso
obriga a contar a pilha que sobrou e registrar a devolução no fim da noite. E o porteiro precisa
saber quanto cobrar de cada número.

## Opções consideradas

1. **Registrar cada venda à mão no link do vendedor.** Lento na fila e fácil de esquecer.
2. **Venda pelo app da portaria, com pagamento.** Fora do escopo: o dinheiro não passa pela
   plataforma.
3. **Vendedor marcado como bilheteria: o que entrou foi vendido.**

## Decisão

Opção 3.

- `sellers.box_office` (pode haver mais de uma bilheteria, uma por porta). No painel, o menu do
  vendedor tem **Marcar como bilheteria**, o formulário de novo vendedor tem a opção e o cartão
  explica a regra. `SellerBody.boxOffice` é opcional: ausente, mantém a escolha.
- **Manifesto:** `sellers[].boxOffice`, `event.ticketPriceCents` e o preço de cada categoria.
- **No celular:** número de bilheteria lido e aceito mostra na tela verde "Bilheteria · cobrar
  R$ 20,00" (preço da categoria, senão o do evento; 0 = "cortesia"; sem preço, "cobrar o valor
  combinado"), por mais tempo. O cabeçalho mostra "Vendidos na porta: N neste celular · R$ X ·
  M no total · R$ Y" (números distintos que entraram, deste celular e de todos os sincronizados).
- **Acerto:** para a bilheteria, vendido = números dela que entraram (`entries`), e o valor é a
  soma dos preços desses números; devoluções não contam e o botão de devolução some. Vale no
  relatório (`ReportRowDto.boxOffice`), no acerto da aba Vendedores, na mensagem do WhatsApp e na
  página do vendedor, que avisa que não precisa marcar vendas.

## Consequências

- Nada muda para os outros vendedores; desligar a bilheteria volta à regra antiga.
- Uma cópia de um número de bilheteria entra uma vez só em `entries`: conta uma venda.
- Número de bilheteria que entrou pela "porta errada" com exceção também conta como vendido.
