# 0087. Painel organizado por seções

- **Status:** Aceito
- **Data:** 2026-10-15
- **Complementa:** [0021](0021-interface-e-pwa.md) (sistema de design) e
  [0060](0060-interface-pensada-para-o-celular.md) (interface pensada para o celular)

## Contexto

A página do evento cresceu uma aba por fase do produto: doze abas numa tira horizontal (mais a
Equipe, que virou um botão no cabeçalho). A 1280 px a tira já não cabia inteira, e no celular só
três ou quatro abas apareciam; quem chegava não via o conjunto nem a ordem do trabalho. Cada aba
começava por um parágrafo de explicação, seguido do formulário de criação sempre aberto (novo lote,
novo vendedor, novo link, novo arquivo) e só então do que existia. O cartão de cada vendedor
mostrava tudo de uma vez: números, equação do acerto, meta, reservas, barra do dinheiro, quatro
botões, histórico, bilheteria e o link. A administração, por sua vez, já tinha uma navegação
lateral agrupada: o painel usava dois jeitos de navegar.

Uma auditoria com capturas em 390 e 1280 px, nos dois temas, com dados de um evento em preparação,
mediu o efeito: a aba Vendedores tinha quase 2.900 px de altura no computador, e a tela do evento
no celular gastava metade da primeira dobra entre cabeçalho e tira de abas.

## Opções consideradas

1. **Manter a tira e enxugar os textos.** Resolve pouco: o problema é a quantidade de lugares
   sem hierarquia, não só o texto.
2. **Navegação por seções agrupadas, compartilhada entre o evento e a administração,** com um
   cabeçalho padrão por seção, criação em diálogos e cartões que mostram o essencial e dobram o
   resto. Um componente, as mesmas regras nos dois lugares.
3. **Uma página (rota) por seção do evento.** Mais endereços para manter, a volta ao evento vira
   navegação de verdade e o cabeçalho do evento se repete em cada página.

## Decisão

Opção 2. Regras do painel, válidas para toda seção nova:

- **`SectionNav`** (`components/panel/section-nav.tsx`) é a navegação de qualquer página com
  muitas seções. Recebe grupos de itens (ícone, nome, uma linha do que a seção faz e uma marca
  opcional). Em telas grandes (`lg`) é uma lista fixa ao lado do conteúdo, com todas as seções à
  vista; nas menores, uma barra com o grupo e o nome da seção atual, que abre uma folha com todas
  elas e o que cada uma faz. O evento (`components/event/event-nav.tsx`, grupos em
  `TAB_GROUPS`) e a administração usam o mesmo componente; a Equipe entrou no grupo Pessoas.
- **Marcas na navegação:** um ponto âmbar na seção onde a lista do que falta (ADR 0078) ainda tem
  um item obrigatório que a pessoa pode resolver; um ponto verde pulsando em Ao vivo no dia do
  evento; um contador na Moderação do admin. A barra do celular repete a marca da seção atual e
  avisa, com um ponto, de um contador em outra seção.
- **`TabHeader`** (`components/event/tab-header.tsx`) abre toda seção do evento: o nome (abaixo
  de `lg` só para leitores de tela, porque a barra já o mostra), a linha curta de
  `sections.hints`, um `?` com a explicação longa (o antigo `intro`) e as ações da seção inteira
  (o botão principal à direita; em largura total no celular). Com nada a fazer nem a explicar, a
  linha some no celular.
- **Criar é um diálogo**: Novo lote, Novo vendedor, Enviar um ingresso, Novo link de acesso, Novo
  arquivo e Cancelar uma faixa saem do cabeçalho da seção e abrem uma folha. A seção mostra o que
  existe; o estado vazio leva o mesmo botão. O diálogo de cancelar uma faixa é a própria
  confirmação (o texto de alerta vira a descrição e o botão diz o que cancela).
- **Cartões mostram o essencial e dobram o resto.** O vendedor: nome, números, dinheiro recebido ×
  devido e o link; a equação, a meta, as reservas e o histórico abrem pelo pé do cartão. O que é
  configuração (quem manda o ingresso, Pix, ranking) fica no fim da seção, sob um título pequeno.
- **Quatro números lado a lado só a partir de `xl`:** a seção vive ao lado da navegação, e abaixo
  disso os valores truncavam. Grades de `Stat` dentro do evento usam `grid-cols-2 xl:grid-cols-4`.
- **A Visão geral** começa pela lista do que falta e mostra os resultados (vendas, entradas e a
  curva da porta) só a partir do dia do evento; antes, as vendas estão em Vendedores e Relatório.
- O painel passa a `max-w-7xl` (o cabeçalho, os avisos e o conteúdo), e as ações raras de uma
  linha (categorias e revogar um link da portaria) vão para um menu `⋮`.

## Consequências

- `tabs.ts` mantém `TABS`, `TAB_GROUPS` e os slugs: os endereços (`?aba=`, inclusive o retorno
  da Stripe em `aba=lotes`) e as notificações não mudam. `STRIP_TABS`, a folha Seções e as setas
  da tira saíram; o teste ponta a ponta clica na navegação.
- Seção nova do evento: entra em `TABS`/`TAB_GROUPS`, ganha ícone em `TAB_ICONS`, nome e linha
  em `texts/pt-BR/event.ts` (`tabs`, `sections.hints`, com a versão das fichas quando mudar) e
  começa por um `TabHeader`. Página nova com muitas seções usa `SectionNav`.
- A coluna fixa do editor do ingresso ficou mais alta (`xl:top-24`): não há mais a tira sob o
  cabeçalho.
- A verificação foi feita com capturas antes e depois; o critério foi a altura e o número de
  blocos de cada tela, e o que aparece na primeira dobra do celular.
