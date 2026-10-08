# 0008. Geração de arquivos com Typst embutido

- **Status:** Aceito
- **Data:** 2026-10-08

## Contexto

Precisamos gerar:

- PDF A4 para impressão caseira (vários por folha, marcas de corte, canhoto numerado);
- PDF para gráfica (um por página, sangria, marcas de corte);
- folha de controle por vendedor;
- PNG por ingresso para o WhatsApp.

A qualidade tem de ser de impressão profissional, com até milhares de ingressos por lote, num
servidor modesto.

## Opções consideradas

1. **Typst embutido em Rust (crate `typst` + `typst-pdf` + `typst-render`).** Layout declarativo
   poderoso, PDF vetorial com fontes embutidas e PNG pelo mesmo template. Roda no processo, sem
   dependências externas. A API muda entre versões, e não há PDF/X nem conversão de imagens para
   CMYK (o Typst suporta PDF/A e PDF/UA).
2. **HTML → PDF com Chromium headless.** Familiar, mas pesado (cerca de 300 MB, uso alto de
   memória), com controle de impressão fraco (sangria, caixas) e mais um processo para operar.
3. **Biblioteca PDF de baixo nível (`krilla`, `printpdf`).** Controle total, mas o layout
   (encaixe, texto, canhoto) teria de ser escrito à mão, e não sairia PNG de graça.
4. **Gerar no navegador (pdf-lib).** Poupa CPU do servidor, mas a assinatura é do servidor, a
   qualidade varia conforme o dispositivo e haveria duas bases de layout.

## Decisão

Opção 1, isolada no crate `render`:

- **World próprio:** templates `.typ` compilados no binário (`include_str!`), fontes OFL embutidas
  e **sem download de pacotes**, o que torna o build offline e determinístico.
- **Dados do usuário só como dados:** passados como `sys.inputs`/JSON e lidos pelo template.
  **Nunca** são interpolados no código-fonte Typst, o que impede injeção.
- **QR:** a matriz é gerada em Rust e entregue ao Typst como um SVG com um único `path`, por meio
  de um arquivo virtual. Fica vetorial no PDF.
- **Gráfica:** TrimBox e BleedBox definidas em pós-processamento com `lopdf`. No MVP, as cores
  ficam em RGB. CMYK (lcms2 + perfil ISO Coated/FOGRA) e PDF/X ficam para a fase 7.
- **Arte:** validação de DPI na hora do upload (aviso abaixo de 300 dpi no tamanho final).
- **Execução:** como job em fila no Postgres (`FOR UPDATE SKIP LOCKED`), dentro do mesmo processo,
  via `spawn_blocking`.
- **Armazenamento:** a saída é determinística (spec versionada + arte + assinaturas
  determinísticas), então **não armazenamos arquivos gerados**. Há só um cache em disco com limite
  de tamanho, indexado pelo hash das entradas.

## Impressão em casa e em gráfica

O mantenedor confirmou que cada organizador escolhe o modo de impressão e que **os dois modos são
cidadãos de primeira classe**. Todas as saídas vêm do mesmo template e da mesma especificação. O
que muda é a montagem da página:

| Saída | Para quem | Montagem |
|---|---|---|
| A4 caseiro | Impressora jato de tinta/laser em casa | N por folha, margem de 5 a 8 mm (área não imprimível), marcas de corte, picote do canhoto |
| Gráfica | Impressão **digital** (dados variáveis) | 1 por página no tamanho final + 3 mm de sangria, marcas de corte, TrimBox/BleedBox |
| Folha de controle | Organizador e vendedor | Tabela por vendedor |
| PNG/ZIP | Envio pelo WhatsApp | 1080 px, sem sangria nem canhoto |

**Limite que precisa ser explicado na interface:** um QR único por ingresso exige impressão
**digital**. Offset com numeradora não imprime QR variável. Para tiragens grandes, a fase 7 traz
um modo de **sobreimpressão**: a gráfica imprime só a arte em offset (barato), e o organizador
imprime número + QR em casa sobre o papel já impresso. A arte precisa ter uma área branca
reservada para o QR, e o PDF de sobreimpressão vem com marcas de alinhamento.

Na fase 2, o template recebe predefinições de tamanho comuns, e o encaixe no A4 é calculado
automaticamente para qualquer tamanho.

## Consequências

- **Memória:** a geração roda numa instância pequena do Render (ADR 0013). O renderizador processa
  em blocos (por exemplo, 200 ingressos por compilação Typst) e junta os PDFs, para que o uso de
  memória não cresça com o tamanho do lote.
- A versão do Typst fica fixa. Atualizações são tarefas planejadas, com testes de snapshot.
- Um teste de ida e volta (renderizar → rasterizar → decodificar o QR → verificar a assinatura)
  garante que o arquivo impresso seja realmente legível.
- A arte (entrada do usuário) fica no Postgres (`blobs`, até cerca de 20 MB), atrás de uma trait
  `BlobStore`, e entra no backup do banco. Se o volume crescer, migra para armazenamento de
  objetos.
- Gráficas mais exigentes podem pedir CMYK/PDF-X antes da fase 7. Nesse caso, a conversão pode ser
  feita fora do sistema pela própria gráfica.
