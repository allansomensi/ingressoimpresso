// Guias para quem organiza evento (app/guias), escritos para as buscas de quem ainda está
// pesquisando ("como fazer ingresso para festa", "rifa numerada"): ADR 0081.
//
// Links internos dentro dos textos usam a forma [texto](/caminho) e são conferidos por
// test/seo-content.test.ts. Preços citados são texto: se a tabela mudar no admin, revise aqui.

import { richTextPlain } from "@/lib/rich-text";
import type { TemplateId } from "@/lib/templates/catalog";

export type GuideBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: readonly string[] }
  | { kind: "ol"; items: readonly string[] }
  | { kind: "tip"; text: string };

export type GuideSection = { id: string; heading: string; blocks: readonly GuideBlock[] };

export type SeoGuide = {
  slug: string;
  label: string; // nome curto, nos links e na trilha
  title: string; // <title>, até ~60 caracteres
  description: string; // meta description, 70 a 160 caracteres
  h1: string;
  lead: string;
  publishedAt: string; // AAAA-MM-DD
  updatedAt: string; // AAAA-MM-DD
  sections: readonly GuideSection[];
  faq: readonly { question: string; answer: string }[];
  templates: readonly TemplateId[]; // modelos sugeridos no fim do guia (e na imagem de compartilhamento)
  events: readonly string[]; // páginas de /ingresso-para ligadas ao guia
  cta: string;
};

const PUBLISHED = "2026-10-14";

export const seoGuides: readonly SeoGuide[] = [
  {
    slug: "como-fazer-ingresso-para-festa",
    label: "Como fazer ingresso para festa",
    title: "Como fazer ingresso para festa: passo a passo com QR code",
    description:
      "Aprenda a fazer ingresso para festa numerado e com QR code: o que escrever, como imprimir, dividir entre vendedores e conferir na entrada.",
    h1: "Como fazer ingresso para festa, do modelo à entrada",
    lead: "Fazer o ingresso é a parte fácil. O trabalho está em numerar, saber quem vendeu cada um e barrar a cópia na porta. Este guia mostra o caminho inteiro, para festa, show, baile ou qualquer evento em que o ingresso é vendido na mão.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "o-que-escrever",
        heading: "O que todo ingresso precisa ter",
        blocks: [
          { kind: "p", text: "Antes de pensar em cores, defina o que vai impresso. Um ingresso completo responde às dúvidas de quem compra e evita discussão na porta:" },
          {
            kind: "ul",
            items: [
              "Nome do evento, igual ao da divulgação.",
              "Data com o dia da semana e o horário de abertura dos portões.",
              "Local com endereço: quem vem de fora agradece.",
              "Preço, ou a palavra cortesia nos convites.",
              "Um número único em cada ingresso.",
              "Um QR code para conferir na entrada.",
              "Regras curtas: idade mínima, se é preciso documento e se há reembolso.",
              "Um contato da organização (Instagram ou WhatsApp).",
            ],
          },
          { kind: "tip", text: "Escreva a data por extenso no ingresso (\"sábado, 20 de junho, 19h\"). Erro de data é o defeito mais caro de corrigir depois de impresso." },
        ],
      },
      {
        id: "modelo",
        heading: "1. Escolha o modelo e o tamanho",
        blocks: [
          { kind: "p", text: "Não existe um tamanho oficial de ingresso. O formato mais comum é o retangular, parecido com o de cinema: os modelos do Ingresso Impresso têm 15 × 5,5 cm, o convite de formatura é vertical (6 × 12 cm) e a rifa é compacta, com canhoto para anotar o comprador." },
          { kind: "p", text: "Comece por um [modelo pronto para o seu tipo de evento](/modelos): o nome, a data, o local e o preço entram sozinhos, e você troca cores, fontes e textos arrastando. Se a festa já tem uma arte, envie a imagem e posicione o número e o QR em cima dela." },
        ],
      },
      {
        id: "numeracao",
        heading: "2. Numere cada ingresso",
        blocks: [
          { kind: "p", text: "Número é controle. Com ele você sabe quantos ingressos existem, quais foram entregues a cada vendedor e quais voltaram sem vender. Numerar à mão, com carimbo ou na gráfica funciona, mas não impede que alguém imprima o mesmo número duas vezes." },
          { kind: "p", text: "No Ingresso Impresso a numeração sai sozinha, sem repetir, e você entrega faixas de números a cada vendedor (0001 a 0050 para a Ana, 0051 a 0100 para o Bruno). O painel passa a mostrar quem vendeu quanto e quanto falta acertar." },
        ],
      },
      {
        id: "qr-code",
        heading: "3. Use um QR code que não dá para copiar",
        blocks: [
          { kind: "p", text: "Muita gente coloca no ingresso um QR que leva a um link ou que só tem o número escrito. Esse QR qualquer um gera de novo em um site grátis, e aí o ingresso falso passa." },
          { kind: "p", text: "O QR do Ingresso Impresso leva uma assinatura digital feita com a chave do seu evento, que nunca sai do servidor. Sem ela não dá para criar um ingresso que passe na porta. E a cópia de um ingresso verdadeiro (xerox, foto, print no WhatsApp) entra só uma vez: a segunda leitura é barrada. Veja mais em [como evitar ingresso falso](/guias/como-evitar-ingresso-falso)." },
        ],
      },
      {
        id: "impressao",
        heading: "4. Imprima em casa ou na gráfica",
        blocks: [
          { kind: "p", text: "Para poucas unidades, a impressora de casa resolve: baixe o PDF A4 com marcas de corte, imprima em papel mais grosso e corte com régua e estilete. Para centenas de ingressos, leve à gráfica o PDF com sangria, um ingresso por página." },
          { kind: "p", text: "O guia [como imprimir ingressos](/guias/como-imprimir-ingressos) explica papel, sangria e por que a gráfica precisa ser de impressão digital." },
        ],
      },
      {
        id: "venda",
        heading: "5. Distribua e acompanhe as vendas",
        blocks: [
          { kind: "p", text: "Em festa vendida na mão, quem vende são os amigos, a banda, os alunos ou os voluntários. Cada um leva a sua faixa de números e, se quiser, um link no celular para marcar o que vendeu e para quem. Quem comprou de longe recebe o ingresso pelo WhatsApp e mostra o QR na tela." },
          { kind: "p", text: "Os detalhes do acerto estão em [venda de ingressos com vendedores](/guias/venda-de-ingressos-com-vendedores)." },
        ],
      },
      {
        id: "entrada",
        heading: "6. Confira na entrada com o celular",
        blocks: [
          { kind: "p", text: "Mande o link da portaria para a equipe. Cada celular vira um leitor: tela verde para entrar, vermelha para barrar e amarela quando é preciso olhar com atenção, com som e lanterna para lugar escuro. A conferência funciona sem internet, o que importa em salão, quadra e sítio." },
          { kind: "p", text: "Para preparar a porta, leia [controle de entrada de evento pelo celular](/guias/controle-de-entrada-de-evento)." },
        ],
      },
      {
        id: "word-canva",
        heading: "Dá para fazer o ingresso no Word ou no Canva?",
        blocks: [
          { kind: "p", text: "Dá para desenhar, e o Canva é ótimo para a arte. O problema começa depois: numerar centenas de ingressos, colocar um QR diferente em cada um, saber quem vendeu o quê e impedir a cópia na porta. Um arquivo de imagem não faz nada disso." },
          { kind: "p", text: "A saída é usar as duas coisas: crie a arte onde preferir, envie no Ingresso Impresso e deixe a numeração, o QR, os vendedores e a portaria com a gente." },
        ],
      },
    ],
    faq: [
      {
        question: "Quanto custa fazer ingresso para festa?",
        answer: "No Ingresso Impresso os primeiros 30 ingressos são grátis. Depois, você paga por lote, de R$ 0,15 a R$ 0,05 por ingresso conforme a quantidade, sem mensalidade e sem porcentagem sobre a venda. A impressão fica por sua conta, em casa ou na gráfica.",
      },
      {
        question: "Qual o tamanho ideal de um ingresso?",
        answer: "Não há tamanho oficial. Um bom formato é 15 × 5,5 cm, que cabe na carteira e deixa espaço para o QR. O QR precisa de pelo menos 2,2 cm de lado para ser lido com facilidade.",
      },
      {
        question: "Preciso de internet na festa para conferir os ingressos?",
        answer: "Não. Abra o link da portaria uma vez com internet e o celular continua lendo ingressos mesmo sem sinal.",
      },
      {
        question: "Posso mandar o ingresso pelo celular em vez de imprimir?",
        answer: "Pode. O ingresso digital é o mesmo QR do papel, enviado por link no WhatsApp com o nome de quem comprou. Você pode misturar papel e celular no mesmo evento.",
      },
    ],
    templates: ["party", "arraia", "show"],
    events: ["festa", "baile", "festa-junina"],
    cta: "Fazer os ingressos da minha festa",
  },
  {
    slug: "como-evitar-ingresso-falso",
    label: "Como evitar ingresso falso",
    title: "Ingresso falso: como evitar cópias no seu evento",
    description:
      "Xerox, foto no WhatsApp e ingresso feito em casa: veja como o ingresso falso acontece e como barrar a cópia na entrada, mesmo sem internet.",
    h1: "Como evitar ingresso falso e cópia no seu evento",
    lead: "Ingresso falso quase nunca é obra de um falsificador profissional. É a xerox colorida, a foto repassada no grupo, o número impresso duas vezes. Entender como a fraude acontece mostra o que realmente protege a porta.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "como-acontece",
        heading: "Como o ingresso falso aparece",
        blocks: [
          {
            kind: "ul",
            items: [
              "Cópia de um ingresso verdadeiro, em xerox colorida ou impressora de casa.",
              "Foto ou print do ingresso repassado no WhatsApp para várias pessoas.",
              "Ingresso inventado a partir da arte divulgada nas redes sociais.",
              "Número repetido: o mesmo bloco impresso duas vezes, por engano ou de propósito.",
              "Bloco perdido ou roubado, usado por quem não pagou.",
            ],
          },
          { kind: "p", text: "Papel especial, holograma e carimbo dificultam a primeira e a terceira fraude, mas custam caro e não resolvem a foto no celular nem o número repetido." },
        ],
      },
      {
        id: "o-que-nao-funciona",
        heading: "O que não protege de verdade",
        blocks: [
          { kind: "p", text: "Um QR code que só leva a um link ou que só traz o número escrito é tão fácil de copiar quanto o resto do ingresso: qualquer site gera um igual. Conferir nome em lista de papel também não ajuda, porque o nome não está no ingresso e a fila cresce." },
          { kind: "p", text: "Marcar o ingresso com caneta ou rasgar o canhoto na entrada só funciona se todo mundo entrar pela mesma pessoa, que precisa lembrar de cada número. Com duas portas, a cópia entra pela outra." },
        ],
      },
      {
        id: "qr-assinado",
        heading: "O que protege: QR assinado e conferência de cada número",
        blocks: [
          { kind: "p", text: "A proteção que funciona tem duas partes. A primeira é a assinatura digital: cada QR leva uma assinatura feita com a chave secreta do evento. O celular da portaria confere a assinatura, e um QR inventado, de outro evento ou com o número alterado é barrado na hora." },
          { kind: "p", text: "A segunda é lembrar quem já entrou. A cópia de um ingresso verdadeiro tem uma assinatura válida, então o que a barra é o número: a primeira leitura entra e a segunda aparece em vermelho, com a hora em que o original passou. Por isso a duplicidade é conferida pelo número do ingresso, nunca pela imagem." },
          { kind: "tip", text: "Quem vai comprar ingresso de outra pessoa pode [conferir se o QR é verdadeiro](/conferir) antes de pagar, de graça e sem cadastro." },
        ],
      },
      {
        id: "sem-internet",
        heading: "E se a internet cair na porta?",
        blocks: [
          { kind: "p", text: "A portaria do Ingresso Impresso decide no próprio celular, sem esperar a rede. Com um celular só, a cópia é barrada mesmo offline. Com vários celulares sem sinal ao mesmo tempo, existe um limite honesto: se a cópia passar em um celular e o original em outro antes de eles se falarem, as duas entram, e o caso aparece no relatório quando o sinal volta, com hora, celular e vendedor da faixa." },
          { kind: "p", text: "Na prática: com internet, a cópia é barrada em qualquer celular. Sem internet, use um celular por fila. Mais detalhes em [controle de entrada de evento](/guias/controle-de-entrada-de-evento)." },
        ],
      },
      {
        id: "bloco-perdido",
        heading: "Bloco perdido, número cancelado",
        blocks: [
          { kind: "p", text: "Se um vendedor perder um bloco, cancele aquela faixa de números no painel. A partir daí, os celulares da portaria barram esses números. Se alguém perdeu o ingresso que comprou, a segunda via cancela o número antigo e manda um novo, da mesma categoria, para a mesma pessoa." },
        ],
      },
      {
        id: "checklist",
        heading: "Checklist antifraude para o dia do evento",
        blocks: [
          {
            kind: "ol",
            items: [
              "Não divulgue foto do ingresso com o QR visível nas redes sociais.",
              "Entregue faixas de números a cada vendedor e anote o que voltou.",
              "Cancele no painel os números perdidos ou não vendidos.",
              "Abra o link da portaria em cada celular com internet, antes de abrir os portões.",
              "Faça um ensaio com a folha de ensaio: a leitura é testada e ninguém entra de verdade.",
              "Se o sinal for ruim, deixe um celular por fila.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        question: "Dá para falsificar um ingresso do Ingresso Impresso?",
        answer: "Criar um ingresso novo que passe na porta exige a chave secreta do evento, que nunca sai do servidor. O que acontece é a cópia de um ingresso verdadeiro, e ela entra uma vez só: a segunda leitura é barrada.",
      },
      {
        question: "O comprador mostrou um print do ingresso. Ele entra?",
        answer: "Entra, se aquele número ainda não passou na porta. O print é o mesmo QR do papel. Se outra pessoa já entrou com o mesmo número, o celular mostra que ele já foi usado.",
      },
      {
        question: "Como saber se um ingresso que vou comprar é verdadeiro?",
        answer: "Use a página Conferir ingresso: leia o QR com a câmera ou envie uma foto e veja o evento, o número e se ele foi cancelado. Ela não diz se o ingresso já foi usado nem quem comprou.",
      },
    ],
    templates: ["show", "party", "classic"],
    events: ["show-de-banda", "festa", "baile"],
    cta: "Criar ingressos que não dá para copiar",
  },
  {
    slug: "controle-de-entrada-de-evento",
    label: "Controle de entrada de evento",
    title: "Controle de entrada de evento pelo celular, sem internet",
    description:
      "Como organizar a entrada do evento com o celular: leitor de QR code que funciona offline, várias portas, lista de nomes e contagem ao vivo.",
    h1: "Controle de entrada de evento pelo celular, mesmo sem internet",
    lead: "A fila da porta é a primeira impressão do evento. Com os celulares da própria equipe dá para conferir cada ingresso em segundos, barrar cópias e saber quantas pessoas já entraram, sem comprar leitor nem depender do sinal do salão.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "lista-de-papel",
        heading: "Por que a lista de papel trava a porta",
        blocks: [
          { kind: "p", text: "Procurar nome em lista impressa leva tempo, não barra cópia e não conversa com a outra porta. No fim da noite ninguém sabe quantas pessoas entraram de verdade. Um leitor de QR resolve as três coisas, desde que não dependa da internet do local." },
        ],
      },
      {
        id: "como-funciona",
        heading: "Como funciona a portaria no celular",
        blocks: [
          {
            kind: "ol",
            items: [
              "No painel, crie um link de portaria para cada porta ou para cada pessoa da equipe.",
              "Cada pessoa abre o link no celular, com internet, antes do evento. O celular baixa o que precisa para conferir sozinho.",
              "Na hora, é só apontar a câmera para o QR. A tela fica verde (pode entrar), vermelha (barrado, com o motivo) ou amarela (atenção), com som.",
              "Quando há sinal, os celulares trocam as leituras entre si em poucos segundos. Sem sinal, guardam tudo e sincronizam quando a conexão volta.",
            ],
          },
          { kind: "p", text: "Funciona no navegador do Android e do iPhone, sem instalar aplicativo, e o número de celulares não muda o preço." },
        ],
      },
      {
        id: "sem-internet",
        heading: "Sem internet: o que muda",
        blocks: [
          { kind: "p", text: "A decisão de cada leitura sai do próprio celular, com a mesma criptografia do servidor, então a fila não para quando o sinal cai. O cuidado é com várias portas offline ao mesmo tempo: uma cópia lida em um celular e o original em outro, antes de eles sincronizarem, entram os dois. O relatório mostra o caso depois." },
          { kind: "tip", text: "Sem sinal no local, deixe um celular por fila e leve um carregador portátil. Com sinal, use quantos celulares quiser na mesma porta." },
        ],
      },
      {
        id: "recursos",
        heading: "Recursos que ajudam no dia",
        blocks: [
          {
            kind: "ul",
            items: [
              "Modo ensaio: teste a leitura com a folha de ensaio antes de abrir os portões, sem registrar entradas.",
              "Porta por categoria: um link que aceita só a pista, outro só a área VIP.",
              "Lista de nomes: convidados sem ingresso entram pelo nome, no mesmo celular.",
              "Bilheteria na porta: o ingresso vendido na hora já conta como entrada.",
              "Aba Ao vivo no painel: quantas pessoas entraram, por porta e por hora.",
              "Lanterna para ler QR em lugar escuro.",
            ],
          },
        ],
      },
      {
        id: "planejamento",
        heading: "Quantos celulares e pessoas por porta",
        blocks: [
          { kind: "p", text: "Uma leitura leva cerca de dois segundos, incluindo o tempo de a pessoa mostrar o ingresso. Na prática, cada celular atende bem algumas centenas de pessoas por hora. Para um evento de 300 pessoas que chegam na mesma meia hora, dois celulares dão conta; para 1.000, pense em quatro filas. Separe uma pessoa para resolver os casos amarelos e vermelhos fora da fila, para ela não parar." },
        ],
      },
      {
        id: "checklist",
        heading: "Checklist da portaria",
        blocks: [
          {
            kind: "ol",
            items: [
              "Crie os links da portaria no dia anterior e mande para a equipe.",
              "Peça para cada pessoa abrir o link com internet e permitir a câmera.",
              "Faça o ensaio com a folha de ensaio.",
              "Combine o que fazer com tela amarela e vermelha.",
              "Deixe celulares carregados e um de reserva.",
              "Acompanhe a aba Ao vivo durante o evento.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        question: "Preciso comprar um leitor de QR code?",
        answer: "Não. Qualquer celular com câmera vira leitor pelo navegador, sem instalar aplicativo.",
      },
      {
        question: "Quantos celulares posso usar na portaria?",
        answer: "Quantos quiser, sem custo adicional. Cada celular aparece no painel, e você pode desligar um link a qualquer momento.",
      },
      {
        question: "A equipe da portaria precisa ter conta?",
        answer: "Não. Ela recebe um link de acesso. O link pode ser trocado por um novo se vazar, e os celulares que já estavam conectados continuam funcionando.",
      },
      {
        question: "Dá para controlar a entrada de evento gratuito?",
        answer: "Dá. O ingresso controla a entrada mesmo sem valor, e convidados também podem entrar pela lista de nomes.",
      },
    ],
    templates: ["talk", "church", "sports"],
    events: ["palestra-e-curso", "evento-de-igreja", "formatura"],
    cta: "Preparar a portaria do meu evento",
  },
  {
    slug: "venda-de-ingressos-com-vendedores",
    label: "Venda com vendedores",
    title: "Venda de ingressos com vendedores: como organizar o acerto",
    description:
      "Como dividir os ingressos entre vendedores, acompanhar quem vendeu e quem pagou e fazer o acerto sem caderno nem planilha no fim do evento.",
    h1: "Como organizar a venda de ingressos com vendedores",
    lead: "Banda, turma, igreja e associação vendem ingresso pela mão de muita gente. Funciona muito bem, até a hora do acerto: quem levou quantos, quem já pagou, o que voltou. Com faixas de números e um link para cada vendedor, o acerto fica pronto sozinho.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "faixas",
        heading: "Entregue faixas de números, não pilhas de ingressos",
        blocks: [
          { kind: "p", text: "Dar \"um monte de ingressos\" para cada vendedor é a origem de quase toda confusão. Entregue uma faixa: Ana leva do 0001 ao 0050, Bruno do 0051 ao 0100. Com isso, qualquer número que aparecer na porta tem dono, e o que volta sem vender é fácil de conferir." },
          { kind: "p", text: "No Ingresso Impresso, você cadastra os vendedores e atribui as faixas no painel. Dá para entregar todos os números livres de uma vez e imprimir um PDF só com a faixa de cada vendedor." },
        ],
      },
      {
        id: "link-do-vendedor",
        heading: "Um link para cada vendedor, sem conta e sem senha",
        blocks: [
          { kind: "p", text: "Cada vendedor recebe um link privado no celular. Nele, marca o que vendeu e para quem, reserva um número para alguém que vai pagar depois e vê o próprio acerto. O link funciona até sem internet: as marcações ficam guardadas e sobem quando o sinal volta." },
          { kind: "p", text: "Se você permitir, o vendedor também manda o ingresso digital pelo WhatsApp para quem comprou de longe, direto do link dele." },
        ],
      },
      {
        id: "acerto",
        heading: "O acerto: recebimentos e devoluções",
        blocks: [
          { kind: "p", text: "O acerto de cada vendedor é simples de explicar: números vendidos vezes o preço, menos o que ele já repassou. No painel você registra os recebimentos (\"Ana pagou R$ 400 no Pix\") e as devoluções (\"Bruno devolveu do 0091 ao 0100\"). O saldo aparece no relatório e pode ir para o WhatsApp do vendedor em uma mensagem pronta." },
          { kind: "p", text: "Com categorias de ingresso (pista, VIP, meia), cada faixa pode ter o seu preço, e o acerto usa o preço de cada número." },
          { kind: "tip", text: "Combine uma data de acerto parcial, uma semana antes do evento. Assim você sabe o que já vendeu e redistribui números de quem está parado." },
        ],
      },
      {
        id: "metas",
        heading: "Metas e ranking para animar a turma",
        blocks: [
          { kind: "p", text: "Em formatura e em escola, uma meta por vendedor e um ranking opcional ajudam a vender. O ranking mostra só o primeiro nome e a inicial dos outros vendedores, e você liga ou desliga quando quiser." },
        ],
      },
      {
        id: "imprevistos",
        heading: "Quando algo dá errado",
        blocks: [
          {
            kind: "ul",
            items: [
              "Vendedor perdeu o bloco: cancele a faixa no painel e os números passam a ser barrados na porta.",
              "Comprador perdeu o ingresso: a segunda via cancela o número antigo e manda um novo para a mesma pessoa.",
              "Vendedor desistiu: registre como devolvidos os números que ele não vendeu (eles deixam de valer na porta) e entregue números livres a quem vai vender no lugar dele.",
              "Vendedor imprimiu o mesmo número duas vezes: a segunda cópia é barrada na porta, e o relatório mostra a tentativa na faixa dele.",
            ],
          },
        ],
      },
      {
        id: "prestacao",
        heading: "Prestação de contas no fim",
        blocks: [
          { kind: "p", text: "Depois do evento, a aba de relatório junta vendidos, recebido de cada vendedor, entradas na porta e, se você lançar, despesas e receitas. Sai em PDF e planilha, pronto para a diretoria, a comissão de formatura ou a igreja." },
        ],
      },
    ],
    faq: [
      {
        question: "O vendedor precisa criar conta?",
        answer: "Não. Ele recebe um link privado, abre no celular e já vê os números dele. Se o link vazar, você gera outro.",
      },
      {
        question: "Dá para ver quem vendeu mais?",
        answer: "Dá. O relatório mostra vendidos e acerto por vendedor, e você pode ligar o ranking com metas para os próprios vendedores verem.",
      },
      {
        question: "O dinheiro da venda passa pelo Ingresso Impresso?",
        answer: "Não. Os vendedores recebem do jeito de sempre (dinheiro, Pix, transferência) e repassam para você. O Ingresso Impresso só controla os números e o acerto.",
      },
    ],
    templates: ["show", "graduation", "raffle"],
    events: ["show-de-banda", "formatura", "festa-de-escola"],
    cta: "Organizar meus vendedores",
  },
  {
    slug: "como-fazer-rifa-numerada",
    label: "Rifa numerada para imprimir",
    title: "Rifa numerada para imprimir: como organizar os números",
    description:
      "Como imprimir rifa numerada com canhoto, dividir os números entre os vendedores e controlar quem vendeu cada um. Inclui o que a lei exige.",
    h1: "Rifa numerada para imprimir: números, canhoto e vendedores",
    lead: "Turma de formatura, time do bairro e igreja usam a rifa para juntar dinheiro. O trabalho de verdade é controlar os números: imprimir sem repetir, saber quem vendeu cada um e quem comprou. Antes, porém, vale entender o que a lei pede.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "lei",
        heading: "Antes de tudo: o que a lei diz",
        blocks: [
          { kind: "p", text: "No Brasil, rifa e sorteio com venda de bilhete dependem de autorização prévia do governo federal (Lei 5.768/1971 e regulamentação do Ministério da Fazenda). Sem autorização, a rifa é contravenção penal (art. 51 do Decreto-Lei 3.688/1941). Antes de vender, confira se o seu caso pode ser autorizado e como pedir." },
          { kind: "tip", text: "O Ingresso Impresso imprime e controla os números. O sorteio, os prêmios e a autorização ficam com quem organiza a rifa." },
        ],
      },
      {
        id: "modelo",
        heading: "Como deve ser o bilhete da rifa",
        blocks: [
          { kind: "p", text: "Um bom bilhete tem duas partes. O canhoto fica com quem vendeu, com o número e espaço para o nome e o telefone do comprador. O bilhete vai com o comprador, com o número em destaque, o prêmio, a data do sorteio e o nome da organização." },
          { kind: "p", text: "O [modelo de rifa numerada com canhoto](/modelos/rifa) já vem assim: número grande, canhoto com nome e telefone, 12 por folha A4 com linha de corte." },
        ],
      },
      {
        id: "numeros",
        heading: "Quantos números e como dividir",
        blocks: [
          { kind: "p", text: "Comece pela conta ao contrário: quanto a turma precisa arrecadar, dividido pelo preço de cada número. Para juntar R$ 2.500 a R$ 5 cada, são 500 números. Com 20 vendedores, 25 números para cada um." },
          { kind: "p", text: "Entregue faixas fixas: do 0001 ao 0025 para a Ana, do 0026 ao 0050 para o Caio. Assim, o canhoto de qualquer número tem dono, e o que voltou sem vender é fácil de conferir." },
        ],
      },
      {
        id: "controle",
        heading: "Controle de quem vendeu e quem pagou",
        blocks: [
          { kind: "p", text: "Os canhotos continuam sendo o registro de quem comprou. O painel cuida do resto: quanto cada vendedor tem a acertar, o que já pagou e quais números voltaram. Cada vendedor também pode marcar as vendas no próprio celular, por um link sem conta." },
          { kind: "p", text: "Para o passo a passo do acerto, veja [venda com vendedores](/guias/venda-de-ingressos-com-vendedores)." },
        ],
      },
      {
        id: "impressao",
        heading: "Imprimir a rifa em casa",
        blocks: [
          { kind: "p", text: "Rifa é o caso clássico de impressão caseira: papel sulfite 90 g ou 120 g resolve, e a folha A4 sai com marcas de corte. Você pode gerar um PDF por vendedor, só com a faixa dele, e imprimir conforme for entregando." },
        ],
      },
      {
        id: "venda",
        heading: "Divulgação e venda dos números",
        blocks: [
          { kind: "p", text: "Combine com os vendedores um prazo para vender e um dia de acerto antes do sorteio. Quem vende melhor costuma ser quem conhece o comprador: família, vizinhos e colegas de trabalho. Uma meta por vendedor e um ranking opcional ajudam a manter a turma animada." },
          { kind: "p", text: "Na divulgação, diga com clareza o prêmio, o preço do número, a data do sorteio e como ele será feito. Transparência evita reclamação depois." },
        ],
      },
      {
        id: "erros",
        heading: "Erros que atrapalham a rifa",
        blocks: [
          {
            kind: "ul",
            items: [
              "Números repetidos por erro de impressão ou de numeração à mão.",
              "Bloco entregue sem anotar a faixa de números de cada vendedor.",
              "Canhoto sem telefone do comprador: no dia do sorteio, ninguém acha o ganhador.",
              "Acerto só no dia do sorteio, com dinheiro e números misturados.",
              "Começar a vender antes de saber se a rifa pode ser autorizada.",
            ],
          },
          { kind: "tip", text: "Leve os canhotos organizados por faixa no dia do sorteio. Com o número sorteado, você sabe na hora em qual bloco procurar." },
        ],
      },
    ],
    faq: [
      {
        question: "Quantos números de rifa cabem numa folha A4?",
        answer: "No modelo de rifa do Ingresso Impresso, 12 por folha, cada um com o canhoto para nome e telefone do comprador.",
      },
      {
        question: "O Ingresso Impresso faz o sorteio?",
        answer: "Não. A plataforma imprime e controla os números. O sorteio, os prêmios e a autorização exigida por lei ficam com quem organiza.",
      },
      {
        question: "Dá para usar o mesmo modelo para bingo ou cartela?",
        answer: "O modelo de rifa traz um número por bilhete. Cartelas de bingo, com vários números em grade, não são geradas.",
      },
    ],
    templates: ["raffle", "classic", "charity"],
    events: ["formatura", "festa-de-escola", "jantar-beneficente"],
    cta: "Imprimir minha rifa numerada",
  },
  {
    slug: "vender-ingresso-sem-taxa",
    label: "Vender ingresso sem taxa",
    title: "Como vender ingresso sem pagar taxa sobre cada venda",
    description:
      "Plataformas de venda on-line cobram uma porcentagem de cada ingresso. Veja quando vale vender na mão e como fazer isso com controle e QR code.",
    h1: "Como vender ingresso sem pagar taxa sobre cada venda",
    lead: "Vender ingresso pela internet é prático, mas quase sempre custa uma porcentagem do valor, cobrada de você ou de quem compra. Para evento pequeno e médio, em que o público é conhecido, vender na mão com controle costuma sair muito mais barato.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "taxas",
        heading: "Como as taxas funcionam",
        blocks: [
          { kind: "p", text: "Plataformas de venda on-line costumam cobrar uma porcentagem de cada ingresso vendido, às vezes somada a uma taxa fixa e à tarifa do meio de pagamento. Algumas repassam a cobrança para o comprador como \"taxa de conveniência\", o que encarece o ingresso. Em ambos os casos, o custo cresce junto com o preço do ingresso." },
          { kind: "p", text: "Isso faz sentido quando a plataforma vende para um público que você não alcança. Quando quem compra é a família dos formandos, o público da banda ou a comunidade da igreja, você já faz a venda: a porcentagem paga só a cobrança." },
        ],
      },
      {
        id: "na-mao",
        heading: "Vender na mão, com controle",
        blocks: [
          { kind: "p", text: "Vender na mão é receber em dinheiro ou Pix, direto na sua conta ou na dos vendedores. O que faltava era o controle que a plataforma dava: numeração, quem vendeu, quem pagou, ingresso que não dá para copiar e conferência na entrada." },
          { kind: "p", text: "É isso que o Ingresso Impresso entrega. Você paga por lote de ingressos gerados, em centavos por ingresso, e não por venda. O dinheiro do ingresso não passa pela plataforma." },
        ],
      },
      {
        id: "conta",
        heading: "Fazendo a conta",
        blocks: [
          { kind: "p", text: "Imagine 200 ingressos a R$ 30, R$ 6.000 em vendas. Uma taxa de 10% sobre a venda custaria R$ 600. No Ingresso Impresso, os 200 ingressos custam menos de R$ 30 pela tabela atual, e os primeiros 30 de cada conta são grátis. Faça a sua conta no [simulador de preços](/precos)." },
        ],
      },
      {
        id: "online",
        heading: "E quem quer comprar pela internet?",
        blocks: [
          { kind: "p", text: "Dá para atender quem compra de longe sem checkout: a pessoa paga por Pix e você manda o ingresso digital pelo WhatsApp, com o nome dela. É o mesmo QR do papel, que abre no celular até sem internet. Para muitas vendas, gere uma planilha com vários links de uma vez." },
          { kind: "p", text: "Veja como em [ingresso pelo WhatsApp](/guias/ingresso-pelo-whatsapp)." },
        ],
      },
      {
        id: "quando-nao",
        heading: "Quando uma plataforma de venda on-line faz mais sentido",
        blocks: [
          { kind: "p", text: "Se o seu evento depende de vender para desconhecidos pela internet, com pagamento por cartão parcelado e página de evento divulgada em um marketplace, uma plataforma de venda on-line pode valer a taxa. O Ingresso Impresso é para quem já tem o público e quer controle sem pagar porcentagem." },
        ],
      },
      {
        id: "organizar",
        heading: "Como organizar a venda na mão",
        blocks: [
          {
            kind: "ol",
            items: [
              "Defina o preço, as categorias (inteira, meia, VIP) e quantos ingressos vai gerar.",
              "Escolha quem vende e entregue uma faixa de números a cada pessoa.",
              "Combine como o dinheiro chega até você: Pix na sua conta, dinheiro no acerto semanal ou os dois.",
              "Mande o ingresso digital para quem compra de longe, logo depois do Pix.",
              "Registre no painel o que cada vendedor repassou e o que devolveu.",
              "No dia, confira a entrada com os celulares da equipe e veja o relatório no fim.",
            ],
          },
          { kind: "p", text: "Para o passo a passo do acerto, veja [venda de ingressos com vendedores](/guias/venda-de-ingressos-com-vendedores)." },
        ],
      },
    ],
    faq: [
      {
        question: "O Ingresso Impresso cobra porcentagem dos ingressos vendidos?",
        answer: "Não. Você paga só pelos ingressos gerados, por lote, de R$ 0,15 a R$ 0,05 cada conforme a quantidade, com 30 grátis para começar. O valor que você vende fica com você.",
      },
      {
        question: "Como recebo o dinheiro dos ingressos?",
        answer: "Do jeito que preferir: dinheiro, Pix ou transferência, direto para você ou para os seus vendedores. A plataforma não intermedia a venda.",
      },
      {
        question: "Tem mensalidade?",
        answer: "Não. Você paga só quando gera um lote novo, com Pix ou cartão.",
      },
    ],
    templates: ["show", "party", "charity"],
    events: ["show-de-banda", "jantar-beneficente", "festa"],
    cta: "Vender sem taxa por ingresso",
  },
  {
    slug: "como-imprimir-ingressos",
    label: "Como imprimir ingressos",
    title: "Como imprimir ingressos em casa ou na gráfica",
    description:
      "Papel, tamanho, sangria e corte: o que saber para imprimir ingressos numerados em casa ou na gráfica, com QR code nítido e sem número repetido.",
    h1: "Como imprimir ingressos em casa ou na gráfica",
    lead: "Ingresso bem impresso passa confiança e é lido de primeira na porta. Para 50 ingressos, a impressora de casa resolve. Para 1.000, a gráfica sai mais barata e mais bonita. Em qualquer caso, alguns cuidados evitam desperdício.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "casa-ou-grafica",
        heading: "Em casa ou na gráfica?",
        blocks: [
          {
            kind: "ul",
            items: [
              "Em casa: até algumas dezenas de folhas, prazo curto, impressão sob demanda por vendedor.",
              "Na gráfica: centenas de ingressos, papel mais grosso, corte reto e acabamento.",
              "Misturado: imprima a primeira leva em casa e o grosso na gráfica, com os mesmos números.",
            ],
          },
        ],
      },
      {
        id: "em-casa",
        heading: "Imprimindo em casa",
        blocks: [
          { kind: "p", text: "Use o PDF A4 com marcas de corte: vários ingressos por folha, com o encaixe já calculado e uma linha tracejada entre o canhoto e o ingresso. Imprima em tamanho real (100%, sem \"ajustar à página\"), para o QR sair do tamanho certo." },
          {
            kind: "ul",
            items: [
              "Papel: sulfite 120 g já dá firmeza; 180 g a 240 g parece ingresso de verdade, se a impressora aceitar.",
              "Corte: régua de metal e estilete, ou uma guilhotina de papel, seguindo as marcas.",
              "Teste: imprima uma folha e leia o QR com o celular antes de imprimir tudo.",
            ],
          },
        ],
      },
      {
        id: "na-grafica",
        heading: "Levando para a gráfica",
        blocks: [
          { kind: "p", text: "Para a gráfica, baixe o PDF com sangria: um ingresso por página, no tamanho final mais 3 mm de sobra em volta, para o corte não deixar borda branca. O arquivo já marca a área de corte, que a gráfica reconhece." },
          { kind: "tip", text: "Peça impressão digital. Cada ingresso tem um número e um QR diferentes, e a impressão offset, feita com chapa, repete a mesma imagem em todas as cópias." },
          { kind: "p", text: "Papel couché fosco ou brilho de 250 g a 300 g é o mais comum para ingresso. Laminação pode refletir a luz e atrapalhar a leitura do QR: prefira acabamento fosco." },
        ],
      },
      {
        id: "qr-nitido",
        heading: "QR nítido, leitura rápida",
        blocks: [
          { kind: "p", text: "O QR sai em vetor, nítido em qualquer impressora, sempre sobre um quadro branco e com pelo menos 2,2 cm de lado. Evite cortar perto dele e não imprima em papel muito brilhante. Se a impressora estiver falhando, a leitura fica lenta na porta." },
        ],
      },
      {
        id: "reimprimir",
        heading: "Reimprimir sem medo",
        blocks: [
          { kind: "p", text: "Os arquivos dos ingressos já pagos podem ser baixados e impressos de novo quantas vezes for preciso, sem custo. O mesmo número gera sempre o mesmo QR, então a reimpressão não cria ingresso novo: se as duas cópias forem usadas, a segunda é barrada." },
          { kind: "p", text: "Junto com os ingressos vem a folha de controle de cada vendedor, com o número, o nome do comprador e a coluna de pago." },
        ],
      },
      {
        id: "quantos",
        heading: "Quantos ingressos imprimir",
        blocks: [
          { kind: "p", text: "Imprima o que você pretende vender, não a lotação máxima do local. Ingresso que sobra no fim vira devolução e ocupa a conferência do acerto. Se a venda for melhor que o esperado, gere outro lote: a numeração continua de onde parou e os arquivos novos saem em minutos." },
          { kind: "p", text: "Para quem vende pelo WhatsApp, nem tudo precisa ser papel. O ingresso digital usa o mesmo número e o mesmo QR, e dispensa impressão para quem mora longe." },
        ],
      },
    ],
    faq: [
      {
        question: "Qual papel usar para imprimir ingresso em casa?",
        answer: "Sulfite 120 g é o mínimo para o ingresso não amassar. Se a impressora aceitar, papel de 180 g a 240 g dá acabamento de gráfica.",
      },
      {
        question: "O que é sangria e por que a gráfica pede?",
        answer: "É uma sobra de imagem em volta do ingresso, 3 mm de cada lado, para o corte não deixar filete branco. O PDF para gráfica do Ingresso Impresso já sai com ela.",
      },
      {
        question: "Posso imprimir os ingressos mais de uma vez?",
        answer: "Pode. Os arquivos ficam disponíveis e a reimpressão é ilimitada. Cada número continua entrando uma vez só na porta.",
      },
    ],
    templates: ["classic", "theater", "graduation"],
    events: ["teatro-e-danca", "festa-de-escola", "formatura"],
    cta: "Gerar meus ingressos para imprimir",
  },
  {
    slug: "convites-de-formatura",
    label: "Convites de formatura",
    title: "Convites de formatura: como organizar a venda e a entrada",
    description:
      "Guia para a comissão de formatura: convites numerados por formando, convites extras, acerto e entrada do baile conferida pelo celular.",
    h1: "Convites de formatura: venda, acerto e entrada do baile",
    lead: "A comissão de formatura cuida de dezenas de formandos, cada um com direito a alguns convites e com parentes que pedem extras. Sem controle, sobra planilha e falta convite. Este guia mostra uma forma simples de organizar do convite à porta do baile.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "regras",
        heading: "Defina as regras antes de imprimir",
        blocks: [
          {
            kind: "ul",
            items: [
              "Quantos convites cada formando recebe e quantos extras pode comprar.",
              "Preço do convite extra e prazo para pagar.",
              "Se crianças pagam, e a partir de que idade.",
              "Se há mesas e lugares marcados no salão.",
            ],
          },
        ],
      },
      {
        id: "faixas",
        heading: "Uma faixa de números por formando",
        blocks: [
          { kind: "p", text: "Cada formando é um vendedor com a sua faixa: 10 convites para cada um, do 0001 ao 0010, do 0011 ao 0020. O painel mostra quem já retirou, quem pagou os extras e quanto falta. Formando que perdeu convite tem os números cancelados e recebe outros." },
          { kind: "p", text: "Se o baile tem mesas, cada número pode ser ligado a uma mesa e a um lugar, e o convite sai com \"Mesa 5 · Lugar 3\" impresso." },
        ],
      },
      {
        id: "convite",
        heading: "O convite com a cara da turma",
        blocks: [
          { kind: "p", text: "Use o [modelo de convite de formatura](/modelos/formatura), vertical, em azul e dourado, ou envie a arte que a turma já tem e posicione o número e o QR. Os parentes que moram longe recebem o convite no celular, pelo WhatsApp, com o próprio nome." },
        ],
      },
      {
        id: "entrada",
        heading: "A entrada do baile",
        blocks: [
          { kind: "p", text: "Na noite do baile, a equipe do cerimonial ou da comissão confere os convites com o celular: dois ou três celulares na porta dão conta de centenas de convidados. Convidados de última hora entram pela lista de nomes, e a contagem de quem já chegou aparece ao vivo no painel." },
          { kind: "p", text: "Veja como preparar a porta em [controle de entrada de evento](/guias/controle-de-entrada-de-evento)." },
        ],
      },
      {
        id: "contas",
        heading: "Prestação de contas para a turma",
        blocks: [
          { kind: "p", text: "Depois do baile, a comissão apresenta o que entrou de cada formando, as despesas e as receitas em PDF ou planilha. Rifas e eventos para arrecadar também podem ser controlados na mesma conta, cada um como um evento." },
        ],
      },
      {
        id: "extras",
        heading: "Convites extras, cortesias e crianças",
        blocks: [
          { kind: "p", text: "Separe os convites em categorias: o convite do formando, o extra pago e a cortesia (fotógrafo, banda, cerimonial). Cada categoria tem a sua faixa de números, a sua cor impressa e, se quiser, o seu preço. O acerto de cada formando já usa o preço certo de cada número." },
          { kind: "p", text: "Para as crianças, decida a regra antes e escreva no convite. Se elas entram sem convite, a lista de nomes resolve na porta." },
        ],
      },
      {
        id: "cronograma",
        heading: "Cronograma sugerido para a comissão",
        blocks: [
          {
            kind: "ol",
            items: [
              "Três meses antes: regras, preço do extra e arte do convite.",
              "Dois meses antes: convites gerados e faixas entregues aos formandos.",
              "Um mês antes: acerto parcial e redistribuição de convites parados.",
              "Uma semana antes: acerto final, mesas definidas e convites digitais enviados.",
              "No dia: links da portaria abertos, ensaio da leitura e equipe na porta.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        question: "Cada formando pode vender os próprios convites extras?",
        answer: "Pode. Cada formando recebe uma faixa de números e um link no celular para marcar o que vendeu e para quem.",
      },
      {
        question: "Dá para usar a arte do convite que a turma já fez?",
        answer: "Sim. Envie a imagem e posicione o número e o QR code no editor visual.",
      },
      {
        question: "A colação e o baile podem ter convites separados?",
        answer: "Podem. Crie um evento para cada um, com a sua numeração e a sua portaria. Se for o mesmo evento em dias diferentes, use várias datas: cada data tem os seus ingressos.",
      },
    ],
    templates: ["graduation", "wedding", "party"],
    events: ["formatura", "baile"],
    cta: "Criar os convites da formatura",
  },
  {
    slug: "ingresso-pelo-whatsapp",
    label: "Ingresso pelo WhatsApp",
    title: "Ingresso pelo WhatsApp: como mandar sem perder o controle",
    description:
      "Como enviar ingresso pelo WhatsApp com o nome de quem comprou, QR que não dá para copiar e entrada conferida pelo celular, mesmo sem internet.",
    h1: "Como mandar ingresso pelo WhatsApp sem perder o controle",
    lead: "Nem todo mundo consegue buscar o ingresso de papel. Mandar uma foto do ingresso pelo WhatsApp é rápido, mas a mesma foto pode circular no grupo inteiro. O ingresso digital resolve: cada comprador recebe o seu link, e cada número entra uma vez só.",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    sections: [
      {
        id: "problema",
        heading: "O problema da foto do ingresso",
        blocks: [
          { kind: "p", text: "Uma imagem não tem dono. Quem recebe pode repassar, e sem um leitor que lembre quem já entrou, duas pessoas entram com o mesmo ingresso. Por isso a foto só é segura se o QR for conferido número a número na porta." },
        ],
      },
      {
        id: "ingresso-digital",
        heading: "Como funciona o ingresso digital",
        blocks: [
          {
            kind: "ol",
            items: [
              "No painel, aba Digitais, crie o ingresso com o nome de quem comprou.",
              "Toque em enviar: o WhatsApp abre com a mensagem e o link prontos.",
              "A pessoa abre o link no celular e vê o ingresso com o QR, o nome, a data e o local.",
              "Na porta, mostra a tela. O ingresso abre mesmo sem internet.",
            ],
          },
          { kind: "p", text: "É o mesmo QR assinado do papel: se o link for repassado, quem chegar primeiro entra e o outro é barrado. Você vê no painel quem já abriu o ingresso e quem já entrou." },
        ],
      },
      {
        id: "extras",
        heading: "O que vem junto no celular",
        blocks: [
          {
            kind: "ul",
            items: [
              "Botão para salvar o evento na agenda do celular.",
              "Rota até o local no aplicativo de mapas.",
              "A mesa e o lugar no mapa do salão, quando o evento tem mesas.",
              "Contato e logo da organização.",
            ],
          },
        ],
      },
      {
        id: "vendedor",
        heading: "O vendedor também pode mandar",
        blocks: [
          { kind: "p", text: "Se você permitir, cada vendedor manda o ingresso digital de um número que vendeu, direto do link dele. E se alguém perder o ingresso, a segunda via cancela o número antigo e manda um novo para a mesma pessoa." },
        ],
      },
      {
        id: "muitos",
        heading: "Muitos ingressos de uma vez",
        blocks: [
          { kind: "p", text: "Para vender pela internet, gere uma planilha com vários links de uma vez e envie conforme os pagamentos chegam. Se preferir imagens, o pacote do WhatsApp traz uma imagem por ingresso, separada por vendedor: mande cada imagem a um só comprador." },
        ],
      },
      {
        id: "passo-a-passo",
        heading: "Passo a passo para vender pelo WhatsApp",
        blocks: [
          {
            kind: "ol",
            items: [
              "Divulgue o evento com o preço e a sua chave Pix.",
              "Quando o comprovante chegar, crie o ingresso digital com o nome de quem pagou.",
              "Envie o link na mesma conversa, com a data e o horário.",
              "Na véspera, lembre os compradores de deixar o ingresso aberto no celular.",
              "Na porta, a equipe lê o QR na tela, com ou sem internet.",
            ],
          },
          { kind: "tip", text: "Peça para quem comprou abrir o link uma vez antes do evento. Depois disso, o ingresso abre mesmo sem sinal na fila." },
        ],
      },
      {
        id: "cuidados",
        heading: "Cuidados com ingresso no celular",
        blocks: [
          { kind: "p", text: "Oriente o comprador a não postar o ingresso nas redes sociais: quem tiver a imagem do QR pode chegar antes. Se isso acontecer, a segunda via cancela o número antigo e manda um novo. Brilho da tela no máximo ajuda a leitura na porta, principalmente à noite." },
        ],
      },
    ],
    faq: [
      {
        question: "O ingresso digital precisa de aplicativo?",
        answer: "Não. Abre no navegador do celular, Android ou iPhone, e funciona sem internet na hora da entrada.",
      },
      {
        question: "Posso misturar ingresso de papel e no celular?",
        answer: "Pode. Os dois usam o mesmo QR e a mesma numeração, e a portaria confere os dois do mesmo jeito.",
      },
      {
        question: "E se a pessoa repassar o link?",
        answer: "Quem chegar primeiro entra. A segunda leitura do mesmo número é barrada na porta.",
      },
    ],
    templates: ["show", "talk", "party"],
    events: ["show-de-banda", "palestra-e-curso", "evento-de-igreja"],
    cta: "Mandar ingressos pelo WhatsApp",
  },
];

/** The guide of `slug`, or `undefined` for an unknown one. */
export function seoGuide(slug: string): SeoGuide | undefined {
  return seoGuides.find((guide) => guide.slug === slug);
}

/** Guides that point to an event page, for its "read more" section. */
export function guidesForEvent(eventSlug: string): readonly SeoGuide[] {
  return seoGuides.filter((guide) => guide.events.includes(eventSlug));
}

/** Guides that suggest a template. */
export function guidesForTemplate(id: TemplateId): readonly SeoGuide[] {
  return seoGuides.filter((guide) => guide.templates.includes(id));
}

/** Every piece of text of a guide, for the reading time and the word count. */
export function guideText(guide: SeoGuide): string {
  const blocks = guide.sections.flatMap((section) => [
    section.heading,
    ...section.blocks.flatMap((block) => (block.kind === "ul" || block.kind === "ol" ? block.items : [block.text])),
  ]);
  return richTextPlain([guide.lead, ...blocks, ...guide.faq.flatMap((item) => [item.question, item.answer])].join(" "));
}

/** Words of a guide. */
export function guideWordCount(guide: SeoGuide): number {
  return guideText(guide).split(/\s+/).filter((word) => word !== "").length;
}

/** Minutes to read a guide, at about 200 words a minute. */
export function guideReadingMinutes(guide: SeoGuide): number {
  return Math.max(1, Math.round(guideWordCount(guide) / 200));
}
