//! E-mails sent by the API (ADR 0028), in Portuguese: a plain-text body and an HTML body built on
//! one table-based layout that survives Gmail, Outlook and Apple Mail, light and dark.
//!
//! Every value that comes from a user (an event name) goes through [`escape`]. The layout loads
//! no remote font or script; the only image is the app icon, with alt text, so the message reads
//! the same with images blocked.

use std::fmt::Write as _;

/// A message ready to send.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Email {
    /// Subject line.
    pub subject: String,
    /// Plain-text alternative (also what tests read).
    pub text: String,
    /// HTML body.
    pub html: String,
}

const BRAND: &str = "#5b3df5";
const INK: &str = "#0e0d14";
const MUTED: &str = "#5b5a6b";
const PAGE: &str = "#f4f3f8";
const BORDER: &str = "#e4e4ea";

/// HTML-escapes text for element content and double-quoted attributes.
pub fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            other => out.push(other),
        }
    }
    out
}

/// The shared frame: preheader (inbox preview), header with the brand, white card, footer.
fn layout(site: &str, preheader: &str, content: &str, footer_note: &str) -> String {
    let site = escape(site);
    format!(
        r#"<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Ingresso Impresso</title>
<style>
  @media (prefers-color-scheme: dark) {{
    .page {{ background: #0a0910 !important; }}
    .card {{ background: #12111a !important; border-color: #262433 !important; }}
    .ink {{ color: #f3f2f9 !important; }}
    .muted {{ color: #a7a5b9 !important; }}
    .code {{ background: #1e1940 !important; color: #ffffff !important; border-color: #363446 !important; }}
    .rule {{ border-color: #262433 !important; }}
  }}
  @media (max-width: 600px) {{
    .card-cell {{ padding: 28px 22px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:{PAGE};" class="page">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{preheader}&#8202;&#847;&#8202;&#847;&#8202;&#847;&#8202;&#847;&#8202;&#847;&#8202;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{PAGE};" class="page">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 20px 4px;">
            <a href="{site}" style="text-decoration:none;">
              <img src="{site}/icons/icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;border-radius:9px;">
              <span class="ink" style="vertical-align:middle;margin-left:10px;font:600 17px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{INK};letter-spacing:-0.2px;">Ingresso Impresso</span>
            </a>
          </td>
        </tr>
        <tr>
          <td class="card" style="background:#ffffff;border:1px solid {BORDER};border-radius:18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="card-cell" style="padding:36px 36px 32px 36px;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{INK};">
{content}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="muted" style="padding:22px 8px 0 8px;font:13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{MUTED};text-align:center;">
            {footer_note}<br>
            <a href="{site}" style="color:{MUTED};text-decoration:underline;">Ingresso Impresso</a> · ingressos numerados com QR à prova de cópia
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"#,
        preheader = escape(preheader),
    )
}

fn heading(text: &str) -> String {
    format!(
        r#"<h1 class="ink" style="margin:0 0 12px 0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.4px;color:{INK};">{}</h1>"#,
        escape(text)
    )
}

fn paragraph(html: &str) -> String {
    format!(r#"<p class="muted" style="margin:0 0 16px 0;color:{MUTED};">{html}</p>"#)
}

fn button(href: &str, label: &str) -> String {
    format!(
        r#"<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr><td style="border-radius:12px;background:{BRAND};"><a href="{}" style="display:inline-block;padding:14px 26px;font-weight:600;font-size:16px;color:#ffffff;text-decoration:none;border-radius:12px;">{}</a></td></tr></table>"#,
        escape(href),
        escape(label)
    )
}

/// The login code (ADR 0012), valid for `minutes`.
pub fn login_code(code: &str, minutes: i64, site: &str) -> Email {
    let subject = format!("Seu código de acesso: {code}");
    let text = format!(
        "Olá!\n\nSeu código para entrar no Ingresso Impresso é:\n\n    {code}\n\n\
         Ele vale por {minutes} minutos e só funciona uma vez.\n\n\
         Não pediu este código? Ignore este e-mail: ninguém entra na sua conta sem ele.\n\n\
         Ingresso Impresso\n{site}\n"
    );
    let mut content = heading("Seu código de acesso");
    content.push_str(&paragraph(
        "Digite este código na tela de entrada do Ingresso Impresso:",
    ));
    let _ = write!(
        content,
        r#"<div class="code" style="margin:8px 0 20px 0;padding:18px 12px;border:1px solid {BORDER};border-radius:14px;background:#f2efff;text-align:center;font:700 34px/1.2 'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;letter-spacing:10px;color:{INK};">{}</div>"#,
        escape(code)
    );
    content.push_str(&paragraph(&format!(
        "Ele vale por <strong>{minutes} minutos</strong> e só funciona uma vez."
    )));
    let _ = write!(
        content,
        r#"<hr class="rule" style="border:0;border-top:1px solid {BORDER};margin:24px 0 16px 0;"><p class="muted" style="margin:0;font-size:14px;color:{MUTED};">Não pediu este código? Ignore este e-mail: ninguém entra na sua conta sem ele.</p>"#
    );
    let html = layout(
        site,
        &format!("Use o código {code} para entrar. Ele vale por {minutes} minutos."),
        &content,
        "Você recebeu este e-mail porque este endereço foi usado para entrar no Ingresso Impresso.",
    );
    Email {
        subject,
        text,
        html,
    }
}

/// What a paid-batch e-mail tells.
#[derive(Debug, Clone)]
pub struct BatchPaid<'a> {
    /// Event name (user text).
    pub event_name: &'a str,
    /// First ticket number.
    pub first: i32,
    /// Last ticket number.
    pub last: i32,
    /// Amount paid, formatted (`R$ 12,90`).
    pub amount: &'a str,
    /// Where to generate the files.
    pub files_url: &'a str,
}

/// A batch paid online (Stripe): the files can be generated.
pub fn batch_paid(paid: &BatchPaid<'_>, site: &str) -> Email {
    let quantity = paid.last - paid.first + 1;
    let tickets = if quantity == 1 {
        "1 ingresso".to_owned()
    } else {
        format!("{} ingressos", thousands(quantity))
    };
    let subject = format!("Pagamento confirmado: {}", paid.event_name);
    let text = format!(
        "Pagamento confirmado!\n\n\
         Evento: {event}\nIngressos: {tickets} (nº {first} a {last})\nValor: {amount}\n\n\
         Os ingressos já estão liberados. Gere os arquivos para imprimir ou enviar:\n{url}\n\n\
         Ingresso Impresso\n{site}\n",
        event = paid.event_name,
        first = paid.first,
        last = paid.last,
        amount = paid.amount,
        url = paid.files_url,
    );
    let mut content = heading("Pagamento confirmado");
    content.push_str(&paragraph(&format!(
        "Os ingressos de <strong class=\"ink\" style=\"color:{INK};\">{}</strong> estão liberados. Agora é só gerar os arquivos para imprimir ou enviar pelo WhatsApp.",
        escape(paid.event_name)
    )));
    let row = |label: &str, value: &str| {
        format!(
            r#"<tr><td class="muted rule" style="padding:10px 0;border-top:1px solid {BORDER};color:{MUTED};font-size:14px;">{}</td><td class="ink rule" align="right" style="padding:10px 0;border-top:1px solid {BORDER};color:{INK};font-size:14px;font-weight:600;">{}</td></tr>"#,
            escape(label),
            escape(value)
        )
    };
    let _ = write!(
        content,
        r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;">{}{}{}</table>"#,
        row("Ingressos", &tickets),
        row(
            "Numeração",
            &format!("{} a {}", thousands(paid.first), thousands(paid.last))
        ),
        row("Valor pago", paid.amount),
    );
    content.push_str(&button(paid.files_url, "Gerar os arquivos"));
    let _ = write!(
        content,
        r#"<p class="muted" style="margin:0;font-size:14px;color:{MUTED};">O recibo do pagamento é enviado pela Stripe, que processou o Pix ou o cartão.</p>"#
    );
    let html = layout(
        site,
        &format!("{tickets} liberados para {}.", paid.event_name),
        &content,
        "Você recebeu este e-mail porque pagou um lote de ingressos no Ingresso Impresso.",
    );
    Email {
        subject,
        text,
        html,
    }
}

/// `1.234` (Brazilian thousands separator).
/// A test sent by an admin from the e-mail panel (ADR 0041).
pub fn test_message(admin: &str, site: &str) -> Email {
    let subject = "Teste de envio do Ingresso Impresso".to_owned();
    let text = format!(
        "Este é um e-mail de teste pedido por {admin} no painel de administração.\n\n\
         Se você recebeu, o envio de e-mails está funcionando.\n\n{site}"
    );
    let content = format!(
        "{}{}{}",
        heading("Envio de e-mails funcionando"),
        paragraph(&format!(
            "Este é um e-mail de teste pedido por <strong>{}</strong> no painel de administração.",
            escape(admin)
        )),
        paragraph("Se você recebeu, os códigos de acesso e os avisos de pagamento estão chegando."),
    );
    Email {
        html: layout(
            site,
            "Teste de envio",
            &content,
            "Enviado a pedido de um administrador.",
        ),
        subject,
        text,
    }
}

fn thousands(value: i32) -> String {
    let digits = value.unsigned_abs().to_string();
    let mut out = String::new();
    for (index, c) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            out.push('.');
        }
        out.push(c);
    }
    if value < 0 { format!("-{out}") } else { out }
}

/// `R$ 1.234,50` from centavos.
pub fn money(cents: i32) -> String {
    let reais = cents / 100;
    let centavos = (cents % 100).unsigned_abs();
    format!("R$ {},{centavos:02}", thousands(reais))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_user_text() {
        assert_eq!(
            escape(r#"<script>"Rock" & 'Roll'</script>"#),
            "&lt;script&gt;&quot;Rock&quot; &amp; &#39;Roll&#39;&lt;/script&gt;"
        );
    }

    #[test]
    fn login_code_has_the_code_everywhere() {
        let email = login_code("042137", 10, "https://exemplo.com.br");
        assert_eq!(email.subject, "Seu código de acesso: 042137");
        assert!(email.text.contains("042137"));
        assert!(email.html.contains(">042137</div>"));
        assert!(
            email
                .html
                .contains("https://exemplo.com.br/icons/icon-192.png")
        );
    }

    #[test]
    fn batch_paid_escapes_the_event_name() {
        let email = batch_paid(
            &BatchPaid {
                event_name: "<b>Show</b>",
                first: 1,
                last: 1500,
                amount: &money(12_990),
                files_url: "https://exemplo.com.br/painel/eventos/x?aba=arquivos&y=1",
            },
            "https://exemplo.com.br",
        );
        assert!(!email.html.contains("<b>Show</b>"));
        assert!(email.html.contains("&lt;b&gt;Show&lt;/b&gt;"));
        assert!(email.html.contains("aba=arquivos&amp;y=1"));
        assert!(email.text.contains("1.500 ingressos (nº 1 a 1500)"));
        assert!(email.text.contains("R$ 129,90"));
    }

    #[test]
    fn formats_numbers() {
        assert_eq!(thousands(0), "0");
        assert_eq!(thousands(999), "999");
        assert_eq!(thousands(1000), "1.000");
        assert_eq!(thousands(1_234_567), "1.234.567");
        assert_eq!(money(5), "R$ 0,05");
        assert_eq!(money(290), "R$ 2,90");
        assert_eq!(money(123_456), "R$ 1.234,56");
    }
}
