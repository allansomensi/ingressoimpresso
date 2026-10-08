# 0004. Assinatura Ed25519 com chave por evento

- **Status:** Proposto
- **Data:** 2026-10-08

## Contexto

Requisitos:

- falsificação impossível **mesmo que alguém extraia todos os dados do celular da portaria**;
- validação offline;
- vários celulares;
- o link da portaria é compartilhado por WhatsApp, então o que o celular baixa deve ser tratado
  como semipúblico.

## Opções consideradas

1. **HMAC com segredo no celular.** QR pequeno e simples, mas quem extrair o segredo falsifica à
   vontade. **Rejeitada** pelo requisito.
2. **Token aleatório de 128 bits por ingresso + manifesto com `hash(token)` no celular.** Também
   resiste à extração (seria preciso inverter o hash). O payload tem cerca de 24 bytes, cabendo
   num **QR versão 2**, bem menor e mais tolerante a impressão ruim. Não há criptografia
   assimétrica nem WASM pesado. Porém:
   - o celular **precisa do manifesto completo e atualizado**. Um lote gerado depois do último
     sync (vendeu tudo e imprimiu mais no dia) aparece como "desconhecido" numa porta sem sinal,
     justamente o pior cenário;
   - se o armazenamento do navegador for apagado, não há nenhum modo degradado.
3. **Ed25519 com um par de chaves por evento.** O celular guarda só a chave pública (32 bytes). O
   ingresso se valida sozinho: **qualquer lote, gerado a qualquer momento, é aceito por um celular
   que tenha só a chave pública**. O manifesto vira apenas uma lista de bloqueio (cancelamentos)
   mais o estado de entradas. A assinatura é determinística (RFC 8032), tem implementações maduras
   (`ed25519-dalek`) e é rápida no WASM (menos de 1 ms). Custo: 64 bytes de assinatura e QR versão
   5.
4. **ECDSA P-256.** Disponível no WebCrypto, mas a assinatura também tem 64 bytes, é
   não-determinística sem RFC 6979 e é maleável. Nenhuma vantagem sobre a opção 3.
5. **BLS (48 bytes) ou Schnorr truncado.** Economiza 16 bytes ao custo de criptografia menos
   difundida, WASM pesado ou construção própria. Não compensa.
6. **Uma chave global em vez de uma por evento.** Uma chave vazada comprometeria todos os eventos,
   e a revogação não teria granularidade. A chave por evento custa só uma linha no banco.

## Decisão

Opção 3, com:

- **mensagem assinada** = `"ingressoimpresso:ticket:v1" || event_id (UUID, 16 bytes) ||
  payload[0..10]`. Isso dá separação de domínio, vínculo ao UUID completo do evento (que não
  ocupa espaço no QR) e cobertura de todo o cabeçalho;
- **verificação** com `verify_strict`;
- **`key_id`** (u8) para rotação:
  - **perda** da chave privada: cria-se o `key_id` seguinte para lotes novos, e os ingressos
    antigos continuam válidos, porque a chave pública antiga continua no manifesto;
  - **comprometimento**: o `key_id` é revogado, todos os ingressos dele são rejeitados e é preciso
    reemitir. É o caso de desastre;
- **assinatura somente de lotes pagos.** Prévias usam um QR de amostra inválido e marca d'água.

## Consequências

- Extrair dados do celular não permite falsificar. A segurança depende só da chave privada no
  servidor (ADR 0005).
- A deduplicação de cópias continua dependendo do estado de entradas, já que a assinatura não
  impede cópia (ADR 0006).
- A portaria aceita lotes novos sem sync, mas o vendedor desses números aparece como "lote novo"
  até a próxima sincronização.
- O QR é maior que na opção 2 (ADR 0003). Se testes de campo mostrarem leitura ruim, reavaliamos
  com dados.
