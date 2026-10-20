// Conteúdo das páginas públicas de modelos (app/modelos), uma por modelo do catálogo
// (src/lib/templates/catalog.ts). A imagem de cada modelo fica em public/modelos/<slug>.jpg,
// gerada por `just template-images` (ADR 0062).

import { templateById, type TemplateId } from "@/lib/templates/catalog";

export type TemplateSeoPage = {
  id: TemplateId;
  slug: string;
  title: string; // <title>, até ~60 caracteres
  description: string; // meta description, até ~155 caracteres
  h1: string;
  intro: string;
};

/** Last change to the template pages (the sitemap's `lastmod`): update it with the content. */
export const TEMPLATE_PAGES_UPDATED_AT = "2026-10-20";

export const templateSeoPages: readonly TemplateSeoPage[] = [
  {
    id: "show",
    slug: "show-ao-vivo",
    title: "Modelo de ingresso para show pronto para imprimir",
    description:
      "Modelo de ingresso para show e banda com feixes de luz e letras fortes, número e QR code. Personalize e imprima em casa ou na gráfica.",
    h1: "Modelo de ingresso para show ao vivo",
    intro:
      "Feixes de luz, letras fortes e cores de palco para o show da sua banda. O nome, a data, o local e o preço entram sozinhos, e cada ingresso sai com o seu número e um QR que não dá para copiar.",
  },
  {
    id: "party",
    slug: "festa-e-balada",
    title: "Modelo de ingresso para festa e balada",
    description:
      "Modelo de ingresso para festa, balada e baile com gradiente vibrante e luzes desfocadas. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para festa e balada",
    intro:
      "Gradiente vibrante e luzes desfocadas para festas, baladas e bailes. Troque as cores, ajuste os textos e imprima quantos ingressos precisar, cada um com o seu número.",
  },
  {
    id: "arraia",
    slug: "festa-junina",
    title: "Modelo de ingresso de festa junina para imprimir",
    description:
      "Modelo de ingresso de festa junina com bandeirinhas e xadrez, numerado e com QR code. Personalize o arraiá e imprima em casa ou na gráfica.",
    h1: "Modelo de ingresso de festa junina",
    intro:
      "Bandeirinhas, xadrez e cores de arraiá para a festa da escola, da igreja ou da comunidade. O nome da festa, a data e o local entram sozinhos, e a portaria confere cada ingresso pelo celular.",
  },
  {
    id: "graduation",
    slug: "formatura",
    title: "Modelo de convite de formatura com QR code",
    description:
      "Modelo de convite e ingresso de formatura em azul e dourado, com moldura art déco, número e QR code. Personalize e imprima para a turma.",
    h1: "Modelo de convite de formatura",
    intro:
      "Convite vertical em azul e dourado, com moldura art déco, para o baile e a colação. Cada convite leva um número e um QR próprio, e a comissão sabe quem já entrou.",
  },
  {
    id: "church",
    slug: "igreja-e-congresso",
    title: "Modelo de ingresso para igreja, culto e congresso",
    description:
      "Modelo de ingresso para culto, congresso, retiro e encontro da igreja, com luz suave e tipografia clássica. Numerado e com QR code.",
    h1: "Modelo de ingresso para igreja e congresso",
    intro:
      "Luz suave e tipografia clássica para cultos especiais, congressos, retiros e encontros. Os líderes vendem cada um a sua faixa de números, e a recepção confere a entrada pelo celular.",
  },
  {
    id: "wedding",
    slug: "casamento-e-gala",
    title: "Modelo de convite para casamento e jantar de gala",
    description:
      "Modelo de convite para casamento, jantar de gala e celebrações, com ramos delicados e letra cursiva. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de convite para casamento e jantar de gala",
    intro:
      "Ramos delicados e letra cursiva para casamentos, jantares e celebrações. Cada convite tem o seu número e um QR, para a recepção saber quem já chegou.",
  },
  {
    id: "theater",
    slug: "teatro-e-danca",
    title: "Modelo de ingresso para teatro, dança e recital",
    description:
      "Modelo de ingresso para espetáculo de teatro, balé e recital, com cortina, holofote e serifas. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para teatro e dança",
    intro:
      "Cortina, holofote e serifas para espetáculos, apresentações de balé e recitais de fim de ano. Os alunos vendem, e a entrada do auditório é conferida pelo celular.",
  },
  {
    id: "sports",
    slug: "esporte-e-campeonato",
    title: "Modelo de ingresso para jogo e campeonato",
    description:
      "Modelo de ingresso para jogo, torneio e campeonato, com gramado, linhas do campo e letras de impacto. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para jogo e campeonato",
    intro:
      "Gramado, linhas do campo e letras de impacto para jogos, torneios e campeonatos do bairro ou da escola. Escolha entre as cores de campo, quadra e vôlei.",
  },
  {
    id: "raffle",
    slug: "rifa",
    title: "Modelo de rifa numerada com canhoto para imprimir",
    description:
      "Modelo de rifa numerada com canhoto, 12 por folha A4, com número grande e QR code. Personalize e imprima para a turma, a escola ou a igreja.",
    h1: "Modelo de rifa numerada com canhoto",
    intro:
      "Compacto, com número grande e canhoto para anotar o comprador: cabem 12 por folha A4. A numeração sai sozinha, e cada vendedor leva a sua faixa de números.",
  },
  {
    id: "charity",
    slug: "beneficente",
    title: "Modelo de ingresso para evento beneficente",
    description:
      "Modelo de convite e ingresso para jantar beneficente, feijoada e ação solidária, com corações e cores quentes. Numerado e com QR code.",
    h1: "Modelo de ingresso para evento beneficente",
    intro:
      "Corações e cores quentes para jantares beneficentes, feijoadas e ações solidárias. Cada voluntário leva a sua faixa de números, e a prestação de contas fica pronta.",
  },
  {
    id: "kids",
    slug: "festa-infantil",
    title: "Modelo de ingresso para festa infantil e da escola",
    description:
      "Modelo de ingresso para festa infantil, festa da escola e peça infantil, com balões e confete. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para festa infantil",
    intro:
      "Balões, confete e cores alegres para festas da escola, peças infantis e festas da família. As turmas vendem, e a entrada é conferida pelo celular, sem lista de papel.",
  },
  {
    id: "carnival",
    slug: "carnaval-e-bloco",
    title: "Modelo de ingresso para carnaval e bloco",
    description:
      "Modelo de ingresso para bloco e baile de carnaval, com confete e serpentina. Numerado, com QR code e pronto para imprimir em casa ou na gráfica.",
    h1: "Modelo de ingresso para carnaval e bloco",
    intro:
      "Confete e serpentina para blocos, bailes e matinês de carnaval. Escolha entre as cores da folia e do frevo e imprima quantos ingressos precisar.",
  },
  {
    id: "talk",
    slug: "palestra-e-workshop",
    title: "Modelo de ingresso para palestra e workshop",
    description:
      "Modelo de ingresso para palestra, curso, workshop e congresso, limpo e corporativo, com número e QR code. Personalize e imprima.",
    h1: "Modelo de ingresso para palestra e workshop",
    intro:
      "Visual limpo e corporativo para palestras, cursos, workshops e congressos. O participante também pode receber o ingresso no celular e mostrar o QR na entrada.",
  },
  {
    id: "cinema",
    slug: "cinema",
    title: "Modelo de ingresso de cinema para imprimir",
    description:
      "Modelo de ingresso de cinema com película de filme, para sessões, mostras e cineclubes. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso de cinema",
    intro:
      "Película de filme para sessões especiais, mostras e cineclubes. Escolha entre o clássico e o retrô e controle a lotação de cada sessão.",
  },
  {
    id: "newYear",
    slug: "reveillon",
    title: "Modelo de ingresso para festa de Réveillon",
    description:
      "Modelo de ingresso para festa de Réveillon e virada do ano, com fogos dourados. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para Réveillon",
    intro:
      "Fogos dourados para a festa da virada. A portaria funciona sem internet, mesmo com a praia ou o salão lotados.",
  },
  {
    id: "classic",
    slug: "classico",
    title: "Modelo de ingresso simples e numerado",
    description:
      "Modelo de ingresso clássico, com moldura simples, número e QR code, que combina com qualquer evento. Personalize e imprima em casa.",
    h1: "Modelo de ingresso simples e numerado",
    intro:
      "Moldura simples que combina com qualquer evento: recital, rifa, jantar ou festa. Use as cores da sua marca ou envie a sua própria arte.",
  },
  {
    id: "token",
    slug: "ficha-de-consumo",
    title: "Modelo de ficha de consumo numerada para imprimir",
    description:
      "Modelo de ficha de bebida e comida numerada, com o produto em destaque, preço e QR code: 21 por folha A4, com baixa na barraca pelo celular.",
    h1: "Modelo de ficha de consumo numerada",
    intro:
      "Cada ficha sai com o produto em letras grandes, o preço e um QR próprio. Na barraca, o celular lê a ficha, mostra o produto e barra a ficha já usada ou falsificada, mesmo sem internet.",
  },
  {
    id: "tokenJunina",
    slug: "ficha-de-festa-junina",
    title: "Modelo de ficha de festa junina com QR code",
    description:
      "Modelo de ficha de comida e bebida para festa junina, com bandeirinhas e xadrez. Numerada, com QR code e baixa na barraca pelo celular.",
    h1: "Modelo de ficha de festa junina",
    intro:
      "Bandeirinhas e xadrez para as fichas do arraiá da escola ou da igreja. Cada barraca dá baixa pelo celular, e a ficha usada ou copiada não passa duas vezes.",
  },
  {
    id: "rock",
    slug: "rock-e-metal",
    title: "Modelo de ingresso para show de rock e metal",
    description:
      "Modelo de ingresso para show de rock e metal com fundo escuro, raio e letras pesadas. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para show de rock e metal",
    intro:
      "Fundo escuro, um raio cortando o ingresso e letras pesadas para o show da banda. Cada ingresso sai com o seu número e um QR que barra cópia na porta do bar.",
  },
  {
    id: "sertanejo",
    slug: "sertanejo-e-rodeio",
    title: "Modelo de ingresso para show sertanejo e rodeio",
    description:
      "Modelo de ingresso para show sertanejo, rodeio e festa country, com couro, corda e estrela. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para show sertanejo e rodeio",
    intro:
      "Couro, corda e estrela de xerife para o show sertanejo, o rodeio ou o baile do CTG. Os vendedores levam cada um a sua faixa de números, e a portaria confere pelo celular.",
  },
  {
    id: "samba",
    slug: "samba-e-pagode",
    title: "Modelo de ingresso para roda de samba e pagode",
    description:
      "Modelo de ingresso para roda de samba, pagode e feijoada com samba, com as ondas do calçadão. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para samba e pagode",
    intro:
      "As ondas do calçadão e cores quentes para a roda de samba, o pagode do domingo e a feijoada com música. Imprima em casa ou na gráfica, com um número em cada ingresso.",
  },
  {
    id: "forro",
    slug: "forro-e-cordel",
    title: "Modelo de ingresso de forró com arte de cordel",
    description:
      "Modelo de ingresso para forró, São João e festa nordestina, com xilogravura de cordel, sol e mandacaru. Numerado e com QR code.",
    h1: "Modelo de ingresso de forró com arte de cordel",
    intro:
      "Xilogravura de cordel, sol e mandacaru para o forró pé de serra, o São João e as festas nordestinas. O nome, a data e o local entram sozinhos, no traço do cordel.",
  },
  {
    id: "electronic",
    slug: "musica-eletronica",
    title: "Modelo de ingresso para festa de música eletrônica",
    description:
      "Modelo de ingresso para rave e festa de música eletrônica, com grade em perspectiva e sol retrô. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para festa de música eletrônica",
    intro:
      "Grade em perspectiva, sol retrô e cores de pista para raves, festas de DJ e noites eletrônicas. A portaria confere cada QR pelo celular, mesmo sem sinal no galpão.",
  },
  {
    id: "jazz",
    slug: "jazz-e-mpb",
    title: "Modelo de ingresso para noite de jazz e MPB",
    description:
      "Modelo de ingresso para jazz, MPB, voz e violão e noites acústicas, com teclas de piano e serifas elegantes. Numerado e com QR code.",
    h1: "Modelo de ingresso para jazz e MPB",
    intro:
      "Teclas de piano e serifas elegantes para noites de jazz, MPB, voz e violão e shows acústicos. Um ingresso discreto, com número e QR, para o café, o bar ou o teatro.",
  },
  {
    id: "festival",
    slug: "festival-de-musica",
    title: "Modelo de ingresso para festival de música",
    description:
      "Modelo de ingresso para festival de música de um ou vários dias, com sol e faixas de cor. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para festival de música",
    intro:
      "Sol, faixas de cor e os dias do evento impressos sozinhos, para festivais de um fim de semana inteiro. Cada ingresso vale nos dias que você escolher, e a portaria confere pelo celular.",
  },
  {
    id: "flashback",
    slug: "flashback-anos-80",
    title: "Modelo de ingresso para baile flashback anos 80",
    description:
      "Modelo de ingresso para baile flashback e festa anos 80, com disco de vinil e cores neon. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para baile flashback",
    intro:
      "Um disco de vinil e as cores neon dos anos 80 para o baile flashback do clube. Troque as cores, ajuste os textos e imprima quantos ingressos precisar.",
  },
  {
    id: "discoBall",
    slug: "festa-disco",
    title: "Modelo de ingresso para festa disco anos 70",
    description:
      "Modelo de ingresso para festa disco e baile anos 70, com globo espelhado e brilho. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para festa disco",
    intro:
      "Globo espelhado, brilho e letras de pista para a festa disco e os bailes temáticos dos anos 70. Cada ingresso leva o seu número e um QR que não dá para copiar.",
  },
  {
    id: "vip",
    slug: "vip-e-camarote",
    title: "Modelo de ingresso VIP e camarote",
    description:
      "Modelo de ingresso VIP para camarote, área VIP e backstage, em preto e dourado com faixas diagonais. Numerado e com QR code.",
    h1: "Modelo de ingresso VIP e camarote",
    intro:
      "Preto, dourado e faixas diagonais para o camarote, a área VIP e o backstage. Use uma categoria para o VIP e outra para a pista, cada uma com a sua cor e o seu preço.",
  },
  {
    id: "gospel",
    slug: "show-gospel",
    title: "Modelo de ingresso para show gospel e louvor",
    description:
      "Modelo de ingresso para show gospel, noite de louvor e congresso de jovens, com raios de luz e ondas de som. Numerado e com QR code.",
    h1: "Modelo de ingresso para show gospel e louvor",
    intro:
      "Raios de luz e ondas de som para shows gospel, noites de louvor e vigílias. Os líderes vendem cada um a sua faixa de números, e a recepção confere a entrada pelo celular.",
  },
  {
    id: "birthday",
    slug: "aniversario",
    title: "Modelo de convite de aniversário com QR code",
    description:
      "Modelo de convite e ingresso de festa de aniversário, com serpentinas, presente e confete. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de convite de aniversário",
    intro:
      "Serpentinas, presente e confete para a festa de aniversário. Cada convidado recebe um convite numerado, no papel ou no celular, e a recepção sabe quem já chegou.",
  },
  {
    id: "fifteen",
    slug: "15-anos",
    title: "Modelo de convite de 15 anos para imprimir",
    description:
      "Modelo de convite de 15 anos e festa de debutante, vertical, com coroa e letra cursiva. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de convite de 15 anos",
    intro:
      "Convite vertical com coroa e letra cursiva para a festa de 15 anos. Cada convite leva um número e um QR, e a entrada do buffet é conferida pelo celular.",
  },
  {
    id: "halloween",
    slug: "halloween",
    title: "Modelo de ingresso para festa de Halloween",
    description:
      "Modelo de ingresso para festa de Halloween e festa à fantasia, com lua cheia, morcegos e roxo com laranja. Numerado e com QR code.",
    h1: "Modelo de ingresso para festa de Halloween",
    intro:
      "Lua cheia, morcegos e roxo com laranja para a festa de Halloween, à fantasia ou do terror. Imprima em casa e confira a entrada pelo celular, sem lista de papel.",
  },
  {
    id: "luau",
    slug: "luau-e-festa-na-praia",
    title: "Modelo de ingresso para luau e festa na praia",
    description:
      "Modelo de ingresso para luau, festa na praia e pool party, com folhas de palmeira e pôr do sol. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para luau e festa na praia",
    intro:
      "Folhas de palmeira e pôr do sol para luaus, festas na praia e pool parties. A portaria funciona sem internet, mesmo na areia.",
  },
  {
    id: "masquerade",
    slug: "baile-de-mascaras",
    title: "Modelo de ingresso para baile de máscaras",
    description:
      "Modelo de convite e ingresso para baile de máscaras e festa temática, com máscara veneziana dourada. Numerado e com QR code.",
    h1: "Modelo de ingresso para baile de máscaras",
    intro:
      "Uma máscara veneziana dourada sobre fundo escuro para bailes de máscaras e festas temáticas. Cada convite tem o seu número e um QR para a recepção.",
  },
  {
    id: "christmas",
    slug: "natal-e-cantata",
    title: "Modelo de ingresso para cantata e festa de Natal",
    description:
      "Modelo de ingresso para cantata, ceia e festa de Natal da igreja ou da escola, com flocos de neve e estrelas. Numerado e com QR code.",
    h1: "Modelo de ingresso para cantata e festa de Natal",
    intro:
      "Flocos de neve, bolas e estrelas para a cantata da igreja, a ceia beneficente e a festa de fim de ano da escola. Escolha as cores e imprima quantos precisar.",
  },
  {
    id: "gala",
    slug: "gala-art-deco",
    title: "Modelo de convite de gala art déco",
    description:
      "Modelo de convite para noite de gala, premiação e jantar, com leques art déco em preto e dourado. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de convite de gala art déco",
    intro:
      "Leques art déco em preto e dourado para galas, premiações e jantares de fim de ano. Cada convite sai numerado, e a recepção confere a entrada pelo celular.",
  },
  {
    id: "floral",
    slug: "floral-aquarela",
    title: "Modelo de convite floral em aquarela",
    description:
      "Modelo de convite floral em aquarela para casamento, bodas e chá, com letra cursiva. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de convite floral em aquarela",
    intro:
      "Flores em aquarela e letra cursiva para casamentos, bodas e chás. O nome, a data e o local entram sozinhos, e cada convite leva um número e um QR.",
  },
  {
    id: "babyShower",
    slug: "cha-de-bebe",
    title: "Modelo de convite para chá de bebê e chá revelação",
    description:
      "Modelo de convite para chá de bebê, chá de fraldas e chá revelação, com nuvens, estrelas e tons pastel. Numerado e com QR code.",
    h1: "Modelo de convite para chá de bebê",
    intro:
      "Nuvens, estrelas e tons pastel para o chá de bebê, o chá de fraldas e o chá revelação. Também serve de rifa: cada número vai para um convidado.",
  },
  {
    id: "diploma",
    slug: "colacao-de-grau",
    title: "Modelo de convite de colação de grau",
    description:
      "Modelo de convite para colação de grau e baile de formatura, na horizontal, com louros e moldura clássica. Numerado e com QR code.",
    h1: "Modelo de convite de colação de grau",
    intro:
      "Louros e moldura clássica na horizontal para a colação de grau e o baile. Cada formando vende a sua faixa de números, e a comissão sabe quem já entrou.",
  },
  {
    id: "kraft",
    slug: "rustico-kraft",
    title: "Modelo de convite rústico em papel kraft",
    description:
      "Modelo de convite rústico com papel kraft, carimbo e barbante, para casamento no campo e festa na fazenda. Numerado e com QR code.",
    h1: "Modelo de convite rústico em papel kraft",
    intro:
      "Papel kraft, carimbo e barbante para casamentos no campo, festas na fazenda e almoços ao ar livre. Imprima em papel comum: a textura já vem na arte.",
  },
  {
    id: "boarding",
    slug: "cartao-de-embarque",
    title: "Modelo de ingresso em cartão de embarque",
    description:
      "Modelo de ingresso no formato de cartão de embarque, para festa temática, viagem de formatura e excursão. Numerado e com QR code.",
    h1: "Modelo de ingresso em cartão de embarque",
    intro:
      "Um ingresso no formato de passagem aérea para festas temáticas, viagens de formatura e excursões. O nome do evento vira o destino, e o QR é conferido no embarque.",
  },
  {
    id: "exhibition",
    slug: "exposicao-e-vernissage",
    title: "Modelo de ingresso para exposição e vernissage",
    description:
      "Modelo de ingresso para exposição de arte, mostra e vernissage, com formas geométricas e muito branco. Numerado e com QR code.",
    h1: "Modelo de ingresso para exposição e vernissage",
    intro:
      "Formas geométricas e muito branco para exposições, mostras e vernissages. Controle a lotação de cada dia e confira a entrada pelo celular.",
  },
  {
    id: "standup",
    slug: "stand-up-comedia",
    title: "Modelo de ingresso para show de stand-up",
    description:
      "Modelo de ingresso para show de stand-up e noite de comédia, com parede de tijolos, holofote e microfone. Numerado e com QR code.",
    h1: "Modelo de ingresso para stand-up comedy",
    intro:
      "Parede de tijolos, holofote e microfone para noites de stand-up e shows de comédia. O bar vende, a casa confere a entrada pelo celular, e ninguém entra com cópia.",
  },
  {
    id: "recital",
    slug: "recital-e-concerto",
    title: "Modelo de ingresso para recital e concerto",
    description:
      "Modelo de ingresso para recital, concerto, coral e apresentação de música, com pauta e notas musicais. Numerado e com QR code.",
    h1: "Modelo de ingresso para recital e concerto",
    intro:
      "Pauta musical e notas para recitais de fim de ano, concertos e corais. Os alunos vendem, e a entrada do auditório é conferida pelo celular.",
  },
  {
    id: "sarau",
    slug: "sarau-e-lancamento-de-livro",
    title: "Modelo de ingresso para sarau e lançamento de livro",
    description:
      "Modelo de ingresso para sarau, noite de poesia e lançamento de livro, com máquina de escrever e papel antigo. Numerado e com QR code.",
    h1: "Modelo de ingresso para sarau e lançamento de livro",
    intro:
      "Máquina de escrever e papel antigo para saraus, noites de poesia e lançamentos de livro. Um ingresso simples, com número e QR, para a livraria ou a biblioteca.",
  },
  {
    id: "scienceFair",
    slug: "feira-de-ciencias",
    title: "Modelo de ingresso para feira de ciências",
    description:
      "Modelo de ingresso para feira de ciências e mostra da escola, com caderno quadriculado e desenhos de ciência. Numerado e com QR code.",
    h1: "Modelo de ingresso para feira de ciências",
    intro:
      "Caderno quadriculado e desenhos de ciência para a feira e a mostra cultural da escola. As turmas vendem, e a entrada é conferida pelo celular.",
  },
  {
    id: "circus",
    slug: "circo-e-show-infantil",
    title: "Modelo de ingresso para circo e show infantil",
    description:
      "Modelo de ingresso para circo, show de mágica e espetáculo infantil, com lona listrada e estrelas. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para circo e show infantil",
    intro:
      "Lona listrada e estrelas para o circo, o show de mágica e os espetáculos infantis. Cada ingresso leva o seu número, e a lona confere a entrada pelo celular.",
  },
  {
    id: "comic",
    slug: "quadrinhos-pop-art",
    title: "Modelo de ingresso de quadrinhos e pop art",
    description:
      "Modelo de ingresso para festa de super-heróis, evento geek e festa temática, com retícula e balão de explosão. Numerado e com QR code.",
    h1: "Modelo de ingresso de quadrinhos e pop art",
    intro:
      "Retícula, cores primárias e um balão de explosão para festas de super-heróis, eventos geek e aniversários temáticos. Imprima em casa e confira a entrada pelo celular.",
  },
  {
    id: "race",
    slug: "corrida-e-caminhada",
    title: "Modelo de número de peito para corrida",
    description:
      "Modelo de número de peito para corrida e caminhada, com furos de alfinete, número grande e QR code para a retirada do kit.",
    h1: "Modelo de número de peito para corrida e caminhada",
    intro:
      "Número grande e furos de alfinete nos cantos, como o número de peito das provas, para corridas e caminhadas beneficentes. O QR confere a retirada do kit e a largada.",
  },
  {
    id: "fight",
    slug: "luta-e-artes-marciais",
    title: "Modelo de ingresso para luta e artes marciais",
    description:
      "Modelo de ingresso para luta, campeonato de jiu-jítsu, boxe e MMA, com canto vermelho contra canto azul. Numerado e com QR code.",
    h1: "Modelo de ingresso para luta e artes marciais",
    intro:
      "Canto vermelho contra canto azul para lutas, campeonatos de jiu-jítsu, judô e boxe. Os atletas vendem, e a portaria do ginásio confere cada QR pelo celular.",
  },
  {
    id: "gamer",
    slug: "torneio-de-games",
    title: "Modelo de ingresso para torneio de games",
    description:
      "Modelo de ingresso para campeonato de games e e-sports, com pixel art e linhas de tela. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para torneio de games",
    intro:
      "Pixel art e linhas de tela de fliperama para campeonatos de games, e-sports e lan parties. Venda na mão ou mande o ingresso para o celular.",
  },
  {
    id: "trophy",
    slug: "premiacao-e-final",
    title: "Modelo de ingresso para final e premiação",
    description:
      "Modelo de ingresso para final de campeonato, interclasses e cerimônia de premiação, com troféu e louros dourados. Numerado e com QR code.",
    h1: "Modelo de ingresso para final e premiação",
    intro:
      "Troféu e louros dourados para a final do campeonato, o interclasses e as cerimônias de premiação. A torcida compra na mão, e a entrada é conferida pelo celular.",
  },
  {
    id: "retreat",
    slug: "retiro-e-acampamento",
    title: "Modelo de ingresso para retiro e acampamento",
    description:
      "Modelo de ingresso para retiro, acampamento e encontro de jovens, com montanhas, pinheiros e céu estrelado. Numerado e com QR code.",
    h1: "Modelo de ingresso para retiro e acampamento",
    intro:
      "Montanhas, pinheiros e céu estrelado para retiros, acampamentos e encontros de jovens. Funciona em vários dias, e a chegada é conferida pelo celular, mesmo sem sinal.",
  },
  {
    id: "stainedGlass",
    slug: "vitral",
    title: "Modelo de ingresso com arte de vitral",
    description:
      "Modelo de ingresso com arte de vitral para festa do padroeiro, missa, concerto na igreja e encontro de casais. Numerado e com QR code.",
    h1: "Modelo de ingresso com arte de vitral",
    intro:
      "Vidros coloridos como num vitral para a festa do padroeiro, concertos na igreja e encontros da paróquia. Cada pastoral vende a sua faixa de números.",
  },
  {
    id: "badge",
    slug: "credencial-cracha",
    title: "Modelo de credencial e crachá com QR code",
    description:
      "Modelo de credencial e crachá vertical com furo para o cordão, para congresso, feira e encontro. Numerado e com QR code para o check-in.",
    h1: "Modelo de credencial e crachá",
    intro:
      "Crachá vertical com espaço para o furo do cordão, para congressos, feiras e encontros. O participante entra com o crachá, e o QR confere a entrada e os pontos de controle.",
  },
  {
    id: "tech",
    slug: "tecnologia-e-hackathon",
    title: "Modelo de ingresso para hackathon e tecnologia",
    description:
      "Modelo de ingresso para hackathon, meetup e evento de tecnologia, com trilhas de circuito e fonte de código. Numerado e com QR code.",
    h1: "Modelo de ingresso para hackathon e tecnologia",
    intro:
      "Trilhas de circuito e fonte de código para hackathons, meetups e eventos de tecnologia. O participante também pode receber o ingresso no celular.",
  },
  {
    id: "dinner",
    slug: "jantar-e-almoco",
    title: "Modelo de ingresso para jantar e almoço",
    description:
      "Modelo de ingresso para jantar, almoço, feijoada e macarronada, com prato, talheres e toalha xadrez. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para jantar e almoço",
    intro:
      "Prato, talheres e toalha xadrez para jantares, almoços, feijoadas e macarronadas. Cada voluntário leva a sua faixa de números, e o salão confere a entrada pelo celular.",
  },
  {
    id: "churrasco",
    slug: "churrasco-e-costelaco",
    title: "Modelo de ingresso para churrasco e costelaço",
    description:
      "Modelo de ingresso para churrasco, costelaço e festa gaúcha, com chamas e madeira. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para churrasco e costelaço",
    intro:
      "Chamas e madeira para churrascos, costelaços e festas do CTG. Os sócios vendem cada um a sua faixa de números, e o acerto fica pronto no fim.",
  },
  {
    id: "wine",
    slug: "degustacao-de-vinhos",
    title: "Modelo de ingresso para degustação de vinhos",
    description:
      "Modelo de ingresso para degustação de vinhos, jantar harmonizado e confraria, com taças e tons de vinho. Numerado e com QR code.",
    h1: "Modelo de ingresso para degustação de vinhos",
    intro:
      "Taças e tons de vinho para degustações, jantares harmonizados e confrarias. Um convite elegante, com número e QR, que a recepção confere pelo celular.",
  },
  {
    id: "oktoberfest",
    slug: "festa-alema-e-cerveja",
    title: "Modelo de ingresso para festa alemã e cerveja",
    description:
      "Modelo de ingresso para Oktoberfest, festa alemã e festival de cerveja, com losangos azuis e brancos e caneco. Numerado e com QR code.",
    h1: "Modelo de ingresso para festa alemã e cerveja",
    intro:
      "Losangos azuis e brancos e um caneco de chope para a Oktoberfest, as festas alemãs e os festivais de cerveja. Combine com as fichas de bebida no mesmo evento.",
  },
  {
    id: "bingo",
    slug: "bingo-e-quermesse",
    title: "Modelo de ingresso para bingo e quermesse",
    description:
      "Modelo de ingresso para bingo beneficente e quermesse, com cartela e bolinhas numeradas. Numerado, com QR code e pronto para imprimir.",
    h1: "Modelo de ingresso para bingo e quermesse",
    intro:
      "Cartela de bingo e bolinhas numeradas para bingos beneficentes e quermesses. Cada ingresso tem o seu número, e a entrada do salão é conferida pelo celular.",
  },
  {
    id: "raffleGift",
    slug: "rifa-de-premio",
    title: "Modelo de rifa de prêmio com canhoto",
    description:
      "Modelo de rifa de prêmio compacta, com caixa de presente, laço e canhoto para o comprador. Numerada, com QR code e pronta para imprimir.",
    h1: "Modelo de rifa de prêmio com canhoto",
    intro:
      "Caixa de presente e laço para a rifa do Dia das Mães, da cesta de Natal ou do prêmio da turma. Compacta, com canhoto e um número que não se repete.",
  },
  {
    id: "lottery",
    slug: "bilhete-da-sorte",
    title: "Modelo de bilhete da sorte para rifa e sorteio",
    description:
      "Modelo de bilhete da sorte com guilhoché e moldura antiga, para rifas e sorteios. Compacto, numerado, com canhoto e QR code.",
    h1: "Modelo de bilhete da sorte",
    intro:
      "Guilhoché e moldura de bilhete antigo para rifas e sorteios. Compacto e com canhoto, para cada vendedor levar a sua faixa de números.",
  },
  {
    id: "minimal",
    slug: "minimalista",
    title: "Modelo de ingresso minimalista para imprimir",
    description:
      "Modelo de ingresso minimalista, com letras grandes e uma linha de cor, que combina com qualquer evento e gasta pouca tinta. Numerado e com QR code.",
    h1: "Modelo de ingresso minimalista",
    intro:
      "Letras grandes, uma linha de cor e muito espaço em branco: combina com qualquer evento e gasta pouca tinta na impressora de casa.",
  },
  {
    id: "gradient",
    slug: "gradiente-moderno",
    title: "Modelo de ingresso com gradiente moderno",
    description:
      "Modelo de ingresso moderno com manchas de cor suaves em gradiente, para festas, encontros e lançamentos. Numerado e com QR code.",
    h1: "Modelo de ingresso com gradiente moderno",
    intro:
      "Manchas de cor suaves e letras modernas para festas, encontros, lançamentos e qualquer evento que pede um visual atual.",
  },
  {
    id: "admitOne",
    slug: "bilhete-retro",
    title: "Modelo de bilhete retrô para imprimir",
    description:
      "Modelo de bilhete retrô com bordas recortadas e estrelas, como os bilhetes antigos de parque e cinema. Numerado e com QR code.",
    h1: "Modelo de bilhete retrô",
    intro:
      "Bordas recortadas, estrelas e letras de cartaz, como os bilhetes antigos de parque, circo e cinema. Serve para quermesse, festa da escola ou sessão especial.",
  },
  {
    id: "tokenBeer",
    slug: "ficha-de-bebida",
    title: "Modelo de ficha de bebida numerada com QR code",
    description:
      "Modelo de ficha de bebida para cerveja, chope, refrigerante e drinks, com espuma e bolhas. Numerada, 21 por folha A4, com baixa no bar pelo celular.",
    h1: "Modelo de ficha de bebida",
    intro:
      "Espuma e bolhas em tons de chope para as fichas do bar. O celular do balcão lê cada ficha, mostra a bebida e barra a ficha já usada ou copiada, mesmo sem internet.",
  },
  {
    id: "tokenFood",
    slug: "ficha-de-comida",
    title: "Modelo de ficha de comida e lanche para imprimir",
    description:
      "Modelo de ficha de comida para lanche, prato feito e sobremesa, com talheres e toalha xadrez. Numerada, com QR code e baixa na barraca.",
    h1: "Modelo de ficha de comida",
    intro:
      "Talheres e toalha xadrez para as fichas de lanche, prato feito e sobremesa. Cada barraca dá baixa pelo celular, e a ficha usada não passa duas vezes.",
  },
  {
    id: "tokenRetro",
    slug: "ficha-retro",
    title: "Modelo de ficha retrô com bordas recortadas",
    description:
      "Modelo de ficha retrô com bordas recortadas e estrelas, para quermesse, festa da escola e parque. Numerada, com QR code e baixa na barraca.",
    h1: "Modelo de ficha retrô",
    intro:
      "Bordas recortadas e estrelas, como as fichas antigas de parque e quermesse. O produto sai em letras grandes, e o celular da barraca dá baixa em cada uma.",
  },
  {
    id: "tokenNeon",
    slug: "ficha-de-balada",
    title: "Modelo de ficha de bar para festa e balada",
    description:
      "Modelo de ficha de bar para festa e balada, com fundo escuro e brilho neon. Numerada, 21 por folha A4, com baixa no balcão pelo celular.",
    h1: "Modelo de ficha de bar para festa e balada",
    intro:
      "Fundo escuro e brilho neon para as fichas do bar da festa. O caixa vende, o balcão lê a ficha no celular e ninguém bebe duas vezes com a mesma.",
  },
  {
    id: "tokenCandy",
    slug: "ficha-de-doces",
    title: "Modelo de ficha de doces para festa infantil",
    description:
      "Modelo de ficha de doces, sorvete e algodão-doce para festa infantil e da escola, com listras de bala e cores pastel. Numerada e com QR code.",
    h1: "Modelo de ficha de doces",
    intro:
      "Listras de bala e cores pastel para as fichas de doces, sorvete e algodão-doce da festa da escola. Cada barraca dá baixa pelo celular.",
  },
  {
    id: "tokenCoin",
    slug: "ficha-de-brinquedo",
    title: "Modelo de ficha de brinquedo e jogos",
    description:
      "Modelo de ficha de brinquedo, pescaria e jogos com uma moeda dourada. Numerada, 21 por folha A4, com baixa na barraca pelo celular.",
    h1: "Modelo de ficha de brinquedo e jogos",
    intro:
      "Uma moeda dourada para as fichas de brinquedo, pescaria, boca do palhaço e jogos da festa. O celular da barraca lê a ficha e barra a já usada.",
  },
  {
    id: "tokenMinimal",
    slug: "ficha-economica",
    title: "Modelo de ficha econômica em preto e branco",
    description:
      "Modelo de ficha de consumo em preto e branco, com o produto em letras enormes e pouca tinta: ideal para a impressora de casa. Com QR code.",
    h1: "Modelo de ficha econômica em preto e branco",
    intro:
      "Preto no branco, o produto em letras enormes e quase nada de tinta: imprima centenas de fichas na impressora de casa. A faixa da categoria mostra o produto de longe.",
  },
  {
    id: "tokenCarnival",
    slug: "ficha-de-carnaval",
    title: "Modelo de ficha de carnaval para bloco e baile",
    description:
      "Modelo de ficha de bebida e comida para bloco e baile de carnaval, com confete e serpentina. Numerada, com QR code e baixa no balcão.",
    h1: "Modelo de ficha de carnaval",
    intro:
      "Confete e serpentina para as fichas do bloco e do baile de carnaval. O bar dá baixa pelo celular, mesmo com a rua lotada e sem sinal.",
  },
  {
    id: "tokenChurrasco",
    slug: "ficha-de-churrasco",
    title: "Modelo de ficha de churrasco e espetinho",
    description:
      "Modelo de ficha de churrasco para espetinho, costela e bebida, com chamas e madeira. Numerada, 21 por folha A4, com baixa na churrasqueira.",
    h1: "Modelo de ficha de churrasco",
    intro:
      "Chamas e madeira para as fichas de espetinho, costela e bebida do churrasco. A churrasqueira dá baixa pelo celular, e a ficha usada não volta.",
  },
  {
    id: "tokenBold",
    slug: "ficha-cor-cheia",
    title: "Modelo de ficha colorida de cor cheia",
    description:
      "Modelo de ficha de consumo com fundo de cor forte e letras brancas, para aparecer de longe no balcão. Numerada, com QR code e baixa pelo celular.",
    h1: "Modelo de ficha colorida de cor cheia",
    intro:
      "Fundo de cor forte e letras brancas para a ficha aparecer de longe no balcão. Escolha uma cor para cada tipo de festa e imprima quantas precisar.",
  },
];

/** The templates shown on each event page (src/content/seo-event-pages.ts), the closest first. */
export const EVENT_TEMPLATES: Readonly<Record<string, readonly TemplateId[]>> = {
  festa: ["party", "newYear", "carnival", "birthday", "discoBall", "luau"],
  "festa-junina": ["arraia", "tokenJunina", "kids", "bingo", "tokenFood", "admitOne"],
  formatura: ["graduation", "diploma", "gala", "boarding", "vip", "party"],
  "show-de-banda": ["show", "rock", "sertanejo", "samba", "festival", "electronic"],
  "festa-de-escola": ["kids", "arraia", "theater", "scienceFair", "circus", "tokenCandy"],
  "evento-de-igreja": ["church", "gospel", "retreat", "stainedGlass", "christmas", "bingo"],
  "jantar-beneficente": ["charity", "dinner", "wine", "churrasco", "wedding", "classic"],
  "teatro-e-danca": ["theater", "recital", "standup", "cinema", "exhibition", "classic"],
  baile: ["wedding", "masquerade", "fifteen", "gala", "discoBall", "flashback"],
  campeonato: ["sports", "trophy", "race", "fight", "gamer", "classic"],
  "palestra-e-curso": ["talk", "badge", "tech", "exhibition", "minimal", "classic"],
  carnaval: ["carnival", "tokenCarnival", "party", "samba", "comic", "kids"],
  reveillon: ["newYear", "party", "vip", "luau", "gala", "wedding"],
};

export function templateSeoBySlug(slug: string): TemplateSeoPage | undefined {
  return templateSeoPages.find((page) => page.slug === slug);
}

export function templateSeoById(id: TemplateId): TemplateSeoPage | undefined {
  return templateSeoPages.find((page) => page.id === id);
}

/** Public address of a template's picture (public/modelos). */
export function templateImagePath(page: Pick<TemplateSeoPage, "slug">): string {
  return `/modelos/${page.slug}.jpg`;
}

/** The event page a template belongs to, if any (its first listing in EVENT_TEMPLATES). */
export function eventSlugForTemplate(id: TemplateId): string | undefined {
  return Object.entries(EVENT_TEMPLATES).find(([, ids]) => ids[0] === id)?.[0];
}

/**
 * The templates shown under a template's page: the next ones in the catalog that share its first
 * category (a show next to other music templates), then the next ones of any kind.
 */
export function relatedTemplatePages(id: TemplateId, count = 3): TemplateSeoPage[] {
  const position = templateSeoPages.findIndex((page) => page.id === id);
  const after = [...templateSeoPages.slice(position + 1), ...templateSeoPages.slice(0, Math.max(position, 0))];
  const main = templateById(id)?.categories[0];
  const same = after.filter((page) => main !== undefined && (templateById(page.id)?.categories.includes(main) ?? false));
  return [...same, ...after.filter((page) => !same.includes(page))].slice(0, count);
}
