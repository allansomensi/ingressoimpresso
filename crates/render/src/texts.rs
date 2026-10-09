//! Every Portuguese text printed on generated files. Templates contain no UI strings: they read
//! these values from `/data.json`.

use serde::Serialize;

/// Texts available to the templates.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Texts {
    pub sample_watermark: &'static str,
    pub control_title: &'static str,
    pub seller: &'static str,
    pub no_seller: &'static str,
    pub tickets: &'static str,
    pub number: &'static str,
    pub buyer_name: &'static str,
    pub phone: &'static str,
    pub paid: &'static str,
    pub page: &'static str,
    pub continued: &'static str,
}

pub(crate) const PT_BR: Texts = Texts {
    sample_watermark: "AMOSTRA",
    control_title: "Folha de controle",
    seller: "Vendedor",
    no_seller: "Sem vendedor",
    tickets: "ingressos",
    number: "Nº",
    buyer_name: "Nome do comprador",
    phone: "Telefone",
    paid: "Pago",
    page: "Página",
    continued: "(continuação)",
};

/// Month names for text fields (`fields.rs`), January first.
pub(crate) const MONTHS: [&str; 12] = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
];

/// Weekday names for text fields, Monday first.
pub(crate) const WEEKDAYS: [&str; 7] = [
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
];

/// The `{preco}` field of a free event.
pub(crate) const FREE_PRICE: &str = "Gratuito";
