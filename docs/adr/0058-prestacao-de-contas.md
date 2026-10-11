# 0058. Prestação de contas em PDF e planilha

- **Status:** Aceito
- **Data:** 2026-10-11

## Contexto

Comissões de formatura, APMs e igrejas precisam mostrar ao grupo quanto entrou, quanto saiu e
quanto sobrou. O relatório mostrava o acerto dos vendedores, mas não as despesas do evento nem um
documento para circular.

## Decisão

- `event_ledger`: despesas e outras receitas do evento (descrição, categoria livre, valor, data),
  da parte Recebimentos na equipe.
- Resumo calculado no servidor (`GET /api/events/{id}/accountability`): ingressos emitidos,
  vendidos, cortesias e entradas; valor dos ingressos dos vendedores, recebido, falta receber;
  outras receitas; despesas lançadas; o que foi pago à plataforma pelos lotes; saldo em caixa
  (recebido + receitas − despesas − plataforma).
- **PDF** pelo mesmo Typst dos ingressos (`report_pdf`, documento genérico de fatos e tabelas,
  texto só como dado), com espaço para assinaturas. **Planilha** `.xlsx` escrita à mão sobre o
  `zip` (abas Resumo, Vendedores, Categorias e Lançamentos, valores numéricos em reais), sem
  dependência nova.
- No painel, o cartão "Prestação de contas" fica no Relatório.

## Consequências

- O dinheiro dos ingressos entra pelo que os vendedores já passaram; o que falta aparece à parte.
