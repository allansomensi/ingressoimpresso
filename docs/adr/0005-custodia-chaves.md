# 0005. Custódia das chaves privadas

- **Status:** Proposto
- **Data:** 2026-10-08

## Contexto

Quem tem a chave privada de um evento consegue falsificar ingressos dele. O servidor precisa
dessa chave para assinar lotes. Um dump do banco (backup vazado, injeção de SQL) não pode bastar
para falsificar.

## Opções consideradas

1. **Chave privada em texto claro no banco.** Um dump bastaria para falsificar. Rejeitada.
2. **Derivação determinística:** `sk_evento = HKDF(segredo_mestre, event_id || key_id)`. Não há
   nada a armazenar nem a fazer backup. Mas o segredo mestre sozinho compromete todos os eventos,
   passados e futuros.
3. **Chave aleatória por evento, cifrada (envelope) com uma chave mestra fora do banco.** São
   necessários **o dump e a chave mestra** para falsificar. A chave mestra pode ser trocada
   recifrando as chaves (um comando).
4. **KMS/HSM de nuvem.** A melhor proteção, mas acrescenta um serviço de terceiros, latência e
   custo. Exagero para a escala atual.

## Decisão

Opção 3.

- **Geração:** chave de 32 bytes do `OsRng` na criação do evento ou na rotação.
- **Cifra:** XChaCha20-Poly1305 (`chacha20poly1305`) com nonce aleatório de 24 bytes e
  `AAD = event_id || key_id`, para que a chave cifrada não possa ser trocada de linha.
- **Chave mestra:** em `TICKET_KEY_ENCRYPTION_KEY` (base64, 32 bytes), lida de um arquivo de
  segredo do Docker. Nunca vai para o banco nem para os logs. O tipo Rust que a carrega implementa
  `Zeroize` e um `Debug` que omite o conteúdo.
- **Backup:** a chave mestra tem cópia no gerenciador de senhas, **separada** do backup do banco.

## Consequências

- Se a chave mestra for perdida, não dá para assinar lotes novos de eventos existentes. A saída é
  rotacionar o `key_id`, o que não exige reimprimir (ADR 0004), e criar uma chave mestra nova.
- O comprometimento do servidor em execução (memória e ambiente) continua permitindo falsificar.
  É um limite aceito e documentado.
- Comando de manutenção: `ingressoimpresso keys rewrap --from <antiga> --to <nova>`.
