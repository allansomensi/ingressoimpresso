# 0090. Modo conferência (ronda)

- **Status:** Aceito
- **Data:** 2026-10-19
- **Complementa:** [0006](0006-portaria-offline-sync.md), [0067](0067-modo-ensaio-da-portaria.md) e
  [0083](0083-saida-e-volta.md).

## Contexto

Num lugar aberto (praça, sítio, campo), a equipe circula e precisa saber, na dúvida, se uma pessoa
passou pela portaria. Hoje quem lê o ingresso no app da portaria **registra uma entrada**: se a
pessoa não tinha passado, entrou ali mesmo sem ninguém decidir; se já tinha passado, a tela vermelha
"JÁ ENTROU" faz parecer que há algo errado quando está tudo certo.

## Opções consideradas

1. **Ler com o modo de entrada.** O vermelho confunde e a leitura registra.
2. **Usar `/conferir`** (ADR 0075). É público, não sabe quem entrou (por desenho) e precisa de
   internet.
3. **Um terceiro modo no app da portaria, que só consulta.**

## Decisão

Opção 3, nos eventos de ingressos (uma ficha não é conferida depois de usada).

- O seletor de modo do celular passa a ter **Entrada**, **Saída** (só com saída e volta) e
  **Conferir**. O modo fica guardado no aparelho, como a saída. A conferência é **verde-azulada** em
  tudo (seletor, faixa no topo, moldura da câmera), para nunca ser confundida com a entrada.
- A leitura usa `DoorCore.evaluate` no livro de entradas que vale para o número hoje (ADR 0091):
  **nada é gravado nem enviado**. O resultado:
  - já passou: verde **"PASSOU PELA ENTRADA"**, com hora e celular, e a instrução da categoria
    (ADR 0089) como lembrete;
  - não passou: amarelo **"NÃO PASSOU PELA ENTRADA"**, com o botão **"Registrar a entrada agora"**,
    que faz a entrada normal (`checkIn`, confirmação online, instrução e documento);
  - saiu (saída e volta): amarelo **"ESTÁ FORA"**, com "Registrar a volta";
  - não vale hoje, cancelado, falso ou de outro evento: as mesmas telas da entrada, sem registrar.
- Num **ponto de controle** (ADR 0092), conferir diz se o benefício já foi usado, com
  "Registrar o uso agora".
- **Sem sinal:** um celular sem sincronizar há mais de 2 minutos avisa no resultado que entradas
  de outros celulares depois da última sincronização podem não aparecer.
- O ensaio (ADR 0067) e a conferência não se misturam: o ensaio sai do menu enquanto se confere.

## Consequências

- O formato v1, os vetores e o servidor não mudam: é uma leitura local.
- A conferência não aparece no Ao vivo nem no histórico do servidor; o histórico do próprio celular
  também não guarda a consulta, só a entrada registrada a partir dela.
