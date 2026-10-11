//! Portuguese texts sent by the API (the Stripe payment page, names of copies). E-mails live in
//! `emails.rs`; UI texts live in the web app.

/// Appended to the name of a duplicated event.
pub(crate) const COPY_SUFFIX: &str = " (cópia)";

/// Line item of a batch on the Stripe payment page.
pub(crate) fn checkout_description(event: &str, first: i32, last: i32) -> String {
    let quantity = last - first + 1;
    let tickets = if quantity == 1 {
        "ingresso"
    } else {
        "ingressos"
    };
    format!("{event}: lote de {quantity} {tickets} (nº {first} a {last})")
}

/// What a team member takes care of (ADR 0055), as the panel names it.
pub(crate) const fn team_area(area: crate::api::TeamArea) -> &'static str {
    use crate::api::TeamArea;
    match area {
        TeamArea::Manage => "Coordenação (tudo)",
        TeamArea::Money => "Recebimentos",
        TeamArea::Delivery => "Ingressos e vendedores",
        TeamArea::Art => "Arte do ingresso",
        TeamArea::Door => "Portaria",
    }
}

/// `Recebimentos, Arte do ingresso e Portaria`.
pub(crate) fn team_areas(areas: &[crate::api::TeamArea]) -> String {
    let names: Vec<&str> = areas.iter().map(|area| team_area(*area)).collect();
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
