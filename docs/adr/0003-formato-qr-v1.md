# 0003. Formato do QR v1: binário fixo + base45 alfanumérico

- **Status:** Proposto
- **Data:** 2026-10-08

## Contexto

O QR precisa:

- carregar evento, número e prova de autenticidade;
- ser lido com rapidez e segurança por câmeras de celular comuns, tanto impresso em impressora
  caseira quanto na tela de um celular (imagem do WhatsApp);
- caber em ingressos pequenos.

Os leitores de QR no navegador (zxing-wasm, BarcodeDetector) devolvem **texto**, e bytes
arbitrários no modo byte do QR se corrompem na conversão para string (ISO-8859-1 vs UTF-8).

## Opções consideradas

**Envelope:**

1. **JWT/JWS ou COSE/CWT.** Padrões conhecidos, mas o cabeçalho e a codificação acrescentam
   dezenas de bytes, e a superfície de parsing é maior do que precisamos.
2. **Layout binário fixo próprio.** É o menor possível e tem parsing trivial (comprimento fixo,
   sem campos opcionais). Exige especificação e vetores próprios.

**Codificação do texto:**

1. **base64 no modo byte:** 10,67 bits por byte de payload.
2. **base32 no modo alfanumérico:** 8,8 bits por byte, e permitiria uma URL.
3. **base45 no modo alfanumérico (RFC 9285, usado no certificado europeu de COVID):** 8,25 bits por
   byte. O modo byte com binário cru daria 8 bits, mas não é seguro como texto.

**URL no QR** (ex.: `HTTPS://INGRESSOIMPRESSO.COM.BR/I/...`): o comprador poderia abrir o próprio
ingresso com a câmera. Isso custa cerca de 35 caracteres, obriga a usar base32 (o alfabeto do
base45 inclui caracteres inválidos em URL) e cria uma página pública para manter. Fica fora agora.

## Decisão

Payload v1 de 74 bytes, big-endian:

| Offset | Tam. | Campo |
|---|---|---|
| 0 | 1 | `version` = `0x01` |
| 1 | 4 | `event_tag` (u32 aleatório, único por evento) |
| 5 | 1 | `key_id` |
| 6 | 4 | `ticket_number` (u32, ≥ 1) |
| 10 | 64 | assinatura Ed25519 (ver ADR 0004) |

- **Texto do QR:** `base45(payload)`, com exatamente 111 caracteres, no modo alfanumérico e
  correção **M**. Isso dá a **versão 5 (37×37 módulos)**, com capacidade de 122.
- **Tamanho mínimo impresso:** 22 mm com a zona de silêncio, cerca de 0,5 mm por módulo. O
  recomendado é 25 mm ou mais, sempre com fundo branco.
- **Decodificador estrito:** só base45 canônico em maiúsculas, comprimento exato e versão conhecida.
  Qualquer desvio resulta em "QR não reconhecido". Isso também descarta outros QR que estejam na
  arte, como o do Instagram da banda.
- **Formatos futuros:** usam outro valor de `version` e convivem com o v1. **O v1 nunca muda**
  depois que o primeiro ingresso real for impresso.

## Consequências

- O QR é cerca de 2 vezes maior em área que o da alternativa token + hash (ADR 0004), que caberia
  na versão 2. Mesmo assim, a versão 5 é lida com folga. O certificado europeu de COVID usava QR
  bem maiores, em papel, com leitura confiável.
- O `event_tag` revela só que dois ingressos são do mesmo evento, o que não é segredo.
- Ler um QR com a câmera nativa mostra um texto sem sentido. Aceitável.
- Se o QR precisar diminuir no futuro, o caminho é um formato v2, não um remendo no v1.
