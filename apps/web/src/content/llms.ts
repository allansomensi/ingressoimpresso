// /llms.txt (llmstxt.org): what the product is, in plain words, and where each answer lives, for
// assistants that read the site to answer people (ADR 0081). Generated from the same content as
// the pages; served by src/app/llms.txt/route.ts.

import { eventSeoPages } from "@/content/seo-event-pages";
import { seoGuides } from "@/content/seo-guides";
import { templateSeoPages } from "@/content/seo-templates";
import { SITE_URL } from "@/lib/site";
import { meta as metaTexts } from "@/texts/pt-BR/meta";

export const LLMS_SUMMARY = [
  "O Ingresso Impresso é um serviço brasileiro, em português, para quem organiza evento e vende ingresso na mão: bandas independentes, escolas, igrejas, comissões de formatura, clubes e pequenos produtores.",
  "O organizador monta o ingresso a partir de um modelo ou da própria arte, gera ingressos numerados com um QR code assinado digitalmente (Ed25519), imprime em casa (PDF A4 com marcas de corte) ou na gráfica (PDF com sangria) e manda ingressos digitais pelo WhatsApp. Na entrada, qualquer celular confere os ingressos pelo navegador, mesmo sem internet: a cópia de um ingresso verdadeiro entra uma vez só.",
  "Cada vendedor recebe uma faixa de números e um link próprio; o painel calcula o acerto de cada um. Há categorias com preço, mesas e lugares, lista de nomes, contagem ao vivo na portaria e prestação de contas em PDF e planilha.",
  "Preço: os primeiros 30 ingressos de cada conta são grátis; depois, pagamento por lote, de R$ 0,15 a R$ 0,05 por ingresso conforme a quantidade, com Pix ou cartão. Não há mensalidade nem porcentagem sobre a venda: o dinheiro dos ingressos vai direto para o organizador, e a plataforma não vende ingressos ao público.",
  "Não faz: venda on-line com checkout para o público, sorteio de rifas (só imprime e controla os números) nem cartelas de bingo.",
] as const;

export const LLMS_SECTIONS = {
  product: "Produto",
  events: "Ingresso por tipo de evento",
  guides: "Guias",
  templates: "Modelos de ingresso",
  company: "Institucional",
} as const;

/** Fixed pages listed in /llms.txt, with what each one answers. */
export const LLMS_PAGES = {
  product: [
    { path: "/", name: "Página inicial", about: "Como funciona, recursos, exemplos de uso e perguntas frequentes." },
    { path: "/precos", name: "Preços", about: "Tabela de preços por lote, simulador e dúvidas sobre pagamento." },
    { path: "/ingresso-para", name: "Tipos de evento", about: "Uma página para cada tipo de evento, com passo a passo e perguntas." },
    { path: "/modelos", name: "Modelos de ingresso", about: "Galeria dos 16 modelos prontos para imprimir." },
    { path: "/guias", name: "Guias", about: "Artigos práticos para quem organiza evento e vende ingresso." },
    { path: "/conferir", name: "Conferir ingresso", about: "Verificar se o QR code de um ingresso é verdadeiro antes de comprar, sem cadastro." },
    { path: "/entrar", name: "Criar conta", about: "Cadastro grátis, sem senha, com Google ou código por e-mail." },
  ],
  company: [
    { path: "/sobre", name: "Sobre", about: "Quem faz e os princípios do produto." },
    { path: "/suporte", name: "Suporte", about: "Respostas rápidas e contato por e-mail." },
    { path: "/novidades", name: "Novidades", about: "O que mudou no produto, versão por versão." },
    { path: "/status", name: "Status do sistema", about: "Situação atual do site, da portaria e dos pagamentos." },
    { path: "/termos", name: "Termos de Uso", about: "Regras de uso do serviço." },
    { path: "/privacidade", name: "Política de Privacidade", about: "Tratamento de dados pessoais (LGPD)." },
    { path: "/reembolso", name: "Política de Reembolso", about: "7 dias para pedir o reembolso de um lote." },
  ],
} as const;

function link(path: string, name: string, about: string): string {
  return `- [${name}](${SITE_URL}${path === "/" ? "" : path}): ${about}`;
}

/** The text of /llms.txt: a summary and the pages that answer each question. */
export function llmsText(): string {
  return [
    `# ${metaTexts.title}`,
    "",
    `> ${metaTexts.description}`,
    "",
    ...LLMS_SUMMARY.flatMap((paragraph) => [paragraph, ""]),
    `## ${LLMS_SECTIONS.product}`,
    "",
    ...LLMS_PAGES.product.map((page) => link(page.path, page.name, page.about)),
    "",
    `## ${LLMS_SECTIONS.events}`,
    "",
    ...eventSeoPages.map((page) => link(`/ingresso-para/${page.slug}`, page.h1, page.description)),
    "",
    `## ${LLMS_SECTIONS.guides}`,
    "",
    ...seoGuides.map((guide) => link(`/guias/${guide.slug}`, guide.h1, guide.description)),
    "",
    `## ${LLMS_SECTIONS.templates}`,
    "",
    ...templateSeoPages.map((page) => link(`/modelos/${page.slug}`, page.h1, page.description)),
    "",
    `## ${LLMS_SECTIONS.company}`,
    "",
    ...LLMS_PAGES.company.map((page) => link(page.path, page.name, page.about)),
    "",
  ].join("\n");
}
