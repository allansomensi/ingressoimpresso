# 0006. Portaria offline-first e sincronização

- **Status:** Aceito
- **Data:** 2026-10-08

## Contexto

- Muitos locais de show não têm sinal, e falhar na porta é o pior cenário do produto.
- Há vários celulares ao mesmo tempo, e cópias de ingressos válidos precisam ser detectadas.
- Não há app nativo: só navegador, no Android e no iPhone.

## Opções consideradas

1. **Validação online obrigatória.** A detecção de cópias é perfeita, mas viola o requisito
   principal. Rejeitada.
2. **Offline puro com sincronização periódica em segundo plano.** A porta nunca trava. Mas mesmo
   com sinal há uma janela de alguns segundos em que duas cópias podem entrar por celulares
   diferentes, e quem quer fraudar consegue explorar isso de propósito.
3. **Decisão local sempre, mais confirmação online com orçamento de tempo quando há sinal bom.**
   Com sinal, a garantia é a mesma da opção 1. Sem sinal, o comportamento é o da opção 2. O custo
   é no máximo 1,2 s de espera numa leitura com sinal ruim, e o modo adaptativo evita repetir esse
   custo.
4. **Sincronização P2P entre celulares sem internet.** Não é viável no navegador hoje: WebRTC
   exige sinalização, Web Bluetooth não existe no iPhone e não há descoberta de rede local. Fica
   como pesquisa futura (QR animado entre celulares, ou WebRTC em hotspot com sinalização trocada
   via QR).

**Modelo de sincronização:**

- **CRDT genérico (Automerge/Yjs):** poderoso, mas desproporcional.
- **Log de leituras só-de-acréscimo (G-Set por UUID) + estado do servidor baixado inteiro:**
  converge trivialmente e é fácil de auditar.

## Decisão

Opção 3 com G-Set.

- **Leitura:**
  1. `ticket-core.wasm` decodifica e verifica.
  2. A função `decide` consulta cancelamentos e entradas conhecidas no IndexedDB e devolve a
     decisão local na hora.
  3. Se o último sync deu certo há menos de 10 s, a leitura é enviada com `confirm=true` e
     orçamento de 1,2 s. O servidor faz
     `INSERT INTO entries ... ON CONFLICT DO NOTHING RETURNING` e responde "primeira entrada" ou
     "já entrou às HH:MM pela Porta X".
  4. Se o tempo acabar, vale a decisão local. Depois de três estouros seguidos, o celular fica 30 s
     sem confirmar.
- **Log:** toda leitura (inclusive as rejeitadas) vira um registro com UUID gerado no celular,
  persistido antes da tela de resultado. O envio é idempotente.
- **Sincronização:** a cada 3 s com a tela aberta. O celular envia as leituras pendentes e recebe
  as leituras de outros celulares (incremental, com cursor) mais os cancelamentos e atribuições
  (inteiros, porque são pequenos).
- **Cursor seguro:** cada linha guarda `txid xid8 default pg_current_xact_id()`, e o servidor só
  devolve linhas com `txid < pg_snapshot_xmin(pg_current_snapshot())`. Isso evita perder linhas
  quando as transações fazem commit fora de ordem.
- **Relógio:** a resposta do sync traz `server_time`. O celular calcula o desvio e grava
  `scanned_at` corrigido, e o servidor também guarda `received_at`.
- **Classificação no servidor:** cada leitura aceita localmente tenta entrar em `entries`. Se já
  existir entrada, vira `duplicate_entry` ("entrada duplicada offline"). Se o número estiver
  cancelado, vira `void_entry`.

## Limites assumidos

Veja a tabela completa em `docs/arquitetura.md` §5.3.

- **Duas cópias lidas em celulares diferentes, ambos offline, entram as duas.** O caso é detectado
  no sync e atribuído à faixa do vendedor no relatório. A interface recomenda um celular por fila
  sem sinal e mostra "offline há X min · N não sincronizadas".
- Cancelamentos feitos depois que o celular saiu do ar não chegam até ele.
- Sem o cache do app (dados do navegador apagados) e sem internet, a portaria não abre. Daí a lista
  de prontidão e o conselho de manter um segundo celular preparado.

## Consequências

- O servidor precisa de um índice em `entries` e de uma rota de confirmação rápida (uma transação
  curta).
- O relatório ganha valor antifraude: tentativas de cópia e duplicatas aparecem por vendedor.
- Desfazer uma leitura por toque errado (até 30 s, no mesmo celular) é um evento compensatório no
  log, não uma remoção.
