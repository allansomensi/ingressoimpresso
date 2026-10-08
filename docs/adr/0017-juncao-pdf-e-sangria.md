# 0017. Junção de PDFs com objetos compartilhados, BleedBox e folha de controle em blocos

- **Status:** Aceito
- **Data:** 2026-10-08
- **Substitui em parte:** [0015](0015-renderizacao-em-blocos.md) (junção dos blocos, caixas de
  sangria e folha de controle). Os blocos de 250 e 50 ingressos, o `comemo::evict` e o JPEG do
  WhatsApp continuam valendo.

## Contexto

A revisão da fase 2 encontrou três problemas no que o ADR 0015 decidiu. As medições daquele ADR
usaram uma arte pequena, que escondeu o primeiro.

1. **A arte ia uma vez por bloco.** Cada compilação embute a arte no próprio PDF, e a junção
   guardava todas as cópias. Com 2.000 ingressos (8 blocos), o arquivo levava 8 cópias da arte, e
   todos os blocos ficavam na memória até a junção. Com uma arte de verdade (PNG de 12 MB, 600 dpi),
   o arquivo da gráfica chegou a 124 MiB, com pico de 360 MiB.
2. **Sem BleedBox.** O Typst grava só a TrimBox. Sem BleedBox, a caixa de sangria vale a MediaBox:
   no arquivo da gráfica com marcas de corte, 8 mm em vez de 3 mm (a sangria mais a área das
   marcas). Uma gráfica que monta a imposição pela BleedBox leva as marcas para cima dos ingressos
   vizinhos.
3. **A folha de controle crescia com o lote.** Numa compilação só, 10.000 linhas chegaram a
   448 MiB de pico, quase toda a instância de 512 MB do Render.

## Opções consideradas

**Junção:**

1. **Instância maior.** Não resolve o tamanho do arquivo.
2. **Juntar no fim e deduplicar.** O arquivo encolhe, mas os blocos continuam todos na memória.
3. **Juntar cada bloco assim que compilado e deduplicar.** A memória fica no documento juntado mais
   um bloco.

**BleedBox:**

1. **Sangria do Typst só com os 3 mm.** As marcas de corte ficariam fora da página, onde nada é
   desenhado.
2. **Gravar a BleedBox na junção,** a partir da TrimBox.

**Folha de controle:**

1. **Uma compilação.** Numeração "Página x / y" de graça, mas a memória cresce com o lote.
2. **Blocos com "Página x / y".** O total só é conhecido no fim: seriam duas compilações completas.
3. **Blocos com "Página x".** A numeração continua de um bloco para o outro.

## Decisão

- **Junção incremental** (`PdfMerger`, em `crates/render/src/merge.rs`): cada bloco entra assim
  que é compilado. Objetos idênticos são guardados uma vez só (arte, máscara alfa, espaço de cor,
  subconjuntos de fonte iguais). A identidade é o SHA-256 do objeto, com as chaves dos dicionários
  ordenadas e as referências já remapeadas. A busca repete até ninguém mudar, porque a imagem só
  fica igual depois que a máscara dela foi remapeada. Os nós da árvore de páginas nunca são
  compartilhados.
- **Todo PDF passa pelo merger,** inclusive o de bloco único. No arquivo da gráfica, cada página
  recebe **BleedBox = TrimBox + 3 mm**, limitada à MediaBox, com ou sem marcas de corte.
- **Folha de controle em blocos de até 1.000 linhas,** alinhados aos vendedores. Um vendedor com
  mais linhas é dividido, e a parte seguinte leva "(continuação)" no título. O deslocamento de
  página vai no `data.json`, e o rodapé mostra "Página n".
- **`MALLOC_ARENA_MAX=2` na imagem da API.** As threads da renderização espalham a memória liberada
  por várias arenas do glibc, e o processo segura cerca de 90 MiB a mais.

Resultado com 2.000 ingressos e a arte de 12 MB (3.685 × 1.441 px), em release, um processo por
arquivo, as duas versões com `MALLOC_ARENA_MAX=2`:

| Arquivo | Antes: tempo / pico / tamanho | Depois: tempo / pico / tamanho |
|---|---|---|
| A4 casa | 6,5 s / 380 MiB / 121 MiB | 7,3 s / 233 MiB / 20 MiB |
| Gráfica | 6,4 s / 360 MiB / 124 MiB | 7,7 s / 244 MiB / 23 MiB |
| Controle | 0,5 s / 116 MiB | 0,4 s / 82 MiB |
| Controle, 10.000 linhas | 3,1 s / 448 MiB | 2,6 s / 79 MiB |

Sem `MALLOC_ARENA_MAX`, o pico do A4 e da gráfica fica perto de 300 MiB. A deduplicação custa
cerca de 1 s nesses 2.000 ingressos: o conteúdo de cada stream é resumido uma vez por bloco. A arte
de teste é ruído fotográfico, que quase não comprime; uma arte real gera arquivos menores.

## Consequências

- O tamanho do PDF juntado não depende do número de blocos, e a memória de pico também não.
- A junção continua dependendo de PDFs sem tags e com árvore de páginas plana, como o Typst gera.
  Os testes conferem que a arte aparece uma vez só, as caixas de cada página e a leitura do QR em
  cada página do PDF juntado, relido pelo leitor de PDF do próprio Typst.
- O rodapé da folha de controle perdeu o total de páginas.
- O ZIP do WhatsApp não muda: já era gravado em streaming.
