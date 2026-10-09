//! Portuguese texts sent by the API (e-mails, the Stripe payment page). UI texts live in the web
//! app.

/// Subject of the login e-mail.
pub(crate) fn login_subject(code: &str) -> String {
    format!("Seu código de acesso: {code}")
}

/// Plain-text body of the login e-mail.
pub(crate) fn login_body(code: &str) -> String {
    format!(
        "Olá!\n\nSeu código para entrar no Ingresso Impresso é:\n\n    {code}\n\n\
         Ele vale por 10 minutos. Se você não pediu este código, ignore este e-mail.\n\n\
         — Ingresso Impresso"
    )
}

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
