# 0113. Certificados de participação

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0070](0070-lista-de-nomes-na-porta.md) (lista de nomes), [0030](0030-ingresso-digital.md)
  (ingresso digital) e [0053](0053-link-do-vendedor.md) (link do vendedor)

## Contexto

Escolas, palestras, congressos e cursos precisam dar um certificado a quem participou. Hoje a
organização copia a lista de presença para um editor de texto e faz um arquivo por pessoa, à mão,
dias depois. O Ingresso Impresso já sabe quem entrou (portaria) e, muitas vezes, o nome de cada
um (lista de nomes, comprador anotado pelo vendedor, titular do ingresso digital).

## Decisão

- **Quem recebe:** quem veio e tem nome: os convidados da lista que chegaram (chegada não
  desfeita) e os ingressos que entraram (`entries`) com nome, o do titular do ingresso digital
  ativo ou, sem ele, o do comprador anotado pelo vendedor. Ordem alfabética.
- **Modelo editável por evento** (`certificate_settings`): título, texto com campos (`{nome}`,
  `{evento}`, `{data}`, `{dias}`, `{local}`, `{organizacao}`, `{carga}`), carga horária, até
  duas assinaturas (nome e cargo) e a cor da moldura. Sem modelo salvo valem os padrões. Os
  campos são preenchidos no servidor (`render::fill_certificate`) e espelhados no painel
  (`lib/certificates.ts`) para a prévia ao vivo, com os mesmos exemplos nos testes. O `{nome}`
  vira um trecho próprio, em negrito; o texto entra no Typst só como dado (invariante 5).
- **PDF:** A4 deitado, uma página por pessoa (`templates/certificate.typ`), com um QR que abre a
  página do certificado. **Baixar todos** dá um ZIP com um PDF por pessoa.
- **Gerar** cria `certificates` (código `CERT-0001` por evento) para quem ainda não tem; quem chega
  depois ganha o seu ao gerar de novo. Um nome errado é corrigido no certificado; apagar faz o link
  parar de funcionar.
- **Envio por link:** `/certificado#token`. O token é o id do certificado assinado com a chave
  mestra (HMAC, como o descadastro do ADR 0107): não é guardado e pode ser mostrado de novo a
  qualquer hora. Vai no fragmento e no corpo das requisições (`POST /api/certificates/view` e
  `/pdf`, sem login, `ratelimit::CERTIFICATE`), nunca na URL do servidor. A página mostra
  "Certificado válido" com os dados e o botão de baixar; a mesma página confirma o certificado
  para quem ler o QR. O painel copia o link ou abre o WhatsApp (no telefone do comprador, quando
  houver).
- **Painel:** seção **Certificados** no grupo Pessoas (parte `door` da equipe, que cuida da
  lista e da portaria). Fichas de consumo não têm certificados.

## Consequências

- O certificado sai no fim do evento, com um clique, para todo mundo que entrou com nome.
- Quem entrou sem nome (ingresso vendido sem anotar o comprador) não aparece: a seção diz isso, e
  a lista de nomes ou o ingresso digital resolvem nos próximos eventos.
