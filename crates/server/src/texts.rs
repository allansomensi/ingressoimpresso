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
