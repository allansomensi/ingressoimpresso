# 0114. Certificado com editor, modelos, imagens e verso

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0113](0113-certificados-de-participacao.md) (certificados de participação),
  [0025](0025-textos-e-modelos-de-ingresso.md) e [0094](0094-editor-travado-amostra-e-portaria-mais-calma.md)
  (editor do ingresso)

## Contexto

O certificado do ADR 0113 tinha um formato só: título, um texto, até duas assinaturas e a cor da
moldura. Escolas, cursos e congressos pediram o que já existe no ingresso: o logo da instituição,
mover as coisas, modelos prontos, a assinatura digitalizada, um verso (conteúdo programático) e a
opção de tirar a marca do Ingresso Impresso.

## Decisão

- **Um design por evento** (`CertificateDesign` em `crates/render/src/certificate_design.rs`,
  exportado para o painel): A4 deitado ou em pé, `title` (o nome do certificado, que aparece na
  página pública e nos arquivos), `brand` (a linha "Emitido com Ingresso Impresso") e duas páginas,
  `front` e `back` (opcional). Cada página tem cor do papel, uma imagem de fundo opcional (papel
  timbrado), uma moldura (`simple`, `double`, `band`, `classic`, `corners`, `geometric`, `side`,
  com cor, cor dos detalhes, distância da borda e espessura) e até 40 elementos em milímetros:
  - `text`: texto com campos (`{nome}`, `{evento}`, `{data}`, `{dias}`, `{local}`,
    `{organizacao}`, `{carga}` e o novo `{codigo}`), fonte, tamanho máximo, cor, alinhamento
    (inclusive justificado), alinhamento vertical, negrito, itálico, maiúsculas, espaço entre
    letras, altura da linha e o nome em negrito. O texto **diminui até caber** na caixa (busca
    binária no Typst e na prévia). Um texto cujos campos estão todos vazios não sai ("Carga
    horária: {carga}" sem carga), nos dois lados.
  - `image`: o logo da organização (Minha organização) ou uma imagem enviada.
  - `signature`: linha, nome e cargo, com uma imagem opcional da assinatura sobre a linha; o
    espaço do nome e do cargo é sempre reservado, para assinaturas lado a lado ficarem alinhadas.
  - `qr` (mínimo de 18 mm; o certificado precisa de pelo menos um, na frente ou no verso),
    `line` (contínua, dupla, pontilhada ou com losango), `shape` (retângulo de cor com
    transparência) e `seal` (selo com borda serrilhada, um texto pequeno e um grande).
- **As mesmas regras nos dois lados:** `CertificateDesign::validate` e `certificateIssues`
  (`lib/certificate-design.ts`); o painel mostra os problemas e só salva sem nenhum.
- **Imagens do certificado** são blobs do evento (o mesmo envio da arte, `POST /api/events/{id}/art`),
  até 8, listadas em `certificate_settings.image_blob_ids`; o design aponta para elas pela posição.
  A limpeza de envios abandonados (upload e `jobs::prune`) não apaga as que um certificado usa.
  Imagem em análise ou recusada (ADR 0042) não sai no PDF; o logo da organização segue a mesma regra.
- **Guardado como JSON** (`certificate_settings.design`). Linhas salvas antes deste ADR não têm
  design: são lidas como o modelo "Clássico" com as palavras, assinaturas e cor que tinham.
- **Editor** (`components/event/certificate-editor.tsx`): o mesmo jeito do editor do ingresso
  (travado até "Editar", arrastar com guias, Alt sem guias, seleção por retângulo e com Shift,
  alinhar e distribuir, setas, desfazer e refazer com `useHistory`, atalhos), frente e verso, camadas,
  inspetores por tipo, página (formato, papel, fundo, moldura, marca) e imagens. A prévia
  (`components/certificate/certificate-view.tsx`) desenha a mesma geometria do Typst.
- **Modelos** (`lib/certificate-templates.ts`): dez frentes (Clássico, Elegante, Moderno,
  Minimalista, Geométrico, Faixa, Escolar, Diploma, Acadêmico e Congresso, os dois últimos em pé)
  e três versos (Conteúdo programático, Registro e Em branco), em oito paletas. Trocar de modelo
  mantém o nome do certificado, quem assina e as imagens das assinaturas. O "Clássico" é também o
  padrão do servidor.
- **Fontes novas** nos dois lados, para o ingresso também: EB Garamond (com negrito e itálico) e
  Cinzel (capitulares), subconjuntos latinos em `crates/render/fonts` e WOFF2 no site.
- "Ver PDF" manda o rascunho (`POST /api/events/{id}/certificates/sample`, com limite por
  minuto): o PDF mostra o que está na tela, salvo ou não.

## Consequências

- O certificado fica com a cara da instituição, sem sair do produto; o PDF tem duas páginas
  quando há verso (imprimir frente e verso).
- O formato do QR do ingresso não muda; o QR do certificado continua sendo o link da página que o
  confirma.
