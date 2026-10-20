//! Portuguese texts sent by the API (the Stripe payment page, names of copies). E-mails live in
//! `emails.rs`; UI texts live in the web app.

/// Appended to the name of a duplicated event.
pub(crate) const COPY_SUFFIX: &str = " (cópia)";

/// Line item of a batch on the Stripe payment page ("fichas" for consumption tokens, ADR 0086).
pub(crate) fn checkout_description(event: &str, first: i32, last: i32, tokens: bool) -> String {
    let quantity = last - first + 1;
    let tickets = match (tokens, quantity == 1) {
        (false, true) => "ingresso",
        (false, false) => "ingressos",
        (true, true) => "ficha",
        (true, false) => "fichas",
    };
    format!("{event}: lote de {quantity} {tickets} (nº {first} a {last})")
}

/// What a team member takes care of (ADR 0055), as the panel names it ("Arte da ficha" and
/// "Barracas" for consumption tokens, ADR 0086).
pub(crate) const fn team_area(area: crate::api::TeamArea, tokens: bool) -> &'static str {
    use crate::api::TeamArea;
    match (area, tokens) {
        (TeamArea::Manage, _) => "Coordenação (tudo)",
        (TeamArea::Money, _) => "Recebimentos",
        (TeamArea::Delivery, false) => "Ingressos e vendedores",
        (TeamArea::Delivery, true) => "Fichas e vendedores",
        (TeamArea::Art, false) => "Arte do ingresso",
        (TeamArea::Art, true) => "Arte da ficha",
        (TeamArea::Door, false) => "Portaria",
        (TeamArea::Door, true) => "Barracas",
    }
}

/// `Recebimentos, Arte do ingresso e Portaria`.
pub(crate) fn team_areas(areas: &[crate::api::TeamArea], tokens: bool) -> String {
    let names: Vec<&str> = areas.iter().map(|area| team_area(*area, tokens)).collect();
    match names.split_last() {
        None => String::new(),
        Some((last, [])) => (*last).to_owned(),
        Some((last, rest)) => format!("{} e {last}", rest.join(", ")),
    }
}

/// Table and seat printed on a ticket's band (ADR 0057): `Mesa 5 · Lugar 3`, cut to 40
/// characters.
pub(crate) fn seat_label(table: &str, seat: i16) -> String {
    let suffix = format!(" · Lugar {seat}");
    let room = 40usize.saturating_sub(suffix.chars().count());
    let table: String = table.trim().chars().take(room).collect();
    format!("{}{suffix}", table.trim_end())
}

/// Footer of the accountability files (ADR 0058); `{when}` is replaced.
pub(crate) const ACCOUNTABILITY_GENERATED: &str = "Gerado pelo Ingresso Impresso em {when}";

/// Labels of the accountability PDF and spreadsheet (ADR 0058).
pub(crate) struct AccountabilityTexts {
    pub kicker: &'static str,
    pub summary: &'static str,
    pub outstanding_note: &'static str,
    pub received: &'static str,
    pub other_income: &'static str,
    pub spent: &'static str,
    pub balance: &'static str,
    pub tickets: &'static str,
    pub issued: &'static str,
    pub sold: &'static str,
    pub courtesies: &'static str,
    pub entries: &'static str,
    pub by_category: &'static str,
    pub category_headers: [&'static str; 6],
    pub no_category: &'static str,
    pub by_seller: &'static str,
    pub seller_headers: [&'static str; 7],
    pub seller_sheet_headers: [&'static str; 9],
    pub total: &'static str,
    pub cash: &'static str,
    pub cash_note: &'static str,
    pub cash_headers: [&'static str; 4],
    pub received_line: &'static str,
    pub platform_line: &'static str,
    pub income: &'static str,
    pub expense: &'static str,
    pub item: &'static str,
    pub value: &'static str,
    pub ticket_sales: &'static str,
    pub outstanding: &'static str,
    pub commissions: &'static str,
    pub expenses: &'static str,
    pub ledger_sheet: &'static str,
    pub ledger_sheet_headers: [&'static str; 5],
    pub signatures: [&'static str; 2],
}

pub(crate) const ACCOUNTABILITY: AccountabilityTexts = AccountabilityTexts {
    kicker: "Prestação de contas",
    summary: "Resumo",
    outstanding_note: "Ainda falta receber {amount} dos vendedores.",
    received: "Recebido dos vendedores",
    other_income: "Outras receitas",
    spent: "Despesas",
    balance: "Saldo em caixa",
    tickets: "Ingressos",
    issued: "Emitidos",
    sold: "Vendidos",
    courtesies: "Cortesias",
    entries: "Entraram",
    by_category: "Por categoria",
    category_headers: [
        "Categoria",
        "Preço",
        "Emitidos",
        "Vendidos",
        "Entraram",
        "Valor",
    ],
    no_category: "Sem categoria",
    by_seller: "Vendedores",
    seller_headers: [
        "Vendedor",
        "Levou",
        "Devolveu",
        "Vendeu",
        "A acertar",
        "Recebido",
        "Falta",
    ],
    seller_sheet_headers: [
        "Vendedor",
        "Levou",
        "Devolveu",
        "Perdeu",
        "Vendeu",
        "Marcou vendidos",
        "A acertar",
        "Recebido",
        "Falta",
    ],
    total: "Total",
    cash: "Entradas e saídas",
    cash_note: "O dinheiro dos ingressos entra pelo que os vendedores já passaram.",
    cash_headers: ["Data", "Descrição", "Tipo", "Valor"],
    received_line: "Ingressos: recebido dos vendedores",
    platform_line: "Ingresso Impresso (lotes de ingressos)",
    income: "Receita",
    expense: "Despesa",
    item: "Item",
    value: "Valor",
    ticket_sales: "Valor dos ingressos dos vendedores",
    outstanding: "Falta receber dos vendedores",
    commissions: "Comissões dos vendedores",
    expenses: "Despesas lançadas",
    ledger_sheet: "Lançamentos",
    ledger_sheet_headers: ["Data", "Descrição", "Categoria", "Tipo", "Valor"],
    signatures: ["Responsável pelas contas", "Conferido por"],
};

/// The same labels for consumption tokens (ADRs 0084, 0086).
pub(crate) const ACCOUNTABILITY_TOKENS: AccountabilityTexts = AccountabilityTexts {
    tickets: "Fichas",
    issued: "Emitidas",
    sold: "Vendidas",
    entries: "Usadas",
    by_category: "Por produto",
    category_headers: [
        "Produto", "Preço", "Emitidas", "Vendidas", "Usadas", "Valor",
    ],
    no_category: "Sem produto",
    seller_sheet_headers: [
        "Vendedor",
        "Levou",
        "Devolveu",
        "Perdeu",
        "Vendeu",
        "Marcou vendidas",
        "A acertar",
        "Recebido",
        "Falta",
    ],
    cash_note: "O dinheiro das fichas entra pelo que os vendedores já passaram.",
    received_line: "Fichas: recebido dos vendedores",
    platform_line: "Ingresso Impresso (lotes de fichas)",
    ticket_sales: "Valor das fichas dos vendedores",
    ..ACCOUNTABILITY
};

/// The accountability labels of an event of tickets or of consumption tokens.
pub(crate) const fn accountability(tokens: bool) -> &'static AccountabilityTexts {
    if tokens {
        &ACCOUNTABILITY_TOKENS
    } else {
        &ACCOUNTABILITY
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::TeamArea;

    #[test]
    fn token_events_speak_of_fichas() {
        assert_eq!(
            checkout_description("Festa", 1, 50, false),
            "Festa: lote de 50 ingressos (nº 1 a 50)"
        );
        assert_eq!(
            checkout_description("Festa", 7, 7, true),
            "Festa: lote de 1 ficha (nº 7 a 7)"
        );
        assert_eq!(
            team_areas(&[TeamArea::Art, TeamArea::Door], true),
            "Arte da ficha e Barracas"
        );
        assert_eq!(team_areas(&[TeamArea::Door], false), "Portaria");
        assert_eq!(accountability(true).tickets, "Fichas");
        assert_eq!(accountability(false).tickets, "Ingressos");
        assert_eq!(accountability(true).summary, ACCOUNTABILITY.summary);
    }
}
