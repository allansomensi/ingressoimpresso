# 0015. Renderização em blocos, sangria nativa do Typst e JPEG para WhatsApp

- **Status:** Aceito
- **Data:** 2026-10-08
- **Complementa:** [0008](0008-geracao-arquivos-typst.md). A decisão de usar Typst embutido não
  muda; este ADR registra os detalhes de implementação medidos na fase 2.

## Contexto

O ADR 0013 previa um risco: a instância pequena do Render tem pouca RAM. Medido com 2.000
ingressos com arte, gerados em release, numa única compilação Typst por arquivo:

| Arquivo | Tempo | Pico de memória |
|---|---|---|
| A4 casa | 3,3 s | 277 MiB |
| Gráfica | 3,0 s | 315 MiB |
| Controle | 1,1 s | 130 MiB |
| ZIP WhatsApp | 46 s | 770 MiB |
| Tudo num processo | 52 s | **1.221 MiB** |

O ADR 0008 também previa pós-processar o PDF com `lopdf` para gravar TrimBox/BleedBox, e PNG para
as imagens do WhatsApp.

## Opções consideradas

1. **Instância maior no Render.** Resolve o sintoma por dinheiro, mas a memória continua
   crescendo com o lote.
2. **Gerar em blocos e juntar.** A memória fica limitada pelo tamanho do bloco, qualquer que seja o
   lote, ao custo de juntar os PDFs.
3. **Vários arquivos por lote** (um por vendedor). Evita a junção, mas a gráfica quer um arquivo
   só.

## Decisão

- **Blocos:**
  - PDFs compilados de 250 em 250 ingressos (na folha A4, arredondado para folhas inteiras);
  - imagens de 50 em 50;
  - folha de controle numa única compilação, porque é só texto e a numeração "Página x / y"
    precisa ser contínua.
- **Cache do Typst:** `comemo::evict(0)` depois de cada compilação. Era o cache global de
  memoização, e não o tamanho do bloco, que fazia a memória crescer.
- **Junção de PDFs** com `lopdf`: renumera os objetos, põe todas as páginas sob uma árvore única
  e descarta os catálogos órfãos. Os PDFs saem **sem tags** (`tagged: false`): estrutura de
  acessibilidade não serve para ingressos e impediria a junção simples.
- **ZIP em streaming** (`write_whatsapp_zip` para qualquer `Write + Seek`): a memória não depende
  do número de imagens.
- **Sangria nativa do Typst 0.15** (`page.bleed`): o Typst já grava a TrimBox, então não há
  pós-processamento. No arquivo da gráfica, a área externa é 3 mm de sangria mais 5 mm para as
  marcas de corte, que ficam fora da sangria. A TrimBox continua sendo o corte final.
- **JPEG com qualidade 92** para o WhatsApp, em vez de PNG. A arte fotográfica em PNG fica cerca
  de 10 vezes maior, e o WhatsApp recomprime de qualquer forma. A leitura do QR é verificada no
  teste de ida e volta.

Resultado com o mesmo lote de 2.000 ingressos:

| Arquivo | Tempo | Pico de memória |
|---|---|---|
| A4 casa | 1,8 s | 92 MiB |
| Gráfica | 2,3 s | 97 MiB |
| Controle | 0,4 s | 105 MiB |
| ZIP WhatsApp | 48 s | 70 MiB |

## Consequências

- A instância Starter do Render (512 MB) basta para a geração, com folga.
- O ZIP do WhatsApp é a etapa lenta, cerca de 24 ms por ingresso numa CPU. Ele roda como job
  assíncrono (ADR 0008). Se ficar lento demais, dá para paralelizar os blocos entre threads.
- A junção depende de PDFs sem tags e com árvore de páginas plana, como o Typst gera. Os testes
  conferem as páginas, as caixas e o determinismo de PDFs juntados.
