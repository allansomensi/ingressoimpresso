// Conteúdo das páginas de SEO por tipo de evento, em app/ingresso-para/[slug]/page.tsx.

export type EventSeoPage = {
  slug: string;
  label: string; // nome curto, nos links do rodapé e na trilha da página
  title: string; // <title>, até ~60 caracteres
  description: string; // meta description, até ~155 caracteres
  h1: string;
  intro: string;
  dores: string[]; // problemas que o organizador tem hoje
  beneficios: { titulo: string; texto: string }[];
  faq: { pergunta: string; resposta: string }[];
  cta: string;
};

export const eventSeoPages: readonly EventSeoPage[] = [
  {
    slug: "festa-junina",
    label: "Festa junina",
    title: "Ingresso para Festa Junina numerado e com QR code",
    description:
      "Crie ingressos para festa junina e arraiá, imprima em casa ou na gráfica e confira na entrada pelo celular, mesmo sem internet. 30 ingressos grátis.",
    h1: "Ingresso para festa junina que não dá para copiar",
    intro:
      "Arraiá de escola, quermesse ou festa da comunidade: monte o ingresso com um modelo junino, gere a numeração, imprima e confira cada entrada com o celular, sem depender do sinal no pátio ou na quadra.",
    dores: [
      "Ingresso feito no Word e copiado na fotocopiadora",
      "Vários vendedores e ninguém sabe quanto cada um vendeu",
      "Internet ruim na quadra ou no salão no dia da festa",
    ],
    beneficios: [
      {
        titulo: "Modelo junino pronto",
        texto:
          "Escolha o modelo, troque as cores e o nome, a data e o local da festa entram sozinhos.",
      },
      {
        titulo: "Cada vendedor com a sua faixa",
        texto:
          "Entregue blocos de números para cada turma, pai ou voluntário e acompanhe quem pagou e quanto falta acertar.",
      },
      {
        titulo: "Portaria sem internet",
        texto:
          "Qualquer celular lê o QR na hora. Cópia ou foto de um ingresso já usado é barrada.",
      },
    ],
    faq: [
      {
        pergunta: "Posso imprimir os ingressos da festa junina em casa?",
        resposta:
          "Sim. Você baixa um PDF A4 com marcas de corte para a impressora de casa, ou um PDF com sangria para levar à gráfica.",
      },
      {
        pergunta: "Precisa de internet na entrada da festa?",
        resposta:
          "Não. A conferência funciona offline e os celulares sincronizam as leituras quando o sinal volta.",
      },
      {
        pergunta: "Quanto custa?",
        resposta:
          "Os primeiros 30 ingressos são grátis. Depois você paga por lote, a partir de R$ 0,05 por ingresso, sem mensalidade.",
      },
    ],
    cta: "Criar os ingressos do meu arraiá",
  },
  {
    slug: "formatura",
    label: "Formatura",
    title: "Convite e ingresso para formatura com QR code",
    description:
      "Ingressos e convites numerados para baile de formatura, com controle por formando e conferência na porta pelo celular. Teste com 30 ingressos grátis.",
    h1: "Convites de formatura com controle por formando",
    intro:
      "Cada formando tem direito a um número de convites, e a comissão precisa saber quem já retirou, quem pagou e quem entrou. Distribua faixas de números por formando e confira tudo na porta do baile.",
    dores: [
      "Convite extra impresso por fora e gente entrando sem pagar",
      "Planilha da comissão desatualizada no dia do baile",
      "Fila na entrada conferindo nome em lista de papel",
    ],
    beneficios: [
      {
        titulo: "Faixa de convites por formando",
        texto:
          "Cada formando recebe a sua faixa de números, e o painel mostra quem retirou, quem pagou e quanto falta.",
      },
      {
        titulo: "Convite com a cara da turma",
        texto:
          "Use o modelo de formatura ou envie a arte da turma e posicione número e QR arrastando.",
      },
      {
        titulo: "Convite pelo WhatsApp",
        texto:
          "Familiares que moram longe recebem o convite no celular, com o nome, e mostram o QR na entrada.",
      },
    ],
    faq: [
      {
        pergunta: "Dá para usar a arte que a turma já tem?",
        resposta:
          "Sim. Envie a imagem e posicione o número e o QR code no editor visual.",
      },
      {
        pergunta: "E se um formando perder os convites?",
        resposta:
          "Você cancela aquela faixa de números e eles passam a ser barrados na porta.",
      },
      {
        pergunta: "Vários celulares podem conferir ao mesmo tempo?",
        resposta:
          "Sim, quantos você quiser, inclusive na mesma porta, sem pagar a mais por isso.",
      },
    ],
    cta: "Criar os convites da formatura",
  },
  {
    slug: "show-de-banda",
    label: "Show de banda",
    title: "Ingresso para show de banda independente",
    description:
      "Venda ingresso na mão sem perder o controle: numeração por integrante, QR à prova de cópia e conferência na porta do bar pelo celular.",
    h1: "Ingresso para o show da sua banda, vendido na mão e sem dor de cabeça",
    intro:
      "Banda independente vende ingresso entre amigos, no bar e no grupo do WhatsApp. Divida os números entre os integrantes, mande o ingresso digital para quem compra de longe e confira tudo na porta.",
    dores: [
      "Acerto com a banda feito de memória ou no caderno",
      "Ingresso copiado ou foto repassada no grupo",
      "Sinal fraco dentro do bar na hora da entrada",
    ],
    beneficios: [
      {
        titulo: "Acerto entre os integrantes",
        texto:
          "Cada integrante leva uma faixa de números, e o painel mostra quem vendeu e quanto cada um precisa repassar.",
      },
      {
        titulo: "Ingresso pelo WhatsApp",
        texto:
          "Quem comprou pelo grupo recebe um link com o próprio nome. É o mesmo ingresso do papel: o primeiro que passar entra.",
      },
      {
        titulo: "Porta que não para",
        texto:
          "Tela verde, vermelha ou amarela com som, lanterna para lugar escuro e funcionamento offline.",
      },
    ],
    faq: [
      {
        pergunta: "Quanto custa para um show de 200 pessoas?",
        resposta:
          "Os 30 primeiros ingressos são grátis e o restante sai por centavos cada. O simulador na página de preços mostra o valor exato.",
      },
      {
        pergunta: "A plataforma fica com parte do valor do ingresso?",
        resposta:
          "Não. Você vende do seu jeito e recebe direto. Só paga pelo lote de ingressos gerados.",
      },
      {
        pergunta: "Funciona no iPhone?",
        resposta:
          "Sim. A portaria roda no navegador do celular, em Android ou iPhone, sem instalar aplicativo.",
      },
    ],
    cta: "Criar os ingressos do show",
  },
  {
    slug: "festa-de-escola",
    label: "Festa de escola",
    title: "Ingresso para festa de escola numerado",
    description:
      "Ingressos para festa da família, festa da primavera e eventos escolares, com venda por turma e conferência na entrada pelo celular.",
    h1: "Ingressos para eventos da escola, com venda organizada por turma",
    intro:
      "Na festa da escola, quem vende são os professores, as turmas e a associação de pais. Distribua os números por turma, acompanhe o que voltou e confira a entrada sem fila e sem lista de papel.",
    dores: [
      "Envelopes de ingressos por turma sem controle de devolução",
      "Ingresso falsificado com impressora de casa",
      "Secretaria sobrecarregada no acerto final",
    ],
    beneficios: [
      {
        titulo: "Faixas por turma",
        texto:
          "Cada turma recebe a sua faixa de números, e o painel mostra vendidos, devolvidos e o valor a acertar.",
      },
      {
        titulo: "Relatório para a direção",
        texto:
          "Vendidos, faturamento, custo e entradas do evento, com exportação para planilha.",
      },
      {
        titulo: "Impressão na própria escola",
        texto:
          "PDF A4 com marcas de corte para imprimir na secretaria, quantas vezes precisar.",
      },
    ],
    faq: [
      {
        pergunta: "Preciso saber design para montar o ingresso?",
        resposta:
          "Não. Escolha um dos modelos prontos e o nome, a data e o local do evento entram sozinhos.",
      },
      {
        pergunta: "Posso reimprimir se faltar ingresso?",
        resposta:
          "Sim. Arquivos e reimpressões são ilimitados para os ingressos que você já gerou.",
      },
      {
        pergunta: "Como a escola paga?",
        resposta:
          "Por Pix ou cartão, só quando gerar um novo lote. Não há mensalidade.",
      },
    ],
    cta: "Criar os ingressos da festa",
  },
  {
    slug: "evento-de-igreja",
    label: "Evento de igreja",
    title: "Ingresso para evento de igreja e congresso",
    description:
      "Ingressos numerados para congressos, retiros, jantares e eventos da igreja, com conferência na entrada pelo celular, mesmo sem internet.",
    h1: "Ingressos para congressos e eventos da igreja",
    intro:
      "Congresso de jovens, retiro, jantar ou culto especial: monte o ingresso, distribua entre os líderes e ministérios que vão vender e confira a entrada com os celulares da equipe.",
    dores: [
      "Vários ministérios vendendo e acerto confuso no final",
      "Lista de nomes na porta e fila na entrada",
      "Internet instável no templo ou no salão",
    ],
    beneficios: [
      {
        titulo: "Venda por ministério ou líder",
        texto:
          "Cada líder recebe a sua faixa de números, e você sabe quem vendeu e quanto falta acertar.",
      },
      {
        titulo: "Equipe de recepção no celular",
        texto:
          "Mande o link da portaria para a equipe. Cada celular vira um leitor, sem instalar nada.",
      },
      {
        titulo: "Ingresso para quem vem de fora",
        texto:
          "Caravanas de outras cidades recebem o ingresso pelo WhatsApp e mostram o QR na entrada.",
      },
    ],
    faq: [
      {
        pergunta: "Serve para eventos gratuitos com inscrição?",
        resposta:
          "Sim. O ingresso controla a entrada mesmo quando não há valor cobrado.",
      },
      {
        pergunta: "Precisa de internet no local?",
        resposta:
          "Não. A leitura é decidida no próprio celular, e as leituras se sincronizam quando o sinal volta.",
      },
      {
        pergunta: "Quanto custa?",
        resposta:
          "30 ingressos grátis para começar. Depois, a partir de R$ 0,05 por ingresso, pago por lote.",
      },
    ],
    cta: "Criar os ingressos do evento",
  },
  {
    slug: "jantar-beneficente",
    label: "Jantar beneficente",
    title: "Ingresso para jantar beneficente e feijoada",
    description:
      "Ingressos e convites numerados para jantares beneficentes, feijoadas e ações solidárias, com controle de vendedores e entrada pelo celular.",
    h1: "Ingressos para jantares beneficentes e ações solidárias",
    intro:
      "Em evento beneficente, cada real conta. Saiba exatamente quantos convites cada voluntário vendeu, evite convite copiado e tenha o relatório pronto para prestar contas.",
    dores: [
      "Convites distribuídos entre voluntários sem controle",
      "Dificuldade para fechar as contas depois do evento",
      "Gente entrando com convite repetido",
    ],
    beneficios: [
      {
        titulo: "Prestação de contas pronta",
        texto:
          "Relatório com vendidos, faturamento, custo e acerto por vendedor, com exportação para planilha.",
      },
      {
        titulo: "Modelo para ação solidária",
        texto:
          "Modelos prontos para jantar, feijoada e evento de contribuição, ou envie a sua arte.",
      },
      {
        titulo: "Custo de centavos",
        texto:
          "Sem mensalidade e sem porcentagem sobre o valor arrecadado. Você paga só pelos ingressos gerados.",
      },
    ],
    faq: [
      {
        pergunta: "A plataforma cobra porcentagem da arrecadação?",
        resposta:
          "Não. Você paga apenas pelo lote de ingressos, e todo o valor arrecadado fica com o evento.",
      },
      {
        pergunta: "Posso cancelar convites que não foram vendidos?",
        resposta:
          "Sim. Cancele a faixa de números e eles passam a ser barrados na entrada.",
      },
      {
        pergunta: "Como os convidados recebem o convite?",
        resposta:
          "Impresso, entregue pelos voluntários, ou por link no WhatsApp para quem não vai buscar o papel.",
      },
    ],
    cta: "Criar os convites do jantar",
  },
  {
    slug: "teatro-e-danca",
    label: "Teatro e dança",
    title: "Ingresso para espetáculo de teatro e dança",
    description:
      "Ingressos numerados para apresentações de teatro, balé e escolas de dança, vendidos pelos alunos e conferidos na porta pelo celular.",
    h1: "Ingressos para espetáculos de teatro, dança e recitais",
    intro:
      "Na apresentação de fim de ano, quem vende são os alunos e as famílias. Distribua os ingressos por aluno, acompanhe o acerto e faça a entrada do auditório sem fila.",
    dores: [
      "Cada aluno com um envelope e o acerto feito no dia",
      "Ingresso impresso sem numeração nem controle",
      "Entrada lenta no auditório com lista de nomes",
    ],
    beneficios: [
      {
        titulo: "Faixa por aluno ou turma",
        texto:
          "Cada aluno leva a sua faixa de números, e você acompanha vendas e devoluções no painel.",
      },
      {
        titulo: "Ingresso com cara de espetáculo",
        texto:
          "Modelos para teatro e recital, ou a arte do próprio espetáculo com número e QR posicionados no editor.",
      },
      {
        titulo: "Várias sessões",
        texto:
          "Crie um evento para cada sessão e controle a entrada de cada uma separadamente.",
      },
    ],
    faq: [
      {
        pergunta: "Dá para imprimir na gráfica?",
        resposta:
          "Sim. Baixe o PDF com sangria e cada ingresso sai com o seu número e um QR que não se repete.",
      },
      {
        pergunta: "Os pais podem receber o ingresso no celular?",
        resposta:
          "Sim, por um link no WhatsApp com o nome de quem comprou.",
      },
      {
        pergunta: "Funciona sem internet no teatro?",
        resposta:
          "Sim. A portaria funciona offline e sincroniza quando a conexão volta.",
      },
    ],
    cta: "Criar os ingressos do espetáculo",
  },
  {
    slug: "baile",
    label: "Baile",
    title: "Ingresso para baile e festa em clube",
    description:
      "Ingressos numerados para bailes, festas em clube e eventos tradicionalistas, com QR à prova de cópia e entrada conferida pelo celular.",
    h1: "Ingressos para bailes e festas em clube",
    intro:
      "Baile de clube, festa temática ou fandango: monte o ingresso, distribua entre os diretores e sócios que vendem e confira a entrada com o celular, mesmo com o salão cheio e sem sinal.",
    dores: [
      "Ingresso de papel simples, fácil de falsificar",
      "Diretoria sem saber quanto cada vendedor deve",
      "Portaria travada esperando a internet",
    ],
    beneficios: [
      {
        titulo: "QR assinado contra cópia",
        texto:
          "Ingresso falso não passa, e a cópia de um verdadeiro é barrada na segunda leitura.",
      },
      {
        titulo: "Acerto por vendedor",
        texto:
          "Faixas de números por diretor ou sócio, com o valor que cada um precisa acertar.",
      },
      {
        titulo: "Feito para o salão",
        texto:
          "Tela cheia com cor e som para cada leitura e lanterna para ambientes escuros.",
      },
    ],
    faq: [
      {
        pergunta: "Posso usar o mesmo sistema em todos os bailes do ano?",
        resposta:
          "Sim. Cada baile é um evento, e você paga só pelos ingressos de cada lote, sem mensalidade.",
      },
      {
        pergunta: "Quantos celulares posso usar na portaria?",
        resposta: "Quantos quiser, sem custo adicional.",
      },
      {
        pergunta: "O ingresso pode ter preço impresso?",
        resposta:
          "Sim. Os modelos trazem nome, data, local e valor do evento, e você ajusta no editor.",
      },
    ],
    cta: "Criar os ingressos do baile",
  },
];

/** The page of `slug`, or `undefined` for an unknown one. */
export function eventSeoPage(slug: string): EventSeoPage | undefined {
  return eventSeoPages.find((page) => page.slug === slug);
}
