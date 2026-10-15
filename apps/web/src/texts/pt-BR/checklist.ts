import type { Known, Overrides } from "@/lib/event-kind";

// What is missing before the event (ADR 0078).
export const checklist = {
  title: "O que falta",
  subtitle: "Tudo o que deixa o evento pronto para o dia, na ordem do trabalho.",
  progress: (done: number, total: number) => `${String(done)} de ${String(total)} prontos`,
  missing: (count: number) => (count === 1 ? "Falta 1" : `Faltam ${String(count)}`),
  completeTitle: "Tudo pronto para o evento",
  completeBody: "Os itens obrigatórios estão feitos. Os opcionais ficam na lista para quando quiser.",
  showList: "Ver a lista",
  hideList: "Recolher",
  showDone: (count: number) => (count === 1 ? "Mostrar o item pronto" : `Mostrar os ${String(count)} itens prontos`),
  hideDone: "Esconder os itens prontos",
  optional: "Opcional",
  otherPerson: "Outra pessoa da equipe cuida disso",
  organizationOnly: "Fica com a organização",
  done: "Pronto",
  items: {
    details: { title: "Local e endereço", body: "O ingresso no celular mostra o lugar e como chegar." },
    design: { title: "Ingresso desenhado", body: "Escolha um modelo ou envie a sua arte e ajuste os textos." },
    art: { title: "Arte liberada para imprimir", body: "As imagens do ingresso passam por uma revisão." },
    categories: { title: "Categorias", body: "Pista, VIP, meia: faixas de números com cor e preço." },
    batch: { title: "Lote pago", body: "Arquivos e ingressos no celular só saem de lotes pagos." },
    sellers: { title: "Vendedores com números", body: "Entregue faixas de números e acompanhe o acerto." },
    seller_links: { title: "Link de cada vendedor", body: "No link, o vendedor marca o que vendeu e vê o próprio acerto." },
    delivery: { title: "Ingressos entregues", body: "Gere os arquivos para imprimir ou mande ingressos no celular." },
    door_link: { title: "Link da portaria", body: "Os celulares da porta entram por ele no dia." },
    rehearsal: { title: "Ensaio da portaria", body: "Opcional: teste a leitura num celular antes de abrir a porta." },
    guests: { title: "Lista de nomes", body: "Convidados que entram sem ingresso." },
    public_verify: { title: "Conferência pública", body: "Quem compra de outra pessoa confere o ingresso antes." },
    organization_contact: { title: "Contato da organização", body: "WhatsApp ou e-mail no perfil, para quem comprou falar com vocês." },
  },
  hints: {
    no_venue: "Falta o local.",
    no_address: "Falta o endereço.",
    no_venue_nor_address: "Faltam o local e o endereço.",
    art_under_review: "Uma imagem está em revisão pela equipe do Ingresso Impresso.",
    art_rejected: "Uma imagem foi recusada: troque-a no editor.",
    no_devices: "Nenhum celular entrou pelo link ainda.",
  },
  sellerLinks: (done: number, total: number) => `${String(done)} de ${String(total)} vendedores com link`,
  // Consumption tokens (ADR 0086).
  tokens: {
    items: {
      details: { body: "A ficha no celular mostra o lugar e como chegar." },
      design: { title: "Ficha desenhada" },
      art: { body: "As imagens da ficha passam por uma revisão." },
      categories: { title: "Produtos", body: "Bebida, comida, doce: faixas de números com cor e preço." },
      batch: { body: "Arquivos e fichas no celular só saem de lotes pagos." },
      delivery: { title: "Fichas entregues", body: "Gere os arquivos para imprimir ou mande fichas no celular." },
      door_link: { title: "Link das barracas", body: "Os celulares das barracas entram por ele no dia." },
      rehearsal: { title: "Ensaio nas barracas", body: "Opcional: teste a leitura num celular antes de abrir as barracas." },
      public_verify: { body: "Quem compra de outra pessoa confere a ficha antes." },
    },
  },
} as const;

/** Fails to compile when a consumption-token text has no ticket text. */
type Checked<T extends Overrides<typeof checklist> & Known<T, typeof checklist>> = T;
export type ChecklistTokenTexts = Checked<typeof checklist.tokens>;
