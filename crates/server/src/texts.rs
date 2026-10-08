//! Portuguese texts sent by the API (e-mails). UI texts live in the web app.

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
